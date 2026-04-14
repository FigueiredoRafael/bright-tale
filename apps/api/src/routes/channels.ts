/**
 * Channels Fastify Route Plugin
 * F2-002: CRUD for content channels
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import {
  createChannelSchema,
  updateChannelSchema,
  listChannelsQuerySchema,
} from '@brighttale/shared/schemas/channels';
import { ensureOrgId } from '../lib/orgs.js';
import { uploadFile } from '../lib/storage.js';

/** Helper: get user's org_id */
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

export async function channelsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET / — List channels for current user's org
   */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const orgId = await getOrgId(request.userId);
      const url = new URL(request.url, 'http://localhost');
      const params = listChannelsQuerySchema.parse(Object.fromEntries(url.searchParams));

      const page = params.page;
      const limit = params.limit;
      const offset = (page - 1) * limit;

      const { data: channels, error, count } = await sb
        .from('channels')
        .select('*', { count: 'exact' })
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      reply.header('Cache-Control', 'private, max-age=60');
      return reply.send({
        data: { items: channels, total: count, page, limit },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST / — Create a new channel
   */
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      // Use ensureOrgId: creates org if legacy user doesn't have one
      const orgId = await ensureOrgId(request.userId);
      const body = createChannelSchema.parse(request.body);

      // Derive legacy channel_type from media_types + video_style for backward compat
      const hasBlog = body.mediaTypes.includes('blog');
      const hasVideo = body.mediaTypes.includes('video');
      const legacyType =
        hasBlog && hasVideo ? 'hybrid' :
        hasVideo && body.videoStyle ? body.videoStyle :
        hasVideo ? 'face' :
        'text';

      const { data: channel, error } = await sb
        .from('channels')
        .insert({
          org_id: orgId,
          user_id: request.userId,
          name: body.name,
          niche: body.niche ?? null,
          niche_tags: body.nicheTags ?? null,
          market: body.market,
          language: body.language,
          channel_type: body.channelType ?? legacyType,
          media_types: body.mediaTypes,
          video_style: body.videoStyle ?? null,
          is_evergreen: body.isEvergreen,
          youtube_url: body.youtubeUrl ?? null,
          blog_url: body.blogUrl ?? null,
          logo_url: body.logoUrl ?? null,
          voice_provider: body.voiceProvider ?? null,
          voice_id: body.voiceId ?? null,
          voice_speed: body.voiceSpeed ?? 1.0,
          model_tier: body.modelTier,
          tone: body.tone ?? null,
          template_id: body.templateId ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      return reply.status(201).send({ data: channel, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id — Get channel detail
   */
  fastify.get<{ Params: { id: string } }>('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const orgId = await getOrgId(request.userId);
      const { id } = request.params;

      const { data: channel, error } = await sb
        .from('channels')
        .select('*')
        .eq('id', id)
        .eq('org_id', orgId)
        .single();

      if (error || !channel) throw new ApiError(404, 'Channel not found', 'NOT_FOUND');

      return reply.send({ data: channel, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PUT /:id — Update channel config
   */
  fastify.put<{ Params: { id: string } }>('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const orgId = await getOrgId(request.userId);
      const { id } = request.params;
      const body = updateChannelSchema.parse(request.body);

      const { data: channel, error } = await sb
        .from('channels')
        .update({
          ...(body.name !== undefined && { name: body.name }),
          ...(body.niche !== undefined && { niche: body.niche }),
          ...(body.nicheTags !== undefined && { niche_tags: body.nicheTags }),
          ...(body.market !== undefined && { market: body.market }),
          ...(body.language !== undefined && { language: body.language }),
          ...(body.channelType !== undefined && { channel_type: body.channelType }),
          ...(body.mediaTypes !== undefined && { media_types: body.mediaTypes }),
          ...(body.videoStyle !== undefined && { video_style: body.videoStyle }),
          ...(body.isEvergreen !== undefined && { is_evergreen: body.isEvergreen }),
          ...(body.youtubeUrl !== undefined && { youtube_url: body.youtubeUrl }),
          ...(body.blogUrl !== undefined && { blog_url: body.blogUrl }),
          ...(body.logoUrl !== undefined && { logo_url: body.logoUrl }),
          ...(body.voiceProvider !== undefined && { voice_provider: body.voiceProvider }),
          ...(body.voiceId !== undefined && { voice_id: body.voiceId }),
          ...(body.voiceSpeed !== undefined && { voice_speed: body.voiceSpeed }),
          ...(body.modelTier !== undefined && { model_tier: body.modelTier }),
          ...(body.tone !== undefined && { tone: body.tone }),
          ...(body.templateId !== undefined && { template_id: body.templateId }),
        })
        .eq('id', id)
        .eq('org_id', orgId)
        .select()
        .single();

      if (error) throw error;
      if (!channel) throw new ApiError(404, 'Channel not found', 'NOT_FOUND');

      return reply.send({ data: channel, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /:id/logo — Upload a logo for the channel.
   * Body: { filename: string, contentType: string, dataBase64: string }
   * Returns: { url: string } (public CDN URL)
   */
  fastify.post<{ Params: { id: string } }>('/:id/logo', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const orgId = await ensureOrgId(request.userId);
      const { id } = request.params;

      const { filename, contentType, dataBase64 } = request.body as {
        filename: string;
        contentType: string;
        dataBase64: string;
      };

      if (!filename || !contentType || !dataBase64) {
        throw new ApiError(400, 'filename, contentType, and dataBase64 are required', 'VALIDATION_ERROR');
      }

      if (!contentType.startsWith('image/')) {
        throw new ApiError(400, 'Only images are allowed for channel logos', 'VALIDATION_ERROR');
      }

      const buffer = Buffer.from(dataBase64, 'base64');
      if (buffer.byteLength > 5 * 1024 * 1024) {
        throw new ApiError(413, 'Logo must be under 5MB', 'TOO_LARGE');
      }

      // Verify the channel belongs to the org
      const { data: existing } = await sb
        .from('channels')
        .select('id')
        .eq('id', id)
        .eq('org_id', orgId)
        .single();

      if (!existing) throw new ApiError(404, 'Channel not found', 'NOT_FOUND');

      // Upload to thumbnails (public bucket) with unique name
      const ext = filename.split('.').pop()?.toLowerCase() ?? 'png';
      const ts = Date.now();
      const path = `channels/${id}/logo-${ts}.${ext}`;

      const result = await uploadFile({
        bucket: 'thumbnails',
        orgId,
        path,
        file: buffer,
        contentType,
        upsert: true,
      });

      const url = result.publicUrl ?? result.signedUrl;
      if (!url) throw new ApiError(500, 'Failed to get logo URL', 'UPLOAD_FAILED');

      // Persist on channel
      await sb.from('channels').update({ logo_url: url }).eq('id', id).eq('org_id', orgId);

      return reply.send({ data: { url }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /:id — Delete a channel
   */
  fastify.delete<{ Params: { id: string } }>('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const orgId = await getOrgId(request.userId);
      const { id } = request.params;

      const { error } = await sb
        .from('channels')
        .delete()
        .eq('id', id)
        .eq('org_id', orgId);

      if (error) throw error;

      return reply.send({ data: { deleted: true }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
