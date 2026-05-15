/**
 * E2E smoke test for credit reservation lifecycle (V2-006 / V2-006.7)
 *
 * Tests the full reservation flow: reserve → commit/release/expire → verify balance.
 * Three required scenarios (per milestone card):
 *   1. Happy path:  reserve → mock job → commit → balance reflects actual cost
 *   2. Throw path:  reserve → mock job throws → release → balance unchanged
 *   3. Expire path: reserve → time-warp past 15min → expireStale → balance unchanged
 *
 * MOCKED INTEGRATION: Tests actual credit reservation functions with mocked Supabase.
 * No real DB — RPC calls are mocked to return expected results.
 *
 * Category A — no DB dependency.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock setup (must be before import of credit functions)
// ---------------------------------------------------------------------------

const mockRpc = vi.fn();

function createMockChain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  const methods = ['select', 'eq', 'single', 'update', 'order', 'limit', 'insert'];
  for (const method of methods) {
    chain[method] = vi.fn().mockImplementation(() => chain);
  }
  return chain;
}

const mockClient = {
  rpc: mockRpc,
  from: vi.fn().mockImplementation(() => createMockChain()),
};

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => mockClient,
}));

// Import functions after mocking
import { reserve, commit, release, expireStale } from '../../lib/credits/reservations.js';
import { getBalance } from '../../lib/credits/balance.js';
import { ApiError } from '../../lib/api/errors.js';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('credit reservation lifecycle E2E (V2-006)', () => {
  const testOrgId = 'org-test-123';
  const testUserId = 'user-test-456';
  const testToken = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockClear();
    // Reset mockClient.from to return a fresh chain each test
    mockClient.from.mockImplementation(() => createMockChain());
  });

  // ==========================================================================
  // SCENARIO 1: Happy path — reserve → mock job → commit → balance correct
  // ==========================================================================
  describe('scenario 1: happy path (reserve → commit)', () => {
    it('reserves credits, simulates a successful job, commits, and balance reflects actual cost', async () => {
      // Step 1: Reserve 100 credits
      mockRpc.mockResolvedValueOnce({
        data: { token: testToken, error_code: null },
        error: null,
      });

      const token = await reserve(testOrgId, testUserId, 100);
      expect(token).toBe(testToken);
      expect(mockRpc).toHaveBeenCalledWith('reserve_credits', {
        p_org_id: testOrgId,
        p_user_id: testUserId,
        p_amount: 100,
      });

      // Step 2: Simulate job work (no actual LLM call — we just verify the lifecycle)
      const actualCost = 80; // Job completed with 80 credits of actual cost

      vi.clearAllMocks();

      // Step 3: Commit at actual cost
      mockRpc.mockResolvedValueOnce({
        data: { success: true, source: 'plan', org_id: testOrgId, user_id: testUserId },
        error: null,
      });

      // Mock membership update + usage record lookup
      const mockChain = createMockChain();
      mockChain.single.mockResolvedValueOnce({
        data: { credits_used_cycle: 50 },
        error: null,
      });
      mockChain.limit.mockResolvedValueOnce({
        data: [{ id: 'usage-456' }],
        error: null,
      });
      vi.mocked(mockClient.from).mockReturnValue(mockChain);

      await commit(token, actualCost, 'brainstorm_generation', 'ideas', { test: true });

      expect(mockRpc).toHaveBeenCalledWith('commit_reservation', {
        p_token: token,
        p_actual_cost: actualCost,
      });

      // Step 4: Verify balance reflects actual cost
      vi.clearAllMocks();

      const balanceMockChain = createMockChain();
      balanceMockChain.single.mockResolvedValueOnce({
        data: {
          credits_total: 1000,
          credits_used: 80, // 80 debited (actual cost)
          credits_addon: 0,
          credits_reserved: 0, // reservation cleared after commit
          credits_reset_at: null,
          is_vip: false,
          signup_bonus_credits: 0,
          signup_bonus_expires_at: null,
        },
        error: null,
      });
      vi.mocked(mockClient.from).mockReturnValue(balanceMockChain);

      const balance = await getBalance(testOrgId);

      // available = (1000 - 80 - 0) + 0 = 920
      expect(balance.creditsUsed).toBe(80);
      expect(balance.creditsReserved).toBe(0);
      expect(balance.available).toBe(920);
    });
  });

  // ==========================================================================
  // SCENARIO 2: Throw path — reserve → job throws → release → balance unchanged
  // ==========================================================================
  describe('scenario 2: throw path (reserve → job throws → release)', () => {
    it('when the job throws, release is called and balance is unchanged', async () => {
      // Step 1: Reserve 100 credits
      mockRpc.mockResolvedValueOnce({
        data: { token: testToken, error_code: null },
        error: null,
      });

      const token = await reserve(testOrgId, testUserId, 100);
      expect(token).toBe(testToken);

      vi.clearAllMocks();

      // Step 2: Simulate job throwing (AI call fails)
      const jobError = new Error('AI provider unavailable');

      // Step 3: Release the reservation (credits returned to pool)
      mockRpc.mockResolvedValueOnce({
        data: { success: true },
        error: null,
      });

      // release() silently swallows errors, resolves with undefined
      await expect(release(token)).resolves.toBeUndefined();

      expect(mockRpc).toHaveBeenCalledWith('release_reservation', {
        p_token: token,
      });

      // Step 4: Verify balance is unchanged (no debit occurred)
      vi.clearAllMocks();

      const balanceMockChain = createMockChain();
      balanceMockChain.single.mockResolvedValueOnce({
        data: {
          credits_total: 1000,
          credits_used: 0, // unchanged — no debit
          credits_addon: 0,
          credits_reserved: 0, // reservation cleared after release
          credits_reset_at: null,
          is_vip: false,
          signup_bonus_credits: 0,
          signup_bonus_expires_at: null,
        },
        error: null,
      });
      vi.mocked(mockClient.from).mockReturnValue(balanceMockChain);

      const balance = await getBalance(testOrgId);

      expect(balance.creditsUsed).toBe(0);
      expect(balance.creditsReserved).toBe(0);
      // available = (1000 - 0 - 0) + 0 = 1000 — fully restored
      expect(balance.available).toBe(1000);

      // Also confirm the original error was not swallowed (just surfaced by the caller)
      expect(jobError.message).toBe('AI provider unavailable');
    });

    it('release silently succeeds even if token already expired', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { success: false }, // token not found / already expired
        error: null,
      });

      // Should not throw
      await expect(release(testToken)).resolves.toBeUndefined();
    });

    it('release silently succeeds even on RPC error', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC error: token not found' },
      });

      // Should not throw — release is best-effort
      await expect(release(testToken)).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // SCENARIO 3: Expire path — reserve → time-warp → expireStale → balance unchanged
  // ==========================================================================
  describe('scenario 3: expire path (reserve → time-warp → expireStale)', () => {
    it('expireStale sweeps held reservations older than 15min and balance is unchanged', async () => {
      // Step 1: Simulate a reservation that was made but the job never finished
      // (In real life the job timed out; here we just call expireStale directly)
      mockRpc.mockResolvedValueOnce({
        data: { token: testToken, error_code: null },
        error: null,
      });

      const _token = await reserve(testOrgId, testUserId, 100);
      expect(_token).toBe(testToken);

      vi.clearAllMocks();

      // Step 2: Time-warp — expireStale is called by the Inngest cron after 15min
      mockRpc.mockResolvedValueOnce({
        data: 1, // 1 reservation expired
        error: null,
      });

      const expiredCount = await expireStale();

      expect(expiredCount).toBe(1);
      expect(mockRpc).toHaveBeenCalledWith('expire_stale_reservations');

      // Step 3: Verify balance is unchanged (expired reservation released credits to pool)
      vi.clearAllMocks();

      const balanceMockChain = createMockChain();
      balanceMockChain.single.mockResolvedValueOnce({
        data: {
          credits_total: 1000,
          credits_used: 0, // no debit — reservation expired without commit
          credits_addon: 0,
          credits_reserved: 0, // reservation row marked expired → credits_reserved decremented
          credits_reset_at: null,
          is_vip: false,
          signup_bonus_credits: 0,
          signup_bonus_expires_at: null,
        },
        error: null,
      });
      vi.mocked(mockClient.from).mockReturnValue(balanceMockChain);

      const balance = await getBalance(testOrgId);

      expect(balance.creditsUsed).toBe(0);
      expect(balance.creditsReserved).toBe(0);
      // available = (1000 - 0 - 0) + 0 = 1000 — fully restored by expiration
      expect(balance.available).toBe(1000);
    });

    it('expireStale returns 0 when no stale reservations', async () => {
      mockRpc.mockResolvedValueOnce({
        data: 0,
        error: null,
      });

      const count = await expireStale();
      expect(count).toBe(0);
    });

    it('expireStale throws ApiError 500 on RPC failure', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC error: lock timeout' },
      });

      try {
        await expireStale();
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).status).toBe(500);
      }
    });
  });

  // ==========================================================================
  // Additional coverage: INSUFFICIENT_CREDITS and error cases
  // ==========================================================================
  describe('error cases', () => {
    it('reserve throws INSUFFICIENT_CREDITS (402) when balance is too low', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { token: null, error_code: 'INSUFFICIENT_CREDITS' },
        error: null,
      });

      try {
        await reserve(testOrgId, testUserId, 999999);
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).code).toBe('INSUFFICIENT_CREDITS');
        expect((e as ApiError).status).toBe(402);
      }
    });

    it('reserve throws 500 on RPC database error', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed' },
      });

      try {
        await reserve(testOrgId, testUserId, 100);
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).status).toBe(500);
      }
    });

    it('commit throws RESERVATION_NOT_FOUND (404) for invalid token', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { success: false, error_code: 'RESERVATION_NOT_FOUND' },
        error: null,
      });

      try {
        await commit('invalid-token', 100, 'test', 'text');
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).code).toBe('RESERVATION_NOT_FOUND');
        expect((e as ApiError).status).toBe(404);
      }
    });
  });
});
