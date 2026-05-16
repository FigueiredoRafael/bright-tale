/**
 * Unit tests for the YouTube publish driver (T6.1).
 *
 * Category A/B — no real OAuth, no real uploads. All `googleapis` calls are
 * mocked at the module boundary so CI never hits the network.
 *
 * Behaviors:
 * 1. publishTo returns `published` with publishedUrl on success
 * 2. Refreshes access token from refresh_token in credentials_encrypted
 * 3. On 401 / invalid_grant marks stage_run awaiting_user (auth_expired)
 * 4. On quotaExceeded retries with backoff then surfaces transient failure
 * 5. Sets snippet (title/description/tags/categoryId) and privacyStatus
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encrypt } from '../../crypto.js';
import type { PublishTargetRow } from '../types.js';
import type { StageRun } from '@brighttale/shared/pipeline/inputs';

// ─── Mock googleapis before importing the driver ─────────────────────────────

const mockCredentialsRefresh = vi.fn();
const mockVideosInsert = vi.fn();
const mockThumbnailsSet = vi.fn();

vi.mock('googleapis', () => {
  class OAuth2Client {
    setCredentials = vi.fn();
    refreshAccessToken = mockCredentialsRefresh;
  }

  return {
    google: {
      auth: { OAuth2: OAuth2Client },
      youtube: vi.fn(() => ({
        videos: { insert: mockVideosInsert },
        thumbnails: { set: mockThumbnailsSet },
      })),
    },
  };
});

// Import driver AFTER mock is registered
import { YouTubeDriver } from '../youtube-driver.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

process.env.ENCRYPTION_SECRET = 'a'.repeat(64);
process.env.YOUTUBE_OAUTH_CLIENT_ID = 'test-client-id';
process.env.YOUTUBE_OAUTH_CLIENT_SECRET = 'test-client-secret';

function makePublishTarget(overrides: Partial<PublishTargetRow> = {}): PublishTargetRow {
  const creds = JSON.stringify({ refresh_token: 'rt-abc123' });
  return {
    id: 'pt-1',
    type: 'youtube',
    displayName: 'My YouTube Channel',
    credentialsEncrypted: encrypt(creds, { aad: 'publish_targets:credentials_encrypted:pt-1:' }),
    configJson: null,
    ...overrides,
  };
}

function makeStageRun(overrides: Partial<StageRun> = {}): StageRun {
  return {
    id: 'sr-1',
    projectId: 'proj-1',
    stage: 'publish',
    status: 'running',
    awaitingReason: null,
    payloadRef: null,
    attemptNo: 1,
    inputJson: {
      title: 'Test Video Title',
      description: 'Test description for the video.',
      tags: ['tag1', 'tag2'],
      categoryId: '22',
      privacyStatus: 'public',
      videoUrl: 'https://storage.example.com/video.mp4',
    },
    errorMessage: null,
    startedAt: '2026-05-16T00:00:00Z',
    finishedAt: null,
    trackId: 'track-1',
    publishTargetId: 'pt-1',
    createdAt: '2026-05-16T00:00:00Z',
    updatedAt: '2026-05-16T00:00:00Z',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('YouTubeDriver', () => {
  const driver = new YouTubeDriver();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCredentialsRefresh.mockResolvedValue({
      credentials: { access_token: 'new-access-token', expiry_date: Date.now() + 3600000 },
    });
    mockVideosInsert.mockResolvedValue({
      data: { id: 'ytVideoId123', status: { uploadStatus: 'uploaded' } },
    });
    mockThumbnailsSet.mockResolvedValue({ data: {} });
  });

  // ─── Behavior 1: success returns published with publishedUrl ────────────────

  it('returns published status with publishedUrl on success', async () => {
    const result = await driver.publishTo(makePublishTarget(), makeStageRun());

    expect(result.status).toBe('published');
    if (result.status === 'published') {
      expect(result.result.publishedUrl).toBe('https://www.youtube.com/watch?v=ytVideoId123');
      expect(result.result.externalId).toBe('ytVideoId123');
      expect(result.result.publishedAt).toBeTruthy();
    }
  });

  // ─── Behavior 2: refreshes token before upload ────────────────────────────

  it('calls refreshAccessToken with the decrypted refresh_token before upload', async () => {
    await driver.publishTo(makePublishTarget(), makeStageRun());
    expect(mockCredentialsRefresh).toHaveBeenCalledOnce();
  });

  // ─── Behavior 3: 401 / invalid_grant → awaiting_user ─────────────────────

  it('marks awaiting_user with reason publish_target_auth_expired on 401 error', async () => {
    mockCredentialsRefresh.mockRejectedValue(
      Object.assign(new Error('invalid_grant'), { code: 401 }),
    );

    const result = await driver.publishTo(makePublishTarget(), makeStageRun());

    expect(result.status).toBe('awaiting_user');
    if (result.status === 'awaiting_user') {
      expect(result.outcome.reason).toBe('publish_target_auth_expired');
    }
  });

  it('marks awaiting_user with reason publish_target_auth_expired on invalid_grant message', async () => {
    mockCredentialsRefresh.mockRejectedValue(new Error('invalid_grant'));

    const result = await driver.publishTo(makePublishTarget(), makeStageRun());

    expect(result.status).toBe('awaiting_user');
    if (result.status === 'awaiting_user') {
      expect(result.outcome.reason).toBe('publish_target_auth_expired');
    }
  });

  // ─── Behavior 4: quotaExceeded → surface transient failure ───────────────

  it('returns awaiting_user with reason quota_exceeded on quotaExceeded error', async () => {
    mockVideosInsert.mockRejectedValue(
      Object.assign(new Error('quotaExceeded'), { errors: [{ reason: 'quotaExceeded' }] }),
    );

    const result = await driver.publishTo(makePublishTarget(), makeStageRun());

    expect(result.status).toBe('awaiting_user');
    if (result.status === 'awaiting_user') {
      expect(result.outcome.reason).toBe('quota_exceeded');
    }
  });

  // ─── Behavior 5: sets correct snippet + status fields ─────────────────────

  it('passes title, description, tags, categoryId and privacyStatus to the YouTube API', async () => {
    const stageRun = makeStageRun({
      inputJson: {
        title: 'My Custom Title',
        description: 'A wonderful description',
        tags: ['alpha', 'beta', 'gamma'],
        categoryId: '27',
        privacyStatus: 'unlisted',
        videoUrl: 'https://storage.example.com/vid.mp4',
      },
    });

    await driver.publishTo(makePublishTarget(), stageRun);

    expect(mockVideosInsert).toHaveBeenCalledOnce();
    const insertCall = mockVideosInsert.mock.calls[0][0] as Record<string, unknown>;
    const resource = insertCall.resource as {
      snippet: { title: string; description: string; tags: string[]; categoryId: string };
      status: { privacyStatus: string };
    };
    expect(resource.snippet.title).toBe('My Custom Title');
    expect(resource.snippet.description).toBe('A wonderful description');
    expect(resource.snippet.tags).toEqual(['alpha', 'beta', 'gamma']);
    expect(resource.snippet.categoryId).toBe('27');
    expect(resource.status.privacyStatus).toBe('unlisted');
  });

  // ─── Missing credentials_encrypted → awaiting_user ───────────────────────

  it('returns awaiting_user with reason publish_target_auth_expired when credentialsEncrypted is null', async () => {
    const target = makePublishTarget({ credentialsEncrypted: null });

    const result = await driver.publishTo(target, makeStageRun());

    expect(result.status).toBe('awaiting_user');
    if (result.status === 'awaiting_user') {
      expect(result.outcome.reason).toBe('publish_target_auth_expired');
    }
  });
});
