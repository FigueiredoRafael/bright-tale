/**
 * detectStagnation unit tests — Module 4 (PRD #240 Fix 3).
 *
 * Pure-function tests on deterministic stagnation detection.
 * Prior art: computeRubricScore.test.ts — same fixture-in, assertion-out pattern.
 */
import { describe, it, expect } from 'vitest';
import {
  detectStagnation,
  extractCriticalIssueTitles,
  jaccardSimilarity,
} from '../detectStagnation.js';

// ── Fixture helpers ──────────────────────────────────────────────────────────

function makeIter(
  iteration: number,
  score: number | null,
  criticalIssues: string[],
  type = 'video',
) {
  const issues = criticalIssues.map((issue) => ({ issue }));
  return {
    iteration,
    score,
    feedbackJson: {
      [`${type}_review`]: {
        issues: { critical: issues },
      },
    },
  };
}

// ── detectStagnation ─────────────────────────────────────────────────────────

describe('detectStagnation', () => {
  it('a) < 3 iterations → not stagnant', () => {
    expect(detectStagnation([])).toEqual({ stagnant: false });
    expect(detectStagnation([makeIter(1, 60, ['missing citations'])])).toEqual({ stagnant: false });
    expect(
      detectStagnation([
        makeIter(1, 60, ['missing citations']),
        makeIter(2, 60, ['missing citations']),
      ]),
    ).toEqual({ stagnant: false });
  });

  it('b) 3 iterations, scores [60,60,60], same critical issue → stagnant, reason=both', () => {
    const iterations = [
      makeIter(1, 60, ['missing citations']),
      makeIter(2, 60, ['missing citations']),
      makeIter(3, 60, ['missing citations']),
    ];
    const result = detectStagnation(iterations);
    expect(result.stagnant).toBe(true);
    expect(result.reason).toBe('both');
  });

  it('c) scores [60,62,60], same critical issue → stagnant (within ±2 tolerance)', () => {
    const iterations = [
      makeIter(1, 60, ['missing citations']),
      makeIter(2, 62, ['missing citations']),
      makeIter(3, 60, ['missing citations']),
    ];
    const result = detectStagnation(iterations);
    expect(result.stagnant).toBe(true);
    expect(result.reason).toBe('both');
  });

  it('d) scores [60,70,80] → not stagnant (score improving)', () => {
    const iterations = [
      makeIter(1, 60, ['missing citations']),
      makeIter(2, 70, ['missing citations']),
      makeIter(3, 80, ['missing citations']),
    ];
    expect(detectStagnation(iterations)).toEqual({ stagnant: false });
  });

  it('e) scores [60,60,60] but disjoint critical issues → not stagnant', () => {
    const iterations = [
      makeIter(1, 60, ['missing citations']),
      makeIter(2, 60, ['broken links']),
      makeIter(3, 60, ['wrong tone']),
    ];
    expect(detectStagnation(iterations)).toEqual({ stagnant: false });
  });

  it('f) 5 iterations, last 3 flat → stagnant (only last 3 considered)', () => {
    const iterations = [
      makeIter(1, 40, ['old issue A']),
      makeIter(2, 55, ['old issue B']),
      makeIter(3, 60, ['missing citations']),
      makeIter(4, 60, ['missing citations']),
      makeIter(5, 60, ['missing citations']),
    ];
    const result = detectStagnation(iterations);
    expect(result.stagnant).toBe(true);
    expect(result.reason).toBe('both');
  });
});

// ── extractCriticalIssueTitles ───────────────────────────────────────────────

describe('extractCriticalIssueTitles', () => {
  it('extracts issue strings from video_review.issues.critical', () => {
    const iter = makeIter(1, 60, ['missing citations', 'chapter_count missing']);
    const titles = extractCriticalIssueTitles(iter);
    expect(titles).toContain('missing citations');
    expect(titles).toContain('chapter_count missing');
    expect(titles.size).toBe(2);
  });

  it('extracts from blog_review shape', () => {
    const iter = makeIter(1, 60, ['thin content'], 'blog');
    expect(extractCriticalIssueTitles(iter)).toContain('thin content');
  });

  it('returns empty set when feedbackJson is null', () => {
    expect(extractCriticalIssueTitles({ feedbackJson: null })).toEqual(new Set());
  });

  it('returns empty set when no critical issues exist', () => {
    const iter = makeIter(1, 60, []);
    expect(extractCriticalIssueTitles(iter)).toEqual(new Set());
  });
});

// ── jaccardSimilarity ────────────────────────────────────────────────────────

describe('jaccardSimilarity', () => {
  it('identical sets → 1.0', () => {
    expect(jaccardSimilarity(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1.0);
  });

  it('disjoint sets → 0.0', () => {
    expect(jaccardSimilarity(new Set(['a']), new Set(['b']))).toBe(0.0);
  });

  it('partial overlap', () => {
    // {a,b} ∩ {b,c} = {b}, union = {a,b,c} → 1/3 ≈ 0.333
    expect(jaccardSimilarity(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3);
  });

  it('both empty → 1.0 (vacuously identical — no issues means stagnation on other signal only)', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1.0);
  });
});
