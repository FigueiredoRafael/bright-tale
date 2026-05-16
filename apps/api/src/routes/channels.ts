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
  getWordPressConfig,
  upsertWordPressConfig,
  deleteWordPressConfig,
  getWordPressCredentials,
} from '../lib/publishing/wordpress-config.js';
import {
  createChannelSchema,
  updateChannelSchema,
  listChannelsQuerySchema,
} from '@brighttale/shared/schemas/channels';
import { ensureOrgId } from '../lib/orgs.js';
import { uploadFile } from '../lib/storage.js';
import { decrypt } from '../lib/crypto.js';
import {
  resolvePublishTargets,
  type PublishTarget,
} from '../lib/pipeline/publish-target-resolver.js';
import { MEDIA, type Medium } from '@brighttale/shared/pipeline/inputs';

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

      // Derive has_wordpress by checking publish_targets for each channel.
      // We batch-query to avoid N+1: fetch all active wordpress publish_targets
      // for the channels in this page, then index by channel_id.
      const channelIds = (channels ?? []).map((c: { id: string }) => c.id);
      let wpChannelIds = new Set<string>();
      if (channelIds.length > 0) {
        const { data: ptRows } = await sb
          .from('publish_targets')
          .select('channel_id')
          .in('channel_id', channelIds)
          .eq('type', 'wordpress')
          .eq('is_active', true);
        wpChannelIds = new Set(
          (ptRows ?? [])
            .map((r) => r.channel_id)
            .filter((id): id is string => id !== null)
        );
      }

      const items = (channels ?? []).map((c: { id: string }) => {
        return { ...c, has_wordpress: wpChannelIds.has(c.id) };
      });

      reply.header('Cache-Control', 'private, max-age=60');
      return reply.send({
        data: { items, total: count, page, limit },
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
          ...(body.defaultMediaConfig !== undefined && { default_media_config_json: body.defaultMediaConfig as unknown as import('@brighttale/shared/types/database').Json }),
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
   * GET /:id/publish-targets — List publish targets for a channel.
   * Optional ?medium= (blog | video | shorts | podcast) filter.
   * Excludes credentials_encrypted from the response.
   */
  fastify.get<{ Params: { id: string }; Querystring: { medium?: string } }>(
    '/:id/publish-targets',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const sb = createServiceClient();
        if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

        const orgId = await getOrgId(request.userId);
        const { id } = request.params;
        const { medium: mediumRaw } = request.query;

        // Validate ?medium= if provided
        if (mediumRaw !== undefined && !(MEDIA as readonly string[]).includes(mediumRaw)) {
          throw new ApiError(
            400,
            `Invalid medium "${mediumRaw}". Must be one of: ${MEDIA.join(', ')}`,
            'VALIDATION_ERROR',
          );
        }

        // Verify the channel belongs to the caller's org (ownership guard)
        const { data: channel } = await sb
          .from('channels')
          .select('id')
          .eq('id', id)
          .eq('org_id', orgId)
          .single();

        if (!channel) throw new ApiError(404, 'Channel not found', 'CHANNEL_NOT_FOUND');

        // Resolved items before stripping secrets (loose type; secrets stripped below)
        let rawItems: Array<Record<string, unknown>>;

        if (mediumRaw !== undefined) {
          // Medium-filtered resolution via resolver
          const resolved: PublishTarget[] = await resolvePublishTargets(
            sb,
            id,
            orgId,
            mediumRaw as Medium,
          );
          rawItems = resolved as unknown as Array<Record<string, unknown>>;
        } else {
          // No medium filter — return all active targets for this channel/org
          const scopeFilter = `channel_id.eq.${id},and(org_id.eq.${orgId},channel_id.is.null)`;
          const { data: rows, error: rowsError } = await sb
            .from('publish_targets')
            .select(
              'id, channel_id, org_id, type, display_name, config_json, is_active, created_at, updated_at',
            )
            .or(scopeFilter)
            .eq('is_active', true);

          if (rowsError) throw rowsError;
          rawItems = (rows ?? []).map(
            (r: {
              id: string;
              channel_id: string | null;
              org_id: string | null;
              type: string;
              display_name: string;
              config_json: unknown;
              is_active: boolean;
              created_at: string;
              updated_at: string;
            }) => ({
              id: r.id,
              channelId: r.channel_id,
              orgId: r.org_id,
              type: r.type,
              displayName: r.display_name,
              configJson: r.config_json,
              isActive: r.is_active,
              createdAt: r.created_at,
              updatedAt: r.updated_at,
            }),
          );
        }

        // Explicitly strip credentials_encrypted (security: never expose ciphertext)
        const safeItems = rawItems.map((target) => {
          const t = { ...target };
          delete t['credentials_encrypted'];
          return t;
        });

        return reply.send({ data: { items: safeItems }, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

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

  /**
   * GET /:id/wordpress — Fetch WP config for channel (password masked)
   */
  fastify.get<{ Params: { id: string } }>('/:id/wordpress', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');
      const orgId = await getOrgId(request.userId);
      const { id } = request.params;

      const { data: channel } = await sb.from('channels').select('id').eq('id', id).eq('org_id', orgId).single();
      if (!channel) throw new ApiError(404, 'Channel not found', 'CHANNEL_NOT_FOUND');

      const config = await getWordPressConfig(id, sb);
      if (!config) throw new ApiError(404, 'No WordPress config on this channel', 'WP_CONFIG_NOT_FOUND');

      return reply.send({
        data: {
          id: config.id,
          site_url: config.siteUrl,
          username: config.username,
          created_at: config.createdAt,
          updated_at: config.updatedAt,
          password: '••••••••',
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /:id/wordpress — Create WP config for channel
   */
  fastify.post<{ Params: { id: string } }>('/:id/wordpress', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');
      const orgId = await getOrgId(request.userId);
      const { id } = request.params;

      const { data: channel } = await sb.from('channels').select('id').eq('id', id).eq('org_id', orgId).single();
      if (!channel) throw new ApiError(404, 'Channel not found', 'CHANNEL_NOT_FOUND');

      const body = request.body as { site_url: string; username: string; password: string };
      if (!body.site_url || !body.username || !body.password) {
        throw new ApiError(400, 'site_url, username, and password are required', 'VALIDATION_ERROR');
      }

      await upsertWordPressConfig(id, { siteUrl: body.site_url, username: body.username, password: body.password }, sb);

      const config = await getWordPressConfig(id, sb);
      if (!config) throw new ApiError(500, 'WordPress config not found after write', 'INTERNAL_ERROR');

      return reply.status(201).send({
        data: {
          id: config.id,
          site_url: config.siteUrl,
          username: config.username,
          created_at: config.createdAt,
          updated_at: config.updatedAt,
          password: '••••••••',
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PUT /:id/wordpress — Partial update WP config
   */
  fastify.put<{ Params: { id: string } }>('/:id/wordpress', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');
      const orgId = await getOrgId(request.userId);
      const { id } = request.params;

      const { data: channel } = await sb.from('channels').select('id').eq('id', id).eq('org_id', orgId).single();
      if (!channel) throw new ApiError(404, 'Channel not found', 'CHANNEL_NOT_FOUND');

      const body = request.body as { site_url?: string; username?: string; password?: string };

      const existing = await getWordPressConfig(id, sb);
      if (!existing) throw new ApiError(404, 'No WordPress config on this channel', 'WP_CONFIG_NOT_FOUND');

      // Merge partial updates on top of current config, then upsert both tables
      await upsertWordPressConfig(id, {
        siteUrl: body.site_url ?? existing.siteUrl,
        username: body.username ?? existing.username,
        // If password not supplied, re-use the existing encrypted value as plaintext won't be
        // available — caller must supply password to change it; otherwise it's preserved via
        // a fresh read-then-write in upsertWordPressConfig which encrypts whatever is passed.
        // We pass a sentinel flag: when password is absent we preserve the stored encrypted value.
        password: body.password ?? decrypt(existing.credentialsEncrypted),
      }, sb);

      const updated = await getWordPressConfig(id, sb);
      if (!updated) throw new ApiError(500, 'WordPress config not found after update', 'INTERNAL_ERROR');

      return reply.send({
        data: {
          id: updated.id,
          site_url: updated.siteUrl,
          username: updated.username,
          created_at: updated.createdAt,
          updated_at: updated.updatedAt,
          password: '••••••••',
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /:id/wordpress — Remove WP config
   */
  fastify.delete<{ Params: { id: string } }>('/:id/wordpress', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');
      const orgId = await getOrgId(request.userId);
      const { id } = request.params;

      const { data: channel } = await sb.from('channels').select('id').eq('id', id).eq('org_id', orgId).single();
      if (!channel) throw new ApiError(404, 'Channel not found', 'CHANNEL_NOT_FOUND');

      await deleteWordPressConfig(id, sb);

      return reply.send({ data: { deleted: true }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /:id/wordpress/test — Test WP connection
   */
  fastify.post<{ Params: { id: string } }>('/:id/wordpress/test', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');
      const orgId = await getOrgId(request.userId);
      const { id } = request.params;

      const { data: channel } = await sb.from('channels').select('id').eq('id', id).eq('org_id', orgId).single();
      if (!channel) throw new ApiError(404, 'Channel not found', 'CHANNEL_NOT_FOUND');

      const creds = await getWordPressCredentials(id, sb);
      if (!creds) throw new ApiError(404, 'No WordPress config on this channel', 'WP_CONFIG_NOT_FOUND');

      const auth = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
      try {
        const res = await fetch(`${creds.siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/users/me`, {
          headers: { Authorization: `Basic ${auth}` },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          return reply.send({ data: { ok: true, message: 'Connection successful' }, error: null });
        }
        return reply.send({ data: { ok: false, message: `WordPress returned ${res.status}` }, error: null });
      } catch {
        return reply.send({ data: { ok: false, message: 'Could not reach WordPress site' }, error: null });
      }
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
