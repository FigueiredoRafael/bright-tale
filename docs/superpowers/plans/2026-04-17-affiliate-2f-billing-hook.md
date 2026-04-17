# Phase 2F Billing Hook (Minimal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-instantiated `CalculateAffiliateCommissionUseCase` (2A) into the existing Stripe webhook handler at `apps/api/src/routes/billing.ts` by adding a single hook function invoked from the `invoice.paid` dispatch branch. Hook is isolated via try/catch, maps Stripe `Invoice` fields to the use-case input shape, respects the 6 built-in no-op guards, and covers both `subscription_create` and `subscription_cycle` billing reasons. NO migration to `@tn-figueiredo/billing@0.2.1`; NO MercadoPago changes; NO Receita Federal integration.

**Architecture:** Three underscore-prefixed named exports added to `routes/billing.ts`: `__computeStripeFee` (pure function — flat-rate approximation: `round(amount * 0.0399) + 39` centavos), `__resolveOrgPrimaryUserId` (Supabase lookup mirroring `lib/affiliate/affiliate.ts:13-19`), and `__fireAffiliateCommissionHook` (orchestrator — allowlists billing_reason, resolves subscription → price → plan → user, calls `buildAffiliateContainer().calcCommissionUseCase.execute(...)`, swallows errors). Container resolved lazily inside hook body to avoid circular imports. Single commit, no schema, no deps, no envs.

**Tech Stack:** TypeScript 5.9 strict, Vitest 4.1.4, Fastify 5, Stripe SDK (existing), `@tn-figueiredo/affiliate@0.4.x` (already installed, wired in 2A).

**Spec:** `docs/superpowers/specs/2026-04-17-affiliate-2f-billing-hook-design.md`

---

## File Structure

| Path | Disposition | Responsibility |
|---|---|---|
| `apps/api/src/routes/billing.ts` | **modify** | Add import of `buildAffiliateContainer`; add fee constants; add 3 underscore-prefixed named exports (`__computeStripeFee`, `__resolveOrgPrimaryUserId`, `__fireAffiliateCommissionHook`); call hook inside `invoice.paid` case after `resetCreditsOnRenewal`. ~+80 LOC |
| `apps/api/src/__tests__/routes/billing-affiliate-hook.test.ts` | **new** | Unit tests — 9 hook-behavior tests + 1 fee-math assertion. Mocks `getStripe`, `planFromPriceId`, `createServiceClient`, `buildAffiliateContainer`. ~+250 LOC |
| `apps/api/src/__tests__/integration/affiliate-flow.test.ts` | **modify** | Update item-9 Portuguese checklist comment to reference the real webhook path. 1-line edit; test remains Category C / `describe.skip`. |
| `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md` | **modify** | Add 2-line errata note at top pointing to this plan + the 2F spec. |

**Total:** ~335 LOC diff. No new dependencies. No schema migration. No environment variables. No container changes.

---

## Task 1: Read the attachment points

**Files:**
- Read: `apps/api/src/routes/billing.ts`
- Read: `apps/api/src/lib/affiliate/container.ts`
- Read: `apps/api/src/lib/affiliate/affiliate.ts`

- [ ] **Step 1: Read `routes/billing.ts`**

Use the Read tool on `/Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api/src/routes/billing.ts` (448 LOC — full file). Pay attention to:
- Lines 1-17: imports + Stripe type aliases (`StripeClient`, `StripeInvoice`, `StripeSubscription`)
- Lines 308-342: `handleStripeEvent` dispatcher; the `invoice.paid` case at 333-337 is the attachment point
- Lines 421-448: `resetCreditsOnRenewal` — the existing sibling handler; new hook will run *after* it
- Line 379: `planFromPriceId` usage pattern — import is already in place (line 11)

The Read is required because the Edit tool rejects edits on unread files.

- [ ] **Step 2: Read `lib/affiliate/container.ts`**

Use the Read tool on `/Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api/src/lib/affiliate/container.ts`. Confirm line 42 exports `calcCommissionUseCase: CalculateAffiliateCommissionUseCase` on the `AffiliateContainer` interface, and line 63 constructs it. **No edits** to this file in 2F.

- [ ] **Step 3: Read `lib/affiliate/affiliate.ts` (primary-user convention)**

Use the Read tool on `/Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api/src/lib/affiliate/affiliate.ts` lines 1-25. Confirm the `org_memberships.created_at ASC LIMIT 1` pattern (lines 13-19). The new `__resolveOrgPrimaryUserId` helper mirrors this exactly.

- [ ] **Step 4: Confirm test file path is free**

Run from repo root:

```bash
ls apps/api/src/__tests__/routes/billing*.test.ts 2>/dev/null || echo "no existing billing route tests — new file OK"
```

Expected: "no existing billing route tests — new file OK". If a `billing.test.ts` appears in future work, this plan's test filename (`billing-affiliate-hook.test.ts`) is intentionally scoped to the hook only.

---

## Task 2: `__computeStripeFee` (TDD)

Pure function. No Stripe, no DB, no imports — trivial to test first.

**Files:**
- Create: `apps/api/src/__tests__/routes/billing-affiliate-hook.test.ts`
- Modify: `apps/api/src/routes/billing.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/__tests__/routes/billing-affiliate-hook.test.ts` with only the fee assertion for now:

```ts
import { describe, it, expect } from 'vitest';
import { __computeStripeFee } from '../../routes/billing.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/api/`:

```bash
npx vitest run src/__tests__/routes/billing-affiliate-hook.test.ts
```

Expected: FAIL — `__computeStripeFee` is not exported from `routes/billing.ts`.

- [ ] **Step 3: Add constants + `__computeStripeFee` to `routes/billing.ts`**

Edit `apps/api/src/routes/billing.ts`. Just before the `billingRoutes` function declaration (around line 74), insert:

```ts
/* ─── Affiliate commission hook (2F minimal) ─────────────────────────────── */

const STRIPE_FEE_RATE = 0.0399;         // Stripe BR card standard
const STRIPE_FEE_FIXED_CENTAVOS = 39;   // R$ 0,39

export function __computeStripeFee(amountCentavos: number): number {
  return Math.round(amountCentavos * STRIPE_FEE_RATE) + STRIPE_FEE_FIXED_CENTAVOS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `apps/api/`:

```bash
npx vitest run src/__tests__/routes/billing-affiliate-hook.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Typecheck**

Run from repo root: `npm run typecheck`

Expected: all 4 workspaces green.

---

## Task 3: `__resolveOrgPrimaryUserId` (TDD)

Mirrors `lib/affiliate/affiliate.ts:13-19`. Thin Supabase wrapper.

**Files:**
- Modify: `apps/api/src/__tests__/routes/billing-affiliate-hook.test.ts`
- Modify: `apps/api/src/routes/billing.ts`

- [ ] **Step 1: Extend test file with resolver mocks + cases**

Edit `apps/api/src/__tests__/routes/billing-affiliate-hook.test.ts`. Prepend to the top of the file (above the existing `describe` block) the mock scaffolding:

```ts
import { vi } from 'vitest';

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
```

Then add a new `describe` block at the bottom of the file:

```ts
import { __resolveOrgPrimaryUserId } from '../../routes/billing.js';

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
```

Note: `beforeEach` is already a Vitest global per the existing project setup (`globals: true` in `vitest.config.ts`); import it alongside the other symbols if lint complains.

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/api/`:

```bash
npx vitest run src/__tests__/routes/billing-affiliate-hook.test.ts
```

Expected: FAIL — `__resolveOrgPrimaryUserId` not exported.

- [ ] **Step 3: Add `__resolveOrgPrimaryUserId` to `routes/billing.ts`**

Edit `apps/api/src/routes/billing.ts`. Immediately after `__computeStripeFee` (end of the block added in Task 2 Step 3), add:

```ts
export async function __resolveOrgPrimaryUserId(orgId: string): Promise<string | null> {
  const sb = createServiceClient();
  const { data } = await sb
    .from('org_memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  return (data?.user_id as string | undefined) ?? null;
}
```

`createServiceClient` is already imported at line 7. No new imports.

- [ ] **Step 4: Run test to verify it passes**

Run from `apps/api/`:

```bash
npx vitest run src/__tests__/routes/billing-affiliate-hook.test.ts
```

Expected: all tests pass (3 fee + 3 resolver = 6).

---

## Task 4: `__fireAffiliateCommissionHook` (TDD)

The main hook. 9 tests per spec §5. Mocks `getStripe`, `planFromPriceId`, `buildAffiliateContainer`, plus the Supabase mock already set up in Task 3.

**Files:**
- Modify: `apps/api/src/__tests__/routes/billing-affiliate-hook.test.ts`
- Modify: `apps/api/src/routes/billing.ts`

- [ ] **Step 1: Extend test file with remaining mocks**

Edit `apps/api/src/__tests__/routes/billing-affiliate-hook.test.ts`. Add these mock declarations *with* the existing Supabase mock block at the top of the file (after `vi.mock('../../lib/supabase/index.js', ...)`):

```ts
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
```

Note: `plans.js` is `importActual`-passed-through because `getPlan`/`PLANS` constants are referenced elsewhere in `routes/billing.ts`; only `planFromPriceId` is overridden.

- [ ] **Step 2: Add the 9 hook-behavior tests**

Append to `apps/api/src/__tests__/routes/billing-affiliate-hook.test.ts`:

```ts
import { __fireAffiliateCommissionHook } from '../../routes/billing.js';
import type { FastifyInstance } from 'fastify';

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
    const [ctx] = fastify.log.error.mock.calls[0];
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
```

10 tests total in this block (T1–T10). Combined with the 6 from Tasks 2–3 → 16 tests in the file. Spec §5 listed 9 + 1 fee assertion; T10 is added for the annual-branch coverage the spec flagged in the §5 coverage target.

- [ ] **Step 3: Run tests — expect failure**

Run from `apps/api/`:

```bash
npx vitest run src/__tests__/routes/billing-affiliate-hook.test.ts
```

Expected: FAIL — `__fireAffiliateCommissionHook` not exported.

- [ ] **Step 4: Implement `__fireAffiliateCommissionHook`**

Edit `apps/api/src/routes/billing.ts`.

First, at the top of the file, add a new import after the existing `plans.js` import (line 11):

```ts
import { buildAffiliateContainer } from '../lib/affiliate/container.js';
```

Then, immediately after `__resolveOrgPrimaryUserId` (end of block from Task 3 Step 3), add:

```ts
export async function __fireAffiliateCommissionHook(
  invoice: StripeInvoice,
  fastify: FastifyInstance,
): Promise<void> {
  try {
    const reason = invoice.billing_reason;
    if (reason !== 'subscription_cycle' && reason !== 'subscription_create') return;

    const paymentAmount = invoice.amount_paid ?? 0;
    if (paymentAmount <= 0) return;

    const subscriptionId = (invoice as unknown as { subscription?: string }).subscription;
    if (!subscriptionId) return;

    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    const orgId = subscription.metadata?.org_id;
    const priceId = subscription.items.data[0]?.price.id;
    if (!orgId || !priceId) return;

    const mapping = planFromPriceId(priceId);
    if (!mapping) return;

    const userId = await __resolveOrgPrimaryUserId(orgId);
    if (!userId) return;

    const paymentType: 'monthly' | 'annual' = mapping.cycle === 'annual' ? 'annual' : 'monthly';
    const today = new Date().toISOString().slice(0, 10);
    const period = (invoice as unknown as { period?: { start?: number; end?: number } }).period;
    const paymentPeriodStart = period?.start
      ? new Date(period.start * 1000).toISOString().slice(0, 10)
      : undefined;
    const paymentPeriodEnd = period?.end
      ? new Date(period.end * 1000).toISOString().slice(0, 10)
      : undefined;

    const { calcCommissionUseCase } = buildAffiliateContainer();
    const commission = await calcCommissionUseCase.execute({
      userId,
      paymentAmount,
      stripeFee: __computeStripeFee(paymentAmount),
      paymentType,
      today,
      paymentPeriodStart,
      paymentPeriodEnd,
      isRetroactive: false,
    });

    if (commission) {
      fastify.log.info(
        {
          userId,
          invoiceId: invoice.id,
          commissionId: commission.id,
          totalBrl: commission.totalBrl,
        },
        '[affiliate] commission created from Stripe invoice',
      );
    }
  } catch (err) {
    fastify.log.error(
      { err, invoiceId: invoice.id },
      '[affiliate] commission hook failed (isolated)',
    );
  }
}
```

- [ ] **Step 5: Run tests — expect pass**

Run from `apps/api/`:

```bash
npx vitest run src/__tests__/routes/billing-affiliate-hook.test.ts
```

Expected: 16 tests pass (3 fee + 3 resolver + 10 hook).

- [ ] **Step 6: Typecheck**

Run from repo root: `npm run typecheck`

Expected: all 4 workspaces green. Note that `FastifyInstance` is already imported at line 4 and `StripeInvoice` is already aliased at line 17 — no new imports beyond `buildAffiliateContainer`.

---

## Task 5: Wire the hook into the `invoice.paid` dispatch branch

**Files:**
- Modify: `apps/api/src/routes/billing.ts`

- [ ] **Step 1: Edit the dispatch case**

Edit `apps/api/src/routes/billing.ts`. Locate the `invoice.paid` case in `handleStripeEvent` (lines 333-337):

```ts
case 'invoice.paid': {
  const invoice = event.data.object as StripeInvoice;
  await resetCreditsOnRenewal(invoice);
  break;
}
```

Change to:

```ts
case 'invoice.paid': {
  const invoice = event.data.object as StripeInvoice;
  await resetCreditsOnRenewal(invoice);
  await __fireAffiliateCommissionHook(invoice, fastify);
  break;
}
```

Sequencing matters: primary billing effect (credit reset — the user-facing guarantee) runs first; affiliate commission (back-office) runs second. Per spec §3 "Hook placement" and risk R10.

- [ ] **Step 2: Full test sweep**

Run from `apps/api/`: `npm test`

Expected: existing 850+ tests still pass + 16 new tests in `billing-affiliate-hook.test.ts` pass. No other test files touched or broken.

- [ ] **Step 3: Typecheck**

Run from repo root: `npm run typecheck`

Expected: all 4 workspaces green.

---

## Task 6: Update `affiliate-flow.test.ts` item-9 comment

The integration test is Category C (`describe.skip`). Only the Portuguese checklist comment on line 21 is updated to reference the real webhook path; test body stays skipped per CC-4.

**Files:**
- Modify: `apps/api/src/__tests__/integration/affiliate-flow.test.ts`

- [ ] **Step 1: Read the file (first 30 lines)**

Use the Read tool on `/Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api/src/__tests__/integration/affiliate-flow.test.ts` limit 30.

- [ ] **Step 2: Edit line 21**

Replace the line:

```
    // 9.  calcCommissionUseCase.execute({...}) → cria affiliate_commissions
```

with:

```
    // 9.  POST /billing/webhook (invoice.paid) → __fireAffiliateCommissionHook → calcCommissionUseCase.execute({...}) → cria affiliate_commissions
```

Pure doc-only change. Test body remains inside `describe.skip`.

- [ ] **Step 3: Typecheck**

Run from repo root: `npm run typecheck`

Expected: green. (Integration test is `describe.skip` so its body isn't executed; the comment edit cannot regress runtime behavior.)

---

## Task 7: Add errata note to 2A spec

**Files:**
- Modify: `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`

- [ ] **Step 1: Read the file (first 20 lines)**

Use the Read tool on `/Users/figueiredo/Workspace/BrightCurios/bright-tale/docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md` limit 20 to locate the header block.

- [ ] **Step 2: Insert errata block**

Edit the file. Immediately after the first header block and before the first `---` divider, insert:

```md
> **Errata (2026-04-17):** §11.2F handoff item (R-5: "`CalculateAffiliateCommissionUseCase` is wired in the container but NOT invoked — the call-site lives inside the Stripe webhook handler and is 2F's concern") is now resolved by the minimal 2F sub-project. See
> `docs/superpowers/specs/2026-04-17-affiliate-2f-billing-hook-design.md` and
> `docs/superpowers/plans/2026-04-17-affiliate-2f-billing-hook.md`. The full
> migration to `@tn-figueiredo/billing@0.2.1` remains deferred to a later
> sub-project (working name "2F-mega" or "2G").
```

- [ ] **Step 3: Verify rendering / link targets**

Run from repo root:

```bash
ls docs/superpowers/specs/2026-04-17-affiliate-2f-billing-hook-design.md
ls docs/superpowers/plans/2026-04-17-affiliate-2f-billing-hook.md
```

Expected: both paths exist (the plan file is the one you're reading).

---

## Task 8: Full verification

**Files:** _(verification only — no edits)_

- [ ] **Step 1: Typecheck (all 4 workspaces)**

Run from repo root: `npm run typecheck`

Expected: green across `@brighttale/app`, `@brighttale/api`, `@brighttale/web`, `@brighttale/shared`.

- [ ] **Step 2: Lint**

Run from repo root: `npm run lint`

Expected: no new lint errors in `routes/billing.ts` or the new test file. Pre-existing warnings elsewhere are out of scope.

- [ ] **Step 3: Full test suite**

Run from `apps/api/`: `npm test`

Expected: full green. Pre-2F count + 16 new tests.

- [ ] **Step 4: Focused file test (stability)**

Run from `apps/api/`:

```bash
npx vitest run src/__tests__/routes/billing-affiliate-hook.test.ts
```

Expected: 16 / 16 passing. No flake on three consecutive runs.

- [ ] **Step 5: Verify no unintended edits**

Run from repo root:

```bash
git diff --stat main...HEAD -- apps/api/src/routes/billing.ts \
  apps/api/src/__tests__/routes/billing-affiliate-hook.test.ts \
  apps/api/src/__tests__/integration/affiliate-flow.test.ts \
  docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md
```

Expected: exactly 4 files changed. `routes/billing.ts` ~+80 LOC, test file ~+250 LOC, integration test ±1 LOC, 2A spec +~6 LOC. Total ~335 LOC.

- [ ] **Step 6: Confirm no accidental touches to out-of-scope files**

Run from repo root:

```bash
git diff --stat main...HEAD | grep -vE "(billing\.ts|billing-affiliate-hook\.test\.ts|affiliate-flow\.test\.ts|affiliate-2a-foundation-design\.md|affiliate-2f-billing-hook)" || echo "scope clean"
```

Expected: "scope clean". If any other file appears, review and revert unrelated drift before committing.

---

## Task 9: Commit

Single commit on `feat/affiliate-2a-foundation`. No push, no PR (per user directive & CC-1).

**Files:** _(git only — no source edits)_

- [ ] **Step 1: Review staged diff**

Run from repo root:

```bash
git status
git diff apps/api/src/routes/billing.ts | head -160
git diff apps/api/src/__tests__/integration/affiliate-flow.test.ts
git diff docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md
```

Expected: only the four target files touched. `billing.ts` shows: new import line, fee constants, 3 underscore-prefixed exports, 1-line addition in `invoice.paid` case.

- [ ] **Step 2: Stage specific files (no `-A`)**

```bash
git add \
  apps/api/src/routes/billing.ts \
  apps/api/src/__tests__/routes/billing-affiliate-hook.test.ts \
  apps/api/src/__tests__/integration/affiliate-flow.test.ts \
  docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md \
  docs/superpowers/plans/2026-04-17-affiliate-2f-billing-hook.md \
  docs/superpowers/specs/2026-04-17-affiliate-2f-billing-hook-design.md
```

The 2F spec + plan are added if not already under git version control.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): affiliate 2F — minimal Stripe webhook → CalculateAffiliateCommissionUseCase hook

Wire the already-instantiated CalculateAffiliateCommissionUseCase (2A)
into the existing Stripe webhook handler. Scope: single hook in the
invoice.paid dispatch branch; covers subscription_create (first invoice)
and subscription_cycle (recurring). Hook is isolated via try/catch —
a failed commission calculation must not cause Stripe to retry the
webhook because primary billing side-effects (credit reset) are already
committed.

- routes/billing.ts: add __computeStripeFee (3.99% + R$0.39 flat-rate
  approximation), __resolveOrgPrimaryUserId (mirrors affiliate.ts:13-19
  convention), __fireAffiliateCommissionHook. Hook is called after
  resetCreditsOnRenewal inside the invoice.paid case. Container resolved
  lazily inside the hook body to avoid circular imports.
- billing-affiliate-hook.test.ts (new): 16 unit tests — fee math,
  resolver, 9 hook-behavior cases from spec §5, plus annual-branch test.
  Category A (no DB, no network).
- affiliate-flow.test.ts: update item-9 checklist comment to reference
  the real webhook path (doc-only; describe.skip preserved).
- 2A spec: errata note pointing to 2F design + plan.

Explicitly out of scope (per spec §10): migration to
@tn-figueiredo/billing@0.2.1, MercadoPago changes, Receita Federal
Tax ID integration, balance_transaction expansion for true fees,
webhook-event dedupe (risk R2 accepted), PostHog events.

Verified: npm run typecheck + cd apps/api && npm test (existing + 16 new)
both green. No schema change, no new env vars, no new dependencies.
Container wiring in lib/affiliate/container.ts is unchanged.

Spec: docs/superpowers/specs/2026-04-17-affiliate-2f-billing-hook-design.md
Plan: docs/superpowers/plans/2026-04-17-affiliate-2f-billing-hook.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify commit**

Run from repo root:

```bash
git log -1 --stat
```

Expected: one commit on `feat/affiliate-2a-foundation` with the 4 (or 6, if spec/plan weren't pre-tracked) target files. No push.

---

## Done Criteria Checklist

- [ ] `npm run typecheck` green across 4 workspaces
- [ ] `cd apps/api && npm test` green: pre-2F baseline + 16 new tests in `billing-affiliate-hook.test.ts`
- [ ] `routes/billing.ts` has the hook wired at `invoice.paid` dispatch, **after** `resetCreditsOnRenewal`
- [ ] All 13 edge cases from spec §4 validated by unit tests or documented decisions (see mapping table below)
- [ ] Thrown errors inside the hook are caught, logged via `fastify.log.error`, and do NOT propagate (covered by T9)
- [ ] No schema changes, no new env vars, no new dependencies
- [ ] `CalculateAffiliateCommissionUseCase` constructor wiring in `container.ts` is **unchanged**
- [ ] `affiliate-flow.test.ts` item-9 comment updated; `describe.skip` preserved
- [ ] Errata note added to 2A spec
- [ ] One commit on `feat/affiliate-2a-foundation`, no push, no PR
- [ ] Diff total ~335 LOC across 4 source/test/doc files

### Edge-case → test mapping (from spec §4)

| # | Edge case | Covered by |
|---|---|---|
| 1 | No referral for user | use case returns `null` → T3 |
| 2 | Stale referral (past windowEnd) | use case returns `null` → T3 |
| 3 | billing_reason ∉ allowlist | T4, T5 |
| 4 | amount_paid === 0 | T6 |
| 5 | Unknown priceId | T7 |
| 6 | Org has no memberships / missing metadata.org_id | T8 |
| 7 | Org has multiple owners | `__resolveOrgPrimaryUserId` resolver test + spec §2 convention |
| 8 | Stripe webhook retry | accepted risk R2; documented, not tested |
| 9 | Affiliate status ∈ {paused, rejected} | use case returns `null` → T3 |
| 10 | Hook throws | T9 |
| 11 | Currency mismatch | accepted in 2F minimal; deferred to 2F-mega |
| 12 | invoice.period missing | `paymentPeriodStart/End === undefined` in T1 variant — documented in hook impl |
| 13 | Fee approximation ≠ settled fee | accepted risk R1; constants documented in Task 2 Step 3 |
