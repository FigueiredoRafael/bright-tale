/**
 * F2-016 — Brainstorm sessions.
 * Creates a brainstorm_sessions row, runs the brainstorm agent, and persists
 * the resulting ideas to idea_archives scoped to the channel + session.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { STAGE_COSTS, generateWithFallback } from '../lib/ai/router.js';
import { loadAgentPrompt } from '../lib/ai/promptLoader.js';
import { buildChannelContext } from '../lib/ai/channelContext.js';
import { checkCredits, debitCredits } from '../lib/credits.js';
import { inngest } from '../jobs/client.js';
import { emitJobEvent } from '../jobs/emitter.js';

interface RawIdea {
  idea_id?: string;
  title?: string;
  angle?: string;
  core_tension?: string;
  target_audience?: string;
  search_intent?: string;
  primary_keyword?: { term?: string; difficulty?: string; monthly_volume_estimate?: string };
  scroll_stopper?: string;
  curiosity_gap?: string;
  monetization?: string | { affiliate_angle?: string; product_fit?: string; sponsor_appeal?: string };
  repurpose_potential?: { blog_angle?: string; video_angle?: string; shorts_hooks?: string[]; podcast_angle?: string };
  repurposing?: string[];
  risk_flags?: string[];
  verdict?: string;
  verdict_rationale?: string;
}

function normalizeIdeas(raw: unknown): RawIdea[] {
  function looksLikeIdea(item: unknown): boolean {
    if (!item || typeof item !== 'object') return false;
    const o = item as Record<string, unknown>;
    return typeof o.title === 'string' || typeof o.idea_id === 'string' || typeof o.angle === 'string';
  }
  function find(node: unknown, depth = 0): RawIdea[] | null {
    if (depth > 6) return null;
    if (Array.isArray(node)) {
      if (node.length > 0 && node.some(looksLikeIdea)) return node as RawIdea[];
      return null;
    }
    if (node && typeof node === 'object') {
      for (const v of Object.values(node as Record<string, unknown>)) {
        const found = find(v, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }
  return find(raw) ?? [];
}

const brainstormBodySchema = z.object({
  channelId: z.string().uuid().optional(),
  projectId: z.string().optional(),
  inputMode: z.enum(['blind', 'fine_tuned', 'reference_guided']),
  topic: z.string().min(2).optional(),
  fineTuning: z
    .object({
      niche: z.string().optional(),
      tone: z.string().optional(),
      audience: z.string().optional(),
      goal: z.string().optional(),
      constraints: z.string().optional(),
    })
    .optional(),
  referenceUrl: z.string().url().optional(),
  modelTier: z.string().default('standard'),
  provider: z.enum(['gemini', 'openai', 'anthropic', 'ollama']).optional(),
  model: z.string().optional(),
  // Advanced settings
  temporalMix: z
    .object({
      evergreen: z.number().min(0).max(100),
      seasonal: z.number().min(0).max(100),
      trending: z.number().min(0).max(100),
    })
    .refine((v) => v.evergreen + v.seasonal + v.trending === 100, {
      message: 'Temporal mix must sum to 100',
    })
    .optional(),
  constraints: z
    .object({
      avoidTopics: z.array(z.string()).default([]),
      requiredFormats: z.array(z.string()).default([]),
    })
    .optional(),
  ideasRequested: z.number().int().min(1).max(10).default(5),
  performanceContext: z
    .object({
      recentWinners: z.array(z.string()).default([]),
      recentLosers: z.array(z.string()).default([]),
    })
    .optional(),
  contentGoal: z.enum(['growth', 'engagement', 'monetization', 'authority']).optional(),
});

async function getOrgId(userId: string): Promise<string> {
  const sb = createServiceClient();
  const { data } = await sb
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!data) throw new ApiError(404, 'No organization found', 'NOT_FOUND');
  return data.org_id;
}

export async function brainstormRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /sessions/running — Check if the user has a brainstorm session currently
   * in progress. Returns the most recent running session so the frontend can
   * reconnect to its SSE stream after a page reload.
   */
  fastify.get('/sessions/running', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const sb = createServiceClient();
      const { channelId } = request.query as { channelId?: string };

      // Only return sessions created in the last 20 minutes — older ones are stale
      const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      let query = sb
        .from('brainstorm_sessions')
        .select('id, status, input_json, created_at')
        .eq('user_id', request.userId)
        .eq('status', 'running')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1);

      if (channelId) {
        query = query.eq('channel_id', channelId);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw error;

      return reply.send({ data: { session: data ?? null }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /sessions/:id/cancel — Cancel a running brainstorm session.
   */
  fastify.post('/sessions/:id/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const { id } = request.params as { id: string };
      const sb = createServiceClient();

      const { data: session } = await sb
        .from('brainstorm_sessions')
        .select('id, status, user_id')
        .eq('id', id)
        .maybeSingle();

      if (!session) throw new ApiError(404, 'Session not found', 'NOT_FOUND');
      if (session.user_id !== request.userId) throw new ApiError(403, 'Forbidden', 'FORBIDDEN');
      if (session.status !== 'running') {
        return reply.send({ data: { status: session.status }, error: null });
      }

      await (sb.from('brainstorm_sessions') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
      })
        .update({ status: 'failed', error_message: 'Cancelled by user' })
        .eq('id', id);

      await emitJobEvent(id, 'brainstorm', 'failed', 'Cancelled by user');

      // Cancel the Inngest function run if possible
      try {
        await inngest.send({ name: 'inngest/function.cancelled', data: { function_id: 'brainstorm-generate', run_id: id } });
      } catch {
        // Best-effort — Inngest may not support this or the run may already be done
      }

      return reply.send({ data: { status: 'cancelled' }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /sessions — Run a brainstorm and persist ideas.
   */
  fastify.post('/sessions', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');

      const body = brainstormBodySchema.parse(request.body);
      const orgId = await getOrgId(request.userId);
      const sb = createServiceClient();

      // Local Ollama runs cost us nothing → no internal credit charge.
      const cost = body.provider === 'ollama' ? 0 : STAGE_COSTS.brainstorm;
      if (cost > 0) await checkCredits(orgId, request.userId, cost);

      const inputJson: Record<string, unknown> = {
        topic: body.topic ?? null,
        fineTuning: body.fineTuning ?? null,
        referenceUrl: body.referenceUrl ?? null,
        temporalMix: body.temporalMix ?? null,
        constraints: body.constraints ?? null,
        ideasRequested: body.ideasRequested,
        performanceContext: body.performanceContext ?? null,
        contentGoal: body.contentGoal ?? null,
      };

      const { data: session, error: insertErr } = await (
        sb.from('brainstorm_sessions') as unknown as {
          insert: (row: Record<string, unknown>) => {
            select: () => { single: () => Promise<{ data: { id: string } | null; error: unknown }> };
          };
        }
      )
        .insert({
          org_id: orgId,
          user_id: request.userId,
          channel_id: body.channelId ?? null,
          project_id: body.projectId ?? null,
          input_mode: body.inputMode,
          input_json: inputJson,
          model_tier: body.modelTier,
          status: 'running',
        })
        .select()
        .single();

      if (insertErr || !session) throw insertErr ?? new ApiError(500, 'Failed to create session', 'DB_ERROR');

      // Seed a "queued" event so the SSE stream has something to show immediately.
      await emitJobEvent(session.id, 'brainstorm', 'queued', 'Iniciando…');

      // Fire-and-forget: Inngest runs the job in the background.
      await inngest.send({
        name: 'brainstorm/generate',
        data: {
          sessionId: session.id,
          orgId,
          userId: request.userId,
          channelId: body.channelId ?? null,
          inputMode: body.inputMode,
          inputJson,
          modelTier: body.modelTier,
          provider: body.provider,
          model: body.model,
          targetCount: body.ideasRequested,
        },
      });

      return reply.status(202).send({
        data: { sessionId: session.id, status: 'queued' },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /sessions/:id/events — SSE stream of progress events for a job.
   * Polls job_events every 1s and pushes new rows to the client.
   * Closes when a `completed` or `failed` event is emitted.
   */
  fastify.get('/sessions/:id/events', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const sb = createServiceClient();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sinceParam = (request.query as { since?: string })?.since;
    let lastCreatedAt = sinceParam ?? '1970-01-01T00:00:00Z';
    let closed = false;
    request.raw.on('close', () => {
      closed = true;
    });

    const poll = async (): Promise<void> => {
      while (!closed) {
        const { data: events } = await (sb
          .from('job_events')
          .select('*')
          .eq('session_id', id)
          .gt('created_at', lastCreatedAt)
          .order('created_at', { ascending: true })) as unknown as {
          data: Array<{ id: string; stage: string; message: string; metadata: unknown; created_at: string }> | null;
        };

        if (events && events.length > 0) {
          for (const ev of events) {
            reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
            lastCreatedAt = ev.created_at;
            if (ev.stage === 'completed' || ev.stage === 'failed') {
              reply.raw.end();
              return;
            }
          }
        } else {
          // Heartbeat so proxies don't time out the connection.
          reply.raw.write(': ping\n\n');
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    };

    // Kick off polling; do not await in handler scope (stream continues until done).
    void poll().catch((err) => {
      fastify.log.error({ err }, 'SSE poll failed');
      reply.raw.end();
    });

    // Tell Fastify we've handled the response manually.
    return reply;
  });

  /**
   * GET /sessions/:id — Retrieve a session and its ideas.
   */
  fastify.get('/sessions/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: session, error } = await sb
        .from('brainstorm_sessions')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!session) throw new ApiError(404, 'Session not found', 'NOT_FOUND');

      const { data: ideas } = await sb
        .from('idea_archives')
        .select('*')
        .eq('brainstorm_session_id', id)
        .order('created_at', { ascending: true });

      return reply.send({ data: { session, ideas: ideas ?? [] }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /sessions/:id/regenerate — Re-run brainstorm with same inputs.
   * Creates a new session linked to the same project.
   */
  fastify.post('/sessions/:id/regenerate', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: original, error: fetchErr } = await sb
        .from('brainstorm_sessions')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!original) throw new ApiError(404, 'Session not found', 'NOT_FOUND');

      const orig = original as Record<string, unknown>;
      const orgId = await getOrgId(request.userId);
      await checkCredits(orgId, request.userId, STAGE_COSTS.brainstorm);

      const inputJson = orig.input_json as Record<string, unknown>;

      // Create new session with same inputs
      const { data: session, error: insertErr } = await (
        sb.from('brainstorm_sessions') as unknown as {
          insert: (row: Record<string, unknown>) => {
            select: () => { single: () => Promise<{ data: { id: string } | null; error: unknown }> };
          };
        }
      )
        .insert({
          org_id: orgId,
          user_id: request.userId,
          channel_id: orig.channel_id ?? null,
          project_id: orig.project_id ?? null,
          input_mode: orig.input_mode,
          input_json: inputJson,
          model_tier: orig.model_tier,
          status: 'running',
        })
        .select()
        .single();

      if (insertErr || !session) throw insertErr ?? new ApiError(500, 'Failed to create session', 'DB_ERROR');

      try {
        const systemPrompt = (await loadAgentPrompt('brainstorm')) ?? undefined;

        const { result } = await generateWithFallback(
          'brainstorm',
          (orig.model_tier as string) ?? 'standard',
          { agentType: 'brainstorm', input: inputJson, schema: null, systemPrompt },
          {
            logContext: {
              userId: request.userId!,
              orgId,
              channelId: (orig.channel_id as string | null) ?? undefined,
              sessionId: session.id,
              sessionType: 'brainstorm',
            },
          },
        );

        const ideas = normalizeIdeas(result);

        // Extract recommendation from AI output
        let recommendation: { pick?: string; rationale?: string } | null = null;
        if (result && typeof result === 'object' && 'recommendation' in (result as Record<string, unknown>)) {
          recommendation = (result as Record<string, unknown>).recommendation as { pick?: string; rationale?: string } | null;
        }

        const { count } = await sb.from('idea_archives').select('*', { count: 'exact', head: true });
        const startNum = (count ?? 0) + 1;

        const ideaRows = ideas.map((idea: RawIdea, i: number) => ({
          idea_id: `BC-IDEA-${String(startNum + i).padStart(3, '0')}`,
          title: idea.title ?? `Untitled ${i + 1}`,
          core_tension: idea.core_tension ?? '',
          target_audience: idea.target_audience ?? '',
          verdict: idea.verdict === 'viable' || idea.verdict === 'weak' || idea.verdict === 'experimental' ? idea.verdict : 'experimental',
          discovery_data: JSON.stringify({
            angle: idea.angle,
            search_intent: idea.search_intent,
            primary_keyword: idea.primary_keyword,
            scroll_stopper: idea.scroll_stopper,
            curiosity_gap: idea.curiosity_gap,
            monetization: idea.monetization,
            repurpose_potential: idea.repurpose_potential,
            repurposing: idea.repurposing,
            risk_flags: idea.risk_flags,
            verdict_rationale: idea.verdict_rationale,
          }),
          source_type: 'brainstorm',
          channel_id: orig.channel_id ?? null,
          project_id: orig.project_id ?? null,
          brainstorm_session_id: session.id,
          user_id: request.userId,
          org_id: orgId,
        }));

        if (ideaRows.length > 0) {
          await (sb.from('idea_archives') as unknown as {
            upsert: (rows: Record<string, unknown>[], opts?: unknown) => Promise<{ error: unknown }>;
          }).upsert(ideaRows, { onConflict: 'idea_id', ignoreDuplicates: true });
        }

        await (sb.from('brainstorm_sessions') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        }).update({ status: 'completed', ...(recommendation ? { recommendation_json: recommendation } : {}) }).eq('id', session.id);

        await debitCredits(orgId, request.userId, 'brainstorm', 'text', STAGE_COSTS.brainstorm, { regeneratedFrom: id });

        return reply.send({ data: { sessionId: session.id, ideas: ideaRows }, error: null });
      } catch (err) {
        await (sb.from('brainstorm_sessions') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        }).update({ status: 'failed', error_message: (err as Error)?.message?.slice(0, 500) }).eq('id', session.id);
        throw err;
      }
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /sessions/:id/drafts — F2-037. List staged ideas for a session
   * (not yet persisted to idea_archives).
   */
  fastify.get('/sessions/:id/drafts', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const { data, error } = await sb
        .from('brainstorm_drafts')
        .select('*')
        .eq('session_id', id)
        .order('position', { ascending: true });
      if (error) throw error;
      return reply.send({ data: { drafts: data ?? [] }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /sessions/:id/drafts/save — F2-037. Move selected drafts into
   * idea_archives (the permanent library). Body: { draftIds: string[] }.
   * Removes the selected drafts from the staging table. Unselected ones
   * stay until the 24h expiry.
   */
  fastify.post('/sessions/:id/drafts/save', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const { id: sessionId } = request.params as { id: string };
      const body = z.object({ draftIds: z.array(z.string().uuid()).min(1) }).parse(request.body);
      const sb = createServiceClient();

      // Pull the selected drafts.
      const { data: drafts, error: draftsErr } = await sb
        .from('brainstorm_drafts')
        .select('*')
        .eq('session_id', sessionId)
        .in('id', body.draftIds);
      if (draftsErr) throw draftsErr;
      if (!drafts || drafts.length === 0) {
        throw new ApiError(404, 'No matching drafts', 'NOT_FOUND');
      }

      // Generate sequential idea_ids (BC-IDEA-NNN).
      const { count } = await sb.from('idea_archives').select('*', { count: 'exact', head: true });
      const startNum = (count ?? 0) + 1;

      const rows = drafts.map((d: Record<string, unknown>, i: number) => ({
        idea_id: `BC-IDEA-${String(startNum + i).padStart(3, '0')}`,
        title: d.title,
        core_tension: d.core_tension ?? '',
        target_audience: d.target_audience ?? '',
        verdict: d.verdict ?? 'experimental',
        discovery_data: d.discovery_data ?? '',
        source_type: 'brainstorm',
        channel_id: d.channel_id,
        brainstorm_session_id: d.session_id,
        user_id: d.user_id,
        org_id: d.org_id,
      }));

      const { error: insErr } = await (sb.from('idea_archives') as unknown as {
        upsert: (rows: Record<string, unknown>[], opts?: unknown) => Promise<{ error: unknown }>;
      }).upsert(rows, { onConflict: 'idea_id', ignoreDuplicates: true });
      if (insErr) throw insErr;

      // Delete the drafts that were saved.
      await sb.from('brainstorm_drafts').delete().in('id', body.draftIds);

      return reply.send({ data: { saved: rows.length }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /sessions/:id/drafts — F2-037. Discard ALL staged drafts for a
   * session without saving.
   */
  fastify.delete('/sessions/:id/drafts', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const { id: sessionId } = request.params as { id: string };
      const sb = createServiceClient();
      const { error } = await sb.from('brainstorm_drafts').delete().eq('session_id', sessionId);
      if (error) throw error;
      return reply.send({ data: { discarded: true }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
