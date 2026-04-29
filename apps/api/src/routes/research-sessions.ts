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
import { buildResearchMessage } from '../lib/ai/prompts/research.js';
import type { ResearchInput } from '../lib/ai/prompts/research.js';
import { logAiUsage } from '../lib/axiom.js';

/** Check idea exists in idea_archives before using as FK. Brainstorm drafts may not be promoted yet. */
/**
 * Resolve an idea identifier to the `idea_archives.id` (UUID-as-text) used by FK.
 * Accepts either the UUID `id` or the slug `idea_id` (e.g. BC-IDEA-001). Returns null
 * if the archive row does not exist — prevents FK violation on insert.
 */
async function resolveIdeaId(ideaId: string | null | undefined): Promise<string | null> {
  if (!ideaId) return null;
  const sb = createServiceClient();
  const column = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ideaId) ? 'id' : 'idea_id';
  const { data } = await sb.from('idea_archives').select('id').eq(column, ideaId).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Normalize AI output into a findings object.
 * Accepts these shapes:
 * 1. Already structured: { sources, statistics, expert_quotes, counterarguments, idea_validation, research_summary, refined_angle, knowledge_gaps }
 * 2. Wrapped: { output: { sources, ... } }
 * 3. Legacy array: [{ type: 'source', ... }] → wrap by type
 */
function normalizeFindings(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};

  const obj = raw as Record<string, unknown>;

  // If it's already wrapped in 'output', unwrap once
  if (obj.output && typeof obj.output === 'object' && !Array.isArray(obj.output)) {
    return normalizeFindings(obj.output);
  }

  // Check if it already looks like the target shape (has at least one expected key)
  const expectedKeys = ['sources', 'statistics', 'expert_quotes', 'counterarguments', 'idea_validation', 'research_summary', 'refined_angle', 'knowledge_gaps'];
  const hasExpectedKey = expectedKeys.some(k => k in obj);

  if (hasExpectedKey) {
    // It's already in the target shape — return as-is (with light validation)
    return obj;
  }

  // Legacy fallback: if we find an array of cards, group by type
  if (Array.isArray(obj.cards)) {
    const cards = obj.cards as Array<Record<string, unknown>>;
    const grouped: Record<string, Array<Record<string, unknown>>> = {
      sources: [],
      statistics: [],
      expert_quotes: [],
      counterarguments: [],
      misc: [],
    };

    for (const card of cards) {
      const type = (card.type as string) ?? 'misc';
      if (type in grouped && !['sources', 'statistics', 'expert_quotes', 'counterarguments'].includes(type)) {
        grouped.misc.push(card);
      } else if (type === 'source') {
        grouped.sources.push(card);
      } else if (type === 'statistic' || type === 'stat') {
        grouped.statistics.push(card);
      } else if (type === 'expert_quote' || type === 'quote') {
        grouped.expert_quotes.push(card);
      } else if (type === 'counterargument') {
        grouped.counterarguments.push(card);
      } else {
        grouped.misc.push(card);
      }
    }

    // Clean up empty arrays
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(grouped)) {
      if (v.length > 0) result[k] = v;
    }

    // Preserve other top-level fields from the original object
    for (const [k, v] of Object.entries(obj)) {
      if (k !== 'cards' && !['sources', 'statistics', 'expert_quotes', 'counterarguments'].includes(k)) {
        result[k] = v;
      }
    }

    return result;
  }

  // Fallback: if we find a flat array of card-like objects at the top level
  if (Array.isArray(obj) && obj.length > 0) {
    return normalizeFindings({ cards: obj });
  }

  // Last-resort: search for nested arrays that look like cards
  function findCardArray(node: unknown, depth = 0): Array<Record<string, unknown>> | null {
    if (depth > 6) return null;
    if (Array.isArray(node)) {
      const hasCards = node.length > 0 && node.every(item =>
        item && typeof item === 'object' && (
          'title' in item || 'quote' in item || 'claim' in item ||
          'url' in item || 'source' in item || 'author' in item
        )
      );
      if (hasCards) return node as Array<Record<string, unknown>>;
      return null;
    }
    if (node && typeof node === 'object') {
      for (const v of Object.values(node as Record<string, unknown>)) {
        const found = findCardArray(v, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  const foundCards = findCardArray(raw);
  if (foundCards && foundCards.length > 0) {
    return normalizeFindings({ cards: foundCards });
  }

  return {};
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
  provider: z.enum(['gemini', 'openai', 'anthropic', 'ollama', 'manual']).optional(),
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
   * POST /:id/cancel — Cancel a running or awaiting_manual research session.
   */
  fastify.post('/:id/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const { id } = request.params as { id: string };
      const sb = createServiceClient();

      const { data: session } = await sb
        .from('research_sessions')
        .select('id, status, user_id')
        .eq('id', id)
        .maybeSingle();

      if (!session) throw new ApiError(404, 'Session not found', 'NOT_FOUND');
      if (session.user_id !== request.userId) throw new ApiError(403, 'Forbidden', 'FORBIDDEN');
      if (session.status !== 'running' && session.status !== 'awaiting_manual') {
        return reply.send({ data: { status: session.status }, error: null });
      }

      await (sb.from('research_sessions') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
      })
        .update({ status: 'failed', error_message: 'Cancelled by user' })
        .eq('id', id);

      await emitJobEvent(id, 'research', 'failed', 'Cancelled by user');

      // Cancel the Inngest function run if possible
      try {
        await inngest.send({ name: 'inngest/function.cancelled', data: { function_id: 'research-generate', run_id: id } });
      } catch {
        // Best-effort — Inngest may not support this or the run may already be done
      }

      return reply.send({ data: { status: 'cancelled' }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

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
      // Local Ollama and Manual provider cost us nothing → no internal credit charge.
      const cost = body.provider === 'ollama' || body.provider === 'manual' ? 0 : LEVEL_COSTS[body.level];
      if (cost > 0) await checkCredits(orgId, request.userId, cost);

      const inputJson = {
        topic: body.topic ?? null,
        ideaId: body.ideaId ?? null,
        level: body.level,
        focusTags: body.focusTags,
        instruction: buildLevelInstruction(body.level, body.focusTags),
      };

      // Manual provider short-circuits the LLM call: build the prompt
      // synchronously, emit the full payload to Axiom, persist the session in
      // awaiting_manual state, and return early. The user pastes the output
      // produced externally via POST /:id/manual-output.
      if (body.provider === 'manual') {
        const systemPrompt = (await loadAgentPrompt('research')) ?? '';
        const channelContext = body.channelId
          ? await (async () => {
              const { data } = await sb
                .from('channels')
                .select('name, niche, language, tone, presentation_style')
                .eq('id', body.channelId as string)
                .maybeSingle();
              return data;
            })()
          : null;

        let ideaTitle: string | undefined;
        let coreTension: string | undefined;
        let targetAudience: string | undefined;
        if (body.ideaId) {
          const { data: idea } = await sb
            .from('idea_archives')
            .select('*')
            .eq('id', body.ideaId)
            .maybeSingle();
          if (idea) {
            ideaTitle = (idea as Record<string, unknown>).title as string | undefined;
            coreTension = (idea as Record<string, unknown>).core_tension as string | undefined;
            targetAudience = (idea as Record<string, unknown>).target_audience as string | undefined;
          }
        }

        const userMessage = buildResearchMessage({
          ideaId: body.ideaId ?? undefined,
          ideaTitle: ideaTitle ?? body.topic ?? undefined,
          coreTension,
          targetAudience,
          level: body.level,
          instruction: inputJson.instruction as string,
          channel: channelContext as ResearchInput['channel'],
        });

        const { data: manualSession, error: manualInsertErr } = await (
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
            idea_id: await resolveIdeaId(body.ideaId),
            level: body.level,
            focus_tags: body.focusTags,
            input_json: inputJson,
            model_tier: body.modelTier,
            status: 'awaiting_manual',
          })
          .select()
          .single();
        if (manualInsertErr || !manualSession) {
          throw manualInsertErr ?? new ApiError(500, 'Failed to create session', 'DB_ERROR');
        }

        // Combine system + user message so the operator can copy ONE prompt
        // from Axiom and paste it into ChatGPT/Claude without reassembling.
        const combinedPrompt = systemPrompt
          ? `${systemPrompt}\n\n${userMessage}`
          : userMessage;

        logAiUsage({
          userId: request.userId,
          orgId,
          action: 'manual.awaiting',
          provider: 'manual',
          model: 'manual',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          durationMs: 0,
          status: 'awaiting_manual',
          metadata: {
            sessionId: manualSession.id,
            stage: 'research',
            channelId: body.channelId ?? null,
            prompt: combinedPrompt,
            input: inputJson,
          },
        });

        return reply.status(202).send({
          data: { sessionId: manualSession.id, status: 'awaiting_manual' },
          error: null,
        });
      }

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
          idea_id: await resolveIdeaId(body.ideaId),
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

      // Dispatch the LLM work to the Inngest worker (research-generate.ts) so
      // the route returns 202 quickly. The worker emits SSE progress events
      // and writes findings into research_sessions.cards_json on completion.
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
   * POST /import — Create a research session from manually imported data.
   * Used when the user pastes BC_RESEARCH_OUTPUT from an external AI chat.
   */
  const importSchema = z.object({
    channelId: z.string().uuid().optional(),
    projectId: z.string().optional(),
    ideaId: z.string().optional(),
    topic: z.string().optional(),
    level: z.enum(['surface', 'medium', 'deep']).default('medium'),
    cardsJson: z.array(z.record(z.unknown())),
    refinedAngleJson: z.record(z.unknown()).optional(),
    researchSummary: z.string().optional(),
  });

  fastify.post('/import', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const body = importSchema.parse(request.body);
      const orgId = await getOrgId(request.userId);
      const sb = createServiceClient();

      const inputJson = {
        topic: body.topic ?? null,
        level: body.level,
        source: 'manual_import',
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
          idea_id: await resolveIdeaId(body.ideaId),
          level: body.level,
          focus_tags: [],
          input_json: inputJson,
          model_tier: 'manual',
          status: 'completed',
          cards_json: body.cardsJson,
          approved_cards_json: body.cardsJson,
          refined_angle_json: body.refinedAngleJson ?? null,
        })
        .select()
        .single();

      if (insertErr || !session) throw insertErr ?? new ApiError(500, 'Failed to create session', 'INTERNAL');

      return reply.send({
        data: {
          sessionId: session.id,
          level: body.level,
          cards: body.cardsJson,
          refinedAngle: body.refinedAngleJson ?? null,
          status: 'completed',
        },
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
   * POST /:id/manual-output — Submit the output produced externally
   * for a session in `awaiting_manual` status. Persists the cards, flips the
   * session to `completed`, and emits a `manual.completed` Axiom event.
   */
  fastify.post('/:id/manual-output', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const { id } = request.params as { id: string };
      const body = z.object({ output: z.unknown() }).parse(request.body);
      const sb = createServiceClient();

      const { data: session, error: fetchErr } = await sb
        .from('research_sessions')
        .select('id, status, channel_id, project_id, org_id, user_id')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!session) throw new ApiError(404, 'Session not found', 'NOT_FOUND');
      const row = session as Record<string, unknown>;
      if (row.user_id !== request.userId) throw new ApiError(403, 'Forbidden', 'FORBIDDEN');
      if (row.status !== 'awaiting_manual') {
        throw new ApiError(409, `Session is not awaiting manual output (status=${row.status})`, 'CONFLICT');
      }

      const findings = normalizeFindings(body.output);

      // Validate that findings has at least some structure
      const hasContent = Object.keys(findings).length > 0 &&
        (Array.isArray(findings.sources) && findings.sources.length > 0 ||
         Array.isArray(findings.statistics) && findings.statistics.length > 0 ||
         Array.isArray(findings.expert_quotes) && findings.expert_quotes.length > 0 ||
         Array.isArray(findings.counterarguments) && findings.counterarguments.length > 0 ||
         Array.isArray(findings.misc) && findings.misc.length > 0);

      if (!hasContent) {
        throw new ApiError(400, 'No research data found in pasted output', 'INVALID_OUTPUT');
      }

      // Extract refined_angle if present
      const refinedAngle = findings.refined_angle ?? null;

      // Update session with findings and flip to completed
      const updateData: Record<string, unknown> = { status: 'completed', cards_json: findings };
      if (refinedAngle) updateData.refined_angle_json = refinedAngle;

      const { error: updErr } = await (sb.from('research_sessions') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> };
      })
        .update(updateData)
        .eq('id', id);
      if (updErr) {
        throw new ApiError(500, `Failed to mark session completed: ${String((updErr as { message?: string })?.message ?? updErr)}`, 'DB_ERROR');
      }

      logAiUsage({
        userId: request.userId,
        orgId: (row.org_id as string) ?? null,
        action: 'manual.completed',
        provider: 'manual',
        model: 'manual',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        durationMs: 0,
        status: 'success',
        metadata: {
          sessionId: id,
          stage: 'research',
          output: body.output,
          findingsKeys: Object.keys(findings),
        },
      });

      return reply.send({ data: { findings }, error: null });
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
          idea_id: await resolveIdeaId(orig.idea_id as string | null),
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
        // Fetch idea context for the userMessage builder
        let ideaTitle: string | undefined;
        let coreTension: string | undefined;
        let targetAudience: string | undefined;
        if (orig.idea_id) {
          const { data: idea } = await sb
            .from('idea_archives')
            .select('*')
            .eq('id', orig.idea_id as string)
            .maybeSingle();
          if (idea) {
            ideaTitle = (idea as Record<string, unknown>).title as string | undefined;
            coreTension = (idea as Record<string, unknown>).core_tension as string | undefined;
            targetAudience = (idea as Record<string, unknown>).target_audience as string | undefined;
          }
        }

        // Fetch channel context
        let channelContext: Record<string, unknown> | null = null;
        if (orig.channel_id) {
          const { data: ch } = await sb
            .from('channels')
            .select('name, language, tone, niche')
            .eq('id', orig.channel_id as string)
            .maybeSingle();
          if (ch) channelContext = ch as Record<string, unknown>;
        }

        const baseSystem = (await loadAgentPrompt('research')) ?? '';
        const systemPrompt = baseSystem;

        const userMessage = buildResearchMessage({
          ideaId: (orig.idea_id as string) ?? undefined,
          ideaTitle: ideaTitle ?? ((inputJson as Record<string, unknown>).topic as string) ?? undefined,
          coreTension,
          targetAudience,
          level,
          instruction,
          channel: channelContext as ResearchInput['channel'],
        });

        const { result } = await generateWithFallback(
          'research',
          (orig.model_tier as string) ?? 'standard',
          {
            agentType: 'research',
            systemPrompt: systemPrompt ?? '',
            userMessage,
          },
          {
            logContext: {
              userId: request.userId!,
              orgId,
              channelId: (orig.channel_id as string | null) ?? undefined,
              sessionId: sessionData2.id,
              sessionType: 'research',
            },
          },
        );

        const findings = normalizeFindings(result);
        const refinedAngle = findings.refined_angle ?? null;

        const updateData: Record<string, unknown> = { status: 'completed', cards_json: findings };
        if (refinedAngle) updateData.refined_angle_json = refinedAngle;

        await (sb.from('research_sessions') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        }).update(updateData).eq('id', sessionData2.id);

        await debitCredits(orgId, request.userId, `research-${level}`, 'text', cost, { regeneratedFrom: id });

        return reply.send({ data: { sessionId: sessionData2.id, level, findings, refinedAngle }, error: null });
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
