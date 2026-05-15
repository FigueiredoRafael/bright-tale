/**
 * withReservation — credit lifecycle wrapper (V2-006.3, cleaned V2-006.7)
 *
 * Wraps a job's AI-generation step with the reservation lifecycle:
 *   reserve → fn → commit  (on success)
 *               → release  (on throw)
 *
 * The legacy checkCredits + debitCredits path has been removed as of V2-006.7.
 * pipeline_settings.use_credit_reservations is always true after migration
 * 20260515130000_pipeline_settings_use_reservations_default_on.sql.
 *
 * Public interface:
 *   withReservation(
 *     orgId, userId, estimatedCost,
 *     action, category, metadata,
 *     fn: ({ token, setActualCost }) => Promise<T>,
 *   ) → Promise<T>
 *
 * Callers may call setActualCost(n) inside fn to override the committed amount.
 * If not called, actualCost defaults to estimatedCost.
 *
 * Abort-safety:
 *   assertNotAborted throws JobAborted (a NonRetriableError subclass).
 *   Any throw inside fn (including JobAborted) triggers release() then re-throws.
 *   commit() failure (e.g. RESERVATION_OVER_CAP from RPC) is surfaced as-is;
 *   release() is NOT called after a commit failure because the RPC has already
 *   finalised the row state.
 */

import { reserve, commit, release } from '../../lib/credits/reservations.js';

// ---------------------------------------------------------------------------
// Context passed to fn
// ---------------------------------------------------------------------------

export interface ReservationContext {
  /** The reservation token returned by reserve(). Use for debugging/logging only. */
  token: string;
  /** Call this inside fn to override the amount that will be committed. */
  setActualCost: (cost: number) => void;
}

// ---------------------------------------------------------------------------
// withReservation
// ---------------------------------------------------------------------------

export async function withReservation<T>(
  orgId: string,
  userId: string,
  estimatedCost: number,
  action: string,
  category: string,
  metadata: Record<string, unknown> | undefined,
  fn: (ctx: ReservationContext) => Promise<T>,
): Promise<T> {
  // Always use the reservation path (flag permanently on after V2-006.7 migration)
  const token = await reserve(orgId, userId, estimatedCost);

  let actualCost = estimatedCost;
  const setActualCost = (cost: number) => { actualCost = cost; };

  let result: T;
  try {
    result = await fn({ token, setActualCost });
  } catch (err) {
    // Any error inside fn (including JobAborted) → release the hold and re-throw.
    // We fire-and-forget release so its errors never shadow the original error.
    await release(token).catch(() => { /* swallowed — release is best-effort */ });
    throw err;
  }

  // fn succeeded — commit at actualCost.
  // commit() may throw (e.g. RESERVATION_OVER_CAP from RPC).
  // We surface that error directly; we do NOT release because the RPC has
  // already touched the reservation row.
  await commit(token, actualCost, action, category, metadata);

  return result;
}
