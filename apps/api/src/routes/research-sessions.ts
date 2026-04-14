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

function normalizeCards(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.cards)) return obj.cards as Array<Record<string, unknown>>;
    if (Array.isArray(obj.results)) return obj.results as Array<Record<string, unknown>>;
  }
  return [];
}

export async function researchSessionsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST / — start a research session for an idea.
   */
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const body = createSchema.parse(request.body);
      const orgId = await getOrgId(request.userId);
      const sb = createServiceClient();
      const cost = LEVEL_COSTS[body.level];

      await checkCredits(orgId, request.userId, cost);

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
          .eq('id', session.id);

        await debitCredits(orgId, request.userId, `research-${body.level}`, 'text', cost, {
          channelId: body.channelId,
          ideaId: body.ideaId,
        });

        return reply.send({
          data: {
            sessionId: session.id,
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
          .eq('id', session.id);
        throw err;
      }
    } catch (error) {
      return sendError(reply, error);
    }
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

      // Update the linked idea with pivoted values
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

      // Mark pivot as applied
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
}
