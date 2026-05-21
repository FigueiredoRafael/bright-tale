import { BLOG_CRITERIA } from './criteria/blog.js';
import type { ComputedScore, RubricCriterion, RubricEvaluation } from './criteria/types.js';

/**
 * Resolves the rubric for a given content type. Only blog has a full rubric
 * today; other mediums fall back to the legacy LLM-set score until their
 * rubrics are authored.
 */
export function getRubricForType(type: string): RubricCriterion[] | null {
  if (type === 'blog') return BLOG_CRITERIA;
  return null;
}

/**
 * Extracts a `rubric_evaluation` object from a review response, handling the
 * common nesting shapes:
 *   - root.blog_review.rubric_evaluation
 *   - root.<type>_review.rubric_evaluation
 *   - root.rubric_evaluation
 *   - root.BC_REVIEW_OUTPUT.<type>_review.rubric_evaluation (legacy envelope)
 */
export function extractRubricEvaluation(
  reviewFeedback: unknown,
  type: string,
): RubricEvaluation | null {
  if (!reviewFeedback || typeof reviewFeedback !== 'object') return null;
  const root = reviewFeedback as Record<string, unknown>;
  const envelope = (root.BC_REVIEW_OUTPUT && typeof root.BC_REVIEW_OUTPUT === 'object'
    ? (root.BC_REVIEW_OUTPUT as Record<string, unknown>)
    : root) as Record<string, unknown>;
  const formatKey = `${type}_review`;
  const formatReview = envelope[formatKey] as Record<string, unknown> | undefined;
  const candidate =
    (formatReview?.rubric_evaluation as RubricEvaluation | undefined) ??
    (envelope.rubric_evaluation as RubricEvaluation | undefined);
  if (!candidate || typeof candidate !== 'object') return null;
  return candidate;
}

/**
 * Server-side rubric scoring. Replaces the LLM's opinionated 0-100 number
 * with a deterministic Σ(weight) over criteria the reviewer marked as
 * passing. Missing criteria are counted as failures (with synthetic "not
 * evaluated" evidence) — this prevents an incomplete reviewer response from
 * silently inflating the score.
 *
 * Returns null if no rubric is defined for this type (caller falls back to
 * the legacy LLM score field).
 */
export function computeRubricScore(
  rubric: RubricCriterion[],
  evaluation: RubricEvaluation | null,
): ComputedScore {
  const passes: ComputedScore['passes'] = [];
  const failures: ComputedScore['failures'] = [];
  const missing: ComputedScore['missing'] = [];
  let score = 0;
  const maxScore = rubric.reduce((s, c) => s + c.weight, 0);

  for (const criterion of rubric) {
    const entry = evaluation?.[criterion.key];
    if (!entry || typeof entry !== 'object') {
      missing.push({ key: criterion.key, title: criterion.title });
      failures.push({
        key: criterion.key,
        title: criterion.title,
        passWhen: criterion.passWhen,
        evidence: 'Reviewer did not evaluate this criterion (treated as fail).',
      });
      continue;
    }
    if (entry.pass === true) {
      score += criterion.weight;
      passes.push({ key: criterion.key, title: criterion.title });
    } else {
      failures.push({
        key: criterion.key,
        title: criterion.title,
        passWhen: criterion.passWhen,
        evidence:
          typeof entry.evidence === 'string' && entry.evidence.length > 0
            ? entry.evidence
            : '(no evidence provided)',
      });
    }
  }

  return { score, maxScore, passes, failures, missing };
}

/**
 * Verdict derivation from a rubric score. Keeps the existing approval
 * threshold (90+ = approved) but expresses it as "9 of 10 criteria passed"
 * for blog (or equivalent fraction for other rubrics).
 */
export function deriveVerdictFromScore(score: number, maxScore: number): 'approved' | 'revision_required' | 'rejected' {
  if (maxScore === 0) return 'revision_required';
  const pct = (score / maxScore) * 100;
  if (pct >= 90) return 'approved';
  if (pct >= 30) return 'revision_required';
  return 'rejected';
}
