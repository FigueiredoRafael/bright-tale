/**
 * Research Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import {
  createResearchSchema,
  updateResearchSchema,
  listResearchQuerySchema,
  addSourceSchema,
} from '@brighttale/shared/schemas/research';

export async function researchRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST / — Create new research
   */
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const data = createResearchSchema.parse(request.body);

      // If idea_id is provided, embed it in the research_content JSON
      let researchContent = data.research_content;
      if (data.idea_id) {
        try {
          const parsed = JSON.parse(data.research_content);
          parsed.idea_id = data.idea_id;
          researchContent = JSON.stringify(parsed);
        } catch {
          researchContent = JSON.stringify({
            idea_id: data.idea_id,
            content: data.research_content,
          });
        }
      }

      const { data: research, error } = await sb
        .from('research_archives')
        .insert({
          title: data.title,
          theme: data.theme,
          research_content: researchContent,
          user_id: request.userId ?? null,
        })
        .select('*, sources:research_sources(*)')
        .single();

      if (error) throw error;

      return reply.status(201).send({ data: research, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET / — List research with optional filters
   */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, 'http://localhost');
      const params = listResearchQuerySchema.parse(Object.fromEntries(url.searchParams));

      const page = params.page || 1;
      const limit = params.limit || 20;
      const sortField = params.sort || 'created_at';
      const sortOrder = params.order || 'desc';

      let countQuery = sb.from('research_archives').select('*', { count: 'exact', head: true });
      let dataQuery = sb
        .from('research_archives')
        .select('*, sources:research_sources(*), projects(count)');

      // Filter by user_id when present
      if (request.userId) {
        countQuery = countQuery.eq('user_id', request.userId);
        dataQuery = dataQuery.eq('user_id', request.userId);
      }

      if (params.theme) {
        countQuery = countQuery.ilike('theme', `%${params.theme}%`);
        dataQuery = dataQuery.ilike('theme', `%${params.theme}%`);
      }

      if (params.search) {
        const searchFilter = `title.ilike.%${params.search}%,research_content.ilike.%${params.search}%`;
        countQuery = countQuery.or(searchFilter);
        dataQuery = dataQuery.or(searchFilter);
      }

      const [{ count: total, error: countErr }, { data: research, error: dataErr }] =
        await Promise.all([
          countQuery,
          dataQuery
            .order(sortField, { ascending: sortOrder === 'asc' })
            .range((page - 1) * limit, page * limit - 1),
        ]);

      if (countErr) throw countErr;
      if (dataErr) throw dataErr;

      return reply.send({
        data: {
          data: research,
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
   * GET /by-idea/:ideaId — Find research by idea ID
   * Must be registered before /:id to avoid route conflict
   */
  fastify.get('/by-idea/:ideaId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { ideaId } = request.params as { ideaId: string };

      const { data: research, error } = await sb
        .from('research_archives')
        .select('*, sources:research_sources(*), projects(count)')
        .or(
          `research_content.cs."idea_id":"${ideaId}",research_content.cs."idea_id": "${ideaId}",title.ilike.%${ideaId}%`,
        )
        .order('created_at', { ascending: false });

      if (error) throw error;

      return reply.send({
        data: {
          idea_id: ideaId,
          count: (research ?? []).length,
          research,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id — Get research details
   */
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: research, error } = await sb
        .from('research_archives')
        .select(
          '*, sources:research_sources(*, count:id), projects(id, title, status, winner, created_at)',
        )
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!research) {
        throw new ApiError(404, 'Research not found', 'NOT_FOUND');
      }

      return reply.send({ data: research, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PATCH /:id — Update research
   */
  fastify.patch('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = updateResearchSchema.parse(request.body);

      // Check if research exists
      const { data: existing, error: findErr } = await sb
        .from('research_archives')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Research not found', 'NOT_FOUND');
      }

      const updateData: Record<string, unknown> = {};
      if (data.title) updateData.title = data.title;
      if (data.theme) updateData.theme = data.theme;
      if (data.research_content) updateData.research_content = data.research_content;

      const { data: research, error } = await sb
        .from('research_archives')
        .update(updateData as any)
        .eq('id', id)
        .select('*, sources:research_sources(*)')
        .single();

      if (error) throw error;

      return reply.send({ data: research, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /:id — Delete research (check for projects using it)
   */
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      // Check if research exists and get project count
      const { data: existing, error: findErr } = await sb
        .from('research_archives')
        .select('id, projects(count)')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Research not found', 'NOT_FOUND');
      }

      // Check if research is used by any projects
      const projectCount = (existing as any).projects?.[0]?.count ?? 0;
      if (projectCount > 0) {
        throw new ApiError(
          400,
          `Cannot delete research that is used by ${projectCount} project(s)`,
          'RESEARCH_IN_USE',
        );
      }

      const { error } = await sb.from('research_archives').delete().eq('id', id);
      if (error) throw error;

      return reply.send({
        data: { success: true, message: 'Research deleted successfully' },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id/sources — List sources for a research
   */
  fastify.get('/:id/sources', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      // Check if research exists
      const { data: existing, error: findErr } = await sb
        .from('research_archives')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Research not found', 'NOT_FOUND');
      }

      const { data: sources, error } = await sb
        .from('research_sources')
        .select('*')
        .eq('research_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return reply.send({ data: sources, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /:id/sources — Add source to research
   */
  fastify.post('/:id/sources', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = addSourceSchema.parse(request.body);

      // Check if research exists
      const { data: research, error: findErr } = await sb
        .from('research_archives')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!research) {
        throw new ApiError(404, 'Research not found', 'NOT_FOUND');
      }

      const { data: source, error } = await sb
        .from('research_sources')
        .insert({
          research_id: id,
          url: data.url,
          title: data.title,
          author: data.author,
          date: data.date ? new Date(data.date).toISOString() : null,
        })
        .select()
        .single();

      if (error) throw error;

      return reply.status(201).send({ data: source, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id/sources/:sourceId — Get single source
   */
  fastify.get(
    '/:id/sources/:sourceId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const sb = createServiceClient();
        const { id, sourceId } = request.params as { id: string; sourceId: string };

        const { data: source, error } = await sb
          .from('research_sources')
          .select('*')
          .eq('id', sourceId)
          .maybeSingle();

        if (error) throw error;

        if (!source) {
          throw new ApiError(404, 'Source not found', 'NOT_FOUND');
        }

        if (source.research_id !== id) {
          throw new ApiError(400, 'Source does not belong to this research', 'INVALID_RESEARCH_ID');
        }

        return reply.send({ data: source, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * DELETE /:id/sources/:sourceId — Delete source (verify it belongs to research)
   */
  fastify.delete(
    '/:id/sources/:sourceId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const sb = createServiceClient();
        const { id, sourceId } = request.params as { id: string; sourceId: string };

        // Check if source exists and belongs to the research
        const { data: source, error: findErr } = await sb
          .from('research_sources')
          .select('*')
          .eq('id', sourceId)
          .maybeSingle();

        if (findErr) throw findErr;

        if (!source) {
          throw new ApiError(404, 'Source not found', 'NOT_FOUND');
        }

        if (source.research_id !== id) {
          throw new ApiError(
            400,
            'Source does not belong to this research',
            'INVALID_RESEARCH_ID',
          );
        }

        const { error } = await sb.from('research_sources').delete().eq('id', sourceId);
        if (error) throw error;

        return reply.send({
          data: { success: true, message: 'Source deleted successfully' },
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
