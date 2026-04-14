/**
 * Ideas Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import {
  listIdeasQuerySchema,
  createIdeaSchema,
  updateIdeaSchema,
  calculateSimilarity,
  type SimilarityWarning,
} from '@brighttale/shared/schemas/ideas';

const SIMILARITY_THRESHOLD = 80;

const archiveSchema = z.object({
  channel_id: z.string().uuid().optional(),
  ideas: z
    .array(
      z.object({
        idea_id: z.string().regex(/^BC-IDEA-\d{3}$/),
        title: z.string().min(5),
        core_tension: z.string().min(10),
        target_audience: z.string().min(5),
        verdict: z.enum(['viable', 'weak', 'experimental']),
        discovery_data: z.string().optional(),
      }),
    )
    .min(1),
});

export async function ideasRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /archive — Bulk archive ideas (upsert)
   */
  fastify.post('/archive', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const body = archiveSchema.parse(request.body);

      const items = body.ideas.map(i => ({
        idea_id: i.idea_id,
        title: i.title,
        core_tension: i.core_tension,
        target_audience: i.target_audience,
        verdict: i.verdict,
        discovery_data: i.discovery_data ?? '',
        channel_id: body.channel_id ?? null,
        user_id: request.userId ?? null,
      }));

      const { data, error } = await sb
        .from('idea_archives')
        .upsert(items, { onConflict: 'idea_id', ignoreDuplicates: true })
        .select();

      if (error) throw error;

      return reply.send({ data: { archived: (data ?? []).length }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /library — List ideas with filters/pagination
   */
  fastify.get('/library', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, 'http://localhost');
      const query = listIdeasQuerySchema.parse(Object.fromEntries(url.searchParams));

      const page = query.page ?? 1;
      const limit = query.limit ?? 20;

      let countQuery = sb.from('idea_archives').select('*', { count: 'exact', head: true });
      let dataQuery = sb.from('idea_archives').select('*');

      if (request.userId) {
        countQuery = countQuery.eq('user_id', request.userId);
        dataQuery = dataQuery.eq('user_id', request.userId);
      }

      if (query.verdict) {
        countQuery = countQuery.eq('verdict', query.verdict);
        dataQuery = dataQuery.eq('verdict', query.verdict);
      }

      if (query.source_type) {
        countQuery = countQuery.eq('source_type', query.source_type);
        dataQuery = dataQuery.eq('source_type', query.source_type);
      }

      if (query.is_public !== undefined) {
        countQuery = countQuery.eq('is_public', query.is_public);
        dataQuery = dataQuery.eq('is_public', query.is_public);
      }

      if (query.channel_id) {
        if (query.include_all_channels) {
          // Show ideas from this channel + orphaned (no channel) + other channels
          // Useful for Create Content page — user can pick ideas from anywhere
        } else if (query.include_orphaned) {
          // Show ideas from this channel + orphaned (no channel_id)
          countQuery = countQuery.or(`channel_id.eq.${query.channel_id},channel_id.is.null`);
          dataQuery = dataQuery.or(`channel_id.eq.${query.channel_id},channel_id.is.null`);
        } else {
          countQuery = countQuery.eq('channel_id', query.channel_id);
          dataQuery = dataQuery.eq('channel_id', query.channel_id);
        }
      }

      if (query.tags) {
        const tagArray = query.tags.split(',').map((t: string) => t.trim());
        countQuery = countQuery.overlaps('tags', tagArray);
        dataQuery = dataQuery.overlaps('tags', tagArray);
      }

      if (query.search) {
        const searchFilter = `title.ilike.%${query.search}%,core_tension.ilike.%${query.search}%,target_audience.ilike.%${query.search}%`;
        countQuery = countQuery.or(searchFilter);
        dataQuery = dataQuery.or(searchFilter);
      }

      const [{ count: total, error: countErr }, { data: ideas, error: dataErr }] =
        await Promise.all([
          countQuery,
          dataQuery
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1),
        ]);

      if (countErr) throw countErr;
      if (dataErr) throw dataErr;

      return reply.send({
        data: {
          ideas,
          pagination: {
            page,
            limit,
            total: total ?? 0,
            totalPages: Math.ceil((total ?? 0) / limit),
          },
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /library — Create idea with similarity checking + auto-generated idea_id
   */
  fastify.post('/library', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const data = createIdeaSchema.parse(request.body);

      // Check for similar existing ideas
      const { data: existingIdeas, error: fetchErr } = await sb
        .from('idea_archives')
        .select('id, title, idea_id');

      if (fetchErr) throw fetchErr;

      const warnings: SimilarityWarning[] = [];
      for (const existing of existingIdeas ?? []) {
        const similarity = calculateSimilarity(data.title, existing.title);
        if (similarity >= SIMILARITY_THRESHOLD) {
          warnings.push({
            type: 'similar',
            existing_id: existing.id,
            existing_title: existing.title,
            similarity,
          });
        }
      }

      // Generate idea_id if not provided
      let ideaId = data.idea_id;
      if (!ideaId) {
        const { count, error: countErr } = await sb
          .from('idea_archives')
          .select('*', { count: 'exact', head: true });
        if (countErr) throw countErr;
        ideaId = `BC-IDEA-${String((count ?? 0) + 1).padStart(3, '0')}`;
      }

      // Check if idea_id already exists — collision handling
      const { data: existingIdeaId } = await sb
        .from('idea_archives')
        .select('id')
        .eq('idea_id', ideaId)
        .maybeSingle();

      if (existingIdeaId) {
        const { data: allIdeas } = await sb.from('idea_archives').select('idea_id');

        const maxNum = (allIdeas ?? []).reduce((max: number, i: any) => {
          const match = i.idea_id.match(/BC-IDEA-(\d+)/);
          return match ? Math.max(max, parseInt(match[1])) : max;
        }, 0);
        ideaId = `BC-IDEA-${String(maxNum + 1).padStart(3, '0')}`;
      }

      const { data: idea, error } = await sb
        .from('idea_archives')
        .insert({
          idea_id: ideaId,
          title: data.title,
          core_tension: data.core_tension,
          target_audience: data.target_audience,
          verdict: data.verdict,
          discovery_data: data.discovery_data ?? '',
          source_type: data.source_type,
          source_project_id: data.source_project_id,
          tags: data.tags ?? [],
          is_public: data.is_public ?? true,
          markdown_content: data.markdown_content,
          channel_id: data.channel_id ?? null,
          user_id: request.userId ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      const response: { idea: typeof idea; warnings?: SimilarityWarning[] } = { idea };
      if (warnings.length > 0) {
        response.warnings = warnings;
      }

      return reply.status(201).send({ data: response, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /library/:id — Get single idea
   */
  fastify.get('/library/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: idea, error } = await sb
        .from('idea_archives')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!idea) {
        throw new ApiError(404, 'Idea not found', 'NOT_FOUND');
      }

      return reply.send({ data: { idea }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PATCH /library/:id — Update idea
   */
  fastify.patch('/library/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = updateIdeaSchema.parse(request.body);

      const { data: existing, error: findErr } = await sb
        .from('idea_archives')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Idea not found', 'NOT_FOUND');
      }

      const updateData: Record<string, unknown> = {};
      if (data.title) updateData.title = data.title;
      if (data.core_tension) updateData.core_tension = data.core_tension;
      if (data.target_audience) updateData.target_audience = data.target_audience;
      if (data.verdict) updateData.verdict = data.verdict;
      if (data.discovery_data !== undefined) updateData.discovery_data = data.discovery_data;
      if (data.tags) updateData.tags = data.tags;
      if (data.is_public !== undefined) updateData.is_public = data.is_public;
      if (data.markdown_content !== undefined) updateData.markdown_content = data.markdown_content;

      const { data: idea, error } = await sb
        .from('idea_archives')
        .update(updateData as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return reply.send({ data: { idea }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /library/:id — Delete idea
   */
  fastify.delete('/library/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: existing, error: findErr } = await sb
        .from('idea_archives')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Idea not found', 'NOT_FOUND');
      }

      const { error } = await sb.from('idea_archives').delete().eq('id', id);
      if (error) throw error;

      return reply.send({ data: { deleted: true }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
