import { describe, expect, it } from 'vitest';
import {
  planNext,
  type PlanInput,
  type RunLike,
  type Track,
} from '../fan-out-planner';
import type { PublishTarget } from '../publish-target-resolver';

function run(overrides: Partial<RunLike> = {}): RunLike {
  return {
    id: 'r-' + Math.random().toString(36).slice(2, 8),
    stage: 'brainstorm',
    status: 'completed',
    trackId: null,
    publishTargetId: null,
    attemptNo: 1,
    outcomeJson: undefined,
    ...overrides,
  };
}

function track(overrides: Partial<Track> = {}): Track {
  return {
    id: 't-' + Math.random().toString(36).slice(2, 8),
    projectId: 'proj-1',
    medium: 'blog',
    status: 'active',
    paused: false,
    autopilotConfigJson: undefined,
    ...overrides,
  };
}

function pubTarget(overrides: Partial<PublishTarget> = {}): PublishTarget {
  return {
    id: 'pt-' + Math.random().toString(36).slice(2, 8),
    channelId: 'ch-1',
    orgId: null,
    type: 'wordpress',
    displayName: 'WP',
    configJson: null,
    isActive: true,
    createdAt: '2026-05-14T00:00:00Z',
    updatedAt: '2026-05-14T00:00:00Z',
    ...overrides,
  };
}

function input(partial: Partial<PlanInput> & { completedRun: RunLike }): PlanInput {
  return {
    tracks: [],
    publishTargets: [],
    priorRuns: [partial.completedRun],
    autopilotConfig: null,
    ...partial,
  };
}

describe('planNext — gating', () => {
  it('returns [] when completedRun is not completed/skipped', () => {
    for (const status of ['queued', 'running', 'awaiting_user', 'failed', 'aborted'] as const) {
      expect(planNext(input({ completedRun: run({ stage: 'brainstorm', status }) }))).toEqual([]);
    }
  });

  it('a skipped Stage Run still fans out (skip is a forward signal)', () => {
    const specs = planNext(input({ completedRun: run({ stage: 'brainstorm', status: 'skipped' }) }));
    expect(specs.map((s) => s.stage)).toEqual(['research']);
  });
});

describe('planNext — brainstorm → research', () => {
  it('enqueues research after brainstorm completed', () => {
    const specs = planNext(input({ completedRun: run({ stage: 'brainstorm' }) }));
    expect(specs).toEqual([
      { stage: 'research', trackId: null, publishTargetId: null, status: 'queued' },
    ]);
  });

  it('does not re-enqueue research if one already exists (idempotency)', () => {
    const completed = run({ stage: 'brainstorm' });
    const existing = run({ stage: 'research', status: 'queued' });
    const specs = planNext(input({ completedRun: completed, priorRuns: [completed, existing] }));
    expect(specs).toEqual([]);
  });
});

describe('planNext — research transitions', () => {
  it('research completed → canonical', () => {
    const specs = planNext(input({ completedRun: run({ stage: 'research' }) }));
    expect(specs.map((s) => s.stage)).toEqual(['canonical']);
  });

  it('research with verdict=low_confidence → another research (loop)', () => {
    const specs = planNext(
      input({
        completedRun: run({ stage: 'research', outcomeJson: { verdict: 'low_confidence' } }),
      }),
    );
    expect(specs.map((s) => s.stage)).toEqual(['research']);
  });
});

describe('planNext — canonical fan-out to Tracks', () => {
  it('canonical completed → one production per active Track', () => {
    const t1 = track({ id: 't1', medium: 'blog' });
    const t2 = track({ id: 't2', medium: 'video' });
    const t3 = track({ id: 't3', medium: 'podcast' });
    const completed = run({ stage: 'canonical' });
    const specs = planNext(
      input({ completedRun: completed, tracks: [t1, t2, t3] }),
    );
    expect(specs.map((s) => s.trackId).sort()).toEqual(['t1', 't2', 't3']);
    expect(new Set(specs.map((s) => s.stage))).toEqual(new Set(['production']));
  });

  it('canonical fan-out excludes aborted, completed, and paused Tracks', () => {
    const t1 = track({ id: 't1', status: 'active' });
    const aborted = track({ id: 't2', status: 'aborted' });
    const completed = track({ id: 't3', status: 'completed' });
    const paused = track({ id: 't4', status: 'active', paused: true });
    const specs = planNext(
      input({ completedRun: run({ stage: 'canonical' }), tracks: [t1, aborted, completed, paused] }),
    );
    expect(specs.map((s) => s.trackId)).toEqual(['t1']);
  });

  it('canonical fan-out skips Tracks whose production already exists', () => {
    const t1 = track({ id: 't1' });
    const t2 = track({ id: 't2' });
    const completed = run({ stage: 'canonical' });
    const existingForT1 = run({ stage: 'production', trackId: 't1', status: 'queued' });
    const specs = planNext(
      input({
        completedRun: completed,
        tracks: [t1, t2],
        priorRuns: [completed, existingForT1],
      }),
    );
    expect(specs.map((s) => s.trackId)).toEqual(['t2']);
  });
});

describe('planNext — production → review', () => {
  it('production completed → review for same Track', () => {
    const t1 = track({ id: 't1' });
    const specs = planNext(
      input({
        completedRun: run({ stage: 'production', trackId: 't1' }),
        tracks: [t1],
      }),
    );
    expect(specs).toEqual([
      { stage: 'review', trackId: 't1', publishTargetId: null, status: 'queued' },
    ]);
  });

  it('production for an aborted Track does not enqueue review', () => {
    const t1 = track({ id: 't1', status: 'aborted' });
    const specs = planNext(
      input({
        completedRun: run({ stage: 'production', trackId: 't1' }),
        tracks: [t1],
      }),
    );
    expect(specs).toEqual([]);
  });
});

describe('planNext — review transitions', () => {
  it('review verdict=revision_required → production loop for same Track', () => {
    const t1 = track({ id: 't1' });
    const specs = planNext(
      input({
        completedRun: run({
          stage: 'review',
          trackId: 't1',
          outcomeJson: { verdict: 'revision_required' },
        }),
        tracks: [t1],
      }),
    );
    expect(specs).toEqual([
      { stage: 'production', trackId: 't1', publishTargetId: null, status: 'queued' },
    ]);
  });

  it('review approved → assets for same Track', () => {
    const t1 = track({ id: 't1' });
    const specs = planNext(
      input({
        completedRun: run({
          stage: 'review',
          trackId: 't1',
          outcomeJson: { verdict: 'approved' },
        }),
        tracks: [t1],
      }),
    );
    expect(specs.map((s) => s.stage)).toEqual(['assets']);
    expect(specs[0].trackId).toBe('t1');
  });

  it('review with no outcomeJson → assets (forward by default)', () => {
    const t1 = track({ id: 't1' });
    const specs = planNext(
      input({ completedRun: run({ stage: 'review', trackId: 't1' }), tracks: [t1] }),
    );
    expect(specs.map((s) => s.stage)).toEqual(['assets']);
  });
});

describe('planNext — assets → preview', () => {
  it('assets completed → preview for same Track', () => {
    const t1 = track({ id: 't1' });
    const specs = planNext(
      input({
        completedRun: run({ stage: 'assets', trackId: 't1' }),
        tracks: [t1],
      }),
    );
    expect(specs).toEqual([
      { stage: 'preview', trackId: 't1', publishTargetId: null, status: 'queued' },
    ]);
  });

  it('assets skipped still fans out to preview', () => {
    const t1 = track({ id: 't1' });
    const specs = planNext(
      input({
        completedRun: run({ stage: 'assets', status: 'skipped', trackId: 't1' }),
        tracks: [t1],
      }),
    );
    expect(specs.map((s) => s.stage)).toEqual(['preview']);
  });
});

describe('planNext — preview → publish fan-out', () => {
  it('preview completed → one publish per publish_target', () => {
    const t1 = track({ id: 't1', medium: 'podcast' });
    const ptA = pubTarget({ id: 'pt-a', type: 'spotify' });
    const ptB = pubTarget({ id: 'pt-b', type: 'apple_podcasts' });
    const ptC = pubTarget({ id: 'pt-c', type: 'rss' });
    const specs = planNext(
      input({
        completedRun: run({ stage: 'preview', trackId: 't1' }),
        tracks: [t1],
        publishTargets: [ptA, ptB, ptC],
      }),
    );
    expect(specs.length).toBe(3);
    expect(new Set(specs.map((s) => s.publishTargetId))).toEqual(
      new Set(['pt-a', 'pt-b', 'pt-c']),
    );
    expect(new Set(specs.map((s) => s.stage))).toEqual(new Set(['publish']));
    // Publish is always parked for manual_advance
    for (const spec of specs) {
      expect(spec.status).toBe('awaiting_user');
      expect(spec.awaitingReason).toBe('manual_advance');
      expect(spec.trackId).toBe('t1');
    }
  });

  it('preview fan-out skips inactive publish_targets', () => {
    const t1 = track({ id: 't1' });
    const active = pubTarget({ id: 'pt-a', isActive: true });
    const inactive = pubTarget({ id: 'pt-b', isActive: false });
    const specs = planNext(
      input({
        completedRun: run({ stage: 'preview', trackId: 't1' }),
        tracks: [t1],
        publishTargets: [active, inactive],
      }),
    );
    expect(specs.map((s) => s.publishTargetId)).toEqual(['pt-a']);
  });

  it('preview fan-out skips publish_targets that already have a publish run', () => {
    const t1 = track({ id: 't1' });
    const ptA = pubTarget({ id: 'pt-a' });
    const ptB = pubTarget({ id: 'pt-b' });
    const completed = run({ stage: 'preview', trackId: 't1' });
    const existing = run({
      stage: 'publish',
      trackId: 't1',
      publishTargetId: 'pt-a',
      status: 'completed',
    });
    const specs = planNext(
      input({
        completedRun: completed,
        tracks: [t1],
        publishTargets: [ptA, ptB],
        priorRuns: [completed, existing],
      }),
    );
    expect(specs.map((s) => s.publishTargetId)).toEqual(['pt-b']);
  });

  it('preview with no publish_targets → []', () => {
    const t1 = track({ id: 't1' });
    const specs = planNext(
      input({
        completedRun: run({ stage: 'preview', trackId: 't1' }),
        tracks: [t1],
        publishTargets: [],
      }),
    );
    expect(specs).toEqual([]);
  });
});

describe('planNext — idempotency: failed/aborted prior runs do NOT block', () => {
  it('failed prior research run does NOT suppress re-enqueue (retry path)', () => {
    const completed = run({ stage: 'brainstorm' });
    const failed = run({ stage: 'research', status: 'failed' });
    const specs = planNext(input({ completedRun: completed, priorRuns: [completed, failed] }));
    expect(specs).toEqual([
      { stage: 'research', trackId: null, publishTargetId: null, status: 'queued' },
    ]);
  });

  it('aborted prior production for a Track does NOT suppress re-fan-out', () => {
    const t1 = track({ id: 't1' });
    const completed = run({ stage: 'canonical' });
    const aborted = run({ stage: 'production', trackId: 't1', status: 'aborted' });
    const specs = planNext(
      input({ completedRun: completed, tracks: [t1], priorRuns: [completed, aborted] }),
    );
    expect(specs.map((s) => s.trackId)).toEqual(['t1']);
  });

  it('aborted prior publish for one target does NOT suppress re-fan-out for that target', () => {
    const t1 = track({ id: 't1' });
    const ptA = pubTarget({ id: 'pt-a' });
    const completedPreview = run({ stage: 'preview', trackId: 't1' });
    const abortedPublish = run({
      stage: 'publish',
      trackId: 't1',
      publishTargetId: 'pt-a',
      status: 'aborted',
    });
    const specs = planNext(
      input({
        completedRun: completedPreview,
        tracks: [t1],
        publishTargets: [ptA],
        priorRuns: [completedPreview, abortedPublish],
      }),
    );
    expect(specs.map((s) => s.publishTargetId)).toEqual(['pt-a']);
  });

  it('collision key is per-(stage, trackId, publishTargetId): same stage on different track does not block', () => {
    const t1 = track({ id: 't1' });
    const t2 = track({ id: 't2' });
    const completed = run({ stage: 'canonical' });
    // Prior queued production exists only for t1
    const existingT1 = run({
      stage: 'production',
      trackId: 't1',
      publishTargetId: null,
      status: 'queued',
    });
    const specs = planNext(
      input({
        completedRun: completed,
        tracks: [t1, t2],
        priorRuns: [completed, existingT1],
      }),
    );
    expect(specs.map((s) => s.trackId)).toEqual(['t2']);
  });
});

describe('planNext — publish is terminal', () => {
  it('publish completed → []', () => {
    const t1 = track({ id: 't1' });
    const specs = planNext(
      input({
        completedRun: run({
          stage: 'publish',
          trackId: 't1',
          publishTargetId: 'pt-a',
        }),
        tracks: [t1],
      }),
    );
    expect(specs).toEqual([]);
  });
});

describe('planNext — skip-mode handling', () => {
  it('autopilotConfig.assets.mode=skip → next assets spec is skipped status', () => {
    const t1 = track({ id: 't1' });
    const specs = planNext(
      input({
        completedRun: run({
          stage: 'review',
          trackId: 't1',
          outcomeJson: { verdict: 'approved' },
        }),
        tracks: [t1],
        // Minimal config shape — only assets.mode matters here
        autopilotConfig: {
          defaultProvider: 'recommended',
          brainstorm: null,
          research: null,
          canonicalCore: { providerOverride: null, personaId: null },
          draft: { providerOverride: null, format: 'blog' },
          review: {
            providerOverride: null,
            maxIterations: 2,
            autoApproveThreshold: 90,
            hardFailThreshold: 50,
          },
          assets: { providerOverride: null, mode: 'skip' },
          preview: { enabled: true },
          publish: { status: 'draft' },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      }),
    );
    expect(specs.length).toBe(1);
    expect(specs[0].stage).toBe('assets');
    expect(specs[0].status).toBe('skipped');
  });

  it('autopilotConfig.review.maxIterations=0 → next review spec is skipped status', () => {
    const t1 = track({ id: 't1' });
    const specs = planNext(
      input({
        completedRun: run({ stage: 'production', trackId: 't1' }),
        tracks: [t1],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        autopilotConfig: {
          defaultProvider: 'recommended',
          brainstorm: null,
          research: null,
          canonicalCore: { providerOverride: null, personaId: null },
          draft: { providerOverride: null, format: 'blog' },
          review: {
            providerOverride: null,
            maxIterations: 0,
            autoApproveThreshold: 90,
            hardFailThreshold: 50,
          },
          assets: { providerOverride: null, mode: 'auto_generate' },
          preview: { enabled: true },
          publish: { status: 'draft' },
        } as any,
      }),
    );
    expect(specs.length).toBe(1);
    expect(specs[0].stage).toBe('review');
    expect(specs[0].status).toBe('skipped');
  });
});

describe('planNext — purity', () => {
  it('does not mutate input arrays', () => {
    const t1 = track({ id: 't1' });
    const completed = run({ stage: 'canonical' });
    const tracks = [t1];
    const priorRuns = [completed];
    const tracksSnap = JSON.stringify(tracks);
    const priorSnap = JSON.stringify(priorRuns);
    planNext({
      completedRun: completed,
      tracks,
      publishTargets: [],
      priorRuns,
      autopilotConfig: null,
    });
    expect(JSON.stringify(tracks)).toBe(tracksSnap);
    expect(JSON.stringify(priorRuns)).toBe(priorSnap);
  });
});
