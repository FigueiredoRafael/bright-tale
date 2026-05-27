import { describe, it, expect } from 'vitest';
import {
  computeRubricScore,
  deriveVerdictFromScore,
  extractRubricEvaluation,
  getRubricForType,
} from '../computeRubricScore.js';
import { BLOG_CRITERIA, BLOG_MAX_SCORE } from '../criteria/blog.js';
import { VIDEO_CRITERIA, VIDEO_MAX_SCORE } from '../criteria/video.js';
import { SHORTS_CRITERIA, SHORTS_MAX_SCORE } from '../criteria/shorts.js';
import { PODCAST_CRITERIA, PODCAST_MAX_SCORE } from '../criteria/podcast.js';

describe('getRubricForType', () => {
  it('returns the blog rubric for type=blog', () => {
    const rubric = getRubricForType('blog');
    expect(rubric).not.toBeNull();
    expect(rubric!.length).toBe(10);
    expect(rubric!.every((c) => c.weight === 10)).toBe(true);
  });

  it('returns the video rubric for type=video', () => {
    const rubric = getRubricForType('video');
    expect(rubric).toBe(VIDEO_CRITERIA);
    expect(VIDEO_MAX_SCORE).toBe(100);
  });

  it('returns the shorts rubric for type=shorts', () => {
    const rubric = getRubricForType('shorts');
    expect(rubric).toBe(SHORTS_CRITERIA);
    expect(SHORTS_MAX_SCORE).toBe(100);
  });

  it('returns the podcast rubric for type=podcast', () => {
    const rubric = getRubricForType('podcast');
    expect(rubric).toBe(PODCAST_CRITERIA);
    expect(PODCAST_MAX_SCORE).toBe(100);
  });

  it('returns null for unknown types', () => {
    expect(getRubricForType('newsletter')).toBeNull();
    expect(getRubricForType('')).toBeNull();
  });
});

describe('computeRubricScore', () => {
  function evalAllPass(): Record<string, { pass: boolean; evidence: string }> {
    const out: Record<string, { pass: boolean; evidence: string }> = {};
    for (const c of BLOG_CRITERIA) {
      out[c.key] = { pass: true, evidence: `quote from draft for ${c.key}` };
    }
    return out;
  }

  it('all 10 criteria pass → score = 100', () => {
    const result = computeRubricScore(BLOG_CRITERIA, evalAllPass());
    expect(result.score).toBe(100);
    expect(result.maxScore).toBe(100);
    expect(result.passes.length).toBe(10);
    expect(result.failures.length).toBe(0);
  });

  it('all 10 criteria fail → score = 0', () => {
    const evalAllFail: Record<string, { pass: boolean; evidence: string }> = {};
    for (const c of BLOG_CRITERIA) {
      evalAllFail[c.key] = { pass: false, evidence: `failed because ${c.key}` };
    }
    const result = computeRubricScore(BLOG_CRITERIA, evalAllFail);
    expect(result.score).toBe(0);
    expect(result.failures.length).toBe(10);
    expect(result.passes.length).toBe(0);
  });

  it('6/10 criteria pass → score = 60 (deterministic, not LLM-set)', () => {
    const eval6Pass: Record<string, { pass: boolean; evidence: string }> = {};
    BLOG_CRITERIA.forEach((c, idx) => {
      eval6Pass[c.key] = {
        pass: idx < 6,
        evidence: idx < 6 ? 'pass' : 'fail',
      };
    });
    const result = computeRubricScore(BLOG_CRITERIA, eval6Pass);
    expect(result.score).toBe(60);
    expect(result.passes.length).toBe(6);
    expect(result.failures.length).toBe(4);
  });

  it('missing criteria are treated as failures with synthetic evidence', () => {
    // Reviewer evaluated only 3 of 10 criteria. The other 7 are missing.
    const partialEval = {
      [BLOG_CRITERIA[0].key]: { pass: true, evidence: 'good' },
      [BLOG_CRITERIA[1].key]: { pass: true, evidence: 'good' },
      [BLOG_CRITERIA[2].key]: { pass: true, evidence: 'good' },
    };
    const result = computeRubricScore(BLOG_CRITERIA, partialEval);
    expect(result.score).toBe(30);
    expect(result.passes.length).toBe(3);
    expect(result.failures.length).toBe(7);
    expect(result.missing.length).toBe(7);
    expect(result.failures[3].evidence).toContain('did not evaluate');
  });

  it('null evaluation → all criteria fail, score = 0', () => {
    const result = computeRubricScore(BLOG_CRITERIA, null);
    expect(result.score).toBe(0);
    expect(result.missing.length).toBe(10);
  });

  it('failure entries carry passWhen for producer feedback', () => {
    const eval1Fail = evalAllPass();
    eval1Fail.has_strong_hook = { pass: false, evidence: 'opening is "Lorem ipsum"' };
    const result = computeRubricScore(BLOG_CRITERIA, eval1Fail);
    const hookFailure = result.failures.find((f) => f.key === 'has_strong_hook');
    expect(hookFailure).toBeDefined();
    expect(hookFailure!.passWhen).toContain('rhetorical device');
    expect(hookFailure!.evidence).toContain('Lorem ipsum');
  });

  it('BLOG_MAX_SCORE constant matches sum of weights', () => {
    expect(BLOG_MAX_SCORE).toBe(100);
  });
});

describe('extractRubricEvaluation', () => {
  it('finds rubric_evaluation under <type>_review', () => {
    const result = extractRubricEvaluation(
      {
        blog_review: {
          rubric_evaluation: {
            has_strong_hook: { pass: true, evidence: 'good' },
          },
        },
      },
      'blog',
    );
    expect(result).not.toBeNull();
    expect(result!.has_strong_hook.pass).toBe(true);
  });

  it('finds rubric_evaluation at root when no type wrapper', () => {
    const result = extractRubricEvaluation(
      { rubric_evaluation: { has_strong_hook: { pass: true, evidence: 'x' } } },
      'blog',
    );
    expect(result).not.toBeNull();
  });

  it('unwraps BC_REVIEW_OUTPUT envelope', () => {
    const result = extractRubricEvaluation(
      {
        BC_REVIEW_OUTPUT: {
          blog_review: {
            rubric_evaluation: { has_strong_hook: { pass: false, evidence: 'x' } },
          },
        },
      },
      'blog',
    );
    expect(result).not.toBeNull();
    expect(result!.has_strong_hook.pass).toBe(false);
  });

  it('returns null when no rubric_evaluation present', () => {
    expect(extractRubricEvaluation({ blog_review: { score: 80 } }, 'blog')).toBeNull();
    expect(extractRubricEvaluation(null, 'blog')).toBeNull();
    expect(extractRubricEvaluation({}, 'blog')).toBeNull();
  });
});

describe('deriveVerdictFromScore', () => {
  it('90+ % = approved', () => {
    expect(deriveVerdictFromScore(90, 100)).toBe('approved');
    expect(deriveVerdictFromScore(100, 100)).toBe('approved');
  });

  it('30-89 % = revision_required', () => {
    expect(deriveVerdictFromScore(60, 100)).toBe('revision_required');
    expect(deriveVerdictFromScore(30, 100)).toBe('revision_required');
    expect(deriveVerdictFromScore(89, 100)).toBe('revision_required');
  });

  it('< 30 % = rejected', () => {
    expect(deriveVerdictFromScore(20, 100)).toBe('rejected');
    expect(deriveVerdictFromScore(0, 100)).toBe('rejected');
  });

  it('handles non-100 maxScore proportionally', () => {
    expect(deriveVerdictFromScore(45, 50)).toBe('approved'); // 90 %
    expect(deriveVerdictFromScore(25, 50)).toBe('revision_required'); // 50 %
  });
});
