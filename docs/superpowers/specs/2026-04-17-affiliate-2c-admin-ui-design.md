# Affiliate Phase 2C — Admin UI adoption (`@tn-figueiredo/affiliate-admin@0.3.3`) — Design Spec

**Date:** 2026-04-17
**Status:** draft (post-brainstorm, pre-plan)
**Context:** Sub-project 2 of the affiliate-migration long-lived branch
(`feat/affiliate-2a-foundation`). Depends on SP0 (email provider abstraction,
already merged on branch) and SP1 (Phase 2B end-user UI — in flight). 2C is
independent of 2B at the code level; only the branch ordering matters, and
the cross-cutting rebase cadence (CC-2) keeps merges clean.

Phase 2C adopts the published `@tn-figueiredo/affiliate-admin@0.3.3` RSC
package to render the affiliate admin surface in `apps/web` (not `apps/app`
— admin pages always live in `apps/web` per codebase convention). The work
is additive: all 16 HTTP admin routes (`/api/admin/affiliate/*`) are already
wired by Phase 2A on `apps/api`. This sub-project only builds the six RSC
pages that consume them and adds one sidebar entry.

---

## 1. Context & Goals

### Background

Phase 2A (merged on-branch as of commit `51e2904` / `15bac3c`) installed
`@tn-figueiredo/affiliate@0.4.0`, shipped 10 new tables, 35 wired use cases,
and registered the HTTP surface:

```
/api/admin/affiliate/      (16 routes — auth + isAdmin)
/api/affiliate/            (16 routes — auth)
/api/internal/affiliate/   (1 route — auth)
/api/ref/:code             (public redirect + tracking)
```

The 16 admin routes cover the full operator surface: affiliate list, detail,
approve, pause, renew, propose / cancel contract change, payout approve /
reject / complete, content submission review, fraud flag resolve, risk-score
list, pending-contracts list. See 2A spec §6 `URL surface`.

`@tn-figueiredo/affiliate-admin@0.3.3` (verified via `npm pack` + README +
`.d.ts` extraction — see Appendix A.4) is the companion RSC package. It
exports:

- `AffiliateAdminProvider` (client) — context for `AffiliateAdminActions`
  (14 imperative functions) and `AffiliateAdminConfig` (basePath, locale,
  currency, tier labels, contract metadata).
- 5 RSC components under `/server`: `AffiliateListServer`,
  `AffiliateDetailServer`, `AffiliatePayoutsServer`, `AffiliateFraudServer`,
  `AffiliateContentServer`.
- Two display-only types (`AffiliateFraudFlag`, `AffiliateRiskScore`) and
  formatters (`formatCurrency`, `formatCommission`).

Phase 1 (admin shell) installed `@tn-figueiredo/admin@0.6.2` in `apps/web`
and established the routing pattern: filesystem routes live at
`/zadmin/*`, rewritten to `/${NEXT_PUBLIC_ADMIN_SLUG}/*` (default `admin`).
`ProtectedLayout` (`apps/web/src/app/zadmin/(protected)/layout.tsx`) does
Supabase auth + `isAdminUser` gating. `ADMIN_LAYOUT_CONFIG`
(`apps/web/src/lib/admin-layout-config.tsx`) drives the sidebar.

### Goals

1. Install `@tn-figueiredo/affiliate-admin@0.3.3 --save-exact` in `apps/web`
   (pinned, no caret).
2. Add one sidebar entry to `ADMIN_LAYOUT_CONFIG`:
   `{ label: 'Afiliados', path: adminPath('/affiliates'), icon: 'Users2' }`.
3. Ship six Server Component pages under
   `apps/web/src/app/zadmin/(protected)/affiliates/` wrapping the package's
   `*ServerComponent` exports:

   | Route (filesystem) | Public URL | Package component |
   |---|---|---|
   | `affiliates/page.tsx` | `/${slug}/affiliates` | `AffiliateListServer` |
   | `affiliates/[id]/page.tsx` | `/${slug}/affiliates/:id` | `AffiliateDetailServer` |
   | `affiliates/payouts/page.tsx` | `/${slug}/affiliates/payouts` | `AffiliatePayoutsServer` |
   | `affiliates/fraud/page.tsx` | `/${slug}/affiliates/fraud` | `AffiliateFraudServer` |
   | `affiliates/content/page.tsx` | `/${slug}/affiliates/content` | `AffiliateContentServer` |
   | `affiliates/layout.tsx` | wraps subtree | (client layout with `AffiliateAdminProvider`) |

4. Implement 10 client actions in `actions/*.ts` fulfilling the
   `AffiliateAdminActions` contract for supported operations. Each is a
   thin `fetch(...)` wrapper over **BFF proxy routes** at
   `/api/zadmin/affiliate/*` in `apps/web` (the slug-rewritten equivalent
   is `/api/${slug}/affiliate/*`). Each BFF route verifies session +
   `isAdminUser`, injects `X-Internal-Key`, and forwards the request to
   `apps/api` at `/admin/affiliate/*`. This mirrors the pattern already
   in use for `/api/zadmin/users/[id]/route.ts` and keeps apps/web's
   `INTERNAL_API_KEY` exposure strictly server-side. Errors surface to
   the user via the package's `AffiliateAdminErrorFallback`.
5. **Skip the 4 orphan actions** (`revalidateTaxId`, `addSocialLink`,
   `deleteSocialLink`, `verifySocialLinks`) via no-op stubs that throw
   `[affiliate-admin] <action> not wired in 2C — tracked as TODO-2F`. Record
   the decision in `apps/web/src/app/zadmin/(protected)/affiliates/TODO-2F.md`
   so the orphan set has a single discoverable anchor. See §11 for the full
   analysis and rollback path.
6. Server-side data fetching for the six pages calls Phase 2A admin routes
   via `adminFetch()` (server-only helper; injects `X-Internal-Key`
   + resolved Supabase user ID). See Architecture §4 for exact flow. The
   direct server-side fetch bypasses the BFF layer because RSC code runs
   inside the apps/web Node runtime and already has the secret in env —
   the BFF layer exists specifically to keep the secret out of the
   browser, which is the write-path concern, not the RSC read-path.
7. No new Zod schemas (the RSC render functions accept structural types;
   the underlying entity types come from `@tn-figueiredo/affiliate`). Two
   internal wrapper types (`AffiliateListData`, `AffiliateDetailPageData`)
   are NOT re-exported by the admin package and must be reconstructed
   locally from the extracted d.ts — see Appendix A.1. Narrow at the
   fetch boundary via a defensive shape check (`isArray(items)`,
   `typeof total === 'number'`), not Zod.
8. Add 17 unit tests (10 client-action adapters + 4 skipped-action stubs
   + 3 BFF proxy) + 1 smoke-test rehearsal checklist (9 manual flows, no
   Docker).
9. Preserve local-only validation posture (CC-3, CC-4): no staging soak.

### Non-goals (explicitly out of scope for 2C)

- Visual theming customization beyond the package defaults (CSS vars
  already set at root `globals.css` via Phase 1).
- PostHog admin-action events (deferred with 2B/2C group — 2F or later).
- Mobile responsive polish for admin (desktop-only per 2A spec §1 non-goals).
- Real fraud-detection impl (2E — `AffiliateFraudServer` just renders data
  from 2A's stub).
- Real Tax ID validation — `revalidateTaxId` is intentionally skipped (2F).
- Social-link management — `addSocialLink` / `deleteSocialLink` /
  `verifySocialLinks` skipped (2F). The package's `VerifySocialLinksUseCase`
  exists but has **no HTTP route** in Phase 2A; wiring requires a custom
  route or an upstream PR.
- i18n: pt-BR is hardcoded via `AffiliateAdminConfig.locale: 'pt-BR'`.
  `/admin/tier-labels` override deferred.
- Cutover of the legacy admin UI (there is none — the custom 2A affiliate
  impl never shipped an admin surface, so there is nothing to retire in 2C).
- Stripe / PIX-payout automation backend — payout approval in 2C is a thin
  UI over the existing admin route; actual money movement stays manual.
- Branch rename (CC-1): long-lived `feat/affiliate-2a-foundation` keeps its
  name through 2C merge to trunk.

---

## 2. Current State

### Phase 2A delivered (on-branch, already merged)

```
apps/api/src/routes/(registered via src/index.ts:213-221)
├─ /api/admin/affiliate/             16 routes (AffiliateAdminRouteDeps, 17 use cases)
├─ /api/affiliate/                   16 routes (AffiliateRouteDeps, 16 use cases)
├─ /api/internal/affiliate/          1 route (expire-pending)
└─ /api/ref/:code                    public redirect + tracking

apps/api/src/lib/affiliate/
├─ container.ts                      buildAffiliateContainer() → adminDeps (17 uc) + endUserDeps (16 uc)
├─ auth-context.ts                   getAuthenticatedUser + isAdmin
├─ email-service.ts                  via @/lib/email/provider (SP0)
├─ tax-id-service.ts                 StubTaxIdRepository (real impl 2F)
└─ repository/                       11 sub-repos (52 methods)
```

Admin route inventory (verified Grep `/api/admin/affiliate` in 2A spec §6):

| Method | Path | Use case |
|---|---|---|
| GET | `/` | `GetAdminAffiliateOverviewUseCase` |
| GET | `/:id` | `GetAdminAffiliateDetailUseCase` |
| GET | `/pending-contracts` | `GetPendingContractsAffiliatesUseCase` |
| GET | `/payouts` | `ListAllPayoutsUseCase` |
| GET | `/fraud-flags` | `ListAffiliateFraudFlagsUseCase` |
| GET | `/risk-scores` | `ListAffiliateRiskScoresUseCase` |
| POST | `/:id/approve` | `ApproveAffiliateUseCase` |
| POST | `/:id/pause` | `PauseAffiliateUseCase` |
| POST | `/:id/renew` | `RenewAffiliateContractUseCase` |
| POST | `/:id/propose-change` | `ProposeContractChangeUseCase` |
| POST | `/:id/cancel-proposal` | `CancelProposalUseCase` |
| POST | `/fraud-flags/:flagId/resolve` | `ResolveFraudFlagUseCase` |
| POST | `/:id/payouts/:payoutId/approve` | `ApprovePayoutUseCase` |
| POST | `/:id/payouts/:payoutId/reject` | `RejectPayoutUseCase` |
| POST | `/:id/payouts/:payoutId/complete` | `CompletePayoutUseCase` |
| PUT | `/content-submissions/:submissionId/review` | `ReviewContentSubmissionUseCase` |

### `apps/web` admin shell (Phase 1)

```
apps/web/
├─ next.config.ts                    transpilePackages: ['@tn-figueiredo/admin', '@brighttale/shared']
│                                    rewrites /${slug}/* → /zadmin/*
├─ src/lib/admin-layout-config.tsx   ADMIN_LAYOUT_CONFIG: 2 groups (Principal, Gestão × 4 items)
├─ src/lib/admin-path.ts             adminPath(sub) helper
├─ src/lib/admin-check.ts            isAdminUser(supabase, userId) — reads user_roles
└─ src/app/zadmin/
   ├─ login, logout, forgot-password, reset-password
   └─ (protected)/
      ├─ layout.tsx                  server-side auth gate + AdminShell
      ├─ admin-shell.tsx             'use client' — createAdminLayout(ADMIN_LAYOUT_CONFIG)
      ├─ page.tsx                    Dashboard
      ├─ theme-toggle.tsx            sidebar slot
      ├─ users/ {page, components/×6}
      ├─ orgs/  {page, components/×1}
      ├─ agents/ {page, [slug]/, pipeline}
      └─ analytics/ {page}
```

**Data-access convention:** apps/web admin pages call
`createAdminClient()` (service-role Supabase client in
`apps/web/src/lib/supabase/admin.ts`) directly for same-DB CRUD
(users, orgs). Pattern: page.tsx is RSC, directly runs queries, passes
server-rendered data to client `*-table.tsx` components.

**Exception: cross-app API calls.** Only one current pattern — the
`page.tsx` dashboard fetches `${process.env.API_URL}/health` (no-store).
Phase 2C extends this: affiliate admin pages fetch `/api/admin/affiliate/*`
(apps/api) instead of talking to Supabase directly, because 2A owns the
business logic (use cases, email side-effects, auth-context). Duplicating
that logic in apps/web would drift; fetching via the existing trust channel
keeps one source of truth.

### Gaps and debt at start of 2C

- No "Afiliados" entry in the admin sidebar.
- No page files under `affiliates/`.
- `@tn-figueiredo/affiliate-admin` not in `apps/web/package.json`.
- `transpilePackages` in `apps/web/next.config.ts` must gain one entry
  (`@tn-figueiredo/affiliate-admin`) — see §6.
- `createAdminLayout` currently runs client-side only (Phase 1 shim). The
  affiliate-admin pages are RSCs importing from `/server`; they render
  *inside* a nested `<AffiliateAdminProvider>` (client boundary) but
  themselves are Server Components. Verified no collision with the existing
  `(protected)/admin-shell.tsx` client wrapper — the RSC children flow
  through seamlessly because React 19 re-enters RSC streaming after any
  client component that yields `children`.

---

## 3. Target State

### Filesystem additions (apps/web)

```
apps/web/
├─ package.json                         +1 dep: @tn-figueiredo/affiliate-admin@0.3.3
├─ next.config.ts                       transpilePackages +1
├─ src/
│  ├─ lib/
│  │  ├─ admin-layout-config.tsx        +1 sidebar item ('Afiliados')
│  │  └─ admin/affiliate-queries.ts     NEW — server-side fetch helpers (read path)
│  ├─ app/zadmin/(protected)/affiliates/
│  │  ├─ layout.tsx                     NEW — RSC; renders <AffiliateAdminClientLayout>
│  │  ├─ client-layout.tsx              NEW — 'use client'; AffiliateAdminProvider + actions
│  │  ├─ page.tsx                       NEW — list (AffiliateListServer)
│  │  ├─ [id]/page.tsx                  NEW — detail (AffiliateDetailServer)
│  │  ├─ payouts/page.tsx               NEW — payouts review (AffiliatePayoutsServer)
│  │  ├─ fraud/page.tsx                 NEW — fraud flags + risk (AffiliateFraudServer)
│  │  ├─ content/page.tsx               NEW — content moderation (AffiliateContentServer)
│  │  ├─ actions/                       NEW — client-side fetch wrappers over BFF routes
│  │  │  ├─ affiliates.ts               approve, pause, proposeChange, cancelProposal, renew
│  │  │  ├─ payouts.ts                  approvePayout, rejectPayout, completePayout
│  │  │  ├─ content.ts                  reviewContent
│  │  │  ├─ fraud.ts                    resolveFlag
│  │  │  ├─ skipped-2f.ts               revalidateTaxId / addSocialLink / delete / verify (throw)
│  │  │  └─ index.ts                    re-exports as AffiliateAdminActions object
│  │  └─ TODO-2F.md                     skipped-action rationale
│  └─ app/api/zadmin/affiliate/         NEW — BFF proxy routes (forward to apps/api)
│     ├─ [id]/approve/route.ts
│     ├─ [id]/pause/route.ts
│     ├─ [id]/renew/route.ts
│     ├─ [id]/propose-change/route.ts
│     ├─ [id]/cancel-proposal/route.ts
│     ├─ [id]/payouts/[payoutId]/approve/route.ts
│     ├─ [id]/payouts/[payoutId]/reject/route.ts
│     ├─ [id]/payouts/[payoutId]/complete/route.ts
│     ├─ content-submissions/[submissionId]/review/route.ts
│     ├─ fraud-flags/[flagId]/resolve/route.ts
│     └─ _shared/proxy.ts               NEW — `proxyToApi(req, target, method)` helper
└─ src/__tests__/app/zadmin/affiliates/
   ├─ actions-affiliates.test.ts        5 tests (action → BFF URL)
   ├─ actions-payouts.test.ts           3 tests
   ├─ actions-content-fraud.test.ts     2 tests
   ├─ skipped-2f.test.ts                4 tests (each throws with right marker)
   └─ proxy.test.ts                     3 tests (proxy helper: happy / 401 / 403)
```

Remote access shape: the browser fires `POST /${slug}/api/affiliate/:id/approve`
(no `X-Internal-Key` possible — browser cannot hold the secret). The apps/web
rewrite `/api/${slug}/:path* → /api/zadmin/:path*` (in `next.config.ts`) lands
the request at the BFF route `/api/zadmin/affiliate/:id/approve` which
re-auths via Supabase session cookie, attaches `X-Internal-Key`, and forwards
to `${API_URL}/admin/affiliate/:id/approve`. Both hops share the `{data, error}`
envelope; the BFF passes the apps/api body through unchanged (status code +
body), keeping the package's error-parsing logic unchanged.

### Public API (`apps/web` external surface)

Six new public page URLs (slug-rewritten):

```
GET /${slug}/affiliates                      list
GET /${slug}/affiliates/:id                  detail
GET /${slug}/affiliates/payouts              payout review
GET /${slug}/affiliates/fraud                fraud flags + risk
GET /${slug}/affiliates/content              content moderation
```

All behind `ProtectedLayout` (auth + isAdmin gate inherited from Phase 1).

Plus 10 BFF proxy routes (also slug-rewritten) — not publicly advertised,
invoked only by the `AffiliateAdminProvider` actions:

```
POST /${slug}/api/affiliate/:id/approve
POST /${slug}/api/affiliate/:id/pause
POST /${slug}/api/affiliate/:id/renew
POST /${slug}/api/affiliate/:id/propose-change
POST /${slug}/api/affiliate/:id/cancel-proposal
POST /${slug}/api/affiliate/:id/payouts/:payoutId/approve
POST /${slug}/api/affiliate/:id/payouts/:payoutId/reject
POST /${slug}/api/affiliate/:id/payouts/:payoutId/complete
PUT  /${slug}/api/affiliate/content-submissions/:submissionId/review
POST /${slug}/api/affiliate/fraud-flags/:flagId/resolve
```

Each validates session + admin role, then forwards to apps/api's
`/admin/affiliate/*` with the secret injected.

### Components wiring shape

```tsx
// Server-Component page (sketch — full code in Appendix A.1)
export default async function Page({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;                                    // resolve once
  const flat = flatten(sp);                                         // narrow to strings
  const data = await fetchAffiliates(flat);                         // RSC fetch (server-only)
  return (
    <AffiliateListServer                                            // from package /server
      data={data}
      config={{ basePath: adminPath('/affiliates'), locale: 'pt-BR', currency: 'BRL' }}
      searchParams={{ tab: flat.tab, type: flat.type }}             // narrow — package only reads these
    />
  );
}
// flatten(sp) mirrors users/page.tsx pattern: coerce string[] → first value.
```

Layout opens the client-boundary for interactive actions:

```tsx
// affiliates/layout.tsx (RSC)
import AffiliateAdminClientLayout from './client-layout';
export default function Layout({ children }) {
  return <AffiliateAdminClientLayout>{children}</AffiliateAdminClientLayout>;
}

// affiliates/client-layout.tsx
'use client';
import { AffiliateAdminProvider } from '@tn-figueiredo/affiliate-admin';
import { actions } from './actions';
export default function ClientLayout({ children }) {
  return <AffiliateAdminProvider config={{...}} actions={actions}>{children}</AffiliateAdminProvider>;
}
```

---

## 4. Architecture

### Data flow — read side

```
Browser
  └─→ GET /${slug}/affiliates
        └─→ [Next.js rewrite] /zadmin/affiliates/
              └─→ ProtectedLayout (supabase auth + isAdminUser)
                    └─→ AffiliateListPage (RSC)
                          └─→ fetchAffiliates(searchParams)            src/lib/admin/affiliate-queries.ts
                                └─→ fetch `${API_URL}/admin/affiliate/?...`
                                       headers:
                                         X-Internal-Key: process.env.INTERNAL_API_KEY
                                         x-user-id:     <resolved from getUser()>
                                       cache: 'no-store'
                                └─→ apps/api middleware.validateInternalKey
                                └─→ registerAffiliateAdminRoutes dispatch
                                └─→ GetAdminAffiliateOverviewUseCase
                                └─→ { data, error } envelope
                          └─→ <AffiliateListServer data={data} config={...} />
```

### Data flow — write side (actions)

```
User clicks "Aprovar" in <AffiliateListServer>
  └─→ package calls actions.approve(affiliateId, input)                 // client-side
        └─→ actions/affiliates.ts: fetch POST `${adminApi('/affiliate/:id/approve')}`
              (resolves to /api/${NEXT_PUBLIC_ADMIN_SLUG}/affiliate/:id/approve)
              body: JSON.stringify(input)
              headers: Content-Type: application/json
              credentials: 'same-origin'   // Supabase auth cookie auto-attached
        └─→ [Next.js rewrite] /api/${slug}/affiliate/* → /api/zadmin/affiliate/*
        └─→ BFF route /api/zadmin/affiliate/:id/approve/route.ts (apps/web)
              1. createClient() + supabase.auth.getUser() → session check
              2. isAdminUser(user.id) → 403 if not admin
              3. proxy to `${API_URL}/admin/affiliate/:id/approve` with:
                   X-Internal-Key: process.env.INTERNAL_API_KEY
                   x-user-id: user.id
                   Content-Type: application/json
                   body: original request body (passthrough)
              4. return apps/api's status + body verbatim (envelope preserved)
        └─→ on 2xx: browser resolves void; package calls router.refresh()
        └─→ on 4xx/5xx: browser parses body.error.message; throws
              → caught by package's error boundary → <AffiliateAdminErrorFallback>
```

**Why BFF layer (vs direct browser call to apps/api):** the browser cannot
hold `INTERNAL_API_KEY` and apps/api's middleware rejects requests without
it (`/api/admin/*` requires the header). apps/app solves this via its own
middleware that rewrites + injects headers. apps/web has no such middleware
(by design — apps/web is primarily a static landing page; admin is a
carve-out). The BFF route is the minimal equivalent: injects the secret
server-side, re-auths the admin before forwarding. Parallel to existing
`/api/zadmin/users/[id]/route.ts`, just thinner (proxy instead of direct
Supabase write).

**Read path (RSC) skips the BFF layer:** RSC runs inside apps/web's Node
process, already has `INTERNAL_API_KEY` in `process.env`, and runs after the
`ProtectedLayout` auth gate. The `adminFetch()` helper adds the secret +
`x-user-id` and calls `${API_URL}/admin/affiliate/*` directly. Browser
never sees the secret; BFF is unnecessary for server-side render.

### `X-Internal-Key` injection (critical security point)

`apps/web` has no equivalent to apps/app's header-injecting middleware (that
middleware scopes to apps/app alone, and apps/web does not currently
rewrite `/api/*` to apps/api). Two surfaces need the secret:

1. **RSC read path** — `affiliate-queries.ts` `adminFetch()` helper runs
   server-side, has `INTERNAL_API_KEY` in `process.env`, and calls
   `${API_URL}/admin/affiliate/*` directly. See Appendix A.1.
2. **Browser write path** — `actions/*.ts` fetch BFF routes at
   `/api/${slug}/affiliate/*` (rewritten to `/api/zadmin/affiliate/*`).
   The BFF route handler (Appendix A.5) verifies session + admin role,
   then forwards to apps/api with the secret injected server-side.

Neither path exposes `INTERNAL_API_KEY` to the browser. The `adminFetch()`
helper uses `import 'server-only'` at the top to fail the build if any
client module accidentally imports it.

### Error handling

| Surface | Trigger | Response to user |
|---|---|---|
| Page-level data fetch fails (network, 5xx) | `adminFetch` throws | RSC error → Next.js default `error.tsx` (TODO: add a small affiliate-scoped error.tsx in a follow-up; skipped here to keep 2C minimal) |
| Admin route returns 403 | apps/api rejects non-admin | Layout gate should prevent; defensive branch logs + rethrows |
| Admin route returns `{ data: null, error }` envelope | domain failure (e.g. invalid status transition) | `adminFetch` parses body and throws `new Error(body.error.message)`; action caller catches and re-throws with stable code |
| Action (write) throws | any of above | Package renders `AffiliateAdminErrorFallback` inline; user can retry |
| `revalidateTaxId` etc. | skipped | throws `[affiliate-admin] revalidateTaxId not wired in 2C — tracked as TODO-2F`; rendered as fallback with the message |

### Edge cases

1. **Search params double-await** — Next.js 16 async `searchParams`;
   layout/page each do `await searchParams` as per `orgs/page.tsx` and
   `users/page.tsx` patterns. Pass the resolved object to the server
   component (package expects a plain object).
2. **`AffiliateAdminConfig.currentContractVersion`** — not yet tracked on
   branch; pass `undefined` to hide contract column. Documented in §11.
3. **`AffiliateAdminConfig.onViewContract`** — no local ContractSheet;
   omitted. Fallback to `contractAcceptance.contractViewUrl` (external URL)
   if 2A ever populates it. Currently always `null` — button hidden.
4. **`AffiliateDetailPageData.pixMismatch`** — 2A does not compute this
   yet. Passed as `undefined` (hides the warning). Logged as TODO-2F.
5. **`AffiliateDetailPageData.riskScore`** — 2E-era data. Pass `undefined`
   in 2C (hides the section entirely per the package's `undefined = don't
   show` contract).
6. **Fraud severity / status types** re-exported from package — consumed in
   action signature for `resolveFlag`. `pauseAffiliate` boolean is passed
   through verbatim.
7. **Package dependency resolution** — `@tn-figueiredo/affiliate-admin`
   lists `@tn-figueiredo/affiliate: 0.4.0` as a *runtime* dependency.
   apps/web does not currently import `@tn-figueiredo/affiliate` directly.
   We accept the transitive install (no hoisting issues: `apps/api` pins
   the same `0.4.0` `--save-exact`). If npm de-duplication flattens both
   to the same copy, zero behavior change; if nested, both stay at `0.4.0`
   — verified `npm ls @tn-figueiredo/affiliate` post-install must show
   only `0.4.0`.
8. **Admin slug in URLs** — `basePath: adminPath('/affiliates')` resolves
   at module init (not request time). `NEXT_PUBLIC_ADMIN_SLUG` changes
   require a rebuild — acceptable (same limitation as Phase 1).
9. **Locale hardcoded** — `'pt-BR'` everywhere; consistent with 2A emails.
10. **RSC + client-provider ordering** — `layout.tsx` (RSC) renders
    `<AffiliateAdminClientLayout>` which is `'use client'`. That client
    component wraps `{children}`, which Next.js 16 keeps as server-rendered
    payloads. Verified this pattern is exactly what the package README
    recommends and what `apps/web/zadmin/(protected)/admin-shell.tsx`
    already uses for the outer shell.

### `AffiliateAdminActions` contract — 14 actions split

| Action | Route | Status in 2C |
|---|---|---|
| `approve(id, input)` | `POST /:id/approve` | wired |
| `pause(id)` | `POST /:id/pause` | wired |
| `proposeChange(id, input)` | `POST /:id/propose-change` | wired |
| `cancelProposal(id)` | `POST /:id/cancel-proposal` | wired |
| `renewContract(id)` | `POST /:id/renew` | wired |
| `approvePayout(aid, pid)` | `POST /:aid/payouts/:pid/approve` | wired |
| `rejectPayout(aid, pid, notes)` | `POST /:aid/payouts/:pid/reject` | wired |
| `completePayout(aid, pid)` | `POST /:aid/payouts/:pid/complete` | wired |
| `reviewContent(sid, status, notes)` | `PUT /content-submissions/:sid/review` | wired |
| `resolveFlag(fid, status, notes, pause)` | `POST /fraud-flags/:fid/resolve` | wired |
| `revalidateTaxId(aid)` | — **no package route** | SKIP (throws TODO-2F) |
| `addSocialLink(aid, p, url)` | — **no package route** | SKIP (throws TODO-2F) |
| `deleteSocialLink(aid, p)` | — **no package route** | SKIP (throws TODO-2F) |
| `verifySocialLinks(aid)` | — **no package route** (use case exists) | SKIP (throws TODO-2F) |

### Decision matrix for 4 orphan actions (2A §11.2C handoff)

| Option | Effort | Correctness | Chosen? |
|---|---|---|---|
| SKIP (throw-on-invoke) | 1h | UI shows button, user click → error fallback with clear message | **Yes** |
| Custom routes in apps/api | 1–2d | Correct but duplicates upstream's intent; drift risk | No |
| Upstream PR to affiliate package | 3–5d wait | Cleanest but blocks 2C on external release | No |

Rationale (YAGNI): the four social-link actions are visible in the
admin UI but are not business-critical for Phase 2 launch. Tax ID
revalidation requires real Receita Federal integration (2F). Skipping
keeps 2C shippable in one day; a follow-up card (TODO-2F) captures
the full scope.

---

## 5. Testing

### Unit tests (17 new, all fast, no Docker, no DB)

| File | Test count | Focus | Mocks |
|---|---|---|---|
| `actions-affiliates.test.ts` | 5 | `approve` / `pause` / `proposeChange` / `cancelProposal` / `renewContract` — each hits right BFF URL + method + body shape; error envelope → thrown Error with parsed code+message; non-JSON body → fallback to statusText | `vi.fn()` on `global.fetch` |
| `actions-payouts.test.ts` | 3 | `approvePayout` / `rejectPayout` / `completePayout` — nested BFF path `/affiliate/:aid/payouts/:pid/...`; `rejectPayout` forwards `notes` in body | same |
| `actions-content-fraud.test.ts` | 2 | `reviewContent` → PUT with `{status, notes}`; `resolveFlag` → POST with full 4-field body including `pauseAffiliate` | same |
| `skipped-2f.test.ts` | 4 | each of `revalidateTaxId` / `addSocialLink` / `deleteSocialLink` / `verifySocialLinks` throws the expected TODO-2F message | — |
| `proxy.test.ts` | 3 | `proxyToApi` — happy path (forwards body + secret + user id, returns apps/api status + body); 401 when no session; 403 when non-admin | mock `createClient()`, `isAdminUser()`, `fetch` |

No RSC test — the `AffiliateListServer` etc. come pre-tested from the
package. We test only the thin glue code under our control (actions +
BFF proxy).

### Smoke rehearsal (9 manual flows, ~15 min)

Run locally against supabase local + apps/api + apps/web (per CC-3,
CC-4 — substitutes staging soak). Seed: one pending affiliate + one
approved + one payout-pending commission + one content submission.

1. `GET /${slug}/affiliates` lists all affiliates with KPI tiles (active,
   pending, internal, pending-contract counts).
2. Click an affiliate → `/${slug}/affiliates/:id` renders detail, contract
   history, payouts summary.
3. Click "Aprovar" on a pending affiliate → dialog, confirm → row status
   flips to `approved` + tier displays (router.refresh via package).
4. Click "Pausar" on an approved affiliate → status `paused`.
5. `/${slug}/affiliates/payouts` shows pending payouts; approve one →
   status `approved`; reject another with notes → `rejected`.
6. `/${slug}/affiliates/fraud` shows seeded fraud flag + empty risk-score
   section; resolve flag with `false_positive` → removed from list.
7. `/${slug}/affiliates/content` shows pending submissions; approve one
   with notes → status `approved`.
8. Click any skipped action (e.g., "Revalidar Tax ID") → error fallback
   displays the TODO-2F message.
9. Navigate to `/${slug}/affiliates` as a non-admin user (ensure `user_roles`
   row absent) → redirected to login with `error=unauthorized` (inherited
   from Phase 1 layout gate).

### Coverage targets

| File | Coverage | Rationale |
|---|---|---|
| `actions/affiliates.ts`, `payouts.ts`, `content.ts`, `fraud.ts` | ≥90% branch | Thin fetch glue; every branch trivially covered |
| `actions/skipped-2f.ts` | 100% | Trivial throw; one test per function |
| `api/zadmin/affiliate/_shared/proxy.ts` | ≥90% branch | Auth gate + secret injection; 3 branches (no-session, non-admin, happy) |
| `api/zadmin/affiliate/**/route.ts` | not measured | Each is ~10 LOC of delegation to proxy.ts; value of test ≪ cost |
| `lib/admin/affiliate-queries.ts` | ≥85% | Server-only helper; auth path + error path |
| Page components (`page.tsx` × 5) | not measured | Pure composition; value of test ≪ cost of RSC harness |

### Integration testing

Deferred. All write paths pass through Phase 2A's already-integration-tested
admin routes (`apps/api/src/__tests__/integration/affiliate-flow.test.ts`
exercises approve/payout paths). The smoke rehearsal (above) is the end-
to-end signal for 2C.

---

## 6. Configuration

### Environment variables

No new environment variables introduced by 2C. Relies on:

| Var | Consumer | Source |
|---|---|---|
| `NEXT_PUBLIC_ADMIN_SLUG` | apps/web rewrite + `adminPath()` | existing |
| `API_URL` | `adminFetch()` + `proxyToApi()` | existing (`apps/web/.env.local`) |
| `INTERNAL_API_KEY` | `adminFetch()` + `proxyToApi()` header | existing |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `createAdminClient()` (for future direct queries; not used in 2C write paths) | existing |

`apps/web/.env.local.example` — add one-line note (see §7.B.7):

```bash
# API_URL      — required for admin affiliate pages (cross-app BFF calls to apps/api)
# INTERNAL_API_KEY — required; must match apps/api
```

### `next.config.ts` change

```diff
 const nextConfig: NextConfig = {
-  transpilePackages: ['@tn-figueiredo/admin', '@brighttale/shared'],
+  transpilePackages: ['@tn-figueiredo/admin', '@tn-figueiredo/affiliate-admin', '@brighttale/shared'],
```

Rationale: `@tn-figueiredo/affiliate-admin` ships as `.js`/`.cjs` in
`dist/`, but is consumed by Next.js 16 RSC which requires clean ESM
resolution for `/server` subpath — transpile keeps Turbopack happy
and matches the Phase 1 precedent for `@tn-figueiredo/admin`.

### `admin-layout-config.tsx` change

```diff
     {
       group: 'Gestão',
       items: [
         { label: 'Usuários', path: adminPath('/users'), icon: 'Users' },
         { label: 'Organizations', path: adminPath('/orgs'), icon: 'Building2' },
         { label: 'Agentes', path: adminPath('/agents'), icon: 'Bot' },
         { label: 'Analytics', path: adminPath('/analytics'), icon: 'BarChart3' },
+        { label: 'Afiliados', path: adminPath('/affiliates'), icon: 'Users2' },
       ],
     },
```

`Users2` icon — validated lucide-react export in `@tn-figueiredo/admin`'s
type union for `AdminLayoutConfig.sections.items[].icon`.

---

## 7. Migration Path

Two commits on `feat/affiliate-2a-foundation` (long-lived; per CC-1
branch rename happens post-PR).

### Commit A — Install + transpile (green, no UI changes visible)

1. `cd apps/web && npm install @tn-figueiredo/affiliate-admin@0.3.3 --save-exact`
   — pinned exactly, matching the `--save-exact` posture of `affiliate@0.4.0`.
2. Update `apps/web/next.config.ts` — add package to `transpilePackages`.
3. Verify: `npm run typecheck -w @brighttale/web && npm run build -w @brighttale/web`
   both green. **No sidebar change in Commit A** — the package is installed
   but unused; no visible UI change. This keeps the intermediate branch
   state clean (no broken nav link, no 404).

### Commit B — Pages + actions + BFF + sidebar entry + tests (atomic)

4a. Update `apps/web/src/lib/admin-layout-config.tsx` — add one sidebar
   entry `{ label: 'Afiliados', path: adminPath('/affiliates'), icon: 'Users2' }`.
5. Create `apps/web/src/lib/admin/affiliate-queries.ts` with
   `adminFetch`, `fetchAffiliates`, `fetchAffiliateDetail`,
   `fetchPayouts`, `fetchFraud`, `fetchContent`. Top-line
   `import 'server-only'`. Narrow responses via `as` + simple
   structural assertions (total is number, items is array).
6. Create `apps/web/src/app/zadmin/(protected)/affiliates/`:
   - `layout.tsx` (RSC) wrapping `client-layout.tsx`
   - `client-layout.tsx` (`'use client'`) with `AffiliateAdminProvider`
   - `page.tsx` + `[id]/page.tsx` + `payouts/page.tsx` +
     `fraud/page.tsx` + `content/page.tsx` (each RSC wrapping a
     `*Server` component from the package)
7. Create `actions/` directory:
   - `affiliates.ts` (5 actions)
   - `payouts.ts` (3 actions)
   - `content.ts` (1 action)
   - `fraud.ts` (1 action)
   - `skipped-2f.ts` (4 throwing stubs)
   - `index.ts` — re-export as `actions` object matching
     `AffiliateAdminActions` interface
8. Create BFF proxy layer at `apps/web/src/app/api/zadmin/affiliate/`:
   - `_shared/proxy.ts` — `proxyToApi(req, target, method)` helper
   - 10 thin route files (one per non-skipped action) — see §3 filesystem
     tree and Appendix A.5/A.6.
9. Create `TODO-2F.md` in `affiliates/` — concise rationale + link to
   2A spec §11.2C and this spec §4 decision matrix.
10. Create 17 unit tests under
    `apps/web/src/__tests__/app/zadmin/affiliates/` (14 action tests +
    3 proxy tests).
11. Update `apps/web/.env.local.example` — comment block clarifying
    `API_URL` + `INTERNAL_API_KEY` are now required for admin affiliate
    pages (not just optional dashboard /health probe).
12. Reconcile doc drift (one-time):
    - `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`
      — add errata note pointing §11.2C to this spec.
    - No changes to `docs-site` (feature pages for affiliate admin
      will be part of a 2D+ docs push, tracked as `docs-2F` card — not
      blocking 2C).
13. Full verification (see §9).

### Commit split rationale

Commit A is safe-additive (build green, new dep + `transpilePackages` only;
no visible UI change, no broken nav). Commit B is atomic because page
files, layouts, actions, BFF routes, sidebar entry, and tests must all
co-exist to keep typecheck green and the sidebar link functional —
splitting further creates typecheck-red or 404-red intermediate states.

---

## 8. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | `@tn-figueiredo/affiliate-admin@0.3.3` imports `@tn-figueiredo/affiliate` at runtime — double install in monorepo | Low | Both apps pin the same `0.4.0 --save-exact`; post-install `npm ls @tn-figueiredo/affiliate` must show one version. npm workspaces hoist identical pins |
| R2 | Package's RSC exports (`/server`) break under Next.js 16 Turbopack | Low | Package declares peer `next: >=15` and exports `.js` ESM + `.cjs`; `transpilePackages` forces clean compile. Matches `@tn-figueiredo/admin@0.6.2` Phase 1 pattern (proven stable) |
| R3 | Package re-exports `AffiliateFraudFlag`/`AffiliateRiskScore` types that do **not** match 2A DB rows 1:1 (package types include display-only fields like `affiliate.name`) | Medium | 2A routes already shape payloads to match package expectations (verified in container `adminDeps` typing). If drift detected at runtime, fix at `fetchFraud()` boundary with a synthesizer — not in package call site |
| R4 | 4 skipped actions expose buttons that error on click | Low (UX) | Error fallback message is explicit and points to TODO-2F. Acceptable for internal admin users (operator team) until 2F |
| R5 | `x-user-id` header spoofing — apps/web doesn't strip inbound headers like apps/app middleware does | Low (admin-only surface) | Both `adminFetch()` (RSC reads) and `proxyToApi()` (BFF writes) set the header server-side from `supabase.auth.getUser()`; neither trusts client-supplied headers. Defense-in-depth: apps/api's `getAuthenticatedUser()` helper re-resolves user id via Supabase JWT, not the `x-user-id` header (verified in 2A `auth-context.ts`). Header spoofing is impossible. A client sending a crafted `x-user-id` to the BFF would have it overwritten by the BFF before forwarding |
| R13 | BFF route `proxyToApi` forwards request body verbatim — a malicious admin could POST a giant body to exhaust memory | Low | Trust boundary: only authenticated admins reach BFF routes. Next.js default body-size limit (1MB) still applies. If abuse detected, add `export const maxDuration = 10` + body streaming in a 2F follow-up |
| R14 | Missing BFF route for an action the package's Provider calls (typo, interface drift) | Low | 17 unit tests + smoke rehearsal flow 3/4/5/6/7 exercise every wired action. `AffiliateAdminActions` interface is TS-checked at the `actions` object assembly (`satisfies AffiliateAdminActions` in `actions/index.ts`) — missing/misnamed action fails typecheck |
| R15 | `AffiliateListData` + `AffiliateDetailPageData` types live inside the admin package but are NOT re-exported from either entry point — forcing us to hand-duplicate their shape | Low | Shapes are verified verbatim from tarball d.ts (`types-DvHo2KId.d.ts` + `server/index.d.ts`); Appendix A.1 documents both. Structural typing accepts any matching shape. If the package upgrades and drifts, typecheck on the `<AffiliateListServer data={...} />` call will fail loudly. Follow-up card to upstream a re-export PR |
| R6 | `basePath` mismatch — `adminPath('/affiliates')` resolves at module-init; `NEXT_PUBLIC_ADMIN_SLUG` change at runtime breaks links | Low | Matches existing Phase 1 limitation; documented. Rebuild on slug change is a known operational cost |
| R7 | Package requires `tailwindcss >=3` peer — apps/web ships tailwind 4.2.2 | Low | `@tn-figueiredo/admin@0.6.2` already verified tailwind 4 compatibility; package styles use CSS vars + utility classes that work on both majors |
| R8 | RSC error renders bare Next.js default page (no error.tsx in affiliates/ tree) | Low | Explicit out-of-scope; follow-up card `affiliate-ui-err-boundary`. MVP posture — admin-only surface, operator team tolerates |
| R9 | Data shape narrowing at fetch boundary is `as` cast + shallow check, not Zod | Low | 2A routes are statically typed (TS), and the transitive `@tn-figueiredo/affiliate` types are the same types the RSC component consumes. Zod would duplicate the types maintained in the affiliate package without adding safety. Defensive shape checks (`isArray(items)`, `typeof total === 'number'`) catch the 2 high-value misshapes |
| R10 | Next.js 16 async `searchParams` double-await — pattern mismatch between layout and page | Low | `users/page.tsx` and `orgs/page.tsx` already resolve this correctly; follow the same await pattern. Documented in §4 edge case 1 |
| R11 | Post-merge sidebar entry visible before operators are trained | Low | Admin surface already gates on `user_roles.role='admin'`; only the operator team sees the new entry. Release note covers the new UI surface; no external user action required |
| R12 | `affiliate-admin` package prerelease (`0.x`) ships breaking change in patch bump | Medium | `--save-exact` pin prevents; any upgrade goes through a deliberate PR with readme diff |

---

## 9. Done Criteria

1. `npm run typecheck` green across 4 workspaces.
2. `npm run lint` green.
3. `npm test` green: existing suite + 17 new unit tests (no Docker, no DB).
4. `npm run build -w @brighttale/web` green (Turbopack compiles package).
5. Local smoke rehearsal passes all 9 flows (§5).
6. `npm ls @tn-figueiredo/affiliate` in monorepo root shows a single
   version `0.4.0` resolving for both `apps/api` and `apps/web`.
7. `apps/web/package.json` has `@tn-figueiredo/affiliate-admin: "0.3.3"`
   (no caret, no tilde).
8. `apps/web/src/lib/admin-layout-config.tsx` diff is exactly +1 line
   item (plus trailing comma).
9. `apps/web/next.config.ts` `transpilePackages` includes the new entry.
10. All four "skipped" stub functions present in `skipped-2f.ts`, each
    throws a message matching the regex `/not wired in 2C — tracked as TODO-2F/`.
11. `TODO-2F.md` present in `apps/web/src/app/zadmin/(protected)/affiliates/`
    with 4 bullet items (one per skipped action).
11a. 10 BFF route files present under
    `apps/web/src/app/api/zadmin/affiliate/` (one per non-skipped action).
    Each file is ≤15 LOC (delegates to `_shared/proxy.ts`).
11b. `actions/index.ts` exports an `actions` object declared with
    `satisfies AffiliateAdminActions` — guarantees all 14 methods present
    (10 wired + 4 throwing stubs).
12. Errata note added to 2A spec §11.2C pointing to this spec.
13. Two commits on branch (A: install + sidebar; B: pages + actions +
    tests + docs). Both commits have descriptive messages.
14. Diff totals (soft target, flagged in review if exceeded): ~600–850
    LOC inclusive of tests (BFF proxy + routes account for ~200 LOC).
    Signals scope creep if breached.
15. No staging deploy. No push to remote prod. Per CC-4, local smoke +
    pre-merge typecheck substitute for staging soak.

---

## 10. Out of Scope (reiterated)

- Real fraud detection (2E).
- Real tax ID validation (2F).
- Social-link CRUD wiring (2F).
- PostHog admin-action events.
- Stripe / PIX payout automation backend.
- Affiliate-scoped `error.tsx` polish (follow-up card).
- Mobile responsiveness.
- Legacy admin UI cutover (none exists to retire).
- Branch rename (CC-1).
- Staging soak (CC-4).

---

## 11. Handoff to next sub-project (SP3 — Phase 2D data migration + cutover)

After merge of this sub-project on the long-lived branch:

- The admin UI can observe and act on all 2A-backed affiliates — i.e.,
  any new affiliates created via `/api/affiliate/apply` are managed end-
  to-end through the new admin surface.
- SP3 (Phase 2D) copies legacy `affiliate_programs` + `affiliate_referrals_legacy`
  rows into the new tables. Post-migration, the admin UI displays them
  verbatim; no additional UI work required in 2D. The SP3 spec addresses
  `user_id` resolution (org → primary user) and idempotency of the copy.
- **Known orphan set (TODO-2F):** four actions skipped in 2C need either
  custom routes or an upstream affiliate package PR. 2F owns this — the
  `skipped-2f.ts` stubs are the single anchor; replace throws with real
  fetch wrappers once routes exist.
- **Known display gaps (TODO-2F):** `pixMismatch`, `riskScore`,
  `openFlagCount`, `contractAcceptance.contractViewUrl` pass as `undefined`
  in 2C — 2F or 2E populate these as their backends come online. Package
  already handles `undefined` = don't-render.
- First change in SP3: create mapping SQL in `supabase/migrations/` and a
  one-shot `scripts/migrate-affiliate-legacy.ts` that idempotently upserts.

---

## 12. References

- Phase 2A spec: `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`
  (§6 URL surface, §11.2C handoff, Appendix A.1 container)
- SP0 email abstraction spec: `docs/superpowers/specs/2026-04-17-email-provider-abstraction-design.md`
- Phase 1 admin shell spec: `docs/superpowers/specs/2026-04-16-admin-062-upgrade-design.md`
- affiliate-admin package: `npm.pkg.github.com/@tn-figueiredo/affiliate-admin/0.3.3`
  (verified `npm pack`; see Appendix A.4)
- affiliate package: `npm.pkg.github.com/@tn-figueiredo/affiliate/0.4.0`
  (runtime dep of admin package)
- Phase 1 admin shell in-repo: `apps/web/src/app/zadmin/(protected)/**`
- Phase 2A admin route wiring: `apps/api/src/index.ts:213-221`,
  `apps/api/src/lib/affiliate/container.ts:85-110`

---

## Appendix A — Code skeletons

### A.1 `apps/web/src/lib/admin/affiliate-queries.ts`

```ts
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { AffiliateAdminSummary, AffiliateAdminDetail } from '@tn-figueiredo/affiliate';
// Note: AffiliateListData / AffiliateDetailPageData are NOT re-exported from the
// admin package's /server entrypoint (verified via `npm pack` d.ts extraction).
// We reconstruct the list shape locally — it matches the package's internal
// AffiliateListServerProps.data shape verbatim.

interface AffiliateListData {
  items: AffiliateAdminSummary[];
  total: number;
  page: number;
  perPage: number;
  kpis?: {
    totalActive: number;
    totalPending: number;
    totalInternal: number;
    pendingContract: number;
  };
}

// AffiliateDetailPageData is defined in the package's internal types module
// and IS NOT re-exported from either entrypoint (verified via tarball d.ts).
// We declare a structural equivalent locally — the package consumes any
// shape matching `AffiliateAdminDetail & { pixMismatch?, riskScore?,
// contractAcceptance?, openFlagCount? }` (see Appendix A.4).
interface AffiliateDetailPageData extends AffiliateAdminDetail {
  pixMismatch?: boolean;
  riskScore?: unknown | null;      // shape: AffiliateRiskScore; imported when needed
  openFlagCount?: number;
  contractAcceptance?: {
    version: number | null;
    acceptedAt: string | null;
    contractViewUrl?: string | null;
  };
}

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('[affiliate-admin] UNAUTHORIZED — no session in adminFetch');
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...init.headers,
      'X-Internal-Key': process.env.INTERNAL_API_KEY ?? '',
      'x-user-id': user.id,
      'Content-Type': 'application/json',
    },
  });
  const body = (await res.json()) as { data: T | null; error: { code: string; message: string } | null };
  if (!res.ok || body.error) {
    throw new Error(`[affiliate-admin] ${body.error?.code ?? res.status}: ${body.error?.message ?? res.statusText}`);
  }
  if (body.data === null) {
    throw new Error(`[affiliate-admin] unexpected null data in ${path}`);
  }
  return body.data;
}

export async function fetchAffiliates(sp: { tab?: string; type?: string; page?: string }) {
  const qs = new URLSearchParams();
  if (sp.tab) qs.set('tab', sp.tab);
  if (sp.type) qs.set('type', sp.type);
  if (sp.page) qs.set('page', sp.page);
  const data = await adminFetch<AffiliateListData>(`/admin/affiliate/?${qs}`);
  // Defensive shape check
  if (!Array.isArray(data.items) || typeof data.total !== 'number') {
    throw new Error('[affiliate-admin] malformed list response');
  }
  return data;
}

export async function fetchAffiliateDetail(id: string) {
  return adminFetch<AffiliateDetailPageData>(`/admin/affiliate/${encodeURIComponent(id)}`);
}

// fetchPayouts, fetchFraud, fetchContent follow the same pattern.
```

### A.2 `apps/web/src/app/zadmin/(protected)/affiliates/actions/affiliates.ts`

```ts
'use client';
// actions are invoked client-side by the package Provider. They issue
// fetch calls to /api/${slug}/affiliate/* which rewrites (via apps/web
// next.config.ts) to /api/zadmin/affiliate/* — our BFF proxy layer. The
// BFF re-auths and injects X-Internal-Key before forwarding to apps/api.
import { adminApi } from '@/lib/admin-path';
import type { ApproveAffiliateInput, ProposeContractChangeInput } from '@tn-figueiredo/affiliate';

async function send(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',                       // Supabase auth cookie
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: { code: string; message: string } };
      if (j?.error) msg = `${j.error.code}: ${j.error.message}`;
    } catch { /* ignore parse */ }
    throw new Error(`[affiliate-admin] ${msg}`);
  }
}

// adminApi('/affiliate/...') resolves to /api/${NEXT_PUBLIC_ADMIN_SLUG}/affiliate/...
// which next.config.ts rewrites to /api/zadmin/affiliate/... (BFF route).

export async function approve(id: string, input: ApproveAffiliateInput) {
  return send('POST', adminApi(`/affiliate/${encodeURIComponent(id)}/approve`), input);
}
export async function pause(id: string) {
  return send('POST', adminApi(`/affiliate/${encodeURIComponent(id)}/pause`));
}
export async function proposeChange(id: string, input: ProposeContractChangeInput) {
  return send('POST', adminApi(`/affiliate/${encodeURIComponent(id)}/propose-change`), input);
}
export async function cancelProposal(id: string) {
  return send('POST', adminApi(`/affiliate/${encodeURIComponent(id)}/cancel-proposal`));
}
export async function renewContract(id: string) {
  return send('POST', adminApi(`/affiliate/${encodeURIComponent(id)}/renew`));
}
```

### A.3 `apps/web/src/app/zadmin/(protected)/affiliates/actions/skipped-2f.ts`

```ts
'use client';

function skipped(name: string): never {
  throw new Error(`[affiliate-admin] ${name} not wired in 2C — tracked as TODO-2F`);
}

export async function revalidateTaxId(_affiliateId: string): Promise<void> {
  skipped('revalidateTaxId');
}
export async function addSocialLink(_affiliateId: string, _platform: string, _url: string): Promise<void> {
  skipped('addSocialLink');
}
export async function deleteSocialLink(_affiliateId: string, _platform: string): Promise<void> {
  skipped('deleteSocialLink');
}
export async function verifySocialLinks(_affiliateId: string): Promise<void> {
  skipped('verifySocialLinks');
}
```

### A.4 `@tn-figueiredo/affiliate-admin@0.3.3` verified exports (from tarball `.d.ts`)

```
@tn-figueiredo/affiliate-admin         (client main)
  AffiliateAdminProvider
  useAffiliateAdmin
  AffiliateAdminErrorFallback
  types: AffiliateAdminConfig, AffiliateAdminActions (14 methods),
         AffiliateFraudFlag, AffiliateRiskScore,
         FraudFlagSeverity, FraudFlagStatus

@tn-figueiredo/affiliate-admin/server  (RSC)
  AffiliateListServer
  AffiliateDetailServer
  AffiliatePayoutsServer
  AffiliateFraudServer
  AffiliateContentServer
  formatCurrency, formatCommission

@tn-figueiredo/affiliate-admin/client  (non-RSC client helpers — unused in 2C)
```

`AffiliateAdminActions` (verified full surface):

```ts
approve(id, input)
pause(id)
proposeChange(id, input)
cancelProposal(id)
renewContract(id)
approvePayout(aid, pid)
rejectPayout(aid, pid, notes)
completePayout(aid, pid)
reviewContent(sid, status, notes?)
resolveFlag(fid, status, notes?, pauseAffiliate?)
revalidateTaxId(aid)              // SKIP
addSocialLink(aid, platform, url) // SKIP
deleteSocialLink(aid, platform)   // SKIP
verifySocialLinks(aid)            // SKIP
```

### A.5 `apps/web/src/app/api/zadmin/affiliate/_shared/proxy.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

/**
 * Proxy an admin-scoped request from apps/web BFF → apps/api.
 * Verifies session + admin role, injects X-Internal-Key server-side,
 * forwards body verbatim, passes response envelope through unchanged.
 */
export async function proxyToApi(
  req: NextRequest,
  apiPath: string,                    // e.g. '/admin/affiliate/abc/approve'
  method: 'POST' | 'PUT' | 'GET' | 'DELETE' = 'POST',
): Promise<NextResponse> {
  // 1. Auth check (defensive — middleware also gates /zadmin, but BFF
  //    routes are at /api/zadmin which middleware does not cover by default)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
  if (!(await isAdminUser(supabase, user.id))) {
    return jsonError('Forbidden', 'FORBIDDEN', 403);
  }

  // 2. Read body (if any) — pass through verbatim to preserve envelope
  const bodyText = method === 'GET' || method === 'DELETE'
    ? undefined
    : await req.text();

  // 3. Forward to apps/api with the secret + resolved user id
  const res = await fetch(`${API_BASE}${apiPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Key': process.env.INTERNAL_API_KEY ?? '',
      'x-user-id': user.id,
    },
    body: bodyText,
    cache: 'no-store',
  });

  // 4. Pass status + body through (apps/api already returns {data, error})
  const upstreamBody = await res.text();
  return new NextResponse(upstreamBody, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### A.6 Sample BFF route — `apps/web/src/app/api/zadmin/affiliate/[id]/approve/route.ts`

```ts
import { NextRequest } from 'next/server';
import { proxyToApi } from '../../_shared/proxy';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToApi(req, `/admin/affiliate/${encodeURIComponent(id)}/approve`, 'POST');
}
```

All 10 BFF route files follow the exact shape of A.6: one exported HTTP
method handler, `await params`, call `proxyToApi` with the target apps/api
path. Total BFF route code: ~10 × 10 LOC = ~100 LOC plus the shared proxy.
Notably, the `[id]/payouts/[payoutId]/*` triplet is three thin route files
sharing the nested param pattern; no need to deduplicate.

### A.7 Note on middleware scope

`apps/web/src/middleware.ts` currently runs auth logic only for paths
starting with `adminPath()` (i.e., `/${slug}`). BFF routes live under
`/api/zadmin/affiliate/*` — outside that prefix. The `proxyToApi` helper
does its own auth check (A.5 step 1), so no middleware change is needed.
If a future hardening pass wants middleware to gate BFF routes too, add
`|| pathname.startsWith('/api/zadmin/')` to the prefix check — a one-line
change tracked in a follow-up card, not blocking 2C.

Remaining skeletons (`layout.tsx`, `client-layout.tsx`, each `page.tsx`,
`actions/payouts.ts` / `content.ts` / `fraud.ts`, the remaining 9 BFF
route files, and the 14+3 unit tests) follow the exact pattern of the
existing `apps/web/src/app/zadmin/(protected)/users/` tree + `apps/web/src/app/api/zadmin/users/[id]/route.ts` + the package README — reference the
README's "Uso rápido" section verbatim and the concrete examples in
A.1–A.6 above.
