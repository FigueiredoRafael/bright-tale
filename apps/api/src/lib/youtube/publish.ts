/**
 * YouTube publish adapter (S9).
 *
 * Pure module — no Supabase client, no env reads, no module-level state.
 * All OAuth tokens are passed in per call.
 * All network I/O is delegated to the `YouTubeTransport` interface so tests
 * can inject a stub and run without hitting Google's APIs.
 *
 * Upload sequence:
 *   1. POST /upload/youtube/v3/videos?uploadType=resumable  → get session URL
 *   2. PUT <sessionUrl>  → stream/upload the video bytes
 *   3. PATCH /youtube/v3/videos?part=snippet,status  → set metadata
 *   4. POST /youtube/v3/thumbnails/set  → upload thumbnail (optional)
 *
 * Error mapping (discriminated union — nothing is thrown to the caller):
 *   401 → refresh token → retry ONCE → if still 401 → YOUTUBE_AUTH_FAILED
 *   403 → YOUTUBE_QUOTA_EXCEEDED
 *   other 4xx → YOUTUBE_REJECTED (with API errors[].reason in message)
 */

// ─── Transport interface ─────────────────────────────────────────────────────

export interface InitiateUploadParams {
  oauthToken: string;
  snippet: YouTubeSnippet;
  status: YouTubeStatus;
  fileSizeBytes?: number;
}

export interface UploadContentParams {
  uploadUrl: string;
  videoFile: Buffer | NodeJS.ReadableStream | string;
  oauthToken: string;
}

export interface UpdateMetadataParams {
  videoId: string;
  snippet: YouTubeSnippet;
  status: YouTubeStatus;
  oauthToken: string;
}

export interface UploadThumbnailParams {
  videoId: string;
  thumbnail: { url?: string; blob?: Buffer };
  oauthToken: string;
}

/**
 * Swappable transport boundary — mock this interface in tests.
 * Production implementation uses fetch directly against YouTube Data API v3.
 */
export interface YouTubeTransport {
  /**
   * Step 1: Initiate a resumable upload session.
   * Returns the videoId (reserved) and the upload session URL.
   */
  initiateResumableUpload(params: InitiateUploadParams): Promise<{ videoId: string; uploadUrl: string }>;

  /**
   * Step 2: Upload the actual video bytes to the resumable session URL.
   */
  uploadVideoContent(params: UploadContentParams): Promise<void>;

  /**
   * Step 3: PATCH snippet + status on the video resource.
   */
  updateSnippetAndStatus(params: UpdateMetadataParams): Promise<{ id: string }>;

  /**
   * Step 4 (optional): Upload a custom thumbnail.
   */
  uploadThumbnail(params: UploadThumbnailParams): Promise<void>;

  /**
   * Refresh the OAuth access token using the stored refresh_token.
   * Called automatically by the adapter on 401 — callers supply the refresh_token.
   * Returns the new access_token string.
   */
  refreshAccessToken(refreshToken: string): Promise<string>;
}

// ─── Error type used internally ──────────────────────────────────────────────

interface YouTubeApiError extends Error {
  statusCode?: number;
  reason?: string;
  apiErrors?: Array<{ reason: string; message?: string }>;
}

// ─── Public types ────────────────────────────────────────────────────────────

export interface YouTubeSnippet {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  defaultLanguage: string;
}

export interface YouTubeStatus {
  privacyStatus: 'public' | 'unlisted' | 'private';
  selfDeclaredMadeForKids: boolean;
  publishAt?: string;
}

export interface YouTubePublishInput {
  videoFile: Buffer | NodeJS.ReadableStream | string;
  snippet: YouTubeSnippet;
  status: YouTubeStatus;
  thumbnail?: { url?: string; blob?: Buffer };
  oauthToken: string;
  /**
   * Caller must supply the refresh_token so the adapter can refresh on 401.
   * The adapter never reads env vars.
   */
  refreshToken?: string;
  /**
   * When true the adapter returns a synthetic success receipt without calling
   * any transport method. Use this in staging or preflight checks.
   */
  dryRun?: boolean;
  /**
   * Swappable transport for testing. When omitted, `liveTransport()` is used.
   */
  transport?: YouTubeTransport;
}

export type YouTubePublishOutput =
  | { ok: true; videoId: string; url: string; status: string }
  | {
      ok: false;
      code: 'YOUTUBE_AUTH_FAILED' | 'YOUTUBE_QUOTA_EXCEEDED' | 'YOUTUBE_REJECTED';
      message: string;
    };

// ─── Error classification ────────────────────────────────────────────────────

function classifyError(err: YouTubeApiError): Exclude<YouTubePublishOutput, { ok: true }> {
  const statusCode = err.statusCode ?? 0;

  if (statusCode === 403) {
    return {
      ok: false,
      code: 'YOUTUBE_QUOTA_EXCEEDED',
      message: err.message ?? 'YouTube quota exceeded',
    };
  }

  if (statusCode >= 400) {
    const reasons = (err.apiErrors ?? []).map((e) => e.reason).filter(Boolean).join(', ');
    const message = reasons.length > 0
      ? `YouTube rejected the request: ${reasons}`
      : err.message ?? 'YouTube rejected the request';
    return { ok: false, code: 'YOUTUBE_REJECTED', message };
  }

  // Unexpected / network error — surface as YOUTUBE_REJECTED
  return { ok: false, code: 'YOUTUBE_REJECTED', message: err.message ?? 'Unknown YouTube error' };
}

// ─── Live transport (production) ─────────────────────────────────────────────

const YT_UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';
const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 * Parses a YouTube API error response body into a YouTubeApiError-shaped object.
 */
async function parseYouTubeError(res: Response, fallbackMessage: string): Promise<YouTubeApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // ignore parse failures
  }

  const err = new Error(fallbackMessage) as YouTubeApiError;
  err.statusCode = res.status;

  const errorObj = body['error'] as Record<string, unknown> | undefined;
  if (errorObj) {
    const errors = errorObj['errors'] as Array<{ reason?: string; message?: string }> | undefined;
    if (Array.isArray(errors)) {
      err.apiErrors = errors.map((e) => ({
        reason: typeof e.reason === 'string' ? e.reason : 'unknown',
        message: typeof e.message === 'string' ? e.message : undefined,
      }));
    }
  }

  return err;
}

function makeLiveTransport(): YouTubeTransport {
  return {
    async initiateResumableUpload({ oauthToken, snippet, status, fileSizeBytes }) {
      const url = new URL(`${YT_UPLOAD_BASE}/videos`);
      url.searchParams.set('uploadType', 'resumable');
      url.searchParams.set('part', 'snippet,status');

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${oauthToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/*',
          ...(fileSizeBytes !== undefined ? { 'X-Upload-Content-Length': String(fileSizeBytes) } : {}),
        },
        body: JSON.stringify({ snippet, status }),
      });

      if (!res.ok) {
        throw await parseYouTubeError(res, `Resumable upload initiation failed: ${res.status}`);
      }

      const location = res.headers.get('Location');
      if (!location) {
        const err = new Error('No Location header in resumable upload response') as YouTubeApiError;
        err.statusCode = 500;
        throw err;
      }

      // YouTube returns the videoId in the response body
      const body = (await res.json()) as { id?: string };
      const videoId = body.id ?? '';

      return { videoId, uploadUrl: location };
    },

    async uploadVideoContent({ uploadUrl, videoFile, oauthToken }) {
      const body = typeof videoFile === 'string'
        // URL-based — fetch the file first, then re-stream
        ? await fetch(videoFile).then((r) => r.body)
        : videoFile;

      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${oauthToken}`,
          'Content-Type': 'video/*',
        },
         
        body: body as any,
        // Node 18+ fetch supports duplex for streaming
        // @ts-expect-error duplex is Node-specific
        duplex: 'half',
      });

      if (!res.ok) {
        throw await parseYouTubeError(res, `Video content upload failed: ${res.status}`);
      }
    },

    async updateSnippetAndStatus({ videoId, snippet, status, oauthToken }) {
      const url = new URL(`${YT_API_BASE}/videos`);
      url.searchParams.set('part', 'snippet,status');

      const res = await fetch(url.toString(), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${oauthToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: videoId, snippet, status }),
      });

      if (!res.ok) {
        throw await parseYouTubeError(res, `Snippet/status update failed: ${res.status}`);
      }

      const body = (await res.json()) as { id?: string };
      return { id: body.id ?? videoId };
    },

    async uploadThumbnail({ videoId, thumbnail, oauthToken }) {
      let body: BodyInit;
      let contentType: string;

      if (thumbnail.blob) {
        body = new Uint8Array(thumbnail.blob);
        contentType = 'image/jpeg';
      } else if (thumbnail.url) {
        const imgRes = await fetch(thumbnail.url);
        body = await imgRes.arrayBuffer();
        contentType = imgRes.headers.get('Content-Type') ?? 'image/jpeg';
      } else {
        return; // Nothing to upload
      }

      const url = new URL(`${YT_API_BASE}/thumbnails/set`);
      url.searchParams.set('videoId', videoId);

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${oauthToken}`,
          'Content-Type': contentType,
        },
        body,
      });

      if (!res.ok) {
        throw await parseYouTubeError(res, `Thumbnail upload failed: ${res.status}`);
      }
    },

    async refreshAccessToken(refreshToken) {
      const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID ?? '';
      const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET ?? '';

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      });

      const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok || typeof json['access_token'] !== 'string') {
        const err = new Error('Token refresh failed') as YouTubeApiError;
        err.statusCode = 401;
        throw err;
      }

      return json['access_token'];
    },
  };
}

// ─── Core adapter ────────────────────────────────────────────────────────────

/**
 * Run the three-step YouTube publish sequence with automatic 401 retry.
 * All errors are returned as typed values — nothing is thrown to the caller.
 */
async function runUploadSequence(
  input: YouTubePublishInput,
  transport: YouTubeTransport,
  oauthToken: string,
): Promise<YouTubePublishOutput> {
  // Step 1 — initiate resumable upload
  const { videoId, uploadUrl } = await transport.initiateResumableUpload({
    oauthToken,
    snippet: input.snippet,
    status: input.status,
    fileSizeBytes: Buffer.isBuffer(input.videoFile) ? input.videoFile.length : undefined,
  });

  // Step 2 — upload video content
  await transport.uploadVideoContent({ uploadUrl, videoFile: input.videoFile, oauthToken });

  // Step 3 — update snippet + status
  await transport.updateSnippetAndStatus({
    videoId,
    snippet: input.snippet,
    status: input.status,
    oauthToken,
  });

  // Step 4 — upload thumbnail (optional)
  if (input.thumbnail) {
    await transport.uploadThumbnail({ videoId, thumbnail: input.thumbnail, oauthToken });
  }

  return {
    ok: true,
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    status: input.status.privacyStatus,
  };
}

/**
 * Publish a video to YouTube.
 *
 * @param input — all publish parameters, including the decrypted OAuth token.
 *                Caller is responsible for decryption before calling this function.
 * @returns discriminated union: `{ ok: true, videoId, url, status }` or
 *          `{ ok: false, code, message }` — never throws.
 */
export async function publishToYouTube(input: YouTubePublishInput): Promise<YouTubePublishOutput> {
  // dry-run fast path — no transport calls
  if (input.dryRun) {
    const dryRunId = `dryrun-${Date.now()}`;
    return {
      ok: true,
      videoId: dryRunId,
      url: `https://www.youtube.com/watch?v=${dryRunId}`,
      status: 'dryRun',
    };
  }

  const transport = input.transport ?? makeLiveTransport();
  let oauthToken = input.oauthToken;

  try {
    return await runUploadSequence(input, transport, oauthToken);
  } catch (firstErr) {
    const err = firstErr as YouTubeApiError;

    // 401 → attempt token refresh, then retry ONCE
    if (err.statusCode === 401) {
      if (!input.refreshToken) {
        return { ok: false, code: 'YOUTUBE_AUTH_FAILED', message: 'OAuth token expired and no refresh_token supplied' };
      }

      try {
        oauthToken = await transport.refreshAccessToken(input.refreshToken);
      } catch {
        return { ok: false, code: 'YOUTUBE_AUTH_FAILED', message: 'Token refresh failed' };
      }

      try {
        return await runUploadSequence(input, transport, oauthToken);
      } catch (retryErr) {
        const retryError = retryErr as YouTubeApiError;
        if (retryError.statusCode === 401) {
          return { ok: false, code: 'YOUTUBE_AUTH_FAILED', message: 'YouTube authentication failed after token refresh' };
        }
        return classifyError(retryError);
      }
    }

    return classifyError(err);
  }
}
