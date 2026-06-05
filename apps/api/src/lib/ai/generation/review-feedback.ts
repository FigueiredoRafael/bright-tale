/**
 * Normalises the review agent's nested feedback blob into the flat shape
 * that buildReproduceMessage expects.
 *
 * The review agent emits:
 *   { <type>_review: {
 *       verdict,
 *       issues: { critical: Array<{issue,location,suggested_fix}>, minor: Array<…> },
 *       strengths: string[],
 *       rubric_checks: { critical_issues: string[], minor_issues: string[], strengths: string[] }
 *     }
 *   }
 *
 * Without this normalization, every field arrives as `undefined` and the
 * reproduce prompt contains no actionable feedback (score never moves).
 *
 * Two callers previously had near-identical inline IIFEs:
 *   - production-produce.ts   (reads from effectiveProductionParams.review_feedback)
 *   - pipeline-production-dispatch.ts (reads from productionParams.review_feedback)
 *
 * Both now delegate here. The differences (raw source var, score source) are
 * passed as params so the output is byte-identical to what each caller produced.
 */
import {
  computeRubricScore,
  extractRubricEvaluation,
  getRubricForType,
} from '../scoring/computeRubricScore.js';

export interface NormalizedReviewFeedback {
  overall_verdict?: string;
  score?: number | null;
  critical_issues?: string[];
  minor_issues?: string[];
  strengths?: string[];
}

export interface NormalizeReviewFeedbackParams {
  /** The raw review_feedback blob (the top-level wrapper, e.g. { blog_review: {…} }). */
  raw: Record<string, unknown> | undefined | null;
  /** Content type: 'blog' | 'video' | 'shorts' | 'podcast'. Used to key into `<type>_review`. */
  type: string;
  /** The draft's current review_score (from content_drafts.review_score). */
  reviewScore: number | null | undefined;
}

function fmtIssue(i: unknown): string {
  if (typeof i === 'string') return i;
  if (!i || typeof i !== 'object') return '';
  const obj = i as Record<string, unknown>;
  const issueText = (obj.issue as string) ?? '';
  const fix = (obj.suggested_fix as string) ?? '';
  const loc = (obj.location as string) ?? '';
  const head = loc ? `[${loc}] ${issueText}` : issueText;
  return fix ? `${head} — Fix: ${fix}` : head;
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

/**
 * Flatten the review agent's nested wrapper into the shape buildReproduceMessage
 * expects: { overall_verdict, score, critical_issues, minor_issues, strengths }.
 *
 * Returns `undefined` when the raw blob is empty or produces no actionable items.
 */
export function normalizeReviewFeedback(
  params: NormalizeReviewFeedbackParams,
): NormalizedReviewFeedback | undefined {
  const { raw, type, reviewScore } = params;
  if (!raw || typeof raw !== 'object') return undefined;

  const block = (
    (raw[`${type}_review`] as Record<string, unknown> | undefined) ?? raw
  ) as Record<string, unknown>;
  const issues = (block.issues as Record<string, unknown> | undefined) ?? {};
  const rubric = (block.rubric_checks as Record<string, unknown> | undefined) ?? {};

  const criticalDetailed = Array.isArray(issues.critical)
    ? (issues.critical as unknown[]).map(fmtIssue)
    : [];
  const minorDetailed = Array.isArray(issues.minor)
    ? (issues.minor as unknown[]).map(fmtIssue)
    : [];
  const criticalRubric = Array.isArray(rubric.critical_issues)
    ? (rubric.critical_issues as string[])
    : [];
  const minorRubric = Array.isArray(rubric.minor_issues)
    ? (rubric.minor_issues as string[])
    : [];
  const blockStrengths = Array.isArray(block.strengths) ? (block.strengths as string[]) : [];
  const rubricStrengths = Array.isArray(rubric.strengths)
    ? (rubric.strengths as string[])
    : [];

  // Rubric-based criticals: when the reviewer returned a rubric_evaluation
  // (new deterministic scoring path), surface every failed criterion as a
  // critical issue with its pass condition. This gives the producer concrete
  // instructions instead of free-form text.
  const rubricForType = getRubricForType(type);
  const criticalFromRubric: string[] = [];
  if (rubricForType) {
    const rubricEval = extractRubricEvaluation(raw, type);
    const computed = computeRubricScore(rubricForType, rubricEval);
    for (const f of computed.failures) {
      const evidenceLine =
        f.evidence && f.evidence !== '(no evidence provided)'
          ? `Evidence: ${f.evidence}. `
          : '';
      criticalFromRubric.push(
        `[${f.key}] ${f.title} — FAIL. ${evidenceLine}Pass condition: ${f.passWhen}`,
      );
    }
  }

  const critical_issues = dedupe([...criticalFromRubric, ...criticalDetailed, ...criticalRubric]);
  const minor_issues = dedupe([...minorDetailed, ...minorRubric]);
  const strengths = dedupe([...blockStrengths, ...rubricStrengths]);

  if (critical_issues.length === 0 && minor_issues.length === 0 && strengths.length === 0) {
    return undefined;
  }

  return {
    overall_verdict: (block.verdict as string) ?? (block.quality_tier as string) ?? undefined,
    score: reviewScore ?? null,
    critical_issues,
    minor_issues,
    strengths,
  };
}
