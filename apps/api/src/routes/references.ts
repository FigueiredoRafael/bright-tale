/**
 * Reference Modeling Fastify Route Plugin
 * F2-008: Manage channel references and analyze their content
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { getChannelByUrl, searchVideos, getVideoDetails, parseDuration } from '../lib/youtube/client.js';

const PLAN_REFERENCE_LIMITS: Record<string, number> = {
  free: 0,
  starter: 2,
  creator: 5,
  pro: 10,
};

/** Helper: get user's org_id + plan */
async function getOrgContext(userId: string) {
  const sb = createServiceClient();
  const { data: membership } = await sb
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!membership) throw new ApiError(404, 'No organization found', 'NOT_FOUND');

  const { data: org } = await sb
    .from('organizations')
    .select('plan')
    .eq('id', membership.org_id)
    .single();

  return { orgId: membership.org_id, plan: org?.plan ?? 'free' };
}

export async function referencesRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /channels/:channelId/references — Add a reference
   */
  fastify.post<{ Params: { channelId: string } }>('/:channelId/references', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const { channelId } = request.params;
      const { url } = request.body as { url: string };
      if (!url) throw new ApiError(400, 'url is required', 'VALIDATION_ERROR');

      const { orgId, plan } = await getOrgContext(request.userId);

      // Check plan limit
      const limit = PLAN_REFERENCE_LIMITS[plan] ?? 0;
      const { count } = await sb
        .from('channel_references')
        .select('*', { count: 'exact', head: true })
        .eq('channel_id', channelId);

      if ((count ?? 0) >= limit) {
        throw new ApiError(403, `Your plan allows ${limit} references. Upgrade for more.`, 'PLAN_LIMIT');
      }

      // Try to resolve YouTube channel info
      let name: string | null = null;
      let externalId: string | null = null;
      let subscribers: number | null = null;

      const channel = await getChannelByUrl(url).catch(() => null);
      if (channel) {
        name = channel.snippet.title;
        externalId = channel.id;
        subscribers = parseInt(channel.statistics.subscriberCount, 10);
      }

      const { data: ref, error } = await sb
        .from('channel_references')
        .insert({
          channel_id: channelId,
          org_id: orgId,
          url,
          platform: url.includes('youtube') ? 'youtube' : 'blog',
          name,
          external_id: externalId,
          subscribers,
        })
        .select()
        .single();

      if (error) throw error;

      return reply.status(201).send({ data: ref, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /channels/:channelId/references — List references
   */
  fastify.get<{ Params: { channelId: string } }>('/:channelId/references', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const { channelId } = request.params;
      const { orgId, plan } = await getOrgContext(request.userId);

      const { data: refs, error } = await sb
        .from('channel_references')
        .select('*')
        .eq('channel_id', channelId)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const limit = PLAN_REFERENCE_LIMITS[plan] ?? 0;

      return reply.send({
        data: { references: refs, limit, used: refs?.length ?? 0 },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /channels/:channelId/references/:refId — Remove a reference
   */
  fastify.delete<{ Params: { channelId: string; refId: string } }>('/:channelId/references/:refId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const { orgId } = await getOrgContext(request.userId);

      const { error } = await sb
        .from('channel_references')
        .delete()
        .eq('id', request.params.refId)
        .eq('org_id', orgId);

      if (error) throw error;

      return reply.send({ data: { deleted: true }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /channels/:channelId/references/top-videos — Top videos across all references
   * Returns videos sorted by engagement (views desc).
   */
  fastify.get<{ Params: { channelId: string }; Querystring: { limit?: string } }>(
    '/:channelId/references/top-videos',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const sb = createServiceClient();
        if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

        const { orgId } = await getOrgContext(request.userId);
        const { channelId } = request.params;
        const limit = Math.min(parseInt(request.query.limit ?? '20', 10), 50);

        // Get reference IDs for this channel (scoped by org)
        const { data: refs } = await sb
          .from('channel_references')
          .select('id, name, url, external_id, platform')
          .eq('channel_id', channelId)
          .eq('org_id', orgId);

        if (!refs || refs.length === 0) {
          return reply.send({ data: { videos: [] }, error: null });
        }

        const refIds = refs.map((r) => r.id);
        const refMap = new Map(refs.map((r) => [r.id, r]));

        // Fetch top videos across all references
        const { data: videos, error } = await sb
          .from('reference_content')
          .select('*')
          .in('reference_id', refIds)
          .order('view_count', { ascending: false })
          .limit(limit);

        if (error) throw error;

        const enriched = (videos ?? []).map((v) => {
          const ref = refMap.get(v.reference_id);
          return {
            id: v.id,
            title: v.title,
            url: v.url,
            thumbnail: null,
            videoId: v.external_id,
            views: v.view_count ?? 0,
            likes: v.like_count ?? 0,
            comments: v.comment_count ?? 0,
            duration: v.duration_seconds ?? 0,
            engagementRate: v.engagement_rate ?? 0,
            publishedAt: v.published_at,
            referenceName: ref?.name ?? null,
            referenceUrl: ref?.url ?? null,
          };
        });

        return reply.send({ data: { videos: enriched }, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * POST /channels/:channelId/references/analyze — Analyze all references
   * Fetches top videos from each reference and stores them.
   */
  fastify.post<{ Params: { channelId: string } }>('/:channelId/references/analyze', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const { orgId } = await getOrgContext(request.userId);
      const { channelId } = request.params;

      // Get all references for this channel
      const { data: refs } = await sb
        .from('channel_references')
        .select('*')
        .eq('channel_id', channelId)
        .eq('org_id', orgId);

      if (!refs || refs.length === 0) {
        throw new ApiError(400, 'No references to analyze', 'NO_REFERENCES');
      }

      const results = [];

      for (const ref of refs) {
        if (!ref.external_id || ref.platform !== 'youtube') continue;

        // Search for top videos from this channel
        const videos = await searchVideos(`channel:${ref.external_id}`, {
          maxResults: 10,
          order: 'viewCount',
        });

        const videoIds = videos.map((v) => v.id.videoId);
        const details = await getVideoDetails(videoIds);

        // Store reference content
        for (const v of details) {
          await sb.from('reference_content').upsert({
            reference_id: ref.id,
            external_id: v.id,
            title: v.snippet.title,
            url: `https://youtube.com/watch?v=${v.id}`,
            published_at: v.snippet.publishedAt,
            view_count: parseInt(v.statistics.viewCount, 10),
            like_count: parseInt(v.statistics.likeCount, 10),
            comment_count: parseInt(v.statistics.commentCount, 10),
            duration_seconds: parseDuration(v.contentDetails.duration),
            description: v.snippet.description,
            tags: v.snippet.tags ?? [],
            engagement_rate: parseInt(v.statistics.viewCount, 10) > 0
              ? ((parseInt(v.statistics.likeCount, 10) + parseInt(v.statistics.commentCount, 10)) / parseInt(v.statistics.viewCount, 10)) * 100
              : 0,
          }, { onConflict: 'id' });
        }

        // Update reference analysis timestamp
        await sb
          .from('channel_references')
          .update({ analyzed_at: new Date().toISOString() })
          .eq('id', ref.id);

        results.push({ referenceId: ref.id, name: ref.name, videosAnalyzed: details.length });
      }

      return reply.send({ data: { results }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
