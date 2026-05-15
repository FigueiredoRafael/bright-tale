/**
 * V2-006.4 — buildBillingStatus unit tests
 *
 * 4 snapshot scenarios:
 *   (a) Free plan, no signup bonus
 *   (b) Free plan, active signup bonus
 *   (c) Pro plan, with credit reservations
 *   (d) VIP org — unlimited sentinel
 *
 * Mock strategy:
 *   - supabase: chainable sbChain builder (select/eq/single)
 *   - getBalance: vi.fn() – avoids re-testing balance.ts internals
 *   - getPlan: uses real PLANS static object
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase chainable mock (sbChain pattern)
// ---------------------------------------------------------------------------
const singleMock = vi.fn();
const maybeSingleMock = vi.fn();

const sbChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  single: singleMock,
  maybeSingle: maybeSingleMock,
};

const fromMock = vi.fn(() => sbChain);

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: vi.fn(() => ({ from: fromMock })),
}));

// ---------------------------------------------------------------------------
// Stripe mock (minimal — status builder only needs ensureStripeCustomer)
// ---------------------------------------------------------------------------
vi.mock('../../lib/billing/stripe.js', () => ({
  getStripe: () => ({
    customers: { create: vi.fn().mockResolvedValue({ id: 'cus_mock' }) },
    subscriptions: { retrieve: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    invoices: { retrieve: vi.fn() },
    billingPortal: { sessions: { create: vi.fn() } },
  }),
}));

// ---------------------------------------------------------------------------
// getBalance mock — injected per-test
// ---------------------------------------------------------------------------
const getBalanceMock = vi.fn();
vi.mock('../../lib/credits/balance.js', () => ({
  getBalance: (...args: unknown[]) => getBalanceMock(...args),
}));

// ---------------------------------------------------------------------------
// plans mock — keep real getPlan, no DB calls
// ---------------------------------------------------------------------------
vi.mock('../../lib/billing/plans.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/billing/plans.js')>(
    '../../lib/billing/plans.js',
  );
  return {
    ...actual,
    // Override loadPlanConfigs to return the static PLANS — no DB needed
    loadPlanConfigs: async () => actual.PLANS,
    planFromPriceIdAsync: async (priceId: string) =>
      actual.planFromPriceId(priceId),
  };
});

// ---------------------------------------------------------------------------
// Import SUT after mocks are set up
// ---------------------------------------------------------------------------
import { buildBillingStatus } from '../../routes/billing/status.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal org row returned by supabase org queries */
function makeOrg(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'org-1',
    name: 'Test Org',
    plan: 'free',
    billing_cycle: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    plan_started_at: null,
    plan_expires_at: null,
    credits_total: 1000,
    credits_used: 100,
    credits_addon: 0,
    signup_bonus_credits: 0,
    signup_bonus_expires_at: null,
    ...overrides,
  };
}

function makeBalance(overrides: Partial<{
  unlimited: boolean;
  creditsTotal: number;
  creditsUsed: number;
  creditsAddon: number;
  creditsReserved: number;
  creditsResetAt: string | null;
  available: number;
  signupBonusCredits: number;
  signupBonusExpiresAt: string | null;
}> = {}) {
  return {
    unlimited: false,
    creditsTotal: 1000,
    creditsUsed: 100,
    creditsAddon: 0,
    creditsReserved: 0,
    creditsResetAt: null,
    available: 900,
    signupBonusCredits: 0,
    signupBonusExpiresAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildBillingStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sbChain.select.mockReturnThis();
    sbChain.eq.mockReturnThis();
    sbChain.order.mockReturnThis();
    sbChain.limit.mockReturnThis();
    fromMock.mockReturnValue(sbChain);
  });

  // ─── (a) Free plan, no signup bonus ───────────────────────────────────────
  it('(a) Free plan, no bonus — returns correct status payload with creditsReserved=0', async () => {
    // org_memberships → { org_id }
    singleMock.mockResolvedValueOnce({ data: { org_id: 'org-1' } });
    // organizations row
    singleMock.mockResolvedValueOnce({ data: makeOrg() });

    getBalanceMock.mockResolvedValueOnce(makeBalance());

    const result = await buildBillingStatus('user-1');

    expect(result).toMatchSnapshot();
    expect(result.plan.id).toBe('free');
    expect(result.credits.creditsReserved).toBe(0);
    expect(result.credits.signupBonusCredits).toBe(0);
    expect(result.credits.signupBonusExpiresAt).toBeNull();
    expect(result.credits.unlimited).toBe(false);
  });

  // ─── (b) Free plan, active signup bonus ───────────────────────────────────
  it('(b) Free plan with active signup bonus — bonus fields exposed in payload', async () => {
    // Use a fixed future date to keep snapshots stable
    const bonusExpiry = '2099-12-31T00:00:00.000Z';

    singleMock.mockResolvedValueOnce({ data: { org_id: 'org-1' } });
    singleMock.mockResolvedValueOnce({
      data: makeOrg({
        signup_bonus_credits: 500,
        signup_bonus_expires_at: bonusExpiry,
      }),
    });

    getBalanceMock.mockResolvedValueOnce(
      makeBalance({
        signupBonusCredits: 500,
        signupBonusExpiresAt: bonusExpiry,
        available: 1400, // 1000 - 100 + 500
      }),
    );

    const result = await buildBillingStatus('user-2');

    expect(result).toMatchSnapshot();
    expect(result.plan.id).toBe('free');
    expect(result.credits.signupBonusCredits).toBe(500);
    expect(result.credits.signupBonusExpiresAt).toBe(bonusExpiry);
    expect(result.credits.available).toBe(1400);
  });

  // ─── (c) Pro plan, with credit reservations ───────────────────────────────
  it('(c) Pro plan with reservations — creditsReserved reflected in payload', async () => {
    singleMock.mockResolvedValueOnce({ data: { org_id: 'org-2' } });
    singleMock.mockResolvedValueOnce({
      data: makeOrg({
        plan: 'pro',
        billing_cycle: 'monthly',
        stripe_customer_id: 'cus_pro',
        stripe_subscription_id: 'sub_pro',
        credits_total: 50000,
        credits_used: 12000,
        credits_addon: 5000,
      }),
    });

    getBalanceMock.mockResolvedValueOnce(
      makeBalance({
        creditsTotal: 50000,
        creditsUsed: 12000,
        creditsAddon: 5000,
        creditsReserved: 250,
        available: 42750, // 50000 - 12000 - 250 + 5000
      }),
    );

    const result = await buildBillingStatus('user-3');

    expect(result).toMatchSnapshot();
    expect(result.plan.id).toBe('pro');
    expect(result.credits.creditsReserved).toBe(250);
    expect(result.credits.available).toBe(42750);
    expect(result.subscription.stripeCustomerId).toBe('cus_pro');
  });

  // ─── (d) VIP unlimited ────────────────────────────────────────────────────
  it('(d) VIP org — unlimited sentinel; creditsReserved still reported', async () => {
    singleMock.mockResolvedValueOnce({ data: { org_id: 'org-vip' } });
    singleMock.mockResolvedValueOnce({
      data: makeOrg({
        plan: 'pro',
        billing_cycle: 'annual',
        credits_total: 50000,
        credits_used: 0,
      }),
    });

    getBalanceMock.mockResolvedValueOnce(
      makeBalance({
        unlimited: true,
        creditsTotal: 50000,
        creditsUsed: 0,
        creditsReserved: 0,
        available: Infinity,
      }),
    );

    const result = await buildBillingStatus('user-vip');

    expect(result).toMatchSnapshot();
    expect(result.credits.unlimited).toBe(true);
    expect(result.credits.available).toBe(Infinity);
    expect(result.credits.creditsReserved).toBe(0);
  });
});
