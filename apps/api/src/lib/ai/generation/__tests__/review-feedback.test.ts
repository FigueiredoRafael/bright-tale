/**
 * Unit tests for normalizeReviewFeedback.
 *
 * These lock the exact output shape that production-produce.ts and
 * pipeline-production-dispatch.ts used to produce inline — ensuring the
 * extracted helper is a byte-identical replacement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock computeRubricScore & friends so tests don't depend on blog criteria
vi.mock('../../scoring/computeRubricScore.js', () => ({
  getRubricForType: vi.fn(() => null), // no rubric → no criticalFromRubric
  extractRubricEvaluation: vi.fn(() => null),
  computeRubricScore: vi.fn(() => ({ score: 0, maxScore: 0, failures: [], passes: [], missing: [] })),
}));

import { normalizeReviewFeedback } from '../review-feedback.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizeReviewFeedback', () => {
  it('returns undefined for null raw', () => {
    expect(normalizeReviewFeedback({ raw: null, type: 'blog', reviewScore: null })).toBeUndefined();
  });

  it('returns undefined for undefined raw', () => {
    expect(normalizeReviewFeedback({ raw: undefined, type: 'blog', reviewScore: null })).toBeUndefined();
  });

  it('returns undefined when the raw blob has no issues, minor_issues, or strengths', () => {
    const result = normalizeReviewFeedback({
      raw: { blog_review: {} },
      type: 'blog',
      reviewScore: 70,
    });
    expect(result).toBeUndefined();
  });

  it('extracts critical_issues from issues.critical object array (with issue, location, suggested_fix)', () => {
    const raw = {
      blog_review: {
        issues: {
          critical: [
            { issue: 'Missing intro', location: 'Introduction', suggested_fix: 'Add opening hook' },
          ],
          minor: [],
        },
        strengths: [],
      },
    };
    const result = normalizeReviewFeedback({ raw, type: 'blog', reviewScore: 55 });
    expect(result).toBeDefined();
    expect(result!.critical_issues).toEqual(['[Introduction] Missing intro — Fix: Add opening hook']);
    expect(result!.minor_issues).toEqual([]);
    expect(result!.strengths).toEqual([]);
    expect(result!.score).toBe(55);
  });

  it('extracts critical_issues from rubric_checks.critical_issues string array', () => {
    const raw = {
      blog_review: {
        rubric_checks: {
          critical_issues: ['Rubric fail A', 'Rubric fail B'],
          minor_issues: [],
          strengths: [],
        },
      },
    };
    const result = normalizeReviewFeedback({ raw, type: 'blog', reviewScore: 60 });
    expect(result).toBeDefined();
    expect(result!.critical_issues).toEqual(['Rubric fail A', 'Rubric fail B']);
  });

  it('deduplicates issues appearing in both issues.critical and rubric_checks.critical_issues', () => {
    const raw = {
      blog_review: {
        issues: {
          critical: [{ issue: 'Shared issue', location: '', suggested_fix: '' }],
        },
        rubric_checks: {
          critical_issues: ['Shared issue'],
        },
      },
    };
    const result = normalizeReviewFeedback({ raw, type: 'blog', reviewScore: null });
    // After fmtIssue: 'Shared issue' (location empty, fix empty), plus 'Shared issue' from rubric
    // dedupe → one entry
    expect(result!.critical_issues!.length).toBe(1);
  });

  it('extracts minor_issues from both issues.minor and rubric_checks.minor_issues', () => {
    const raw = {
      blog_review: {
        issues: { minor: [{ issue: 'Minor A', location: '', suggested_fix: '' }] },
        rubric_checks: { minor_issues: ['Minor B'] },
        strengths: ['Good pacing'],
      },
    };
    const result = normalizeReviewFeedback({ raw, type: 'blog', reviewScore: 75 });
    expect(result!.minor_issues).toContain('Minor A');
    expect(result!.minor_issues).toContain('Minor B');
    expect(result!.strengths).toEqual(['Good pacing']);
  });

  it('uses verdict field for overall_verdict', () => {
    const raw = {
      blog_review: {
        verdict: 'needs_improvement',
        issues: { critical: ['Something'] },
      },
    };
    const result = normalizeReviewFeedback({ raw, type: 'blog', reviewScore: 50 });
    expect(result!.overall_verdict).toBe('needs_improvement');
  });

  it('falls back to quality_tier when verdict is absent', () => {
    const raw = {
      blog_review: {
        quality_tier: 'bronze',
        issues: { critical: ['Something'] },
      },
    };
    const result = normalizeReviewFeedback({ raw, type: 'blog', reviewScore: 50 });
    expect(result!.overall_verdict).toBe('bronze');
  });

  it('uses the whole raw blob if <type>_review key is absent', () => {
    // When no blog_review key → uses raw directly as the block
    const raw = {
      issues: { critical: ['Top-level crit'] },
      strengths: ['Top-level strength'],
    };
    const result = normalizeReviewFeedback({ raw, type: 'blog', reviewScore: null });
    expect(result).toBeDefined();
    expect(result!.critical_issues).toContain('Top-level crit');
    expect(result!.strengths).toContain('Top-level strength');
  });

  it('passes reviewScore through to score field', () => {
    const raw = {
      video_review: {
        issues: { critical: ['Missing CTA'] },
        strengths: [],
      },
    };
    const result = normalizeReviewFeedback({ raw, type: 'video', reviewScore: 82 });
    expect(result!.score).toBe(82);
  });

  it('sets score to null when reviewScore is null', () => {
    const raw = {
      video_review: {
        issues: { critical: ['Issue'] },
      },
    };
    const result = normalizeReviewFeedback({ raw, type: 'video', reviewScore: null });
    expect(result!.score).toBeNull();
  });

  it('handles issues as plain strings (not objects)', () => {
    const raw = {
      blog_review: {
        issues: {
          critical: ['Plain string critical'],
          minor: ['Plain string minor'],
        },
      },
    };
    const result = normalizeReviewFeedback({ raw, type: 'blog', reviewScore: 65 });
    expect(result!.critical_issues).toEqual(['Plain string critical']);
    expect(result!.minor_issues).toEqual(['Plain string minor']);
  });
});
