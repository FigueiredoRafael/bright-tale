/**
 * F2-020/F2-021/F2-022 — Content drafts pipeline.
 * - POST /                        create a draft (type: blog|video|shorts|podcast|engagement)
 * - POST /:id/canonical-core      run agent-3a, store canonical_core_json
 * - PATCH /:id/production-settings save blog settings before produce
 * - POST /:id/produce             run agent-3b-{type}, store draft_json (status stays 'draft')
 * - POST /:id/review              run agent-4, score + verdict (manual trigger)
 * - POST /:id/revise              accept user edits after review_verdict='revision_required'
 * - PATCH /:id                    manual edits (title, draft_json, status…)
 * - GET /:id                      read
 * - GET /                         list with optional ?channel_id, ?type
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { generateWithFallback } from '../lib/ai/router.js';
import { loadAgentPrompt } from '../lib/ai/promptLoader.js';
import { buildChannelContext } from '../lib/ai/channelContext.js';
import { checkCredits, debitCredits } from '../lib/credits.js';
import {
  blogProductionSettingsSchema,
  reviseSchema,
} from '@brighttale/shared/schemas/pipeline';

const FORMAT_COSTS: Record<string, number> = {
  blog: 200,
  video: 200,
  shorts: 100,
  podcast: 150,
};
const CANONICAL_CORE_COST = 80;
const REVIEW_COST = 20;

const createSchema = z.object({
  channelId: z.string().uuid().optional(),
  ideaId: z.string().optional(),
  researchSessionId: z.string().uuid().optional(),
  projectId: z.string().optional(),
  type: z.enum(['blog', 'video', 'shorts', 'podcast', 'engagement']),
  title: z.string().optional(),
  modelTier: z.string().default('standard'),
});

const updateSchema = z.object({
  title: z.string().optional(),
  canonicalCoreJson: z.record(z.unknown()).optional(),
  draftJson: z.record(z.unknown()).optional(),
  reviewFeedbackJson: z.record(z.unknown()).optional(),
  status: z.enum(['draft', 'in_review', 'approved', 'scheduled', 'published', 'failed']).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  publishedAt: z.string().datetime().nullable().optional(),
  publishedUrl: z.string().url().nullable().optional(),
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

async function loadDraft(id: string) {
  const sb = createServiceClient();
  const { data, error } = await sb.from('content_drafts').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Draft not found', 'NOT_FOUND');
  return data;
}

export async function contentDraftsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST / — create draft scaffold.
   */
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const body = createSchema.parse(request.body);
      const orgId = await getOrgId(request.userId);
      const sb = createServiceClient();

      const { data, error } = await (sb.from('content_drafts') as unknown as {
        insert: (row: Record<string, unknown>) => {
          select: () => { single: () => Promise<{ data: unknown; error: unknown }> };
        };
      })
        .insert({
          org_id: orgId,
          user_id: request.userId,
          channel_id: body.channelId ?? null,
          idea_id: body.ideaId ?? null,
          research_session_id: body.researchSessionId ?? null,
          project_id: body.projectId ?? null,
          type: body.type,
          title: body.title ?? null,
          status: 'draft',
        })
        .select()
        .single();

      if (error) throw error;
      return reply.send({ data, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET / — list drafts (filter by channel + type).
   */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, 'http://localhost');
      const channelId = url.searchParams.get('channel_id');
      const type = url.searchParams.get('type');

      let q = sb.from('content_drafts').select('*').order('updated_at', { ascending: false });
      if (channelId) q = q.eq('channel_id', channelId);
      if (type) q = q.eq('type', type);

      const { data, error } = await q;
      if (error) throw error;
      return reply.send({ data: { drafts: data ?? [] }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id
   */
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const draft = await loadDraft(id);
      return reply.send({ data: draft, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PATCH /:id — manual edit.
   */
  fastify.patch('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const body = updateSchema.parse(request.body);

      const update: Record<string, unknown> = {};
      if (body.title !== undefined) update.title = body.title;
      if (body.canonicalCoreJson !== undefined) update.canonical_core_json = body.canonicalCoreJson;
      if (body.draftJson !== undefined) update.draft_json = body.draftJson;
      if (body.reviewFeedbackJson !== undefined) update.review_feedback_json = body.reviewFeedbackJson;
      if (body.status !== undefined) update.status = body.status;
      if (body.scheduledAt !== undefined) update.scheduled_at = body.scheduledAt;
      if (body.publishedAt !== undefined) update.published_at = body.publishedAt;
      if (body.publishedUrl !== undefined) update.published_url = body.publishedUrl;

      const { data, error } = await (sb.from('content_drafts') as unknown as {
        update: (row: Record<string, unknown>) => {
          eq: (col: string, val: string) => {
            select: () => { single: () => Promise<{ data: unknown; error: unknown }> };
          };
        };
      })
        .update(update)
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
   * POST /:id/canonical-core — F2-020. Run agent-3a using research + brainstorm context.
   */
  fastify.post('/:id/canonical-core', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const draft = await loadDraft(id) as Record<string, unknown>;
      const orgId = await getOrgId(request.userId);

      await checkCredits(orgId, request.userId, CANONICAL_CORE_COST);

      // Pull research approved cards if linked
      let approvedCards: unknown = null;
      if (draft.research_session_id) {
        const { data: rs } = await sb
          .from('research_sessions')
          .select('approved_cards_json, cards_json, level, focus_tags')
          .eq('id', draft.research_session_id as string)
          .maybeSingle();
        approvedCards = rs?.approved_cards_json ?? rs?.cards_json ?? null;
      }

      let systemPrompt =
        (await loadAgentPrompt('content-core')) ?? (await loadAgentPrompt('production')) ?? undefined;

      // Inject channel context into system prompt
      const channelContext = await buildChannelContext(draft.channel_id as string | null | undefined);
      if (channelContext && systemPrompt) {
        systemPrompt = `${systemPrompt}\n\n${channelContext}`;
      }

      const { result } = await generateWithFallback(
        'production',
        (draft.model_tier as string) ?? 'standard',
        {
          agentType: 'production',
          input: {
            stage: 'canonical-core',
            type: draft.type,
            title: draft.title,
            ideaId: draft.idea_id,
            researchCards: approvedCards,
          },
          schema: null,
          systemPrompt,
        },
      );

      const { data: updated, error } = await (sb.from('content_drafts') as unknown as {
        update: (row: Record<string, unknown>) => {
          eq: (col: string, val: string) => {
            select: () => { single: () => Promise<{ data: unknown; error: unknown }> };
          };
        };
      })
        .update({ canonical_core_json: result, status: 'draft' })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;

      await debitCredits(orgId, request.userId, 'canonical-core', 'text', CANONICAL_CORE_COST, {
        draftId: id,
        type: draft.type,
      });

      return reply.send({ data: updated, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PATCH /:id/production-settings — Save blog settings before produce.
   */
  fastify.patch('/:id/production-settings', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const settings = blogProductionSettingsSchema.parse(request.body);

      const { data, error } = await (sb.from('content_drafts') as unknown as {
        update: (row: Record<string, unknown>) => {
          eq: (col: string, val: string) => {
            select: () => { single: () => Promise<{ data: unknown; error: unknown }> };
          };
        };
      })
        .update({ production_settings_json: settings })
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
   * POST /:id/produce — F2-021/F2-022. Run agent-3b-{type} using canonical core.
   * Status stays 'draft' — user manually triggers review when ready.
   */
  fastify.post('/:id/produce', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const draft = await loadDraft(id) as Record<string, unknown>;
      const orgId = await getOrgId(request.userId);

      const type = (draft.type as string) ?? 'blog';
      const cost = FORMAT_COSTS[type] ?? 200;
      await checkCredits(orgId, request.userId, cost);

      // Blog production settings are optional — use defaults if not set
      // Users can set via PATCH /:id/production-settings before producing

      let systemPrompt =
        (await loadAgentPrompt(type)) ?? (await loadAgentPrompt('production')) ?? undefined;

      // Inject production settings into system prompt for blog
      const settings = draft.production_settings_json as Record<string, unknown> | null;
      if (settings && systemPrompt) {
        const settingsContext: string[] = [];
        if (settings.wordCountTarget) settingsContext.push(`Target word count: ${settings.wordCountTarget}`);
        if (settings.writingStyle) settingsContext.push(`Writing style: ${settings.writingStyle}`);
        if (settings.tone) settingsContext.push(`Tone: ${settings.tone}`);
        if (Array.isArray(settings.keywords) && settings.keywords.length > 0)
          settingsContext.push(`Keywords to include: ${settings.keywords.join(', ')}`);
        if (Array.isArray(settings.categories) && settings.categories.length > 0)
          settingsContext.push(`WordPress categories: ${settings.categories.join(', ')}`);
        if (Array.isArray(settings.tags) && settings.tags.length > 0)
          settingsContext.push(`WordPress tags: ${settings.tags.join(', ')}`);
        if (settingsContext.length > 0) {
          systemPrompt = `${systemPrompt}\n\n## Production Settings\n${settingsContext.join('\n')}`;
        }
      }

      // Inject channel context into system prompt
      const channelContext = await buildChannelContext(draft.channel_id as string | null | undefined);
      if (channelContext && systemPrompt) {
        systemPrompt = `${systemPrompt}\n\n${channelContext}`;
      }

      const { result } = await generateWithFallback(
        'production',
        (draft.model_tier as string) ?? 'standard',
        {
          agentType: 'production',
          input: {
            stage: 'produce',
            type,
            title: draft.title,
            canonicalCore: draft.canonical_core_json,
            researchSessionId: draft.research_session_id,
          },
          schema: null,
          systemPrompt,
        },
      );

      // Status stays 'draft' — user manually triggers review when ready
      const { data: updated, error } = await (sb.from('content_drafts') as unknown as {
        update: (row: Record<string, unknown>) => {
          eq: (col: string, val: string) => {
            select: () => { single: () => Promise<{ data: unknown; error: unknown }> };
          };
        };
      })
        .update({ draft_json: result, status: 'draft' })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;

      await debitCredits(orgId, request.userId, `production-${type}`, 'text', cost, {
        draftId: id,
        type,
      });

      return reply.send({ data: updated, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /:id/review — Run agent-4 review. Manual trigger only.
   * Requires status = 'in_review'. User sets this via PATCH first.
   */
  fastify.post('/:id/review', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const draft = await loadDraft(id) as Record<string, unknown>;
      const orgId = await getOrgId(request.userId);

      if (draft.status !== 'in_review') {
        throw new ApiError(400, 'Draft must be in_review status. Use PATCH to set status first.', 'INVALID_STATUS');
      }

      await checkCredits(orgId, request.userId, REVIEW_COST);

      // Build review input from draft context
      let ideaData: unknown = null;
      if (draft.idea_id) {
        const { data: idea } = await sb
          .from('idea_archives')
          .select('*')
          .eq('id', draft.idea_id as string)
          .maybeSingle();
        ideaData = idea;
      }

      let researchData: unknown = null;
      if (draft.research_session_id) {
        const { data: rs } = await sb
          .from('research_sessions')
          .select('approved_cards_json, cards_json')
          .eq('id', draft.research_session_id as string)
          .maybeSingle();
        researchData = rs?.approved_cards_json ?? rs?.cards_json ?? null;
      }

      let systemPrompt =
        (await loadAgentPrompt('review')) ?? undefined;

      // Inject channel context into system prompt
      const channelContext = await buildChannelContext(draft.channel_id as string | null | undefined);
      if (channelContext && systemPrompt) {
        systemPrompt = `${systemPrompt}\n\n${channelContext}`;
      }

      let result: Record<string, unknown>;
      try {
        const response = await generateWithFallback(
          'review',
          (draft.model_tier as string) ?? 'standard',
          {
            agentType: 'review',
            input: {
              stage: 'review',
              type: draft.type,
              title: draft.title,
              draftJson: draft.draft_json,
              canonicalCore: draft.canonical_core_json,
              idea: ideaData,
              research: researchData,
              contentTypesRequested: [draft.type],
            },
            schema: null,
            systemPrompt,
          },
        );
        result = response.result as Record<string, unknown>;
      } catch (agentError) {
        // On agent failure: mark failed, don't debit credits
        await (sb.from('content_drafts') as unknown as {
          update: (row: Record<string, unknown>) => {
            eq: (col: string, val: string) => Promise<{ error: unknown }>;
          };
        })
          .update({
            status: 'failed',
            review_feedback_json: { error: String(agentError) },
          })
          .eq('id', id);
        throw agentError;
      }

      // Extract verdict and score from agent response
      const overallVerdict = (result.overall_verdict as string) ?? 'revision_required';
      const draftType = draft.type as string;
      const formatReview = result[`${draftType}_review`] as Record<string, unknown> | undefined;
      const reviewScore = (formatReview?.score as number) ?? null;
      const iterationCount = ((draft.iteration_count as number) ?? 0) + 1;

      // Determine status based on agent verdict
      let newStatus: string;
      let newVerdict: string;
      let approvedAt: string | null = null;

      if (overallVerdict === 'approved') {
        newStatus = 'approved';
        newVerdict = 'approved';
        approvedAt = new Date().toISOString();
      } else if (overallVerdict === 'rejected') {
        newStatus = 'failed';
        newVerdict = 'rejected';
      } else {
        newStatus = 'in_review';
        newVerdict = 'revision_required';
      }

      // Store review data
      const updateData: Record<string, unknown> = {
        review_feedback_json: result,
        review_score: reviewScore,
        review_verdict: newVerdict,
        iteration_count: iterationCount,
        status: newStatus,
      };
      if (approvedAt) updateData.approved_at = approvedAt;

      const { data: updated, error } = await (sb.from('content_drafts') as unknown as {
        update: (row: Record<string, unknown>) => {
          eq: (col: string, val: string) => {
            select: () => { single: () => Promise<{ data: unknown; error: unknown }> };
          };
        };
      })
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;

      // Log review iteration
      await (sb.from('review_iterations' as never) as unknown as {
        insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
      }).insert({
        draft_id: id,
        iteration: iterationCount,
        score: reviewScore,
        verdict: newVerdict,
        feedback_json: result,
      });

      // Debit credits only on successful agent call
      await debitCredits(orgId, request.userId, 'review', 'text', REVIEW_COST, {
        draftId: id,
        type: draftType,
        iteration: iterationCount,
      });

      return reply.send({ data: { draft: updated, review: result }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /:id/revise — Accept user edits after review returns revision_required.
   */
  fastify.post('/:id/revise', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const draft = await loadDraft(id) as Record<string, unknown>;
      const body = reviseSchema.parse(request.body);

      const verdict = draft.review_verdict as string;
      if (verdict !== 'revision_required' && verdict !== 'rejected') {
        throw new ApiError(400, 'Draft must have review_verdict of revision_required or rejected to revise.', 'INVALID_VERDICT');
      }

      const { data, error } = await (sb.from('content_drafts') as unknown as {
        update: (row: Record<string, unknown>) => {
          eq: (col: string, val: string) => {
            select: () => { single: () => Promise<{ data: unknown; error: unknown }> };
          };
        };
      })
        .update({
          draft_json: body.draftJson,
          status: 'in_review',
        })
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
   * POST /:id/reproduce — Re-run production agent with review feedback context.
   * Used in the revision loop: review gives feedback → reproduce fixes issues.
   */
  fastify.post('/:id/reproduce', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED');
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const draft = await loadDraft(id) as Record<string, unknown>;
      const orgId = await getOrgId(request.userId);

      if (!draft.review_feedback_json) {
        throw new ApiError(400, 'No review feedback to revise from. Submit for review first.', 'NO_FEEDBACK');
      }

      const type = (draft.type as string) ?? 'blog';
      const cost = FORMAT_COSTS[type] ?? 200;
      await checkCredits(orgId, request.userId, cost);

      let systemPrompt =
        (await loadAgentPrompt(type)) ?? (await loadAgentPrompt('production')) ?? undefined;

      // Inject production settings if present
      const settings = draft.production_settings_json as Record<string, unknown> | null;
      if (settings && systemPrompt) {
        const ctx: string[] = [];
        if (settings.wordCountTarget) ctx.push(`Target word count: ${settings.wordCountTarget}`);
        if (settings.writingStyle) ctx.push(`Writing style: ${settings.writingStyle}`);
        if (settings.tone) ctx.push(`Tone: ${settings.tone}`);
        if (ctx.length > 0) {
          systemPrompt = `${systemPrompt}\n\n## Production Settings\n${ctx.join('\n')}`;
        }
      }

      // Build input with review feedback context
      const reviewFeedback = draft.review_feedback_json as Record<string, unknown>;
      const formatReview = reviewFeedback[`${type}_review`] as Record<string, unknown> | undefined;

      const { result } = await generateWithFallback(
        'production',
        (draft.model_tier as string) ?? 'standard',
        {
          agentType: 'production',
          input: {
            stage: 'reproduce',
            type,
            title: draft.title,
            canonicalCore: draft.canonical_core_json,
            previousDraft: draft.draft_json,
            reviewFeedback: {
              overall_verdict: reviewFeedback.overall_verdict,
              score: formatReview?.score ?? null,
              critical_issues: formatReview?.critical_issues ?? [],
              minor_issues: formatReview?.minor_issues ?? [],
              strengths: formatReview?.strengths ?? [],
            },
            instruction: 'Fix the critical and minor issues identified in the review. Keep the strengths. Produce an improved version.',
          },
          schema: null,
          systemPrompt,
        },
      );

      const iterationCount = ((draft.iteration_count as number) ?? 0) + 1;

      const { data: updated, error } = await (sb.from('content_drafts') as unknown as {
        update: (row: Record<string, unknown>) => {
          eq: (col: string, val: string) => {
            select: () => { single: () => Promise<{ data: unknown; error: unknown }> };
          };
        };
      })
        .update({
          draft_json: result,
          status: 'draft',
          review_verdict: 'pending',
          iteration_count: iterationCount,
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;

      await debitCredits(orgId, request.userId, `reproduce-${type}`, 'text', cost, {
        draftId: id,
        type,
        iteration: iterationCount,
      });

      return reply.send({ data: updated, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
