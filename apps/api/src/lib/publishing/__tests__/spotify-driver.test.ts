/**
 * Unit tests for the Spotify publish driver (T6.2).
 *
 * Category A/B — no real Spotify API calls. Supabase client is fully mocked
 * via the `global.__supabaseMock` injection point in
 * `apps/api/src/lib/supabase/index.ts`.
 *
 * Behaviors:
 * 1. Writes podcast_episodes row with correct shape on happy path
 * 2. Generates deterministic guid when stage_run_id provided
 * 3. Generates uuid guid when stage_run_id is absent
 * 4. Returns `published` status with externalId equal to guid
 * 5. Supabase insert error → returns awaiting_user outcome
 * 6. Skips channel feed_updated_at bump (column not in schema)
 * 7. Includes itunes_explicit and itunes_image_url in inserted row
 * 8. Works when credentialsEncrypted is null (no credentials stored)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpotifyDriver } from '../spotify-driver.js';
import type { PublishTargetRow } from '../types.js';
import type { StageRun } from '@brighttale/shared/pipeline/inputs';

// ─── Supabase mock helpers ────────────────────────────────────────────────────

process.env.ENCRYPTION_SECRET = 'a'.repeat(64);
process.env.NODE_ENV = 'test';

function makeSupabaseMock(insertResult?: { data: unknown; error: unknown }) {
  const resolvedResult = insertResult ?? {
    data: {
      id: 'ep-001',
      guid: 'ch-1:sr-1',
      publish_target_id: 'pt-1',
      channel_id: 'ch-1',
      title: 'Test Episode',
      description: 'Desc',
      audio_url: 'https://example.com/audio.mp3',
      duration_sec: 1800,
      published_at: new Date().toISOString(),
      itunes_explicit: false,
      itunes_image_url: null,
      stage_run_id: 'sr-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    error: null,
  };

  const single = vi.fn().mockResolvedValue(resolvedResult);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const fromFn = vi.fn().mockReturnValue({ insert });

  return {
    from: fromFn,
    _mocks: { insert, select, single },
  };
}

// ─── Test data builders ───────────────────────────────────────────────────────

function makePublishTarget(overrides: Partial<PublishTargetRow> = {}): PublishTargetRow {
  return {
    id: 'pt-1',
    type: 'spotify',
    displayName: 'My Spotify Show',
    credentialsEncrypted: null,
    configJson: { channelId: 'ch-1', feedUrl: 'https://feeds.example.com/ch-1.xml' },
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
      title: 'Test Episode',
      description: 'Episode description.',
      audioUrl: 'https://example.com/audio.mp3',
      durationSec: 1800,
      itunesExplicit: false,
      thumbnailUrl: 'https://example.com/thumb.jpg',
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SpotifyDriver', () => {
  const driver = new SpotifyDriver();

  beforeEach(() => {
    vi.clearAllMocks();
    delete global.__supabaseMock;
  });

  // ─── Behavior 1: writes podcast_episodes row with correct shape ────────────

  it('inserts a podcast_episodes row with correct fields on happy path', async () => {
    const sbMock = makeSupabaseMock();
    global.__supabaseMock = sbMock as unknown as typeof global.__supabaseMock;

    await driver.publishTo(makePublishTarget(), makeStageRun());

    expect(sbMock.from).toHaveBeenCalledWith('podcast_episodes');
    const insertCall = sbMock._mocks.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertCall['publish_target_id']).toBe('pt-1');
    expect(insertCall['channel_id']).toBe('ch-1');
    expect(insertCall['title']).toBe('Test Episode');
    expect(insertCall['description']).toBe('Episode description.');
    expect(insertCall['audio_url']).toBe('https://example.com/audio.mp3');
    expect(insertCall['duration_sec']).toBe(1800);
  });

  // ─── Behavior 2: deterministic guid when stage_run_id provided ────────────

  it('generates guid as channel_id:stage_run_id when stage_run_id is present', async () => {
    const sbMock = makeSupabaseMock();
    global.__supabaseMock = sbMock as unknown as typeof global.__supabaseMock;

    await driver.publishTo(makePublishTarget(), makeStageRun({ id: 'sr-abc' }));

    const insertCall = sbMock._mocks.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertCall['guid']).toBe('ch-1:sr-abc');
    expect(insertCall['stage_run_id']).toBe('sr-abc');
  });

  // ─── Behavior 3: uuid guid when stage_run_id is missing ──────────────────

  it('generates a uuid-based guid when stage_run_id is absent', async () => {
    const sbMock = makeSupabaseMock();
    global.__supabaseMock = sbMock as unknown as typeof global.__supabaseMock;

    await driver.publishTo(makePublishTarget(), makeStageRun({ id: '' }));

    const insertCall = sbMock._mocks.insert.mock.calls[0][0] as Record<string, unknown>;
    const guid = insertCall['guid'] as string;
    expect(guid).toMatch(/^ch-1:/);
    // guid suffix should be a uuid (36 chars: 8-4-4-4-12 + hyphens)
    const suffix = guid.slice('ch-1:'.length);
    expect(suffix).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  // ─── Behavior 4: returns published status with externalId ─────────────────

  it('returns published status with externalId equal to the inserted guid', async () => {
    const sbMock = makeSupabaseMock();
    global.__supabaseMock = sbMock as unknown as typeof global.__supabaseMock;

    const result = await driver.publishTo(makePublishTarget(), makeStageRun());

    expect(result.status).toBe('published');
    if (result.status === 'published') {
      expect(result.result.externalId).toBe('ch-1:sr-1');
      expect(result.result.publishedAt).toBeTruthy();
    }
  });

  // ─── Behavior 5: supabase insert error → awaiting_user ───────────────────

  it('returns awaiting_user with publish_target_auth_expired when supabase insert fails', async () => {
    const sbMock = makeSupabaseMock({
      data: null,
      error: { code: 'PGRST301', message: 'DB insert error' },
    });
    global.__supabaseMock = sbMock as unknown as typeof global.__supabaseMock;

    const result = await driver.publishTo(makePublishTarget(), makeStageRun());

    expect(result.status).toBe('awaiting_user');
    if (result.status === 'awaiting_user') {
      expect(result.outcome.reason).toBe('publish_target_auth_expired');
      expect(result.outcome.details).toContain('DB insert error');
    }
  });

  // ─── Behavior 6: only touches podcast_episodes (no channel update) ────────

  it('does not attempt to update channels table (feed_updated_at not in schema)', async () => {
    const sbMock = makeSupabaseMock();
    global.__supabaseMock = sbMock as unknown as typeof global.__supabaseMock;

    const result = await driver.publishTo(makePublishTarget(), makeStageRun());

    expect(result.status).toBe('published');
    expect(sbMock.from).toHaveBeenCalledTimes(1);
    expect(sbMock.from).toHaveBeenCalledWith('podcast_episodes');
  });

  // ─── Behavior 7: itunes_explicit + itunes_image_url in insert ─────────────

  it('includes itunes_explicit and itunes_image_url in the inserted row', async () => {
    const sbMock = makeSupabaseMock();
    global.__supabaseMock = sbMock as unknown as typeof global.__supabaseMock;

    const stageRun = makeStageRun({
      inputJson: {
        title: 'Explicit Episode',
        description: 'Contains mature content.',
        audioUrl: 'https://example.com/explicit.mp3',
        durationSec: 3600,
        itunesExplicit: true,
        thumbnailUrl: 'https://example.com/cover.jpg',
      },
    });

    await driver.publishTo(makePublishTarget(), stageRun);

    const insertCall = sbMock._mocks.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertCall['itunes_explicit']).toBe(true);
    expect(insertCall['itunes_image_url']).toBe('https://example.com/cover.jpg');
  });

  // ─── Behavior 8: works without credentials (no Spotify claim yet) ─────────

  it('publishes successfully when credentialsEncrypted is null', async () => {
    const sbMock = makeSupabaseMock();
    global.__supabaseMock = sbMock as unknown as typeof global.__supabaseMock;

    const target = makePublishTarget({ credentialsEncrypted: null });
    const result = await driver.publishTo(target, makeStageRun());

    expect(result.status).toBe('published');
    if (result.status === 'published') {
      expect(result.result.externalId).toBeTruthy();
      expect(result.result.publishedAt).toBeTruthy();
    }
  });
});
