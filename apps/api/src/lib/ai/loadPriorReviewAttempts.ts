/**
 * Loads prior review attempts for a given content_draft so buildReviewMessage
 * can carry "previous attempts" memory into the next /review call. Without
 * this the reviewer is stateless per attempt and the loop can oscillate
 * instead of converging.
 *
 * Source of truth:
 *   1. `stage_runs` with stage='review' and payload_ref → content_draft id.
 *      Each attempt = one row; `outcome_json` carries
 *      { verdict, score, feedbackJson, iterationCount } written by
 *      pipeline-review-dispatch.markCompleted.
 *   2. Fallback to `content_drafts.review_feedback_json` (latest only) when
 *      no stage_runs history exists — typical for engine-driven /review
 *      calls that bypass the orchestrator.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PriorReviewAttempt } from './prompts/review.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

const MAX_PRIORS = 3;

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const candidate =
          (typeof obj.summary === 'string' && obj.summary) ||
          (typeof obj.text === 'string' && obj.text) ||
          (typeof obj.title === 'string' && obj.title) ||
          (typeof obj.issue === 'string' && obj.issue) ||
          (typeof obj.point === 'string' && obj.point) ||
          (typeof obj.message === 'string' && obj.message);
        if (candidate) return candidate;
      }
      return '';
    })
    .filter((s) => s.length > 0);
}

function extractIssues(
  feedback: unknown,
  draftType: string,
): { critical: string[]; minor: string[] } {
  if (!feedback || typeof feedback !== 'object') return { critical: [], minor: [] };
  const fb = feedback as Record<string, unknown>;
  const wrapped = (fb.BC_REVIEW_OUTPUT && typeof fb.BC_REVIEW_OUTPUT === 'object'
    ? (fb.BC_REVIEW_OUTPUT as Record<string, unknown>)
    : fb) as Record<string, unknown>;
  const formatKey = `${draftType}_review`;
  const formatReview =
    (wrapped[formatKey] && typeof wrapped[formatKey] === 'object'
      ? (wrapped[formatKey] as Record<string, unknown>)
      : (wrapped.blog_review && typeof wrapped.blog_review === 'object'
        ? (wrapped.blog_review as Record<string, unknown>)
        : null)) as Record<string, unknown> | null;

  // Two shapes observed: { issues: { critical, minor } } and
  // { rubric_checks: { critical_issues, minor_issues } }. Merge both.
  const critical: string[] = [];
  const minor: string[] = [];
  if (formatReview) {
    const issues = formatReview.issues as Record<string, unknown> | undefined;
    if (issues) {
      critical.push(...asStringArray(issues.critical));
      minor.push(...asStringArray(issues.minor));
    }
    const rubric = formatReview.rubric_checks as Record<string, unknown> | undefined;
    if (rubric) {
      critical.push(...asStringArray(rubric.critical_issues));
      minor.push(...asStringArray(rubric.minor_issues));
    }
  } else {
    // Flat fallback
    critical.push(...asStringArray(wrapped.critical_issues));
    minor.push(...asStringArray(wrapped.minor_issues));
  }
  return { critical, minor };
}

function extractScore(feedback: unknown, draftType: string): number | null {
  if (!feedback || typeof feedback !== 'object') return null;
  const fb = feedback as Record<string, unknown>;
  const wrapped = (fb.BC_REVIEW_OUTPUT && typeof fb.BC_REVIEW_OUTPUT === 'object'
    ? (fb.BC_REVIEW_OUTPUT as Record<string, unknown>)
    : fb) as Record<string, unknown>;
  const formatKey = `${draftType}_review`;
  const formatReview = wrapped[formatKey] as Record<string, unknown> | undefined;
  if (formatReview && typeof formatReview.score === 'number') return formatReview.score;
  const blog = wrapped.blog_review as Record<string, unknown> | undefined;
  if (blog && typeof blog.score === 'number') return blog.score;
  if (typeof wrapped.score === 'number') return wrapped.score as number;
  return null;
}

function extractVerdict(feedback: unknown): string {
  if (!feedback || typeof feedback !== 'object') return 'unknown';
  const fb = feedback as Record<string, unknown>;
  const wrapped = (fb.BC_REVIEW_OUTPUT && typeof fb.BC_REVIEW_OUTPUT === 'object'
    ? (fb.BC_REVIEW_OUTPUT as Record<string, unknown>)
    : fb) as Record<string, unknown>;
  if (typeof wrapped.overall_verdict === 'string') return wrapped.overall_verdict as string;
  return 'unknown';
}

export async function loadPriorReviewAttempts(
  sb: Sb,
  draftId: string,
  draftType: string,
  excludeCurrentAttemptNo?: number,
): Promise<PriorReviewAttempt[]> {
  // Primary source: stage_runs review history bound to this draft.
  const { data: rows } = await sb
    .from('stage_runs')
    .select('attempt_no, status, outcome_json, payload_ref')
    .eq('stage', 'review')
    .order('attempt_no', { ascending: false })
    .limit(MAX_PRIORS + 2);

  const filtered = ((rows ?? []) as Array<Record<string, unknown>>).filter((r) => {
    const ref = r.payload_ref as { kind?: string; id?: string } | null | undefined;
    if (!ref || ref.kind !== 'content_draft' || ref.id !== draftId) return false;
    if (excludeCurrentAttemptNo != null && r.attempt_no === excludeCurrentAttemptNo) return false;
    return true;
  });

  if (filtered.length > 0) {
    return filtered.slice(0, MAX_PRIORS).map((r) => {
      const outcome = (r.outcome_json ?? {}) as Record<string, unknown>;
      const feedback = outcome.feedbackJson;
      const { critical, minor } = extractIssues(feedback, draftType);
      return {
        attemptNo: r.attempt_no as number,
        score: typeof outcome.score === 'number' ? (outcome.score as number) : extractScore(feedback, draftType),
        verdict: typeof outcome.verdict === 'string' ? (outcome.verdict as string) : extractVerdict(feedback),
        criticalIssues: critical,
        minorIssues: minor,
      };
    });
  }

  // Fallback: read the latest stored feedback off content_drafts.
  const { data: draft } = await sb
    .from('content_drafts')
    .select('review_feedback_json, review_score, review_verdict, iteration_count')
    .eq('id', draftId)
    .maybeSingle();
  if (!draft || !draft.review_feedback_json) return [];
  const feedback = draft.review_feedback_json;
  const { critical, minor } = extractIssues(feedback, draftType);
  const score =
    typeof draft.review_score === 'number'
      ? (draft.review_score as number)
      : extractScore(feedback, draftType);
  const verdict =
    typeof draft.review_verdict === 'string' && draft.review_verdict !== 'pending'
      ? (draft.review_verdict as string)
      : extractVerdict(feedback);
  if (critical.length === 0 && minor.length === 0 && score == null) return [];
  return [
    {
      attemptNo: typeof draft.iteration_count === 'number' ? (draft.iteration_count as number) : 1,
      score,
      verdict,
      criticalIssues: critical,
      minorIssues: minor,
    },
  ];
}
