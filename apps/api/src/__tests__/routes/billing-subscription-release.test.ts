/**
 * V2-006.6 — subscription-change release hook in Stripe webhooks
 *
 * Tests for the reservation-release logic hooked into:
 *   - syncSubscription (customer.subscription.created / updated)
 *   - downgradeToFree (customer.subscription.deleted)
 *
 * Each function must:
 *   1. Query held reservations for the affected org
 *   2. Call creditReservations.release(token) once per row
 *   3. Emit releasedReservationCount in the existing Axiom log line
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Supabase chainable mock
// ---------------------------------------------------------------------------
const singleMock = vi.fn();
const maybeSingleMock = vi.fn();

// We need to track different query chains per call to `from()`.
// The reservation query returns an array (no .single()), so we need
// a chain that can resolve to an array too.
let reservationQueryResult: { data: Array<{ token: string }> | null; error: null } = {
  data: null,
  error: null,
};

// We track calls to `from` to intercept the reservation query.
const supabaseChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  single: singleMock,
  maybeSingle: maybeSingleMock,
  // Thenable — allows `await sb.from(...).select(...).eq(...)`
  then: vi.fn((resolve: (v: unknown) => unknown) => {
    return Promise.resolve(reservationQueryResult).then(resolve);
  }),
};

const fromMock = vi.fn(() => supabaseChain);

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: vi.fn(() => ({ from: fromMock })),
}));

// ---------------------------------------------------------------------------
// creditReservations mock
// ---------------------------------------------------------------------------
const releaseMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../lib/credits/reservations.js', () => ({
  reserve: vi.fn(),
  commit: vi.fn(),
  release: (...args: unknown[]) => releaseMock(...args),
  expireStale: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Stripe mock
// ---------------------------------------------------------------------------
vi.mock('../../lib/billing/stripe.js', () => ({
  getStripe: () => ({
    subscriptions: { retrieve: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    customers: { create: vi.fn() },
    invoices: { retrieve: vi.fn() },
    billingPortal: { sessions: { create: vi.fn() } },
  }),
}));

// ---------------------------------------------------------------------------
// plans mock — static, no DB
// ---------------------------------------------------------------------------
const planFromPriceIdMock = vi.fn();
vi.mock('../../lib/billing/plans.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/billing/plans.js')>(
    '../../lib/billing/plans.js',
  );
  return {
    ...actual,
    planFromPriceIdAsync: async (priceId: string) => planFromPriceIdMock(priceId),
    loadPlanConfigs: async () => actual.PLANS,
  };
});

// ---------------------------------------------------------------------------
// notifications mock — avoid DB call in downgradeToFree
// ---------------------------------------------------------------------------
vi.mock('../../lib/notifications.js', () => ({
  insertNotification: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Affiliate mock
// ---------------------------------------------------------------------------
vi.mock('../../lib/affiliate/container.js', () => ({
  buildAffiliateContainer: () => ({
    calcCommissionUseCase: { execute: vi.fn().mockResolvedValue(null) },
  }),
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------
import { syncSubscription, downgradeToFree } from '../../routes/billing.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFastify(): FastifyInstance {
  return {
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  } as unknown as FastifyInstance;
}

/** A minimal StripeSubscription-like object */
function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_test_1',
    metadata: { org_id: 'org-1' },
    items: { data: [{ price: { id: 'price_monthly_creator' } }] },
    current_period_start: 1_700_000_000,
    current_period_end: 1_702_592_000,
    ...overrides,
  } as never;
}

/** Reset all per-test state */
function resetMocks() {
  vi.clearAllMocks();
  // Restore chain return values after clearAllMocks
  supabaseChain.select.mockReturnThis();
  supabaseChain.eq.mockReturnThis();
  supabaseChain.order.mockReturnThis();
  supabaseChain.limit.mockReturnThis();
  supabaseChain.update.mockReturnThis();
  fromMock.mockReturnValue(supabaseChain);
  releaseMock.mockResolvedValue(undefined);
  planFromPriceIdMock.mockReturnValue({ planId: 'creator', cycle: 'monthly' });
  // Default: org update succeeds
  singleMock.mockResolvedValue({ data: null });
  // Default: no held reservations
  reservationQueryResult = { data: [], error: null };
  supabaseChain.then.mockImplementation((resolve: (v: unknown) => unknown) =>
    Promise.resolve(reservationQueryResult).then(resolve),
  );
}

// ---------------------------------------------------------------------------
// syncSubscription — reservation release tests
// ---------------------------------------------------------------------------

describe('syncSubscription — releases held reservations', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('T1: calls release() once per held reservation (2 rows)', async () => {
    const fastify = makeFastify();
    reservationQueryResult = {
      data: [{ token: 'tok-aaa' }, { token: 'tok-bbb' }],
      error: null,
    };
    supabaseChain.then.mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(reservationQueryResult).then(resolve),
    );

    await syncSubscription(makeSub(), fastify);

    expect(releaseMock).toHaveBeenCalledTimes(2);
    expect(releaseMock).toHaveBeenCalledWith('tok-aaa');
    expect(releaseMock).toHaveBeenCalledWith('tok-bbb');
  });

  it('T2: calls release() once per held reservation (3 rows)', async () => {
    const fastify = makeFastify();
    reservationQueryResult = {
      data: [{ token: 'tok-1' }, { token: 'tok-2' }, { token: 'tok-3' }],
      error: null,
    };
    supabaseChain.then.mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(reservationQueryResult).then(resolve),
    );

    await syncSubscription(makeSub(), fastify);

    expect(releaseMock).toHaveBeenCalledTimes(3);
    expect(releaseMock).toHaveBeenCalledWith('tok-1');
    expect(releaseMock).toHaveBeenCalledWith('tok-2');
    expect(releaseMock).toHaveBeenCalledWith('tok-3');
  });

  it('T3: no release() when no held reservations', async () => {
    const fastify = makeFastify();
    reservationQueryResult = { data: [], error: null };
    supabaseChain.then.mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(reservationQueryResult).then(resolve),
    );

    await syncSubscription(makeSub(), fastify);

    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('T4: emits releasedReservationCount in log payload (2 reservations)', async () => {
    const fastify = makeFastify();
    const logInfo = fastify.log.info as ReturnType<typeof vi.fn>;
    reservationQueryResult = {
      data: [{ token: 'tok-aaa' }, { token: 'tok-bbb' }],
      error: null,
    };
    supabaseChain.then.mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(reservationQueryResult).then(resolve),
    );

    await syncSubscription(makeSub(), fastify);

    // At least one call to fastify.log.info must include releasedReservationCount: 2
    const callWithCount = logInfo.mock.calls.find(
      (args: unknown[]) => {
        const ctx = args[0];
        return typeof ctx === 'object' && ctx !== null && 'releasedReservationCount' in ctx;
      },
    );
    expect(callWithCount).toBeDefined();
    expect(callWithCount![0]).toMatchObject({ releasedReservationCount: 2 });
  });

  it('T5: emits releasedReservationCount=0 in log when no reservations', async () => {
    const fastify = makeFastify();
    const logInfo = fastify.log.info as ReturnType<typeof vi.fn>;
    reservationQueryResult = { data: [], error: null };
    supabaseChain.then.mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(reservationQueryResult).then(resolve),
    );

    await syncSubscription(makeSub(), fastify);

    const callWithCount = logInfo.mock.calls.find(
      (args: unknown[]) => {
        const ctx = args[0];
        return typeof ctx === 'object' && ctx !== null && 'releasedReservationCount' in ctx;
      },
    );
    expect(callWithCount).toBeDefined();
    expect(callWithCount![0]).toMatchObject({ releasedReservationCount: 0 });
  });

  it('T6: early-returns without querying if orgId or priceId is missing', async () => {
    const fastify = makeFastify();
    // Sub with no org_id in metadata
    await syncSubscription(makeSub({ metadata: {} }), fastify);

    expect(releaseMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// downgradeToFree — reservation release tests
// ---------------------------------------------------------------------------

describe('downgradeToFree — releases held reservations', () => {
  beforeEach(() => {
    resetMocks();
    // downgradeToFree needs a userId for the notification; provide one
    singleMock.mockResolvedValue({ data: { user_id: 'user-1' } });
  });

  it('T7: calls release() once per held reservation (2 rows)', async () => {
    const fastify = makeFastify();
    reservationQueryResult = {
      data: [{ token: 'tok-ccc' }, { token: 'tok-ddd' }],
      error: null,
    };
    supabaseChain.then.mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(reservationQueryResult).then(resolve),
    );

    await downgradeToFree(makeSub(), fastify);

    expect(releaseMock).toHaveBeenCalledTimes(2);
    expect(releaseMock).toHaveBeenCalledWith('tok-ccc');
    expect(releaseMock).toHaveBeenCalledWith('tok-ddd');
  });

  it('T8: calls release() once per held reservation (3 rows)', async () => {
    const fastify = makeFastify();
    reservationQueryResult = {
      data: [{ token: 'tok-1' }, { token: 'tok-2' }, { token: 'tok-3' }],
      error: null,
    };
    supabaseChain.then.mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(reservationQueryResult).then(resolve),
    );

    await downgradeToFree(makeSub(), fastify);

    expect(releaseMock).toHaveBeenCalledTimes(3);
  });

  it('T9: no release() when no held reservations', async () => {
    const fastify = makeFastify();
    reservationQueryResult = { data: [], error: null };
    supabaseChain.then.mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(reservationQueryResult).then(resolve),
    );

    await downgradeToFree(makeSub(), fastify);

    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('T10: emits releasedReservationCount in log payload (2 reservations)', async () => {
    const fastify = makeFastify();
    const logInfo = fastify.log.info as ReturnType<typeof vi.fn>;
    reservationQueryResult = {
      data: [{ token: 'tok-ccc' }, { token: 'tok-ddd' }],
      error: null,
    };
    supabaseChain.then.mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(reservationQueryResult).then(resolve),
    );

    await downgradeToFree(makeSub(), fastify);

    const callWithCount = logInfo.mock.calls.find(
      (args: unknown[]) => {
        const ctx = args[0];
        return typeof ctx === 'object' && ctx !== null && 'releasedReservationCount' in ctx;
      },
    );
    expect(callWithCount).toBeDefined();
    expect(callWithCount![0]).toMatchObject({ releasedReservationCount: 2 });
  });

  it('T11: emits releasedReservationCount=0 in log when no reservations', async () => {
    const fastify = makeFastify();
    const logInfo = fastify.log.info as ReturnType<typeof vi.fn>;
    reservationQueryResult = { data: [], error: null };
    supabaseChain.then.mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(reservationQueryResult).then(resolve),
    );

    await downgradeToFree(makeSub(), fastify);

    const callWithCount = logInfo.mock.calls.find(
      (args: unknown[]) => {
        const ctx = args[0];
        return typeof ctx === 'object' && ctx !== null && 'releasedReservationCount' in ctx;
      },
    );
    expect(callWithCount).toBeDefined();
    expect(callWithCount![0]).toMatchObject({ releasedReservationCount: 0 });
  });

  it('T12: early-returns without querying if orgId is missing', async () => {
    const fastify = makeFastify();
    await downgradeToFree(makeSub({ metadata: {} }), fastify);

    expect(releaseMock).not.toHaveBeenCalled();
  });
});
