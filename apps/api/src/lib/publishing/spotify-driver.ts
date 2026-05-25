/**
 * Spotify podcast driver (T6.2).
 *
 * Spotify's podcast ingestion is RSS-based. The "publish" action for this
 * driver is writing an episode row to `podcast_episodes` — the existing RSS
 * feed generator (T6.4, rss-feed.ts) auto-reflects new rows. No live Spotify
 * API call is made here.
 *
 * One-time manual step (out of scope for this driver): the podcast owner must
 * claim the show in Spotify for Podcasters by submitting the channel RSS feed
 * URL (<API_HOST>/feeds/<channelId>.xml) at podcasters.spotify.com. Once
 * claimed, every new episode row is picked up automatically on the next crawl.
 *
 * Credentials field (optional):
 *   `publish_targets.credentials_encrypted` may store an opaque blob for
 *   future use (e.g. Spotify show ID for analytics). If absent the driver
 *   writes the episode row anyway — the RSS feed remains the source of truth.
 *
 * Required env vars:
 *   ENCRYPTION_SECRET (32-byte hex, used by crypto.ts) — only needed when
 *     credentials_encrypted is set.
 */

import { randomUUID } from 'crypto';
import { createServiceClient } from '@/lib/supabase/index.js';
import type { PublishDriver, PublishDriverOutcome, PublishTargetRow } from './types.js';
import type { StageRun } from '@brighttale/shared/pipeline/inputs';

/** Expected shape inside `stage_runs.input_json` for a Spotify publish run. */
interface SpotifyPublishInput {
  title: string;
  description: string;
  /** Full URL of the audio file (MP3/M4A) from Supabase Storage or CDN. */
  audioUrl: string;
  /** Episode duration in seconds. */
  durationSec?: number;
  /** Optional episode artwork URL (overrides channel logo). */
  thumbnailUrl?: string;
  /** Mark episode as containing explicit content. Defaults to false. */
  itunesExplicit?: boolean;
}

function isSpotifyPublishInput(v: unknown): v is SpotifyPublishInput {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj['title'] === 'string' && typeof obj['audioUrl'] === 'string';
}

/** Extract channelId from target.configJson — required for scoping the episode row. */
function resolveChannelId(target: PublishTargetRow): string | null {
  if (target.configJson && typeof target.configJson['channelId'] === 'string') {
    return target.configJson['channelId'];
  }
  return null;
}

export class SpotifyDriver implements PublishDriver {
  async publishTo(target: PublishTargetRow, stageRun: StageRun): Promise<PublishDriverOutcome> {
    // ── 1. Resolve channel ID ──────────────────────────────────────────────

    const channelId = resolveChannelId(target);
    if (!channelId) {
      return {
        status: 'awaiting_user',
        outcome: {
          reason: 'publish_target_auth_expired',
          details:
            'SpotifyDriver: configJson.channelId is required but missing on this publish target.',
        },
      };
    }

    // ── 2. Parse publish input from stage_run ──────────────────────────────

    if (!isSpotifyPublishInput(stageRun.inputJson)) {
      return {
        status: 'awaiting_user',
        outcome: {
          reason: 'publish_target_auth_expired',
          details: `SpotifyDriver: stage_run ${stageRun.id} inputJson is missing required fields (title, audioUrl).`,
        },
      };
    }

    const input = stageRun.inputJson;

    // ── 3. Build guid (deterministic when stage_run id present) ───────────

    const stageRunId = stageRun.id && stageRun.id.length > 0 ? stageRun.id : null;
    const guidSuffix = stageRunId ?? randomUUID();
    const guid = `${channelId}:${guidSuffix}`;

    // ── 4. Insert episode row into podcast_episodes ────────────────────────

    const sb = createServiceClient();
    const now = new Date().toISOString();

    const { data: episode, error: insertErr } = await sb
      .from('podcast_episodes')
      .insert({
        publish_target_id: target.id,
        channel_id: channelId,
        stage_run_id: stageRunId,
        title: input.title,
        description: input.description,
        audio_url: input.audioUrl,
        duration_sec: input.durationSec ?? null,
        guid,
        published_at: now,
        itunes_explicit: input.itunesExplicit ?? false,
        itunes_image_url: input.thumbnailUrl ?? null,
      })
      .select()
      .single();

    if (insertErr) {
      const errUnknown: unknown = insertErr;
      const detail =
        typeof errUnknown === 'object' &&
        errUnknown !== null &&
        'message' in errUnknown &&
        typeof (errUnknown as { message: unknown })['message'] === 'string'
          ? (errUnknown as { message: string })['message']
          : String(insertErr);
      return {
        status: 'awaiting_user',
        outcome: {
          reason: 'publish_target_auth_expired',
          details: `SpotifyDriver: podcast_episodes insert failed — ${detail}`,
        },
      };
    }

    // ── 5. Note: channels.feed_updated_at does not exist in this schema. ──
    //    The RSS feed generator reads podcast_episodes directly; no timestamp
    //    bump is needed for ETag/Last-Modified (it hashes episode rows).

    // ── 6. Construct feed URL for the publishedUrl field ──────────────────

    const feedUrl =
      typeof target.configJson?.['feedUrl'] === 'string'
        ? (target.configJson['feedUrl'] as string)
        : null;

    const episodeGuid = episode ? (episode as Record<string, unknown>)['guid'] : guid;

    return {
      status: 'published',
      result: {
        publishedUrl: feedUrl ?? '',
        externalId: typeof episodeGuid === 'string' ? episodeGuid : guid,
        publishedAt: now,
      },
    };
  }
}
