/**
 * Stagnation detector — Module 4 (PRD #240 Fix 3).
 *
 * Pure function: no DB calls, no I/O. Consumes the same ReviewIteration shape
 * the dispatcher writes to `review_iterations` after each pass.
 *
 * Rules (encoded from PRD):
 *   1. History length < 3 → not stagnant (insufficient data).
 *   2. Last 3 iterations: max−min score ≤ 2 → flat-score signal.
 *   3. Jaccard of critical-issue title sets between iteration[N-2] and
 *      iteration[N] ≥ 0.7 → repeated-critical signal.
 *   4. BOTH signals required for stagnant: true. When both trip, reason = 'both'.
 *
 * `extractCriticalIssueTitles` and `jaccardSimilarity` are exported for unit
 * testing — they are load-bearing helpers, not implementation details.
 */

export interface ReviewIteration {
  iteration: number;
  score: number | null;
  feedbackJson: Record<string, unknown> | null;
}

export type StagnationReason = 'flat_score' | 'repeated_critical' | 'both';

export interface StagnationResult {
  stagnant: boolean;
  reason?: StagnationReason;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Walks a feedbackJson object looking for critical issue strings under any
 * `*_review.issues.critical[].issue` shape (video_review, blog_review, etc.).
 * Also handles plain string entries in the critical array.
 *
 * Returns a Set of lowercased, whitespace-normalised issue titles so Jaccard
 * comparison is case-insensitive and whitespace-insensitive.
 */
export function extractCriticalIssueTitles(
  iteration: Pick<ReviewIteration, 'feedbackJson'>,
): Set<string> {
  const result = new Set<string>();
  const fb = iteration.feedbackJson;
  if (!fb || typeof fb !== 'object') return result;

  for (const value of Object.values(fb)) {
    if (!value || typeof value !== 'object') continue;
    const review = value as Record<string, unknown>;
    const issues = review.issues as Record<string, unknown> | undefined;
    if (!issues) continue;
    const critical = issues.critical;
    if (!Array.isArray(critical)) continue;
    for (const entry of critical) {
      if (typeof entry === 'string' && entry.length > 0) {
        result.add(entry.trim().toLowerCase().replace(/\s+/g, ' '));
      } else if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        const text =
          (typeof obj.issue === 'string' && obj.issue) ||
          (typeof obj.title === 'string' && obj.title) ||
          (typeof obj.summary === 'string' && obj.summary);
        if (text) result.add(text.trim().toLowerCase().replace(/\s+/g, ' '));
      }
    }
  }
  return result;
}

/**
 * Jaccard similarity: |A ∩ B| / |A ∪ B|.
 * Returns 1.0 when both sets are empty (vacuously identical — the repeated-
 * critical signal is only meaningful when flat-score also trips, so empty-
 * issue iterations don't trigger stagnation alone).
 */
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

// ── detectStagnation ─────────────────────────────────────────────────────────

/**
 * Returns `{ stagnant: true, reason: 'both' }` when the last 3 review
 * iterations show no score progress (max−min ≤ 2) AND the same critical
 * issues keep repeating (Jaccard ≥ 0.7 between the oldest and newest of
 * the last 3).
 *
 * Only the LAST 3 rows are evaluated regardless of total history length —
 * older iterations may legitimately have looked different; what matters is
 * whether the loop is currently stuck.
 */
export function detectStagnation(iterations: ReviewIteration[]): StagnationResult {
  if (iterations.length < 3) return { stagnant: false };

  const last3 = iterations.slice(-3);

  // Signal 1: flat score (max − min ≤ 2, null scores treated as 0)
  const scores = last3.map((it) => it.score ?? 0);
  const scoreSpread = Math.max(...scores) - Math.min(...scores);
  const flatScore = scoreSpread <= 2;

  // Signal 2: repeated critical issues (Jaccard between oldest and newest of last 3)
  const oldest = extractCriticalIssueTitles(last3[0]);
  const newest = extractCriticalIssueTitles(last3[2]);
  const jaccard = jaccardSimilarity(oldest, newest);
  const repeatedCritical = jaccard >= 0.7;

  if (flatScore && repeatedCritical) {
    return { stagnant: true, reason: 'both' };
  }
  return { stagnant: false };
}
