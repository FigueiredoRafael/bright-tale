/**
 * S9 — YouTube publish adapter (apps/api/src/lib/youtube/publish.ts)
 *
 * Category A/B — all transport calls mocked via YouTubeTransport interface.
 * No real HTTP, no DB, no module-level state.
 *
 * Tests: dry-run, happy-path, 401-refresh-retry-success, 401-refresh-retry-fail,
 *        403 quota, generic 4xx.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { YouTubeTransport, YouTubePublishInput } from '../publish.js';
import { publishToYouTube } from '../publish.js';

// ─── Shared helpers ─────────────────────────────────────────────────────────

const TEST_SNIPPET = {
  title: 'My awesome video',
  description: 'A description',
  tags: ['ai', 'automation'],
  categoryId: '28',
  defaultLanguage: 'en',
};

const TEST_STATUS = {
  privacyStatus: 'unlisted' as const,
  selfDeclaredMadeForKids: false,
};

function makeInput(overrides: Partial<YouTubePublishInput> = {}): YouTubePublishInput {
  return {
    videoFile: Buffer.from('fake-video-bytes'),
    snippet: TEST_SNIPPET,
    status: TEST_STATUS,
    oauthToken: 'ya29.access-token',
    refreshToken: '1//refresh-token',
    ...overrides,
  };
}

/**
 * Creates a transport stub that simulates the happy-path three-step flow:
 *   1. POST /resumable-upload  → { videoId, url }
 *   2. PATCH /videos?part=snippet,status  → { id }
 *   3. POST /thumbnails/set  → {} (optional — only called if thumbnail given)
 */
function makeHappyTransport(videoId = 'vid-abc123'): YouTubeTransport {
  return {
    initiateResumableUpload: vi.fn().mockResolvedValue({ videoId, uploadUrl: 'https://upload.example.com/session' }),
    uploadVideoContent: vi.fn().mockResolvedValue(undefined),
    updateSnippetAndStatus: vi.fn().mockResolvedValue({ id: videoId }),
    uploadThumbnail: vi.fn().mockResolvedValue(undefined),
    refreshAccessToken: vi.fn().mockResolvedValue('ya29.refreshed-token'),
  };
}

// ─── 1. dry-run ─────────────────────────────────────────────────────────────

describe('publishToYouTube — dryRun: true', () => {
  it('returns a synthetic success receipt without calling transport', async () => {
    const transport: YouTubeTransport = {
      initiateResumableUpload: vi.fn(),
      uploadVideoContent: vi.fn(),
      updateSnippetAndStatus: vi.fn(),
      uploadThumbnail: vi.fn(),
      refreshAccessToken: vi.fn(),
    };

    const result = await publishToYouTube(makeInput({ dryRun: true, transport }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('guard');

    // Receipt must contain a videoId and URL even in dry-run mode
    expect(typeof result.videoId).toBe('string');
    expect(result.videoId.length).toBeGreaterThan(0);
    expect(result.url).toMatch(/youtube\.com/);
    expect(result.status).toBe('dryRun');

    // No transport methods should have been called
    expect(transport.initiateResumableUpload).not.toHaveBeenCalled();
    expect(transport.uploadVideoContent).not.toHaveBeenCalled();
    expect(transport.updateSnippetAndStatus).not.toHaveBeenCalled();
    expect(transport.uploadThumbnail).not.toHaveBeenCalled();
  });
});

// ─── 2. happy-path ──────────────────────────────────────────────────────────

describe('publishToYouTube — happy path', () => {
  it('returns ok: true with videoId and url on successful upload', async () => {
    const transport = makeHappyTransport('vid-happy-001');
    const result = await publishToYouTube(makeInput({ transport }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('guard');

    expect(result.videoId).toBe('vid-happy-001');
    expect(result.url).toContain('vid-happy-001');
    expect(result.status).toBe('unlisted');
  });

  it('calls initiateResumableUpload with the OAuth token', async () => {
    const transport = makeHappyTransport();
    await publishToYouTube(makeInput({ oauthToken: 'ya29.test-token', transport }));

    expect(transport.initiateResumableUpload).toHaveBeenCalledWith(
      expect.objectContaining({ oauthToken: 'ya29.test-token' }),
    );
  });

  it('calls updateSnippetAndStatus after upload', async () => {
    const transport = makeHappyTransport('vid-123');
    await publishToYouTube(makeInput({ transport }));

    expect(transport.updateSnippetAndStatus).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: 'vid-123' }),
    );
  });

  it('skips thumbnail upload when no thumbnail provided', async () => {
    const transport = makeHappyTransport();
    await publishToYouTube(makeInput({ transport }));

    expect(transport.uploadThumbnail).not.toHaveBeenCalled();
  });

  it('uploads thumbnail when thumbnail is provided', async () => {
    const transport = makeHappyTransport('vid-thumb');
    const thumbnailBlob = Buffer.from('fake-thumbnail-bytes');

    const result = await publishToYouTube(
      makeInput({ thumbnail: { blob: thumbnailBlob }, transport }),
    );

    expect(result.ok).toBe(true);
    expect(transport.uploadThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: 'vid-thumb' }),
    );
  });
});

// ─── 3. 401 → refresh → retry success ──────────────────────────────────────

describe('publishToYouTube — 401 refresh-retry success', () => {
  it('retries with refreshed token after 401 on initiateResumableUpload', async () => {
    let callCount = 0;
    const transport: YouTubeTransport = {
      initiateResumableUpload: vi.fn().mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          // First call → 401
          const err = new Error('Unauthorized');
          (err as NodeJS.ErrnoException & { statusCode?: number }).statusCode = 401;
          throw err;
        }
        return { videoId: 'vid-retried', uploadUrl: 'https://upload.example.com/session' };
      }),
      uploadVideoContent: vi.fn().mockResolvedValue(undefined),
      updateSnippetAndStatus: vi.fn().mockResolvedValue({ id: 'vid-retried' }),
      uploadThumbnail: vi.fn(),
      refreshAccessToken: vi.fn().mockResolvedValue('ya29.refreshed'),
    };

    const result = await publishToYouTube(makeInput({ transport }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('guard');
    expect(result.videoId).toBe('vid-retried');

    // Token refresh should have been called exactly once
    expect(transport.refreshAccessToken).toHaveBeenCalledTimes(1);
    // initiateResumableUpload should have been called twice (first 401, then success)
    expect(transport.initiateResumableUpload).toHaveBeenCalledTimes(2);
  });

  it('passes the refreshed token in the retry call', async () => {
    let callCount = 0;
    const transport: YouTubeTransport = {
      initiateResumableUpload: vi.fn().mockImplementation(async ({ oauthToken }) => {
        callCount += 1;
        if (callCount === 1) {
          const err = new Error('Unauthorized');
          (err as NodeJS.ErrnoException & { statusCode?: number }).statusCode = 401;
          throw err;
        }
        // Second call — verify the token was refreshed
        expect(oauthToken).toBe('ya29.new-token-from-refresh');
        return { videoId: 'vid-refreshed', uploadUrl: 'https://upload.example.com/session' };
      }),
      uploadVideoContent: vi.fn().mockResolvedValue(undefined),
      updateSnippetAndStatus: vi.fn().mockResolvedValue({ id: 'vid-refreshed' }),
      uploadThumbnail: vi.fn(),
      refreshAccessToken: vi.fn().mockResolvedValue('ya29.new-token-from-refresh'),
    };

    await publishToYouTube(makeInput({ transport }));
    expect(callCount).toBe(2);
  });
});

// ─── 4. 401 → refresh → retry 401 → YOUTUBE_AUTH_FAILED ───────────────────

describe('publishToYouTube — 401 retry then fail', () => {
  it('returns YOUTUBE_AUTH_FAILED when both attempts return 401', async () => {
    const transport: YouTubeTransport = {
      initiateResumableUpload: vi.fn().mockImplementation(async () => {
        const err = new Error('Unauthorized');
        (err as NodeJS.ErrnoException & { statusCode?: number }).statusCode = 401;
        throw err;
      }),
      uploadVideoContent: vi.fn(),
      updateSnippetAndStatus: vi.fn(),
      uploadThumbnail: vi.fn(),
      refreshAccessToken: vi.fn().mockResolvedValue('ya29.still-bad-token'),
    };

    const result = await publishToYouTube(makeInput({ transport }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('guard');
    expect(result.code).toBe('YOUTUBE_AUTH_FAILED');
  });

  it('only retries ONCE — does not loop infinitely', async () => {
    const transport: YouTubeTransport = {
      initiateResumableUpload: vi.fn().mockImplementation(async () => {
        const err = new Error('Unauthorized');
        (err as NodeJS.ErrnoException & { statusCode?: number }).statusCode = 401;
        throw err;
      }),
      uploadVideoContent: vi.fn(),
      updateSnippetAndStatus: vi.fn(),
      uploadThumbnail: vi.fn(),
      refreshAccessToken: vi.fn().mockResolvedValue('ya29.still-bad'),
    };

    await publishToYouTube(makeInput({ transport }));

    // Should have called initiateResumableUpload exactly twice (original + one retry)
    expect(transport.initiateResumableUpload).toHaveBeenCalledTimes(2);
    // Should have called refreshAccessToken exactly once
    expect(transport.refreshAccessToken).toHaveBeenCalledTimes(1);
  });
});

// ─── 5. 403 quota ───────────────────────────────────────────────────────────

describe('publishToYouTube — 403 quota exceeded', () => {
  it('returns YOUTUBE_QUOTA_EXCEEDED when transport throws 403', async () => {
    const quotaError = new Error('Quota exceeded');
    (quotaError as NodeJS.ErrnoException & { statusCode?: number; reason?: string }).statusCode = 403;
    (quotaError as NodeJS.ErrnoException & { statusCode?: number; reason?: string }).reason = 'quotaExceeded';

    const transport: YouTubeTransport = {
      initiateResumableUpload: vi.fn().mockRejectedValue(quotaError),
      uploadVideoContent: vi.fn(),
      updateSnippetAndStatus: vi.fn(),
      uploadThumbnail: vi.fn(),
      refreshAccessToken: vi.fn(),
    };

    const result = await publishToYouTube(makeInput({ transport }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('guard');
    expect(result.code).toBe('YOUTUBE_QUOTA_EXCEEDED');
  });

  it('does NOT attempt a token refresh on 403', async () => {
    const quotaError = new Error('Quota');
    (quotaError as NodeJS.ErrnoException & { statusCode?: number }).statusCode = 403;

    const transport: YouTubeTransport = {
      initiateResumableUpload: vi.fn().mockRejectedValue(quotaError),
      uploadVideoContent: vi.fn(),
      updateSnippetAndStatus: vi.fn(),
      uploadThumbnail: vi.fn(),
      refreshAccessToken: vi.fn(),
    };

    await publishToYouTube(makeInput({ transport }));
    expect(transport.refreshAccessToken).not.toHaveBeenCalled();
  });
});

// ─── 6. Generic 4xx ─────────────────────────────────────────────────────────

describe('publishToYouTube — generic 4xx', () => {
  it('returns YOUTUBE_REJECTED with reason from API errors array', async () => {
    const apiError = new Error('Invalid request');
    (apiError as NodeJS.ErrnoException & { statusCode?: number; apiErrors?: Array<{ reason: string; message: string }> }).statusCode = 400;
    (apiError as NodeJS.ErrnoException & { statusCode?: number; apiErrors?: Array<{ reason: string; message: string }> }).apiErrors = [
      { reason: 'invalidVideoTitle', message: 'The video title contains invalid characters.' },
    ];

    const transport: YouTubeTransport = {
      initiateResumableUpload: vi.fn().mockRejectedValue(apiError),
      uploadVideoContent: vi.fn(),
      updateSnippetAndStatus: vi.fn(),
      uploadThumbnail: vi.fn(),
      refreshAccessToken: vi.fn(),
    };

    const result = await publishToYouTube(makeInput({ transport }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('guard');
    expect(result.code).toBe('YOUTUBE_REJECTED');
    expect(result.message).toContain('invalidVideoTitle');
  });

  it('returns YOUTUBE_REJECTED for 422 with reason surfaced', async () => {
    const apiError = new Error('Unprocessable');
    (apiError as NodeJS.ErrnoException & { statusCode?: number; apiErrors?: Array<{ reason: string }> }).statusCode = 422;
    (apiError as NodeJS.ErrnoException & { statusCode?: number; apiErrors?: Array<{ reason: string }> }).apiErrors = [
      { reason: 'forbidden' },
    ];

    const transport: YouTubeTransport = {
      initiateResumableUpload: vi.fn().mockRejectedValue(apiError),
      uploadVideoContent: vi.fn(),
      updateSnippetAndStatus: vi.fn(),
      uploadThumbnail: vi.fn(),
      refreshAccessToken: vi.fn(),
    };

    const result = await publishToYouTube(makeInput({ transport }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('guard');
    expect(result.code).toBe('YOUTUBE_REJECTED');
    expect(result.message).toContain('forbidden');
  });

  it('returns YOUTUBE_REJECTED for other 4xx without apiErrors gracefully', async () => {
    const apiError = new Error('Bad request');
    (apiError as NodeJS.ErrnoException & { statusCode?: number }).statusCode = 400;
    // No apiErrors attached

    const transport: YouTubeTransport = {
      initiateResumableUpload: vi.fn().mockRejectedValue(apiError),
      uploadVideoContent: vi.fn(),
      updateSnippetAndStatus: vi.fn(),
      uploadThumbnail: vi.fn(),
      refreshAccessToken: vi.fn(),
    };

    const result = await publishToYouTube(makeInput({ transport }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('guard');
    expect(result.code).toBe('YOUTUBE_REJECTED');
    expect(typeof result.message).toBe('string');
  });
});
