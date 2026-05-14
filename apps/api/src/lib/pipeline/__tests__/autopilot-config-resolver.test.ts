/**
 * Unit tests for autopilot-config-resolver (T1.7)
 *
 * Covers:
 * - project-only config (no track override)
 * - project + track override on one stage only
 * - per-stage override resolution (track wins over project wins over fallback)
 * - stage absent from both project and track (pure fallback)
 * - null track for shared stages (brainstorm, research, canonical)
 * - missing/null project autopilot_config → fallback used
 * - invalid (non-object) configs are silently ignored (fallback used)
 * - type-safe coalesce: track partial does NOT overwrite unrelated fields
 * - all 8 stages resolve independently
 * - FALLBACK_BY_STAGE values are the ultimate safety net
 */

import { describe, it, expect } from 'vitest';
import { resolveAutopilotConfig } from '../autopilot-config-resolver';
import { FALLBACK_BY_STAGE } from '@brighttale/shared';
import type { AutopilotProjectInput, AutopilotTrackInput } from '../autopilot-config-resolver';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const emptyProject: AutopilotProjectInput = { autopilotConfigJson: null };
const emptyTrack: AutopilotTrackInput = { autopilotConfigJson: null };

function makeProject(partial: Record<string, unknown>): AutopilotProjectInput {
  return { autopilotConfigJson: partial };
}

function makeTrack(partial: Record<string, unknown>): AutopilotTrackInput {
  return { autopilotConfigJson: partial };
}

// ─── Pure fallback (no config on either side) ─────────────────────────────────

describe('resolveAutopilotConfig — pure fallback', () => {
  it('returns FALLBACK_BY_STAGE for review when neither project nor track has config', () => {
    const result = resolveAutopilotConfig(emptyProject, null, 'review');
    expect(result).toEqual(FALLBACK_BY_STAGE.review);
  });

  it('returns FALLBACK_BY_STAGE for brainstorm', () => {
    const result = resolveAutopilotConfig(emptyProject, null, 'brainstorm');
    expect(result).toEqual(FALLBACK_BY_STAGE.brainstorm);
  });

  it('returns FALLBACK_BY_STAGE for research', () => {
    const result = resolveAutopilotConfig(emptyProject, null, 'research');
    expect(result).toEqual(FALLBACK_BY_STAGE.research);
  });

  it('returns FALLBACK_BY_STAGE for canonical', () => {
    const result = resolveAutopilotConfig(emptyProject, null, 'canonical');
    expect(result).toEqual(FALLBACK_BY_STAGE.canonical);
  });

  it('returns FALLBACK_BY_STAGE for production', () => {
    const result = resolveAutopilotConfig(emptyProject, null, 'production');
    expect(result).toEqual(FALLBACK_BY_STAGE.production);
  });

  it('returns FALLBACK_BY_STAGE for assets', () => {
    const result = resolveAutopilotConfig(emptyProject, null, 'assets');
    expect(result).toEqual(FALLBACK_BY_STAGE.assets);
  });

  it('returns FALLBACK_BY_STAGE for preview', () => {
    const result = resolveAutopilotConfig(emptyProject, null, 'preview');
    expect(result).toEqual(FALLBACK_BY_STAGE.preview);
  });

  it('returns FALLBACK_BY_STAGE for publish (pauseAfter=true by default)', () => {
    const result = resolveAutopilotConfig(emptyProject, null, 'publish');
    expect(result).toEqual(FALLBACK_BY_STAGE.publish);
    expect(result.pauseAfter).toBe(true);
  });

  it('empty track object (non-null) is treated same as null for shared stages', () => {
    const result = resolveAutopilotConfig(emptyProject, emptyTrack, 'brainstorm');
    expect(result).toEqual(FALLBACK_BY_STAGE.brainstorm);
  });
});

// ─── Project-only config (no track) ──────────────────────────────────────────

describe('resolveAutopilotConfig — project-only config', () => {
  it('uses project minScore for review when no track', () => {
    const project = makeProject({ review: { minScore: 95 } });
    const result = resolveAutopilotConfig(project, null, 'review');
    expect(result.minScore).toBe(95);
  });

  it('uses project maxIterations for review when no track', () => {
    const project = makeProject({ review: { maxIterations: 3 } });
    const result = resolveAutopilotConfig(project, null, 'review');
    expect(result.maxIterations).toBe(3);
  });

  it('project config for review fills missing fields from fallback', () => {
    const project = makeProject({ review: { minScore: 92 } });
    const result = resolveAutopilotConfig(project, null, 'review');
    // minScore overridden
    expect(result.minScore).toBe(92);
    // others come from fallback
    expect(result.maxIterations).toBe(FALLBACK_BY_STAGE.review.maxIterations);
    expect(result.hardFailThreshold).toBe(FALLBACK_BY_STAGE.review.hardFailThreshold);
    expect(result.skip).toBe(false);
    expect(result.pauseAfter).toBe(false);
  });

  it('project skip=true for assets is respected', () => {
    const project = makeProject({ assets: { skip: true } });
    const result = resolveAutopilotConfig(project, null, 'assets');
    expect(result.skip).toBe(true);
  });

  it('project pauseAfter=false on publish overrides the fallback true', () => {
    const project = makeProject({ publish: { pauseAfter: false } });
    const result = resolveAutopilotConfig(project, null, 'publish');
    expect(result.pauseAfter).toBe(false);
  });

  it('project config for one stage does not bleed into another stage', () => {
    const project = makeProject({ review: { minScore: 99 } });
    const result = resolveAutopilotConfig(project, null, 'research');
    expect(result.maxIterations).toBe(FALLBACK_BY_STAGE.research.maxIterations);
    expect(result.minScore).toBe(0);
  });
});

// ─── Track override on one stage ─────────────────────────────────────────────

describe('resolveAutopilotConfig — track overrides project on one stage', () => {
  it('track minScore beats project minScore for review', () => {
    const project = makeProject({ review: { minScore: 90 } });
    const track   = makeTrack({   review: { minScore: 95 } });
    const result  = resolveAutopilotConfig(project, track, 'review');
    expect(result.minScore).toBe(95);
  });

  it('track maxIterations beats project maxIterations for production', () => {
    const project = makeProject({ production: { maxIterations: 5 } });
    const track   = makeTrack({   production: { maxIterations: 2 } });
    const result  = resolveAutopilotConfig(project, track, 'production');
    expect(result.maxIterations).toBe(2);
  });

  it('track override for review does not affect research resolution', () => {
    const project = makeProject({ research: { maxIterations: 2 } });
    const track   = makeTrack({   review:   { minScore: 95 } });
    const result  = resolveAutopilotConfig(project, track, 'research');
    expect(result.maxIterations).toBe(2);
    expect(result.minScore).toBe(FALLBACK_BY_STAGE.research.minScore);
  });

  it('track entry fills fields from project then fallback for unset track fields', () => {
    const project = makeProject({ review: { minScore: 88, maxIterations: 4, hardFailThreshold: 35 } });
    const track   = makeTrack({   review: { minScore: 95 } }); // only minScore set in track
    const result  = resolveAutopilotConfig(project, track, 'review');
    // track wins for minScore
    expect(result.minScore).toBe(95);
    // project wins for maxIterations and hardFailThreshold
    expect(result.maxIterations).toBe(4);
    expect(result.hardFailThreshold).toBe(35);
  });

  it('track can set skip=true even if project did not set it', () => {
    const project = makeProject({ assets: {} });
    const track   = makeTrack({   assets: { skip: true } });
    const result  = resolveAutopilotConfig(project, track, 'assets');
    expect(result.skip).toBe(true);
  });
});

// ─── Missing project config ───────────────────────────────────────────────────

describe('resolveAutopilotConfig — missing project config', () => {
  it('null autopilotConfigJson on project → falls back to FALLBACK_BY_STAGE', () => {
    const project: AutopilotProjectInput = { autopilotConfigJson: null };
    const result = resolveAutopilotConfig(project, null, 'review');
    expect(result).toEqual(FALLBACK_BY_STAGE.review);
  });

  it('undefined autopilotConfigJson on project → falls back to FALLBACK_BY_STAGE', () => {
    const project: AutopilotProjectInput = { autopilotConfigJson: undefined };
    const result = resolveAutopilotConfig(project, null, 'research');
    expect(result).toEqual(FALLBACK_BY_STAGE.research);
  });

  it('empty object autopilotConfigJson on project → falls back to FALLBACK_BY_STAGE', () => {
    const project = makeProject({});
    const result = resolveAutopilotConfig(project, null, 'production');
    expect(result).toEqual(FALLBACK_BY_STAGE.production);
  });

  it('invalid (non-object) project config is silently ignored', () => {
    const project: AutopilotProjectInput = { autopilotConfigJson: 'not-an-object' };
    const result = resolveAutopilotConfig(project, null, 'review');
    expect(result).toEqual(FALLBACK_BY_STAGE.review);
  });

  it('invalid (array) project config is silently ignored', () => {
    const project: AutopilotProjectInput = { autopilotConfigJson: [1, 2, 3] };
    const result = resolveAutopilotConfig(project, null, 'review');
    expect(result).toEqual(FALLBACK_BY_STAGE.review);
  });
});

// ─── Null track (shared stages) ──────────────────────────────────────────────

describe('resolveAutopilotConfig — null track (shared stages)', () => {
  it('null track returns project config for brainstorm', () => {
    const project = makeProject({ brainstorm: { skip: true } });
    const result = resolveAutopilotConfig(project, null, 'brainstorm');
    expect(result.skip).toBe(true);
  });

  it('null track returns project config for research', () => {
    const project = makeProject({ research: { maxIterations: 2 } });
    const result = resolveAutopilotConfig(project, null, 'research');
    expect(result.maxIterations).toBe(2);
  });

  it('null track returns project config for canonical', () => {
    const project = makeProject({ canonical: { pauseAfter: true } });
    const result = resolveAutopilotConfig(project, null, 'canonical');
    expect(result.pauseAfter).toBe(true);
  });
});

// ─── Unknown / missing stage in both configs ──────────────────────────────────

describe('resolveAutopilotConfig — stage absent from both project and track', () => {
  it('returns full fallback when review absent from both project and track', () => {
    const project = makeProject({ brainstorm: { skip: false } }); // no review entry
    const track   = makeTrack({   research:   { maxIterations: 1 } }); // no review entry
    const result  = resolveAutopilotConfig(project, track, 'review');
    expect(result).toEqual(FALLBACK_BY_STAGE.review);
  });

  it('returns full fallback for assets when neither side defines it', () => {
    const project = makeProject({ review: { minScore: 80 } });
    const track   = makeTrack({   review: { minScore: 85 } });
    const result  = resolveAutopilotConfig(project, track, 'assets');
    expect(result).toEqual(FALLBACK_BY_STAGE.assets);
  });
});

// ─── Type-safe coalesce (field-level, not entry-level) ────────────────────────

describe('resolveAutopilotConfig — field-level coalesce', () => {
  it('resolved entry has all 5 required fields present', () => {
    const result = resolveAutopilotConfig(emptyProject, null, 'review');
    expect(result).toHaveProperty('maxIterations');
    expect(result).toHaveProperty('minScore');
    expect(result).toHaveProperty('hardFailThreshold');
    expect(result).toHaveProperty('skip');
    expect(result).toHaveProperty('pauseAfter');
  });

  it('resolved entry fields are the correct types', () => {
    const result = resolveAutopilotConfig(emptyProject, null, 'review');
    expect(typeof result.maxIterations).toBe('number');
    expect(typeof result.minScore).toBe('number');
    expect(typeof result.hardFailThreshold).toBe('number');
    expect(typeof result.skip).toBe('boolean');
    expect(typeof result.pauseAfter).toBe('boolean');
  });

  it('track providing only minScore does not zero-out other fields', () => {
    const track = makeTrack({ review: { minScore: 95 } });
    const result = resolveAutopilotConfig(emptyProject, track, 'review');
    expect(result.minScore).toBe(95);
    // remaining fields come from project (empty) → fallback
    expect(result.maxIterations).toBe(FALLBACK_BY_STAGE.review.maxIterations);
    expect(result.hardFailThreshold).toBe(FALLBACK_BY_STAGE.review.hardFailThreshold);
    expect(result.skip).toBe(false);
    expect(result.pauseAfter).toBe(false);
  });

  it('project providing only skip=true does not null-out score fields', () => {
    const project = makeProject({ review: { skip: true } });
    const result  = resolveAutopilotConfig(project, null, 'review');
    expect(result.skip).toBe(true);
    expect(result.minScore).toBe(FALLBACK_BY_STAGE.review.minScore);
    expect(result.hardFailThreshold).toBe(FALLBACK_BY_STAGE.review.hardFailThreshold);
  });
});

// ─── All 8 stages resolve to a complete entry ─────────────────────────────────

describe('resolveAutopilotConfig — all 8 stages resolve independently', () => {
  const stages = [
    'brainstorm', 'research', 'canonical', 'production',
    'review', 'assets', 'preview', 'publish',
  ] as const;

  stages.forEach((stage) => {
    it(`stage "${stage}" resolves to a complete ResolvedStageAutopilotEntry`, () => {
      const result = resolveAutopilotConfig(emptyProject, null, stage);
      expect(result).toMatchObject({
        maxIterations:     expect.any(Number),
        minScore:          expect.any(Number),
        hardFailThreshold: expect.any(Number),
        skip:              expect.any(Boolean),
        pauseAfter:        expect.any(Boolean),
      });
    });
  });
});

// ─── Multi-stage project config: cross-stage independence ─────────────────────

describe('resolveAutopilotConfig — cross-stage independence', () => {
  it('fully-populated project config resolves each stage independently', () => {
    const project = makeProject({
      brainstorm: { skip: true },
      research:   { maxIterations: 2 },
      canonical:  { pauseAfter: true },
      production: { maxIterations: 3 },
      review:     { minScore: 92, hardFailThreshold: 45 },
      assets:     { skip: true },
      preview:    { pauseAfter: false },
      publish:    { pauseAfter: false },
    });

    expect(resolveAutopilotConfig(project, null, 'brainstorm').skip).toBe(true);
    expect(resolveAutopilotConfig(project, null, 'research').maxIterations).toBe(2);
    expect(resolveAutopilotConfig(project, null, 'canonical').pauseAfter).toBe(true);
    expect(resolveAutopilotConfig(project, null, 'production').maxIterations).toBe(3);
    expect(resolveAutopilotConfig(project, null, 'review').minScore).toBe(92);
    expect(resolveAutopilotConfig(project, null, 'review').hardFailThreshold).toBe(45);
    expect(resolveAutopilotConfig(project, null, 'assets').skip).toBe(true);
    expect(resolveAutopilotConfig(project, null, 'preview').pauseAfter).toBe(false);
    expect(resolveAutopilotConfig(project, null, 'publish').pauseAfter).toBe(false);
  });

  it('track overrides only review, leaving other stages at project values', () => {
    const project = makeProject({
      review:  { minScore: 80, maxIterations: 4 },
      assets:  { skip: false },
    });
    const track = makeTrack({
      review: { minScore: 95 },
    });

    const reviewResult = resolveAutopilotConfig(project, track, 'review');
    expect(reviewResult.minScore).toBe(95);    // track wins
    expect(reviewResult.maxIterations).toBe(4); // project value

    const assetsResult = resolveAutopilotConfig(project, track, 'assets');
    expect(assetsResult.skip).toBe(false);      // project value, unaffected by track.review
  });
});

// ─── Invalid track config is silently ignored ────────────────────────────────

describe('resolveAutopilotConfig — invalid track config', () => {
  it('null track config falls back through project to fallback', () => {
    const project = makeProject({ review: { minScore: 88 } });
    const track: AutopilotTrackInput = { autopilotConfigJson: null };
    const result = resolveAutopilotConfig(project, track, 'review');
    expect(result.minScore).toBe(88); // project wins since track is null/empty
  });

  it('invalid (string) track config is ignored; project value used', () => {
    const project = makeProject({ review: { minScore: 85 } });
    const track: AutopilotTrackInput = { autopilotConfigJson: 'bad-value' };
    const result = resolveAutopilotConfig(project, track, 'review');
    expect(result.minScore).toBe(85); // project wins
  });

  it('invalid track config with valid project config: project + fallback used', () => {
    const project = makeProject({ review: { minScore: 82 } });
    const track: AutopilotTrackInput = { autopilotConfigJson: 42 };
    const result = resolveAutopilotConfig(project, track, 'review');
    expect(result.minScore).toBe(82);
    expect(result.maxIterations).toBe(FALLBACK_BY_STAGE.review.maxIterations);
  });
});
