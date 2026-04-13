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
import { getRouteForStage, STAGE_COSTS } from '../lib/ai/router.js';
import { loadAgentPrompt } from '../lib/ai/promptLoader.js';
import { checkCredits, debitCredits } from '../lib/credits.js';

const brainstormBodySchema = z.object({
  channelId: z.string().uuid().optional(),
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
});

interface RawIdea {
  title?: string;
  angle?: string;
  core_tension?: string;
  target_audience?: string;
  verdict?: string;
  monetization?: string;
  repurposing?: string[];
}

function normalizeIdeas(raw: unknown): RawIdea[] {
  if (Array.isArray(raw)) return raw as RawIdea[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.ideas)) return obj.ideas as RawIdea[];
    if (Array.isArray(obj.output)) return obj.output as RawIdea[];
  }
  return [];
}

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
   * POST /sessions — Run a brainstorm and persist ideas.
   */
  fastify.post('/sessions', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');

      const body = brainstormBodySchema.parse(request.body);
      const orgId = await getOrgId(request.userId);
      const sb = createServiceClient();

      await checkCredits(orgId, request.userId, STAGE_COSTS.brainstorm);

      const inputJson: Record<string, unknown> = {
        topic: body.topic ?? null,
        fineTuning: body.fineTuning ?? null,
        referenceUrl: body.referenceUrl ?? null,
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
          input_mode: body.inputMode,
          input_json: inputJson,
          model_tier: body.modelTier,
          status: 'running',
        })
        .select()
        .single();

      if (insertErr || !session) throw insertErr ?? new ApiError(500, 'Failed to create session', 'DB_ERROR');

      try {
        const { provider } = getRouteForStage('brainstorm', body.modelTier);
        const systemPrompt = (await loadAgentPrompt('brainstorm')) ?? undefined;

        const result = await provider.generateContent({
          agentType: 'brainstorm',
          input: inputJson,
          schema: null,
          systemPrompt,
        });

        const ideas = normalizeIdeas(result);

        // Persist ideas with auto-generated idea_id (BC-IDEA-NNN).
        const { count } = await sb
          .from('idea_archives')
          .select('*', { count: 'exact', head: true });
        const startNum = (count ?? 0) + 1;

        const ideaRows = ideas.map((idea, i) => ({
          idea_id: `BC-IDEA-${String(startNum + i).padStart(3, '0')}`,
          title: idea.title ?? `Untitled ${i + 1}`,
          core_tension: idea.core_tension ?? '',
          target_audience: idea.target_audience ?? '',
          verdict:
            idea.verdict === 'viable' || idea.verdict === 'weak' || idea.verdict === 'experimental'
              ? idea.verdict
              : 'experimental',
          discovery_data: JSON.stringify({
            angle: idea.angle,
            monetization: idea.monetization,
            repurposing: idea.repurposing,
          }),
          source_type: 'brainstorm',
          channel_id: body.channelId ?? null,
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
        })
          .update({ status: 'completed' })
          .eq('id', session.id);

        await debitCredits(orgId, request.userId, 'brainstorm', 'text', STAGE_COSTS.brainstorm, {
          channelId: body.channelId,
          mode: body.inputMode,
        });

        return reply.send({
          data: { sessionId: session.id, ideas: ideaRows },
          error: null,
        });
      } catch (err) {
        await (sb.from('brainstorm_sessions') as unknown as {
          update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
        })
          .update({ status: 'failed', error_message: (err as Error)?.message?.slice(0, 500) })
          .eq('id', session.id);
        throw err;
      }
    } catch (error) {
      return sendError(reply, error);
    }
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
}
