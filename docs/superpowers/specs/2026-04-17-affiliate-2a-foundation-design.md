# Affiliate Platform — Phase 2A Foundation — Design Spec

**Status:** draft
**Date:** 2026-04-17
**Author:** Thiago Figueiredo (with Claude)
**Phase:** 2A of 2 (Phase 2 = Affiliates + Derivatives; 2A is foundation; 2B-2G covered separately)
**Predecessor:** Phase 1 (`docs/superpowers/specs/2026-04-16-admin-062-upgrade-design.md` — admin shell upgrade, completed in branch `feat/admin-upgrade-062`)

---

## 1. Context & Goals

### Background

bright-tale already ships a custom affiliate program implementation (~424 LOC across DB schema + API routes + end-user settings page). The implementation is minimal: per-user program code, simple referral tracking, fixed 20% commission. It targets the "creator becomes BrightTale affiliate" use case.

`@tn-figueiredo/affiliate@0.4.0` is a substantially larger affiliate platform shipping 9 tables, 37 use cases, tier-based commission, PIX-key payouts, contract history, fraud scoring, and content submission review. It's the platform target for BrightTale's affiliate strategy.

**Phase 2A** is the foundation sub-phase of the full migration: install the package, create new tables alongside legacy, implement the consumer-side ports (repository, email, tax-id, optional fraud), wire all 4 route helpers, and stand up the cron. Legacy stays alive in parallel until 2D cutover.

### Goals

1. Install `@tn-figueiredo/affiliate@0.4.0` in `apps/api`.
2. Apply 5 package migrations (9 new tables) + 1 bright-tale migration (rename legacy + `updated_at` triggers).
3. Implement `IAffiliateRepository` (52 methods, split across 11 sub-repos for review-ability).
4. Implement `IAffiliateEmailService` (4 methods over Resend).
5. Stub `IAffiliateTaxIdRepository` (real impl deferred).
6. Wire 4 package route helpers: `registerAffiliateRoutes`, `registerAffiliateAdminRoutes`, `registerAffiliateInternalRoutes`, `registerAffiliateRedirectRoute`.
7. Add Inngest cron `affiliate-expire-referrals` (daily 02:00 BRT).
8. Rename legacy table + routes to `affiliate-legacy` namespace; preserve end-user functionality during 2A.
9. Establish foundation that 2B (end-user UI) / 2C (admin UI) / 2D (cutover) / 2E (fraud) / 2F (billing) build on.

### Non-goals (explicitly out of scope for 2A)

- End-user UI rewrite (2B)
- Admin UI adoption (`affiliate-admin@0.3.3`) (2C)
- Data migration legacy → new (2D)
- Fraud detection real impl (2E)
- Billing/Stripe overhaul + payout automation (2F)
- Promo codes (2G; deferred upstream)
- Receita Federal / Tax ID validation API
- PostHog custom events for affiliate flows
- i18n for emails (pt-BR hardcoded)
- Mobile responsiveness (admin desktop-only)

---

## 2. Current State

### Existing custom affiliate implementation

```
apps/api/src/routes/affiliate.ts                                       136 LOC  (3 routes)
apps/api/src/routes/billing.ts                                         448 LOC  (Stripe + MercadoPago — out of scope for 2A)
apps/app/src/app/(app)/settings/affiliate/page.tsx                     240 LOC  (end-user UI)
supabase/migrations/20260414040000_publishing_destinations.sql          ~50 LOC  affiliate_programs + affiliate_referrals tables
```

### Package versions (verified on registry GitHub Packages)

| Package | Latest | Notes |
|---|---|---|
| `@tn-figueiredo/affiliate` | 0.4.0 | Domain + 5 migrations + 4 route helpers |
| `@tn-figueiredo/affiliate-admin` | 0.3.3 | RSC admin UI — for 2C |
| `@tn-figueiredo/fraud-detection` | 0.2.0 | For 2E |
| `@tn-figueiredo/billing` | 0.2.1 | For 2F (overlap with custom billing.ts) |

### apps/api conventions

- Fastify 5; routes registered as plugins via `server.register(plugin, { prefix: '/path' })`
- Auth: `preHandler: [authenticate]` populates `request.userId` from `x-user-id` header (set by `apps/web` middleware after Supabase SSR validation)
- Supabase: `createServiceClient()` per call, service_role key, bypasses RLS
- Email: `lib/email/resend.ts` exports `sendEmail()` + `isResendConfigured()`
- DI: **none** — all routes call `createServiceClient()` directly inline (no use case layer)
- Error envelope: `{ data, error }` via `sendError(reply, error)` + `ApiError` class
- Inngest: jobs in `src/jobs/`, barrel `src/jobs/index.ts`, served via `src/routes/inngest.ts` using `inngest/fastify` adapter
- Sentry global error handler; Axiom global response logger via `onResponse` hook
- Tests: vitest with chainable Supabase mocks; Category C (DB-hitting) tests `describe.skip + // TODO-test` per CLAUDE.md

---

## 3. Target State

### Package upgrades

| Package | From | To |
|---|---|---|
| `@tn-figueiredo/affiliate` | not installed | `0.4.0` (`--save-exact`) |

That's it for 2A package install. Other affiliate-derivative packages enter in 2C+.

### Environment variable inventory

| Var | Status | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | ✓ Phase 1 | `AFFILIATE_CONFIG.webBaseUrl` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ existing | Repository |
| `SUPABASE_ACCESS_TOKEN` | ✓ existing (root `.env.local`) | `db:push` + `db:types` |
| `RESEND_API_KEY` | ✓ existing | Email service |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | ✓ existing | Cron |
| **`AFFILIATE_ADMIN_EMAIL`** | **new (operator adds in 2A.2)** | Recipient for new-application notifications. Default `admin@brighttale.io` |

**Total new env: 1 var.**

---

## 4. Architecture

### Layer responsibility

```
┌─ @tn-figueiredo/affiliate 0.4.0 ───────────────────────────────────┐
│  Domain: 37 use cases, types, enums, errors                         │
│  HTTP: registerAffiliateRoutes / AdminRoutes / InternalRoutes /     │
│        RedirectRoute — Fastify-agnostic (MinimalFastify) plugins    │
│  SQL:  5 migrations (9 tables) + RLS policies (service_role bypass) │
│  Interfaces consumer implements:                                    │
│   - IAffiliateRepository (52 methods)                               │
│   - IAffiliateEmailService (4 methods)                              │
│   - IAffiliateTaxIdRepository (3 methods)                           │
│   - IAffiliateFraudDetectionService (1 method, optional)            │
└────────────────┬───────────────────────────────────────────────────┘
                 │ consumer wires deps via container
┌─ apps/api ─────┴───────────────────────────────────────────────────┐
│  src/lib/affiliate/                                                 │
│   ├─ repository/                                                    │
│   │  ├─ index.ts                  SupabaseAffiliateRepository       │
│   │  │                            (composes 11 sub-repos via DI)    │
│   │  ├─ affiliate-query-repo.ts   9 methods                         │
│   │  ├─ affiliate-lifecycle-repo.ts 7 methods                       │
│   │  ├─ affiliate-proposals-repo.ts 4 methods                       │
│   │  ├─ affiliate-history-repo.ts   2 methods                       │
│   │  ├─ clicks-repo.ts            4 methods                         │
│   │  ├─ referrals-repo.ts         5 methods                         │
│   │  ├─ commissions-repo.ts       4 methods                         │
│   │  ├─ payouts-repo.ts           4 methods                         │
│   │  ├─ pix-repo.ts               4 methods                         │
│   │  ├─ content-repo.ts           3 methods                         │
│   │  ├─ fraud-repo.ts             4 methods                         │
│   │  └─ stats-repo.ts             2 methods                         │
│   ├─ email-service.ts             ResendAffiliateEmailService       │
│   ├─ tax-id-service.ts            StubTaxIdRepository (returns 'regular') │
│   ├─ config.ts                    AFFILIATE_CONFIG                  │
│   ├─ auth-context.ts              getAuthenticatedUser + isAdmin    │
│   └─ container.ts                 buildAffiliateContainer (cached singleton) │
│  src/jobs/affiliate-expire-referrals.ts  Inngest cron 02:00 BRT     │
│  src/index.ts                     Registers 4 helpers under prefixes │
└────────────────────────────────────────────────────────────────────┘
```

### Container lifecycle (composition root)

Module-level lazy singleton via `let cached`. First call instantiates Supabase client + 37 use cases + 11 sub-repos. Subsequent calls return cached instance. Test seam `__resetAffiliateContainer()` flushes cache between tests. Diverges from existing apps/api per-request `createServiceClient()` convention but is **isolated to the affiliate module** and more efficient for serverless cold-start amortization.

### Server / Client boundary

apps/api is pure Fastify (Node, no React). Zero RSC concerns. Consumer of routes (`affiliate-admin` UI in 2C) lives in apps/web — separate concern.

### Slug / path contract

Routes registered with explicit prefixes:
- `/affiliate` — end-user (auth required)
- `/admin/affiliate` — admin (auth + isAdmin via `RouteAuthContext`)
- `/internal/affiliate` — service-to-service (auth)
- `/ref` — public redirect (no auth)
- `/affiliate-legacy` — deprecated, lives until 2D

Visible to clients via apps/web rewrite (`/api/* → apps/api`):
- `/api/affiliate/*`, `/api/admin/affiliate/*`, `/api/internal/affiliate/*`, `/api/ref/*`, `/api/affiliate-legacy/*`

### Coexistence strategy

`apps/app/src/app/(app)/settings/affiliate/page.tsx` continues to work during 2A by calling renamed legacy routes (`/api/affiliate-legacy/program`, etc.). 2B will rewrite this page against the new schema; 2D will retire the legacy routes + drop legacy tables.

`affiliate_referrals` (legacy) is renamed to `affiliate_referrals_legacy` to free the namespace for the package's own `affiliate_referrals` table. `affiliate_programs` keeps its name (no collision — package uses `affiliates`).

### Provider hierarchy / observability

- Axiom logging via `onResponse` hook (global, existing) — automatic
- Sentry error handling via `setupFastifyErrorHandler` (global, existing) — `mapAffiliateErrorToHttp` (called internally by package helpers) translates package errors before they reach Sentry
- PostHog custom events not added in 2A (deferred to 2B/2C)

---

## 5. Data Layer

### Migrations to apply (7 total in 2A.1)

```
20260417000000_rename_legacy_affiliate_referrals.sql        bright-tale
20260417000001_affiliate_001_schema.sql                      package
20260417000002_affiliate_002_payouts.sql                     package
20260417000003_affiliate_003_pix_content.sql                 package
20260417000004_affiliate_004_contract.sql                    package
20260417000005_affiliate_005_supabase.sql                    package
20260417000006_affiliate_updated_at_triggers.sql             bright-tale
```

**Tables created (11):** `affiliates`, `affiliate_clicks`, `affiliate_referrals` (from 001); `affiliate_commissions`, `affiliate_payouts` (from 002); `affiliate_pix_keys`, `affiliate_content_submissions` (from 003); `affiliate_contract_history`, `affiliate_social_links`, `affiliate_fraud_flags`, `affiliate_risk_scores` (from 004).

**RLS:** `005_fk_supabase.sql` enables RLS on 10 of 11 tables (skips `affiliate_social_links`) + creates `service_role_all` policy on each enabled (`TO service_role USING (true) WITH CHECK (true)`). bright-tale convention requires RLS on all tables → `20260417000006` (the consumer-side migration) adds RLS + policy for `affiliate_social_links` along with the `updated_at` triggers.

**`updated_at` triggers** (CLAUDE.md convention): package adds `updated_at` columns on 4 tables but no `moddatetime` triggers. `20260417000006` adds the missing triggers via `moddatetime(updated_at)` extension.

After migrations: `npm run db:types` regenerates `packages/shared/src/types/database.ts` with new tables.

### Repository composition

`SupabaseAffiliateRepository` is a single class implementing `IAffiliateRepository`. It composes 11 sub-repo factories via constructor DI:

```ts
export class SupabaseAffiliateRepository implements IAffiliateRepository {
  private query: ReturnType<typeof createQueryRepo>
  private lifecycle: ReturnType<typeof createLifecycleRepo>
  // ...9 more sub-repo references

  constructor(private sb: SupabaseClient<Database>) {
    this.query = createQueryRepo(sb)
    this.lifecycle = createLifecycleRepo(sb)
    // ...9 more
  }

  // 52 method-syntax delegations (NOT arrow-field — would crash on init order):
  findById(id: string) { return this.query.findById(id) }
  // ...51 more
}
```

Each sub-repo factory returns `{ method1, method2, ... }`. Tests target sub-repos individually (mock chainable Supabase per apps/api convention). Total ~1150 LOC across 11 files + index; nothing larger than ~250 LOC.

---

## 6. Routes + Container + Cron

### Container (`src/lib/affiliate/container.ts`)

See Appendix A.1 for full skeleton.

Key points:
- Module-level `let cached`; lazy init on first `buildAffiliateContainer()` call
- Test seam `__resetAffiliateContainer()` to flush between tests
- Exposes `endUserDeps` (16 use cases), `adminDeps` (17), `internalDeps` (1), plus standalone `trackClickUseCase` for redirect handler
- Fraud passed `undefined` (optional in `AttributeSignupToAffiliate`); 2E swaps real impl

### Auth context (`src/lib/affiliate/auth-context.ts`)

`getAuthenticatedUser(request)` → `{ id }` from `request.userId` (populated by `authenticate` middleware). Throws `ApiError(401)` if missing.

`isAdmin(request)` → boolean via inline Supabase query `user_roles.role = 'admin'`. No cache (matches apps/api convention; performance acceptable for MVP).

### Route registration in `src/index.ts`

Each helper registered in its own `app.register(...)` scope with prefix and `preHandler` hook:

```ts
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

`as never` cast resolves `MinimalFastify` interface mismatch with full `FastifyInstance`.

### Email service (`src/lib/affiliate/email-service.ts`)

`ResendAffiliateEmailService` implements 4 methods of `IAffiliateEmailService`. Each method:
1. Returns early if `!isResendConfigured()` (dev/test no-op)
2. Calls existing `sendEmail({ to, subject, html })` with HTML rendered inline (pattern: existing `sendContentPublishedEmail` etc.)

`AFFILIATE_ADMIN_EMAIL` env var (default `admin@brighttale.io`) is the recipient for new-application notifications.

### Tax ID stub (`src/lib/affiliate/tax-id-service.ts`)

`StubTaxIdRepository` (~15 LOC):
- `findByEntity()` always returns `null`
- `save()` no-op
- `getStatus()` always returns `{ status: 'regular' }`

Real impl (Receita Federal API) is out of scope. **Compliance gap registered as R8** (high severity).

### Inngest cron (`src/jobs/affiliate-expire-referrals.ts`)

```ts
export const affiliateExpireReferrals = inngest.createFunction(
  {
    id: 'affiliate-expire-referrals',
    retries: 2,
    triggers: [{ cron: 'TZ=America/Sao_Paulo 0 2 * * *' }],
  },
  async ({ step }) => {
    const container = buildAffiliateContainer()
    const result = await step.run('expire', async () =>
      container.expirePendingUseCase.execute(new Date())
    )
    return { totalExpired: result.totalExpired }
  }
)
```

If Inngest dev server doesn't support `TZ=` prefix, fallback to `0 5 * * *` UTC (= 02:00 BRT). Verify in 2A.3.

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

5 commits in branch `feat/affiliate-2a-foundation` from `staging` (after Phase 1 merged). Each commit gates on its acceptance criteria.

### 2A.1 — Foundation
Install package, apply 7 migrations, regenerate types, scaffold repo skeleton (all 52 methods throw `not_impl_2a1`), rename legacy table + routes, update `apps/app/(app)/settings/affiliate/page.tsx` to call `/api/affiliate-legacy/*`.

**Files:** `apps/api/package.json`, 7 migrations, `apps/api/src/routes/affiliate-legacy.ts` (renamed), `apps/api/src/index.ts`, `apps/web` (no — apps/app), `apps/app/src/app/(app)/settings/affiliate/page.tsx` (3 fetch updates), `apps/api/src/lib/affiliate/repository/{index,11 sub-repos}.ts` (skeleton).

**Accept (3 manual smoke):** migrations apply clean, types regenerate, legacy settings page still works.

### 2A.2 — Lifecycle + Email + Tax stub + Container partial (NO routes)
Implement `affiliate-query-repo`, `affiliate-lifecycle-repo`, `affiliate-history-repo` (18 methods total). Implement `email-service`, `tax-id-service`, `auth-context`, `config`. Container exports 8 use cases. **No routes registered** (TS interface for `AffiliateRouteDeps` requires 16 use cases — defer route registration to 2A.4).

**Files:** see Appendix B for complete file list per stage.

**Accept (4 smoke):** unit tests pass, direct use case invocation creates affiliate, Resend email received.

**Operator action:** add `AFFILIATE_ADMIN_EMAIL` to `apps/api/.env.local` before testing email.

### 2A.3 — Tracking + Cron + Internal/Redirect routes
Implement `clicks-repo`, `referrals-repo`, `commissions-repo` (13 methods). Add 6 more use case instances to container. Register `/ref` (public) + `/internal/affiliate` (auth — only needs 1 use case). Add Inngest cron job.

**Accept (3 smoke):** `GET /api/ref/CODE` redirects + tracks; `POST /api/internal/affiliate/expire-pending` works; Inngest dev server lists cron.

### 2A.4 — Payouts + PIX + Content + Fraud + Proposals + END-USER + ADMIN routes
Implement remaining 6 sub-repos (21 methods). Container completes with all 37 use cases. Register `/affiliate` (16-use-case interface satisfied) and `/admin/affiliate` (17-use-case interface satisfied).

**Accept (5 smoke):** apply, PIX add, admin overview, admin approve, non-admin 403.

### 2A.5 — Smoke integration + Config review + Deprecation
Operator validates `AFFILIATE_CONFIG` values (tier rates, min payout). Add `@deprecated` JSDoc to `affiliate-legacy.ts`. **Manual smoke checklist (12 itens)** — Category C integration test added but `describe.skip` per CLAUDE.md.

**Accept (12 manual smoke):** complete affiliate lifecycle via API: apply → email → admin approve → tracking → attribute signup → calculate commission → payout request → admin approve payout → cron expire.

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

---

## 9. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Package migrations ordering conflict | Low | Timestamps `20260417000001-6` after last existing — clean |
| R2 | apps/app affiliate page breaks during 2A.1 rename | Medium | 2A.1 atomic commit includes apps/app + apps/api + migrations |
| R3 | Container module-level diverges from per-request convention | Low | Isolated to affiliate module |
| R4 | Repository ~1150 LOC hard to review | Medium | Split into 11 sub-repos (<150 LOC each) |
| R5 | `affiliate-admin` 2C requires 4 actions with no package route (`revalidateTaxId`, `addSocialLink`, `deleteSocialLink`, `verifySocialLinks`) | Medium | Concern of 2C — spec 2C decides between skip / custom routes / upstream PR |
| R6 | Migrations applied in prod without prior testing = data trapped | **High** | Mandatory 48h staging gap; rollback SQL prepared before prod push |
| R7 | Legacy `affiliate_referrals_legacy` orphan post-2D | Low | 2D spec handles drop or archival |
| R8 | Tax ID stub returns 'regular' = affiliates can register PIX/payouts without fiscal validation | **High (compliance)** | Accept gap in 2A; 2F implements Receita Federal API or blocks payouts >R$X. Document in LGPD/compliance log |
| R9 | Fraud service `undefined` = self-referral check skipped → affiliate can refer self | Medium | Accept gap in 2A; 2E implements. Interim: admin manual review before approve |
| R10 | Container init at module load fails if `SUPABASE_SERVICE_ROLE_KEY` absent in deploy | Medium | Lazy init via `let cached` mitigates (init on first request, not import time) |
| R11 | 16+17 use cases instantiated each cold start = warmup latency | Low | Constructors are nanosecond-scale property assignments — non-bottleneck |
| R12 | Inngest cron timezone `TZ=America/Sao_Paulo` not supported | Low | Verify in 2A.3; fallback `0 5 * * *` UTC = 02:00 BRT |
| R13 | `npm run db:types` rewrites `packages/shared/src/types/database.ts` — merge conflicts if parallel migrations | Low | Branch stable during 2A; manual conflict resolution if other migrations land |

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
- Routes `/api/admin/affiliate/*` ready after 2A.4
- 4 admin Provider actions have no package route (`revalidateTaxId`, `addSocialLink`, `deleteSocialLink`, `verifySocialLinks`) — 2C decides: skip / custom routes / upstream PR
- Phase 1 admin layout config (`apps/web/src/lib/admin-layout-config.tsx`) gets new section: `{ label: 'Afiliados', path: adminPath('/affiliates'), icon: 'Users2' }`

### For 2D (data migration + cutover)
- Mapping `affiliate_programs.{user_id, code, commission_pct}` → `affiliates.{user_id, code, commission_rate}`
- Mapping `affiliate_referrals_legacy.{referred_org_id, status}` → `affiliate_referrals.{user_id (lookup org→primary user), …}` + derived `affiliate_commissions`
- Post-cutover: drop legacy tables, delete `routes/affiliate-legacy.ts`, remove `/api/affiliate-legacy/*` calls in apps/app

### For 2E (fraud detection)
- `IAffiliateFraudDetectionService` interface awaits implementation via `@tn-figueiredo/fraud-detection@0.2.0`
- Container 2A passes `undefined` for `AttributeSignupToAffiliateUseCase` — 2E substitutes real impl

### For 2F (billing + payout automation)
- `CalculateAffiliateCommissionUseCase` wired in 2A but only triggers if billing webhook calls it
- Existing `apps/api/src/routes/billing.ts` (448 LOC custom Stripe + MercadoPago) needs decision: full migration to `@tn-figueiredo/billing@0.2.1` (mega-project) OR retain custom + add hook calling `CalculateAffiliateCommissionUseCase`. 2F spec decides.

---

## 12. References

- Affiliate package README + CHANGELOG: `npm.pkg.github.com/@tn-figueiredo/affiliate/0.4.0`
- Affiliate-admin package: `npm.pkg.github.com/@tn-figueiredo/affiliate-admin/0.3.3`
- Phase 1 spec: `docs/superpowers/specs/2026-04-16-admin-062-upgrade-design.md`
- Existing custom affiliate impl: `apps/api/src/routes/affiliate.ts`, `supabase/migrations/20260414040000_publishing_destinations.sql`
- TNF ecosystem architecture: `/Users/figueiredo/Workspace/TNF_Ecosystem_Architecture.md`

---

## Appendix A — Code skeletons

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

export function buildAffiliateContainer(): AffiliateContainer {
  if (cached) return cached

  const sb = createServiceClient()
  const repo = new SupabaseAffiliateRepository(sb)
  const email = new ResendAffiliateEmailService()
  const taxId = new StubTaxIdRepository()
  const config: AffiliateConfig = AFFILIATE_CONFIG

  const trackClickUseCase = new TrackAffiliateLinkClickUseCase(repo, config)
  const expirePendingUseCase = new ExpirePendingReferralsUseCase(repo)

  cached = {
    config,
    repo,
    trackClickUseCase,
    attributeUseCase: new AttributeSignupToAffiliateUseCase(repo, undefined /* fraud */),
    calcCommissionUseCase: new CalculateAffiliateCommissionUseCase(repo),
    expirePendingUseCase,
    endUserDeps: {
      getAuthenticatedUser,
      isAdmin,
      applyUseCase: new ApplyAsAffiliateUseCase(repo, email, taxId),
      getMyAffiliateUseCase: new GetMyAffiliateUseCase(repo),
      getStatsUseCase: new GetAffiliateStatsUseCase(repo),
      getMyCommissionsUseCase: new GetMyCommissionsUseCase(repo),
      getReferralsUseCase: new GetAffiliateReferralsUseCase(repo),
      createPayoutUseCase: new CreateAffiliatePayoutUseCase(repo, taxId),
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
      getAuthenticatedUser,
      isAdmin,
      overviewUseCase: new GetAdminAffiliateOverviewUseCase(repo),
      detailUseCase: new GetAdminAffiliateDetailUseCase(repo),
      approveUseCase: new ApproveAffiliateUseCase(repo, email, taxId),
      pauseUseCase: new PauseAffiliateUseCase(repo),
      renewUseCase: new RenewAffiliateContractUseCase(repo),
      expirePendingUseCase,
      pendingContractsUseCase: new GetPendingContractsAffiliatesUseCase(repo),
      proposeChangeUseCase: new ProposeContractChangeUseCase(repo, email),
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
      getAuthenticatedUser,
      isAdmin,
      expirePendingUseCase,
    },
  }
  return cached
}

export function __resetAffiliateContainer(): void {
  cached = null
}
```

### A.2 `src/lib/affiliate/repository/index.ts`

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

  // 52 method-syntax delegations follow (sample):
  findById(id: string) { return this.query.findById(id) }
  findByCode(code: string) { return this.query.findByCode(code) }
  findByUserId(userId: string) { return this.query.findByUserId(userId) }
  // ...49 more
}
```

### A.3 `src/lib/affiliate/email-service.ts`

```ts
import type { IAffiliateEmailService } from '@tn-figueiredo/affiliate'
import { sendEmail, isResendConfigured } from '@/lib/email/resend'

const ADMIN_EMAIL = process.env.AFFILIATE_ADMIN_EMAIL ?? 'admin@brighttale.io'

export class ResendAffiliateEmailService implements IAffiliateEmailService {
  async sendAffiliateApplicationReceivedAdmin(data: {
    name: string; email: string; channelPlatform: string; channelUrl: string
    subscribersCount?: number; suggestedCode?: string; notes?: string
  }): Promise<void> {
    if (!isResendConfigured()) return
    await sendEmail({
      to: ADMIN_EMAIL,
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
    email: string, name: string, tier: string, commissionRate: number,
    portalUrl: string, fixedFeeBrl?: number,
  ): Promise<void> {
    if (!isResendConfigured()) return
    await sendEmail({
      to: email,
      subject: '🎉 Sua aplicação de afiliado foi aprovada',
      html: this.renderApproval(name, tier, commissionRate, portalUrl, fixedFeeBrl),
    })
  }

  async sendAffiliateContractProposalEmail(
    email: string, name: string,
    currentTier: string, currentRate: number,
    proposedTier: string, proposedRate: number,
    portalUrl: string, notes?: string,
    currentFixedFeeBrl?: number, proposedFixedFeeBrl?: number,
  ): Promise<void> {
    if (!isResendConfigured()) return
    await sendEmail({
      to: email,
      subject: 'Nova proposta de contrato de afiliado',
      html: this.renderContractProposal(name, currentTier, currentRate, proposedTier, proposedRate, portalUrl, notes, currentFixedFeeBrl, proposedFixedFeeBrl),
    })
  }

  // 4 private render methods — each returns HTML string with inline CSS.
  // Templates ~30-50 LOC each; full text in plan execution.
  private renderApplicationReceivedAdmin(d: { name: string; email: string; channelPlatform: string; channelUrl: string; subscribersCount?: number; suggestedCode?: string; notes?: string }): string {
    return `<h1>Nova aplicação</h1><p>${d.name} (${d.email}) — ${d.channelPlatform}: ${d.channelUrl}</p>${d.subscribersCount ? `<p>${d.subscribersCount} inscritos</p>` : ''}${d.notes ? `<p>${d.notes}</p>` : ''}`
  }
  private renderApplicationConfirmation(name: string): string {
    return `<h1>Olá ${name}</h1><p>Recebemos sua aplicação. Vamos analisar e responder em breve.</p>`
  }
  private renderApproval(name: string, tier: string, rate: number, portalUrl: string, fee?: number): string {
    return `<h1>Aprovado, ${name}!</h1><p>Tier: ${tier} (${(rate * 100).toFixed(0)}% commission${fee ? ` + R$${fee} fixed` : ''})</p><a href="${portalUrl}">Acessar portal</a>`
  }
  private renderContractProposal(name: string, currentTier: string, currentRate: number, proposedTier: string, proposedRate: number, portalUrl: string, notes?: string, currentFee?: number, proposedFee?: number): string {
    return `<h1>Proposta de contrato — ${name}</h1><p>Atual: ${currentTier} (${(currentRate * 100).toFixed(0)}%${currentFee ? ` + R$${currentFee}` : ''})</p><p>Proposto: ${proposedTier} (${(proposedRate * 100).toFixed(0)}%${proposedFee ? ` + R$${proposedFee}` : ''})</p>${notes ? `<p>${notes}</p>` : ''}<a href="${portalUrl}">Ver portal</a>`
  }
}
```

### A.4 `src/lib/affiliate/tax-id-service.ts`

```ts
import type { IAffiliateTaxIdRepository } from '@tn-figueiredo/affiliate'

export class StubTaxIdRepository implements IAffiliateTaxIdRepository {
  async findByEntity(_entityType: string, _entityId: string) {
    return null
  }

  async save(_data: unknown): Promise<void> {
    // no-op — real Tax ID storage deferred to Phase 2F or later
  }

  async getStatus(_taxId: string) {
    return { status: 'regular' as const }
  }
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

### A.6 `src/jobs/affiliate-expire-referrals.ts`

```ts
import { inngest } from './client.js'
import { buildAffiliateContainer } from '../lib/affiliate/container.js'

export const affiliateExpireReferrals = inngest.createFunction(
  {
    id: 'affiliate-expire-referrals',
    retries: 2,
    triggers: [{ cron: 'TZ=America/Sao_Paulo 0 2 * * *' }],
  },
  async ({ step }) => {
    const container = buildAffiliateContainer()
    const result = await step.run('expire-pending-referrals', async () =>
      container.expirePendingUseCase.execute(new Date())
    )
    return { totalExpired: result.totalExpired, ranAt: new Date().toISOString() }
  }
)
```

### A.7 Migration: `20260417000000_rename_legacy_affiliate_referrals.sql`

```sql
ALTER TABLE public.affiliate_referrals RENAME TO affiliate_referrals_legacy;
COMMENT ON TABLE public.affiliate_referrals_legacy IS 'Legacy schema renamed in Phase 2A.1; replaced by package affiliate_referrals. To drop in 2D.';
```

### A.8 Migration: `20260417000006_affiliate_updated_at_triggers.sql`

Adds `moddatetime` triggers to 4 tables with `updated_at` columns + adds RLS to `affiliate_social_links` (skipped by package's 005).

```sql
-- updated_at triggers (CLAUDE.md convention; package added column but no trigger)
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliate_pix_keys
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliate_content_submissions
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliate_social_links
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- RLS gap: package's 005 enables RLS on 10 of 11 tables; close the gap
ALTER TABLE public.affiliate_social_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.affiliate_social_links
  TO service_role USING (true) WITH CHECK (true);
```

---

## Appendix B — Stage file inventory (per-stage create/modify list)

### 2A.1
- create: 7 SQL migrations
- modify: `apps/api/package.json`, `package-lock.json` (root), `apps/api/src/index.ts` (legacy register prefix change), `apps/app/src/app/(app)/settings/affiliate/page.tsx` (3 fetch URL updates), `packages/shared/src/types/database.ts` (regenerated)
- create: `apps/api/src/lib/affiliate/repository/{index, 11 sub-repos}.ts` (skeleton, all throw)
- rename: `apps/api/src/routes/affiliate.ts` → `affiliate-legacy.ts` (table reference updated)

### 2A.2
- create: `apps/api/src/lib/affiliate/{email-service, tax-id-service, auth-context, config, container}.ts`
- modify: 3 sub-repos: `affiliate-query-repo`, `affiliate-lifecycle-repo`, `affiliate-history-repo` (real impls)
- create: `__tests__/lib/affiliate/{email-service, tax-id-service}.test.ts` + sub-repo tests

### 2A.3
- modify: 3 sub-repos: `clicks-repo`, `referrals-repo`, `commissions-repo` (real impls)
- modify: `container.ts` (add 6 use cases)
- modify: `apps/api/src/index.ts` (register `/ref` + `/internal/affiliate`)
- create: `apps/api/src/jobs/affiliate-expire-referrals.ts`
- modify: `apps/api/src/jobs/index.ts` (barrel export), `apps/api/src/routes/inngest.ts` (`functions: [...]` adds new)
- create: sub-repo tests

### 2A.4
- modify: 6 sub-repos: `payouts-repo`, `pix-repo`, `content-repo`, `fraud-repo`, `affiliate-proposals-repo`, `stats-repo`
- modify: `container.ts` (full 37 use cases)
- modify: `apps/api/src/index.ts` (register `/affiliate` + `/admin/affiliate`)
- create: sub-repo tests

### 2A.5
- modify: `apps/api/src/lib/affiliate/config.ts` (operator-validated values)
- modify: `apps/api/src/routes/affiliate-legacy.ts` (`@deprecated` JSDoc)
- create: `apps/api/src/__tests__/integration/affiliate-flow.test.ts` (`describe.skip + // TODO-test`)
- modify: this spec doc — add "Status: implemented in commit X" section
