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
  // Recursive search: agents often nest the array inside arbitrary keys
  // (BC_BRAINSTORM_OUTPUT.ideas, output.ideas, results, etc.). Find the first
  // array whose items look like ideas (have a string "title" or "idea_id").
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

      try {
        let systemPrompt = (await loadAgentPrompt('brainstorm')) ?? undefined;

        // Append advanced settings to system prompt
        if (systemPrompt) {
          const ctx: string[] = [];
          if (body.temporalMix) {
            ctx.push(`Content mix: ${body.temporalMix.evergreen}% evergreen, ${body.temporalMix.seasonal}% seasonal, ${body.temporalMix.trending}% trending`);
          }
          if (body.constraints?.avoidTopics?.length) {
            ctx.push(`Avoid topics: ${body.constraints.avoidTopics.join(', ')}`);
          }
          if (body.constraints?.requiredFormats?.length) {
            ctx.push(`Required formats: ${body.constraints.requiredFormats.join(', ')}`);
          }
          if (body.ideasRequested !== 5) {
            ctx.push(`Generate exactly ${body.ideasRequested} ideas`);
          }
          if (body.contentGoal) {
            ctx.push(`Primary goal: ${body.contentGoal}`);
          }
          if (body.performanceContext?.recentWinners?.length) {
            ctx.push(`Recent winners (high-performing ideas): ${body.performanceContext.recentWinners.join(', ')}`);
          }
          if (body.performanceContext?.recentLosers?.length) {
            ctx.push(`Recent losers (underperforming ideas): ${body.performanceContext.recentLosers.join(', ')}`);
          }
          if (ctx.length > 0) {
            systemPrompt = `${systemPrompt}\n\n## Advanced Settings\n${ctx.join('\n')}`;
          }
        }

        // Inject channel context into system prompt
        const channelContext = await buildChannelContext(body.channelId);
        if (channelContext && systemPrompt) {
          systemPrompt = `${systemPrompt}\n\n${channelContext}`;
        }

        const { result } = await generateWithFallback(
          'brainstorm',
          body.modelTier,
          {
            agentType: 'brainstorm',
            input: inputJson,
            schema: null,
            systemPrompt,
          },
          { provider: body.provider, model: body.model },
        );

        const ideas = normalizeIdeas(result);
        if (ideas.length === 0) {
          // Log the raw result so we can see what shape the agent returned and
          // teach normalizeIdeas about it next time.
          fastify.log.warn(
            { rawResult: result },
            'brainstorm returned 0 ideas — agent output shape may be unrecognized',
          );
        }

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

        // Fetch saved ideas with UUIDs (upsert doesn't return them)
        const ideaIds = ideaRows.map((r) => r.idea_id);
        const { data: savedIdeas } = await sb
          .from('idea_archives')
          .select('*')
          .in('idea_id', ideaIds);

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
          data: { sessionId: session.id, ideas: savedIdeas ?? ideaRows },
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
