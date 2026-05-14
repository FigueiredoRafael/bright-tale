/**
 * T1.11 — fan-out-planner unit tests
 *
 * Table-driven tests for every transition the planner encodes. Each describe
 * block maps to one pipeline transition or invariant. Cases mirror the 14 E2E
 * scenarios from the PRD at the planner level.
 *
 * No DB. No async. All assertions are on the StageRunSpec[] returned by
 * planNext().
 */

import { describe, it, expect } from 'vitest';
import {
  planNext,
  MEDIUM_TO_TARGET_TYPES,
  type AutopilotConfig,
  type Medium,
  type Project,
  type PublishTarget,
  type PublishTargetType,
  type StageRunSpec,
  type Track,
} from '../fan-out-planner';
import type { StageRun } from '@brighttale/shared/pipeline/inputs.js';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

let _id = 0;
function uid(prefix = 'id'): string {
  return `${prefix}-${++_id}`;
}

function makeRun(overrides: Partial<StageRun> = {}): StageRun {
  return {
    id: uid('run'),
    projectId: 'project-1',
    trackId: null,
    publishTargetId: null,
    stage: 'brainstorm',
    status: 'completed',
    awaitingReason: null,
    payloadRef: null,
    attemptNo: 1,
    inputJson: {},
    outcomeJson: undefined,
    errorMessage: null,
    startedAt: '2026-05-14T00:00:00Z',
    finishedAt: '2026-05-14T00:01:00Z',
    createdAt: '2026-05-14T00:00:00Z',
    updatedAt: '2026-05-14T00:01:00Z',
    ...overrides,
  };
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: uid('track'),
    projectId: 'project-1',
    medium: 'blog',
    status: 'active',
    paused: false,
    autopilotConfigJson: null,
    ...overrides,
  };
}

function makeTarget(overrides: Partial<PublishTarget> = {}): PublishTarget {
  return {
    id: uid('target'),
    channelId: 'channel-1',
    orgId: null,
    type: 'wordpress',
    displayName: 'My WP Site',
    isActive: true,
    ...overrides,
  };
}

const defaultProject: Project = {
  id: 'project-1',
  autopilotConfigJson: null,
};

const defaultAutopilot: AutopilotConfig = {};

function plan(
  completedRun: StageRun,
  {
    tracks = [],
    publishTargets = [],
    priorRuns = [],
    autopilotConfig = defaultAutopilot,
    project = defaultProject,
  }: {
    tracks?: Track[];
    publishTargets?: PublishTarget[];
    priorRuns?: StageRun[];
    autopilotConfig?: AutopilotConfig;
    project?: Project;
  } = {},
): StageRunSpec[] {
  return planNext({
    completedRun,
    project,
    tracks,
    publishTargets,
    priorRuns,
    autopilotConfig,
  });
}

// ─── 1. brainstorm → research ─────────────────────────────────────────────────

describe('brainstorm → research', () => {
  it('enqueues research attempt 1 when brainstorm completes', () => {
    const run = makeRun({ stage: 'brainstorm', status: 'completed' });
    const result = plan(run);
    expect(result).toEqual<StageRunSpec[]>([
      { stage: 'research', trackId: null, publishTargetId: null, attemptNo: 1 },
    ]);
  });

  it('does not re-enqueue research when already queued', () => {
    const run = makeRun({ stage: 'brainstorm', status: 'completed' });
    const priorRuns = [makeRun({ stage: 'research', status: 'queued', trackId: null })];
    const result = plan(run, { priorRuns });
    expect(result).toHaveLength(0);
  });

  it('does not re-enqueue research when already running', () => {
    const run = makeRun({ stage: 'brainstorm', status: 'completed' });
    const priorRuns = [makeRun({ stage: 'research', status: 'running', trackId: null })];
    const result = plan(run, { priorRuns });
    expect(result).toHaveLength(0);
  });

  it('does not re-enqueue research when already completed', () => {
    const run = makeRun({ stage: 'brainstorm', status: 'completed' });
    const priorRuns = [makeRun({ stage: 'research', status: 'completed', trackId: null })];
    const result = plan(run, { priorRuns });
    expect(result).toHaveLength(0);
  });

  it('returns empty for non-terminal brainstorm status (failed)', () => {
    const run = makeRun({ stage: 'brainstorm', status: 'failed' });
    const result = plan(run);
    expect(result).toHaveLength(0);
  });
});

// ─── 2. research → canonical (confidence met) ────────────────────────────────

describe('research → canonical (confidence threshold met)', () => {
  it('enqueues canonical when confidence equals threshold (default 70)', () => {
    const run = makeRun({
      stage: 'research',
      status: 'completed',
      outcomeJson: { idea_validation: { confidence_score: 70 } },
    });
    const result = plan(run);
    expect(result).toEqual<StageRunSpec[]>([
      { stage: 'canonical', trackId: null, publishTargetId: null, attemptNo: 1 },
    ]);
  });

  it('enqueues canonical when confidence exceeds threshold', () => {
    const run = makeRun({
      stage: 'research',
      status: 'completed',
      outcomeJson: { idea_validation: { confidence_score: 95 } },
    });
    const result = plan(run);
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('canonical');
  });

  it('enqueues canonical when confidence is unknown (null outcomeJson) — advance by default', () => {
    const run = makeRun({ stage: 'research', status: 'completed', outcomeJson: null });
    const result = plan(run);
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('canonical');
  });

  it('enqueues canonical when confidence field is missing from outcome', () => {
    const run = makeRun({
      stage: 'research',
      status: 'completed',
      outcomeJson: { research_summary: 'good research' },
    });
    const result = plan(run);
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('canonical');
  });

  it('uses custom confidence threshold from autopilotConfig', () => {
    const run = makeRun({
      stage: 'research',
      status: 'completed',
      outcomeJson: { idea_validation: { confidence_score: 65 } },
    });
    // Custom threshold of 60 — should pass.
    const result = plan(run, {
      autopilotConfig: { research: { confidenceThreshold: 60 } },
    });
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('canonical');
  });

  it('does not re-enqueue canonical when already queued', () => {
    const run = makeRun({
      stage: 'research',
      status: 'completed',
      outcomeJson: { idea_validation: { confidence_score: 80 } },
    });
    const priorRuns = [makeRun({ stage: 'canonical', status: 'queued', trackId: null })];
    const result = plan(run, { priorRuns });
    expect(result).toHaveLength(0);
  });
});

// ─── 3. research → research (confidence loop) ────────────────────────────────

describe('research → research (confidence loop)', () => {
  it('spawns research attempt 2 when confidence is below threshold', () => {
    const run = makeRun({
      stage: 'research',
      status: 'completed',
      attemptNo: 1,
      outcomeJson: { idea_validation: { confidence_score: 42 } },
    });
    const result = plan(run, {
      autopilotConfig: { research: { confidenceThreshold: 70, maxIterations: 3 } },
    });
    expect(result).toEqual<StageRunSpec[]>([
      { stage: 'research', trackId: null, publishTargetId: null, attemptNo: 2 },
    ]);
  });

  it('spawns research attempt 3 on second iteration below threshold', () => {
    const run = makeRun({
      stage: 'research',
      status: 'completed',
      attemptNo: 2,
      outcomeJson: { idea_validation: { confidence_score: 62 } },
    });
    const result = plan(run, {
      autopilotConfig: { research: { confidenceThreshold: 70, maxIterations: 3 } },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ stage: 'research', attemptNo: 3 });
  });

  it('hard-advances to canonical when max iterations reached (attempt == max)', () => {
    const run = makeRun({
      stage: 'research',
      status: 'completed',
      attemptNo: 3,
      outcomeJson: { idea_validation: { confidence_score: 55 } },
    });
    const result = plan(run, {
      autopilotConfig: { research: { confidenceThreshold: 70, maxIterations: 3 } },
    });
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('canonical');
  });

  it('uses default maxIterations (3) when not configured', () => {
    const run = makeRun({
      stage: 'research',
      status: 'completed',
      attemptNo: 3,
      outcomeJson: { idea_validation: { confidence_score: 50 } },
    });
    const result = plan(run);
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('canonical');
  });

  it('does not spawn next attempt when already enqueued', () => {
    const run = makeRun({
      stage: 'research',
      status: 'completed',
      attemptNo: 1,
      outcomeJson: { idea_validation: { confidence_score: 40 } },
    });
    const priorRuns = [
      makeRun({ stage: 'research', status: 'queued', attemptNo: 2, trackId: null }),
    ];
    const result = plan(run, {
      priorRuns,
      autopilotConfig: { research: { confidenceThreshold: 70, maxIterations: 3 } },
    });
    expect(result).toHaveLength(0);
  });
});

// ─── 4. canonical → production × Tracks ─────────────────────────────────────

describe('canonical → production fan-out', () => {
  it('enqueues one production run for a single active Track', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const run = makeRun({ stage: 'canonical', status: 'completed' });
    const result = plan(run, { tracks: [track] });
    expect(result).toEqual<StageRunSpec[]>([
      {
        stage: 'production',
        trackId: 'track-blog',
        publishTargetId: null,
        attemptNo: 1,
      },
    ]);
  });

  it('enqueues three production runs in parallel for 3 active Tracks', () => {
    const t1 = makeTrack({ id: 'track-blog', medium: 'blog' });
    const t2 = makeTrack({ id: 'track-video', medium: 'video' });
    const t3 = makeTrack({ id: 'track-podcast', medium: 'podcast' });
    const run = makeRun({ stage: 'canonical', status: 'completed' });
    const result = plan(run, { tracks: [t1, t2, t3] });
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.trackId).sort()).toEqual(
      ['track-blog', 'track-podcast', 'track-video'],
    );
    result.forEach((spec) => {
      expect(spec.stage).toBe('production');
      expect(spec.attemptNo).toBe(1);
      expect(spec.publishTargetId).toBeNull();
    });
  });

  it('excludes aborted Tracks from fan-out', () => {
    const active = makeTrack({ id: 'track-blog', medium: 'blog', status: 'active' });
    const aborted = makeTrack({ id: 'track-video', medium: 'video', status: 'aborted' });
    const run = makeRun({ stage: 'canonical', status: 'completed' });
    const result = plan(run, { tracks: [active, aborted] });
    expect(result).toHaveLength(1);
    expect(result[0].trackId).toBe('track-blog');
  });

  it('excludes paused Tracks from fan-out', () => {
    const active = makeTrack({ id: 'track-blog', medium: 'blog', paused: false });
    const paused = makeTrack({ id: 'track-video', medium: 'video', paused: true });
    const run = makeRun({ stage: 'canonical', status: 'completed' });
    const result = plan(run, { tracks: [active, paused] });
    expect(result).toHaveLength(1);
    expect(result[0].trackId).toBe('track-blog');
  });

  it('returns empty when no active Tracks exist', () => {
    const run = makeRun({ stage: 'canonical', status: 'completed' });
    const result = plan(run, { tracks: [] });
    expect(result).toHaveLength(0);
  });

  it('does not re-enqueue production when already queued for a Track', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const priorRuns = [
      makeRun({
        stage: 'production',
        status: 'queued',
        trackId: 'track-blog',
      }),
    ];
    const run = makeRun({ stage: 'canonical', status: 'completed' });
    const result = plan(run, { tracks: [track], priorRuns });
    expect(result).toHaveLength(0);
  });

  it('skips only already-enqueued tracks, fans out to others', () => {
    const t1 = makeTrack({ id: 'track-blog', medium: 'blog' });
    const t2 = makeTrack({ id: 'track-video', medium: 'video' });
    const priorRuns = [
      makeRun({ stage: 'production', status: 'running', trackId: 'track-blog' }),
    ];
    const run = makeRun({ stage: 'canonical', status: 'completed' });
    const result = plan(run, { tracks: [t1, t2], priorRuns });
    expect(result).toHaveLength(1);
    expect(result[0].trackId).toBe('track-video');
  });
});

// ─── 5. production → review ──────────────────────────────────────────────────

describe('production → review', () => {
  it('enqueues review with the same attemptNo as production', () => {
    const track = makeTrack({ id: 'track-blog' });
    const run = makeRun({
      stage: 'production',
      status: 'completed',
      trackId: 'track-blog',
      attemptNo: 1,
    });
    const result = plan(run, { tracks: [track] });
    expect(result).toEqual<StageRunSpec[]>([
      {
        stage: 'review',
        trackId: 'track-blog',
        publishTargetId: null,
        attemptNo: 1,
      },
    ]);
  });

  it('enqueues review attempt 2 for second production attempt', () => {
    const track = makeTrack({ id: 'track-blog' });
    const run = makeRun({
      stage: 'production',
      status: 'completed',
      trackId: 'track-blog',
      attemptNo: 2,
    });
    const result = plan(run, { tracks: [track] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ stage: 'review', attemptNo: 2 });
  });

  it('returns empty when production trackId is null', () => {
    const run = makeRun({
      stage: 'production',
      status: 'completed',
      trackId: null,
    });
    const result = plan(run);
    expect(result).toHaveLength(0);
  });

  it('returns empty when Track is aborted', () => {
    const track = makeTrack({ id: 'track-video', status: 'aborted' });
    const run = makeRun({
      stage: 'production',
      status: 'completed',
      trackId: 'track-video',
    });
    const result = plan(run, { tracks: [track] });
    expect(result).toHaveLength(0);
  });

  it('does not re-enqueue review when already queued', () => {
    const track = makeTrack({ id: 'track-blog' });
    const priorRuns = [
      makeRun({ stage: 'review', status: 'queued', trackId: 'track-blog' }),
    ];
    const run = makeRun({
      stage: 'production',
      status: 'completed',
      trackId: 'track-blog',
    });
    const result = plan(run, { tracks: [track], priorRuns });
    expect(result).toHaveLength(0);
  });
});

// ─── 6. review → production (revision loop) ──────────────────────────────────

describe('review → production (revision loop)', () => {
  it('spawns production attempt 2 when score is below minScore', () => {
    const track = makeTrack({ id: 'track-video', medium: 'video' });
    const run = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-video',
      attemptNo: 1,
      outcomeJson: { overall_score: 78 },
    });
    const result = plan(run, {
      tracks: [track],
      autopilotConfig: { review: { autoApproveThreshold: 90, maxIterations: 5 } },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      stage: 'production',
      trackId: 'track-video',
      attemptNo: 2,
    });
  });

  it('advances to assets when score meets minScore', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const run = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-blog',
      attemptNo: 1,
      outcomeJson: { overall_score: 92 },
    });
    const result = plan(run, {
      tracks: [track],
      autopilotConfig: { review: { autoApproveThreshold: 90, maxIterations: 5 } },
    });
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('assets');
  });

  it('advances to assets when score exactly equals minScore', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const run = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-blog',
      attemptNo: 1,
      outcomeJson: { overall_score: 90 },
    });
    const result = plan(run, {
      tracks: [track],
      autopilotConfig: { review: { autoApproveThreshold: 90, maxIterations: 5 } },
    });
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('assets');
  });

  it('hard-advances to assets when max iterations reached', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const run = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-blog',
      attemptNo: 5,
      outcomeJson: { overall_score: 60 },
    });
    const result = plan(run, {
      tracks: [track],
      autopilotConfig: { review: { autoApproveThreshold: 90, maxIterations: 5 } },
    });
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('assets');
  });

  it('uses per-Track autopilotConfigJson override for minScore', () => {
    const track = makeTrack({
      id: 'track-podcast',
      medium: 'podcast',
      autopilotConfigJson: {
        review: { autoApproveThreshold: 95 },
      },
    });
    const run = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-podcast',
      attemptNo: 1,
      outcomeJson: { overall_score: 91 }, // passes default 90, fails per-track 95
    });
    const result = plan(run, {
      tracks: [track],
      autopilotConfig: { review: { autoApproveThreshold: 90, maxIterations: 5 } },
    });
    // Track override 95 wins → score 91 < 95 → revision
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('production');
    expect(result[0].attemptNo).toBe(2);
  });

  it('uses per-Track maxIterations override', () => {
    const track = makeTrack({
      id: 'track-video',
      medium: 'video',
      autopilotConfigJson: {
        review: { autoApproveThreshold: 90, maxIterations: 2 },
      },
    });
    const run = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-video',
      attemptNo: 2, // at track-level max
      outcomeJson: { overall_score: 70 },
    });
    const result = plan(run, {
      tracks: [track],
      autopilotConfig: { review: { autoApproveThreshold: 90, maxIterations: 5 } },
    });
    // Track override maxIterations=2, attemptNo=2 → hard-advance
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('assets');
  });

  it('uses default minScore (90) when no config provided', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const run = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-blog',
      attemptNo: 1,
      outcomeJson: { overall_score: 89 },
    });
    const result = plan(run, { tracks: [track] });
    // Default 90 → 89 < 90 → revision
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('production');
  });

  it('treats unknown score as not-passing', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const run = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-blog',
      attemptNo: 1,
      outcomeJson: { rubric_checks: {} }, // no overall_score
    });
    const result = plan(run, {
      tracks: [track],
      autopilotConfig: { review: { autoApproveThreshold: 90, maxIterations: 5 } },
    });
    // Unknown score → revision
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('production');
  });

  it('does not re-enqueue next production when already queued', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const priorRuns = [
      makeRun({ stage: 'production', status: 'queued', trackId: 'track-blog', attemptNo: 2 }),
    ];
    const run = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-blog',
      attemptNo: 1,
      outcomeJson: { overall_score: 70 },
    });
    const result = plan(run, {
      tracks: [track],
      priorRuns,
      autopilotConfig: { review: { autoApproveThreshold: 90, maxIterations: 5 } },
    });
    expect(result).toHaveLength(0);
  });
});

// ─── 7. review → assets (normal assets mode) ─────────────────────────────────

describe('review → assets (normal mode)', () => {
  it('enqueues assets after review passes (briefs_only mode)', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const run = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-blog',
      attemptNo: 1,
      outcomeJson: { overall_score: 95 },
    });
    const result = plan(run, {
      tracks: [track],
      autopilotConfig: {
        review: { autoApproveThreshold: 90, maxIterations: 5 },
        assets: { mode: 'briefs_only' },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      stage: 'assets',
      trackId: 'track-blog',
      attemptNo: 1,
    });
    // No synthetic skipped status for real assets
    expect(result[0].status).toBeUndefined();
  });

  it('does not re-enqueue assets when already exists', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const priorRuns = [
      makeRun({ stage: 'assets', status: 'queued', trackId: 'track-blog' }),
    ];
    const run = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-blog',
      attemptNo: 1,
      outcomeJson: { overall_score: 95 },
    });
    const result = plan(run, { tracks: [track], priorRuns });
    expect(result).toHaveLength(0);
  });
});

// ─── 8. assets skip mode ─────────────────────────────────────────────────────

describe('assets skip mode', () => {
  it('inserts skipped Assets row + enqueues Preview when assets.mode === skip', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const run = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-blog',
      attemptNo: 1,
      outcomeJson: { overall_score: 95 },
    });
    const result = plan(run, {
      tracks: [track],
      autopilotConfig: {
        review: { autoApproveThreshold: 90, maxIterations: 5 },
        assets: { mode: 'skip' },
      },
    });
    expect(result).toHaveLength(2);
    const assetsSpec = result.find((r) => r.stage === 'assets');
    const previewSpec = result.find((r) => r.stage === 'preview');
    expect(assetsSpec).toBeDefined();
    expect(assetsSpec?.status).toBe('skipped');
    expect(assetsSpec?.trackId).toBe('track-blog');
    expect(previewSpec).toBeDefined();
    expect(previewSpec?.status).toBeUndefined();
    expect(previewSpec?.trackId).toBe('track-blog');
  });

  it('skips the assets synthetic insert if assets row already exists', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const priorRuns = [
      makeRun({ stage: 'assets', status: 'skipped', trackId: 'track-blog' }),
    ];
    const run = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-blog',
      attemptNo: 1,
      outcomeJson: { overall_score: 95 },
    });
    const result = plan(run, {
      tracks: [track],
      priorRuns,
      autopilotConfig: {
        review: { autoApproveThreshold: 90, maxIterations: 5 },
        assets: { mode: 'skip' },
      },
    });
    // Only the preview spec (assets already done)
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('preview');
  });

  it('does not re-enqueue preview if already queued in skip mode', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const priorRuns = [
      makeRun({ stage: 'preview', status: 'queued', trackId: 'track-blog' }),
    ];
    const run = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-blog',
      attemptNo: 1,
      outcomeJson: { overall_score: 95 },
    });
    const result = plan(run, {
      tracks: [track],
      priorRuns,
      autopilotConfig: {
        review: { autoApproveThreshold: 90, maxIterations: 5 },
        assets: { mode: 'skip' },
      },
    });
    // Assets skipped spec only (preview already queued)
    const previewSpecs = result.filter((r) => r.stage === 'preview');
    expect(previewSpecs).toHaveLength(0);
  });
});

// ─── 9. assets → preview ─────────────────────────────────────────────────────

describe('assets → preview', () => {
  it('enqueues preview after assets completes', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const run = makeRun({
      stage: 'assets',
      status: 'completed',
      trackId: 'track-blog',
    });
    const result = plan(run, { tracks: [track] });
    expect(result).toEqual<StageRunSpec[]>([
      {
        stage: 'preview',
        trackId: 'track-blog',
        publishTargetId: null,
        attemptNo: 1,
      },
    ]);
  });

  it('enqueues preview after assets is skipped', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const run = makeRun({
      stage: 'assets',
      status: 'skipped',
      trackId: 'track-blog',
    });
    const result = plan(run, { tracks: [track] });
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('preview');
  });

  it('returns empty when Track is aborted', () => {
    const track = makeTrack({ id: 'track-blog', status: 'aborted' });
    const run = makeRun({
      stage: 'assets',
      status: 'completed',
      trackId: 'track-blog',
    });
    const result = plan(run, { tracks: [track] });
    expect(result).toHaveLength(0);
  });

  it('does not re-enqueue preview when already queued', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const priorRuns = [
      makeRun({ stage: 'preview', status: 'queued', trackId: 'track-blog' }),
    ];
    const run = makeRun({
      stage: 'assets',
      status: 'completed',
      trackId: 'track-blog',
    });
    const result = plan(run, { tracks: [track], priorRuns });
    expect(result).toHaveLength(0);
  });
});

// ─── 10. preview → publish × publish_targets ─────────────────────────────────

describe('preview → publish fan-out', () => {
  it('enqueues one publish run per active compatible publish_target for blog', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const wp = makeTarget({ id: 'target-wp', type: 'wordpress' });
    const rss = makeTarget({ id: 'target-rss', type: 'rss' });
    const run = makeRun({
      stage: 'preview',
      status: 'completed',
      trackId: 'track-blog',
    });
    const result = plan(run, { tracks: [track], publishTargets: [wp, rss] });
    expect(result).toHaveLength(2);
    const targetIds = result.map((r) => r.publishTargetId).sort();
    expect(targetIds).toEqual(['target-rss', 'target-wp']);
    result.forEach((spec) => {
      expect(spec.stage).toBe('publish');
      expect(spec.trackId).toBe('track-blog');
      expect(spec.attemptNo).toBe(1);
    });
  });

  it('enqueues publish for youtube only for video Track', () => {
    const track = makeTrack({ id: 'track-video', medium: 'video' });
    const yt = makeTarget({ id: 'target-yt', type: 'youtube' });
    const wp = makeTarget({ id: 'target-wp', type: 'wordpress' }); // incompatible
    const run = makeRun({
      stage: 'preview',
      status: 'completed',
      trackId: 'track-video',
    });
    const result = plan(run, { tracks: [track], publishTargets: [yt, wp] });
    expect(result).toHaveLength(1);
    expect(result[0].publishTargetId).toBe('target-yt');
  });

  it('enqueues 3 publish runs for podcast Track (spotify + apple_podcasts + rss)', () => {
    const track = makeTrack({ id: 'track-podcast', medium: 'podcast' });
    const spotify = makeTarget({ id: 'target-spotify', type: 'spotify' });
    const apple = makeTarget({ id: 'target-apple', type: 'apple_podcasts' });
    const rss = makeTarget({ id: 'target-rss', type: 'rss' });
    const run = makeRun({
      stage: 'preview',
      status: 'completed',
      trackId: 'track-podcast',
    });
    const result = plan(run, {
      tracks: [track],
      publishTargets: [spotify, apple, rss],
    });
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.stage === 'publish')).toBe(true);
    expect(result.every((r) => r.trackId === 'track-podcast')).toBe(true);
  });

  it('excludes inactive publish_targets', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const active = makeTarget({ id: 'target-wp-active', type: 'wordpress', isActive: true });
    const inactive = makeTarget({ id: 'target-wp-inactive', type: 'wordpress', isActive: false });
    const run = makeRun({
      stage: 'preview',
      status: 'completed',
      trackId: 'track-blog',
    });
    const result = plan(run, { tracks: [track], publishTargets: [active, inactive] });
    expect(result).toHaveLength(1);
    expect(result[0].publishTargetId).toBe('target-wp-active');
  });

  it('returns empty when no compatible publish_targets exist', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const yt = makeTarget({ id: 'target-yt', type: 'youtube' }); // not blog-compatible
    const run = makeRun({
      stage: 'preview',
      status: 'completed',
      trackId: 'track-blog',
    });
    const result = plan(run, { tracks: [track], publishTargets: [yt] });
    expect(result).toHaveLength(0);
  });

  it('does not re-enqueue publish when already queued for a target', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const wp = makeTarget({ id: 'target-wp', type: 'wordpress' });
    const priorRuns = [
      makeRun({
        stage: 'publish',
        status: 'queued',
        trackId: 'track-blog',
        publishTargetId: 'target-wp',
      }),
    ];
    const run = makeRun({
      stage: 'preview',
      status: 'completed',
      trackId: 'track-blog',
    });
    const result = plan(run, { tracks: [track], publishTargets: [wp], priorRuns });
    expect(result).toHaveLength(0);
  });

  it('re-enqueues publish for failed target (failed is not blocking)', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const wp = makeTarget({ id: 'target-wp', type: 'wordpress' });
    const priorRuns = [
      makeRun({
        stage: 'publish',
        status: 'failed', // failed → not blocking → enqueue fresh
        trackId: 'track-blog',
        publishTargetId: 'target-wp',
      }),
    ];
    const run = makeRun({
      stage: 'preview',
      status: 'completed',
      trackId: 'track-blog',
    });
    const result = plan(run, { tracks: [track], publishTargets: [wp], priorRuns });
    expect(result).toHaveLength(1);
    expect(result[0].publishTargetId).toBe('target-wp');
  });

  it('returns empty when Track is aborted', () => {
    const track = makeTrack({ id: 'track-blog', status: 'aborted' });
    const wp = makeTarget({ id: 'target-wp', type: 'wordpress' });
    const run = makeRun({
      stage: 'preview',
      status: 'completed',
      trackId: 'track-blog',
    });
    const result = plan(run, { tracks: [track], publishTargets: [wp] });
    expect(result).toHaveLength(0);
  });
});

// ─── 11. publish → nothing ───────────────────────────────────────────────────

describe('publish → nothing (terminal)', () => {
  it('returns empty after publish completes', () => {
    const run = makeRun({
      stage: 'publish',
      status: 'completed',
      trackId: 'track-blog',
      publishTargetId: 'target-wp',
    });
    const result = plan(run);
    expect(result).toHaveLength(0);
  });
});

// ─── 12. already-terminal stages don't re-enqueue ────────────────────────────

describe('already-terminal stages not re-enqueued', () => {
  it('does not enqueue research if completed stage_run already exists', () => {
    const run = makeRun({ stage: 'brainstorm', status: 'completed' });
    const priorRuns = [
      makeRun({ stage: 'research', status: 'completed', trackId: null }),
    ];
    const result = plan(run, { priorRuns });
    expect(result).toHaveLength(0);
  });

  it('does not enqueue canonical if skipped stage_run already exists', () => {
    const run = makeRun({
      stage: 'research',
      status: 'completed',
      outcomeJson: { idea_validation: { confidence_score: 95 } },
    });
    const priorRuns = [
      makeRun({ stage: 'canonical', status: 'skipped', trackId: null }),
    ];
    const result = plan(run, { priorRuns });
    expect(result).toHaveLength(0);
  });

  it('does not re-enqueue production for Track when awaiting_user', () => {
    const track = makeTrack({ id: 'track-blog' });
    const priorRuns = [
      makeRun({ stage: 'production', status: 'awaiting_user', trackId: 'track-blog' }),
    ];
    const run = makeRun({ stage: 'canonical', status: 'completed' });
    const result = plan(run, { tracks: [track], priorRuns });
    expect(result).toHaveLength(0);
  });
});

// ─── 13. aborted Track excluded from all fan-outs ────────────────────────────

describe('aborted Track excluded from all fan-outs', () => {
  it('canonical does not fan out to aborted Track', () => {
    const aborted = makeTrack({ id: 'track-video', status: 'aborted' });
    const run = makeRun({ stage: 'canonical', status: 'completed' });
    const result = plan(run, { tracks: [aborted] });
    expect(result).toHaveLength(0);
  });

  it('review for aborted Track does not advance to assets', () => {
    const track = makeTrack({ id: 'track-video', status: 'aborted' });
    const run = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-video',
      outcomeJson: { overall_score: 95 },
    });
    const result = plan(run, { tracks: [track] });
    expect(result).toHaveLength(0);
  });

  it('assets for aborted Track does not advance to preview', () => {
    const track = makeTrack({ id: 'track-video', status: 'aborted' });
    const run = makeRun({
      stage: 'assets',
      status: 'completed',
      trackId: 'track-video',
    });
    const result = plan(run, { tracks: [track] });
    expect(result).toHaveLength(0);
  });

  it('preview for aborted Track does not fan out to publish', () => {
    const track = makeTrack({ id: 'track-video', status: 'aborted' });
    const wp = makeTarget({ type: 'youtube', id: 'target-yt' });
    const run = makeRun({
      stage: 'preview',
      status: 'completed',
      trackId: 'track-video',
    });
    const result = plan(run, { tracks: [track], publishTargets: [wp] });
    expect(result).toHaveLength(0);
  });
});

// ─── 14. non-completed runs return empty ─────────────────────────────────────

describe('non-terminal or non-completed runs return empty', () => {
  const nonPlannable: StageRunSpec['status'][] = [
    'failed',
    'queued',
    'running',
    'awaiting_user',
    'aborted',
  ];

  for (const status of nonPlannable) {
    it(`returns empty for brainstorm with status '${status}'`, () => {
      const run = makeRun({ stage: 'brainstorm', status });
      expect(plan(run)).toHaveLength(0);
    });
  }
});

// ─── 15. MEDIUM_TO_TARGET_TYPES coverage ─────────────────────────────────────

describe('MEDIUM_TO_TARGET_TYPES static table', () => {
  const cases: Array<{ medium: Medium; type: PublishTarget['type']; compatible: boolean }> = [
    { medium: 'blog', type: 'wordpress', compatible: true },
    { medium: 'blog', type: 'rss', compatible: true },
    { medium: 'blog', type: 'youtube', compatible: false },
    { medium: 'blog', type: 'spotify', compatible: false },
    { medium: 'blog', type: 'apple_podcasts', compatible: false },
    { medium: 'video', type: 'youtube', compatible: true },
    { medium: 'video', type: 'wordpress', compatible: false },
    { medium: 'video', type: 'spotify', compatible: false },
    { medium: 'shorts', type: 'youtube', compatible: true },
    { medium: 'shorts', type: 'wordpress', compatible: false },
    { medium: 'podcast', type: 'spotify', compatible: true },
    { medium: 'podcast', type: 'apple_podcasts', compatible: true },
    { medium: 'podcast', type: 'rss', compatible: true },
    { medium: 'podcast', type: 'youtube', compatible: true },
    { medium: 'podcast', type: 'wordpress', compatible: false },
  ];

  for (const { medium, type, compatible } of cases) {
    it(`${medium} → ${type} is ${compatible ? 'compatible' : 'incompatible'}`, () => {
      expect(MEDIUM_TO_TARGET_TYPES[medium].includes(type as PublishTargetType)).toBe(compatible);
    });
  }
});

// ─── 16. E2E scenario coverage at planner level ───────────────────────────────
// These map to the 14 PRD e2e scenarios exercising the planner's decision path.

describe('E2E scenario coverage (planner level)', () => {
  // s01/s02 — single Track blog, linear path
  it('s01/s02: single blog track flows brainstorm→research→canonical→production→review→assets→preview→publish', () => {
    const track = makeTrack({ id: 'track-blog', medium: 'blog' });
    const wp = makeTarget({ id: 'target-wp', type: 'wordpress' });
    const autopilot: AutopilotConfig = {
      review: { autoApproveThreshold: 90, maxIterations: 5 },
      assets: { mode: 'auto_generate' },
    };

    // Each step emits exactly the right next stage
    expect(plan(makeRun({ stage: 'brainstorm', status: 'completed' }))[0].stage).toBe('research');
    expect(
      plan(makeRun({ stage: 'research', status: 'completed', outcomeJson: { idea_validation: { confidence_score: 85 } } }))[0].stage,
    ).toBe('canonical');
    expect(plan(makeRun({ stage: 'canonical', status: 'completed' }), { tracks: [track] })[0].stage).toBe('production');
    expect(plan(makeRun({ stage: 'production', status: 'completed', trackId: 'track-blog' }), { tracks: [track] })[0].stage).toBe('review');
    expect(
      plan(makeRun({ stage: 'review', status: 'completed', trackId: 'track-blog', outcomeJson: { overall_score: 95 } }), { tracks: [track], autopilotConfig: autopilot })[0].stage,
    ).toBe('assets');
    expect(plan(makeRun({ stage: 'assets', status: 'completed', trackId: 'track-blog' }), { tracks: [track] })[0].stage).toBe('preview');
    const publishSpecs = plan(
      makeRun({ stage: 'preview', status: 'completed', trackId: 'track-blog' }),
      { tracks: [track], publishTargets: [wp] },
    );
    expect(publishSpecs).toHaveLength(1);
    expect(publishSpecs[0].stage).toBe('publish');
    expect(plan(makeRun({ stage: 'publish', status: 'completed', trackId: 'track-blog', publishTargetId: 'target-wp' }))).toHaveLength(0);
  });

  // s03 — multi-track parallel fan-out
  it('s03: canonical fans out to blog + video + podcast tracks in parallel', () => {
    const t1 = makeTrack({ id: 'track-blog', medium: 'blog' });
    const t2 = makeTrack({ id: 'track-video', medium: 'video' });
    const t3 = makeTrack({ id: 'track-podcast', medium: 'podcast' });
    const run = makeRun({ stage: 'canonical', status: 'completed' });
    const result = plan(run, { tracks: [t1, t2, t3] });
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.trackId).sort()).toEqual(
      ['track-blog', 'track-podcast', 'track-video'],
    );
  });

  // s04 — review revision loop (Video: score 78 attempt1, score 92 attempt2)
  it('s04: review loop iteration - attempt 1 score 78 triggers production attempt 2', () => {
    const track = makeTrack({ id: 'track-video', medium: 'video' });
    const review1 = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-video',
      attemptNo: 1,
      outcomeJson: { overall_score: 78 },
    });
    const r1 = plan(review1, {
      tracks: [track],
      autopilotConfig: { review: { autoApproveThreshold: 90, maxIterations: 5 } },
    });
    expect(r1).toHaveLength(1);
    expect(r1[0]).toMatchObject({ stage: 'production', trackId: 'track-video', attemptNo: 2 });

    // attempt 2 scores 92 — advances
    const review2 = makeRun({
      stage: 'review',
      status: 'completed',
      trackId: 'track-video',
      attemptNo: 2,
      outcomeJson: { overall_score: 92 },
    });
    const r2 = plan(review2, {
      tracks: [track],
      autopilotConfig: { review: { autoApproveThreshold: 90, maxIterations: 5 } },
    });
    expect(r2).toHaveLength(1);
    expect(r2[0].stage).toBe('assets');
  });

  // s05 — research confidence loop (0.42 → 0.62 → 0.84, threshold 70)
  it('s05: research confidence loop - three attempts, third advances', () => {
    const autopilot: AutopilotConfig = {
      research: { confidenceThreshold: 70, maxIterations: 5 },
    };

    const r1 = plan(makeRun({
      stage: 'research', status: 'completed', attemptNo: 1,
      outcomeJson: { idea_validation: { confidence_score: 42 } },
    }), { autopilotConfig: autopilot });
    expect(r1[0]).toMatchObject({ stage: 'research', attemptNo: 2 });

    const r2 = plan(makeRun({
      stage: 'research', status: 'completed', attemptNo: 2,
      outcomeJson: { idea_validation: { confidence_score: 62 } },
    }), { autopilotConfig: autopilot });
    expect(r2[0]).toMatchObject({ stage: 'research', attemptNo: 3 });

    const r3 = plan(makeRun({
      stage: 'research', status: 'completed', attemptNo: 3,
      outcomeJson: { idea_validation: { confidence_score: 84 } },
    }), { autopilotConfig: autopilot });
    expect(r3[0].stage).toBe('canonical');
  });

  // s08 — add medium post-canonical
  it('s08: add medium post-canonical — existing tracks not re-enqueued, new track gets production', () => {
    const blogTrack = makeTrack({ id: 'track-blog', medium: 'blog' });
    const podcastTrack = makeTrack({ id: 'track-podcast', medium: 'podcast' });
    // Blog production already exists; canonical is re-running context via priorRuns
    const priorRuns = [
      makeRun({ stage: 'production', status: 'running', trackId: 'track-blog' }),
    ];
    const run = makeRun({ stage: 'canonical', status: 'completed' });
    const result = plan(run, {
      tracks: [blogTrack, podcastTrack],
      priorRuns,
    });
    // Only podcast needs a production run
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ stage: 'production', trackId: 'track-podcast' });
  });

  // s09 — publish fan-out mixed results (Spotify OK, YouTube OK, Apple fail)
  it('s09: publish fan-out with 3 targets — each is independent', () => {
    const track = makeTrack({ id: 'track-podcast', medium: 'podcast' });
    const spotify = makeTarget({ id: 'target-spotify', type: 'spotify' });
    const youtube = makeTarget({ id: 'target-yt', type: 'youtube' });
    const apple = makeTarget({ id: 'target-apple', type: 'apple_podcasts' });
    const run = makeRun({
      stage: 'preview',
      status: 'completed',
      trackId: 'track-podcast',
    });
    const result = plan(run, {
      tracks: [track],
      publishTargets: [spotify, youtube, apple],
    });
    expect(result).toHaveLength(3);
    const ptIds = result.map((r) => r.publishTargetId).sort();
    expect(ptIds).toEqual(['target-apple', 'target-spotify', 'target-yt']);
  });

  // s10 — abort Track mid-flight
  it('s10: aborted Track no longer receives new stage_runs', () => {
    const video = makeTrack({ id: 'track-video', medium: 'video', status: 'aborted' });
    const blog = makeTrack({ id: 'track-blog', medium: 'blog', status: 'active' });
    // Canonical completes — blog gets production, video does not
    const run = makeRun({ stage: 'canonical', status: 'completed' });
    const result = plan(run, { tracks: [video, blog] });
    expect(result).toHaveLength(1);
    expect(result[0].trackId).toBe('track-blog');
  });

  // s14 — legacy project lazy migration: single video track
  it('s14: legacy single-video project — canonical fans out to video Track only', () => {
    const videoTrack = makeTrack({ id: 'track-video', medium: 'video', status: 'active' });
    const run = makeRun({ stage: 'canonical', status: 'completed' });
    const result = plan(run, { tracks: [videoTrack] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      stage: 'production',
      trackId: 'track-video',
      attemptNo: 1,
    });
  });
});
