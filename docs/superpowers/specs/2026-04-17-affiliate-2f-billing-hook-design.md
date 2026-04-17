# Affiliate 2F — Billing Hook (minimal) — Design Spec

**Date:** 2026-04-17
**Status:** draft (post-brainstorm, pre-plan)
**Context:** Sub-project 4 of the affiliate-migration long-lived branch
`feat/affiliate-2a-foundation`. Wires the already-instantiated
`CalculateAffiliateCommissionUseCase` (2A) into the existing Stripe webhook
handler in `apps/api/src/routes/billing.ts`. Explicitly MINIMAL: NO migration
to `@tn-figueiredo/billing@0.2.1`, NO MercadoPago changes, NO Receita Federal
integration. The full billing-stack migration is a separate, later project.

---

## 1. Context & Goals

### Background

Phase 2A wired `calcCommissionUseCase: CalculateAffiliateCommissionUseCase`
in `buildAffiliateContainer()` against `SupabaseAffiliateRepository` +
`AFFILIATE_CONFIG.tierRates`. The use case looks up the active referral,
validates attribution window + affiliate status, and persists an
`affiliate_commissions` row (status `pending`) when gates pass — otherwise
returns `null` (silent no-op).

2A handoff §11.2F flagged two paths: (a) full migration of the 448-LOC
`apps/api/src/routes/billing.ts` to `@tn-figueiredo/billing@0.2.1`, or
(b) retain the custom routes + add a single hook call. The user has chosen
**option (b)** for this sub-project. Option (a) is deferred.

`routes/billing.ts` has a complete Stripe webhook dispatcher handling 4
event types. The `invoice.paid` branch is the correct attachment point:
it fires on recurring (`subscription_cycle`) and first-invoice
(`subscription_create`) charges. The hook resolves `user_id` from
`org_id`, computes `stripeFee`, and invokes the use case.

### Goals

1. Add a single hook in the Stripe webhook handler invoking
   `calcCommissionUseCase.execute(...)` on successful subscription payment
   — both `subscription_create` (first invoice) and `subscription_cycle`
   (recurring).
2. Resolve `userId` from `subscription.metadata.org_id` via
   `org_memberships.created_at ASC LIMIT 1` (same convention as
   `lib/affiliate/affiliate.ts:13-19` and 2A handoff §11.2F-2D).
3. Map Stripe `Invoice` to the use-case input shape: `paymentAmount`
   (centavos), `stripeFee` (centavos, approximated), `paymentType`
   (`'monthly' | 'annual'`), `today` (ISO date), optional period-boundary
   fields.
4. Respect the use case's built-in no-op guards (6 return-null conditions;
   see §2). No conditional wrapping at the call site beyond try/catch.
5. Isolate commission-hook failures from the rest of the webhook: wrap in
   `try/catch`, log via `fastify.log.error`, return. **A failed commission
   calculation must not cause Stripe to retry the webhook**, because
   primary billing side-effects (subscription sync, credit reset) are
   already committed.
6. Unit tests: happy path, no-referral no-op, non-allowlist reasons
   skipped, fee math, `paymentType` derivation, error isolation.
7. Update `affiliate-flow.test.ts` checklist item #9 comment to reference
   the real webhook path (doc-only; test stays Category C /
   `describe.skip`).

### Non-goals (enforced in §10)

- Migration to `@tn-figueiredo/billing@0.2.1`. `routes/billing.ts` stays
  as-is plus the hook.
- Refactor of other Stripe event handlers (`checkout.session.completed`,
  `customer.subscription.{created,updated,deleted}`).
- Changes to `apps/api/src/lib/billing/mercadopago.ts` (stub file).
- Receita Federal Tax ID validation (handoff §11.2F R8).
- Idempotency-token layer for commissions. `createCommission` repository
  method inserts without higher-level dedupe (accepted risk R2).
- Stripe webhook end-to-end rehearsal. `STRIPE_SECRET_KEY` /
  `STRIPE_WEBHOOK_SECRET` are not provisioned on this branch. Unit tests
  (Category A, no network, no DB) are the proof.
- Replay-protection / event-deduplication for Stripe webhook redeliveries
  on the commission side. Existing billing handlers have no dedupe either;
  adding one only for the hook is scope creep.

### Cross-cutting constraints (inherited)

- **CC-1** — branch rename deferred; 2F lands on `feat/affiliate-2a-foundation`.
- **CC-2** — rebase cadence preserved; 2F rebases atop SP0 + 2B/2C/2D/2E
  as they land.
- **CC-3** — no staging deploy for this sub-project; local-only validation.
- **CC-4** — smoke validation local-only; Category C integration tests
  stay skipped.

---

## 2. Current State

### Use case signature (`@tn-figueiredo/affiliate@0.4.x`)

Verified at `node_modules/@tn-figueiredo/affiliate/dist/index.d.ts:72-86`:

```ts
declare class CalculateAffiliateCommissionUseCase {
  constructor(repo: IAffiliateRepository, config: Pick<AffiliateConfig, 'tierRates'>);
  execute(input: {
    userId: string;
    paymentAmount: number;     // centavos (smallest currency unit)
    stripeFee: number;         // centavos
    paymentType: 'monthly' | 'annual';
    today: string;             // ISO date 'YYYY-MM-DD'
    paymentPeriodStart?: string;
    paymentPeriodEnd?: string;
    isRetroactive?: boolean;
  }): Promise<AffiliateCommission | null>;
}
```

Guard chain (verified `dist/index.js:495-509`) returns `null` on six
preconditions: no referral, referral not `active`, today > `windowEnd`,
affiliate lookup miss, affiliate not `active`, `totalBrl <= 0`. No throw.

### Container wiring (already in 2A)

`apps/api/src/lib/affiliate/container.ts:63,109`:
```ts
const calcCommissionUseCase = new CalculateAffiliateCommissionUseCase(repo, config)
// cached = { ..., calcCommissionUseCase, ... }
```

Exported via `AffiliateContainer.calcCommissionUseCase`. **No container
changes in 2F.**

### Webhook dispatcher

Route: `POST /billing/webhook` (`apps/api/src/index.ts:185` registers
`billingRoutes` with `prefix: "/billing"`). Dispatcher in
`routes/billing.ts:308-342` handles 4 event types. The `invoice.paid`
branch currently invokes `resetCreditsOnRenewal`, which filters to
`billing_reason === 'subscription_cycle'`. 2F adds a sibling hook that
also covers `subscription_create`.

### Billing-reason landscape (Stripe)

Values: `subscription_create` (first invoice), `subscription_cycle`
(recurring), `subscription_update` (proration), `manual`,
`subscription_threshold`, `automatic_pending_invoice_item_invoice`.
2F allowlist: `{subscription_create, subscription_cycle}`. Prorations are
excluded (negative amounts possible, ambiguous window semantics).

### Stripe fee access

`Invoice` does not expose processor fees directly. True fee lives on
`Charge.balance_transaction`, which settles asynchronously. 2F uses a
flat-rate approximation (see §3 `computeStripeFee`). Full 2F-mega will
switch to `expand: ['charge.balance_transaction']`.

---

## 3. Target State

### Code diff (scope summary)

| File | Change | ~LOC |
|---|---|---|
| `apps/api/src/routes/billing.ts` | Add `__fireAffiliateCommissionHook` + `__resolveOrgPrimaryUserId` + `__computeStripeFee`; call hook in `invoice.paid` branch | +~80 |
| `apps/api/src/__tests__/routes/billing-affiliate-hook.test.ts` | NEW — unit tests | +~250 |
| `apps/api/src/__tests__/integration/affiliate-flow.test.ts` | Update item-9 comment | +1 / -1 |
| `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md` | Errata line at top | +2 |
| **Total** | | **~335 LOC** |

No new dependencies. No schema changes. No env-var additions.

### Hook placement

Call the new hook **after** `resetCreditsOnRenewal` inside the
`invoice.paid` dispatch case. Both consume the same event but filter to
different billing reasons. Sequencing matters: primary billing effect
first (credit reset is the user-facing guarantee); affiliate commission
second (back-office).

```ts
case 'invoice.paid': {
  const invoice = event.data.object as StripeInvoice;
  await resetCreditsOnRenewal(invoice);               // existing
  await __fireAffiliateCommissionHook(invoice, fastify); // NEW
  break;
}
```

### Hook function (control flow)

Allowlist `billing_reason` → short-circuit on zero payment → retrieve
subscription → map price → resolve primary user → compute fee + period
fields → call `calcCommissionUseCase.execute(...)` → log on success; on
any throw, log error and swallow. See Appendix A.1 for the full body.

### `resolveOrgPrimaryUserId`

Mirrors `lib/affiliate/affiliate.ts:13-19`:

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

### `computeStripeFee` (flat-rate approximation)

```ts
const STRIPE_FEE_RATE = 0.0399;         // Stripe BR card standard
const STRIPE_FEE_FIXED_CENTAVOS = 39;   // R$0,39

export function __computeStripeFee(amountCentavos: number): number {
  return Math.round(amountCentavos * STRIPE_FEE_RATE) + STRIPE_FEE_FIXED_CENTAVOS;
}
```

Trade-off: commission net-amount off by ~±0.5% vs. true settled fee (card
brand, international, FX). Accepted for minimal 2F. Constants are
file-local — lifted to env or replaced with `balance_transaction`
expansion in full 2F-mega.

### Container access

Lazy resolution inside the hook body (`buildAffiliateContainer()` is
memoized per 2A). No module-level import of cached container state into
`billing.ts` — maintains acyclic module graph between the custom billing
layer and the affiliate subsystem.

### Observability

Two `fastify.log` lines: `info` on successful commission creation,
`error` on isolated failure. No Sentry `captureException` (error is
non-fatal by design). No PostHog event (aggregates in `affiliate_stats`).
Matches the existing `billing.ts:309` log convention.

### Underscore-prefixed exports (test access)

`__fireAffiliateCommissionHook`, `__resolveOrgPrimaryUserId`,
`__computeStripeFee`. Same internal-marker convention as SP0's
`__resetProviderForTest`. Public `billingRoutes(fastify)` surface
unchanged.

---

## 4. Edge Cases & Decisions

| # | Case | Decision |
|---|---|---|
| 1 | No referral for user | Use case returns `null`; silent success |
| 2 | Stale referral (past `windowEnd`) | Use case returns `null` |
| 3 | `billing_reason ∈ {subscription_update, manual, threshold, automatic_pending_invoice_item_invoice}` | Skip — not in allowlist |
| 4 | `invoice.amount_paid === 0` (trial conversion, 100% coupon) | Short-circuit before DB/Stripe calls |
| 5 | Unknown `priceId` (legacy or addon) | `planFromPriceId` → `null` → skip |
| 6 | Org has no memberships / missing `metadata.org_id` | Skip silently |
| 7 | Org has multiple owners | Primary = earliest `created_at` (convention §2) |
| 8 | Stripe webhook retry (same event twice) | Accepted duplicate risk R2 |
| 9 | Affiliate `status ∈ {paused, rejected}` | Use case returns `null` |
| 10 | Hook throws (DB down, network) | Log error, swallow, webhook returns 200 |
| 11 | Currency mismatch (USD invoice, BRL math) | Not guarded in 2F; audit in full 2F-mega |
| 12 | `invoice.period` missing | Pass `undefined`; stored as `null` |
| 13 | Fee approximation ≠ settled fee | Accepted delta <1% per §3 |

---

## 5. Testing

Unit tests only. **Category A**: no DB, no network, no env-var dependency.
Stripe objects are hand-constructed literals matching the package type
shape.

### File: `apps/api/src/__tests__/routes/billing-affiliate-hook.test.ts`

Imports the three underscore-prefixed exports from `routes/billing.ts`.
Mocks via `vi.mock` at module boundaries.

### Test cases (9 tests)

| # | Test | Assertion |
|---|---|---|
| T1 | fires on `subscription_cycle` with active referral | `execute` called once with `{userId, paymentAmount:9900, stripeFee:434, paymentType:'monthly', today:<ISO>, periodStart, periodEnd, isRetroactive:false}` |
| T2 | fires on `subscription_create` (first invoice) | `execute` called once |
| T3 | no-op when use case returns `null` | no throw, no info log |
| T4 | skips `subscription_update` | `execute` NOT called |
| T5 | skips `manual` | `execute` NOT called |
| T6 | skips `amount_paid === 0` | `execute` NOT called; `subscriptions.retrieve` NOT called (short-circuit) |
| T7 | skips unknown `priceId` | `planFromPriceId` mocked to return `null`; `execute` NOT called |
| T8 | skips when org has no memberships | `resolveOrgPrimaryUserId` returns `null`; `execute` NOT called |
| T9 | swallows thrown error | `execute` rejects; hook resolves; `fastify.log.error` called with `{err, invoiceId}` |

Plus 1 test for `__computeStripeFee(9900) === 434` — documents the
approximation constants and fails loudly on drift.

### Mock boundaries

- `getStripe` → minimal `{subscriptions: {retrieve: vi.fn()}}`.
- `planFromPriceId` → `vi.fn(() => ({planId: 'creator', cycle: 'monthly'}))`.
- `createServiceClient` → thenable builder for `org_memberships` query.
- `buildAffiliateContainer` → `{calcCommissionUseCase: {execute: vi.fn()}}`.
- `fastify` → `{log: {info: vi.fn(), error: vi.fn()}}` literal.

### Coverage target

Hook + helpers ≥95% branches. Aligns with SP0 infra floor.

### What is NOT tested here

- Stripe webhook signature verification (unchanged; SDK-owned).
- `CalculateAffiliateCommissionUseCase` internals (upstream package).
- MercadoPago (stub, no handler).
- Webhook-event idempotency (accepted risk R2).

### Manual verification (optional, post-merge, if env ever set)

`npm run dev:api` → `stripe listen --forward-to localhost:3001/billing/webhook`
→ `stripe trigger invoice.paid`. Expect `[affiliate] commission created
from Stripe invoice` in logs when the invoice's subscription metadata maps
to a user with an active affiliate referral. **NOT required for 2F merge**;
unit tests are the contract.

---

## 6. Configuration

**No new environment variables.** The hook consumes existing billing
envs (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_*`). For
**2F merge on this branch**, none must be set — typecheck + unit tests
are independent. Runtime path activates only when envs are provisioned
in a real environment.

File-local constants (`STRIPE_FEE_RATE`, `STRIPE_FEE_FIXED_CENTAVOS`)
are NOT promoted to env vars — YAGNI for minimal 2F; rates change
rarely and a code change is appropriate when they do.

---

## 7. Migration Path

Single commit on `feat/affiliate-2a-foundation`. No schema migration, no
dependency changes, no env-var additions.

### Steps

1. Read `routes/billing.ts` (Edit tool requires prior Read).
2. Edit `routes/billing.ts`:
   - Add import: `buildAffiliateContainer` from `'../lib/affiliate/container.js'`.
   - Add constants `STRIPE_FEE_RATE`, `STRIPE_FEE_FIXED_CENTAVOS`.
   - Add `__computeStripeFee`, `__resolveOrgPrimaryUserId`,
     `__fireAffiliateCommissionHook` as named exports.
   - Modify `handleStripeEvent` `invoice.paid` case to `await` the hook
     after `resetCreditsOnRenewal`.
3. Create `apps/api/src/__tests__/routes/billing-affiliate-hook.test.ts`
   with 9 tests + 1 fee-math assertion per §5.
4. Update `apps/api/src/__tests__/integration/affiliate-flow.test.ts`
   item-9 comment: `calcCommissionUseCase.execute({...})` →
   `POST /billing/webhook` (invoice.paid) → hook invokes
   `calcCommissionUseCase`.
5. Add errata line at top of 2A spec referencing this doc.
6. Verify: `npm run typecheck && npm test` green across 4 workspaces.
7. Commit. Branch rename deferred per CC-1. No push, no PR in this
   sub-project (per user directive).

### Rollback

`git revert <sha>`. No schema, no data, no env change. Existing
`resetCreditsOnRenewal` path is untouched by the hook addition.

---

## 8. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Stripe fee approximation drifts from true settled fee | Low | Documented <1% delta; constants file-local; full-2F replaces with `balance_transaction` |
| R2 | Stripe webhook redelivery creates duplicate commission row | Medium | Accepted. Existing handlers have no dedupe. Unique-index audit deferred to full 2F-mega |
| R3 | Commission fires on voided/refunded invoice | Low | Hook listens only to `invoice.paid` event; `invoice.voided` / `invoice.marked_uncollectible` / `charge.refunded` are separate event types not dispatched to the hook |
| R4 | Circular import `billing.ts` ↔ `lib/affiliate/container.ts` | Low | Container resolved lazily inside hook body; module graph stays acyclic |
| R5 | Container memoization interferes with tests | Low | `vi.mock('../lib/affiliate/container.js')` overrides at module level |
| R6 | Log volume spike on paid invoices | Low | One info line per commission; error path logs once. ≤ Stripe webhook rate |
| R7 | Primary-user resolution picks wrong owner | Medium | Same convention as existing `affiliate.ts:13-19`; systemic, not hook-specific. Owner-disambiguation is a 2D concern |
| R8 | Webhook arrives before `subscription.metadata.org_id` is set | Low | Metadata is set at Checkout Session creation (`billing.ts:177`) before the subscription exists; no race |
| R9 | `execute` latency adds to webhook response time | Low | ≤3 reads + 1 insert; p95 < 200ms; Stripe timeout is 30s |
| R10 | Hook swallows a bug that should page on-call | Medium | Accepted: Stripe retry of committed `resetCreditsOnRenewal` would double-reset credits. `fastify.log.error` captures failure for post-hoc triage |

---

## 9. Done Criteria

1. `npm run typecheck` green across 4 workspaces.
2. `npm test` green: existing suite + 9 new unit tests + 1 fee-math
   assertion in `billing-affiliate-hook.test.ts`.
3. `routes/billing.ts` has the hook wired at `invoice.paid` dispatch,
   after `resetCreditsOnRenewal`.
4. All 13 edge cases per §4 validated by unit tests or documented
   decisions.
5. Thrown errors inside the hook are caught, logged, and do NOT propagate
   (T9).
6. No schema changes, no new env vars, no new dependencies.
7. `CalculateAffiliateCommissionUseCase` constructor wiring in
   `container.ts` is **unchanged**.
8. `affiliate-flow.test.ts` item-9 comment updated.
9. Errata note added to 2A spec top matter (one line).
10. One commit, descriptive message, on `feat/affiliate-2a-foundation`.
    No push, no PR.

---

## 10. Out of Scope (reiterated)

**Explicitly NOT in Phase 2F minimal:**

- Migration to `@tn-figueiredo/billing@0.2.1`. The existing 448-LOC
  `routes/billing.ts` stays as-is plus the hook. The full billing-stack
  migration is a **separate, later sub-project** ("2F-mega" or "2G";
  naming TBD) with its own spec covering checkout, portal, invoicing
  reconciliation, proration, currency, etc.
- Refactor of MercadoPago path (`lib/billing/mercadopago.ts`). Stub; no
  real flow to hook.
- Receita Federal Tax ID validation. `StubTaxIdRepository` stays.
  Separate sub-project.
- Idempotency-token layer on `POST /affiliate/payouts` (handoff R16).
- Email-provider abstraction (SP0 — already delivered in
  `2026-04-17-email-provider-abstraction-design.md`; 2F assumes it in
  place).
- Stripe `balance_transaction` expansion for true fee calculation.
- Webhook-event deduplication for commission idempotency (risk R2
  accepted).
- PostHog events for commission-created.
- Changes to any other Stripe event handler (`checkout.session.completed`,
  `customer.subscription.{created,updated,deleted}`).

---

## 11. Handoff to next sub-project

Post-merge of 2F on the long-lived branch:

- **2D (data migration + cutover):** `affiliate_commissions` will
  populate naturally from webhook traffic once an environment has
  `STRIPE_WEBHOOK_SECRET`. Backfill of historical referrals → synthetic
  commissions is 2D's call; the hook provides the forward-fill path.
- **Full billing migration (later):** the hook function is the first
  thing to re-home into `@tn-figueiredo/billing@0.2.x`'s webhook
  dispatcher. Replace `computeStripeFee` with `balance_transaction`
  expansion. Revisit currency assumptions if non-BRL is ever charged.
- **Receita Federal Tax ID / payout idempotency:** independent
  sub-projects; 2F does not touch them.

---

## 12. References

- Affiliate 2A spec: `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`
  (§11.2F handoff prescribed this minimal sub-project)
- Email abstraction (SP0): `docs/superpowers/specs/2026-04-17-email-provider-abstraction-design.md`
- Current billing routes: `apps/api/src/routes/billing.ts` (448 LOC)
- Affiliate container: `apps/api/src/lib/affiliate/container.ts`
- Affiliate package: `node_modules/@tn-figueiredo/affiliate@0.4.x`
  — `dist/index.d.ts:72-86` (use-case sig), `dist/index.js:488-529`
  (guard chain)
- Stripe Invoice docs: https://stripe.com/docs/api/invoices/object
- Org-primary-user convention: `apps/api/src/lib/affiliate/affiliate.ts:13-19`

---

## Appendix A — Code skeleton (verified shape)

### A.1 `apps/api/src/routes/billing.ts` — additions

```ts
import { buildAffiliateContainer } from '../lib/affiliate/container.js';

const STRIPE_FEE_RATE = 0.0399;
const STRIPE_FEE_FIXED_CENTAVOS = 39;

export function __computeStripeFee(amountCentavos: number): number {
  return Math.round(amountCentavos * STRIPE_FEE_RATE) + STRIPE_FEE_FIXED_CENTAVOS;
}

export async function __resolveOrgPrimaryUserId(orgId: string): Promise<string | null> {
  const sb = createServiceClient();
  const { data } = await sb
    .from('org_memberships').select('user_id').eq('org_id', orgId)
    .order('created_at', { ascending: true }).limit(1).single();
  return (data?.user_id as string | undefined) ?? null;
}

export async function __fireAffiliateCommissionHook(
  invoice: StripeInvoice, fastify: FastifyInstance,
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
    const periodStart = period?.start ? new Date(period.start * 1000).toISOString().slice(0, 10) : undefined;
    const periodEnd = period?.end ? new Date(period.end * 1000).toISOString().slice(0, 10) : undefined;
    const { calcCommissionUseCase } = buildAffiliateContainer();
    const commission = await calcCommissionUseCase.execute({
      userId, paymentAmount, stripeFee: __computeStripeFee(paymentAmount),
      paymentType, today, paymentPeriodStart: periodStart,
      paymentPeriodEnd: periodEnd, isRetroactive: false,
    });
    if (commission) {
      fastify.log.info(
        { userId, invoiceId: invoice.id, commissionId: commission.id, totalBrl: commission.totalBrl },
        '[affiliate] commission created from Stripe invoice',
      );
    }
  } catch (err) {
    fastify.log.error({ err, invoiceId: invoice.id }, '[affiliate] commission hook failed (isolated)');
  }
}

// modified invoice.paid case in handleStripeEvent:
case 'invoice.paid': {
  const invoice = event.data.object as StripeInvoice;
  await resetCreditsOnRenewal(invoice);
  await __fireAffiliateCommissionHook(invoice, fastify);
  break;
}
```

### A.2 Test skeleton

Test file uses `vi.mock` on four module paths: `../../lib/billing/stripe.js`
(returns `{getStripe: () => ({subscriptions: {retrieve: vi.fn()}})}`),
`../../lib/billing/plans.js` (returns `{planFromPriceId: vi.fn(...)}`),
`../../lib/affiliate/container.js` (returns
`{buildAffiliateContainer: () => ({calcCommissionUseCase: {execute: vi.fn()}})}`),
`../../lib/supabase/index.js` (returns a thenable builder chain
`.from().select().eq().order().limit().single() → {data: {user_id: 'user-123'}}`).
Test file then imports `__fireAffiliateCommissionHook` + `__computeStripeFee`
from `../../routes/billing.js`. `fastify` parameter is a literal
`{log: {info: vi.fn(), error: vi.fn()}} as never`. Each test arranges the
invoice literal (`billing_reason`, `amount_paid`, `period`), calls the hook,
asserts on the mock `execute` invocation shape (T1–T2), or absence (T4–T8),
or error-log call (T9). See §5 table for the 9 + 1 assertions.
