/**
 * Shorts Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '@/middleware/authenticate';
import { createServiceClient } from '@/lib/supabase';
import { sendError } from '@/lib/api/fastify-errors';
import { ApiError } from '@/lib/api/errors';
import {
  createShortsSchema,
  updateShortsSchema,
  shortsQuerySchema,
} from '@brighttale/shared/schemas/shorts';
import {
  generateShortsMarkdownExport,
  generateShortsHtmlExport,
} from '@/lib/exporters/shortsExporter';
import type { ShortOutput } from '@brighttale/shared/types/agents';

export async function shortsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET / — List shorts drafts with filters/pagination
   */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, 'http://localhost');
      const query = shortsQuerySchema.parse(Object.fromEntries(url.searchParams));

      const { status, project_id, idea_id, page = 1, limit = 20 } = query;

      let countQuery = sb.from('shorts_drafts').select('*', { count: 'exact', head: true });
      let dataQuery = sb
        .from('shorts_drafts')
        .select(
          'id, short_count, total_duration, status, project_id, idea_id, created_at, updated_at',
        );

      // Filter by user_id when present
      if (request.userId) {
        countQuery = countQuery.eq('user_id', request.userId);
        dataQuery = dataQuery.eq('user_id', request.userId);
      }

      if (status) {
        countQuery = countQuery.eq('status', status);
        dataQuery = dataQuery.eq('status', status);
      }
      if (project_id) {
        countQuery = countQuery.eq('project_id', project_id);
        dataQuery = dataQuery.eq('project_id', project_id);
      }
      if (idea_id) {
        countQuery = countQuery.eq('idea_id', idea_id);
        dataQuery = dataQuery.eq('idea_id', idea_id);
      }

      const [{ count: total, error: countErr }, { data: shorts, error: dataErr }] =
        await Promise.all([
          countQuery,
          dataQuery
            .order('updated_at', { ascending: false })
            .range((page - 1) * limit!, page * limit! - 1),
        ]);

      if (countErr) throw countErr;
      if (dataErr) throw dataErr;

      return reply.send({
        data: {
          shorts,
          pagination: {
            page,
            limit,
            total: total ?? 0,
            total_pages: Math.ceil((total ?? 0) / limit!),
          },
        },
        error: null,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list shorts');
      return sendError(reply, error);
    }
  });

  /**
   * POST / — Create shorts draft
   */
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const data = createShortsSchema.parse(request.body);

      const { data: shorts, error } = await sb
        .from('shorts_drafts')
        .insert({
          shorts_json: JSON.stringify(data.shorts),
          short_count: data.shorts.length,
          total_duration: data.total_duration,
          status: data.status,
          project_id: data.project_id,
          idea_id: data.idea_id,
          user_id: request.userId ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      return reply.status(201).send({ data: { shorts }, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create shorts');
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id — Get shorts with ShortOutput transform
   */
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      let query = sb.from('shorts_drafts').select('*').eq('id', id);
      if (request.userId) {
        query = query.eq('user_id', request.userId);
      }

      const { data: draft, error } = await query.maybeSingle();

      if (error) throw error;

      if (!draft) {
        throw new ApiError(404, 'Shorts not found', 'NOT_FOUND');
      }

      const shorts: ShortOutput[] = JSON.parse(draft.shorts_json);

      return reply.send({
        data: {
          shorts: {
            id: draft.id,
            shorts,
            short_count: draft.short_count,
            total_duration: draft.total_duration,
            status: draft.status,
            project_id: draft.project_id,
            idea_id: draft.idea_id,
            created_at: draft.created_at,
            updated_at: draft.updated_at,
          },
        },
        error: null,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get shorts');
      return sendError(reply, error);
    }
  });

  /**
   * PUT /:id — Update shorts (full update)
   */
  fastify.put('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    return handleShortsUpdate(request, reply);
  });

  /**
   * PATCH /:id — Update shorts (partial update, same logic as PUT)
   */
  fastify.patch('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    return handleShortsUpdate(request, reply);
  });

  /**
   * DELETE /:id — Delete shorts
   */
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      // Check if shorts exists
      const { data: existing, error: findErr } = await sb
        .from('shorts_drafts')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Shorts not found', 'NOT_FOUND');
      }

      const { error } = await sb.from('shorts_drafts').delete().eq('id', id);
      if (error) throw error;

      return reply.send({ data: { deleted: true }, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete shorts');
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id/export — Export shorts in markdown/html/json format
   */
  fastify.get('/:id/export', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const url = new URL(request.url, 'http://localhost');
      const format = url.searchParams.get('format') || 'markdown';

      const { data: draft, error } = await sb
        .from('shorts_drafts')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!draft) {
        throw new ApiError(404, 'Shorts not found', 'NOT_FOUND');
      }

      const shorts: ShortOutput[] = JSON.parse(draft.shorts_json);

      switch (format) {
        case 'html': {
          const html = generateShortsHtmlExport(shorts);
          return reply
            .header('Content-Type', 'text/html; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="shorts-${id}.html"`)
            .send(html);
        }

        case 'json': {
          return reply
            .header('Content-Disposition', `attachment; filename="shorts-${id}.json"`)
            .send({
              id: draft.id,
              shorts,
              short_count: draft.short_count,
              status: draft.status,
              project_id: draft.project_id,
              idea_id: draft.idea_id,
              created_at: draft.created_at,
              updated_at: draft.updated_at,
            });
        }

        case 'markdown':
        default: {
          const markdown = generateShortsMarkdownExport(shorts);
          return reply
            .header('Content-Type', 'text/markdown; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="shorts-${id}.md"`)
            .send(markdown);
        }
      }
    } catch (error) {
      request.log.error({ err: error }, 'Failed to export shorts');
      return sendError(reply, error);
    }
  });

  // Shared update handler for PUT and PATCH
  async function handleShortsUpdate(request: any, reply: any) {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = updateShortsSchema.parse(request.body);

      // Check if shorts exists
      const { data: existing, error: findErr } = await sb
        .from('shorts_drafts')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Shorts not found', 'NOT_FOUND');
      }

      // Build update data
      const updateData: Record<string, unknown> = {};

      if (data.shorts !== undefined) {
        updateData.shorts_json = JSON.stringify(data.shorts);
        updateData.short_count = data.shorts.length;
      }
      if (data.total_duration !== undefined) updateData.total_duration = data.total_duration;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.project_id !== undefined) updateData.project_id = data.project_id;
      if (data.idea_id !== undefined) updateData.idea_id = data.idea_id;

      const { data: shorts, error } = await sb
        .from('shorts_drafts')
        .update(updateData as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return reply.send({ data: { shorts }, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update shorts');
      return sendError(reply, error);
    }
  }
}
