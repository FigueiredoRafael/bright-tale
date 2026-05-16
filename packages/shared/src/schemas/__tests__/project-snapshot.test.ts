/**
 * T9.F157 — ProjectSnapshot Zod schema tests (TDD: RED phase)
 *
 * Validates:
 *   - ProjectSnapshotSchema parses a valid multi-track snapshot
 *   - TrackSnapshotSchema validates per-track shape (object-keyed stageRuns, publishTargets)
 *   - Backward compat: snapshot with no tracks[] parses with empty array
 *   - Podcast track with 3 publishTargets parses correctly
 */
import { describe, it, expect } from 'vitest';
import {
  ProjectSnapshotSchema,
  TrackSnapshotSchema,
  PublishTargetSnapshotSchema,
} from '../project-snapshot';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeStageRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sr-1',
    projectId: 'proj-1',
    stage: 'brainstorm',
    status: 'completed',
    awaitingReason: null,
    payloadRef: null,
    attemptNo: 1,
    inputJson: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    trackId: null,
    publishTargetId: null,
    outcomeJson: null,
    createdAt: '2026-05-16T00:00:00Z',
    updatedAt: '2026-05-16T00:00:00Z',
    ...overrides,
  };
}

// ─── PublishTargetSnapshotSchema ─────────────────────────────────────────────

describe('PublishTargetSnapshotSchema', () => {
  it('parses a valid publish target', () => {
    const result = PublishTargetSnapshotSchema.safeParse({
      id: 'pt-1',
      displayName: 'WordPress (S03)',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a publish target missing id', () => {
    const result = PublishTargetSnapshotSchema.safeParse({ displayName: 'WP' });
    expect(result.success).toBe(false);
  });
});

// ─── TrackSnapshotSchema ──────────────────────────────────────────────────────

describe('TrackSnapshotSchema', () => {
  it('parses a minimal track (no stageRuns, no publishTargets)', () => {
    const result = TrackSnapshotSchema.safeParse({
      id: 'track-1',
      medium: 'blog',
      status: 'active',
      paused: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stageRuns).toEqual({});
      expect(result.data.publishTargets).toEqual([]);
    }
  });

  it('parses a blog track with object-keyed stageRuns and one publishTarget', () => {
    const track = {
      id: 'track-blog-1',
      medium: 'blog',
      status: 'active',
      paused: false,
      stageRuns: {
        production: makeStageRun({ stage: 'production', trackId: 'track-blog-1' }),
        review: makeStageRun({ stage: 'review', trackId: 'track-blog-1' }),
        assets: null,
        preview: null,
        publish: makeStageRun({ stage: 'publish', trackId: 'track-blog-1', publishTargetId: 'pt-wp-1' }),
      },
      publishTargets: [{ id: 'pt-wp-1', displayName: 'WordPress' }],
    };
    const result = TrackSnapshotSchema.safeParse(track);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stageRuns.production).not.toBeNull();
      expect(result.data.publishTargets).toHaveLength(1);
    }
  });

  it('parses a podcast track with 3 publishTargets (fan-out)', () => {
    const track = {
      id: 'track-podcast-1',
      medium: 'podcast',
      status: 'active',
      paused: false,
      stageRuns: {
        production: makeStageRun({ stage: 'production', trackId: 'track-podcast-1' }),
        review: makeStageRun({ stage: 'review', trackId: 'track-podcast-1' }),
        assets: null,
        preview: null,
        publish: makeStageRun({ stage: 'publish', trackId: 'track-podcast-1', publishTargetId: 'pt-spotify-1' }),
      },
      publishTargets: [
        { id: 'pt-spotify-1', displayName: 'Spotify' },
        { id: 'pt-yt-pod-1', displayName: 'YouTube Podcast' },
        { id: 'pt-apple-1', displayName: 'Apple Podcasts' },
      ],
    };
    const result = TrackSnapshotSchema.safeParse(track);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.publishTargets).toHaveLength(3);
    }
  });

  it('rejects an invalid medium', () => {
    const result = TrackSnapshotSchema.safeParse({
      id: 'track-1',
      medium: 'email_newsletter',
      status: 'active',
      paused: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid status', () => {
    const result = TrackSnapshotSchema.safeParse({
      id: 'track-1',
      medium: 'blog',
      status: 'unknown_status',
      paused: false,
    });
    expect(result.success).toBe(false);
  });
});

// ─── ProjectSnapshotSchema ────────────────────────────────────────────────────

describe('ProjectSnapshotSchema', () => {
  it('parses a full 3-track snapshot (blog+video+podcast)', () => {
    const snapshot = {
      project: { mode: 'autopilot', paused: false },
      stageRuns: [
        makeStageRun({ stage: 'brainstorm', trackId: null }),
        makeStageRun({ stage: 'research', trackId: null }),
        makeStageRun({ stage: 'canonical', trackId: null }),
      ],
      tracks: [
        {
          id: 'track-blog-1',
          medium: 'blog',
          status: 'active',
          paused: false,
          stageRuns: { production: makeStageRun({ stage: 'production', trackId: 'track-blog-1' }), review: null, assets: null, preview: null, publish: null },
          publishTargets: [{ id: 'pt-wp-1', displayName: 'WordPress' }],
        },
        {
          id: 'track-video-1',
          medium: 'video',
          status: 'active',
          paused: false,
          stageRuns: { production: null, review: null, assets: null, preview: null, publish: null },
          publishTargets: [{ id: 'pt-yt-1', displayName: 'YouTube' }],
        },
        {
          id: 'track-podcast-1',
          medium: 'podcast',
          status: 'active',
          paused: false,
          stageRuns: { production: null, review: null, assets: null, preview: null, publish: null },
          publishTargets: [
            { id: 'pt-spotify-1', displayName: 'Spotify' },
            { id: 'pt-yt-pod-1', displayName: 'YouTube Podcast' },
            { id: 'pt-apple-1', displayName: 'Apple Podcasts' },
          ],
        },
      ],
      allAttempts: [
        makeStageRun({ stage: 'brainstorm', trackId: null }),
      ],
    };
    const result = ProjectSnapshotSchema.safeParse(snapshot);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tracks).toHaveLength(3);
      const podcastTrack = result.data.tracks.find((t) => t.medium === 'podcast');
      expect(podcastTrack?.publishTargets).toHaveLength(3);
    }
  });

  it('parses a snapshot with no tracks field (backward compat: legacy project)', () => {
    const snapshot = {
      project: { mode: 'manual', paused: false },
      stageRuns: [makeStageRun({ stage: 'brainstorm', trackId: null })],
    };
    const result = ProjectSnapshotSchema.safeParse(snapshot);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tracks).toEqual([]);
    }
  });

  it('parses a snapshot with an empty tracks array', () => {
    const snapshot = {
      project: { mode: 'autopilot', paused: false },
      stageRuns: [],
      tracks: [],
    };
    const result = ProjectSnapshotSchema.safeParse(snapshot);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tracks).toEqual([]);
    }
  });

  it('rejects when stageRuns is missing', () => {
    const result = ProjectSnapshotSchema.safeParse({
      project: { mode: 'autopilot', paused: false },
    });
    expect(result.success).toBe(false);
  });

  it('exposes inferred TS types (TypeScript compile check via runtime check)', () => {
    const snapshot = ProjectSnapshotSchema.parse({
      project: { mode: 'autopilot', paused: false },
      stageRuns: [],
      tracks: [],
    });
    // TypeScript would catch these at compile time too
    expect(typeof snapshot.project.mode).toBe('string');
    expect(Array.isArray(snapshot.tracks)).toBe(true);
    expect(Array.isArray(snapshot.stageRuns)).toBe(true);
  });
});
