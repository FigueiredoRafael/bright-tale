# Affiliate Platform — Phase 2A Foundation — Design Spec

> **Errata — 2026-04-17:** The `/signup` drift documented in §2 (and the
> `KNOWN GAP` comment in `apps/api/src/lib/affiliate/config.ts`) was resolved
> in Phase 2B via Next.js `beforeFiles` rewrites.
> See `docs/superpowers/specs/2026-04-17-affiliate-2b-end-user-ui-design.md` §6.3.
> The §11.2B handoff checklist items are complete. Inline text preserved as historical record.

> **Errata (2026-04-17):** §11.2F handoff item (R-5: "`CalculateAffiliateCommissionUseCase` is wired in the container but NOT invoked — the call-site lives inside the Stripe webhook handler and is 2F's concern") is now resolved by the minimal 2F sub-project. See
> `docs/superpowers/specs/2026-04-17-affiliate-2f-billing-hook-design.md` and
> `docs/superpowers/plans/2026-04-17-affiliate-2f-billing-hook.md`. The full
> migration to `@tn-figueiredo/billing@0.2.1` remains deferred to a later
> sub-project (working name "2F-mega" or "2G").

> **Errata — 2026-04-17 post-publication:** The `isResendConfigured()` silent-skip
> pattern and the `@/lib/email/resend` import paths referenced throughout this
> document (§3, §4, §5, §6, Appendix A.3) were superseded by the email provider
> abstraction (sub-project 0 of the affiliate migration). See
> `docs/superpowers/specs/2026-04-17-email-provider-abstraction-design.md`.
> Inline text is preserved as historical record.

> **Errata — 2026-04-17 post-publication:** The two High-risk gaps accepted
> in §9 (R9 self-referral fraud service + R15 `/ref/:code` rate-limit) are
> addressed in sub-project 3 of the affiliate migration — see
> `docs/superpowers/specs/2026-04-17-affiliate-2e-fraud-detection-design.md`
> and `docs/superpowers/plans/2026-04-17-affiliate-2e-fraud-detection.md`.
> The `undefined /* fraud — 2E */` placeholder at `container.ts:62` is
> replaced with an env-gated `AffiliateFraudAdapter` (kill-switch:
> `FRAUD_DETECTION_ENABLED`). Inline text in §9 is preserved as historical
> record.

**Status:** rewritten v2 (verified against package source `@tn-figueiredo/affiliate@0.4.0`)
**Date:** 2026-04-17 (v1) · 2026-04-17 rewrite (v2)
**Author:** Thiago Figueiredo (with Claude)
**Phase:** 2A of 2 (Phase 2 = Affiliates + Derivatives; 2A is foundation; 2B–2G covered separately)
**Predecessor:** Phase 1 (`docs/superpowers/specs/2026-04-16-admin-062-upgrade-design.md` — admin shell upgrade, merged to `staging` and stable in prod 7+ days)

> **v2 rewrite changes (vs v1):** all column names, table counts, use-case constructor signatures, repository method shapes, and migration content were re-verified by extracting the package tarball (`npm pack @tn-figueiredo/affiliate@0.4.0`) and reading `dist/*.d.ts` + `migrations/*.sql`. v1 had **18 critical inaccuracies** including a phantom `affiliate_social_links` table, wrong counter-column names (`clicks` vs `total_clicks`), 5 incorrect use-case constructor signatures, and a class-field-initializer ordering bug. v2 corrects all of these and adds a mappers layer, rollback SQL, env-var deferral, an SMTP-ready abstraction, click-fraud + idempotency risks, and a Phase 2A.6 staging-soak gate.

---

## 1. Context & Goals

### Background

bright-tale already ships a custom affiliate program implementation (~424 LOC across DB schema + API routes + end-user settings page). The implementation is minimal: per-user program code, simple referral tracking, fixed 20% commission. It targets the "creator becomes BrightTale affiliate" use case.

`@tn-figueiredo/affiliate@0.4.0` is a substantially larger affiliate platform shipping **10 tables**, 35 use cases (37 declared; 2 are admin-only and not yet wired here), tier-based commission, PIX-key payouts, contract history, fraud scoring, and content submission review. It is the platform target for BrightTale's affiliate strategy.

**Phase 2A** is the foundation sub-phase of the full migration: install the package, create new tables alongside legacy, implement the consumer-side ports (repository with mapper layer, email service, tax-id stub, optional fraud), wire all 4 route helpers, and stand up the cron. Legacy stays alive in parallel until 2D cutover.

### Goals

1. Install `@tn-figueiredo/affiliate@0.4.0` in `apps/api` (`--save-exact`).
2. Apply 5 package migrations (10 new tables) + 1 bright-tale migration (rename legacy + `updated_at` triggers + atomic counter functions).
3. Implement `IAffiliateRepository` (52 methods, split across 11 sub-repos for review-ability) + a typed mapper layer (`mappers.ts`) for camelCase ↔ snake_case translation on every write path.
4. Implement `IAffiliateEmailService` (4 methods over Resend) with HTML escaping for user-controlled inputs and a guard for `RESEND_API_KEY` absence (no-op when unconfigured).
5. Stub `IAffiliateTaxIdRepository` (real impl deferred to Phase 2F).
6. Wire 4 package route helpers: `registerAffiliateRoutes`, `registerAffiliateAdminRoutes`, `registerAffiliateInternalRoutes`, `registerAffiliateRedirectRoute`.
7. Add Inngest cron `affiliate-expire-referrals` (daily 02:00 BRT = 05:00 UTC).
8. Rename legacy table + routes to `affiliate-legacy` namespace; preserve end-user functionality during 2A.
9. Establish foundation that 2B (end-user UI), 2C (admin UI), 2D (cutover), 2E (fraud), 2F (billing/tax/payout automation) build on.
10. Keep email provider open — abstraction allows future SMTP swap (Phase 2F+).

### Non-goals (explicitly out of scope for 2A)

- End-user UI rewrite (2B)
- Admin UI adoption (`affiliate-admin@0.3.3`) (2C)
- Data migration legacy → new (2D)
- Fraud detection real impl (2E)
- Billing/Stripe overhaul + payout automation (2F)
- SMTP email provider (2F+; abstraction prepared, impl deferred)
- Promo codes (2G; deferred upstream)
- Receita Federal / Tax ID validation API
- PostHog custom events for affiliate flows
- i18n for emails (pt-BR hardcoded)
- Mobile responsiveness (admin desktop-only)
- Click-fraud rate-limit on `/ref/:code` (deferred to 2E; risk accepted with mitigation in §9 R15)
- Idempotency tokens on `POST /payouts` (deferred to 2F; risk accepted in §9 R16)

---

## 2. Current State

### Existing custom affiliate implementation

```
apps/api/src/routes/affiliate.ts                                       136 LOC  (3 routes; registered in src/index.ts:184)
apps/api/src/routes/billing.ts                                         448 LOC  (Stripe + MercadoPago — out of scope for 2A)
apps/app/src/app/(app)/settings/affiliate/page.tsx                     240 LOC  (end-user UI; 3 fetch calls)
supabase/migrations/20260414040000_publishing_destinations.sql          ~50 LOC  affiliate_programs + affiliate_referrals tables
supabase/migrations/20260411030000_user_roles.sql                       ~25 LOC  user_roles table (Phase 1; isAdmin reads this)
```

### Package versions (verified on GitHub Packages registry)

| Package | Latest | Notes |
|---|---|---|
| `@tn-figueiredo/affiliate` | 0.4.0 | Domain + 5 migrations (10 tables) + 4 route helpers (`MinimalFastify`-based) |
| `@tn-figueiredo/affiliate-admin` | 0.3.3 | RSC admin UI — for 2C |
| `@tn-figueiredo/fraud-detection` | 0.2.0 | For 2E |
| `@tn-figueiredo/billing` | 0.2.1 | For 2F (overlap with custom billing.ts) |

### apps/api conventions

- Fastify 5; routes registered as plugins via `server.register(plugin, { prefix: '/path' })`
- Auth: `preHandler: [authenticate]` validates `X-Internal-Key` and populates `request.userId` from `x-user-id` header (set by `apps/app` middleware after Supabase SSR validation, which strips client-supplied auth headers first — anti-spoofing)
- Supabase: `createServiceClient()` per call, service_role key, bypasses RLS
- Email: `apps/api/src/lib/email/resend.ts` exports `sendEmail()` (THROWS if `RESEND_API_KEY` absent) + `isResendConfigured()` (boolean guard); `sendEmail` returns `{ id: string, provider: 'resend' }`
- Mappers: `packages/shared/src/mappers/db.ts` defines `DbXxx` + `DomainXxx` types and bidirectional `mapXxxFromDb`/`mapXxxToDb` functions. Pattern is **explicit struct types, no auto-conversion utility** — we mirror this for affiliate
- DI: **no global container** — most existing routes call `createServiceClient()` directly inline. Affiliate uses a module-level lazy singleton container scoped to its sub-tree (justified in §4)
- Error envelope: `{ data, error }` via `sendError(reply, error)` + `ApiError` class
- Inngest: jobs in `src/jobs/`, barrel `src/jobs/index.ts`, served via `src/routes/inngest.ts` using `inngest/fastify` adapter; client at `src/jobs/client.ts` uses `eventKey: process.env.INNGEST_EVENT_KEY` (undefined OK in dev)
- Sentry global error handler; Axiom global response logger via `onResponse` hook
- Tests: vitest with chainable Supabase mocks; Category C (DB-hitting) tests `describe.skip + // TODO-test` per CLAUDE.md

---

## 3. Target State

### Package upgrades

| Package | From | To |
|---|---|---|
| `@tn-figueiredo/affiliate` | not installed | `0.4.0` (`--save-exact`) |

That's it for 2A package install. Other affiliate-derivative packages enter in 2C+.

### Environment variable inventory (all deferrable in 2A)

| Var | Status | Required for | If absent |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | ✓ Phase 1 | `AFFILIATE_CONFIG.webBaseUrl` (used by emails + redirect) | falls back to `https://brighttale.io` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ existing | Repository | container init throws on first request — must be set |
| `SUPABASE_ACCESS_TOKEN` | ✓ existing (root `.env.local`) | `db:push` + `db:types` | dev tooling only — not runtime |
| `RESEND_API_KEY` | optional, deferrable | `ResendAffiliateEmailService` | email service no-ops via `isResendConfigured()` guard; affiliate flows continue without email side-effects |
| `RESEND_FROM` | optional | Resend `from` field | falls back to `BrightTale <noreply@brighttale.io>` |
| `AFFILIATE_ADMIN_EMAIL` | optional, deferrable | recipient for new-application admin notifications | falls back to `admin@brighttale.io` (irrelevant if Resend unconfigured) |
| `INNGEST_EVENT_KEY` | optional, deferrable | Inngest cloud event auth | dev: cron registers via `inngest-cli dev` without it; prod: cron does **not** register, expire flow deferred until set |
| `INNGEST_SIGNING_KEY` | optional, deferrable | Inngest cloud webhook verification | same as above |
| `EMAIL_PROVIDER` | future (2F+) | provider dispatch (`resend\|smtp`) | not used in 2A |

**No new env var is hard-required to deploy 2A.** Setting them activates feature side-effects (emails sent, cron fires). Code paths are designed to degrade silently — every email call checks `isResendConfigured()` first; the cron simply does not register if Inngest keys are absent in prod.

### Email provider abstraction (forward-compat)

2A uses `ResendAffiliateEmailService` directly importing `sendEmail` from `lib/email/resend.ts`. This is intentional — no provider abstraction layer in 2A. The forward-compat design point is:

- `IAffiliateEmailService` (4 methods) is the **stable port** consumer-side; any impl (Resend, SMTP, SES, log-only) plugs in
- For 2F+ SMTP support: introduce `lib/email/provider.ts` that dispatches `sendEmail(...)` to Resend or SMTP based on `EMAIL_PROVIDER` env var; swap one import line in `email-service.ts`
- No interface breakage; no migration; one new file in 2F

This avoids over-engineering 2A while keeping the swap to one PR later.

---

## 4. Architecture

### Layer responsibility

```
┌─ @tn-figueiredo/affiliate 0.4.0 ────────────────────────────────────┐
│  Domain: 35 use cases (37 declared, 2 unused in 2A), types, errors  │
│  HTTP: registerAffiliateRoutes / AdminRoutes / InternalRoutes /     │
│        RedirectRoute — Fastify-agnostic (MinimalFastify) plugins    │
│  SQL:  5 migrations (10 tables) + RLS policies (service_role bypass) │
│  Interfaces consumer implements:                                    │
│   - IAffiliateRepository (52 methods)                               │
│   - IAffiliateEmailService (4 methods)                              │
│   - IAffiliateTaxIdRepository (3 methods)                           │
│   - IAffiliateFraudDetectionService (1 method, optional)            │
│  Validation: routes validate input internally (no consumer-side    │
│   Zod needed; package returns typed errors via mapAffiliateErrorToHttp) │
└────────────────┬────────────────────────────────────────────────────┘
                 │ consumer wires deps via container
┌─ apps/api ─────┴────────────────────────────────────────────────────┐
│  src/lib/affiliate/                                                 │
│   ├─ repository/                                                    │
│   │  ├─ index.ts                  SupabaseAffiliateRepository       │
│   │  │                            (composes 11 sub-repos via DI;    │
│   │  │                             method-syntax delegations only)  │
│   │  ├─ mappers.ts                camelCase ↔ snake_case for every  │
│   │  │                            entity used in writes             │
│   │  ├─ affiliate-query-repo.ts   9 read/create methods             │
│   │  ├─ affiliate-lifecycle-repo.ts 6 mutation methods              │
│   │  ├─ affiliate-proposals-repo.ts 4 mutation methods              │
│   │  ├─ affiliate-history-repo.ts   2 methods (1 read, 1 write)     │
│   │  ├─ clicks-repo.ts            4 methods                         │
│   │  ├─ referrals-repo.ts         5 methods                         │
│   │  ├─ commissions-repo.ts       4 methods                         │
│   │  ├─ payouts-repo.ts           4 methods                         │
│   │  ├─ pix-repo.ts               4 methods                         │
│   │  ├─ content-repo.ts           3 methods                         │
│   │  ├─ fraud-repo.ts             4 methods                         │
│   │  └─ stats-repo.ts             2 methods                         │
│   ├─ email-service.ts             ResendAffiliateEmailService       │
│   ├─ tax-id-service.ts            StubTaxIdRepository               │
│   ├─ config.ts                    AFFILIATE_CONFIG                  │
│   ├─ auth-context.ts              getAuthenticatedUser + isAdmin    │
│   └─ container.ts                 buildAffiliateContainer (cached)  │
│  src/jobs/affiliate-expire-referrals.ts  Inngest cron 05:00 UTC     │
│  src/index.ts                     Registers 4 helpers under prefixes │
└─────────────────────────────────────────────────────────────────────┘
```

### Container lifecycle (composition root)

Module-level lazy singleton via `let cached`. First call instantiates Supabase client + 35 use cases + 11 sub-repos. Subsequent calls return cached instance. Test seam `__resetAffiliateContainer()` flushes cache between tests. Diverges from existing apps/api per-request `createServiceClient()` convention but is **isolated to the affiliate module** and more efficient for serverless cold-start amortization (constructors are property assignments — nanosecond cost — but avoiding 35× per request reduces noise).

### Repository class — initialization order discipline

The package uses a single `IAffiliateRepository` interface with 52 methods. Splitting into 11 sub-repos keeps each file ≤250 LOC for review-ability. **Critical:** `SupabaseAffiliateRepository` MUST use **method-syntax delegations**, not arrow-field initializers:

```ts
// CORRECT (method syntax — runs after constructor body):
findById(id: string) { return this.query.findById(id) }

// WRONG (arrow-field — runs as class field initializer, BEFORE constructor body
// where this.query is assigned, so this.query is `undefined` at evaluation):
findById = (...args: Parameters<typeof this.query.findById>) => this.query.findById(...args)
```

The arrow-field rest-spread pattern is tempting because it auto-infers types, but TC39 class-field semantics make it explode at runtime. Method syntax requires manually writing 52 one-line delegations — **acceptable and one-time cost**.

### Mappers layer (NEW vs v1)

The package's `IAffiliateRepository` write methods take **camelCase** input shapes (e.g., `createReferral({ affiliateId, affiliateCode, userId, attributionStatus, signupDate, windowEnd, ... })`), but the SQL schemas are snake_case (`affiliate_id, affiliate_code, user_id, attribution_status, signup_date, window_end, ...`). Sub-repos cannot pass camelCase input directly to `sb.from(...).insert(input)` — Postgres rejects unknown columns.

Mirror the project pattern from `packages/shared/src/mappers/db.ts`:

- File: `apps/api/src/lib/affiliate/repository/mappers.ts`
- One bidirectional mapping per entity used in writes: `{Affiliate, AffiliateClick, AffiliateReferral, AffiliateCommission, AffiliatePayout, AffiliatePixKey, AffiliateContentSubmission, AffiliateContractHistoryEntry}`
- Reads: `mapXxxFromDb(row): DomainXxx`
- Writes: `mapXxxToDbInsert(input): DbXxxInsert` — accepts the package's camelCase write shape and returns the snake_case row to insert
- Status enums and JSONB fields pass through unchanged
- All `as any` casts in sub-repos are eliminated by the typed mapper

### Server / Client boundary

apps/api is pure Fastify (Node, no React). Zero RSC concerns. Consumer of routes (`affiliate-admin` UI in 2C) lives in apps/web — separate concern.

### Slug / path contract

Routes registered with explicit prefixes:
- `/affiliate` — end-user (auth required)
- `/admin/affiliate` — admin (auth + isAdmin via `RouteAuthContext`)
- `/internal/affiliate` — service-to-service (auth)
- `/ref` — public redirect (no auth)
- `/affiliate-legacy` — deprecated, lives until 2D

Visible to clients via apps/app rewrite (`/api/* → apps/api`):
- `/api/affiliate/*`, `/api/admin/affiliate/*`, `/api/internal/affiliate/*`, `/api/ref/*`, `/api/affiliate-legacy/*`

### Coexistence strategy

`apps/app/src/app/(app)/settings/affiliate/page.tsx` continues to work during 2A by calling renamed legacy routes (`/api/affiliate-legacy/program`, etc.). 2B will rewrite this page against the new schema; 2D will retire the legacy routes + drop legacy tables.

`affiliate_referrals` (legacy) is renamed to `affiliate_referrals_legacy` to free the namespace for the package's own `affiliate_referrals` table. `affiliate_programs` keeps its name (no collision — package uses `affiliates`). The legacy table's foreign keys remain intact across the rename (Postgres FKs reference table OID, not name).

### Provider hierarchy / observability

- Axiom logging via `onResponse` hook (global, existing) — automatic
- Sentry error handling via `setupFastifyErrorHandler` (global, existing); `mapAffiliateErrorToHttp` (exported by package) translates package-typed errors into HTTP statuses **inside route handlers** (called by package-side, transparent to consumer)
- Inngest cron failure → Inngest's built-in retry (`retries: 2`) + Inngest cloud surfaces failures in its UI; we additionally add a Sentry breadcrumb + Axiom log inside the cron's catch block (NEW vs v1)
- PostHog custom events not added in 2A (deferred to 2B/2C)

---

## 5. Data Layer

### Migrations to apply (7 total in 2A.1)

```
20260417000000_rename_legacy_affiliate_referrals.sql        bright-tale
20260417000001_affiliate_001_schema.sql                      package (renamed in copy)
20260417000002_affiliate_002_payouts.sql                     package
20260417000003_affiliate_003_pix_content.sql                 package
20260417000004_affiliate_004_contract.sql                    package
20260417000005_affiliate_005_supabase.sql                    package
20260417000006_affiliate_triggers_counters.sql               bright-tale
```

**Tables created (10):**

- 001: `affiliates`, `affiliate_clicks`, `affiliate_referrals`
- 002: `affiliate_commissions`, `affiliate_payouts`
- 003: `affiliate_pix_keys`, `affiliate_content_submissions`
- 004: `affiliate_contract_history`, `affiliate_fraud_flags`, `affiliate_risk_scores`
- 005: no new tables — adds FKs to `auth.users` + enables RLS + creates `service_role_all` policies on all 10 tables

**No `affiliate_social_links` table exists** (v1 spec error). The `affiliates` table has a `social_links JSONB DEFAULT '[]'` column — that's the entire surface.

**RLS:** package's `005_fk_supabase.sql` enables RLS on all 10 tables it created and adds `service_role_all` policies (each `TO service_role USING (true) WITH CHECK (true)`). No consumer-side RLS gap to fill.

**`updated_at` triggers** (CLAUDE.md convention; package adds `updated_at` columns but no `moddatetime` triggers): consumer migration `20260417000006` adds triggers on the **4 tables that have `updated_at` columns**:

1. `affiliates`
2. `affiliate_pix_keys`
3. `affiliate_content_submissions`
4. `affiliate_risk_scores` ← **NEW vs v1 (was missed)**

Other tables (`affiliate_clicks`, `affiliate_referrals`, `affiliate_commissions`, `affiliate_payouts`, `affiliate_contract_history`, `affiliate_fraud_flags`) have only `created_at` — no trigger needed.

**Atomic counter functions** (NEW vs v1 — corrected column names): `20260417000006` also defines 3 PG functions called by sub-repos for race-safe increments. These hit the `total_clicks`, `total_referrals`, `total_conversions`, and `total_earnings_brl` columns (verified against `001_schema.sql`):

```sql
CREATE OR REPLACE FUNCTION public.increment_affiliate_clicks(aff_id uuid)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  UPDATE public.affiliates SET total_clicks = total_clicks + 1 WHERE id = aff_id;
$$;
-- (same shape for total_referrals; total_conversions takes earnings_brl integer arg)
```

`SET search_path` mitigates the SECURITY DEFINER attack surface (prevents shadowing of `affiliates` by a malicious schema in caller's path).

After migrations: `npm run db:types` regenerates `packages/shared/src/types/database.ts` with the 10 new tables.

### Repository composition (verified against `IAffiliateRepository`)

`SupabaseAffiliateRepository` is a single class implementing `IAffiliateRepository`. It composes 11 sub-repo factories via constructor DI:

```ts
export class SupabaseAffiliateRepository implements IAffiliateRepository {
  private query: ReturnType<typeof createQueryRepo>
  private lifecycle: ReturnType<typeof createLifecycleRepo>
  // ... 9 more sub-repo references

  constructor(private sb: SupabaseClient<Database>) {
    this.query = createQueryRepo(sb)
    this.lifecycle = createLifecycleRepo(sb)
    // ... 9 more
  }

  // 52 method-syntax delegations (NOT arrow-field — see §4 init-order note):
  findById(id: string) { return this.query.findById(id) }
  findByCode(code: string) { return this.query.findByCode(code) }
  // ... 50 more
}
```

Each sub-repo factory returns `{ method1, method2, ... }`. Total ~1300 LOC across 11 files + index + mappers; nothing larger than ~250 LOC.

Sub-repo signatures match the package's `IAffiliateRepository` interface exactly. Key shape corrections vs v1:

| Method | v1 (wrong) | v2 (verified from package) |
|---|---|---|
| `expirePendingReferrals(today)` | returned `{ totalExpired }`, used `created_at < today - 30d`, `today: Date` | returns `Promise<number>`, uses `window_end < today AND attribution_status IN ('active', 'pending_contract')`, `today: string` |
| `getStats(affiliateId)` | returned `{ clicks, referrals, conversions, totalEarningsBrl }` | returns `{ pendingPayoutBrl, paidPayoutBrl }` (aggregated from `affiliate_payouts.total_brl` GROUP BY status) |
| `pause(id, options)` | options shape `{ reason }` | options shape `{ skipAudit?: boolean }` |
| `updatePayoutStatus(id, status, meta)` | meta keys snake_case | meta keys camelCase: `{ reviewedAt?, completedAt?, adminNotes? }` |
| `addContractHistory(entry)` | entry shape `{ affiliate_id, action, performed_by, details }` | entry shape camelCase: `{ affiliateId, action, oldTier?, newTier?, oldCommissionRate?, newCommissionRate?, oldFixedFeeBrl?, newFixedFeeBrl?, oldStatus?, newStatus?, oldContractEndDate?, newContractEndDate?, performedBy?, notes?, contractVersion?, acceptedIp?, acceptedUa? }` |
| `createReferral(input)` | input snake_case | input camelCase incl. `attributionStatus, signupDate, windowEnd` |
| `createClick(input)` | input snake_case | input camelCase incl. `affiliateId, affiliateCode, ipHash, userAgent, landingUrl, utmSource, utmMedium, utmCampaign, sourcePlatform, deviceType` |
| `addPixKey(input)` | input snake_case | input camelCase: `{ affiliateId, keyType, keyValue, keyDisplay, isDefault, label? }` |
| `submitContent(input)` | input snake_case | input camelCase: `{ affiliateId, platform, contentType, url, title?, description?, postedAt? }` |
| `createCommission(input)` | input snake_case | input camelCase (`Omit<AffiliateCommission, 'id'\|'createdAt'>`) |
| `createPayout(input)` | input snake_case | input camelCase (`Omit<AffiliatePayout, 'id'\|'requestedAt'>`) |
| `reviewContent(submissionId, status, notes)` | status type `string`, return `void` | status type `'approved'\|'rejected'`, return `Promise<AffiliateContentSubmission>` |
| `updateFraudFlagStatus(flagId, status, notes)` | return `void` | return `Promise<AffiliateFraudFlag>` |

**All other methods match v1 shape.** The 13 corrections above drive the mappers in `mappers.ts` (Appendix D).

---

## 6. Routes + Container + Cron

### Container (`src/lib/affiliate/container.ts`)

See Appendix A.1 for full skeleton — **all 5 use-case constructor signatures corrected vs v1**:

| Use case | v1 spec (wrong) | v2 (verified) |
|---|---|---|
| `CalculateAffiliateCommissionUseCase` | `(repo)` | `(repo, config: Pick<AffiliateConfig, 'tierRates'>)` |
| `ApproveAffiliateUseCase` | `(repo, email, taxId)` | `(repo, emailService, config: Pick<AffiliateConfig, 'webBaseUrl'>, taxIdRepo?)` |
| `AttributeSignupToAffiliateUseCase` | `(repo, undefined)` | `(repo, config: Pick<AffiliateConfig, 'webBaseUrl'>, fraudDetectionService?)` |
| `ProposeContractChangeUseCase` | `(repo, email)` | `(repo, emailService, config: Pick<AffiliateConfig, 'webBaseUrl' \| 'tierRates'>)` |
| `CreateAffiliatePayoutUseCase` | `(repo, taxId)` | `(repo, taxIdRepo, config: Pick<AffiliateConfig, 'minimumPayoutCents' \| 'currentContractVersion'>)` |

Other constructors are single-arg `(repo)` or unchanged from v1.

Key points:
- Module-level `let cached`; lazy init on first `buildAffiliateContainer()` call
- Test seam `__resetAffiliateContainer()` to flush between tests (call in vitest `beforeEach` when testing container)
- Exposes `endUserDeps` (16 use cases including auth context), `adminDeps` (17), `internalDeps` (1), plus standalone `trackClickUseCase` for redirect handler
- Fraud passed `undefined` (optional in `AttributeSignupToAffiliate`); 2E swaps real impl
- **35 use cases instantiated** (`CreateInternalAffiliateUseCase` and `VerifySocialLinksUseCase` exist in package but are not wired in 2A — admin-only flows handled in 2C/2E)

### Auth context (`src/lib/affiliate/auth-context.ts`)

`getAuthenticatedUser(request)` → `{ id }` from `request.userId` (populated by `authenticate` middleware after stripping client-supplied `x-user-id` header in apps/app middleware). Throws `ApiError(401)` if missing.

`isAdmin(request)` → boolean via inline Supabase query against the **verified-existing** `user_roles` table (`20260411030000_user_roles.sql`):

```sql
-- table: user_roles(id bigserial pk, user_id uuid, role text check (role in ('admin','user')), created_at)
```

No cache (matches apps/api convention; performance acceptable for MVP — one DB roundtrip per admin route call). Acceptable because admin routes are rarely called by humans. Considered for caching in 2C if hot path emerges.

### Route registration in `src/index.ts`

Each helper registered in its own `app.register(...)` scope with prefix and `preHandler` hook. All affiliate routes registered together near the existing legacy register (line ~184):

```ts
import {
  registerAffiliateRoutes,
  registerAffiliateAdminRoutes,
  registerAffiliateInternalRoutes,
  registerAffiliateRedirectRoute,
} from '@tn-figueiredo/affiliate/routes'
import { buildAffiliateContainer } from './lib/affiliate/container.js'
import { affiliateLegacyRoutes } from './routes/affiliate-legacy.js'

const affiliateContainer = buildAffiliateContainer()

server.register(async (scope) => {
  registerAffiliateRedirectRoute(scope as never, {
    webBaseUrl: affiliateContainer.config.webBaseUrl,
    trackClickUseCase: affiliateContainer.trackClickUseCase,
  })
}, { prefix: '/ref' })

server.register(async (scope) => {
  scope.addHook('preHandler', authenticate)
  registerAffiliateRoutes(scope as never, affiliateContainer.endUserDeps)
}, { prefix: '/affiliate' })

server.register(async (scope) => {
  scope.addHook('preHandler', authenticate)
  registerAffiliateAdminRoutes(scope as never, affiliateContainer.adminDeps)
}, { prefix: '/admin/affiliate' })

server.register(async (scope) => {
  scope.addHook('preHandler', authenticate)
  registerAffiliateInternalRoutes(scope as never, affiliateContainer.internalDeps)
}, { prefix: '/internal/affiliate' })

server.register(affiliateLegacyRoutes, { prefix: '/affiliate-legacy' })
```

`as never` cast resolves the `MinimalFastify` → full `FastifyInstance` interface mismatch. The package's `MinimalFastify` declares only `get/post/put/delete/addHook(name, fn: unknown)` — Fastify's full interface is a strict superset. The cast is one-way safe; runtime calls succeed.

The package handles request validation internally (no consumer Zod schemas needed at the Fastify route level). `mapAffiliateErrorToHttp` translates package-typed errors to HTTP status codes inside route handlers; consumer's Sentry handler picks them up post-mapping.

### Email service (`src/lib/affiliate/email-service.ts`)

`ResendAffiliateEmailService` implements 4 methods of `IAffiliateEmailService`. Each method:

1. Returns early if `!isResendConfigured()` (no-op when `RESEND_API_KEY` unset)
2. Renders HTML using inline string template, **with all user-controlled inputs escaped via `escapeHtml()` helper** (XSS hardening — NEW vs v1)
3. Calls `sendEmail({ to, subject, html })` from `lib/email/resend.ts`; catches and re-throws errors so the use case can decide rollback semantics

The 4 methods (signatures verified against `IAffiliateEmailService`):

```ts
sendAffiliateApplicationReceivedAdmin(data: {
  name: string; email: string; channelPlatform: string; channelUrl: string;
  subscribersCount?: number; suggestedCode?: string; notes?: string;
}): Promise<void>;

sendAffiliateApplicationConfirmation(email: string, name: string): Promise<void>;

sendAffiliateApprovalEmail(
  email: string, name: string, tier: AffiliateTier, commissionRate: number,
  portalUrl: string, fixedFeeBrl?: number | null,
): Promise<void>;

sendAffiliateContractProposalEmail(
  email: string, name: string,
  currentTier: AffiliateTier, currentRate: number,
  proposedTier: AffiliateTier, proposedRate: number,
  portalUrl: string, notes?: string,
  currentFixedFeeBrl?: number | null, proposedFixedFeeBrl?: number | null,
): Promise<void>;
```

`AFFILIATE_ADMIN_EMAIL` env var (default `admin@brighttale.io`) is the recipient for new-application notifications. Resolved at call time (not at module load) so a test can override `process.env.AFFILIATE_ADMIN_EMAIL` per test.

`escapeHtml` is a 4-line helper that replaces `& < > " '` with HTML entities. URL fields (`channelUrl`, `portalUrl`) are also URL-validated (`new URL(s)` throws → fall back to `#` and prepend a warning to the body). See Appendix A.3.

### Tax ID stub (`src/lib/affiliate/tax-id-service.ts`)

`StubTaxIdRepository` (~15 LOC) returns no-op responses:

- `findByEntity()` always returns `null`
- `save()` no-op
- `getStatus()` always returns `{ status: 'regular' }`

Real impl (Receita Federal API) is out of scope. **Compliance gap registered as R8** (high severity — affiliates can register PIX/payouts without fiscal validation in 2A).

### Inngest cron (`src/jobs/affiliate-expire-referrals.ts`)

```ts
import { inngest } from './client.js'
import { buildAffiliateContainer } from '../lib/affiliate/container.js'

type StepRun = (name: string, fn: () => Promise<unknown>) => Promise<unknown>

export const affiliateExpireReferrals = inngest.createFunction(
  {
    id: 'affiliate-expire-referrals',
    retries: 2,
    triggers: [{ cron: '0 5 * * *' }],     // 05:00 UTC = 02:00 BRT (Brazil DST abolished 2019; year-round stable)
  },
  async ({ step }: { step: { run: StepRun } }) => {
    const container = buildAffiliateContainer()
    const totalExpired = (await step.run('expire-pending-referrals', async () => {
      // Use case signature: ExpirePendingReferralsUseCase.execute(today: string) → Promise<number>
      return container.expirePendingUseCase.execute(new Date().toISOString())
    })) as number
    return { totalExpired, ranAt: new Date().toISOString() }
  }
)
```

**Cron expression rationale:** Inngest does not support the `TZ=...` cron prefix shown in v1 spec — it would be rejected at registration. Brazil abolished DST in 2019 (Decreto 9.772/2019), so 02:00 BRT == 05:00 UTC year-round. Plain UTC cron is correct and stable.

**Failure observability** (NEW vs v1): the cron wraps `step.run` in a try/catch that logs to Axiom and reports to Sentry on failure before re-throwing (so Inngest's retry semantics still apply). See Appendix A.6 for skeleton.

Register: add to `src/jobs/index.ts` barrel + `src/routes/inngest.ts` `functions: [...]` array.

### URL surface (final, public-visible)

| Helper | URLs (after `/api/` rewrite) |
|---|---|
| `/ref` (public) | `GET /api/ref/:code` |
| `/affiliate` (auth, 16 routes) | `POST /apply`, `GET /me`, `GET /stats`, `GET /me/commissions`, `GET /referrals`, `GET /clicks-by-platform`, `POST /payouts`, `PUT /profile`, `GET /pix-keys`, `POST /pix-keys`, `PUT /pix-keys/:keyId/default`, `DELETE /pix-keys/:keyId`, `POST /content-submissions`, `POST /accept-proposal`, `POST /reject-proposal` |
| `/admin/affiliate` (auth + isAdmin, 16 routes) | `GET /`, `GET /:id`, `GET /pending-contracts`, `GET /payouts`, `GET /fraud-flags`, `GET /risk-scores`, `POST /:id/approve`, `POST /:id/pause`, `POST /:id/renew`, `POST /:id/propose-change`, `POST /:id/cancel-proposal`, `POST /fraud-flags/:flagId/resolve`, `POST /:id/payouts/:payoutId/{approve\|reject\|complete}`, `PUT /content-submissions/:submissionId/review` |
| `/internal/affiliate` (auth) | `POST /expire-pending` |
| `/affiliate-legacy` (auth, deprecated) | `GET /program`, `POST /program`, `GET /referrals` |

---

## 7. Stages

Branch: `feat/affiliate-2a-foundation` from `staging` (Phase 1 merged).

### 2A.0 — Branch + verification gates

Create branch + tag `pre-affiliate-2a`. Verify package source by extracting tarball and reviewing migrations + dist types (Task 0.2 of plan). Verify `user_roles` table exists locally. **No code yet.**

### 2A.1 — Foundation

Install package, apply 7 migrations, regenerate types, scaffold repo skeleton (all 52 methods throw `not_impl_2a1`) using **method-syntax**, create mappers file, rename legacy table + routes, update `apps/app/(app)/settings/affiliate/page.tsx` to call `/api/affiliate-legacy/*`.

**Accept (3 manual smoke + 1 typecheck):** all 7 migrations apply clean (rerun-safe via `IF NOT EXISTS` + `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object`); types regenerate with new tables; legacy settings page still works in browser; `npm run typecheck` clean.

### 2A.2 — Lifecycle + Email + Tax stub + Container partial (NO routes)

Implement `affiliate-query-repo`, `affiliate-lifecycle-repo`, `affiliate-history-repo` (18 methods total). Implement `email-service` (with HTML escape + Resend guard), `tax-id-service`, `auth-context`, `config`. Container exports 6 use cases. **No routes registered** (TS interface for `AffiliateRouteDeps` requires 16 use cases — defer route registration to 2A.4).

**Accept (4 smoke):** unit tests pass; direct use case invocation (one-shot tsx) creates affiliate row; if `RESEND_API_KEY` set, email arrives, otherwise log shows `isResendConfigured=false, skipping`; `isAdmin` returns true for a row in `user_roles` and false otherwise.

**Operator action (deferred):** add `AFFILIATE_ADMIN_EMAIL` to `apps/api/.env.local` only if testing email side; not required to commit Phase 2A.2.

### 2A.3 — Tracking + Cron + Internal/Redirect routes

Implement `clicks-repo`, `referrals-repo`, `commissions-repo` (13 methods, with mappers). Add 5 more use case instances to container (`TrackAffiliateLinkClickUseCase`, `AttributeSignupToAffiliateUseCase`, `CalculateAffiliateCommissionUseCase`, `ExpirePendingReferralsUseCase`, `GetAffiliateClicksByPlatformUseCase`). Register `/ref` (public) + `/internal/affiliate` (auth — only needs 1 use case + auth context). Add Inngest cron job with failure observability.

**Accept (3 smoke):** `GET /api/ref/CODE` redirects + tracks (row appears in `affiliate_clicks`, `total_clicks` counter increments); `POST /api/internal/affiliate/expire-pending` returns 200 with `{data: { totalExpired: N }, error: null}`; Inngest dev server lists `affiliate-expire-referrals` cron with `0 5 * * *` schedule.

### 2A.4 — Payouts + PIX + Content + Fraud + Proposals + END-USER + ADMIN routes

Implement remaining 6 sub-repos (21 methods, with mappers). Container completes with all 35 use cases. Register `/affiliate` (16-use-case interface satisfied) and `/admin/affiliate` (17-use-case interface satisfied).

**Accept (5 smoke):** `POST /api/affiliate/apply` creates affiliate (201 + payload has `id` and `code`); `POST /api/affiliate/pix-keys` adds key; `GET /api/admin/affiliate/` returns overview; `POST /api/admin/affiliate/:id/approve` transitions status; non-admin user gets 403 on admin route.

### 2A.5 — Smoke integration + Config review + `.env.example` + Deprecation

Operator validates `AFFILIATE_CONFIG` values (tier rates, min payout). Add `@deprecated` JSDoc to `affiliate-legacy.ts`. Update `apps/api/.env.local.example` to document the 4 deferrable env vars. **Manual smoke checklist (12 items)** — Category C integration test added but `describe.skip` per CLAUDE.md.

**Accept (12 manual smoke):** complete affiliate lifecycle via API: apply → email (if Resend set) → admin approve → tracking → attribute signup → calculate commission → payout request → admin approve payout → cron expire (if Inngest set; else manual `POST /internal/expire-pending`).

### 2A.6 — Staging deploy + soak + prod gate (NEW)

Push branch, open PR to `staging`, merge after CI green + review. Deploy to staging environment. Soak **48h minimum** monitoring Axiom (no `affiliate.*` errors), Sentry (no unhandled exceptions in affiliate module), Inngest (cron registered if keys set). After soak, deploy to prod via standard release process. Set Resend + Inngest env vars in Vercel prod when ready to activate emails + cron (see operator-action checklist in 2A.5).

**Accept:** 48h staging soak produces no affiliate-related errors; prod deploy succeeds; legacy `/api/affiliate-legacy/*` routes still respond 200 to existing users; new `/api/affiliate/*` routes respond 404 or 401 for users without affiliate accounts (correct — apply flow not yet UI-integrated until 2B).

---

## 8. Configuration

### `AFFILIATE_CONFIG` (placeholder values, product review at 2A.5)

```ts
{
  minimumPayoutCents: 5000,                  // R$ 50,00
  tierRates: {
    nano: 0.15, micro: 0.20, mid: 0.25, macro: 0.30, mega: 0.35,
  },
  currentContractVersion: 1,
  webBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://brighttale.io',
  appStoreUrl: 'https://brighttale.io',
}
```

Tier thresholds (referred-revenue acumulado por tier) deferred to product/business decision; package's logic uses `tierRates` lookup map. If thresholds need explicit modeling (out of package's scope), 2A.5 can introduce a `tierThresholds` consumer-side helper.

### Operator action checklist (post-merge, when activating features)

| Feature | Env var(s) to set | Where | Ready when |
|---|---|---|---|
| Application admin notification | `RESEND_API_KEY`, `AFFILIATE_ADMIN_EMAIL`, `RESEND_FROM` (optional) | `apps/api/.env.local` (dev) + Vercel apps/api prod | Resend domain verified for SPF/DKIM |
| Approval / proposal emails to applicants | same | same | same |
| Daily cron `affiliate-expire-referrals` | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Vercel apps/api prod | Inngest cloud account + app created |
| Production redirect target | `NEXT_PUBLIC_APP_URL` | Vercel apps/api prod | already set in Phase 1 |

Until each row's env vars are set, the corresponding feature is silently inert. Code paths handle absence gracefully.

---

## 9. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Package migrations ordering conflict | Low | Timestamps `20260417000001-6` after last existing — clean |
| R2 | apps/app affiliate page breaks during 2A.1 rename | Medium | 2A.1 atomic commit includes apps/app + apps/api + migrations |
| R3 | Container module-level diverges from per-request convention | Low | Isolated to affiliate module; test seam `__resetAffiliateContainer()` |
| R4 | Repository ~1300 LOC hard to review | Medium | Split into 11 sub-repos (<250 LOC each) + mappers separated |
| R5 | `affiliate-admin` 2C requires 4 actions with no package route (`revalidateTaxId`, `addSocialLink`, `deleteSocialLink`, `verifySocialLinks`) | Medium | Concern of 2C — spec 2C decides between skip / custom routes / upstream PR (`VerifySocialLinksUseCase` exists in package but no HTTP wire) |
| R6 | Migrations applied in prod without prior testing = data trapped | **High** | Mandatory 48h staging gap (Phase 2A.6); Appendix C rollback SQL prepared and tested locally before prod push |
| R7 | Legacy `affiliate_referrals_legacy` orphan post-2D | Low | 2D spec handles drop or archival |
| R8 | Tax ID stub returns 'regular' = affiliates can register PIX/payouts without fiscal validation | **High (compliance)** | Accept gap in 2A; 2F implements Receita Federal API or blocks payouts >R$X. Document in LGPD/compliance log |
| R9 | Fraud service `undefined` = self-referral check skipped → affiliate can refer self | Medium | Accept gap in 2A; 2E implements. Interim: admin manual review before approve |
| R10 | Container init at module load fails if `SUPABASE_SERVICE_ROLE_KEY` absent in deploy | Medium | Lazy init via `let cached` mitigates (init on first request, not import time); clear error message bubbles via Sentry |
| R11 | 16+17 use cases instantiated each cold start = warmup latency | Low | Constructors are nanosecond-scale property assignments — non-bottleneck |
| R12 | Inngest cron `0 5 * * *` UTC drifts if Brazil reintroduces DST | Low | Brazil abolished DST 2019 (Decreto 9.772). If re-enacted: change to `0 5 * * *` is unaffected during BRT standard; otherwise update cron in <5 min |
| R13 | `npm run db:types` rewrites `packages/shared/src/types/database.ts` — merge conflicts if parallel migrations | Low | Branch stable during 2A; manual conflict resolution if other migrations land |
| R14 | **Env vars deferred → emails + cron inert until set in prod** | Low–Medium | Documented in §3 + §8 operator-action checklist. Code paths degrade silently (`isResendConfigured()` guard; cron registration absent). Deploy is safe; feature partial. |
| R15 | **Click fraud on `/ref/:code` (public, no rate-limit) — affiliate can spam own code** | **High (financial)** | Accepted in 2A; documented. Mitigations: (a) 2E adds proper fraud detection; (b) interim: admin reviews `total_clicks` vs `total_referrals` ratio before each payout approval; (c) Fastify-side rate-limit can be added in <1d patch if abuse detected (option flagged in plan Troubleshooting) |
| R16 | **No idempotency token on `POST /payouts` — network retry creates duplicate payouts** | **High (financial)** | Accepted in 2A; documented. Mitigations: (a) admin approval gate catches dupes (manual review); (b) DB-level dedupe via `commission_ids` overlap check could be added if abuse detected; (c) 2F payout overhaul addresses systematically |
| R17 | **HTML XSS in admin emails (applicant-controlled `name`/`channelUrl`)** | Medium | Mitigated in 2A: `escapeHtml()` on every interpolated user-controlled field; URL validation (`new URL(s)`) on href attributes — invalid URLs rendered as `#` with warning text |
| R18 | **`isAdmin` reads `user_roles` per request — N+1 if admin route is hot** | Low | Acceptable for MVP; admin routes are human-driven low-frequency. If hot path emerges in 2C, add 60s in-memory LRU cache (~10 LOC) |
| R19 | **Counter migration column-name drift** (was the v1-spec error this rewrite fixes) | Low | Plan Task 0.2 verifies package source; migration `20260417000006` references verified column names; integration smoke item 7 confirms counters increment |
| R20 | **Mappers drift if package adds new fields in minor version bump** | Medium | `--save-exact` pin in package.json; CHANGELOG review required before any version bump; integration smoke catches missing field mapping (insert returns Postgres error) |

---

## 10. Out of Scope (reiterated)

See §1 Non-goals.

---

## 11. Phase 2 Handoff Notes

### For 2B (end-user UI rewrite)
- Routes `/api/affiliate/*` ready after 2A.4
- `apps/app/(app)/settings/affiliate/page.tsx` rewrite against new schema (tier, contract, PIX keys, content submissions)
- Legacy routes still alive — 2B uses new routes; legacy retires in 2D

### For 2C (admin UI adoption)

> **Update 2026-04-17:** Phase 2C plan and spec are now shipped. See
> `docs/superpowers/specs/2026-04-17-affiliate-2c-admin-ui-design.md` and
> `docs/superpowers/plans/2026-04-17-affiliate-2c-admin-ui.md`. The 4 orphan
> actions from the `AffiliateAdminActions` contract are formally skipped in
> 2C and tracked via `apps/web/src/app/zadmin/(protected)/affiliates/TODO-2F.md`.

- Routes `/api/admin/affiliate/*` ready after 2A.4
- 4 admin Provider actions have no package route (`revalidateTaxId`, `addSocialLink`, `deleteSocialLink`, `verifySocialLinks`) — 2C decides: skip / custom routes / upstream PR (`VerifySocialLinksUseCase` is in the package; no HTTP wire)
- Phase 1 admin layout config (`apps/web/src/lib/admin-layout-config.tsx`) gets new section: `{ label: 'Afiliados', path: adminPath('/affiliates'), icon: 'Users2' }`

### For 2D (data migration + cutover)
- Mapping `affiliate_programs.{user_id, code, commission_pct}` → `affiliates.{user_id, code, commission_rate}`
- Mapping `affiliate_referrals_legacy.{referred_org_id, status}` → `affiliate_referrals.{user_id (lookup org→primary user), …}` + derived `affiliate_commissions`. **Known unknown:** orgs with multiple owners — pick primary user via `org_memberships.created_at ASC LIMIT 1` (existing convention in `affiliate.ts:13-19`); document mapping in 2D spec
- Post-cutover: drop legacy tables, delete `routes/affiliate-legacy.ts`, remove `/api/affiliate-legacy/*` calls in apps/app

### For 2E (fraud detection)
- `IAffiliateFraudDetectionService` interface awaits implementation via `@tn-figueiredo/fraud-detection@0.2.0`
- Container 2A passes `undefined` for `AttributeSignupToAffiliateUseCase` — 2E substitutes real impl
- 2E should also add Fastify rate-limit on `/ref/:code` (R15)

### For 2F (billing + payout automation + tax + email-provider)
- `CalculateAffiliateCommissionUseCase` wired in 2A but only triggers if billing webhook calls it
- Existing `apps/api/src/routes/billing.ts` (448 LOC custom Stripe + MercadoPago) needs decision: full migration to `@tn-figueiredo/billing@0.2.1` (mega-project) OR retain custom + add hook calling `CalculateAffiliateCommissionUseCase`. 2F spec decides
- Receita Federal Tax ID validation API replaces `StubTaxIdRepository` (R8)
- Idempotency tokens on `POST /payouts` (R16)
- Email provider abstraction: introduce `apps/api/src/lib/email/provider.ts` dispatching to Resend or SMTP based on `EMAIL_PROVIDER` env var; swap one import line in `affiliate/email-service.ts`. Add new env vars `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

---

## 12. References

- Affiliate package README + CHANGELOG: `npm.pkg.github.com/@tn-figueiredo/affiliate/0.4.0`
- Affiliate-admin package: `npm.pkg.github.com/@tn-figueiredo/affiliate-admin/0.3.3`
- Phase 1 spec: `docs/superpowers/specs/2026-04-16-admin-062-upgrade-design.md`
- Existing custom affiliate impl: `apps/api/src/routes/affiliate.ts`, `supabase/migrations/20260414040000_publishing_destinations.sql`
- `user_roles` migration: `supabase/migrations/20260411030000_user_roles.sql`
- Existing mapper pattern reference: `packages/shared/src/mappers/db.ts`
- Existing Inngest job pattern reference: `apps/api/src/jobs/reference-check.ts`
- TNF ecosystem architecture: `/Users/figueiredo/Workspace/TNF_Ecosystem_Architecture.md`

---

## Appendix A — Code skeletons (verified)

### A.1 `src/lib/affiliate/container.ts`

```ts
import {
  ApplyAsAffiliateUseCase, ApproveAffiliateUseCase, PauseAffiliateUseCase,
  GetMyAffiliateUseCase, GetMyCommissionsUseCase, GetAffiliateStatsUseCase,
  GetAffiliateReferralsUseCase, TrackAffiliateLinkClickUseCase,
  AttributeSignupToAffiliateUseCase, CalculateAffiliateCommissionUseCase,
  UpdateAffiliateProfileUseCase, ExpirePendingReferralsUseCase,
  CreateAffiliatePayoutUseCase, AddPixKeyUseCase, SetDefaultPixKeyUseCase,
  DeletePixKeyUseCase, ListPixKeysUseCase, SubmitContentUseCase,
  AcceptContractProposalUseCase, RejectContractProposalUseCase,
  GetAffiliateClicksByPlatformUseCase, GetAdminAffiliateOverviewUseCase,
  GetAdminAffiliateDetailUseCase, RenewAffiliateContractUseCase,
  GetPendingContractsAffiliatesUseCase, ProposeContractChangeUseCase,
  CancelProposalUseCase, ApprovePayoutUseCase, RejectPayoutUseCase,
  CompletePayoutUseCase, ListAllPayoutsUseCase, ReviewContentSubmissionUseCase,
  ListAffiliateFraudFlagsUseCase, ListAffiliateRiskScoresUseCase,
  ResolveFraudFlagUseCase, type AffiliateConfig,
} from '@tn-figueiredo/affiliate'
import { createServiceClient } from '@/lib/supabase'
import { SupabaseAffiliateRepository } from './repository'
import { ResendAffiliateEmailService } from './email-service'
import { StubTaxIdRepository } from './tax-id-service'
import { AFFILIATE_CONFIG } from './config'
import { getAuthenticatedUser, isAdmin } from './auth-context'

export type AffiliateContainer = ReturnType<typeof buildAffiliateContainer>
let cached: AffiliateContainer | null = null

export function buildAffiliateContainer() {
  if (cached) return cached

  const sb = createServiceClient()
  const repo = new SupabaseAffiliateRepository(sb)
  const email = new ResendAffiliateEmailService()
  const taxId = new StubTaxIdRepository()
  const config: AffiliateConfig = AFFILIATE_CONFIG

  const trackClickUseCase = new TrackAffiliateLinkClickUseCase(repo, config)
  const expirePendingUseCase = new ExpirePendingReferralsUseCase(repo)

  cached = {
    config, repo,
    trackClickUseCase,
    attributeUseCase: new AttributeSignupToAffiliateUseCase(repo, config, undefined /* fraud — 2E */),
    calcCommissionUseCase: new CalculateAffiliateCommissionUseCase(repo, config),
    expirePendingUseCase,

    endUserDeps: {
      getAuthenticatedUser, isAdmin,
      applyUseCase: new ApplyAsAffiliateUseCase(repo, email, taxId),
      getMyAffiliateUseCase: new GetMyAffiliateUseCase(repo),
      getStatsUseCase: new GetAffiliateStatsUseCase(repo),
      getMyCommissionsUseCase: new GetMyCommissionsUseCase(repo),
      getReferralsUseCase: new GetAffiliateReferralsUseCase(repo),
      createPayoutUseCase: new CreateAffiliatePayoutUseCase(repo, taxId, config),
      updateProfileUseCase: new UpdateAffiliateProfileUseCase(repo),
      addPixKeyUseCase: new AddPixKeyUseCase(repo, taxId),
      setDefaultPixKeyUseCase: new SetDefaultPixKeyUseCase(repo),
      deletePixKeyUseCase: new DeletePixKeyUseCase(repo),
      listPixKeysUseCase: new ListPixKeysUseCase(repo),
      submitContentUseCase: new SubmitContentUseCase(repo),
      acceptProposalUseCase: new AcceptContractProposalUseCase(repo),
      rejectProposalUseCase: new RejectContractProposalUseCase(repo),
      clicksByPlatformUseCase: new GetAffiliateClicksByPlatformUseCase(repo),
      trackClickUseCase,
    },

    adminDeps: {
      getAuthenticatedUser, isAdmin,
      overviewUseCase: new GetAdminAffiliateOverviewUseCase(repo),
      detailUseCase: new GetAdminAffiliateDetailUseCase(repo),
      approveUseCase: new ApproveAffiliateUseCase(repo, email, config, taxId),
      pauseUseCase: new PauseAffiliateUseCase(repo),
      renewUseCase: new RenewAffiliateContractUseCase(repo),
      expirePendingUseCase,
      pendingContractsUseCase: new GetPendingContractsAffiliatesUseCase(repo),
      proposeChangeUseCase: new ProposeContractChangeUseCase(repo, email, config),
      cancelProposalUseCase: new CancelProposalUseCase(repo),
      approvePayoutUseCase: new ApprovePayoutUseCase(repo),
      rejectPayoutUseCase: new RejectPayoutUseCase(repo),
      completePayoutUseCase: new CompletePayoutUseCase(repo),
      listPayoutsUseCase: new ListAllPayoutsUseCase(repo),
      reviewContentUseCase: new ReviewContentSubmissionUseCase(repo),
      listFraudFlagsUseCase: new ListAffiliateFraudFlagsUseCase(repo),
      listRiskScoresUseCase: new ListAffiliateRiskScoresUseCase(repo),
      resolveFraudFlagUseCase: new ResolveFraudFlagUseCase(repo),
    },

    internalDeps: {
      getAuthenticatedUser, isAdmin,
      expirePendingUseCase,
    },
  }
  return cached
}

export function __resetAffiliateContainer(): void { cached = null }
```

### A.2 `src/lib/affiliate/repository/index.ts` (method-syntax — NO arrow-field)

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { createQueryRepo } from './affiliate-query-repo'
import { createLifecycleRepo } from './affiliate-lifecycle-repo'
import { createProposalsRepo } from './affiliate-proposals-repo'
import { createHistoryRepo } from './affiliate-history-repo'
import { createClicksRepo } from './clicks-repo'
import { createReferralsRepo } from './referrals-repo'
import { createCommissionsRepo } from './commissions-repo'
import { createPayoutsRepo } from './payouts-repo'
import { createPixRepo } from './pix-repo'
import { createContentRepo } from './content-repo'
import { createFraudRepo } from './fraud-repo'
import { createStatsRepo } from './stats-repo'

export class SupabaseAffiliateRepository implements IAffiliateRepository {
  private query: ReturnType<typeof createQueryRepo>
  private lifecycle: ReturnType<typeof createLifecycleRepo>
  private proposals: ReturnType<typeof createProposalsRepo>
  private history: ReturnType<typeof createHistoryRepo>
  private clicks: ReturnType<typeof createClicksRepo>
  private referrals: ReturnType<typeof createReferralsRepo>
  private commissions: ReturnType<typeof createCommissionsRepo>
  private payouts: ReturnType<typeof createPayoutsRepo>
  private pix: ReturnType<typeof createPixRepo>
  private content: ReturnType<typeof createContentRepo>
  private fraud: ReturnType<typeof createFraudRepo>
  private stats: ReturnType<typeof createStatsRepo>

  constructor(private sb: SupabaseClient<Database>) {
    this.query = createQueryRepo(sb)
    this.lifecycle = createLifecycleRepo(sb)
    this.proposals = createProposalsRepo(sb)
    this.history = createHistoryRepo(sb)
    this.clicks = createClicksRepo(sb)
    this.referrals = createReferralsRepo(sb)
    this.commissions = createCommissionsRepo(sb)
    this.payouts = createPayoutsRepo(sb)
    this.pix = createPixRepo(sb)
    this.content = createContentRepo(sb)
    this.fraud = createFraudRepo(sb)
    this.stats = createStatsRepo(sb)
  }

  // Query (9)
  findById(id: string) { return this.query.findById(id) }
  findByCode(code: string) { return this.query.findByCode(code) }
  findByUserId(userId: string) { return this.query.findByUserId(userId) }
  findByEmail(email: string) { return this.query.findByEmail(email) }
  isCodeTaken(code: string) { return this.query.isCodeTaken(code) }
  create(input: Parameters<IAffiliateRepository['create']>[0]) { return this.query.create(input) }
  createInternal(input: Parameters<IAffiliateRepository['createInternal']>[0]) { return this.query.createInternal(input) }
  linkUserId(affiliateId: string, userId: string) { return this.query.linkUserId(affiliateId, userId) }
  listAll(options?: Parameters<IAffiliateRepository['listAll']>[0]) { return this.query.listAll(options) }

  // Lifecycle (7)
  approve(id: string, input: Parameters<IAffiliateRepository['approve']>[1]) { return this.lifecycle.approve(id, input) }
  pause(id: string, options?: Parameters<IAffiliateRepository['pause']>[1]) { return this.lifecycle.pause(id, options) }
  terminate(id: string) { return this.lifecycle.terminate(id) }
  updateProfile(affiliateId: string, input: Parameters<IAffiliateRepository['updateProfile']>[1]) { return this.lifecycle.updateProfile(affiliateId, input) }
  updateContract(affiliateId: string, startDate: string, endDate: string) { return this.lifecycle.updateContract(affiliateId, startDate, endDate) }
  addContractHistory(entry: Parameters<IAffiliateRepository['addContractHistory']>[0]) { return this.history.addContractHistory(entry) }
  activateAfterContractAcceptance(id: string) { return this.lifecycle.activateAfterContractAcceptance(id) }

  // Proposals (4)
  proposeContractChange(id: string, input: Parameters<IAffiliateRepository['proposeContractChange']>[1]) { return this.proposals.proposeContractChange(id, input) }
  cancelProposal(id: string) { return this.proposals.cancelProposal(id) }
  acceptProposal(id: string) { return this.proposals.acceptProposal(id) }
  rejectProposal(id: string) { return this.proposals.rejectProposal(id) }

  // History (1 read; addContractHistory above lives logically in history-repo)
  getContractHistory(affiliateId: string) { return this.history.getContractHistory(affiliateId) }

  // Clicks (4)
  incrementClicks(affiliateId: string) { return this.clicks.incrementClicks(affiliateId) }
  createClick(input: Parameters<IAffiliateRepository['createClick']>[0]) { return this.clicks.createClick(input) }
  markClickConverted(clickId: string, userId: string) { return this.clicks.markClickConverted(clickId, userId) }
  getClicksByPlatform(affiliateId: string, days?: number) { return this.clicks.getClicksByPlatform(affiliateId, days) }

  // Referrals (5)
  incrementReferrals(affiliateId: string) { return this.referrals.incrementReferrals(affiliateId) }
  createReferral(input: Parameters<IAffiliateRepository['createReferral']>[0]) { return this.referrals.createReferral(input) }
  findReferralByUserId(userId: string) { return this.referrals.findReferralByUserId(userId) }
  listReferralsByAffiliate(affiliateId: string, options?: Parameters<IAffiliateRepository['listReferralsByAffiliate']>[1]) { return this.referrals.listReferralsByAffiliate(affiliateId, options) }
  expirePendingReferrals(today: string) { return this.referrals.expirePendingReferrals(today) }

  // Commissions (4)
  incrementConversions(affiliateId: string, earningsBrl: number) { return this.commissions.incrementConversions(affiliateId, earningsBrl) }
  createCommission(input: Parameters<IAffiliateRepository['createCommission']>[0]) { return this.commissions.createCommission(input) }
  listPendingCommissions(affiliateId: string) { return this.commissions.listPendingCommissions(affiliateId) }
  markCommissionsPaid(commissionIds: string[], payoutId: string) { return this.commissions.markCommissionsPaid(commissionIds, payoutId) }

  // Payouts (4)
  createPayout(input: Parameters<IAffiliateRepository['createPayout']>[0]) { return this.payouts.createPayout(input) }
  findPayoutById(id: string) { return this.payouts.findPayoutById(id) }
  updatePayoutStatus(id: string, status: Parameters<IAffiliateRepository['updatePayoutStatus']>[1], meta?: Parameters<IAffiliateRepository['updatePayoutStatus']>[2]) { return this.payouts.updatePayoutStatus(id, status, meta) }
  listPayouts(options?: Parameters<IAffiliateRepository['listPayouts']>[0]) { return this.payouts.listPayouts(options) }

  // PIX (4)
  addPixKey(input: Parameters<IAffiliateRepository['addPixKey']>[0]) { return this.pix.addPixKey(input) }
  listPixKeys(affiliateId: string) { return this.pix.listPixKeys(affiliateId) }
  setDefaultPixKey(affiliateId: string, pixKeyId: string) { return this.pix.setDefaultPixKey(affiliateId, pixKeyId) }
  deletePixKey(pixKeyId: string) { return this.pix.deletePixKey(pixKeyId) }

  // Content (3)
  submitContent(input: Parameters<IAffiliateRepository['submitContent']>[0]) { return this.content.submitContent(input) }
  reviewContent(submissionId: string, status: 'approved' | 'rejected', reviewNotes?: string) { return this.content.reviewContent(submissionId, status, reviewNotes) }
  listContentSubmissions(affiliateId: string) { return this.content.listContentSubmissions(affiliateId) }

  // Fraud (4)
  listFraudFlags(options?: Parameters<IAffiliateRepository['listFraudFlags']>[0]) { return this.fraud.listFraudFlags(options) }
  listRiskScores(options?: Parameters<IAffiliateRepository['listRiskScores']>[0]) { return this.fraud.listRiskScores(options) }
  findFraudFlagById(flagId: string) { return this.fraud.findFraudFlagById(flagId) }
  updateFraudFlagStatus(flagId: string, status: Parameters<IAffiliateRepository['updateFraudFlagStatus']>[1], notes?: string) { return this.fraud.updateFraudFlagStatus(flagId, status, notes) }

  // Stats (2)
  getStats(affiliateId: string) { return this.stats.getStats(affiliateId) }
  getPendingContractsCount() { return this.stats.getPendingContractsCount() }
}
```

### A.3 `src/lib/affiliate/email-service.ts` (XSS-safe, Resend-guarded)

```ts
import type { IAffiliateEmailService, AffiliateTier } from '@tn-figueiredo/affiliate'
import { sendEmail, isResendConfigured } from '@/lib/email/resend'

function adminEmail(): string {
  return process.env.AFFILIATE_ADMIN_EMAIL ?? 'admin@brighttale.io'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeUrl(s: string): string {
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '#'
    return escapeHtml(u.toString())
  } catch { return '#' }
}

export class ResendAffiliateEmailService implements IAffiliateEmailService {
  async sendAffiliateApplicationReceivedAdmin(data: {
    name: string; email: string; channelPlatform: string; channelUrl: string
    subscribersCount?: number; suggestedCode?: string; notes?: string
  }): Promise<void> {
    if (!isResendConfigured()) return
    await sendEmail({
      to: adminEmail(),
      subject: `Nova aplicação de afiliado: ${data.name}`,
      html: this.renderApplicationReceivedAdmin(data),
    })
  }

  async sendAffiliateApplicationConfirmation(email: string, name: string): Promise<void> {
    if (!isResendConfigured()) return
    await sendEmail({
      to: email,
      subject: 'Recebemos sua aplicação de afiliado BrightTale',
      html: this.renderApplicationConfirmation(name),
    })
  }

  async sendAffiliateApprovalEmail(
    email: string, name: string, tier: AffiliateTier, commissionRate: number,
    portalUrl: string, fixedFeeBrl?: number | null,
  ): Promise<void> {
    if (!isResendConfigured()) return
    await sendEmail({
      to: email,
      subject: '🎉 Sua aplicação de afiliado foi aprovada',
      html: this.renderApproval(name, tier, commissionRate, portalUrl, fixedFeeBrl ?? null),
    })
  }

  async sendAffiliateContractProposalEmail(
    email: string, name: string,
    currentTier: AffiliateTier, currentRate: number,
    proposedTier: AffiliateTier, proposedRate: number,
    portalUrl: string, notes?: string,
    currentFixedFeeBrl?: number | null, proposedFixedFeeBrl?: number | null,
  ): Promise<void> {
    if (!isResendConfigured()) return
    await sendEmail({
      to: email,
      subject: 'Nova proposta de contrato de afiliado',
      html: this.renderContractProposal(name, currentTier, currentRate, proposedTier, proposedRate, portalUrl, notes, currentFixedFeeBrl ?? null, proposedFixedFeeBrl ?? null),
    })
  }

  // Private renderers — all user-controlled inputs go through escapeHtml/safeUrl
  private renderApplicationReceivedAdmin(d: {
    name: string; email: string; channelPlatform: string; channelUrl: string
    subscribersCount?: number; suggestedCode?: string; notes?: string
  }): string {
    const url = safeUrl(d.channelUrl)
    const subs = d.subscribersCount ? `<p>${d.subscribersCount} inscritos</p>` : ''
    const code = d.suggestedCode ? `<p>Sugestão de código: <code>${escapeHtml(d.suggestedCode)}</code></p>` : ''
    const notes = d.notes ? `<p><em>${escapeHtml(d.notes)}</em></p>` : ''
    return `<h1>Nova aplicação de afiliado</h1>
<p><strong>${escapeHtml(d.name)}</strong> (${escapeHtml(d.email)})</p>
<p>${escapeHtml(d.channelPlatform)}: <a href="${url}">${escapeHtml(d.channelUrl)}</a></p>
${subs}${code}${notes}`
  }

  private renderApplicationConfirmation(name: string): string {
    return `<h1>Olá ${escapeHtml(name)}</h1>
<p>Recebemos sua aplicação de afiliado. Vamos analisar e responder em breve por email.</p>
<p>— Equipe BrightTale</p>`
  }

  private renderApproval(name: string, tier: string, rate: number, portalUrl: string, fee: number | null): string {
    const feeLine = fee ? ` + R$${fee.toFixed(2)} fixo` : ''
    return `<h1>Bem-vindo ao programa de afiliados, ${escapeHtml(name)}! 🎉</h1>
<p>Você foi aprovado no tier <strong>${escapeHtml(tier)}</strong> com comissão de <strong>${(rate * 100).toFixed(0)}%</strong>${feeLine}.</p>
<p><a href="${safeUrl(portalUrl)}">Acessar portal de afiliado →</a></p>
<p>— Equipe BrightTale</p>`
  }

  private renderContractProposal(
    name: string, currentTier: string, currentRate: number,
    proposedTier: string, proposedRate: number, portalUrl: string,
    notes?: string, currentFee?: number | null, proposedFee?: number | null,
  ): string {
    const cf = currentFee ? ` + R$${currentFee.toFixed(2)}` : ''
    const pf = proposedFee ? ` + R$${proposedFee.toFixed(2)}` : ''
    const notesLine = notes ? `<p><em>${escapeHtml(notes)}</em></p>` : ''
    return `<h1>Nova proposta de contrato — ${escapeHtml(name)}</h1>
<p><strong>Atual:</strong> ${escapeHtml(currentTier)} (${(currentRate * 100).toFixed(0)}%${cf})</p>
<p><strong>Proposto:</strong> ${escapeHtml(proposedTier)} (${(proposedRate * 100).toFixed(0)}%${pf})</p>
${notesLine}
<p><a href="${safeUrl(portalUrl)}">Ver proposta no portal →</a></p>`
  }
}
```

### A.4 `src/lib/affiliate/tax-id-service.ts`

```ts
import type { IAffiliateTaxIdRepository } from '@tn-figueiredo/affiliate'

export class StubTaxIdRepository implements IAffiliateTaxIdRepository {
  async findByEntity(_entityType: string, _entityId: string) { return null }
  async save(_data: Parameters<IAffiliateTaxIdRepository['save']>[0]): Promise<void> { /* no-op */ }
  async getStatus(_taxId: string) { return { status: 'regular' as const } }
}
```

### A.5 `src/lib/affiliate/auth-context.ts`

```ts
import type { FastifyRequest } from 'fastify'
import { ApiError } from '@/lib/api/errors'
import { createServiceClient } from '@/lib/supabase'

export async function getAuthenticatedUser(request: unknown): Promise<{ id: string }> {
  const req = request as FastifyRequest
  if (!req.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED')
  return { id: req.userId }
}

export async function isAdmin(request: unknown): Promise<boolean> {
  const req = request as FastifyRequest
  if (!req.userId) return false
  const sb = createServiceClient()
  const { data } = await sb
    .from('user_roles')
    .select('role')
    .eq('user_id', req.userId)
    .eq('role', 'admin')
    .maybeSingle()
  return data?.role === 'admin'
}
```

### A.6 `src/jobs/affiliate-expire-referrals.ts` (with failure observability)

Verified use-case signature: `ExpirePendingReferralsUseCase.execute(today: string): Promise<{ totalExpired: number }>` — returns an **object**, not a number. Sentry is captured by the existing global Fastify error handler + the runtime's uncaught-exception hook (`apps/api/src/instrument.ts`), so `console.error + throw` is sufficient — no explicit `Sentry.captureException` needed. Inngest also surfaces failures in its dashboard.

```ts
import { inngest } from './client.js'
import { buildAffiliateContainer } from '../lib/affiliate/container.js'

type StepRun = (name: string, fn: () => Promise<unknown>) => Promise<unknown>

export const affiliateExpireReferrals = inngest.createFunction(
  {
    id: 'affiliate-expire-referrals',
    retries: 2,
    triggers: [{ cron: '0 5 * * *' }],   // 02:00 BRT (Brazil DST abolished 2019)
  },
  async ({ step }: { step: { run: StepRun } }) => {
    const container = buildAffiliateContainer()
    try {
      const result = (await step.run('expire-pending-referrals', async () => {
        return container.expirePendingUseCase.execute(new Date().toISOString())
      })) as { totalExpired: number }
      return { totalExpired: result.totalExpired, ranAt: new Date().toISOString() }
    } catch (err) {
      console.error('[affiliate-expire-referrals] failed', err)
      throw err  // re-throw so Inngest retry semantics apply; global handlers capture
    }
  }
)
```

### A.7 Migration: `20260417000000_rename_legacy_affiliate_referrals.sql`

```sql
ALTER TABLE public.affiliate_referrals RENAME TO affiliate_referrals_legacy;
COMMENT ON TABLE public.affiliate_referrals_legacy IS
  'Legacy schema renamed in Phase 2A.1; replaced by package affiliate_referrals. To drop in 2D.';
```

### A.8 Migration: `20260417000006_affiliate_triggers_counters.sql`

```sql
-- updated_at triggers (CLAUDE.md convention; package adds columns but no triggers)
-- Tables with updated_at columns: affiliates, affiliate_pix_keys,
-- affiliate_content_submissions, affiliate_risk_scores
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliate_pix_keys
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliate_content_submissions
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliate_risk_scores
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Atomic counter functions (race-safe; columns verified against 001_schema.sql)
CREATE OR REPLACE FUNCTION public.increment_affiliate_clicks(aff_id uuid)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  UPDATE public.affiliates SET total_clicks = total_clicks + 1 WHERE id = aff_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_affiliate_referrals(aff_id uuid)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  UPDATE public.affiliates SET total_referrals = total_referrals + 1 WHERE id = aff_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_affiliate_conversions(aff_id uuid, earnings_brl integer)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  UPDATE public.affiliates
  SET total_conversions = total_conversions + 1,
      total_earnings_brl = total_earnings_brl + earnings_brl
  WHERE id = aff_id;
$$;

REVOKE ALL ON FUNCTION public.increment_affiliate_clicks(uuid)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_affiliate_referrals(uuid)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_affiliate_conversions(uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_affiliate_clicks(uuid)        TO service_role;
GRANT  EXECUTE ON FUNCTION public.increment_affiliate_referrals(uuid)     TO service_role;
GRANT  EXECUTE ON FUNCTION public.increment_affiliate_conversions(uuid, integer) TO service_role;
```

---

## Appendix B — Stage file inventory (per-stage create/modify list)

### 2A.0
- create: branch `feat/affiliate-2a-foundation`, tag `pre-affiliate-2a`
- (no file changes)

### 2A.1
- create: 7 SQL migrations (1 rename + 5 package + 1 triggers/counters)
- modify: `apps/api/package.json`, `package-lock.json` (root)
- create: `apps/api/src/lib/affiliate/repository/{index,11 sub-repos,mappers}.ts` (skeleton — methods throw `not_impl_2a1`; mappers stubs ready)
- rename: `apps/api/src/routes/affiliate.ts` → `affiliate-legacy.ts`; export `affiliateLegacyRoutes`; queries adjusted to `affiliate_referrals_legacy`
- modify: `apps/api/src/index.ts` (legacy register prefix change)
- modify: `apps/app/src/app/(app)/settings/affiliate/page.tsx` (3 fetch URL updates)
- regenerate: `packages/shared/src/types/database.ts`

### 2A.2
- create: `apps/api/src/lib/affiliate/{email-service, tax-id-service, auth-context, config, container}.ts`
- modify: 3 sub-repos: `affiliate-query-repo`, `affiliate-lifecycle-repo`, `affiliate-history-repo` (real impls using mappers)
- create: `__tests__/lib/affiliate/{email-service, tax-id-service}.test.ts` + sub-repo tests

### 2A.3
- modify: 3 sub-repos: `clicks-repo`, `referrals-repo`, `commissions-repo` (real impls using mappers)
- modify: `container.ts` (add 5 use cases — track, attribute, calc, expire, clicksByPlatform)
- modify: `apps/api/src/index.ts` (register `/ref` + `/internal/affiliate`)
- create: `apps/api/src/jobs/affiliate-expire-referrals.ts`
- modify: `apps/api/src/jobs/index.ts` (barrel export), `apps/api/src/routes/inngest.ts` (`functions: [...]` adds new)
- create: sub-repo tests

### 2A.4
- modify: 6 sub-repos: `payouts-repo`, `pix-repo`, `content-repo`, `fraud-repo`, `affiliate-proposals-repo`, `stats-repo`
- modify: `container.ts` (full 35 use cases)
- modify: `apps/api/src/index.ts` (register `/affiliate` + `/admin/affiliate`)
- create: sub-repo tests

### 2A.5
- modify: `apps/api/src/lib/affiliate/config.ts` (operator-validated values)
- modify: `apps/api/src/routes/affiliate-legacy.ts` (`@deprecated` JSDoc)
- create: `apps/api/.env.local.example` (or update existing) — document 4 deferrable env vars
- create: `apps/api/src/__tests__/integration/affiliate-flow.test.ts` (`describe.skip + // TODO-test`)
- modify: this spec doc — add "Status: implemented in commit X" section

### 2A.6
- (no file changes — staging deploy + soak + prod release)

---

## Appendix C — Rollback SQL

If migrations need to be reverted in dev/staging (prod rollback follows the same SQL but requires DBA approval), execute in **reverse order** in a single transaction:

```sql
BEGIN;

-- 20260417000006 (consumer triggers + counters)
DROP FUNCTION IF EXISTS public.increment_affiliate_conversions(uuid, integer);
DROP FUNCTION IF EXISTS public.increment_affiliate_referrals(uuid);
DROP FUNCTION IF EXISTS public.increment_affiliate_clicks(uuid);
DROP TRIGGER IF EXISTS handle_updated_at ON public.affiliate_risk_scores;
DROP TRIGGER IF EXISTS handle_updated_at ON public.affiliate_content_submissions;
DROP TRIGGER IF EXISTS handle_updated_at ON public.affiliate_pix_keys;
DROP TRIGGER IF EXISTS handle_updated_at ON public.affiliates;

-- 20260417000005 (package fk + RLS) — RLS-disable + drop policies + drop FKs
DROP POLICY IF EXISTS "service_role_all" ON public.affiliate_risk_scores;
DROP POLICY IF EXISTS "service_role_all" ON public.affiliate_fraud_flags;
DROP POLICY IF EXISTS "service_role_all" ON public.affiliate_contract_history;
DROP POLICY IF EXISTS "service_role_all" ON public.affiliate_content_submissions;
DROP POLICY IF EXISTS "service_role_all" ON public.affiliate_pix_keys;
DROP POLICY IF EXISTS "service_role_all" ON public.affiliate_payouts;
DROP POLICY IF EXISTS "service_role_all" ON public.affiliate_commissions;
DROP POLICY IF EXISTS "service_role_all" ON public.affiliate_referrals;
DROP POLICY IF EXISTS "service_role_all" ON public.affiliate_clicks;
DROP POLICY IF EXISTS "service_role_all" ON public.affiliates;

ALTER TABLE public.affiliate_referrals DROP CONSTRAINT IF EXISTS affiliate_referrals_user_id_fkey;
ALTER TABLE public.affiliates           DROP CONSTRAINT IF EXISTS affiliates_user_id_fkey;

-- 20260417000004 (contract + fraud)
DROP TABLE IF EXISTS public.affiliate_risk_scores       CASCADE;
DROP TABLE IF EXISTS public.affiliate_fraud_flags       CASCADE;
DROP TABLE IF EXISTS public.affiliate_contract_history  CASCADE;

-- 20260417000003 (pix + content)
DROP TABLE IF EXISTS public.affiliate_content_submissions CASCADE;
DROP TABLE IF EXISTS public.affiliate_pix_keys            CASCADE;

-- 20260417000002 (commissions + payouts)
DROP TABLE IF EXISTS public.affiliate_payouts     CASCADE;
DROP TABLE IF EXISTS public.affiliate_commissions CASCADE;

-- 20260417000001 (core schema)
DROP TABLE IF EXISTS public.affiliate_referrals CASCADE;
DROP TABLE IF EXISTS public.affiliate_clicks    CASCADE;
DROP TABLE IF EXISTS public.affiliates          CASCADE;

-- 20260417000000 (legacy rename) — rename back
ALTER TABLE public.affiliate_referrals_legacy RENAME TO affiliate_referrals;

COMMIT;
```

After SQL rollback, regenerate types: `npm run db:types`. Revert the merge commit to drop application code: `git revert <merge-sha>`.

---

## Appendix D — Mappers (camelCase ↔ snake_case)

Sketch of `apps/api/src/lib/affiliate/repository/mappers.ts`. Mirrors the pattern in `packages/shared/src/mappers/db.ts`. Full implementation in plan Task 1.10.

```ts
import type {
  AffiliateClick, AffiliateReferral, AffiliateCommission, AffiliatePayout,
  AffiliatePixKey, AffiliateContentSubmission, IAffiliateRepository,
} from '@tn-figueiredo/affiliate'

// ── Click ───────────────────────────────────────────────
export type DbAffiliateClick = {
  id: string; affiliate_id: string; affiliate_code: string;
  ip_hash: string | null; user_agent: string | null; landing_url: string | null;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  source_platform: string | null; device_type: string | null;
  converted_at: string | null; converted_user_id: string | null;
  created_at: string;
}

export function mapClickFromDb(r: DbAffiliateClick): AffiliateClick {
  return {
    id: r.id, affiliateId: r.affiliate_id, affiliateCode: r.affiliate_code,
    ipHash: r.ip_hash, userAgent: r.user_agent, landingUrl: r.landing_url,
    utmSource: r.utm_source, utmMedium: r.utm_medium, utmCampaign: r.utm_campaign,
    sourcePlatform: r.source_platform, deviceType: r.device_type,
    convertedAt: r.converted_at, convertedUserId: r.converted_user_id,
    createdAt: r.created_at,
  }
}

export type DbAffiliateClickInsert = Omit<DbAffiliateClick, 'id' | 'created_at' | 'converted_at' | 'converted_user_id'>
export function mapClickToDbInsert(input: Parameters<IAffiliateRepository['createClick']>[0]): DbAffiliateClickInsert {
  return {
    affiliate_id: input.affiliateId, affiliate_code: input.affiliateCode,
    ip_hash: input.ipHash ?? null, user_agent: input.userAgent ?? null,
    landing_url: input.landingUrl ?? null, utm_source: input.utmSource ?? null,
    utm_medium: input.utmMedium ?? null, utm_campaign: input.utmCampaign ?? null,
    source_platform: input.sourcePlatform ?? null, device_type: input.deviceType ?? null,
  }
}

// ── Referral, Commission, Payout, PixKey, ContentSubmission, ContractHistory ──
// (one mapper pair per entity used in writes; see plan Task 1.10 for full ~250 LOC)
```

The mapper file is the single place where snake_case ↔ camelCase happens. **All sub-repo `insert`/`update` calls go through these mappers** — never `sb.from(...).insert(input as any)`. This eliminates the entire class of "v1 spec used wrong column names" bugs and removes every `as any` from sub-repos.

For read paths (`select`), sub-repo methods take the `Database` type's row shape and call `mapXxxFromDb(row)` to return the package's domain type. For paginated reads (`{items, total}`), `items` are mapped one-by-one.
