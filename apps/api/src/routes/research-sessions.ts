/**
 * F2-018/F2-019 — Research sessions.
 * Levels (surface/medium/deep) drive credits + prompt depth. Cards persist for
 * human review before advancing to Production.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { generateWithFallback } from '../lib/ai/router.js';
import { loadAgentPrompt } from '../lib/ai/promptLoader.js';
import { checkCredits, debitCredits } from '../lib/credits.js';
import { inngest } from '../jobs/client.js';
import { emitJobEvent } from '../jobs/emitter.js';
import { fetchTrends } from '../lib/signals/trends.js';

function normalizeCards(raw: unknown): Array<Record<string, unknown>> {
  function looksLikeCard(item: unknown): boolean {
    if (!item || typeof item !== 'object') return false;
    const o = item as Record<string, unknown>;
    return (
      typeof o.title === 'string' ||
      typeof o.quote === 'string' ||
      typeof o.claim === 'string' ||
      typeof o.url === 'string' ||
      typeof o.source === 'string' ||
      typeof o.author === 'string'
    );
  }
  function find(node: unknown, depth = 0): Array<Record<string, unknown>> | null {
    if (depth > 6) return null;
    if (Array.isArray(node)) {
      if (node.length > 0 && node.some(looksLikeCard)) return node as Array<Record<string, unknown>>;
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

const LEVEL_COSTS: Record<'surface' | 'medium' | 'deep', number> = {
  surface: 60,
  medium: 100,
  deep: 180,
};

const createSchema = z.object({
  channelId: z.string().uuid().optional(),
  projectId: z.string().optional(),
  ideaId: z.string().optional(),
  topic: z.string().min(2).optional(),
  level: z.enum(['surface', 'medium', 'deep']),
  focusTags: z.array(z.string()).default([]),
  modelTier: z.string().default('standard'),
  provider: z.enum(['gemini', 'openai', 'anthropic', 'ollama']).optional(),
  model: z.string().optional(),
});

const reviewSchema = z.object({
  approvedCardsJson: z.array(z.record(z.unknown())).min(0),
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

function buildLevelInstruction(level: 'surface' | 'medium' | 'deep', focusTags: string[]): string {
  const focus = focusTags.length > 0 ? `Focus on: ${focusTags.join(', ')}.` : '';
  if (level === 'surface') return `Provide top 3 sources, basic statistics. ${focus}`;
  if (level === 'medium') return `Provide 5–8 sources, expert quotes, and supporting data. ${focus}`;
  return `Provide 10+ sources, contra-arguments, validated processes, and cross-references. ${focus}`;
}

export async function researchSessionsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST / — start a research session for an idea.
   */
  /**
   * GET / — list research sessions (optionally filtered by channel + status).
   */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const q = request.query as { channel_id?: string; status?: string; limit?: string };
      let query = sb
        .from('research_sessions')
        .select('id, channel_id, idea_id, level, status, input_json, cards_json, created_at')
        .order('created_at', { ascending: false })
        .limit(Math.min(Number(q.limit ?? 50), 200));
      if (q.channel_id) query = query.eq('channel_id', q.channel_id);
      if (q.status) query = query.eq('status', q.status);
      const { data, error } = await query;
      if (error) throw error;
      return reply.send({ data: { sessions: data ?? [] }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const body = createSchema.parse(request.body);
      const orgId = await getOrgId(request.userId);
      const sb = createServiceClient();
      // Local Ollama runs cost us nothing → no internal credit charge.
      const cost = body.provider === 'ollama' ? 0 : LEVEL_COSTS[body.level];
      if (cost > 0) await checkCredits(orgId, request.userId, cost);

      const inputJson = {
        topic: body.topic ?? null,
        ideaId: body.ideaId ?? null,
        level: body.level,
        focusTags: body.focusTags,
        instruction: buildLevelInstruction(body.level, body.focusTags),
      };

      const { data: session, error: insertErr } = await (
        sb.from('research_sessions') as unknown as {
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
          idea_id: body.ideaId ?? null,
          level: body.level,
          focus_tags: body.focusTags,
          input_json: inputJson,
          model_tier: body.modelTier,
          status: 'running',
        })
        .select()
        .single();

      if (insertErr || !session) throw insertErr ?? new ApiError(500, 'Failed to create session', 'INTERNAL');

      const sessionData = session!; // Narrowed after null check above

      try {
        // Build BC_RESEARCH_INPUT with linked idea context
        let selectedIdea: Record<string, unknown> | null = null;
        if (body.ideaId) {
          const { data: idea } = await sb
            .from('idea_archives')
            .select('*')
            .eq('id', body.ideaId)
            .maybeSingle();
          if (idea) {
            selectedIdea = {
              idea_id: (idea as Record<string, unknown>).idea_id,
              title: (idea as Record<string, unknown>).title,
              core_tension: (idea as Record<string, unknown>).core_tension,
              target_audience: (idea as Record<string, unknown>).target_audience,
            };
          }
        }

        // Fetch channel info for language/tone context
        let channelContext: Record<string, unknown> | null = null;
        if (body.channelId) {
          const { data: ch } = await sb
            .from('channels')
            .select('name, language, tone, niche')
            .eq('id', body.channelId)
            .maybeSingle();
          if (ch) channelContext = ch as Record<string, unknown>;
        }

        const researchInput: Record<string, unknown> = {
          selected_idea: selectedIdea ?? { title: body.topic ?? '' },
          research_focus: body.focusTags.length > 0 ? body.focusTags : ['general research'],
          depth: body.level,
        };
        if (channelContext) researchInput.channel = channelContext;

        const baseSystem = (await loadAgentPrompt('research')) ?? '';
        const systemPrompt = [
          baseSystem,
          `\nLevel directive: ${inputJson.instruction}`,
          '\nIMPORTANT: Output valid JSON matching the BC_RESEARCH_OUTPUT schema.',
          'Include: idea_validation, sources, statistics, expert_quotes, counterarguments, knowledge_gaps, research_summary, refined_angle.',
          channelContext?.language ? `\nWrite ALL content in ${channelContext.language}. Do NOT mix languages.` : '',
        ].filter(Boolean).join('\n').trim();

        const { result } = await generateWithFallback(
          'research',
          body.modelTier,
          {
            agentType: 'research',
            input: researchInput,
            schema: null,
            systemPrompt,
          },
          { provider: body.provider, model: body.model },
        );

        const cards = normalizeCards(result);

        // Extract refined_angle from agent output if present
        const resultObj = (result && typeof result === 'object') ? result as Record<string, unknown> : {};
        const refinedAngle = resultObj.refined_angle ?? resultObj.refinedAngle ?? null;

        const updateData: Record<string, unknown> = { status: 'completed', cards_json: cards };
        if (refinedAngle) updateData.refined_angle_json = refinedAngle;

        await (sb.from('research_sessions') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        })
          .update(updateData)
          .eq('id', sessionData.id);

        await debitCredits(orgId, request.userId, `research-${body.level}`, 'text', cost, {
          channelId: body.channelId,
          ideaId: body.ideaId,
        });

        return reply.send({
          data: {
            sessionId: sessionData.id,
            level: body.level,
            cards,
            refinedAngle: refinedAngle ?? null,
          },
          error: null,
        });
      } catch (err) {
        await (sb.from('research_sessions') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        })
          .update({ status: 'failed', error_message: (err as Error)?.message?.slice(0, 500) })
          .eq('id', sessionData.id);
        throw err;
      }
      await emitJobEvent(sessionData.id, 'research', 'queued', 'Iniciando…');

      await inngest.send({
        name: 'research/generate',
        data: {
          sessionId: sessionData.id,
          orgId,
          userId: request.userId,
          channelId: body.channelId ?? null,
          ideaId: body.ideaId ?? null,
          level: body.level,
          inputJson,
          modelTier: body.modelTier,
          provider: body.provider,
          model: body.model,
        },
      });

      return reply.status(202).send({
        data: { sessionId: sessionData.id, level: body.level, status: 'queued' },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id/events — SSE stream of progress events for the research job.
   */
  fastify.get('/:id/events', { preHandler: [authenticate] }, async (request, reply) => {
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
    request.raw.on('close', () => { closed = true; });

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
          reply.raw.write(': ping\n\n');
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    };

    void poll().catch((err) => {
      fastify.log.error({ err }, 'SSE poll failed');
      reply.raw.end();
    });

    return reply;
  });

  /**
   * GET /:id — fetch session.
   */
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const { data, error } = await sb.from('research_sessions').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) throw new ApiError(404, 'Session not found', 'NOT_FOUND');
      return reply.send({ data, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PATCH /:id/review — save approved cards and mark reviewed.
   */
  fastify.patch('/:id/review', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const body = reviewSchema.parse(request.body);

      const { data, error } = await (sb.from('research_sessions') as unknown as {
        update: (row: Record<string, unknown>) => {
          eq: (col: string, val: string) => {
            select: () => { single: () => Promise<{ data: unknown; error: unknown }> };
          };
        };
      })
        .update({ approved_cards_json: body.approvedCardsJson, status: 'reviewed' })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return reply.send({ data, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /:id/accept-pivot — Accept pivot recommendation from research.
   * Updates linked idea title/core_tension and marks pivot_applied.
   */
  fastify.post('/:id/accept-pivot', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: session, error: sessErr } = await sb
        .from('research_sessions')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (sessErr) throw sessErr;
      if (!session) throw new ApiError(404, 'Session not found', 'NOT_FOUND');

      const sessionData = session as Record<string, unknown>;
      const refinedAngle = sessionData.refined_angle_json as Record<string, unknown> | null;
      if (!refinedAngle || !refinedAngle.should_pivot) {
        throw new ApiError(400, 'No pivot recommendation available for this session', 'NO_PIVOT');
      }

      const ideaId = sessionData.idea_id as string | null;
      if (ideaId) {
        const updateFields: Record<string, unknown> = {};
        if (refinedAngle.updated_title) updateFields.title = refinedAngle.updated_title;
        if (refinedAngle.updated_hook) updateFields.core_tension = refinedAngle.updated_hook;

        if (Object.keys(updateFields).length > 0) {
          await sb
            .from('idea_archives')
            .update(updateFields as never)
            .eq('id', ideaId);
        }
      }

      await (sb.from('research_sessions') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
      })
        .update({ pivot_applied: true })
        .eq('id', id);

      return reply.send({
        data: {
          pivotApplied: true,
          updatedTitle: refinedAngle.updated_title ?? null,
          updatedHook: refinedAngle.updated_hook ?? null,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id/signals — F2-039. Decision signals: Google Trends + YouTube Intelligence.
   */
  fastify.get('/:id/signals', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: session } = await sb
        .from('research_sessions')
        .select('channel_id, input_json')
        .eq('id', id)
        .maybeSingle();
      if (!session) throw new ApiError(404, 'Session not found', 'NOT_FOUND');

      const topic = (session.input_json as { topic?: string })?.topic ?? null;
      if (!topic) {
        return reply.send({
          data: { trends: null, youtube: null, warning: 'No topic — signals unavailable' },
          error: null,
        });
      }

      const ytPromise = session.channel_id
        ? sb
            .from('youtube_niche_analyses')
            .select('*')
            .eq('channel_id', session.channel_id as string)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null });

      const trendsPromise = fetchTrends(topic).catch((err) => {
        request.log.warn({ err: err?.message }, '[signals] trends failed');
        return null;
      });

      const [ytRes, trends] = await Promise.all([ytPromise, trendsPromise]);

      return reply.send({
        data: {
          topic,
          trends,
          youtube: ytRes.data,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /:id/regenerate — Re-run research with same inputs.
   * Creates a new session linked to the same project/idea.
   */
  fastify.post('/:id/regenerate', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: original, error: fetchErr } = await sb
        .from('research_sessions')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!original) throw new ApiError(404, 'Session not found', 'NOT_FOUND');

      const orig = original as Record<string, unknown>;
      const orgId = await getOrgId(request.userId);
      const level = (orig.level as 'surface' | 'medium' | 'deep') ?? 'medium';
      const cost = LEVEL_COSTS[level];
      await checkCredits(orgId, request.userId, cost);

      const focusTags = (orig.focus_tags as string[]) ?? [];
      const instruction = buildLevelInstruction(level, focusTags);
      const inputJson = { ...(orig.input_json as Record<string, unknown>), instruction };

      const { data: session, error: insertErr } = await (
        sb.from('research_sessions') as unknown as {
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
          idea_id: orig.idea_id ?? null,
          level,
          focus_tags: focusTags,
          input_json: inputJson,
          model_tier: orig.model_tier,
          status: 'running',
        })
        .select()
        .single();

      if (insertErr || !session) throw insertErr ?? new ApiError(500, 'Failed to create session', 'INTERNAL');

      const sessionData2 = session!; // Narrowed after null check above

      try {
        const baseSystem = (await loadAgentPrompt('research')) ?? '';
        const systemPrompt = `${baseSystem}\n\nLevel directive: ${instruction}`.trim();

        const { result } = await generateWithFallback(
          'research',
          (orig.model_tier as string) ?? 'standard',
          { agentType: 'research', input: inputJson, schema: null, systemPrompt },
        );

        const cards = normalizeCards(result);
        const resultObj = (result && typeof result === 'object') ? result as Record<string, unknown> : {};
        const refinedAngle = resultObj.refined_angle ?? resultObj.refinedAngle ?? null;

        const updateData: Record<string, unknown> = { status: 'completed', cards_json: cards };
        if (refinedAngle) updateData.refined_angle_json = refinedAngle;

        await (sb.from('research_sessions') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        }).update(updateData).eq('id', sessionData2.id);

        await debitCredits(orgId, request.userId, `research-${level}`, 'text', cost, { regeneratedFrom: id });

        return reply.send({ data: { sessionId: sessionData2.id, level, cards, refinedAngle }, error: null });
      } catch (err) {
        await (sb.from('research_sessions') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        }).update({ status: 'failed', error_message: (err as Error)?.message?.slice(0, 500) }).eq('id', sessionData2.id);
        throw err;
      }
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
