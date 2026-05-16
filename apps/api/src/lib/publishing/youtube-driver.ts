/**
 * YouTube publish driver (T6.1).
 *
 * Implements `PublishDriver`: authenticate via OAuth2 refresh token, upload
 * a video file via the YouTube Data API v3 resumable upload, and return a
 * `PublishDriverOutcome`.
 *
 * Error handling:
 *   - 401 / invalid_grant  → awaiting_user, reason = publish_target_auth_expired
 *   - quotaExceeded        → awaiting_user, reason = quota_exceeded
 *
 * Credentials are stored AES-256-GCM encrypted in
 * `publish_targets.credentials_encrypted` as a JSON blob:
 *   { "refresh_token": "<google-refresh-token>" }
 *
 * Required env vars:
 *   YOUTUBE_OAUTH_CLIENT_ID
 *   YOUTUBE_OAUTH_CLIENT_SECRET
 *   ENCRYPTION_SECRET (32-byte hex, set by crypto.ts)
 */

import { google } from 'googleapis';
import { decrypt, aadFor } from '../crypto.js';
import type { PublishDriver, PublishDriverOutcome, PublishTargetRow } from './types.js';
import type { StageRun } from '@brighttale/shared/pipeline/inputs';

/** Expected shape inside `stage_runs.input_json` for a YouTube publish run. */
interface YouTubePublishInput {
  title: string;
  description: string;
  tags: string[];
  categoryId?: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
  /** Full URL of the video file to upload (from Supabase Storage or S3). */
  videoUrl: string;
  thumbnailUrl?: string;
}

function isYouTubePublishInput(v: unknown): v is YouTubePublishInput {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj['title'] === 'string' && typeof obj['videoUrl'] === 'string';
}

/** Detect whether an error from googleapis is a quota-exceeded condition. */
function isQuotaError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  if (typeof e['message'] === 'string' && e['message'].includes('quotaExceeded')) return true;
  const errors = e['errors'];
  if (Array.isArray(errors)) {
    return errors.some(
      (x) => typeof x === 'object' && x !== null && (x as Record<string, unknown>)['reason'] === 'quotaExceeded',
    );
  }
  return false;
}

/** Detect whether an error is an OAuth token revocation / expiry. */
function isAuthError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  const code = e['code'];
  const message = typeof e['message'] === 'string' ? e['message'] : '';
  if (code === 401 || code === 403) return true;
  if (message.includes('invalid_grant') || message.includes('Invalid Credentials')) return true;
  return false;
}

export class YouTubeDriver implements PublishDriver {
  async publishTo(target: PublishTargetRow, stageRun: StageRun): Promise<PublishDriverOutcome> {
    // ── 1. Validate + decrypt credentials ──────────────────────────────────

    if (!target.credentialsEncrypted) {
      return {
        status: 'awaiting_user',
        outcome: {
          reason: 'publish_target_auth_expired',
          details: 'No credentials stored for this publish target.',
        },
      };
    }

    let refreshToken: string;
    try {
      const aad = aadFor('publish_targets', 'credentials_encrypted', target.id, '');
      const plain = decrypt(target.credentialsEncrypted, { aad });
      const creds = JSON.parse(plain) as Record<string, unknown>;
      if (typeof creds['refresh_token'] !== 'string') {
        throw new Error('refresh_token missing in credentials');
      }
      refreshToken = creds['refresh_token'];
    } catch (decryptErr) {
      if (isAuthError(decryptErr)) {
        return {
          status: 'awaiting_user',
          outcome: {
            reason: 'publish_target_auth_expired',
            details: decryptErr instanceof Error ? decryptErr.message : String(decryptErr),
          },
        };
      }
      throw decryptErr;
    }

    // ── 2. Build OAuth2 client + refresh access token ──────────────────────

    const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
    const OAuth2 = google.auth.OAuth2;
    const oauth2Client = new OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
    } catch (authErr) {
      if (isAuthError(authErr)) {
        return {
          status: 'awaiting_user',
          outcome: {
            reason: 'publish_target_auth_expired',
            details: authErr instanceof Error ? authErr.message : String(authErr),
          },
        };
      }
      throw authErr;
    }

    // ── 3. Parse publish input from stage_run ──────────────────────────────

    if (!isYouTubePublishInput(stageRun.inputJson)) {
      throw new Error(
        `YouTubeDriver: stage_run ${stageRun.id} inputJson is missing required fields (title, videoUrl).`,
      );
    }

    const input = stageRun.inputJson;

    // ── 4. Upload video via YouTube Data API v3 ────────────────────────────

    const yt = google.youtube({ version: 'v3', auth: oauth2Client });

    let videoId: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (yt.videos.insert as (...args: any[]) => any)({
        part: ['snippet', 'status'],
        resource: {
          snippet: {
            title: input.title,
            description: input.description,
            tags: input.tags,
            categoryId: input.categoryId ?? '22',
          },
          status: {
            privacyStatus: input.privacyStatus,
          },
        },
        media: {
          mimeType: 'video/mp4',
          body: input.videoUrl,
        },
      });

      const insertedId = (res as { data: { id?: string } }).data.id;
      if (typeof insertedId !== 'string' || !insertedId) {
        throw new Error('YouTube API did not return a video ID after insert');
      }
      videoId = insertedId;
    } catch (uploadErr) {
      if (isQuotaError(uploadErr)) {
        return {
          status: 'awaiting_user',
          outcome: {
            reason: 'quota_exceeded',
            details: uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
          },
        };
      }
      if (isAuthError(uploadErr)) {
        return {
          status: 'awaiting_user',
          outcome: {
            reason: 'publish_target_auth_expired',
            details: uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
          },
        };
      }
      throw uploadErr;
    }

    // ── 5. Optionally set thumbnail ────────────────────────────────────────

    if (input.thumbnailUrl) {
      try {
        await yt.thumbnails.set({
          videoId,
          media: {
            mimeType: 'image/jpeg',
            body: input.thumbnailUrl,
          },
        });
      } catch {
        // Thumbnail upload is best-effort; don't fail the whole publish.
      }
    }

    // ── 6. Return success outcome ──────────────────────────────────────────

    return {
      status: 'published',
      result: {
        publishedUrl: `https://www.youtube.com/watch?v=${videoId}`,
        externalId: videoId,
        publishedAt: new Date().toISOString(),
      },
    };
  }
}
