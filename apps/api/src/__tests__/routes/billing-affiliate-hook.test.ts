import { describe, it, expect, beforeEach, vi } from 'vitest';

// Supabase thenable-builder mock.
const singleMock = vi.fn();
const supabaseFromChain = {
  select: vi.fn(() => supabaseFromChain),
  eq: vi.fn(() => supabaseFromChain),
  order: vi.fn(() => supabaseFromChain),
  limit: vi.fn(() => supabaseFromChain),
  single: singleMock,
};
const fromMock = vi.fn(() => supabaseFromChain);

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: vi.fn(() => ({ from: fromMock })),
}));

const subscriptionsRetrieve = vi.fn();
vi.mock('../../lib/billing/stripe.js', () => ({
  getStripe: () => ({
    subscriptions: { retrieve: subscriptionsRetrieve },
    webhooks: { constructEvent: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    customers: { create: vi.fn() },
    invoices: { retrieve: vi.fn() },
    billingPortal: { sessions: { create: vi.fn() } },
  }),
}));

const planFromPriceIdMock = vi.fn();
vi.mock('../../lib/billing/plans.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/billing/plans.js')>(
    '../../lib/billing/plans.js',
  );
  return {
    ...actual,
    planFromPriceId: (priceId: string) => planFromPriceIdMock(priceId),
  };
});

const calcCommissionExecute = vi.fn();
vi.mock('../../lib/affiliate/container.js', () => ({
  buildAffiliateContainer: () => ({
    calcCommissionUseCase: { execute: calcCommissionExecute },
  }),
}));

import {
  __computeStripeFee,
  __resolveOrgPrimaryUserId,
  __fireAffiliateCommissionHook,
} from '../../routes/billing.js';
import type { FastifyInstance } from 'fastify';

describe('billing/__computeStripeFee', () => {
  it('applies 3.99% + R$0.39 flat for R$99 monthly invoice', () => {
    // 9900 centavos * 0.0399 = 395.01 → round → 395; + 39 fixed = 434
    expect(__computeStripeFee(9900)).toBe(434);
  });

  it('returns only fixed portion when amount is 0', () => {
    expect(__computeStripeFee(0)).toBe(39);
  });

  it('handles annual R$990 invoice (99000 centavos)', () => {
    // 99000 * 0.0399 = 3950.1 → round → 3950; + 39 = 3989
    expect(__computeStripeFee(99000)).toBe(3989);
  });
});

describe('billing/__resolveOrgPrimaryUserId', () => {
  beforeEach(() => {
    singleMock.mockReset();
    fromMock.mockClear();
    supabaseFromChain.select.mockClear();
    supabaseFromChain.eq.mockClear();
    supabaseFromChain.order.mockClear();
    supabaseFromChain.limit.mockClear();
  });

  it('returns user_id for earliest membership', async () => {
    singleMock.mockResolvedValueOnce({ data: { user_id: 'user-primary' } });
    const result = await __resolveOrgPrimaryUserId('org-1');
    expect(result).toBe('user-primary');
    expect(fromMock).toHaveBeenCalledWith('org_memberships');
    expect(supabaseFromChain.eq).toHaveBeenCalledWith('org_id', 'org-1');
    expect(supabaseFromChain.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(supabaseFromChain.limit).toHaveBeenCalledWith(1);
  });

  it('returns null when no membership row', async () => {
    singleMock.mockResolvedValueOnce({ data: null });
    expect(await __resolveOrgPrimaryUserId('org-x')).toBeNull();
  });

  it('returns null when data.user_id is missing', async () => {
    singleMock.mockResolvedValueOnce({ data: {} });
    expect(await __resolveOrgPrimaryUserId('org-x')).toBeNull();
  });
});

// Minimal invoice factory matching the fields the hook reads.
interface InvoiceLike {
  id: string;
  billing_reason: string;
  amount_paid: number;
  subscription?: string;
  period?: { start?: number; end?: number };
}
function makeInvoice(overrides: Partial<InvoiceLike> = {}): InvoiceLike {
  return {
    id: 'in_test_1',
    billing_reason: 'subscription_cycle',
    amount_paid: 9900,
    subscription: 'sub_1',
    period: { start: 1_700_000_000, end: 1_702_592_000 }, // ~30 days
    ...overrides,
  };
}

function makeFastify(): FastifyInstance {
  return {
    log: { info: vi.fn(), error: vi.fn() },
  } as unknown as FastifyInstance;
}

describe('billing/__fireAffiliateCommissionHook', () => {
  beforeEach(() => {
    singleMock.mockReset();
    subscriptionsRetrieve.mockReset();
    planFromPriceIdMock.mockReset();
    calcCommissionExecute.mockReset();
    // defaults — each test can override.
    singleMock.mockResolvedValue({ data: { user_id: 'user-123' } });
    subscriptionsRetrieve.mockResolvedValue({
      metadata: { org_id: 'org-1' },
      items: { data: [{ price: { id: 'price_monthly_creator' } }] },
    });
    planFromPriceIdMock.mockReturnValue({ planId: 'creator', cycle: 'monthly' });
  });

  it('T1: fires on subscription_cycle with active referral (monthly)', async () => {
    calcCommissionExecute.mockResolvedValueOnce({
      id: 'commission-1', totalBrl: 9.9,
    });
    const fastify = makeFastify();
    await __fireAffiliateCommissionHook(makeInvoice() as never, fastify);
    expect(calcCommissionExecute).toHaveBeenCalledTimes(1);
    const args = calcCommissionExecute.mock.calls[0][0];
    expect(args.userId).toBe('user-123');
    expect(args.paymentAmount).toBe(9900);
    expect(args.stripeFee).toBe(434);
    expect(args.paymentType).toBe('monthly');
    expect(args.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(args.paymentPeriodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(args.paymentPeriodEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(args.isRetroactive).toBe(false);
    expect(fastify.log.info).toHaveBeenCalledTimes(1);
  });

  it('T2: fires on subscription_create (first invoice)', async () => {
    calcCommissionExecute.mockResolvedValueOnce({ id: 'c', totalBrl: 9.9 });
    await __fireAffiliateCommissionHook(
      makeInvoice({ billing_reason: 'subscription_create' }) as never,
      makeFastify(),
    );
    expect(calcCommissionExecute).toHaveBeenCalledTimes(1);
  });

  it('T3: silent no-op when use case returns null', async () => {
    calcCommissionExecute.mockResolvedValueOnce(null);
    const fastify = makeFastify();
    await __fireAffiliateCommissionHook(makeInvoice() as never, fastify);
    expect(calcCommissionExecute).toHaveBeenCalledTimes(1);
    expect(fastify.log.info).not.toHaveBeenCalled();
    expect(fastify.log.error).not.toHaveBeenCalled();
  });

  it('T4: skips subscription_update (not in allowlist)', async () => {
    await __fireAffiliateCommissionHook(
      makeInvoice({ billing_reason: 'subscription_update' }) as never,
      makeFastify(),
    );
    expect(subscriptionsRetrieve).not.toHaveBeenCalled();
    expect(calcCommissionExecute).not.toHaveBeenCalled();
  });

  it('T5: skips manual billing reason', async () => {
    await __fireAffiliateCommissionHook(
      makeInvoice({ billing_reason: 'manual' }) as never,
      makeFastify(),
    );
    expect(calcCommissionExecute).not.toHaveBeenCalled();
  });

  it('T6: short-circuits on amount_paid=0 before Stripe retrieve', async () => {
    await __fireAffiliateCommissionHook(
      makeInvoice({ amount_paid: 0 }) as never,
      makeFastify(),
    );
    expect(subscriptionsRetrieve).not.toHaveBeenCalled();
    expect(calcCommissionExecute).not.toHaveBeenCalled();
  });

  it('T7: skips when planFromPriceId returns null', async () => {
    planFromPriceIdMock.mockReturnValueOnce(null);
    await __fireAffiliateCommissionHook(makeInvoice() as never, makeFastify());
    expect(calcCommissionExecute).not.toHaveBeenCalled();
  });

  it('T8: skips when org has no memberships', async () => {
    singleMock.mockResolvedValueOnce({ data: null });
    await __fireAffiliateCommissionHook(makeInvoice() as never, makeFastify());
    expect(calcCommissionExecute).not.toHaveBeenCalled();
  });

  it('T9: swallows thrown execute() error and logs via fastify.log.error', async () => {
    calcCommissionExecute.mockRejectedValueOnce(new Error('boom'));
    const fastify = makeFastify();
    await expect(
      __fireAffiliateCommissionHook(makeInvoice() as never, fastify),
    ).resolves.toBeUndefined();
    expect(fastify.log.error).toHaveBeenCalledTimes(1);
    const errMock = fastify.log.error as unknown as ReturnType<typeof vi.fn>;
    const [ctx] = errMock.mock.calls[0];
    expect(ctx.invoiceId).toBe('in_test_1');
    expect(ctx.err).toBeInstanceOf(Error);
  });

  it('T10: maps annual plan to paymentType=annual', async () => {
    planFromPriceIdMock.mockReturnValueOnce({ planId: 'creator', cycle: 'annual' });
    calcCommissionExecute.mockResolvedValueOnce({ id: 'c', totalBrl: 99.0 });
    await __fireAffiliateCommissionHook(
      makeInvoice({ amount_paid: 99000 }) as never,
      makeFastify(),
    );
    const args = calcCommissionExecute.mock.calls[0][0];
    expect(args.paymentType).toBe('annual');
    expect(args.stripeFee).toBe(3989);
  });
});
