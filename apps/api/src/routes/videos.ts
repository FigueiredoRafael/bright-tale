/**
 * Videos Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '@/middleware/authenticate';
import { createServiceClient } from '@/lib/supabase';
import { sendError } from '@/lib/api/fastify-errors';
import { ApiError } from '@/lib/api/errors';
import {
  createVideoSchema,
  updateVideoSchema,
  videoQuerySchema,
} from '@brighttale/shared/schemas/videos';
import {
  generateVideoMarkdownExport,
  generateVideoHtmlExport,
  generateTeleprompterExport,
} from '@/lib/exporters/videoExporter';
import type { VideoOutput } from '@brighttale/shared/types/agents';
import type { CreateVideoInput } from '@brighttale/shared/schemas/videos';

// Calculate spoken word count from script sections
function calculateVideoWordCount(script: CreateVideoInput['script']): number {
  const { hook, problem, teaser, chapters, affiliate_segment, outro } = script;
  const sections = [
    hook?.content,
    problem?.content,
    teaser?.content,
    ...(chapters?.map((c) => c.content) ?? []),
    affiliate_segment?.script,
    outro?.recap,
    outro?.cta,
  ].filter(Boolean);
  return sections
    .join(' ')
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

export async function videosRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET / — List video drafts with filters/pagination
   */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, 'http://localhost');
      const query = videoQuerySchema.parse(Object.fromEntries(url.searchParams));

      const { status, project_id, idea_id, search, page = 1, limit = 20 } = query;

      let countQuery = sb.from('video_drafts').select('*', { count: 'exact', head: true });
      let dataQuery = sb
        .from('video_drafts')
        .select(
          'id, title, title_options, total_duration_estimate, word_count, status, project_id, idea_id, created_at, updated_at',
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
        countQuery = countQuery.ilike('title', `%${search}%`);
        dataQuery = dataQuery.ilike('title', `%${search}%`);
      }

      const [{ count: total, error: countErr }, { data: videos, error: dataErr }] =
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
          videos,
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
      request.log.error({ err: error }, 'Failed to list videos');
      return sendError(reply, error);
    }
  });

  /**
   * POST / — Create video draft
   */
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const data = createVideoSchema.parse(request.body);

      // Calculate spoken word count from script sections
      const wordCount = data.word_count ?? calculateVideoWordCount(data.script);

      const { data: video, error } = await sb
        .from('video_drafts')
        .insert({
          title: data.title,
          title_options: data.title_options,
          thumbnail_json: data.thumbnail ? JSON.stringify(data.thumbnail) : null,
          script_json: JSON.stringify(data.script),
          total_duration_estimate: data.total_duration_estimate,
          word_count: wordCount,
          status: data.status,
          project_id: data.project_id,
          idea_id: data.idea_id,
          user_id: request.userId ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      return reply.status(201).send({ data: { video }, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create video');
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id — Get video with VideoOutput transform
   */
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      let query = sb.from('video_drafts').select('*').eq('id', id);
      if (request.userId) {
        query = query.eq('user_id', request.userId);
      }

      const { data: video, error } = await query.maybeSingle();

      if (error) throw error;

      if (!video) {
        throw new ApiError(404, 'Video not found', 'NOT_FOUND');
      }

      // Transform to VideoOutput format
      const videoOutput: VideoOutput = {
        title_options: video.title_options,
        thumbnail: video.thumbnail_json ? JSON.parse(video.thumbnail_json) : undefined,
        script: video.script_json ? JSON.parse(video.script_json) : undefined,
        total_duration_estimate: video.total_duration_estimate ?? '',
      };

      return reply.send({
        data: {
          video: {
            id: video.id,
            title: video.title,
            ...videoOutput,
            word_count: video.word_count,
            status: video.status,
            project_id: video.project_id,
            idea_id: video.idea_id,
            created_at: video.created_at,
            updated_at: video.updated_at,
          },
        },
        error: null,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get video');
      return sendError(reply, error);
    }
  });

  /**
   * PUT /:id — Update video (full update)
   */
  fastify.put('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    return handleVideoUpdate(request, reply);
  });

  /**
   * PATCH /:id — Update video (partial update, same logic as PUT)
   */
  fastify.patch('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    return handleVideoUpdate(request, reply);
  });

  /**
   * DELETE /:id — Delete video
   */
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      // Check if video exists
      const { data: existing, error: findErr } = await sb
        .from('video_drafts')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Video not found', 'NOT_FOUND');
      }

      const { error } = await sb.from('video_drafts').delete().eq('id', id);
      if (error) throw error;

      return reply.send({ data: { deleted: true }, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete video');
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id/export — Export video in markdown/html/teleprompter/json format
   */
  fastify.get('/:id/export', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const url = new URL(request.url, 'http://localhost');
      const format = url.searchParams.get('format') || 'markdown';

      const { data: video, error } = await sb
        .from('video_drafts')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!video) {
        throw new ApiError(404, 'Video not found', 'NOT_FOUND');
      }

      // Transform to VideoOutput format
      const videoOutput: VideoOutput = {
        title_options: video.title_options,
        thumbnail: video.thumbnail_json ? JSON.parse(video.thumbnail_json) : undefined,
        script: video.script_json ? JSON.parse(video.script_json) : undefined,
        total_duration_estimate: video.total_duration_estimate ?? '',
      };

      const slug = video.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      switch (format) {
        case 'html': {
          const html = generateVideoHtmlExport(videoOutput, video.title);
          return reply
            .header('Content-Type', 'text/html; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${slug}-script.html"`)
            .send(html);
        }

        case 'teleprompter': {
          const text = generateTeleprompterExport(videoOutput, video.title);
          return reply
            .header('Content-Type', 'text/plain; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${slug}-teleprompter.txt"`)
            .send(text);
        }

        case 'json': {
          return reply
            .header('Content-Disposition', `attachment; filename="${slug}.json"`)
            .send({
              id: video.id,
              title: video.title,
              ...videoOutput,
              word_count: video.word_count,
              status: video.status,
              project_id: video.project_id,
              idea_id: video.idea_id,
              created_at: video.created_at,
              updated_at: video.updated_at,
            });
        }

        case 'markdown':
        default: {
          const markdown = generateVideoMarkdownExport(videoOutput, video.title);
          return reply
            .header('Content-Type', 'text/markdown; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="${slug}-script.md"`)
            .send(markdown);
        }
      }
    } catch (error) {
      request.log.error({ err: error }, 'Failed to export video');
      return sendError(reply, error);
    }
  });

  // Shared update handler for PUT and PATCH
  async function handleVideoUpdate(request: any, reply: any) {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = updateVideoSchema.parse(request.body);

      // Check if video exists
      const { data: existing, error: findErr } = await sb
        .from('video_drafts')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Video not found', 'NOT_FOUND');
      }

      // Build update data
      const updateData: Record<string, unknown> = {};

      if (data.title !== undefined) updateData.title = data.title;
      if (data.title_options !== undefined) updateData.title_options = data.title_options;
      if (data.thumbnail !== undefined) updateData.thumbnail_json = JSON.stringify(data.thumbnail);
      if (data.script !== undefined) updateData.script_json = JSON.stringify(data.script);
      if (data.total_duration_estimate !== undefined)
        updateData.total_duration_estimate = data.total_duration_estimate;
      if (data.word_count !== undefined) updateData.word_count = data.word_count;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.project_id !== undefined) updateData.project_id = data.project_id;
      if (data.idea_id !== undefined) updateData.idea_id = data.idea_id;

      const { data: video, error } = await sb
        .from('video_drafts')
        .update(updateData as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return reply.send({ data: { video }, error: null });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update video');
      return sendError(reply, error);
    }
  }
}
