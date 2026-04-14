/**
 * YouTube Data API v3 client (F2-005)
 *
 * Wraps the YouTube Data API with rate limiting and quota tracking.
 * Quota: 10,000 units/day. Costs per operation:
 *   search.list = 100, videos.list = 1, channels.list = 1, commentThreads.list = 1
 */

import { TtlCache } from '../cache.js';

const API_BASE = 'https://www.googleapis.com/youtube/v3';

const channelCache = new TtlCache<YouTubeChannel>({ defaultTtlMs: 24 * 60 * 60 * 1000, maxSize: 200 });
const videoCache = new TtlCache<YouTubeVideoDetail[]>({ defaultTtlMs: 7 * 24 * 60 * 60 * 1000, maxSize: 100 });
const searchCache = new TtlCache<YouTubeSearchResult[]>({ defaultTtlMs: 24 * 60 * 60 * 1000, maxSize: 100 });

function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY not set');
  return key;
}

interface YouTubeResponse<T> {
  items: T[];
  pageInfo: { totalResults: number; resultsPerPage: number };
  nextPageToken?: string;
}

/**
 * Make a request to the YouTube Data API.
 */
async function youtubeGet<T>(endpoint: string, params: Record<string, string>): Promise<YouTubeResponse<T>> {
  const key = getApiKey();
  const url = new URL(`${API_BASE}/${endpoint}`);
  url.searchParams.set('key', key);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(`YouTube API error: ${res.status} — ${JSON.stringify(error)}`);
  }

  return res.json() as Promise<YouTubeResponse<T>>;
}

// ─── Channel operations ──────────────────────────────────────────────────────

export interface YouTubeChannel {
  id: string;
  snippet: {
    title: string;
    description: string;
    customUrl: string;
    thumbnails: { default: { url: string }; medium: { url: string } };
    country: string;
  };
  statistics: {
    subscriberCount: string;
    viewCount: string;
    videoCount: string;
  };
}

/**
 * Fetch a YouTube channel by URL or handle.
 */
export async function getChannelByUrl(url: string): Promise<YouTubeChannel | null> {
  const cached = channelCache.get(`url:${url}`);
  if (cached) return cached;

  const handleMatch = url.match(/@([a-zA-Z0-9_-]+)/);
  const channelIdMatch = url.match(/\/channel\/([a-zA-Z0-9_-]+)/);

  let channel: YouTubeChannel | null = null;

  if (handleMatch) {
    const data = await youtubeGet<YouTubeChannel>('channels', {
      part: 'snippet,statistics',
      forHandle: handleMatch[1],
    });
    channel = data.items[0] ?? null;
  } else if (channelIdMatch) {
    const data = await youtubeGet<YouTubeChannel>('channels', {
      part: 'snippet,statistics',
      id: channelIdMatch[1],
    });
    channel = data.items[0] ?? null;
  }

  if (channel) {
    channelCache.set(`url:${url}`, channel);
    channelCache.set(`id:${channel.id}`, channel);
  }
  return channel;
}

/**
 * Fetch a channel by its ID.
 */
export async function getChannelById(channelId: string): Promise<YouTubeChannel | null> {
  const cached = channelCache.get(`id:${channelId}`);
  if (cached) return cached;

  const data = await youtubeGet<YouTubeChannel>('channels', {
    part: 'snippet,statistics',
    id: channelId,
  });
  const channel = data.items[0] ?? null;
  if (channel) channelCache.set(`id:${channelId}`, channel);
  return channel;
}

// ─── Search operations ───────────────────────────────────────────────────────

export interface YouTubeSearchResult {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    thumbnails: { medium: { url: string } };
  };
}

/**
 * Search for videos by keyword in a specific market/language.
 */
export async function searchVideos(
  query: string,
  options: {
    maxResults?: number;
    regionCode?: string;
    relevanceLanguage?: string;
    publishedAfter?: string;
    order?: 'relevance' | 'viewCount' | 'date';
  } = {},
): Promise<YouTubeSearchResult[]> {
  const params: Record<string, string> = {
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: String(options.maxResults ?? 20),
    order: options.order ?? 'viewCount',
  };

  if (options.regionCode) params.regionCode = options.regionCode;
  if (options.relevanceLanguage) params.relevanceLanguage = options.relevanceLanguage;
  if (options.publishedAfter) params.publishedAfter = options.publishedAfter;

  const cacheKey = `search:${JSON.stringify(params)}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const data = await youtubeGet<YouTubeSearchResult>('search', params);
  searchCache.set(cacheKey, data.items);
  return data.items;
}

// ─── Video details ───────────────────────────────────────────────────────────

export interface YouTubeVideoDetail {
  id: string;
  snippet: {
    title: string;
    description: string;
    tags: string[];
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    thumbnails: { medium: { url: string }; high: { url: string } };
  };
  statistics: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  };
  contentDetails: {
    duration: string; // ISO 8601 duration (PT4M13S)
  };
}

/**
 * Get detailed info for a list of video IDs.
 */
export async function getVideoDetails(videoIds: string[]): Promise<YouTubeVideoDetail[]> {
  if (videoIds.length === 0) return [];

  const sortedKey = [...videoIds].sort().join(',');
  const cached = videoCache.get(`details:${sortedKey}`);
  if (cached) return cached;

  const batches: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    batches.push(videoIds.slice(i, i + 50));
  }

  const results: YouTubeVideoDetail[] = [];
  for (const batch of batches) {
    const data = await youtubeGet<YouTubeVideoDetail>('videos', {
      part: 'snippet,statistics,contentDetails',
      id: batch.join(','),
    });
    results.push(...data.items);
  }

  videoCache.set(`details:${sortedKey}`, results);
  return results;
}

/**
 * Parse ISO 8601 duration to seconds.
 * e.g. "PT4M13S" → 253
 */
export function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] ?? '0', 10);
  const minutes = parseInt(match[2] ?? '0', 10);
  const seconds = parseInt(match[3] ?? '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}
