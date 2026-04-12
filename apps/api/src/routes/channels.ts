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

      const orgId = await getOrgId(request.userId);
      const body = createChannelSchema.parse(request.body);

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
          channel_type: body.channelType,
          is_evergreen: body.isEvergreen,
          youtube_url: body.youtubeUrl ?? null,
          blog_url: body.blogUrl ?? null,
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
          ...(body.isEvergreen !== undefined && { is_evergreen: body.isEvergreen }),
          ...(body.youtubeUrl !== undefined && { youtube_url: body.youtubeUrl }),
          ...(body.blogUrl !== undefined && { blog_url: body.blogUrl }),
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
