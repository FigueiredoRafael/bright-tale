/**
 * YouTube Intelligence Fastify Route Plugin
 * F2-006: Niche analysis + channel analysis
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import {
  getChannelByUrl,
  searchVideos,
  getVideoDetails,
  parseDuration,
} from '../lib/youtube/client.js';
import { checkCredits, debitCredits } from '../lib/credits.js';

const NICHE_ANALYSIS_COST = 150;

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

export async function youtubeRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /analyze-channel — Analyze a YouTube channel by URL
   */
  fastify.post('/analyze-channel', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const { url } = request.body as { url: string };
      if (!url) throw new ApiError(400, 'url is required', 'VALIDATION_ERROR');

      const channel = await getChannelByUrl(url);
      if (!channel) throw new ApiError(404, 'Channel not found', 'NOT_FOUND');

      return reply.send({
        data: {
          id: channel.id,
          title: channel.snippet.title,
          description: channel.snippet.description,
          customUrl: channel.snippet.customUrl,
          thumbnail: channel.snippet.thumbnails.medium.url,
          country: channel.snippet.country,
          subscribers: parseInt(channel.statistics.subscriberCount, 10),
          totalViews: parseInt(channel.statistics.viewCount, 10),
          videoCount: parseInt(channel.statistics.videoCount, 10),
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /analyze-niche — Full niche analysis with YouTube Intelligence
   * Costs 150 credits.
   */
  fastify.post('/analyze-niche', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.userId) throw new ApiError(401, 'User not authenticated', 'UNAUTHORIZED');

      const { keyword, market, language, channelId } = request.body as {
        keyword: string;
        market?: string;
        language?: string;
        channelId?: string;
      };
      if (!keyword) throw new ApiError(400, 'keyword is required', 'VALIDATION_ERROR');

      const orgId = await getOrgId(request.userId);
      const sb = createServiceClient();

      // Check cache (7-day TTL)
      const { data: cached } = await sb
        .from('youtube_niche_analyses')
        .select('*')
        .eq('org_id', orgId)
        .eq('niche', keyword)
        .eq('market', market ?? 'br')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cached) {
        return reply.send({ data: cached, error: null });
      }

      // Check credits
      await checkCredits(orgId, request.userId, NICHE_ANALYSIS_COST);

      // Search top videos for this niche
      const regionCode = market === 'us' ? 'US' : market === 'uk' ? 'GB' : 'BR';
      const relevanceLang = language?.split('-')[0] ?? 'pt';

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const searchResults = await searchVideos(keyword, {
        maxResults: 20,
        regionCode,
        relevanceLanguage: relevanceLang,
        publishedAfter: thirtyDaysAgo,
        order: 'viewCount',
      });

      // Get detailed video info
      const videoIds = searchResults.map((r) => r.id.videoId);
      const videoDetails = await getVideoDetails(videoIds);

      // Build top videos data
      const safeInt = (s: string | undefined): number => {
        const n = parseInt(s ?? '0', 10);
        return Number.isNaN(n) ? 0 : n;
      };

      const topVideos = videoDetails.map((v) => {
        const views = safeInt(v.statistics?.viewCount);
        const likes = safeInt(v.statistics?.likeCount);
        const comments = safeInt(v.statistics?.commentCount);
        return {
          title: v.snippet.title,
          videoId: v.id,
          channelTitle: v.snippet.channelTitle,
          views,
          likes,
          comments,
          duration: parseDuration(v.contentDetails?.duration ?? ''),
          publishedAt: v.snippet.publishedAt,
          thumbnail: v.snippet.thumbnails?.medium?.url ?? null,
          engagementRate: views > 0 ? ((likes + comments) / views) * 100 : 0,
        };
      }).sort((a, b) => b.views - a.views);

      // Save analysis
      const { data: analysis, error } = await sb
        .from('youtube_niche_analyses')
        .insert({
          channel_id: channelId ?? null,
          org_id: orgId,
          user_id: request.userId,
          niche: keyword,
          market: market ?? 'br',
          language: language ?? 'pt-BR',
          top_videos_json: topVideos as unknown as Record<string, unknown>,
          reference_channels_json: null,
          opportunities_json: null,
          saturated_topics_json: null,
        } as never)
        .select()
        .single();

      if (error) throw error;

      // Debit credits
      await debitCredits(orgId, request.userId, 'niche_analysis', 'text', NICHE_ANALYSIS_COST, {
        keyword,
        market,
      });

      return reply.send({ data: analysis, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
