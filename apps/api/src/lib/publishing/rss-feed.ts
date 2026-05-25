/**
 * T6.4 — Generic RSS 2.0 + iTunes feed generator.
 *
 * Generates per-channel RSS feeds consumed by podcast publishers (Spotify T6.2,
 * Apple Podcasts T6.3). The function is a pure DB-reader: it owns no write path.
 *
 * T6.2 (Spotify) and T6.3 (Apple Podcasts) write rows to `podcast_episodes`
 * and this function assembles the XML spine that both publishers rely on.
 */

import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase/index.js';

/** Shape returned from the channel metadata query. */
interface ChannelRow {
  id: string;
  name: string;
  niche: string | null;
  language: string;
  logo_url: string | null;
  blog_url: string | null;
}

/** Shape returned from the podcast_episodes query. */
interface EpisodeRow {
  id: string;
  title: string;
  description: string;
  audio_url: string;
  duration_sec: number | null;
  guid: string;
  published_at: string;
  itunes_explicit: boolean;
  itunes_image_url: string | null;
  updated_at: string;
}

/** Opaque descriptor used by the HTTP handler for ETag / 304 support. */
export interface FeedDescriptor {
  xml: string;
  etag: string;
}

/**
 * Escape special XML characters in text nodes / attribute values.
 */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format duration_sec as HH:MM:SS for the itunes:duration tag.
 * Returns an empty string when the value is null/undefined so callers
 * can omit the tag entirely.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Compute a stable ETag for a set of episodes.
 * The hash covers episode IDs and their updated_at timestamps so any
 * change to any row produces a new ETag.
 */
export function computeEtag(episodes: EpisodeRow[]): string {
  const fingerprint = episodes.map((e) => `${e.id}:${e.updated_at}`).join('|');
  return `"${createHash('sha256').update(fingerprint).digest('hex').slice(0, 32)}"`;
}

/**
 * Build a single <item> element for a podcast episode.
 */
function buildItem(ep: EpisodeRow, channelImageUrl: string | null): string {
  const duration = formatDuration(ep.duration_sec);
  const imageUrl = ep.itunes_image_url ?? channelImageUrl;

  const lines: string[] = [
    `    <item>`,
    `      <title>${xmlEscape(ep.title)}</title>`,
    `      <description><![CDATA[${ep.description}]]></description>`,
    `      <enclosure url="${xmlEscape(ep.audio_url)}" type="audio/mpeg" length="0"/>`,
    `      <guid isPermaLink="false">${xmlEscape(ep.guid)}</guid>`,
    `      <pubDate>${new Date(ep.published_at).toUTCString()}</pubDate>`,
    `      <itunes:explicit>${ep.itunes_explicit ? 'true' : 'false'}</itunes:explicit>`,
  ];

  if (duration) {
    lines.push(`      <itunes:duration>${xmlEscape(duration)}</itunes:duration>`);
  }

  if (imageUrl) {
    lines.push(`      <itunes:image href="${xmlEscape(imageUrl)}"/>`);
  }

  // Apple Podcasts requires itunes:title to match <title> for display.
  lines.push(`      <itunes:title>${xmlEscape(ep.title)}</itunes:title>`);

  lines.push(`    </item>`);
  return lines.join('\n');
}

/**
 * Assemble the full RSS 2.0 + iTunes XML document for a channel.
 */
function buildXml(channel: ChannelRow, episodes: EpisodeRow[], feedUrl: string): string {
  const channelLink = channel.blog_url ?? feedUrl;
  const description = channel.niche ?? channel.name;
  const imageUrl = channel.logo_url;
  const language = channel.language.toLowerCase().replace('_', '-');

  const items = episodes.map((ep) => buildItem(ep, imageUrl)).join('\n');

  const imageBlock = imageUrl
    ? [
        `    <image>`,
        `      <url>${xmlEscape(imageUrl)}</url>`,
        `      <title>${xmlEscape(channel.name)}</title>`,
        `      <link>${xmlEscape(channelLink)}</link>`,
        `    </image>`,
        `    <itunes:image href="${xmlEscape(imageUrl)}"/>`,
      ].join('\n')
    : '';

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0"`,
    `  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"`,
    `  xmlns:atom="http://www.w3.org/2005/Atom">`,
    `  <channel>`,
    `    <title>${xmlEscape(channel.name)}</title>`,
    `    <link>${xmlEscape(channelLink)}</link>`,
    `    <description><![CDATA[${description}]]></description>`,
    `    <language>${xmlEscape(language)}</language>`,
    `    <atom:link href="${xmlEscape(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    `    <itunes:author>${xmlEscape(channel.name)}</itunes:author>`,
    `    <itunes:summary><![CDATA[${description}]]></itunes:summary>`,
    `    <itunes:explicit>false</itunes:explicit>`,
    imageBlock,
    items,
    `  </channel>`,
    `</rss>`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Generate an RSS 2.0 + iTunes feed for the given channel.
 *
 * @param channelId - UUID of the channel.
 * @param feedUrl   - Canonical self-link URL for the feed (used in atom:link).
 * @returns FeedDescriptor with the XML string and ETag for HTTP caching.
 * @throws ApiError (404) when the channel is not found.
 */
export async function generateFeed(
  channelId: string,
  feedUrl: string,
): Promise<FeedDescriptor> {
  const sb = createServiceClient();

  const { data: channel, error: chErr } = await sb
    .from('channels')
    .select('id, name, niche, language, logo_url, blog_url')
    .eq('id', channelId)
    .maybeSingle();

  if (chErr) throw chErr;

  if (!channel) {
    const err = new Error(`Channel ${channelId} not found`);
    (err as unknown as { statusCode: number }).statusCode = 404;
    (err as unknown as { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const { data: episodes, error: epErr } = await sb
    .from('podcast_episodes')
    .select(
      'id, title, description, audio_url, duration_sec, guid, published_at, itunes_explicit, itunes_image_url, updated_at',
    )
    .eq('channel_id', channelId)
    .order('published_at', { ascending: false });

  if (epErr) throw epErr;

  const rows: EpisodeRow[] = episodes ?? [];
  const etag = computeEtag(rows);
  const xml = buildXml(channel as ChannelRow, rows, feedUrl);

  return { xml, etag };
}
