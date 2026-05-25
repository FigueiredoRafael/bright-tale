/**
 * Unit tests for the Apple Podcasts publish driver (T6.3).
 *
 * Category A/B — no real Apple API calls. All Supabase interactions are
 * mocked via the global __supabaseMock pattern so CI never hits the DB.
 *
 * Behaviors:
 * 1. Rejects payload missing itunesAuthor → failed / INVALID_ITUNES_METADATA
 * 2. Rejects payload missing itunesImageUrl → failed / INVALID_ITUNES_METADATA
 * 3. Rejects non-https itunes image URL → failed / INVALID_ITUNES_METADATA
 * 4. Rejects durationSec <= 0 → failed / INVALID_ITUNES_METADATA
 * 5. Happy path inserts podcast_episodes row with correct columns
 * 6. Returns published outcome with feed URL and guid externalId
 * 7. Generates deterministic guid from stage_run_id
 * 8. Returns failed on Supabase insert error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PublishTargetRow } from '../types.js';
import type { StageRun } from '@brighttale/shared/pipeline/inputs';

// ─── Mock Supabase via global __supabaseMock ──────────────────────────────────

const mockInsert = vi.fn();
const mockSelect = vi.fn();

const mockFrom = vi.fn(() => ({
  insert: mockInsert,
  select: mockSelect,
}));

const mockSupabase = { from: mockFrom };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: successful insert returns an episode row
  mockInsert.mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'ep-uuid-1',
          publish_target_id: 'pt-apple-1',
          channel_id: 'ch-1',
          stage_run_id: 'sr-apple-1',
          title: 'Test Episode',
          description: 'A great episode.',
          audio_url: 'https://storage.example.com/ep.mp3',
          duration_sec: 3600,
          guid: 'ch-1:sr-apple-1',
          published_at: '2026-05-16T00:00:00Z',
          itunes_explicit: false,
          itunes_image_url: 'https://example.com/cover.jpg',
          created_at: '2026-05-16T00:00:00Z',
          updated_at: '2026-05-16T00:00:00Z',
        },
        error: null,
      }),
    }),
  });

  (global as Record<string, unknown>).__supabaseMock = mockSupabase;
  process.env.NODE_ENV = 'test';
  process.env.FEED_BASE_URL = 'https://feeds.brighttale.io';
});

// Import driver AFTER mock is registered
import { ApplePodcastsDriver } from '../apple-podcasts-driver.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTarget(overrides: Partial<PublishTargetRow> = {}): PublishTargetRow {
  return {
    id: 'pt-apple-1',
    type: 'apple_podcasts',
    displayName: 'My Apple Podcast',
    credentialsEncrypted: null,
    configJson: { channelId: 'ch-1' },
    ...overrides,
  };
}

function makeStageRun(inputOverrides: Record<string, unknown> = {}): StageRun {
  return {
    id: 'sr-apple-1',
    projectId: 'proj-1',
    stage: 'publish',
    status: 'running',
    awaitingReason: null,
    payloadRef: null,
    attemptNo: 1,
    inputJson: {
      title: 'Test Episode',
      description: 'A great episode.',
      audioUrl: 'https://storage.example.com/ep.mp3',
      durationSec: 3600,
      itunesAuthor: 'Jane Doe',
      itunesImageUrl: 'https://example.com/cover.jpg',
      itunesExplicit: false,
      ...inputOverrides,
    },
    errorMessage: null,
    startedAt: '2026-05-16T00:00:00Z',
    finishedAt: null,
    trackId: 'track-1',
    publishTargetId: 'pt-apple-1',
    createdAt: '2026-05-16T00:00:00Z',
    updatedAt: '2026-05-16T00:00:00Z',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ApplePodcastsDriver', () => {
  const driver = new ApplePodcastsDriver();

  // ─── Behavior 1: missing itunesAuthor ───────────────────────────────────────

  it('returns failed with INVALID_ITUNES_METADATA when itunesAuthor is missing', async () => {
    const result = await driver.publishTo(
      makeTarget(),
      makeStageRun({ itunesAuthor: undefined }),
    );

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error.code).toBe('INVALID_ITUNES_METADATA');
      expect(result.error.message).toMatch(/itunesAuthor/i);
    }
  });

  // ─── Behavior 2: missing itunesImageUrl ────────────────────────────────────

  it('returns failed with INVALID_ITUNES_METADATA when itunesImageUrl is missing', async () => {
    const result = await driver.publishTo(
      makeTarget(),
      makeStageRun({ itunesImageUrl: undefined }),
    );

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error.code).toBe('INVALID_ITUNES_METADATA');
      expect(result.error.message).toMatch(/itunesImageUrl/i);
    }
  });

  // ─── Behavior 3: non-https itunes image URL ────────────────────────────────

  it('returns failed with INVALID_ITUNES_METADATA when itunesImageUrl is not https', async () => {
    const result = await driver.publishTo(
      makeTarget(),
      makeStageRun({ itunesImageUrl: 'http://example.com/cover.jpg' }),
    );

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error.code).toBe('INVALID_ITUNES_METADATA');
      expect(result.error.message).toMatch(/itunesImageUrl/i);
    }
  });

  // ─── Behavior 4: durationSec <= 0 ─────────────────────────────────────────

  it('returns failed with INVALID_ITUNES_METADATA when durationSec is 0', async () => {
    const result = await driver.publishTo(makeTarget(), makeStageRun({ durationSec: 0 }));

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error.code).toBe('INVALID_ITUNES_METADATA');
      expect(result.error.message).toMatch(/durationSec/i);
    }
  });

  it('returns failed with INVALID_ITUNES_METADATA when durationSec is negative', async () => {
    const result = await driver.publishTo(makeTarget(), makeStageRun({ durationSec: -1 }));

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error.code).toBe('INVALID_ITUNES_METADATA');
      expect(result.error.message).toMatch(/durationSec/i);
    }
  });

  // ─── Behavior 5: happy path inserts correct row ───────────────────────────

  it('inserts a podcast_episodes row with correct columns on success', async () => {
    await driver.publishTo(makeTarget(), makeStageRun());

    expect(mockFrom).toHaveBeenCalledWith('podcast_episodes');
    expect(mockInsert).toHaveBeenCalledOnce();

    const insertArgs = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArgs['channel_id']).toBe('ch-1');
    expect(insertArgs['publish_target_id']).toBe('pt-apple-1');
    expect(insertArgs['title']).toBe('Test Episode');
    expect(insertArgs['description']).toBe('A great episode.');
    expect(insertArgs['audio_url']).toBe('https://storage.example.com/ep.mp3');
    expect(insertArgs['duration_sec']).toBe(3600);
    expect(insertArgs['itunes_explicit']).toBe(false);
    expect(insertArgs['itunes_image_url']).toBe('https://example.com/cover.jpg');
    expect(insertArgs['stage_run_id']).toBe('sr-apple-1');
  });

  // ─── Behavior 6: returns published outcome ─────────────────────────────────

  it('returns published status with feed URL and guid as externalId', async () => {
    const result = await driver.publishTo(makeTarget(), makeStageRun());

    expect(result.status).toBe('published');
    if (result.status === 'published') {
      expect(result.result.publishedUrl).toContain('ch-1');
      expect(result.result.externalId).toBe('ch-1:sr-apple-1');
      expect(result.result.publishedAt).toBeTruthy();
    }
  });

  // ─── Behavior 7: deterministic guid from stage_run_id ─────────────────────

  it('generates guid as channelId:stageRunId when stage_run_id is present', async () => {
    await driver.publishTo(makeTarget(), makeStageRun());

    const insertArgs = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArgs['guid']).toBe('ch-1:sr-apple-1');
  });

  // ─── Behavior 8: Supabase insert error → failed ────────────────────────────

  it('returns failed outcome when Supabase insert fails', async () => {
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'constraint violation', code: '23505' },
        }),
      }),
    });

    const result = await driver.publishTo(makeTarget(), makeStageRun());

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error.code).toBe('DB_INSERT_FAILED');
    }
  });
});
