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
import { checkCredits } from '../lib/credits.js';
import { inngest } from '../jobs/client.js';
import { emitJobEvent } from '../jobs/emitter.js';

const LEVEL_COSTS: Record<'surface' | 'medium' | 'deep', number> = {
  surface: 60,
  medium: 100,
  deep: 180,
};

const createSchema = z.object({
  channelId: z.string().uuid().optional(),
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

      await emitJobEvent(session.id, 'research', 'queued', 'Iniciando…');

      await inngest.send({
        name: 'research/generate',
        data: {
          sessionId: session.id,
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
        data: { sessionId: session.id, level: body.level, status: 'queued' },
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

    let lastCreatedAt = '1970-01-01T00:00:00Z';
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
}
