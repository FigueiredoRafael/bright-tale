/**
 * Credit Reservations Façade (V2-006.2)
 *
 * Wraps the four DB RPCs (reserve_credits, commit_reservation,
 * release_reservation, expire_stale_reservations) and adds TypeScript-level
 * error mapping so callers never need to inspect raw Supabase error objects.
 *
 * Error codes returned by the RPCs:
 *   INSUFFICIENT_CREDITS  → 402 ApiError
 *   RESERVATION_NOT_FOUND → 404 ApiError
 *   anything else          → 500 ApiError (message preserved server-side, not leaked)
 */

import { createServiceClient } from '../supabase/index.js';
import { ApiError } from '../api/errors.js';

// ---------------------------------------------------------------------------
// reserve()
// ---------------------------------------------------------------------------

/**
 * Creates a credit hold for `cost` credits on org `orgId`.
 * Returns a reservation token (UUID) to pass to commit() or release().
 *
 * @throws ApiError 402 — INSUFFICIENT_CREDITS
 * @throws ApiError 500 — unexpected RPC failure
 */
export async function reserve(
  orgId: string,
  userId: string,
  cost: number,
): Promise<string> {
  const sb = createServiceClient() as ReturnType<typeof createServiceClient> & { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

  const { data, error } = await sb.rpc('reserve_credits', {
    p_org_id: orgId,
    p_user_id: userId,
    p_amount: cost,
  });

  if (error) {
    // Log internally without leaking internals
    console.error('[credits/reserve] RPC error:', error.message);
    throw new ApiError(500, 'Failed to reserve credits', 'INTERNAL');
  }

  const result = data as { token: string | null; error_code: string | null };

  if (result.error_code === 'INSUFFICIENT_CREDITS') {
    throw new ApiError(402, 'Insufficient credits', 'INSUFFICIENT_CREDITS');
  }

  if (!result.token) {
    throw new ApiError(500, 'Failed to reserve credits: no token returned', 'INTERNAL');
  }

  return result.token;
}

// ---------------------------------------------------------------------------
// commit()
// ---------------------------------------------------------------------------

/**
 * Finalises a credit reservation after the action completes successfully.
 * - Calls commit_reservation RPC (debits org credits, updates credits_reserved)
 * - Increments org_memberships.credits_used_cycle by actualCost
 * - Overwrites the placeholder credit_usage row (inserted by RPC with
 *   action='content_generation', category='text') with the real values
 *
 * @throws ApiError 404 — RESERVATION_NOT_FOUND
 * @throws ApiError 500 — unexpected RPC failure
 */
export async function commit(
  token: string,
  actualCost: number,
  action: string,
  category: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const sb = createServiceClient() as ReturnType<typeof createServiceClient> & { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

  const { data, error } = await sb.rpc('commit_reservation', {
    p_token: token,
    p_actual_cost: actualCost,
  });

  if (error) {
    console.error('[credits/commit] RPC error:', error.message);
    throw new ApiError(500, 'Failed to commit reservation', 'INTERNAL');
  }

  const result = data as { success: boolean; error_code?: string; org_id?: string; user_id?: string };

  if (!result.success) {
    if (result.error_code === 'RESERVATION_NOT_FOUND') {
      throw new ApiError(404, 'Reservation not found', 'RESERVATION_NOT_FOUND');
    }
    throw new ApiError(404, 'Reservation not found', 'RESERVATION_NOT_FOUND');
  }

  // The RPC returns org_id + user_id so we can scope the side-effect queries.
  // Fall back gracefully if not present (older RPC versions).
  const orgId = result.org_id;
  const userId = result.user_id;

  if (orgId && userId) {
    // Increment member cycle usage
    const { data: membership } = await sb
      .from('org_memberships')
      .select('credits_used_cycle')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .single();

    if (membership) {
      await sb
        .from('org_memberships')
        .update({ credits_used_cycle: (membership as { credits_used_cycle: number }).credits_used_cycle + actualCost })
        .eq('org_id', orgId)
        .eq('user_id', userId);
    }

    // Overwrite the placeholder credit_usage row
    const { data: usageRecords } = await sb
      .from('credit_usage')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('action', 'content_generation')
      .eq('category', 'text')
      .order('created_at', { ascending: false })
      .limit(1);

    const records = usageRecords as Array<{ id: string }> | null;
    if (records && records.length > 0) {
      await sb
        .from('credit_usage')
        .update({
          action,
          category,
          metadata_json: (metadata ?? null) as never,
        })
        .eq('id', records[0].id);
    }
  }
}

// ---------------------------------------------------------------------------
// release()
// ---------------------------------------------------------------------------

/**
 * Cancels a credit hold without debiting.
 * Silently ignores errors (reservation may have already expired or committed).
 */
export async function release(token: string): Promise<void> {
  const sb = createServiceClient() as ReturnType<typeof createServiceClient> & { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

  const { error } = await sb.rpc('release_reservation', { p_token: token });

  if (error) {
    // Swallow — don't propagate release failures to callers
    console.warn('[credits/release] RPC error (ignored):', error.message);
  }
}

// ---------------------------------------------------------------------------
// expireStale()
// ---------------------------------------------------------------------------

/**
 * Sweeps held reservations older than 15 minutes and marks them expired.
 * Returns the count of newly-expired reservations.
 *
 * @throws ApiError 500 — unexpected RPC failure
 */
export async function expireStale(): Promise<number> {
  const sb = createServiceClient() as ReturnType<typeof createServiceClient> & { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

  const { data, error } = await sb.rpc('expire_stale_reservations');

  if (error) {
    console.error('[credits/expireStale] RPC error:', error.message);
    throw new ApiError(500, 'Failed to expire stale reservations', 'INTERNAL');
  }

  return (data as number) ?? 0;
}
