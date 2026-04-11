/**
 * Podcasts Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import {
  createPodcastSchema,
  updatePodcastSchema,
  podcastQuerySchema,
  type TalkingPoint,
} from '@brighttale/shared/schemas/podcasts';
import {
  generatePodcastMarkdownExport,
  generatePodcastHtmlExport,
} from '../lib/exporters/podcastExporter.js';
import type { PodcastOutput } from '@brighttale/shared/types/agents';

// Calculate spoken word count from podcast fields
function calculatePodcastWordCount(data: {
  intro_hook: string;
  personal_angle?: string | null;
  outro: string;
  talking_points: TalkingPoint[];
}): number {
  return [
    data.intro_hook,
    data.personal_angle,
    data.outro,
    ...data.talking_points.map((tp) => `${tp.point} ${tp.notes}`),
  ]
    .filter(Boolean)
    .join(' ')
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

export async function podcastsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET / — List podcast drafts with filters/pagination
   */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, 'http://localhost');
      const query = podcastQuerySchema.parse(Object.fromEntries(url.searchParams));

      const { status, project_id, idea_id, search, page = 1, limit = 20 } = query;

      let countQuery = sb.from('podcast_drafts').select('*', { count: 'exact', head: true });
      let dataQuery = sb
        .from('podcast_drafts')
        .select(
          'id, episode_title, episode_description, duration_estimate, word_count, status, project_id, idea_id, created_at, updated_at',
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
      if (search) {
        countQuery = countQuery.ilike('episode_title', `%${search}%`);
        dataQuery = dataQuery.ilike('episode_title', `%${search}%`);
      }

      const [{ count: total, error: countErr }, { data: podcasts, error: dataErr }] =
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
          podcasts,
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
      request.log.error({ err: error }, 'Failed to list podcasts');
      return sendError(reply, error);
    }
  });

  /**
   * POST / — Create podcast draft
   */
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const data = createPodcastSchema.parse(request.body);

      // Calculate word count from talking_points, intro_hook, personal_angle, outro
      const wordCount =
        data.word_count ??
        calculatePodcastWordCount({
          intro_hook: data.intro_hook,
          personal_angle: data.personal_angle,
          outro: data.outro,
          talking_points: data.talking_points,
        });

      const { data: podcast, error } = await sb
        .from('podcast_drafts')
        .insert({
          episode_title: data.episode_title,
          episode_description: data.episode_description,
          intro_hook: data.intro_hook,
          talking_points_json: JSON.stringify(data.talking_points),
          personal_angle: data.personal_angle,
          guest_questions: data.guest_questions,
          outro: data.outro,
          duration_estimate: data.duration_estimate,
          word_count: wordCount,
          status: data.status,
          project_id: data.project_id,
          idea_id: data.idea_id,
          user_id: request.userId ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      return reply.status(201).send({ data: { podcast }, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create podcast');
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id — Get podcast with PodcastOutput transform
   */
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      let query = sb.from('podcast_drafts').select('*').eq('id', id);
      if (request.userId) {
        query = query.eq('user_id', request.userId);
      }

      const { data: draft, error } = await query.maybeSingle();

      if (error) throw error;

      if (!draft) {
        throw new ApiError(404, 'Podcast not found', 'NOT_FOUND');
      }

      // Transform to PodcastOutput format
      const podcastOutput: PodcastOutput = {
        episode_title: draft.episode_title,
        episode_description: draft.episode_description,
        intro_hook: draft.intro_hook,
        talking_points: JSON.parse(draft.talking_points_json),
        personal_angle: draft.personal_angle,
        guest_questions: draft.guest_questions,
        outro: draft.outro,
        duration_estimate: draft.duration_estimate ?? '',
      };

      return reply.send({
        data: {
          podcast: {
            id: draft.id,
            ...podcastOutput,
            word_count: draft.word_count,
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
      request.log.error({ err: error }, 'Failed to get podcast');
      return sendError(reply, error);
    }
  });

  /**
   * PUT /:id — Update podcast (full update)
   */
  fastify.put('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    return handlePodcastUpdate(request, reply);
  });

  /**
   * PATCH /:id — Update podcast (partial update, same logic as PUT)
   */
  fastify.patch('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    return handlePodcastUpdate(request, reply);
  });

  /**
   * DELETE /:id — Delete podcast
   */
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      // Check if podcast exists
      const { data: existing, error: findErr } = await sb
        .from('podcast_drafts')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Podcast not found', 'NOT_FOUND');
      }

      const { error } = await sb.from('podcast_drafts').delete().eq('id', id);
      if (error) throw error;

      return reply.send({ data: { deleted: true }, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete podcast');
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id/export — Export podcast in markdown/html/json format
   */
  fastify.get('/:id/export', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const url = new URL(request.url, 'http://localhost');
      const format = url.searchParams.get('format') || 'markdown';

      const { data: draft, error } = await sb
        .from('podcast_drafts')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!draft) {
        throw new ApiError(404, 'Podcast not found', 'NOT_FOUND');
      }

      // Transform to PodcastOutput format
      const podcastOutput: PodcastOutput = {
        episode_title: draft.episode_title,
        episode_description: draft.episode_description,
        intro_hook: draft.intro_hook,
        talking_points: JSON.parse(draft.talking_points_json),
        personal_angle: draft.personal_angle,
        guest_questions: draft.guest_questions,
        outro: draft.outro,
        duration_estimate: draft.duration_estimate ?? '',
      };

      const slug = draft.episode_title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      switch (format) {
        case 'html': {
          const html = generatePodcastHtmlExport(podcastOutput);
          return reply
            .header('Content-Type', 'text/html; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${slug}.html"`)
            .send(html);
        }

        case 'json': {
          return reply
            .header('Content-Disposition', `attachment; filename="${slug}.json"`)
            .send({
              id: draft.id,
              ...podcastOutput,
              word_count: draft.word_count,
              status: draft.status,
              project_id: draft.project_id,
              idea_id: draft.idea_id,
              created_at: draft.created_at,
              updated_at: draft.updated_at,
            });
        }

        case 'markdown':
        default: {
          const markdown = generatePodcastMarkdownExport(podcastOutput);
          return reply
            .header('Content-Type', 'text/markdown; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${slug}.md"`)
            .send(markdown);
        }
      }
    } catch (error) {
      request.log.error({ err: error }, 'Failed to export podcast');
      return sendError(reply, error);
    }
  });

  // Shared update handler for PUT and PATCH
  async function handlePodcastUpdate(request: any, reply: any) {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = updatePodcastSchema.parse(request.body);

      // Check if podcast exists
      const { data: existing, error: findErr } = await sb
        .from('podcast_drafts')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Podcast not found', 'NOT_FOUND');
      }

      // Build update data
      const updateData: Record<string, unknown> = {};

      if (data.episode_title !== undefined) updateData.episode_title = data.episode_title;
      if (data.episode_description !== undefined)
        updateData.episode_description = data.episode_description;
      if (data.intro_hook !== undefined) updateData.intro_hook = data.intro_hook;
      if (data.talking_points !== undefined)
        updateData.talking_points_json = JSON.stringify(data.talking_points);
      if (data.personal_angle !== undefined) updateData.personal_angle = data.personal_angle;
      if (data.guest_questions !== undefined) updateData.guest_questions = data.guest_questions;
      if (data.outro !== undefined) updateData.outro = data.outro;
      if (data.duration_estimate !== undefined) updateData.duration_estimate = data.duration_estimate;
      if (data.word_count !== undefined) updateData.word_count = data.word_count;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.project_id !== undefined) updateData.project_id = data.project_id;
      if (data.idea_id !== undefined) updateData.idea_id = data.idea_id;

      const { data: podcast, error } = await sb
        .from('podcast_drafts')
        .update(updateData as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return reply.send({ data: { podcast }, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update podcast');
      return sendError(reply, error);
    }
  }
}
