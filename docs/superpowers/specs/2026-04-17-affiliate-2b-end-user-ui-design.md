# Affiliate Phase 2B — End-User UI Rewrite — Design Spec

**Date:** 2026-04-17
**Status:** draft (post-brainstorm, pre-plan)
**Context:** Sub-project 1 of the affiliate-migration long-lived branch
(`feat/affiliate-2a-foundation`; rename deferred per CC-1). Replaces the
legacy `apps/app/src/app/(app)/settings/affiliate/page.tsx` (241 LOC,
pt-BR-only, built against the soon-to-be-dropped
`affiliate_programs`/`affiliate_referrals_legacy` schema) with a UI wired
to the new `@tn-figueiredo/affiliate@0.4.0` routes mounted in 2A
(`/api/affiliate/*`). Resolves the `/signup` URL drift noted in
`apps/api/src/lib/affiliate/config.ts:5-8`. Legacy page remains dormant
until 2D cutover deletes it.

---

## 1. Context & Goals

### Background

Phase 2A wired the new affiliate platform on the API side: the package's
Fastify route plugins are registered behind `authenticate` middleware at
`/affiliate` (end-user), `/admin/affiliate`, `/internal/affiliate`, and
`/ref/:code` (public) in `apps/api/src/index.ts:195-221`. The container
(`apps/api/src/lib/affiliate/container.ts`) supplies 17 end-user use
cases: apply, get-me, stats, commissions, referrals, clicks-by-platform,
create-payout, update-profile, PIX key CRUD (5), submit-content,
accept/reject-proposal (2), plus the shared track-click.

The end-user UI has not been updated. `apps/app/(app)/settings/affiliate/page.tsx`
still targets the legacy `/api/affiliate-legacy/*` routes (kept alive by
`apps/api/src/routes/affiliate-legacy.ts`, `@deprecated` since 2A.5). The
legacy page's data model — `{ code, commission_pct, total_referrals,
total_revenue_cents, total_paid_cents }` — does not express the new
domain: **tiers** (nano/micro/mid/macro/mega), **contract lifecycle**
(pending → approved → active → paused/terminated), **proposal
acceptance** (for contract changes including the initial contract),
**PIX key management** (5 key types, 1 default), **content submissions**
(7 platforms × 6 content types), **commission history**
(pending/paid/cancelled with retroactive flag), and **payout requests**
(min R$50; tied to PIX default + validated tax ID).

The legacy test file `__tests__/page.test.tsx` is already partially
drifted — it mocks `/api/affiliate/program` paths the production page
does not call — so tests currently pass on mock shape, not behavior
parity. Rewrite supersedes the test file in full.

### Scope (per 2A spec §11.2B)

1. Rewrite `apps/app/src/app/(app)/settings/affiliate/page.tsx` against
   the new 2A schema.
2. Components (inline children of the page; see §4): tier badge,
   contract viewer with accept/reject proposal actions, PIX key manager,
   content submission form + list, commission history table, payout
   request button + dialog.
3. Resolve `/signup` URL drift (`apps/api/src/lib/affiliate/config.ts:5-8`).
   Standardize on the app path `/auth/signup` (locale-agnostic; middleware
   inserts locale). Implement via a **Next.js rewrite** in
   `apps/app/next.config.ts` that rewrites `/signup` → `/auth/signup`,
   preserving `?ref=<code>`. The apply/onboarding flow reads `?ref` from
   `searchParams` and passes it to `POST /api/affiliate/apply` via the
   existing `referralCode` body field (confirmed present in the package's
   `applyBodySchema`). No change to `webBaseUrl` or `AFFILIATE_CONFIG` —
   the rewrite shim makes the hard-coded package URL work against the
   app's actual routing without a package fork or a /signup page
   duplication.
4. Legacy UI remains dormant (no deletion — that is 2D's job). Legacy
   `__tests__/page.test.tsx` is **replaced**, not retained in parallel,
   because it tests the rewritten page.

### Goals

1. Ship a production-grade `/settings/affiliate` page that can take a
   user from "haven't applied" → "pending approval" → "active affiliate
   with dashboard" → "payout requested" without error, using only the
   new `/api/affiliate/*` routes.
2. Keep pt-BR hard-coded strings (parity with the adjacent
   `/settings/billing` and `/settings/usage` pages, which are also
   non-localized). **Not using `next-intl`** — the `(app)/settings/*`
   segment is outside `[locale]` and the root `src/app/layout.tsx`
   does not wrap with `NextIntlClientProvider` (only `[locale]/layout.tsx`
   does). Moving settings under `[locale]/` or adding a new provider
   wrap in `(app)/layout.tsx` (which does not currently exist) is a
   separate refactor and explicitly out of scope — see §10. Strings
   live as constants in `components/strings.ts` for easy future
   extraction.
3. Translate the package's `{ success, data|error }` response envelope
   into bright-tale's canonical `{ data, error }` at the client
   boundary (centralized helper — see §4 "Envelope adapter"). Zero
   changes to the package or to API-side route handlers.
4. Preserve referral-link copy UX (the single feature users rely on
   today) and improve it to show the tier/commission rate and
   contract expiry at a glance.
5. Resolve the `/signup` drift at an app-wide level (rewrite, not a
   per-component workaround). The redirect flow from `/ref/:code` →
   `/signup?ref=X` → `/auth/signup?ref=X` preserves query params and
   click attribution.
6. Give a PT-BR default UX (parity with billing/usage); date/currency
   formatters still use `Intl.*` with a hard-coded `'pt-BR'` locale so
   that when i18n is retrofitted later, switching the argument is a
   one-line change per call site.

### Non-goals (explicitly out of scope)

- Affiliate **application** form for users who are not yet affiliates.
  The `POST /api/affiliate/apply` route is available, but the
  application flow (terms acceptance, tax-ID validation UX, social-link
  proof) is a **separate user journey** targeted for a later
  sub-project. 2B renders an "Apply to join" CTA that routes to a stub
  page (`/settings/affiliate/apply`, implemented as a minimal form
  posting to `/api/affiliate/apply`) to unblock end-to-end rehearsal,
  but the full application UX (multi-step, social verification) is
  deferred. See §10.
- Admin UI — 2C's scope.
- Payout PIX key setup flow inside the onboarding experience — 2B
  surfaces PIX key management in the existing page post-approval only.
- Stripe connect / bank account alternatives. PIX is the sole payout
  rail (hard-coded assumption per 2A; Stripe-deferred per
  cross-cutting decision).
- Fraud-signal surfacing to end-users (risk scores etc. are admin-only
  per the package's route split).
- Contract proposal *authoring* by end-users. Only accept/reject of an
  admin-initiated proposal is exposed, matching the package's
  `acceptProposalUseCase` / `rejectProposalUseCase` surface.
- Mobile app (`appStoreUrl`) — `/ref/:code` still redirects to
  `webBaseUrl` on any non-mobile UA; mobile detection in the package is
  hard-coded to `isMobile: false` (see `routes.js:4346`). 2B does not
  change this.
- Removing or refactoring the legacy page/route — 2D's responsibility.
- PostHog custom events for affiliate flows (noted as deferred in
  2A §4; 2B adds lightweight PostHog `capture()` calls for the top 4
  flows — see §4.9 — because the instrumentation is small and lets us
  validate funnels during the end-of-branch rehearsal).

---

## 2. Current State

### End-user page

`apps/app/src/app/(app)/settings/affiliate/page.tsx` (241 LOC, client
component, pt-BR strings hard-coded):

| Concern | Current | Gap vs. new schema |
|---|---|---|
| Data fetch | `GET /api/affiliate-legacy/program`, `GET /api/affiliate-legacy/referrals` | Replaces with `/api/affiliate/me`, `/stats`, `/referrals`, `/me/commissions`, `/pix-keys`, `/clicks-by-platform` |
| Activation | `POST /api/affiliate-legacy/program` (auto-creates from eligible plan) | Replaced by `POST /api/affiliate/apply` with user-supplied name/email/channel (+ optional tax ID); approval is manual admin action |
| Stats shown | `total_referrals`, conversions (derived client-side), `total_revenue_cents`, `total_paid_cents` | Package model: `totalClicks`, `totalReferrals`, `totalConversions`, `totalEarningsBrl`, `pendingPayoutBrl`, `paidPayoutBrl`, `clicksByPlatform[]`. All in BRL (integer BRL, not cents — see §4.2). |
| Tier | Not shown (single 20% hard-coded) | 5-tier system; display tier + commissionRate |
| Contract | Not shown | `contractStartDate`, `contractEndDate`, `contractVersion`, `proposedTier|proposedCommissionRate|proposedFixedFeeBrl` when a proposal exists |
| Referrals table | Flat list of `{ status, first_touch_at, conversion_at, commission_cents }` | Replaced by separate "recent referrals" + "commission history" views; new statuses (`active|pending_contract|expired|paused` + commission `pending|paid|cancelled`) |
| Payout | Not exposed | New: `POST /api/affiliate/payouts` (creates draft from all pending commissions; min R$50); list pending/completed payouts |
| PIX keys | Not exposed | 5 CRUD operations |
| Content | Not exposed | Submit + list |
| Proposal | Not exposed | Accept / Reject |
| i18n | Hard-coded pt-BR literals | Still hard-coded pt-BR (parity) — extracted into a `strings.ts` constants module for future i18n lift |
| Copy link | Uses `window.location.origin.replace('app.', '')` → `/?ref=X` | Target changes to `/?ref=X` (root marketing URL) or `/signup?ref=X` (direct signup). Page lets user copy both (§4.5 rationale) |

### Test file

`apps/app/src/app/(app)/settings/affiliate/__tests__/page.test.tsx` (145
LOC). Already partially drifted: mocks `/api/affiliate/program` (which
the production page does not call — it calls `/api/affiliate-legacy/program`).
Tests pass because the mock implementation matches the *shape* the
production code parses, not the URL the code fetches. **Replace wholesale**
under the new route set.

### API routes available (end-user, mounted in 2A)

Path prefix: `/api/affiliate` (apps/app rewrite → apps/api `/affiliate`).
All require Supabase-authenticated user via app's proxy middleware.

| Method | Path | Use case | Request body |
|---|---|---|---|
| POST | `/apply` | `ApplyAsAffiliateUseCase` | `applyBodySchema` — `name` (req), `email` (req), `channelName?`, `channelUrl?`, `channelPlatform?`, `socialLinks[]?`, `subscribersCount?`, `suggestedCode?`, `taxId?`, `notes?`, `referralCode?`, `affiliateType?` |
| GET | `/me` | `GetMyAffiliateUseCase` | — |
| GET | `/me/commissions` | `GetMyCommissionsUseCase` | — |
| GET | `/stats` | `GetAffiliateStatsUseCase` | — |
| GET | `/referrals` | `GetAffiliateReferralsUseCase` | — |
| GET | `/clicks-by-platform` | `GetAffiliateClicksByPlatformUseCase` | — |
| POST | `/payouts` | `CreateAffiliatePayoutUseCase` | — (uses all pending commissions) |
| PUT | `/profile` | `UpdateAffiliateProfileUseCase` | `updateProfileBodySchema` |
| GET | `/pix-keys` | `ListPixKeysUseCase` | — |
| POST | `/pix-keys` | `AddPixKeyUseCase` | `addPixKeyBodySchema` — `keyType`, `keyValue`, `label?`, `isDefault?` |
| PUT | `/pix-keys/:keyId/default` | `SetDefaultPixKeyUseCase` | — |
| DELETE | `/pix-keys/:keyId` | `DeletePixKeyUseCase` | — |
| POST | `/content-submissions` | `SubmitContentUseCase` | `submitContentBodySchema` — `url`, `platform`, `contentType`, `title?`, `description?`, `postedAt?` |
| POST | `/accept-proposal` | `AcceptContractProposalUseCase` | `acceptProposalBodySchema` — `lgpdData?: { ip, ua }` |
| POST | `/reject-proposal` | `RejectContractProposalUseCase` | — |

**Response envelope:** the package returns `{ success: true, data }`
(or `{ success: false, error }` with HTTP status from
`mapAffiliateErrorToHttp`). This is **not** bright-tale's canonical
`{ data, error }` shape. §4.3 defines the client-side adapter.

### `/signup` drift

`apps/api/src/lib/affiliate/config.ts:5-8` documents:

```
KNOWN GAP (resolves in 2B): package builds ${webBaseUrl}/signup?ref=X and
${webBaseUrl}/affiliate/portal. apps/app actual routes are
/[locale]/auth/signup and (TBD) /[locale]/settings/affiliate. Click
tracking still records correctly (use case fires BEFORE redirect), but the
browser lands on a 404 until 2B adds the matching URLs or apps/app rewrites.
```

Current `webBaseUrl` = `APP_ORIGIN` = `https://app.brighttale.io` (prod)
or `http://localhost:3000` in dev (since `APP_ORIGIN` is unset locally —
§6 covers this). Package-emitted URLs:

- Redirect from `/ref/:code` → `${webBaseUrl}/signup?ref=<code>` (302)
- Portal CTA in emails → `${webBaseUrl}/parceiros/login` (unused; only
  emitted in template strings — no live consumer in 2A code paths
  since email is inert without `RESEND_API_KEY` / EMAIL_PROVIDER
  — verified by inspection of `node_modules/@tn-figueiredo/affiliate/dist/index.js:237,293,406,425`)
- Dashboard CTA in emails → `${webBaseUrl}/parceiros/dashboard` (same)

**Resolution (2B):**

| Drifted URL | Real app route | Fix |
|---|---|---|
| `/signup?ref=X` | `/[locale]/auth/signup?ref=X` | `beforeFiles` rewrite: `source: '/signup', destination: '/auth/signup'` in `apps/app/next.config.ts`. Preserves `?ref` automatically. `next-intl` middleware then prepends the locale prefix on the rewritten path. **Ordering matters:** a plain rewrites array in Next.js is treated as `afterFiles`, which runs *after* middleware — too late, because `next-intl` middleware would already have redirected `/signup` to `/<locale>/signup` (a 404). We must return `{ beforeFiles: [...], afterFiles: [...] }` so the `/signup → /auth/signup` rewrite happens before middleware sees the request. |
| `/parceiros/login` | n/a (no parceiros route exists) | Same `beforeFiles` rewrite: `/parceiros/login` → `/auth/login`. Retains compatibility with package email templates if/when emails fire in 2F. |
| `/parceiros/dashboard` | n/a | Same `beforeFiles` rewrite: `/parceiros/dashboard` → `/settings/affiliate`. |

The rewrite approach is chosen over creating real `/signup` and
`/parceiros/*` pages because:

1. It does not duplicate page code.
2. It keeps a single canonical URL (`/auth/signup`, `/settings/affiliate`)
   discoverable in the codebase.
3. It keeps the package stock (no fork, no config override).
4. `next-intl` with `localePrefix: 'always'` handles the locale
   inference; rewrite target is locale-agnostic; middleware then inserts
   the locale prefix downstream.

Request flow for `/ref/:code` click:

1. `GET /ref/<code>` hits apps/api → `TrackAffiliateLinkClickUseCase` fires
   (verified at `routes.js:4345`) → 302 redirect to `${webBaseUrl}/signup?ref=<code>`.
2. Browser follows → `GET https://app.brighttale.io/signup?ref=<code>`.
3. apps/app Next.js: `beforeFiles` rewrite rule matches `/signup` →
   internal path becomes `/auth/signup?ref=<code>`.
4. Middleware (proxy.ts → intlMiddleware) runs; pathname `/auth/signup`
   has no locale prefix → `next-intl` redirects to `/<defaultLocale>/auth/signup?ref=<code>`
   (preserving the `?ref` query string per `next-intl` docs; verified
   against existing `isAuthPage` handling in `proxy.ts:113-120`).
5. Server renders `apps/app/src/app/[locale]/(auth)/auth/signup/page.tsx`
   with `useSearchParams().get('ref') === <code>` → localStorage shim
   (§4.8) captures ref for post-confirmation use.

### Known gaps and debt

- **Envelope impedance** (package `{ success, data }` vs. bright-tale
  `{ data, error }`) is an unresolved cross-cutting concern. Two valid
  approaches: (A) adapter at the API boundary (bright-tale Fastify
  `onSend` hook translates the package envelope), (B) adapter at the
  client boundary (hook in the fetch wrapper). **Chosen: B** (§4.3).
  Rationale: API-side translation requires touching every package
  route to remap; client-side adapter is one helper used by all
  affiliate UI code; leaves the API transparent to the package's native
  shape (cleaner when we upgrade package versions later). Tradeoff:
  raw `/api/affiliate/*` responses seen in Network tab or curl are not
  bright-tale-canonical — documented in §6.
- **No currency utility.** The current page hand-rolls `R$ ${...}`.
  2B adds `Intl.NumberFormat` with locale-dispatch. Reused pattern for
  dates too.
- **`clicks-by-platform` endpoint is new.** Adds a small chart or table
  in the dashboard; if empty, section hides (no zero-state treatment
  required).
- **No loading state skeletons today** beyond a single top-level
  animated bar. 2B uses shadcn `Skeleton` per section (tier card, PIX
  list, commission table).

---

## 3. Target State

### Page structure

`apps/app/src/app/(app)/settings/affiliate/page.tsx` (client component
— stays under the non-localized `(app)` segment group, matching the
adjacent `/settings/billing` and `/settings/usage` pages which are also
non-localized). The page renders different state machines based on the
result of `GET /api/affiliate/me`:

```
┌─ Affiliate page ─────────────────────────────────────────────────────┐
│                                                                      │
│ State A: GET /me → 404 affiliateNotFound                             │
│   → <NotAffiliate />                                                 │
│      CTA: "Apply to join" → /settings/affiliate/apply                │
│                                                                      │
│ State B: status='pending' (application under review)                 │
│   → <PendingApplication /> — read-only, shows submitted data         │
│                                                                      │
│ State C: status in {approved, active} AND proposedTier set           │
│   → <ContractProposal /> at top of page                              │
│      Accept → POST /accept-proposal → revalidate /me                 │
│      Reject → POST /reject-proposal → revalidate /me                 │
│   BELOW: also show State D dashboard (read-only until accepted)      │
│                                                                      │
│ State D: status='active' AND no pending proposal                     │
│   → <Dashboard>                                                       │
│      <TierBadge /> — tier + commissionRate + contract expiry        │
│      <ReferralLinkCard /> — copy link, copy signup link, QR          │
│      <StatsGrid /> — 5 cards (clicks, referrals, conversions,       │
│                       pendingPayoutBrl, paidPayoutBrl)               │
│      <ClicksByPlatform /> — table (optional render)                  │
│      <RecentReferrals /> — 10 most recent                            │
│      <CommissionHistory /> — paginated client-side (20/page)         │
│      <PayoutSection /> — list + "Request payout" button              │
│      <PixKeyManager /> — list + add + setDefault + delete            │
│      <ContentSubmissions /> — list + "Submit content" dialog         │
│                                                                      │
│ State E: status='paused'                                             │
│   → banner at top "Account paused — contact support"                 │
│   → State D below, read-only (all action buttons disabled)          │
│                                                                      │
│ State F: status='terminated' or 'rejected'                           │
│   → <Terminated /> — final stats + reason + support CTA              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### File layout

```
apps/app/src/app/(app)/settings/affiliate/
├── page.tsx                             NEW — server component shell + Suspense
├── AffiliateClient.tsx                  NEW — 'use client' root; state machine
├── apply/
│   └── page.tsx                          NEW — minimal application form
├── __tests__/
│   ├── AffiliateClient.test.tsx          NEW — replaces old page.test.tsx
│   ├── tier-badge.test.tsx               NEW
│   ├── pix-key-manager.test.tsx          NEW
│   ├── payout-section.test.tsx           NEW
│   ├── commission-history.test.tsx       NEW
│   ├── contract-proposal.test.tsx        NEW
│   ├── content-submissions.test.tsx      NEW
│   └── envelope-adapter.test.ts          NEW
└── components/
    ├── strings.ts                        NEW — pt-BR constants (future i18n seed)
    ├── tier-badge.tsx                    NEW
    ├── contract-proposal.tsx             NEW
    ├── referral-link-card.tsx            NEW
    ├── stats-grid.tsx                    NEW
    ├── clicks-by-platform.tsx            NEW
    ├── recent-referrals.tsx              NEW
    ├── commission-history.tsx            NEW
    ├── payout-section.tsx                NEW
    ├── pix-key-manager.tsx               NEW
    └── content-submissions.tsx           NEW

apps/app/src/lib/
├── affiliate-api.ts                      NEW — typed client + envelope adapter
└── formatters.ts                         NEW (if not existing) — currency/date

apps/app/next.config.ts                    MODIFIED — add 3 rewrites (beforeFiles)
apps/app/src/app/[locale]/(auth)/auth/signup/page.tsx
                                           MODIFIED (4 lines) — capture ?ref
apps/api/src/lib/affiliate/config.ts       MODIFIED — delete stale comment,
                                           add new TODO referencing 2B plan
```

**Note on non-localized segment:** the page lives under `(app)/settings/`
not `[locale]/(app)/settings/`. This mirrors existing
`/settings/billing` and `/settings/usage` (both hard-coded pt-BR).
`NextIntlClientProvider` is wired **only** inside `[locale]/layout.tsx`;
the root `src/app/layout.tsx` does not wrap the provider and there is
no `(app)/layout.tsx`. Therefore `useTranslations()` from `next-intl`
**will not work** on this page without either (a) moving the whole
settings tree under `[locale]/`, (b) introducing an `(app)/layout.tsx`
that wraps `NextIntlClientProvider`, or (c) duplicating provider logic.
All three are out of scope — this is a cross-cutting refactor that
touches billing, usage, channels, and content as well. 2B holds the
parity pattern: pt-BR hard-coded, funneled through a `strings.ts`
constants module to minimize extraction cost later.

### Public API (client-side)

**`apps/app/src/lib/affiliate-api.ts`:**

```ts
export interface AffiliateApi {
  getMe(): Promise<Affiliate | null>;       // null on 404 affiliate-not-found
  getStats(): Promise<AffiliateStats>;
  getReferrals(): Promise<AffiliateReferral[]>;
  getCommissions(): Promise<AffiliateCommission[]>;
  getClicksByPlatform(): Promise<ClickByPlatform[]>;
  listPixKeys(): Promise<AffiliatePixKey[]>;
  addPixKey(input: AddPixKeyInput): Promise<AffiliatePixKey>;
  setDefaultPixKey(keyId: string): Promise<void>;
  deletePixKey(keyId: string): Promise<void>;
  submitContent(input: SubmitContentInput): Promise<AffiliateContentSubmission>;
  acceptProposal(lgpdData?: { ip: string; ua: string }): Promise<Affiliate>;
  rejectProposal(): Promise<Affiliate>;
  requestPayout(): Promise<AffiliatePayout>;
  apply(input: ApplyAsAffiliateInput): Promise<Affiliate>;
}

export const affiliateApi: AffiliateApi;
```

All methods throw `AffiliateApiError` (`{ status, code, message }`) on
non-2xx. Types imported from `@tn-figueiredo/affiliate` (already in
`node_modules` post-2A).

### Shape preserved

- `/settings/affiliate` URL unchanged.
- Page file location unchanged (`(app)/settings/affiliate/page.tsx`).
- `/api/affiliate-legacy/*` routes untouched — legacy tests in
  `apps/api/src/__tests__/routes/affiliate-legacy.test.ts` (exists per
  2A test deltas) continue to run.

---

## 4. Architecture

### 4.1 Data flow

```
apps/app page load (client)
  │
  ▼  affiliateApi.getMe()
  │   fetch('/api/affiliate/me', { credentials: 'include' })
  │   proxy.ts middleware injects X-Internal-Key + x-user-id,
  │   forwards to apps/api via Next.js rewrite → Fastify
  │
  ▼  Fastify authenticate preHandler → deps.getMyAffiliateUseCase
  │
  ▼  package route returns { success: true, data: Affiliate }   ← NON-BT ENVELOPE
  │   OR { success: false, error: '<msg>' } with status 404/403/etc
  │
  ▼  envelope-adapter.ts (client-side) unwraps:
  │   - status 404 + success:false → returns null (caller treats as "no affiliate yet")
  │   - status 2xx + success:true → returns data
  │   - otherwise throws AffiliateApiError
  │
  ▼  <AffiliateClient> state machine renders one of 6 states (§3)
```

### 4.2 Currency and date formatting

Package uses `totalEarningsBrl`, `commissionBrl`, `totalBrl`,
`pendingPayoutBrl`, `paidPayoutBrl` as **integer BRL** (not cents).
Verified via source inspection of
`@tn-figueiredo/affiliate/dist/index.js:506-521` where
`commissionBrl = Math.round(netAmount * commissionRate)` and
`totalBrl = commissionBrl + fixedFeeBrl`. Payout threshold check at
line 666 does `amountInCents = roundedBrl * 100` before comparing
against `minimumPayoutCents` (5000), confirming the BRL→cents
conversion factor. Legacy page used cents throughout
(`total_revenue_cents`). Formatters:

```ts
export function formatBrl(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(iso));
}
```

Locale hard-coded `pt-BR` — parity with the rest of the app. Promoted
to an argument when i18n is retrofitted across settings (future).

### 4.3 Envelope adapter

**`apps/app/src/lib/affiliate-api.ts`** contains a single private
helper:

```ts
type PkgOk<T>  = { success: true;  data: T };
type PkgErr    = { success: false; error: string };
type PkgResp<T> = PkgOk<T> | PkgErr;

export class AffiliateApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/affiliate${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  });
  // 204 No Content on mutations that reply.send({ success: true }) with no body
  if (res.status === 204) return undefined as T;
  const json = (await res.json()) as PkgResp<T>;
  if (!res.ok || !json.success) {
    const msg = (json as PkgErr).error ?? `HTTP ${res.status}`;
    // Map HTTP status to short code for the UI i18n table
    const code =
      res.status === 404 ? 'NOT_FOUND' :
      res.status === 403 ? 'FORBIDDEN' :
      res.status === 409 ? 'CONFLICT' :
      res.status === 422 ? 'VALIDATION' : 'UNKNOWN';
    throw new AffiliateApiError(res.status, code, msg);
  }
  return json.data as T;
}
```

**Not a Zod-validated boundary.** We trust the package's typings
(imported at compile-time from `@tn-figueiredo/affiliate`); runtime
Zod re-validation would duplicate the package's own schema checks and
balloon client bundle size. If a package upgrade changes the wire
shape, typescript catches it; runtime surprises surface as render
errors, caught by the existing Sentry browser integration.

**Special case — `getMe()`:** the package throws
`AffiliateNotFoundError` mapped to HTTP 404. We catch this in `getMe()`
and return `null` so the caller can render State A without a try/catch
wrapper. All other methods propagate errors.

**Special case — `success:true` with no body:** `setDefaultPixKey`,
`deletePixKey`, `rejectProposal`, and some others return
`{ success: true }` with no `data` field (see `routes.js:4119-4127`).
The adapter type-asserts `T = void` for those and returns `undefined`.

### 4.4 State machine

Derived from `GET /api/affiliate/me` result + presence of a proposal.
Computed as a pure function:

```ts
type Screen =
  | 'not-affiliate' | 'pending' | 'proposal' | 'dashboard'
  | 'paused' | 'terminated';

function deriveScreen(me: Affiliate | null): Screen {
  if (!me) return 'not-affiliate';
  if (me.status === 'pending') return 'pending';
  if (me.status === 'rejected' || me.status === 'terminated') return 'terminated';
  if (me.status === 'paused') return 'paused';
  if (me.proposedTier != null || me.proposedCommissionRate != null) return 'proposal';
  // status in {approved, active} with no proposal → dashboard
  return 'dashboard';
}
```

**`approved` vs `active`:** the package's lifecycle passes through
`approved` (admin approved but affiliate hasn't accepted contract yet)
→ `active` (post-acceptance). In practice `approved` + proposal-fields
set = initial-contract proposal screen. The derivation above captures
this: any `approved`/`active` state with pending proposal fields →
`proposal`; otherwise → `dashboard`. This handles both first-time
contract acceptance and subsequent renegotiations uniformly.

### 4.5 Referral link generation

The `<ReferralLinkCard />` exposes two URLs:

1. **Direct signup link:** `${webOrigin}/signup?ref=<code>` — tied to
   the new rewrite (§2). Highest conversion — lands directly on signup.
2. **Homepage link:** `${webOrigin}/?ref=<code>` — deep link to the
   marketing page; preserves `?ref` in a localStorage shim on the
   homepage (out of scope for 2B; flagged as "future" in-code comment).
   Retained for parity with legacy UX where users may be used to
   sharing the marketing URL.

`webOrigin` resolution on the client: `window.location.origin` with
`.replace('app.', '')` (strips subdomain) when hostname starts with
`app.`; otherwise `NEXT_PUBLIC_MARKETING_URL` (new env — §6) with
localhost fallback. Explicit precedence avoids the current silent
production-vs-localhost mismatch.

### 4.6 PIX key manager

Section component, inline-expanded list. Operations:

- **List** on mount via `listPixKeys()`.
- **Add** button opens a dialog with a react-hook-form using the
  zod schema re-exported from `@tn-figueiredo/affiliate` (the package
  does not export its `addPixKeyBodySchema` publicly — verified; so we
  re-declare the same shape in `lib/affiliate-api.ts` using package
  types `AffiliatePixKeyType`). After submit → optimistic add, revert on
  error.
- **Set default** — single button per row; clicks PUT → refetch list
  (optimistic flag flip, reverts on error).
- **Delete** — confirmation via shadcn `AlertDialog`.
- **Validation** client-side: per `keyType`, regex: cpf `^\d{11}$` (mask
  strips `.`/`-`), cnpj `^\d{14}$`, email `z.string().email()`, phone
  `^\+?\d{10,13}$`, random `^[A-Za-z0-9-]{32,36}$` (PIX random keys are
  UUIDs).
- **Display** uses `keyDisplay` field from package (pre-obfuscated
  server-side — `obfuscatePixKey` exported by the package, applied in
  the lifecycle repo).

Edge case: deleting the only `isDefault` key. Package enforces
server-side that payouts cannot proceed without a default. UI copy:
"Cannot delete the default PIX key while other keys exist — set
another as default first." Client-side guard only blocks if another
key exists (otherwise the delete is allowed, leaving the affiliate
with zero PIX keys — server allows this because you can re-add later;
only payouts are blocked).

### 4.7 Payout section

- **List** shown: rendered from `me.payouts` if exposed, **OR** — since
  the end-user `/me` endpoint does not currently return payouts (only
  admin `/me/commissions` returns commissions) — we **defer a payout
  list** to a follow-up. What 2B ships: a single **"Request payout"**
  button that POSTs `/api/affiliate/payouts`, shows a confirmation
  dialog ("R$X.XX will be paid to <pixKeyDisplay>. Proceed?") with
  `pendingPayoutBrl` from `/stats` as the amount. On success → toast
  "Payout requested — admin review pending"; refetch `/stats` to
  zero-out pending. See §8 R3 for the unresolved payout-list gap.
- **Minimum payout:** `AFFILIATE_CONFIG.minimumPayoutCents` is 5000
  (R$50.00) per 2A config. Client disables button when
  `stats.pendingPayoutBrl < 50` with a tooltip showing the threshold.
- **No default PIX key:** button disabled + tooltip "Add a default PIX
  key below to enable payouts."
- **Tax ID irregular:** package may reject payout with
  `AffiliatePayoutTaxIdIrregularError` (mapped to HTTP 422). UI catches
  this specifically and shows a link "Update your tax ID" pointing to
  the profile edit page (out of scope for 2B — renders as a support
  email link for now).

### 4.8 Signup page — `?ref` capture

Modify `apps/app/src/app/[locale]/(auth)/auth/signup/page.tsx` (the
only change outside of the settings tree). Four lines:

1. Add `import { useSearchParams } from 'next/navigation';`
2. Inside `SignupPage()`, add `const ref = useSearchParams().get('ref');`
3. After successful `supabase.auth.signUp(...)`, if `ref`, call
   `localStorage.setItem('bt.ref', ref)` before the email-sent toast.
4. No UI change on the page.

The stored ref is later read by the apply flow (out of scope) or by
any post-signup attribution code. In 2B, we only ensure the ref is
captured client-side; server-side attribution was already wired in 2A
via `AttributeSignupToAffiliateUseCase` — which reads the referral
cookie set by `/ref/:code`. The localStorage shim is belt-and-suspenders
for users who share the link and land on `/auth/signup?ref=X` directly
(e.g., via the "copy signup link" button in 4.5).

### 4.9 PostHog instrumentation

Added to the 4 highest-signal flows:

| Event | Trigger | Properties |
|---|---|---|
| `affiliate_link_copied` | "copy referral link" click | `variant: 'signup' \| 'homepage'`, `tier`, `code` |
| `affiliate_payout_requested` | `POST /payouts` resolves | `amountBrl`, `tier` |
| `affiliate_proposal_accepted` | `POST /accept-proposal` resolves | `tier`, `commissionRate`, `contractVersion` |
| `affiliate_content_submitted` | `POST /content-submissions` resolves | `platform`, `contentType` |

Client via existing `window.posthog?.capture(...)` already wired in
`apps/app/src/instrumentation-client.ts`. No server-side events in 2B.

### 4.10 Error semantics

| Origin | Trigger | UI behavior |
|---|---|---|
| `affiliateApi.getMe()` | 404 affiliateNotFound | renders State A (not an error) |
| any mutation | 403 forbidden | toast "Not allowed — contact support" |
| any mutation | 409 conflict (e.g. pending proposal already open) | toast with the message verbatim from package |
| any mutation | 422 validation | toast with package message (already localized pt-BR in package) |
| any method | 500 / network | toast "Error — please retry"; Sentry captures via app-level boundary |
| all methods | `AffiliateApiError` caught | never leaks to React error boundary — all mutation handlers catch explicitly |

No re-try on transient failure (parity with the rest of the app —
credits, billing pages do not retry either). The toast CTA "Retry" is
added only on `GET /me` failure (page is dead without it).

### 4.11 Edge cases

1. **User is signed-in but not yet an affiliate** → State A, CTA to
   `/settings/affiliate/apply`.
2. **`/me` returns 404 but `localStorage.bt.ref` is set** → State A
   with a banner "You signed up via a referral — apply to join the
   affiliate program" (nicety, no functional requirement).
3. **Proposal arrives while user on dashboard page** → no live refresh
   in 2B; user sees it on next page load. `react-query` with
   refetch-on-focus adds real-time feel but introduces a dependency
   — deferred to 2F (same as the rest of the app, which is
   fetch-once-on-mount).
4. **Multiple tabs** → last-write-wins; no cross-tab sync. Parity with
   the rest of the app.
5. **User lands on `/settings/affiliate` without auth** → app
   middleware (`proxy.ts:123`) redirects to `/auth/login?next=...`.
6. **Locale switch mid-page** → not applicable; strings are hard-coded
   pt-BR and formatters use a hard-coded locale. Revisit when provider
   wrap lands.
7. **`GET /stats` fails but `/me` succeeds** → dashboard shows
   "Stats unavailable — retry" per-card skeleton; other sections
   (PIX, content, referrals) render normally.
8. **API_URL unset in prod** → catastrophic 404 from proxy, outside 2B
   scope; documented in CLAUDE.md already.
9. **Package version mismatch (server running 0.4.0, client types from
   0.5.0 after a future upgrade)** → typecheck fails in CI; caught at
   build time.

---

## 5. Testing

### 5.1 Unit tests (~55 new)

| File | Test count | Focus | Mocks |
|---|---|---|---|
| `envelope-adapter.test.ts` | ~8 | 200+success:true → data; 200+success:false (shouldn't happen but guard) → throw; 404+notFound → null via `getMe`; 404+other → throw; 500 → throw; network reject → throw; 204 → undefined; `success:true` no-data body → undefined | `global.fetch` stub |
| `AffiliateClient.test.tsx` | ~10 | State derivation across all 6 `Screen` values; re-derive on `/me` refetch after mutation; proposal screen renders even on `active` status when proposedTier set; loading state transitions; terminated renders reason | `vi.mock('@/lib/affiliate-api')` |
| `tier-badge.test.tsx` | ~4 | All 5 tiers render; commissionRate formatted as percent; contract expiry countdown — `≤30d` yellow, `≤7d` red | — |
| `pix-key-manager.test.tsx` | ~9 | List renders; add (happy, invalid CPF, invalid email, duplicate 409); set default optimistic; delete with confirm; delete default blocked when others exist; empty-state CTA | api mock |
| `payout-section.test.tsx` | ~7 | Button disabled under min; disabled without default PIX; tax-ID-irregular error surfaces specific message; confirm dialog shows amount; successful request toasts + refetches stats | api mock |
| `commission-history.test.tsx` | ~4 | Pagination (20/page); status color per `{ pending, paid, cancelled }`; retroactive badge; empty state | — |
| `contract-proposal.test.tsx` | ~6 | Initial-contract view (tier + rate + fixed-fee); renewal view (diff vs current); accept calls with `lgpdData`; reject confirms first; error during accept restores previous state; shows LGPD consent text | api mock |
| `content-submissions.test.tsx` | ~5 | Submit happy path; URL validation; platform × contentType combinations all render; list of submissions; approved/rejected badge styling | api mock |
| `referral-link-card.test.tsx` | ~3 | Copy signup link / homepage link; `window.location.origin` fallback logic; PostHog `affiliate_link_copied` fired with correct variant | `navigator.clipboard`, `window.posthog` |

Total: ~56 new. The old `__tests__/page.test.tsx` (7 tests) is
**deleted**; its coverage is superseded by `AffiliateClient.test.tsx` +
section tests.

### 5.2 Integration test (1 new)

`apps/app/src/__tests__/affiliate-integration.test.ts` — runs against
the API server (not strictly hermetic; skipped when `API_URL` unreachable).
Walks the happy path:

1. Seed test user via Supabase admin client.
2. `POST /api/affiliate/apply` with minimal input.
3. Admin-side approval using a direct container call (not via HTTP,
   since admin UI is 2C). Sets status `active` + initial proposal
   fields.
4. Client `GET /me` → State C (proposal).
5. `POST /accept-proposal` → State D.
6. `POST /pix-keys` (default = true) → `GET /pix-keys` → 1 entry.
7. Simulate a referral + commission via direct DB writes (no real
   billing integration in 2B).
8. `POST /payouts` succeeds.

Preflight: test is skipped when `AFFILIATE_INTEGRATION=0` (default off
in CI because it requires a live API + Supabase). Enabled by the
end-of-branch rehearsal (CC-4).

### 5.3 Smoke checklist (contributes to CC-4 12-item smoke)

Items added by 2B:

1. Open `/settings/affiliate` logged-out → redirect to `/auth/login`.
2. Open `/settings/affiliate` as non-affiliate → State A + "Apply"
   CTA visible.
3. Copy referral link → clipboard contains `${origin}/signup?ref=<code>`
   (verify via paste).
4. Click `/signup?ref=X` (fresh tab) → lands on `/<locale>/auth/signup`
   with `?ref=X` preserved; localStorage `bt.ref` set after clicking
   through signup.
5. [Skipped in 2B — locale switch unavailable for settings tree;
   tracked in §10 as future refactor]
6. Submit a content URL → list updates; status "pending".
7. Add a PIX key with invalid CPF → validation error before request.
8. Request payout without default PIX → button disabled + tooltip.

### 5.4 Visual regression

Not in scope for 2B. Existing settings pages lack visual tests; parity
accepted.

### 5.5 Coverage targets

| File | Branch coverage | Rationale |
|---|---|---|
| `lib/affiliate-api.ts` | ≥95% | Critical boundary; all error paths tested |
| `components/*.tsx` | ≥85% | Standard UI coverage; skeleton render paths optional |
| `AffiliateClient.tsx` | ≥90% | State machine coverage required |

Coverage scoped narrowly (same pattern as SP0 §5) via `include: ['src/app/(app)/settings/affiliate/**/*', 'src/lib/affiliate-api.ts']` — unrelated app areas keep their current (unmeasured) posture.

---

## 6. Configuration

### 6.1 Environment variables (delta from 2A)

| Var | Required when | Default | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_MARKETING_URL` | optional | `http://localhost:3002` (dev) / `https://brighttale.io` (prod) | New: used by `<ReferralLinkCard>` when `window.location.origin` doesn't start with `app.`. Client-readable. |
| `APP_ORIGIN` | existing (2A) | falls back to `https://app.brighttale.io` | Package's `webBaseUrl` → redirect target from `/ref/:code`. No change. |

No new API-side envs. Email provider (Sub-project 0) already covers
the transport layer; affiliate flows in 2B do not emit email directly
(the page is read-only of email-driven content like proposal
notifications).

### 6.2 `apps/app/.env.example` section (additive)

```bash
# ─── Affiliate (Phase 2B) ──────────────────────────────────────────────
# Marketing-site origin for affiliate referral links. Falls back per host
# logic in src/lib/affiliate-api.ts (strip 'app.' subdomain).
# NEXT_PUBLIC_MARKETING_URL=https://brighttale.io
```

### 6.3 `apps/app/next.config.ts` rewrites

Convert the existing rewrites from a plain array (afterFiles by default)
to a `{ beforeFiles, afterFiles }` object so the `/signup` shim lands
before `next-intl` middleware processes the request:

```ts
async rewrites() {
  return {
    beforeFiles: [
      { source: '/signup', destination: '/auth/signup' },
      { source: '/parceiros/login', destination: '/auth/login' },
      { source: '/parceiros/dashboard', destination: '/settings/affiliate' },
    ],
    afterFiles: [
      // Existing rewrites retained unchanged — /api/* proxy, etc.
      { source: '/api/:path*', destination: `${API_URL}/:path*` },
      // …other existing rewrites preserved…
    ],
    fallback: [],
  };
}
```

Next.js rewrites preserve query strings automatically; `?ref=X`
survives the `/signup` → `/auth/signup` transform. `next-intl`
middleware then prepends the locale on the rewritten path. The chain
`/signup?ref=X` → (beforeFiles rewrite) → `/auth/signup?ref=X` →
(intl middleware) → `/<locale>/auth/signup?ref=X` is exercised by
smoke item 4 (§5.3). **Audit the existing `rewrites()` return:** any
other entries currently in the array move under `afterFiles` unchanged.

### 6.4 String constants (`components/strings.ts`)

Not a message catalog — just a hard-coded pt-BR constants module. One
top-level object, keys shaped as the future i18n namespace so the
eventual lift is a find/replace. Illustrative subset:

```ts
export const strings = {
  title: 'Programa de Afiliados',
  back_to_settings: 'Configurações',
  state: {
    not_affiliate: {
      title: 'Você ainda não é afiliado',
      body:  'Cadastre-se para começar a indicar e receber comissões.',
      cta:   'Candidatar-se',
    },
    pending: {
      title: 'Candidatura em análise',
      body:  'Avaliamos em até 3 dias úteis.',
    },
    proposal: {
      title: 'Nova proposta de contrato',
      accept: 'Aceitar proposta',
      reject: 'Rejeitar',
      lgpd_consent: 'Ao aceitar, você concorda com os termos e o tratamento dos seus dados pessoais conforme a LGPD.',
    },
  },
  tier: { nano: 'Nano', micro: 'Micro', mid: 'Mid', macro: 'Macro', mega: 'Mega' },
  stats: {
    clicks: 'Cliques', referrals: 'Indicações', conversions: 'Conversões',
    pending: 'Pendente', paid: 'Pago',
  },
  referral: {
    copy_signup: 'Copiar link de cadastro',
    copy_homepage: 'Copiar link da página inicial',
    copied: 'Link copiado!',
  },
  // …payout, pix, content, errors sections elided…
} as const;
```

Approx 50 strings total. All pt-BR translations of the legacy page
plus new strings authored in pt-BR only. An `en.ts` twin is not
shipped in 2B — it would be dead code until the provider wrap lands.

---

## 7. Migration Path

Two commits on `feat/affiliate-2a-foundation`, following SP0's
A-additive / B-atomic pattern.

### 7.1 Commit A — scaffolding + rewrites + sign-up capture

1. Create `apps/app/src/lib/affiliate-api.ts` (envelope adapter +
   typed methods; exports types).
2. Create `apps/app/src/lib/formatters.ts` if absent (hard-coded pt-BR
   locale per §4.2).
3. Convert `apps/app/next.config.ts` `rewrites()` to the
   `{ beforeFiles, afterFiles, fallback }` shape and add the 3 shim
   rewrites under `beforeFiles`. Migrate all existing rewrites into
   `afterFiles` with zero semantic change.
4. Modify `apps/app/src/app/[locale]/(auth)/auth/signup/page.tsx` (4
   lines to capture `?ref` into localStorage).
5. Create `apps/app/src/app/(app)/settings/affiliate/components/strings.ts`
   with the pt-BR constants module (§6.4).
6. Create `__tests__/envelope-adapter.test.ts`.
7. Verify: `npm run typecheck`, `npm run lint`, `npm run test --workspace=@brighttale/app`,
   and a local `npm run dev` smoke of step 3 — `curl -I http://localhost:3000/signup?ref=abc`
   returns a 307/308 redirect to `/en/auth/signup?ref=abc` (or pt-BR,
   depending on locale-cookie default).

Commit A is non-breaking: the new files are unused by the existing
page, the rewrites add routes (do not remove), the signup page change
is backward-compatible.

### 7.2 Commit B — page rewrite (atomic — replaces legacy UI and tests)

8. Create `apps/app/src/app/(app)/settings/affiliate/AffiliateClient.tsx`
   (state machine, renders sections).
9. Create the 10 section components under `components/`.
10. Rewrite `apps/app/src/app/(app)/settings/affiliate/page.tsx` to
    render `<AffiliateClient />` inside Suspense. Server-component
    shell suffices (no SSR data fetching — all data is client-side
    via affiliateApi).
11. Create the apply stub at `apps/app/src/app/(app)/settings/affiliate/apply/page.tsx`
    — minimal form: name, email (prefilled from session), optional
    channel URL, optional suggested code → POST `/api/affiliate/apply`
    → on success, toast and route back to `/settings/affiliate`.
12. **Delete** `apps/app/src/app/(app)/settings/affiliate/__tests__/page.test.tsx`
    (drifted — superseded by the new suite).
13. Create the 8 new test files listed in §5.1.
14. Delete the stale `KNOWN GAP` comment in
    `apps/api/src/lib/affiliate/config.ts:5-9` and replace with a
    one-line note: "/signup drift resolved in Phase 2B via Next.js
    rewrite; see docs/superpowers/specs/2026-04-17-affiliate-2b-end-user-ui-design.md §6.3."
15. Update 2A spec errata: add a single line at the top of
    `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`
    referencing 2B's resolution (parity with SP0's errata pattern).
16. Full verification (§9).

### 7.3 Commit split rationale

Commit A adds infra without touching user-visible behavior; safe to
revert independently. Commit B is atomic because the page rewrite
deletes the legacy test file and creates many new files in one
coherent change — splitting it further would leave the test suite
broken mid-commit.

---

## 8. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Envelope adapter misses a 3rd package response shape (e.g., 429 rate-limit, 5xx with HTML body from Fastify before route handler runs) | Low | Adapter default path throws `AffiliateApiError(status, 'UNKNOWN', 'HTTP X')` when JSON parse fails; unit test `envelope-adapter.test.ts` covers non-JSON response body |
| R2 | Hard-coded pt-BR strings will need re-extraction when provider-wrap refactor lands | Low | Mitigated by `strings.ts` constants module with namespace-shaped keys — future lift is mechanical. Accepted as parity with billing/usage. |
| R3 | No payout list in `/me` response means users can't see prior payouts on the dashboard | Medium | Accepted in 2B; documented in §4.7. 2C's admin backfill or 2F's billing integration adds a `GET /api/affiliate/payouts` end-user route; 2B ships the single "request payout" button + toast-only confirmation. Rehearsal checklist flags this as a known limitation. |
| R4 | PIX key client-side validation regexes drift from package server-side validation | Medium | Regexes mirror `PixKeyInvalidFormatError` server messages (verified against package source). Server remains the source of truth; client regex is UX-only (early feedback). Test `pix-key-manager.test.tsx` asserts that server-rejected inputs still surface the 422 error clearly. |
| R5 | `localStorage.bt.ref` set in signup but never consumed by 2B | Low | Accepted: 2B is the producer; a future sub-project or the apply flow consumes. Out-of-scope code comment marks it. No functional break if it stays unread. |
| R6 | Next.js rewrites path-ordering: `/signup` catch-all routes might conflict with intl middleware or existing `/auth` paths | Low | Verified: `/signup` is not a current app route; `/auth/signup` is. `beforeFiles` rewrites run before middleware (per Next.js docs); `next-intl` adds locale after rewrite resolution. Smoke item 4 verifies the chain. |
| R6a | Converting existing `rewrites()` from array → `{ beforeFiles, afterFiles, fallback }` accidentally drops existing rewrites | Medium | Migration done in Commit A; `npm run build` exercises all existing rewrite sources; a preflight grep of `rewrites()` in `apps/app/next.config.ts` before the change is added to the plan. Rollback: revert the shape change — 3 new entries (the shims) are additive. |
| R7 | `NEXT_PUBLIC_MARKETING_URL` leaks to the client bundle | Low | Intentional — `NEXT_PUBLIC_*` is client-visible by design; value is the marketing site URL which is public. |
| R8 | Hydration mismatch from locale-dependent currency/date formatting | Low | Page is client-only (`'use client'`); no server-side rendered text involves formatters. Suspense boundary in `page.tsx` isolates the client component. |
| R9 | Legacy page and new page share the same URL — no way to A/B test | Low | Accepted. CC-4 (local rehearsal) is the validation; no staged rollout needed. |
| R10 | Deleting legacy test file before the replacement suite passes | Low | Commit B is atomic: delete + create in one commit. `npm test` runs at commit end. If tests fail, commit stays in local staging. |
| R11 | `useSearchParams()` inside a client component requires Suspense boundary per Next.js 16 | Low | Signup page is already client-only with no suspense boundary. `useSearchParams` works in client components without Suspense; the Suspense requirement is for `ReadonlyURLSearchParams` at build time. Verified in existing app pages that use `useSearchParams` (e.g., login page with `next` query). |
| R12 | Package upgrade to 0.5.x drops a field the UI depends on | Medium | Package pinned `--save-exact` at 0.4.0 in 2A (§8 R20). Upgrade requires re-verification; not in 2B scope. |
| R13 | `/me` returns `active` status but `proposedTier` is also set — dashboard vs proposal ambiguity | Low | §4.4 derivation covers this explicitly: any non-null `proposedTier` or `proposedCommissionRate` → proposal screen, regardless of `status`. Verified against package's proposal lifecycle (admin sets proposal → affiliate accepts/rejects → clears proposal fields). Test `AffiliateClient.test.tsx` covers the `active+proposal` case. |
| R14 | Doc drift between 2B spec and 2A spec as 2C+ land | Medium | Errata-note pattern from SP0 used; rebase cadence (CC-2) keeps drift bounded to one sub-project. |
| R15 | PostHog not initialized in user's browser (adblock) | Low | `window.posthog?.capture(...)` — no-op when undefined. Parity with the rest of the app. |

---

## 9. Done Criteria

1. `npm run typecheck` green across 4 workspaces (apps/app diff type-safe against `@tn-figueiredo/affiliate@0.4.0` types).
2. `npm run test --workspace=@brighttale/app` green — ~56 new tests plus existing suite.
3. `npm run lint --workspace=@brighttale/app` green.
4. `npm run build --workspace=@brighttale/app` green — new rewrites and page compile.
5. Smoke items 1–8 (§5.3) pass manually against `npm run dev`.
6. Zero occurrences of `/api/affiliate-legacy/` in `apps/app/src/app/(app)/settings/affiliate/**/*` (grep).
7. Zero occurrences of `commission_pct`, `total_revenue_cents`, `total_paid_cents` in `apps/app/src/**/*` (grep — these were the legacy-schema field names; new page uses package camelCase).
8. Package `{ success, data }` envelope is never parsed outside `lib/affiliate-api.ts` (grep `success:` in affiliate UI code → zero matches).
9. Legacy page test file `__tests__/page.test.tsx` deleted; new test files present (8).
10. `/signup?ref=X` in a fresh browser lands on `/<locale>/auth/signup?ref=X` with `X` preserved (smoke item 4).
11. Errata added to 2A spec; stale comment in `apps/api/src/lib/affiliate/config.ts` updated.
12. Diff total: ~1100–1500 LOC inclusive of tests and the `strings.ts` constants module (soft target; flagged in review if breached significantly).
13. Two commits on `feat/affiliate-2a-foundation` — Commit A (scaffolding) and Commit B (atomic rewrite).
14. Integration test (§5.2) green when run manually with `AFFILIATE_INTEGRATION=1` and a live local stack.

---

## 10. Out of Scope (reiterated)

- Full-featured affiliate **application** form (multi-step terms
  acceptance, social-link proof, tax-ID validation) — 2B ships a minimal
  stub under `/settings/affiliate/apply` to unblock rehearsal.
- Admin UI (2C), data cutover (2D), fraud detection (2E),
  billing/payout automation + Stripe (2F).
- Payout history list on the end-user dashboard — requires an API
  addition (see R3).
- Real-time refresh (websocket or react-query refetch-on-focus) — deferred to 2F.
- Visual regression testing for the new page.
- Moving the settings tree under `[locale]/` or wrapping
  `NextIntlClientProvider` in a new `(app)/layout.tsx` — whole-settings
  refactor, separate project.
- `en` translations of affiliate strings; shipped only as hard-coded
  pt-BR in `strings.ts` (parity with billing/usage/channels).
- Mobile-app deep link (`appStoreUrl`) UX — not currently wired anywhere in apps/app.
- Package-side envelope normalization (PR to `@tn-figueiredo/affiliate`).

---

## 11. Handoff to next sub-project (Sub-project 2 — Phase 2C admin UI)

After merge of 2B on the long-lived branch:

- `apps/app/src/lib/affiliate-api.ts` envelope adapter is reusable — 2C
  can create `affiliate-admin-api.ts` mirroring the same adapter
  against `/api/admin/affiliate/*`. Common helper (`AffiliateApiError`,
  the `call<T>()` function) can be extracted to
  `apps/app/src/lib/api-envelope.ts` in 2C if both adapters diverge only
  in base path.
- The `strings.ts` constants module uses keys shaped like a future
  i18n namespace (`affiliate.*`); if 2C eventually lands provider-wrap
  refactor, extraction is structural find/replace.
- Smoke checklist items 1–8 from 2B pass and stay wired; 2C adds its
  own admin-scoped smoke items.
- `/settings/affiliate` is the canonical end-user entrypoint; 2C's
  admin UI lives in `apps/web` per CLAUDE.md memory note ("Admin
  location — Admin/settings pages go in apps/web, NOT apps/app").
- Open known-gap carried to 2C: payout history list on end-user
  dashboard (R3) — 2C can add a `GET /api/affiliate/payouts` end-user
  route if it's a small wrapper around the existing admin use case,
  OR defer to 2F.
- `/signup` rewrite is live; any new affiliate-entry URL (e.g., `/apply?ref=`)
  should follow the same pattern: app-owned route, package-generated
  URLs shimmed via rewrite.
- `NEXT_PUBLIC_MARKETING_URL` is set in the app env; reusable in other
  features that build cross-origin links.

---

## 12. References

- Affiliate 2A spec: `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md` (§11.2B handoff notes)
- Email provider abstraction (Sub-project 0): `docs/superpowers/specs/2026-04-17-email-provider-abstraction-design.md`
- Legacy end-user page: `apps/app/src/app/(app)/settings/affiliate/page.tsx`
- Legacy test file (to delete): `apps/app/src/app/(app)/settings/affiliate/__tests__/page.test.tsx`
- Legacy backing route (stays until 2D): `apps/api/src/routes/affiliate-legacy.ts`
- New routes registered: `apps/api/src/index.ts:195-221`
- Container: `apps/api/src/lib/affiliate/container.ts`
- Stale comment to resolve: `apps/api/src/lib/affiliate/config.ts:5-9`
- Package route source: `node_modules/@tn-figueiredo/affiliate/dist/routes.js:4060-4148`
- Package type definitions: `node_modules/@tn-figueiredo/affiliate/dist/fraud-admin-DiX4kqdI.d.ts:22-296`
- Next.js 16 rewrites: https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites
- `next-intl` request-config resolver (for future provider-wrap refactor): `apps/app/src/i18n/request.ts`
- Next.js rewrites ordering (`beforeFiles` vs `afterFiles`): https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites#rewrite-order
- App middleware / proxy: `apps/app/src/proxy.ts`
- CLAUDE.md admin-location memory: "Admin/settings pages go in apps/web, NOT apps/app" — 2C relevance only

---

## Appendix A — Code skeletons

### A.1 `apps/app/src/lib/affiliate-api.ts`

```ts
import type {
  Affiliate, AffiliateStats, AffiliateReferral, AffiliateCommission,
  AffiliatePixKey, AffiliatePixKeyType, AffiliatePayout,
  AffiliateContentSubmission, ContentSubmissionPlatform, ContentSubmissionType,
  ApplyAsAffiliateInput,
} from '@tn-figueiredo/affiliate';

export class AffiliateApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION' | 'UNKNOWN',
    message: string,
  ) {
    super(message);
    this.name = 'AffiliateApiError';
  }
}

type PkgOk<T>  = { success: true;  data?: T };
type PkgErr    = { success: false; error: string };
type PkgResp<T> = PkgOk<T> | PkgErr;

function codeFor(status: number): AffiliateApiError['code'] {
  if (status === 404) return 'NOT_FOUND';
  if (status === 403) return 'FORBIDDEN';
  if (status === 409) return 'CONFLICT';
  if (status === 422 || status === 400) return 'VALIDATION';
  return 'UNKNOWN';
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/affiliate${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  });
  if (res.status === 204) return undefined as T;

  let json: PkgResp<T>;
  try {
    json = (await res.json()) as PkgResp<T>;
  } catch {
    throw new AffiliateApiError(res.status, codeFor(res.status), `HTTP ${res.status}`);
  }

  if (!res.ok || !('success' in json) || json.success === false) {
    const msg = (json as PkgErr).error ?? `HTTP ${res.status}`;
    throw new AffiliateApiError(res.status, codeFor(res.status), msg);
  }
  return (json.data as T) ?? (undefined as T);
}

export interface AddPixKeyInput {
  keyType: AffiliatePixKeyType;
  keyValue: string;
  label?: string;
  isDefault?: boolean;
}

export interface SubmitContentInput {
  url: string;
  platform: ContentSubmissionPlatform;
  contentType: ContentSubmissionType;
  title?: string;
  description?: string;
  postedAt?: string;
}

export const affiliateApi = {
  async getMe(): Promise<Affiliate | null> {
    try {
      return await call<Affiliate>('/me');
    } catch (err) {
      if (err instanceof AffiliateApiError && err.code === 'NOT_FOUND') return null;
      throw err;
    }
  },
  getStats:            ()     => call<AffiliateStats>('/stats'),
  getReferrals:        ()     => call<AffiliateReferral[]>('/referrals'),
  getCommissions:      ()     => call<AffiliateCommission[]>('/me/commissions'),
  getClicksByPlatform: ()     => call<{ sourcePlatform: string; clicks: number; conversions: number }[]>('/clicks-by-platform'),
  listPixKeys:         ()     => call<AffiliatePixKey[]>('/pix-keys'),
  addPixKey:           (i: AddPixKeyInput) => call<AffiliatePixKey>('/pix-keys', { method: 'POST', body: JSON.stringify(i) }),
  setDefaultPixKey:    (id: string) => call<void>(`/pix-keys/${encodeURIComponent(id)}/default`, { method: 'PUT' }),
  deletePixKey:        (id: string) => call<void>(`/pix-keys/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  submitContent:       (i: SubmitContentInput) => call<AffiliateContentSubmission>('/content-submissions', { method: 'POST', body: JSON.stringify(i) }),
  acceptProposal:      (lgpdData?: { ip: string; ua: string }) =>
    call<Affiliate>('/accept-proposal', { method: 'POST', body: JSON.stringify({ lgpdData }) }),
  rejectProposal:      () => call<Affiliate>('/reject-proposal', { method: 'POST', body: '{}' }),
  requestPayout:       () => call<AffiliatePayout>('/payouts', { method: 'POST', body: '{}' }),
  apply:               (i: ApplyAsAffiliateInput) =>
    call<Affiliate>('/apply', { method: 'POST', body: JSON.stringify(i) }),
};
```

The decision **not** to generate the client from an OpenAPI schema
(no such schema is emitted by the package) or to use a library like
`ky`/`axios` keeps the dependency graph minimal. Native `fetch` matches
the rest of the app (`apps/app/src/app/(app)/channels/...` all use
native fetch).

### A.2 `apps/app/src/app/(app)/settings/affiliate/AffiliateClient.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Affiliate, AffiliateStats } from '@tn-figueiredo/affiliate';
import { affiliateApi, AffiliateApiError } from '@/lib/affiliate-api';
import { Skeleton } from '@/components/ui/skeleton';
import { strings } from './components/strings';
import { NotAffiliate } from './components/not-affiliate';
import { PendingApplication } from './components/pending-application';
import { ContractProposal } from './components/contract-proposal';
import { Dashboard } from './components/dashboard';
import { Terminated } from './components/terminated';

type Screen =
  | 'loading' | 'not-affiliate' | 'pending' | 'proposal'
  | 'dashboard' | 'paused' | 'terminated';

function deriveScreen(me: Affiliate | null): Exclude<Screen, 'loading'> {
  if (!me) return 'not-affiliate';
  if (me.status === 'pending') return 'pending';
  if (me.status === 'rejected' || me.status === 'terminated') return 'terminated';
  if (me.status === 'paused') return 'paused';
  if (me.proposedTier != null || me.proposedCommissionRate != null) return 'proposal';
  return 'dashboard';
}

export function AffiliateClient() {
  const [me, setMe] = useState<Affiliate | null>(null);
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [screen, setScreen] = useState<Screen>('loading');

  const load = async () => {
    try {
      const m = await affiliateApi.getMe();
      setMe(m);
      setScreen(deriveScreen(m));
      if (m && (m.status === 'active' || m.status === 'approved' || m.status === 'paused')) {
        setStats(await affiliateApi.getStats());
      }
    } catch (err) {
      const msg = err instanceof AffiliateApiError ? err.message : strings.errors.unknown;
      toast.error(msg);
    }
  };

  useEffect(() => { load(); }, []);

  if (screen === 'loading')       return <LoadingSkeleton />;
  if (screen === 'not-affiliate') return <NotAffiliate />;
  if (screen === 'pending')       return <PendingApplication me={me!} />;
  if (screen === 'terminated')    return <Terminated me={me!} />;
  if (screen === 'proposal')      return <ContractProposal me={me!} onResolved={load} />;
  // dashboard + paused (paused renders read-only dashboard)
  return <Dashboard me={me!} stats={stats} readOnly={screen === 'paused'} onMutate={load} />;
}

function LoadingSkeleton() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
```

### A.3 `apps/app/src/app/(app)/settings/affiliate/page.tsx`

```tsx
import { AffiliateClient } from './AffiliateClient';

export default function AffiliatePage() {
  return <AffiliateClient />;
}
```

Server-component shell; the Suspense boundary is unnecessary because
`AffiliateClient` is fully client-side and manages its own loading
state. The indirection exists so that future enhancements (e.g.,
fetching `/me` on the server to avoid the initial flash) can be added
without touching the client component.

### A.4 `apps/app/src/app/(app)/settings/affiliate/components/pix-key-manager.tsx` (skeleton)

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { AffiliatePixKey, AffiliatePixKeyType } from '@tn-figueiredo/affiliate';
import { affiliateApi, AffiliateApiError } from '@/lib/affiliate-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { strings } from './strings';

interface Props {
  pixKeys: AffiliatePixKey[];
  readOnly: boolean;
  onChange: () => void;
}

const VALIDATORS: Record<AffiliatePixKeyType, (v: string) => boolean> = {
  cpf:    v => /^\d{11}$/.test(v.replace(/[.-]/g, '')),
  cnpj:   v => /^\d{14}$/.test(v.replace(/[./-]/g, '')),
  email:  v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  phone:  v => /^\+?\d{10,13}$/.test(v.replace(/\s/g, '')),
  random: v => /^[A-Za-z0-9-]{32,36}$/.test(v),
};

export function PixKeyManager({ pixKeys, readOnly, onChange }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const handleSetDefault = async (id: string) => {
    setBusy(id);
    try {
      await affiliateApi.setDefaultPixKey(id);
      onChange();
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusy(id);
    try {
      await affiliateApi.deletePixKey(id);
      onChange();
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    } finally {
      setBusy(null);
    }
  };

  // full JSX with list, add-dialog, etc. elided for brevity.
  // Shape follows existing settings pages (billing, usage).
  return <section>/* ... */</section>;
}
```

### A.5 `apps/app/next.config.ts` rewrites block (diff)

```ts
async rewrites() {
  return {
    // NEW — beforeFiles runs before middleware so next-intl doesn't
    // redirect /signup to /<locale>/signup (which would miss the shim).
    beforeFiles: [
      { source: '/signup',              destination: '/auth/signup' },
      { source: '/parceiros/login',     destination: '/auth/login' },
      { source: '/parceiros/dashboard', destination: '/settings/affiliate' },
    ],
    afterFiles: [
      // Existing /api/* proxy and any other existing rewrites move here
      // with no semantic change.
      { source: '/api/:path*', destination: `${API_URL}/:path*` },
      // …existing non-affiliate rewrites retained unchanged…
    ],
    fallback: [],
  };
}
```

### A.6 `apps/app/src/app/[locale]/(auth)/auth/signup/page.tsx` (4-line diff)

```diff
 'use client';

 import { useState } from 'react';
+import { useSearchParams } from 'next/navigation';
 import { Link } from '@/i18n/navigation';
 // …

 export default function SignupPage() {
+  const ref = useSearchParams().get('ref');
   const [email, setEmail] = useState('');
   // …

   async function handleSignup(e: React.FormEvent) {
     e.preventDefault();
     // …existing validation…

     const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
     if (error) { toast.error(error.message); setLoading(false); return; }

+    if (ref) { try { localStorage.setItem('bt.ref', ref); } catch {} }
     setEmailSent(true);
     setLoading(false);
   }
```

The `try/catch` guards against private-mode Safari throwing on
localStorage writes.

Remaining component skeletons (tier-badge, contract-proposal,
payout-section, referral-link-card, stats-grid, clicks-by-platform,
recent-referrals, commission-history, content-submissions) follow the
same pattern as A.4 and are straightforward given the package types —
reference existing settings pages for shadcn card/table/dialog
conventions.
