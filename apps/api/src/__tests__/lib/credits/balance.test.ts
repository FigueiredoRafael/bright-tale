/**
 * Unit tests for apps/api/src/lib/credits/balance.ts (V2-006.2)
 *
 * 12 tests covering:
 *   (VIP off / VIP on) × (addon 0 / addon > 0) × (signup-bonus active / expired) × (reserved 0 / positive)
 *
 * Naming pattern: VIP=off|on / addon=0|N / bonus=active|expired / reserved=0|N
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------
const sbChain = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ['select', 'eq', 'single', 'maybeSingle']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  return chain;
});

vi.mock('../../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({
    from: vi.fn().mockReturnValue(sbChain),
  }),
}));

// ---------------------------------------------------------------------------
// Import under test — AFTER mocks
// ---------------------------------------------------------------------------
import { getBalance } from '../../../lib/credits/balance.js';
import { ApiError } from '../../../lib/api/errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const FUTURE_ISO = new Date(Date.now() + 86_400_000).toISOString(); // tomorrow
const PAST_ISO = new Date(Date.now() - 86_400_000).toISOString(); // yesterday

function makeOrgRow(overrides: Partial<{
  credits_total: number;
  credits_used: number;
  credits_addon: number;
  credits_reserved: number;
  credits_reset_at: string | null;
  is_vip: boolean;
  signup_bonus_credits: number;
  signup_bonus_expires_at: string | null;
}> = {}) {
  return {
    credits_total: 100,
    credits_used: 10,
    credits_addon: 0,
    credits_reserved: 0,
    credits_reset_at: null,
    is_vip: false,
    signup_bonus_credits: 0,
    signup_bonus_expires_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const m of Object.values(sbChain)) {
    m.mockReturnValue(sbChain);
  }
});

// ---------------------------------------------------------------------------
// Helper to mock the DB .single() response
// ---------------------------------------------------------------------------
function mockOrg(row: ReturnType<typeof makeOrgRow>) {
  sbChain.single.mockResolvedValue({ data: row, error: null });
}

// ---------------------------------------------------------------------------
// VIP = off, addon = 0, bonus = none, reserved = 0
// available = (100 - 10 - 0) + 0 + 0 = 90
// ---------------------------------------------------------------------------
describe('VIP=off / addon=0 / bonus=none / reserved=0', () => {
  it('returns correct available balance', async () => {
    mockOrg(makeOrgRow());
    const bal = await getBalance('org-1');
    expect(bal.unlimited).toBeFalsy();
    expect(bal.available).toBe(90);
    expect(bal.creditsReserved).toBe(0);
    expect(bal.signupBonusCredits).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// VIP = off, addon = 20, bonus = none, reserved = 0
// available = (100 - 10 - 0) + 20 + 0 = 110
// ---------------------------------------------------------------------------
describe('VIP=off / addon=20 / bonus=none / reserved=0', () => {
  it('includes addon in available', async () => {
    mockOrg(makeOrgRow({ credits_addon: 20 }));
    const bal = await getBalance('org-1');
    expect(bal.available).toBe(110);
    expect(bal.creditsAddon).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// VIP = off, addon = 0, bonus = active (50), reserved = 0
// signup_bonus_remaining = 50 (expires tomorrow)
// available = (100 - 10 - 0) + 0 + 50 = 140
// ---------------------------------------------------------------------------
describe('VIP=off / addon=0 / bonus=active / reserved=0', () => {
  it('includes active signup bonus in available', async () => {
    mockOrg(makeOrgRow({
      signup_bonus_credits: 50,
      signup_bonus_expires_at: FUTURE_ISO,
    }));
    const bal = await getBalance('org-1');
    expect(bal.available).toBe(140);
    expect(bal.signupBonusCredits).toBe(50);
    expect(bal.signupBonusExpiresAt).toBe(FUTURE_ISO);
  });
});

// ---------------------------------------------------------------------------
// VIP = off, addon = 0, bonus = expired (50), reserved = 0
// signup_bonus_remaining = 0 (expires yesterday)
// available = (100 - 10 - 0) + 0 + 0 = 90
// ---------------------------------------------------------------------------
describe('VIP=off / addon=0 / bonus=expired / reserved=0', () => {
  it('excludes expired signup bonus from available', async () => {
    mockOrg(makeOrgRow({
      signup_bonus_credits: 50,
      signup_bonus_expires_at: PAST_ISO,
    }));
    const bal = await getBalance('org-1');
    expect(bal.available).toBe(90);
    expect(bal.signupBonusCredits).toBe(50); // still reported, but not counted
  });
});

// ---------------------------------------------------------------------------
// VIP = off, addon = 0, bonus = none, reserved = 30
// available = (100 - 10 - 30) + 0 + 0 = 60
// ---------------------------------------------------------------------------
describe('VIP=off / addon=0 / bonus=none / reserved=30', () => {
  it('subtracts reserved credits from available', async () => {
    mockOrg(makeOrgRow({ credits_reserved: 30 }));
    const bal = await getBalance('org-1');
    expect(bal.available).toBe(60);
    expect(bal.creditsReserved).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// VIP = off, addon = 20, bonus = active (50), reserved = 30
// available = (100 - 10 - 30) + 20 + 50 = 130
// ---------------------------------------------------------------------------
describe('VIP=off / addon=20 / bonus=active / reserved=30', () => {
  it('all non-VIP factors combined', async () => {
    mockOrg(makeOrgRow({
      credits_addon: 20,
      credits_reserved: 30,
      signup_bonus_credits: 50,
      signup_bonus_expires_at: FUTURE_ISO,
    }));
    const bal = await getBalance('org-1');
    expect(bal.available).toBe(130);
  });
});

// ---------------------------------------------------------------------------
// VIP = on — unlimited sentinel (regardless of other fields)
// ---------------------------------------------------------------------------
describe('VIP=on (unlimited override)', () => {
  it('returns unlimited=true when is_vip is true', async () => {
    mockOrg(makeOrgRow({ is_vip: true, credits_total: 0, credits_used: 0 }));
    const bal = await getBalance('org-vip');
    expect(bal.unlimited).toBe(true);
  });

  it('available is Number.POSITIVE_INFINITY for VIP org', async () => {
    mockOrg(makeOrgRow({ is_vip: true }));
    const bal = await getBalance('org-vip');
    expect(bal.available).toBe(Number.POSITIVE_INFINITY);
  });

  it('VIP org with addon still returns unlimited', async () => {
    mockOrg(makeOrgRow({ is_vip: true, credits_addon: 999 }));
    const bal = await getBalance('org-vip');
    expect(bal.unlimited).toBe(true);
    expect(bal.available).toBe(Number.POSITIVE_INFINITY);
  });

  it('VIP org with reserved still returns unlimited', async () => {
    mockOrg(makeOrgRow({ is_vip: true, credits_reserved: 50 }));
    const bal = await getBalance('org-vip');
    expect(bal.unlimited).toBe(true);
    expect(bal.available).toBe(Number.POSITIVE_INFINITY);
  });
});

// ---------------------------------------------------------------------------
// Error path: org not found
// ---------------------------------------------------------------------------
describe('error handling', () => {
  it('throws 404 ApiError when org not found', async () => {
    sbChain.single.mockResolvedValue({ data: null, error: { message: 'not found' } });
    const err = await getBalance('org-missing').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });

  it('throws 404 ApiError when DB returns null data without error', async () => {
    sbChain.single.mockResolvedValue({ data: null, error: null });
    const err = await getBalance('org-null').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });
});
