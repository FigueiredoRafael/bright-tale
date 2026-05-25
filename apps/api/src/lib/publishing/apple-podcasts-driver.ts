/**
 * Apple Podcasts publish driver (T6.3).
 *
 * Live Apple Podcasts Connect submission is a one-time manual step: paste the
 * feed URL into podcastsconnect.apple.com after the channel is set up. This
 * driver only ensures the feed conforms to Apple's iTunes RSS specification.
 */

import { randomUUID } from 'crypto';
import { createServiceClient } from '@/lib/supabase/index.js';
import type { PublishDriver, PublishDriverOutcome, PublishTargetRow } from './types.js';
import type { StageRun } from '@brighttale/shared/pipeline/inputs';

/** iTunes-mandatory fields expected inside `stage_runs.input_json`. */
interface ApplePodcastsPublishInput {
  title: string;
  description: string;
  audioUrl: string;
  durationSec: number;
  /** Display name of the episode author — required by Apple Podcasts. */
  itunesAuthor: string;
  /** Must be an https URL; Apple rejects http image links. */
  itunesImageUrl: string;
  itunesExplicit: boolean;
}

function isApplePodcastsInput(v: unknown): v is ApplePodcastsPublishInput {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj['title'] === 'string' &&
    typeof obj['description'] === 'string' &&
    typeof obj['audioUrl'] === 'string'
  );
}

function validationFailed(message: string): PublishDriverOutcome {
  return {
    status: 'failed',
    error: { code: 'INVALID_ITUNES_METADATA', message },
  };
}

function dbFailed(message: string): PublishDriverOutcome {
  return {
    status: 'failed',
    error: { code: 'DB_INSERT_FAILED', message },
  };
}

export class ApplePodcastsDriver implements PublishDriver {
  async publishTo(target: PublishTargetRow, stageRun: StageRun): Promise<PublishDriverOutcome> {
    // ── 1. Parse + validate iTunes-mandatory fields ────────────────────────────

    if (!isApplePodcastsInput(stageRun.inputJson)) {
      return validationFailed('inputJson is missing required fields (title, description, audioUrl)');
    }

    const input = stageRun.inputJson;

    if (typeof input.itunesAuthor !== 'string' || input.itunesAuthor.trim() === '') {
      return validationFailed('itunesAuthor is required for Apple Podcasts');
    }

    if (typeof input.itunesImageUrl !== 'string' || input.itunesImageUrl.trim() === '') {
      return validationFailed('itunesImageUrl is required for Apple Podcasts');
    }

    if (!input.itunesImageUrl.startsWith('https://')) {
      return validationFailed('itunesImageUrl must be an https URL (Apple Podcasts requirement)');
    }

    if (
      typeof input.durationSec !== 'number' ||
      !Number.isInteger(input.durationSec) ||
      input.durationSec <= 0
    ) {
      return validationFailed('durationSec must be a positive integer (seconds)');
    }

    // ── 2. Resolve channel_id from target config ───────────────────────────────

    const configJson = target.configJson ?? {};
    const channelId =
      typeof configJson['channelId'] === 'string' ? configJson['channelId'] : null;
    if (!channelId) {
      return dbFailed('publish_target.configJson.channelId is required');
    }

    // ── 3. Build episode guid ─────────────────────────────────────────────────

    const guid = `${channelId}:${stageRun.id ?? randomUUID()}`;

    // ── 4. Insert podcast_episodes row ────────────────────────────────────────

    const sb = createServiceClient();

    const { data: episode, error: insertError } = await sb
      .from('podcast_episodes')
      .insert({
        publish_target_id: target.id,
        channel_id: channelId,
        title: input.title,
        description: input.description,
        audio_url: input.audioUrl,
        duration_sec: input.durationSec,
        guid,
        published_at: new Date().toISOString(),
        itunes_explicit: input.itunesExplicit ?? false,
        itunes_image_url: input.itunesImageUrl,
        stage_run_id: stageRun.id ?? null,
      })
      .select()
      .single();

    if (insertError || !episode) {
      const msg = insertError
        ? (insertError as { message?: string }).message ?? String(insertError)
        : 'No row returned after insert';
      return dbFailed(msg);
    }

    // ── 5. Build feed URL + return success ────────────────────────────────────

    const feedBaseUrl = process.env.FEED_BASE_URL ?? 'https://feeds.brighttale.io';
    const feedUrl = `${feedBaseUrl}/feeds/${channelId}.xml`;

    return {
      status: 'published',
      result: {
        publishedUrl: feedUrl,
        externalId: guid,
        publishedAt: new Date().toISOString(),
      },
    };
  }
}
