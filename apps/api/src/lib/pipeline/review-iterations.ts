/**
 * review_iterations helpers (BRI-153).
 *
 * The review loop snapshots every (draft, score) pass into `review_iterations`
 * (written by pipeline-review-dispatch on each pass). These helpers are the
 * single write-path for "make iteration N the live draft", shared by:
 *   - the manual picker route (POST /:id/iterations/:iteration/promote), and
 *   - the dispatcher's terminal best-of recovery (auto-set the highest-scoring
 *     snapshot when the loop exhausts maxIterations without crossing approve).
 *
 * Keeping the write in one place stops the two callers from drifting (the kind
 * of duplication that caused the autopilot↔manual divergence elsewhere).
 */

// The service-role Supabase client is structurally typed across apps/api with
// per-call casts (dynamic table names). Accept a minimal shape here.
type Sb = { from: (table: string) => any };

export interface ReviewIterationRow {
  iteration: number;
  score: number | null;
  draft_json: unknown;
  feedback_json: unknown;
  verdict?: string | null;
}

export interface IterationFinalState {
  /** content_drafts.status to set (e.g. 'approved' for manual promote, 'in_review' for auto best-of park). */
  status: 'approved' | 'in_review';
  /** content_drafts.review_verdict to set. */
  verdict: 'approved' | 'revision_required' | 'rejected';
  /** When provided, stamps content_drafts.approved_at. */
  approvedAt?: string | null;
}

/**
 * Highest-scoring iteration that still carries a draft snapshot, or null when
 * none qualifies (no rows, or every candidate predates the snapshot column).
 * Ties keep the earliest iteration (reduce keeps the running best on `>`).
 */
export async function findBestIteration(
  sb: Sb,
  draftId: string,
): Promise<ReviewIterationRow | null> {
  const { data: rows } = await sb
    .from('review_iterations')
    .select('iteration, score, draft_json, feedback_json, verdict')
    .eq('draft_id', draftId)
    .order('iteration', { ascending: true });

  const candidates = ((rows ?? []) as ReviewIterationRow[]).filter(
    (r) => r.draft_json != null && typeof r.score === 'number',
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, r) =>
    (r.score as number) > (best.score as number) ? r : best,
  );
}

/**
 * Copy an iteration's snapshot + review fields back onto the live
 * content_drafts row. Does NOT touch iteration_count (the loop history stands).
 */
export async function applyIterationToDraft(
  sb: Sb,
  draftId: string,
  row: ReviewIterationRow,
  finalState: IterationFinalState,
): Promise<void> {
  const update: Record<string, unknown> = {
    draft_json: row.draft_json,
    review_feedback_json: row.feedback_json,
    review_score: row.score,
    review_verdict: finalState.verdict,
    status: finalState.status,
  };
  if (finalState.approvedAt) update.approved_at = finalState.approvedAt;
  await sb.from('content_drafts').update(update).eq('id', draftId);
}
