/**
 * V2-006.4 — GET /billing/status route handler (thin delegate)
 *
 * Verifies the Fastify route returns the full StatusPayload including
 * the new `creditsReserved` field from V2-006.
 *
 * Follows the pattern from agents.test.ts:
 *   - Chainable supabase mock
 *   - authenticateWithUser injects userId via x-user-id header
 *   - sendError mock to avoid 500-mangling
 *   - Requests carry x-internal-key + x-user-id headers
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Supabase chainable mock (agents.test.ts pattern)
// ---------------------------------------------------------------------------
const mockChain: Record<string, ReturnType<typeof vi.fn>> = {};
[
  'from', 'select', 'insert', 'update', 'delete', 'upsert',
  'eq', 'neq', 'in', 'ilike', 'or', 'overlaps', 'filter',
  'order', 'limit', 'range',
].forEach((m) => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain['single'] = vi.fn();
mockChain['maybeSingle'] = vi.fn();

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => mockChain,
}));

// ---------------------------------------------------------------------------
// authenticateWithUser — 2-arg async, injects userId from x-user-id header
// ---------------------------------------------------------------------------
vi.mock('../../middleware/authenticate.js', () => {
  const handler = vi.fn(async (request: { userId?: string; headers: Record<string, string> }, reply: { status: (n: number) => { send: (b: unknown) => void } }) => {
    const key = request.headers['x-internal-key'];
    if (!key || key !== process.env.INTERNAL_API_KEY) {
      return reply.status(401).send({ data: null, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
    }
    const userId = request.headers['x-user-id'];
    request.userId = typeof userId === 'string' ? userId : undefined;
  });
  return { authenticate: handler, authenticateWithUser: handler };
});

// ---------------------------------------------------------------------------
// sendError mock — passthrough (preserve status from ApiError)
// ---------------------------------------------------------------------------
vi.mock('../../lib/api/fastify-errors.js', () => ({
  sendError: vi.fn(async (reply: { status: (n: number) => { send: (b: unknown) => unknown } }, error: unknown) => {
    const e = error as { status?: number; statusCode?: number; message?: string; code?: string } | null;
    const status = e?.status ?? e?.statusCode ?? 500;
    return reply.status(status).send({
      data: null,
      error: { message: e?.message ?? 'Internal server error', code: e?.code ?? 'INTERNAL' },
    });
  }),
}));

// ---------------------------------------------------------------------------
// Stripe mock (minimal)
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
// getBalance mock
// ---------------------------------------------------------------------------
const getBalanceMock = vi.fn();
vi.mock('../../lib/credits/balance.js', () => ({
  getBalance: (...args: unknown[]) => getBalanceMock(...args),
}));

// ---------------------------------------------------------------------------
// plans mock — no DB
// ---------------------------------------------------------------------------
vi.mock('../../lib/billing/plans.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/billing/plans.js')>(
    '../../lib/billing/plans.js',
  );
  return {
    ...actual,
    loadPlanConfigs: async () => actual.PLANS,
    planFromPriceIdAsync: async (priceId: string) => actual.planFromPriceId(priceId),
  };
});

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
vi.stubEnv('INTERNAL_API_KEY', 'test-key');

// ---------------------------------------------------------------------------
// Import route after mocks
// ---------------------------------------------------------------------------
import { billingStatusRoute } from '../../routes/billing/status.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TEST_USER_ID = 'user-route-test';
const AUTH_HEADERS = { 'x-internal-key': 'test-key', 'x-user-id': TEST_USER_ID };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /billing/status — thin delegate route', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-setup chain return values after clearAllMocks
    Object.keys(mockChain).forEach((key) => {
      if (key !== 'single' && key !== 'maybeSingle') {
        mockChain[key].mockReturnValue(mockChain);
      }
    });
    app = Fastify({ logger: false });
    app.register(billingStatusRoute, { prefix: '/billing' });
    await app.ready();
  });

  it('returns 200 with creditsReserved in response payload', async () => {
    // org_memberships → membership
    mockChain['single'].mockResolvedValueOnce({ data: { org_id: 'org-1' } });
    // organizations → org row
    mockChain['single'].mockResolvedValueOnce({
      data: {
        id: 'org-1',
        plan: 'pro',
        billing_cycle: 'monthly',
        stripe_customer_id: 'cus_pro',
        stripe_subscription_id: 'sub_pro',
        plan_started_at: null,
        plan_expires_at: null,
        credits_total: 50000,
        credits_used: 12000,
        credits_addon: 5000,
      },
    });
    // getBalance response
    getBalanceMock.mockResolvedValueOnce({
      unlimited: false,
      creditsTotal: 50000,
      creditsUsed: 12000,
      creditsAddon: 5000,
      creditsReserved: 250,
      creditsResetAt: null,
      available: 42750,
      signupBonusCredits: 0,
      signupBonusExpiresAt: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/billing/status',
      headers: AUTH_HEADERS,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      data: { credits: { creditsReserved: number }; plan: { id: string } };
      error: null;
    };
    expect(body.error).toBeNull();
    expect(body.data.credits.creditsReserved).toBe(250);
    expect(body.data.plan.id).toBe('pro');
    expect(getBalanceMock).toHaveBeenCalledWith('org-1');
  });

  it('returns 200 with creditsReserved=0 for Free tier', async () => {
    mockChain['single'].mockResolvedValueOnce({ data: { org_id: 'org-1' } });
    mockChain['single'].mockResolvedValueOnce({
      data: {
        id: 'org-1',
        plan: 'free',
        billing_cycle: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        plan_started_at: null,
        plan_expires_at: null,
        credits_total: 1000,
        credits_used: 100,
        credits_addon: 0,
      },
    });
    getBalanceMock.mockResolvedValueOnce({
      unlimited: false,
      creditsTotal: 1000,
      creditsUsed: 100,
      creditsAddon: 0,
      creditsReserved: 0,
      creditsResetAt: null,
      available: 900,
      signupBonusCredits: 0,
      signupBonusExpiresAt: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/billing/status',
      headers: AUTH_HEADERS,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      data: { credits: { creditsReserved: number } };
      error: null;
    };
    expect(body.data.credits.creditsReserved).toBe(0);
  });
});
