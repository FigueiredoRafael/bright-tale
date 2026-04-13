/**
 * F2-020/F2-021/F2-022 — Content drafts pipeline.
 * - POST /                     create a draft (type: blog|video|shorts|podcast)
 * - POST /:id/canonical-core   run agent-3a, store canonical_core_json
 * - POST /:id/produce          run agent-3b-{type}, store draft_json
 * - PATCH /:id                 manual edits (title, draft_json, status…)
 * - GET /:id                   read
 * - GET /                      list with optional ?channel_id, ?type
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { getRouteForStage } from '../lib/ai/router.js';
import { loadAgentPrompt } from '../lib/ai/promptLoader.js';
import { checkCredits, debitCredits } from '../lib/credits.js';

const FORMAT_COSTS: Record<string, number> = {
  blog: 200,
  video: 200,
  shorts: 100,
  podcast: 150,
};
const CANONICAL_CORE_COST = 80;

const createSchema = z.object({
  channelId: z.string().uuid().optional(),
  ideaId: z.string().optional(),
  researchSessionId: z.string().uuid().optional(),
  type: z.enum(['blog', 'video', 'shorts', 'podcast']),
  title: z.string().optional(),
  modelTier: z.string().default('standard'),
});

const updateSchema = z.object({
  title: z.string().optional(),
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

      const { provider } = getRouteForStage('production', (draft.model_tier as string) ?? 'standard');
      const systemPrompt =
        (await loadAgentPrompt('content-core')) ?? (await loadAgentPrompt('production')) ?? undefined;

      const result = await provider.generateContent({
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
      });

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
   * POST /:id/produce — F2-021/F2-022. Run agent-3b-{type} using canonical core.
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

      const { provider } = getRouteForStage('production', (draft.model_tier as string) ?? 'standard');
      const systemPrompt =
        (await loadAgentPrompt(type)) ?? (await loadAgentPrompt('production')) ?? undefined;

      const result = await provider.generateContent({
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
      });

      const { data: updated, error } = await (sb.from('content_drafts') as unknown as {
        update: (row: Record<string, unknown>) => {
          eq: (col: string, val: string) => {
            select: () => { single: () => Promise<{ data: unknown; error: unknown }> };
          };
        };
      })
        .update({ draft_json: result, status: 'in_review' })
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
}
