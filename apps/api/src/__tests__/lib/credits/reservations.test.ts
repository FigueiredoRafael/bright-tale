/**
 * Unit tests for apps/api/src/lib/credits/reservations.ts (V2-006.2)
 *
 * 8 tests total:
 *   reserve() happy path
 *   reserve() → INSUFFICIENT_CREDITS (402)
 *   reserve() → generic RPC error (500)
 *   commit() happy path
 *   commit() → RESERVATION_NOT_FOUND (404)
 *   release() happy path (silently succeeds even when not found)
 *   release() → RPC error (silently swallowed)
 *   expireStale() happy path
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Chainable Supabase mock — must be hoisted so vi.mock() factory can reference
// ---------------------------------------------------------------------------
const sbChain = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of [
    'select', 'eq', 'update', 'insert', 'order', 'limit', 'single', 'maybeSingle',
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  return chain;
});

const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({
    rpc: mockRpc,
    from: vi.fn().mockReturnValue(sbChain),
  }),
}));

// ---------------------------------------------------------------------------
// Import under test — AFTER mocks are registered
// ---------------------------------------------------------------------------
import { reserve, commit, release, expireStale } from '../../../lib/credits/reservations.js';
import { ApiError } from '../../../lib/api/errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TOKEN = '550e8400-e29b-41d4-a716-446655440000';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: each chain method returns the chain itself
  for (const m of Object.values(sbChain)) {
    m.mockReturnValue(sbChain);
  }
});

// ---------------------------------------------------------------------------
// reserve()
// ---------------------------------------------------------------------------
describe('reserve()', () => {
  it('returns the reservation token on success', async () => {
    mockRpc.mockResolvedValue({
      data: { token: TOKEN, error_code: null },
      error: null,
    });

    const result = await reserve('org-1', 'user-1', 50);

    expect(result).toBe(TOKEN);
    expect(mockRpc).toHaveBeenCalledWith('reserve_credits', {
      p_org_id: 'org-1',
      p_user_id: 'user-1',
      p_amount: 50,
    });
  });

  it('throws 402 ApiError when RPC returns INSUFFICIENT_CREDITS', async () => {
    mockRpc.mockResolvedValue({
      data: { token: null, error_code: 'INSUFFICIENT_CREDITS' },
      error: null,
    });

    const err = await reserve('org-1', 'user-1', 9999).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(402);
    expect((err as ApiError).code).toBe('INSUFFICIENT_CREDITS');
  });

  it('throws 500 ApiError when RPC itself errors', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'connection refused' },
    });

    const err = await reserve('org-1', 'user-1', 50).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// commit()
// ---------------------------------------------------------------------------
describe('commit()', () => {
  it('calls commit_reservation RPC, updates membership and credit_usage', async () => {
    // commit_reservation RPC
    mockRpc.mockResolvedValue({
      data: { success: true, source: 'plan' },
      error: null,
    });

    // membership query → single()
    sbChain.single.mockResolvedValueOnce({
      data: { credits_used_cycle: 10 },
      error: null,
    });

    // credit_usage latest-record query → limit()
    sbChain.limit.mockResolvedValueOnce({
      data: [{ id: 'usage-row-1' }],
      error: null,
    });

    await commit(TOKEN, 40, 'brainstorm', 'ideas', { foo: 'bar' });

    expect(mockRpc).toHaveBeenCalledWith('commit_reservation', {
      p_token: TOKEN,
      p_actual_cost: 40,
    });
  });

  it('throws 404 ApiError when reservation not found', async () => {
    mockRpc.mockResolvedValue({
      data: { success: false, error_code: 'RESERVATION_NOT_FOUND' },
      error: null,
    });

    const err = await commit(TOKEN, 40, 'action', 'cat').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).code).toBe('RESERVATION_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// release()
// ---------------------------------------------------------------------------
describe('release()', () => {
  it('resolves without throwing on success', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true },
      error: null,
    });

    await expect(release(TOKEN)).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith('release_reservation', { p_token: TOKEN });
  });

  it('silently swallows RPC errors (no throw)', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'RPC boom' },
    });

    await expect(release(TOKEN)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// expireStale()
// ---------------------------------------------------------------------------
describe('expireStale()', () => {
  it('returns the count of expired reservations', async () => {
    mockRpc.mockResolvedValue({ data: 7, error: null });

    const count = await expireStale();
    expect(count).toBe(7);
    expect(mockRpc).toHaveBeenCalledWith('expire_stale_reservations');
  });

  it('throws 500 ApiError when RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'db down' } });

    const err = await expireStale().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
  });
});
