# BrightTale — Subscription-Ready Design

**Date:** 2026-04-21
**Status:** Approved
**Author:** Claude + Founder (brainstorming session)
**Scope:** Get the product ready for paid subscriptions end-to-end

---

## Decisions

| Decision | Choice |
|----------|--------|
| Scope | Stripe-live + credits race fix first, then minimal billing UI |
| Credits race condition | Bundled — fix before accepting payments |
| Trials | None — Free tier (1K credits) serves as try-before-you-buy |
| Billing cycles | Monthly + annual from day one |
| Billing settings UX | Minimal — lean on Stripe Customer Portal |
| Implementation order | Bottom-up: fix credits → wire Stripe → validate e2e → billing page |

---

## Section 1: Credits Hold/Reserve System

### Problem

`checkCredits()` reads balance and returns. Job enqueues, AI executes, `debitCredits()` fires later. Between check and debit, another request passes the same check. Balance goes negative.

### Solution

Replace check-then-debit with reserve-then-commit:

```
reserveCredits(orgId, userId, estimatedCost)
  → BEGIN transaction
  → SELECT ... FOR UPDATE on org row
  → IF (credits_total - credits_used - credits_reserved) >= cost
  →   credits_reserved += cost
  →   INSERT into credit_reservations (token, org_id, amount, status='held', expires_at)
  →   COMMIT, return reservation token
  → ELSE → ROLLBACK, throw INSUFFICIENT_CREDITS

commitReservation(token, actualCost)
  → credits_used += actualCost
  → credits_reserved -= estimatedCost
  → reservation status = 'committed'
  → log to credit_usage

releaseReservation(token)
  → credits_reserved -= estimatedCost
  → reservation status = 'released'
```

### New Database Objects

**Table: `credit_reservations`**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | default gen_random_uuid() |
| token | UUID UNIQUE | returned to caller |
| org_id | UUID FK → organizations | |
| user_id | UUID FK → auth.users | |
| amount | BIGINT | estimated cost reserved |
| actual_amount | BIGINT | nullable, set on commit |
| status | TEXT | 'held' / 'committed' / 'released' / 'expired' |
| created_at | TIMESTAMPTZ | default now() |
| expires_at | TIMESTAMPTZ | created_at + 15 min |
| committed_at | TIMESTAMPTZ | nullable |

RLS enabled (deny-all, service_role only). Index on `(org_id, status)` and `(expires_at)` for cleanup.

**New column:** `organizations.credits_reserved BIGINT DEFAULT 0`

### Orphan Cleanup

DB function `expire_stale_reservations()`: finds reservations where `status = 'held' AND expires_at < now()`, sets status to 'expired', decrements `organizations.credits_reserved`. Called via pg_cron or application-level cron (every 5 min).

### Caller Migration

Every job that currently calls `checkCredits()` → `debitCredits()` switches to:
- `reserveCredits()` before enqueuing work
- `commitReservation(token, actualCost)` on success
- `releaseReservation(token)` on failure

Addon-first accounting logic (debit addon credits before plan credits) remains in `commitReservation`.

### Acceptance Criteria

- 2 concurrent requests with balance 100 and cost 60 each → only 1 succeeds
- Balance never goes negative
- Failed/timed-out jobs release their reservation
- Orphan cleanup expires stale reservations within 15 minutes

---

## Section 2: Stripe Products & Prices Setup

### Products to Create in Stripe Dashboard

3 subscription Products:

| Product | Monthly Price | Annual Price | Credits |
|---------|--------------|-------------|---------|
| Starter | $9/mo | $84/yr ($7/mo) | 5,000 |
| Creator | $29/mo | $276/yr ($23/mo) | 15,000 |
| Pro | $99/mo | $948/yr ($79/mo) | 50,000 |

Free plan has no Stripe product — it's the default org state (1,000 credits).

3 add-on Products (one-time):

| Pack | Price | Credits |
|------|-------|---------|
| Small | $5 | 1,000 |
| Medium | $20 | 5,000 |
| Large | $50 | 15,000 |

**Total: 6 Products, 9 Prices.**

### Env Var Wiring

After creating in Stripe, paste real `price_xxx` IDs into:
- `apps/api/.env.local` (dev)
- Vercel env vars (prod)

Existing env var names: `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_ANNUAL`, `STRIPE_PRICE_CREATOR_MONTHLY`, `STRIPE_PRICE_CREATOR_ANNUAL`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_ADDON_1K`, `STRIPE_PRICE_ADDON_5K`, `STRIPE_PRICE_ADDON_15K`.

### Webhook Endpoint

Register in Stripe Dashboard: `https://<api-domain>/api/billing/webhook`

Local dev: `stripe listen --forward-to localhost:3001/api/billing/webhook`

### No Code Changes

This section is Dashboard configuration + env vars only. Credit amounts per plan live in `apps/api/src/lib/billing/plans.ts`, not Stripe.

### Changeability

- Prices can be archived and replaced anytime — swap env var to new `price_xxx` ID
- Products can be renamed, updated, or archived
- Credit allocations changed in code without touching Stripe
- Existing subscribers stay on old price until explicitly migrated

---

## Section 3: End-to-End Checkout → Credit Grant Validation

### Happy Path: Upgrade

1. User on Free clicks "Upgrade to Creator (monthly)"
2. `POST /api/billing/checkout` → Stripe Checkout Session (`mode: 'subscription'`)
3. User completes payment on Stripe hosted page
4. Stripe fires `checkout.session.completed` → webhook syncs subscription
5. Stripe fires `customer.subscription.created` → handler sets `organizations.plan = 'creator'`, `credits_total = 15000`, `credits_used = 0`, `credits_reserved = 0`, `credits_reset_at = now + 30d`
6. User returns, `GET /api/billing/status` reflects new plan

### Cycle Renewal

7. 30 days later: `invoice.paid` with `billing_reason = 'subscription_cycle'`
8. Handler resets `credits_used = 0`, `credits_reserved = 0`, expires held reservations
9. Affiliate commission hook fires if applicable

### Downgrade / Cancel

10. User clicks "Manage billing" → Stripe Customer Portal
11. Cancels → `customer.subscription.deleted`
12. Handler: plan = 'free', credits_total = 1000, clear reserved

### Add-on Purchase

13. `POST /api/billing/addons/checkout` → `mode: 'payment'`
14. `checkout.session.completed` with addon metadata → `credits_addon += pack amount`

### Code Changes Required

- Webhook handler's cycle reset must also clear `credits_reserved` and expire held reservations (integration with Section 1)
- Verify `customer.subscription.updated` handles mid-cycle plan upgrades (proration)
- Integration test: mock Stripe webhook events, assert DB state transitions

### Acceptance Criteria

- Checkout → webhook → credit grant works end-to-end in Stripe test mode
- Plan upgrade reflects in `/api/billing/status` within seconds of webhook
- Cycle renewal resets credits_used and credits_reserved to 0
- Cancellation downgrades to Free with 1,000 credits
- Add-on credits persist across cycle resets (never reset)

---

## Section 4: Billing Settings Page

### Location

`/settings/billing` — new page in `apps/app`

### Three Sections

**1. Current Plan Card**
- Plan name + badge (Free / Starter / Creator / Pro)
- Credits bar: `used / total` with percentage
- Reserved credits shown separately
- Next reset date
- If Free: "Upgrade" CTA
- If paid: "Change plan" → Stripe Checkout | "Manage billing" → Stripe Portal

**2. Credit Usage Summary**
- Reuse existing `CreditsDashboard` component (category breakdown, progress bar)
- Add-on balance shown separately from plan credits

**3. Manage Billing Button**
- `POST /api/billing/portal` → redirect to Stripe Customer Portal
- Portal handles: payment method, invoices, cancellation, billing info updates

### Existing Components to Reuse

- `CreditsDashboard.tsx` — category breakdown + progress bar
- `UpgradeModal.tsx` — upgrade CTA flow
- `useBillingStatus.ts` — plan + credits data hook

### New Work

- `/settings/billing` page composing existing components
- "Reserved credits" indicator in credits bar (depends on Section 1)
- Routing/nav entry for the billing settings page

### Acceptance Criteria

- Page displays current plan, credits used/total/reserved, reset date
- "Upgrade" redirects to Stripe Checkout
- "Manage billing" redirects to Stripe Customer Portal
- Credits dashboard shows category breakdown
- Add-on balance displayed separately

---

## Implementation Order

1. **Credits hold/reserve** — migration + new functions + caller migration + tests
2. **Stripe Dashboard setup** — create Products/Prices, wire env vars, register webhook
3. **E2E validation** — test checkout → webhook → credits flow in Stripe test mode, fix webhook handler for reservation integration
4. **Billing settings page** — compose existing components into `/settings/billing`

---

## Out of Scope

- Trials (Free tier is the trial)
- Mercado Pago / PIX / boleto
- Rich in-app billing management (Stripe Portal handles it)
- Enterprise tier
- Credit roll-over between cycles
- Proration UI (Stripe handles natively)
