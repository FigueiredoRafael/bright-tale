# Admin Package Upgrade 0.1.1 → 0.6.2 — Design Spec

**Status:** draft
**Date:** 2026-04-16
**Author:** Thiago Figueiredo (with Claude)
**Phase:** 1 of 2 (Phase 2 = Affiliates, separate spec)

---

## 1. Context & Goals

### Why now

`@tn-figueiredo/admin` evolved from a thin component library (0.1.x) into an opinionated admin framework (0.6.x) that ships: shell + sidebar + topbar, login/forgot/reset pages, site-switcher primitives, KPI cards, charts (Area/Bar/Donut/MultiLine/Funnel/ActivityHeatmap/CohortHeatmap), activity feed, alerts panel, refresh indicator, and a11y-compliant hooks. The guiding philosophy: **defaults that work out of the box, consumers customize via theme tokens — not by forking code.**

`apps/web` adopted 0.1.1 when the package was minimal and implemented a lot of shell/auth/theme primitives locally. After the upgrade, much of that local code becomes redundant.

### Goals

1. Bump `@tn-figueiredo/admin` `0.1.1` → `0.6.2` + its required peer `@tn-figueiredo/auth-nextjs` `2.0.0` → `^2.2.0`.
2. Adopt the package's opinionated defaults (shell, topbar, login/forgot/reset, theme toggle hook, alerts/activity primitives).
3. Retain BrightTale visual identity via Tailwind 4 `@theme` token overrides + `AuthTheme` CSS variables — **no lib forking**.
4. Delete / shrink local code that the package now covers.
5. Preserve existing feature routes (`agents`, `users`, `orgs`, `analytics`) without refactoring their internals — they work and touching them expands scope.
6. Establish a clean foundation for Phase 2 (affiliates + derivatives: `@tn-figueiredo/affiliate` + `@tn-figueiredo/affiliate-admin`).

### Non-goals

- Refactor `agents/`, `users/`, `orgs/`, `analytics/` page internals (tables, modals, filters) — out of scope.
- Add new analytics charts or metrics — out of scope.
- Multi-tenant / `SiteSwitcher` adoption — single-site app.
- Support chat module (`@tn-figueiredo/admin/support`) — deferred.
- Mobile responsiveness — admin is desktop-only today; remains so.
- Affiliate features — Phase 2.

---

## 2. Current State

### Packages installed in `apps/web`

```json
"@tn-figueiredo/admin": "0.1.1"
"@tn-figueiredo/auth-nextjs": "2.0.0"
"recharts": "3.8.1"
"lucide-react": "0.563.0"
"next": "16.1.6"
"react": "19.2.3"
```

### Admin route tree

```
apps/web/src/app/
├── middleware.ts                      69 LOC  (direct @supabase/ssr import)
├── layout.tsx                               PostHog + Axiom wrappers (root)
├── globals.css                      1001 LOC  (Tailwind 4 + @theme tokens)
└── zadmin/
    ├── login/page.tsx                108 LOC  custom Supabase email/password form
    └── (protected)/
        ├── layout.tsx                  22 LOC  auth check + custom shell
        ├── admin-sidebar.tsx          92 LOC  custom sidebar with BrightTale colors
        ├── theme-toggle.tsx            54 LOC  localStorage dark/light toggle
        ├── page.tsx                   303 LOC  dashboard; uses KpiCard/KpiSection from lib
        ├── agents/                     460 LOC  (out of scope)
        ├── users/                    1,181 LOC  (out of scope)
        ├── orgs/                       311 LOC  (out of scope)
        └── analytics/page.tsx         211 LOC  (out of scope; already uses lib KPI primitives)
```

**Total zadmin LOC: 2,634.**

### Supporting modules

```
apps/web/src/lib/
├── admin-check.ts              11 LOC  isAdminUser() via user_roles table
├── admin-path.ts               25 LOC  slug-configurable URL builder
└── supabase/
    ├── server.ts               28 LOC  uses @tn-figueiredo/auth-nextjs
    ├── admin.ts                14 LOC  service_role client
    └── client.ts                8 LOC  browser client
```

### Next.js config (`apps/web/next.config.ts`)

- `transpilePackages: ['@tn-figueiredo/admin', '@brighttale/shared']` ✓
- Rewrites `/{NEXT_PUBLIC_ADMIN_SLUG}/:path*` → `/zadmin/:path*` ✓

### Tailwind 4 setup (`globals.css`)

- `@import "tailwindcss"` ✓
- `@custom-variant dark (&:where(.dark, .dark *))` — class-based dark mode on `html.dark`/`html.light` ✓
- `@source "../../../../node_modules/@tn-figueiredo/admin/dist"` — scans lib classes into Tailwind graph ✓
- `@theme` block with BrightTale tokens: `--color-dash-*`, `--color-v-*`, `--color-vivid-*`, shadcn-compatible `--color-sh-*` ✓

### Observability providers

Both live in `apps/web/src/app/layout.tsx` (root) — `PostHogProvider` wraps children; Axiom `WebVitals` called unwrapped. No zadmin-specific providers. New admin shell will live inside these.

---

## 3. Target State

### Package upgrades

| Package | From | To | Rationale |
|---|---|---|---|
| `@tn-figueiredo/admin` | `0.1.1` | `0.6.2` | Adopt shell + login + topbar + new components |
| `@tn-figueiredo/auth-nextjs` | `2.0.0` | `^2.2.0` | Required peer of admin 0.6.x; ships server actions for login/forgot/reset/signOut |

All other peer dependencies already compatible (`recharts >=2` ✓, `lucide-react >=0.400` ✓, `next >=15` ✓, `react >=19` ✓).

### New exports we consume from admin 0.6.2

- `createAdminLayout(config)` from root barrel — shell + sidebar + topbar + logout form
- `AdminLogin`, `AdminForgotPassword`, `AdminResetPassword` from `/login`
- `KpiCard`, `KpiSection`, `AlertsPanel`, `ActivityFeed`, `RefreshIndicator`, `useDarkModeGuard` from `/client`
- `isAdminPath` from `/middleware` (reference utility; local middleware retains current approach)
- Types: `AdminLayoutConfig`, `SidebarSection`, `SidebarItem`, `AlertEntry`, `ActivityEntry`, `AuthTheme`, `SiteBranding`

### Exports we consume from auth-nextjs 2.2.0

Server actions:
- `signInWithPassword(input: { email; password; turnstileToken? }) → ActionResult`
- `signInWithGoogle(input: { redirectTo; appUrl; callbackPath? }) → ActionResult<{ url: string }>`
- `forgotPassword(input: { email; appUrl; resetPath; turnstileToken? }) → ActionResult`
- `resetPassword(input: { password }) → ActionResult`
- `signOutAction() → ActionResult`

Utility:
- `createServerClient(params)` — **Edge-compatible** (verified: uses standard fetch + Next.js `cookies()`, no Node-only APIs)

### Environment variable inventory

| Var | Status | Purpose | Value example |
|---|---|---|---|
| `NEXT_PUBLIC_ADMIN_SLUG` | existing | Configurable admin URL prefix | `admin` (default) |
| `NEXT_PUBLIC_SUPABASE_URL` | existing | Supabase project URL | `https://xyz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | existing | Supabase anon key (SSR cookie flow) | opaque |
| `SUPABASE_SERVICE_ROLE_KEY` | existing | service_role key for admin data fetch | opaque |
| `NPM_TOKEN` | existing locally; **new on Vercel** | GitHub Packages auth for `@tn-figueiredo/*` | opaque; P1 prerequisite |
| **`NEXT_PUBLIC_APP_URL`** | **new** | Absolute URL of web app, injected into `signInWithGoogle({ appUrl })` and `forgotPassword({ appUrl })` so auth-nextjs builds correct OAuth/reset redirects. Must be set per environment | dev: `http://localhost:3002`; staging: `https://staging.brighttale.io`; prod: `https://brighttale.io` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | **not added** | Cloudflare Turnstile anti-bot. Decision: **opt-out** for Phase 1 — admin login is restricted (`isAdminUser` check is the real gate); Turnstile adds no value here. Reconsider if abuse spike. | — |

**Phase 2 will add:** env vars for affiliate integration (TBD in that spec).

---

## 4. Architecture

### Layered responsibility

```
┌─ @tn-figueiredo/admin 0.6.2 ───────────────────────────────────┐
│  Shell: AdminShell + AdminSidebar + Topbar (branding/logout)   │
│  Components (/client): KpiCard, AlertsPanel, ActivityFeed,     │
│    RefreshIndicator, charts, hooks                             │
│  Login (/login): AdminLogin, AdminForgotPassword,              │
│    AdminResetPassword — theming via AuthTheme CSS vars         │
│  Middleware util (/middleware): isAdminPath                    │
└─────────────────┬──────────────────────────────────────────────┘
                  │ config + children + actions props
┌─ @tn-figueiredo/auth-nextjs 2.2.x ─────────────────────────────┐
│  Server actions: signInWithPassword/Google, forgot/reset,      │
│    signOutAction                                               │
│  Supabase SSR: createServerClient (Edge-compatible)            │
└─────────────────┬──────────────────────────────────────────────┘
                  │ invoked by consumer wrappers
┌─ apps/web ─────────────────────────────────────────────────────┐
│  Auth: createClient() + isAdminUser() (user_roles table)       │
│  Middleware: rewrite /<slug>/* → /zadmin/*; auth gate          │
│  Config (src/lib/admin-layout-config.tsx): sections + branding  │
│    + logoutPath — single source reused in Phase 2              │
│  Pages: data fetching (service_role) + lib primitives          │
│  Theme (globals.css @theme): remap --color-slate-* + AuthTheme │
│    CSS vars → BrightTale tokens                                │
│  Login routes: thin wrappers (~25-50 LOC each) around lib      │
│    components + server action wrappers                         │
└────────────────────────────────────────────────────────────────┘
```

### Server / Client boundary

- `(protected)/layout.tsx` — **Server Component**; runs auth check, delegates render to `<AdminShell>` (local client shim).
- `(protected)/admin-shell.tsx` — **Client shim** (`'use client'`); invokes `createAdminLayout(ADMIN_LAYOUT_CONFIG)` and renders `<AdminLayout>`. **Required** because the admin root barrel re-exports `SiteSwitcherProvider` (which uses `createContext`) for backward compat — `transpilePackages` alone does not inject `'use client'` into those re-exports in Turbopack dev, causing RSC crash on server-side module evaluation. Upstream CHANGELOG 0.6.1 acknowledges this and recommends exactly this shim pattern.
- `(protected)/page.tsx` (dashboard) — **Server Component**; fetches via `createAdminClient` (service_role); renders lib components from `/client` as children (React 19 RSC allows).
- `login/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx` — **Client wrappers** over lib components. Server actions imported from a dedicated `src/lib/auth/admin-actions.ts`.

### Slug / path contract

- `NEXT_PUBLIC_ADMIN_SLUG` (default `admin`) is inlined at build time for both server and client (Next.js standard).
- `adminPath('/users')` → `/<slug>/users` — the **exposed** path visible to users.
- `next.config.ts` rewrites `/<slug>/:path*` → `/zadmin/:path*` internally.
- Sidebar config (`admin-layout-config.tsx`) uses `adminPath()` for every item → slug changes propagate without code edits.

### Post-upgrade route tree (`apps/web/src/app/zadmin/`)

```
zadmin/
├── login/page.tsx                 ← PUBLIC (sibling of (protected))
├── forgot-password/page.tsx       ← PUBLIC (sibling)
├── reset-password/page.tsx        ← PUBLIC (sibling; accessible via token link even if unauth)
├── logout/route.ts                ← PUBLIC (POST only; server action invalidates session then redirects)
└── (protected)/                   ← auth-gated by layout.tsx
    ├── layout.tsx                 ← auth check + createAdminLayout render
    ├── theme-toggle.tsx           ← client component (shrunk)
    ├── page.tsx                   ← dashboard
    ├── agents/
    ├── users/
    ├── orgs/
    └── analytics/
```

Only routes under `(protected)/` run the auth check inline in `layout.tsx`. Public routes (login, forgot-password, reset-password, logout) must be **explicitly exempted** in `src/middleware.ts`:

```typescript
// inside middleware.ts, after slug resolution
const PUBLIC_ADMIN_PATHS = new Set([
  adminPath('/login'),
  adminPath('/forgot-password'),
  adminPath('/reset-password'),
  adminPath('/logout'),
])
if (PUBLIC_ADMIN_PATHS.has(pathname)) return response
```

The existing middleware only exempts `adminPath('/login')` — Step 3 commit must broaden this to the full list above or the new pages will redirect to login on first visit.

### Theming

| Surface | Mechanism |
|---|---|
| Shell + sidebar (lib uses hardcoded slate classes) | Remap `--color-slate-*` in `@theme` → BrightTale tokens (`--color-dash-*`) |
| Dark mode | Class-based (`html.dark`/`html.light`) via custom variant — **existing setup** |
| Login (`AuthTheme`) | Pass `theme={{ bg, card, accent, accentHover, text, muted, border }}` mapping to CSS vars `--auth-bg`, `--auth-card-bg`, `--auth-accent`, `--auth-accent-hover`, `--auth-text`, `--auth-muted`, `--auth-border` — set in `:root`/`html.light` |
| KPI cards / charts | Per-instance props (`color`, `iconBg`) accept hex or Tailwind classes |

**Exact slate shades the lib uses** (from inspection of `dist/index.js` + `dist/client.js` of 0.6.2):

| Shade | Where |
|---|---|
| `slate-50` | Shell main bg (light) |
| `slate-100` | KPI card text (dark mode); misc hover states |
| `slate-200` | Topbar/card borders (light) |
| `slate-300` | Topbar logout link (dark); muted text |
| `slate-400` | Neutral change color (KPI); dim text |
| `slate-500` | KPI label text (light); neutral states |
| `slate-600` | Topbar logout link (light); secondary text |
| `slate-700` | Topbar borders (dark) |
| `slate-800` | Topbar bg (dark); KPI card bg (dark) |
| `slate-900` | Shell main bg (dark); KPI value text (light) |

**Remap all 9 shades in `@theme`**, even the ones that don't immediately match a BrightTale token — partial remap causes asymmetric light/dark (e.g., remap `slate-50` but not `slate-100` → text contrast breaks).

**⚠ Light-mode regression risk:** existing pages (`login/page.tsx`, `(protected)/users/*`, dashboard) use slate classes too. Remapping affects them. Mitigation: map slate shades to values that approximate current light-mode defaults so **un-touched pages render nearly identically**, while dark-mode shades (`700/800/900`) map to BrightTale dark tokens for the new shell. Verified per-page in Step 7 smoke.

### Dark mode toggle

- Lib's `features.darkMode: true` flag is **declared in the type but not consumed** in the lib's code (upstream gap — grep `features\.` in `packages/admin/src` returns zero matches).
- Lib's `useDarkModeGuard()` hook returns `{ mounted, isDark }` only — **it does not persist preference or toggle state**. Persistence is consumer's responsibility.
- Consumer retains a toggle component (~20 LOC, down from 54): reads `localStorage['bt-admin-theme']` on mount, applies `html.classList.add('dark'|'light')`, writes back on toggle.
- **FOUC prevention:** reading `localStorage` inside `useEffect` runs *after* first paint → user sees a flash in the wrong mode before hydration. Mitigation: add a small **blocking inline script** in root `layout.tsx` (before `<body>` children) that reads the preference and sets `html.classList` pre-hydration. Skeleton in Appendix A. The current custom `theme-toggle.tsx` happens to avoid this by also being a client component that mounts before visual content, but in the new shell (which renders server-first) the blocking script is required.
- **Placement:** inject into `siteSwitcherSlot` prop of `AdminLayoutConfig`. The lib's new topbar (0.6.0+) renders `siteSwitcherSlot` as generic `ReactNode` — semantically it's for `<SiteSwitcher />`, but `ReactNode` permits any chrome. This is the only extension point in the shell; using it for the theme toggle keeps the button visible and persistent across all admin routes. Follow-up: propose upstream a named `utilitySlot` or `themeToggleSlot` prop for clearer intent.

### Provider hierarchy

```
<html className={isDark ? 'dark' : 'light'}>
  <body>
    <PostHogProvider>             ← root layout.tsx (unchanged)
      <WebVitals />               ← Axiom, root layout.tsx (unchanged)
      {children}
        └─ (protected)/layout.tsx → AdminLayout (new shell lives here)
```

---

## 5. Cleanup Inventory

### Hard deletes

| File | LOC | Replacement |
|---|---:|---|
| `(protected)/admin-sidebar.tsx` | −92 | `createAdminLayout({ sections })` config-driven |

### Shrinks

| File | LOC before | LOC after (est.) | Delta | Reason |
|---|---:|---:|---:|---|
| `(protected)/layout.tsx` | 22 | 14 | **−8** | `<AdminLayout>` replaces custom shell |
| `(protected)/page.tsx` (dashboard) | 303 | ~185 | **−118** | `HealthDot`, `RecentUsers`, refresh pill, animation classes removed |
| `(protected)/theme-toggle.tsx` | 54 | ~20 | **−34** | Uses `useDarkModeGuard` hook; no localStorage-management boilerplate |
| `login/page.tsx` | 108 | ~50 | **−58** | Thin wrapper over `<AdminLogin>` |
| `src/middleware.ts` | 69 | ~55 | **−14** | Consolidate on `@tn-figueiredo/auth-nextjs` `createServerClient` (Edge-compatible verified) |

### New files

| File | LOC (est.) | Purpose |
|---|---:|---|
| `src/lib/admin-layout-config.tsx` | +45 | `ADMIN_LAYOUT_CONFIG: AdminLayoutConfig` — sections, branding, logoutPath. Single source of truth; Phase 2 adds affiliate sections here |
| `src/lib/auth/admin-actions.ts` | +50 | Server actions wrapping auth-nextjs: `signInWithPassword`, `signInWithGoogle`, `forgotPassword`, `resetPassword`, `signOut`. Also provides `appUrl` injection from env |
| `src/app/zadmin/forgot-password/page.tsx` | +25 | Client wrapper for `<AdminForgotPassword>` |
| `src/app/zadmin/reset-password/page.tsx` | +25 | Client wrapper for `<AdminResetPassword>` |
| `src/app/zadmin/logout/route.ts` | +20 | POST handler: `signOutAction()` + redirect to `adminPath('/login')`. Target of `logoutPath` in config |

### globals.css additions

| Addition | LOC (est.) |
|---|---:|
| Remap `--color-slate-50/100/200/700/800/900` → BrightTale tokens | +12 |
| `AuthTheme` CSS vars in `:root` + `html.light` | +14 |

### Out of scope (confirmed untouched)

| Dir | LOC | Rationale |
|---|---:|---|
| `agents/` | 460 | Functional; lib offers no table primitive |
| `users/` | 1,181 | Functional; refactor = feature work |
| `orgs/` | 311 | Functional |
| `analytics/` | 211 | Functional; already uses KPI primitives |

### Line totals

```
DELETES              −92
SHRINKS             −232  (layout 8 + dashboard 118 + theme-toggle 34 + login 58 + middleware 14)
NEW FILES          +165   (config 45 + actions 50 + forgot 25 + reset 25 + logout route 20)
NEW TESTS          +80   (admin-actions.test.ts — see §7.1)
MIDDLEWARE EXEMPT   +8    (explicit public-path list in middleware.ts)
THEME CSS          +26    (slate remap 12 + auth vars 14)
─────────────────────────
NET: ~−45 LOC  (range: −20 to −85 depending on per-file actuals)
```

The ~5% reduction framing was optimistic — each new/shrunk file carries ±20 LOC uncertainty (R7) and new tests add ~80 LOC we didn't budget for initially. Actual delta in PR diff may be anywhere from a small reduction to roughly neutral. **The headline gain isn't line reduction — it's redundancy elimination + functional additions below.**

**Functional gains at this cost:** (1) forgot-password flow, (2) reset-password flow, (3) Google OAuth SSO, (4) topbar with branding + logout form, (5) single source of truth for sidebar config (Phase 2 leverage), (6) first test coverage for auth wrappers.

### 1:1 dashboard mapping

| Before | After |
|---|---|
| `HealthDot` × 2 + inline refresh pill (~65 LOC) | `<AlertsPanel alerts={…} />` + `<RefreshIndicator />` (~12 LOC). Entries built as `AlertEntry { type, message, severity: 'low'\|'medium'\|'high', link? }` |
| `RecentUsers` custom (~55 LOC) with inline avatar gradients | `<ActivityFeed entries={users.map(toActivityEntry)} />` + helper returning `{ id, label, timestamp, iconBg }` (~15 LOC) |
| `animate-fade-in-up-{1,2,3}` classes | Removed from dashboard. Keyframes stay in `globals.css` (still used by `users/page.tsx`) |

---

## 6. Sequencing

### Branch & PR model

- Branch: `feat/admin-upgrade-062` from `staging`
- Single atomic PR; commits per step below (easier review & bisect)
- Tag: `pre-admin-062` before first commit (rollback anchor)
- Estimated effort: **2–3 dev-days** (single focused dev)

### Pre-requisites (before opening the branch)

| # | Action | Location | Validation |
|---|---|---|---|
| P1 | `NPM_TOKEN` set as Vercel env var (web project) | Vercel dashboard | Preview build resolves `@tn-figueiredo/*` |
| P2 | Google OAuth Client credentials created | Google Cloud Console → OAuth 2.0 | Client ID + Secret available |
| P3 | Google provider enabled in Supabase | Supabase Dashboard → Auth → Providers → Google | Toggle on, credentials pasted, callback URL noted |
| P4 | Supabase callback URL registered in Google Cloud | Google Cloud Console → Authorized redirect URIs | Saved; also add `localhost:3002/auth/callback` for dev |
| P5 | Supabase SMTP configured (for forgot/reset emails) | Supabase Dashboard → Auth → Email | Sends test email; if using Supabase built-in SMTP, verify daily quota vs expected usage |
| P6 | `NEXT_PUBLIC_APP_URL` set in `apps/web/.env.local` (dev), Vercel env vars (staging + prod) | env files + Vercel dashboard | Values per env match the real URL (see §3 env inventory) |

### Step 0 — Baseline

- `git tag pre-admin-062`
- Capture **7 baseline screenshots**: 5 protected admin routes in dark mode (dashboard, users, orgs, agents, analytics) + login in dark + login in light → `docs/superpowers/specs/assets/admin-062-baseline/`
- Commit: `docs: admin baseline screenshots before 0.6.2 upgrade`
- `rm -rf apps/web/.next` — avoid stale Tailwind scan between steps
- Verify `NEXT_PUBLIC_APP_URL` is present in `apps/web/.env.local` (dev) before Step 3 runs. If missing, add it now.
- **Edge-runtime compat probe** (evidence for R4): after Step 1 installs auth-nextjs 2.2.0, run:
  ```bash
  grep -rE "require\(['\"](fs|path|crypto|child_process|os|stream|net|tls)['\"]" \
    apps/web/node_modules/@tn-figueiredo/auth-nextjs/dist/ || echo "No Node-only requires"
  ```
  Expected output: `No Node-only requires`. If matches appear, Step 6 is skipped and middleware keeps the direct `@supabase/ssr` import. Paste output into commit body for Step 6 (or into R4 mitigation if Step 6 is skipped).

### Step 1 — Package upgrades (foundation)

```bash
cd apps/web
npm install @tn-figueiredo/admin@0.6.2 @tn-figueiredo/auth-nextjs@^2.2.0 --save-exact
```

- Commit: `chore(web): upgrade admin 0.1.1→0.6.2 + auth-nextjs 2.0.0→2.2.0`
- Includes `apps/web/package.json` + root `package-lock.json`
- **Accept**: `npm run typecheck` runs. Number of resulting errors recorded in commit body. Don't fix yet — fix inline during steps 3–5.

### Step 2 — Theme tokens

- Add to `globals.css` `@theme` block: remap all 9 slate shades (`50/100/200/300/400/500/600/700/800/900`) to values that approximate current light-mode Tailwind defaults for untouched pages and map to BrightTale dark tokens where the new shell will use them
- Add `AuthTheme` CSS vars (`--auth-bg`, `--auth-card-bg`, `--auth-accent`, `--auth-accent-hover`, `--auth-text`, `--auth-muted`, `--auth-border`) in `:root` (dark default) + `html.light`
- Commit: `feat(web): add admin shell + AuthTheme color tokens`
- **Accept**: `npm run dev` renders; manual: spot-check **light mode** on `(protected)/users/*` and `zadmin/login/*` (slate-heavy pages) for visible regression — minor shade drift acceptable, hue reversal is not. If regression found, narrow the slate remap to only shades the new shell actually needs.

### Step 3 — Login flow replacement

Reordered ahead of shell swap: exercises auth-nextjs 2.2 early; failure here doesn't leave us with a half-demolished shell.

**All files created/modified in this step (single commit):**
- `src/lib/auth/admin-actions.ts` — 5 server actions wrapping auth-nextjs. Each wrapper closes over `process.env.NEXT_PUBLIC_APP_URL` to inject `appUrl` into the lib actions.
- `src/app/zadmin/login/page.tsx` — rewrite as `<AdminLogin actions={…} theme={…} authError={searchParams.error} />`
- `src/app/zadmin/forgot-password/page.tsx` — new client wrapper for `<AdminForgotPassword>`
- `src/app/zadmin/reset-password/page.tsx` — new client wrapper for `<AdminResetPassword>`
- `src/app/zadmin/logout/route.ts` — new POST handler: call `signOutAction()`; on `ok` redirect to `adminPath('/login')`; on failure redirect to `adminPath('/login?error=signout_failed')` (never 500 — logout should always appear successful to user)

Commit: `feat(web): adopt AdminLogin + forgot/reset + logout route`

**Accept (dev, local):** email/password login works; forgot-password submits without error (email delivery depends on P5); reset-password validates + submits; logout clears session + redirects. Google OAuth tested separately (see below).

**Google OAuth verification strategy:**
- **Dev (localhost:3002):** Google callback registered → full flow testable
- **Vercel PR previews:** Google callback NOT registered (dynamic subdomains) → Google button clicks fail with redirect_uri_mismatch; **expected and acceptable**
- **Staging canonical URL:** Google callback registered → full flow testable; do this in Level 3 smoke
- **Prod:** Google callback registered post-deploy

**Plan B (Google Cloud credentials not ready at Step 3 time):** ship with stub `signInWithGoogle` returning `{ ok: false, error: 'google_not_configured' }` + override `strings.googleButton` to indicate disabled. Button stays visible but non-functional; follow-up task enables Google in Supabase without code changes.

### Step 4 — Shell swap

- `src/lib/admin-layout-config.tsx` — new
- `src/app/zadmin/(protected)/layout.tsx` — rewrite to auth check + `<AdminLayout>`
- Delete `(protected)/admin-sidebar.tsx`
- Shrink `(protected)/theme-toggle.tsx` to `useDarkModeGuard`-based version

Commit: `refactor(web): adopt createAdminLayout; drop custom sidebar`

**Accept**: typecheck + build clean; `/admin` renders new shell with BrightTale colors; 5 sections navigable; topbar shows branding + Sair button.

### Step 5 — Dashboard cleanup

- Rewrite `(protected)/page.tsx`:
  - `HealthDot` × 2 + refresh pill → `<AlertsPanel>` + `<RefreshIndicator />`
  - `RecentUsers` → `<ActivityFeed>` + `toActivityEntry()` helper
  - Remove `animate-fade-in-up-*` class usages (keyframes stay in globals.css)

Commit: `refactor(web): dashboard uses AlertsPanel + ActivityFeed + RefreshIndicator`

**Accept**: typecheck + build clean; dashboard KPI numeric values match baseline (same underlying queries); alerts reflect API/DB health; activity feed shows recent users.

### Step 6 — Middleware consolidation

- Replace direct `import { createServerClient } from '@supabase/ssr'` with `createServerClient` from `@tn-figueiredo/auth-nextjs` (Edge-compatible, verified)

Commit: `refactor(web): consolidate middleware on auth-nextjs`

**Accept**: `npm run build` passes (Edge runtime compat); manual: /admin still gated; /admin/login accessible.

Rollback: revert this commit only; previous steps retained.

### Step 7 — Final verification + PR

- `npm run typecheck --workspaces` clean
- `npm run build --workspaces` clean
- `npm run test --workspaces` green
- Manual smoke (20 items, see §7)
- Post-upgrade screenshots → `docs/superpowers/specs/assets/admin-062-post/`
- Open PR with body template (see §7)

---

## 7. Verification

### Philosophy

- Lib primitives are upstream-tested (244+ tests) — don't retest.
- UI wrappers (`login/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`) are thin enough that visual smoke catches regressions faster than tests would.
- **Exception:** `src/lib/auth/admin-actions.ts` is the only non-trivial net-new code — it closes over `process.env.NEXT_PUBLIC_APP_URL`, transforms inputs, and in some paths swallows errors (logout). It has **no upstream coverage** because the lib doesn't know about this consumer shim. It is the **single point of failure between the user and a broken auth flow in production**. It gets unit tests (§7.1).

**Baseline:** `apps/web` today has zero test files (`vitest run --passWithNoTests`). This upgrade adds the first test file at `src/lib/auth/__tests__/admin-actions.test.ts`.

### 7.1 Unit tests for `admin-actions.ts` (new)

File: `apps/web/src/lib/auth/__tests__/admin-actions.test.ts` (~80 LOC, 8 tests).

Mock `@tn-figueiredo/auth-nextjs/actions` at the module boundary. Cover:

| # | Test | Asserts |
|---|---|---|
| 1 | `signInWithPassword` forwards input unchanged | lib `_signInWithPassword` called with `{email, password}` |
| 2 | `signInWithGoogle` injects `appUrl` from env | lib called with `{appUrl: NEXT_PUBLIC_APP_URL, redirectTo: '/admin'}` when no override |
| 3 | `signInWithGoogle` respects caller-provided `redirectTo` | lib called with the caller's value, not default |
| 4 | `signInWithGoogle` when `NEXT_PUBLIC_APP_URL` is missing | throws meaningful error (not silent `undefined` injection) |
| 5 | `forgotPassword` injects `appUrl` + `resetPath` | lib called with `{email, appUrl, resetPath: '/admin/reset-password'}` |
| 6 | `resetPassword` forwards input unchanged | lib called with `{password}` |
| 7 | `signOut` returns the lib's result | lib's `_signOut` result propagates |
| 8 | `signOut` swallows lib errors and returns `{ ok: true }` | confirms logout-UX-always-succeeds contract (§6 Step 3 logout route comment) |

Run alongside existing `vitest` config — no new tooling. Blocks PR on failure.

### Philosophy cont. — no E2E in Phase 1

- No Playwright/Cypress — no E2E infrastructure in repo today. Adding it = scope creep.
- Manual smoke + staging remain the integration-level gate for login/Google/forgot/reset flows.
- **Follow-up post-Phase-1:** open a separate spec for adding a minimal Playwright suite covering the admin auth happy-path; the wrapper unit tests above are a scoped pre-commitment of that direction.

### Level 1 — Automated

| Check | Command | Blocks PR on failure? |
|---|---|---|
| Typecheck | `npm run typecheck` | Yes |
| Build web | `cd apps/web && npm run build` | Yes |
| Build app (shared sanity) | `cd apps/app && npm run build` | Yes |
| Lint | `npm run lint` | Yes |
| Tests | `npm run test --workspaces` | Yes |

### Level 2 — Manual smoke (20 items)

Run the **relevant subset** after each step (item availability depends on what's been built):

- **After Step 3 (login flow):** auth happy paths + auth error paths + access gating = **14 items**. Shell/dashboard items not yet applicable.
- **After Step 4 (shell swap):** add shell & navigation items (3) + recheck auth happy paths (login lands in new shell) = **17 items**.
- **After Step 5 (dashboard):** all **20 items** — dashboard items now validatable.
- **After Step 6 (middleware):** spot-check access gating (1 item) + full navigation (3 items).
- **Step 7 PR gate:** all 20 items green before PR opens.

```
Auth happy paths:
[ ] /admin redirects to /admin/login when logged out
[ ] Email/password login OK → lands on dashboard
[ ] Google OAuth login OK → lands on dashboard (P2/P3 done)
[ ] Logout button in topbar → session cleared, back at /admin/login

Auth error paths:
[ ] Wrong password → "Email ou senha inválidos" (errorInvalidCredentials)
[ ] Nonexistent email → same message (LGPD: no enumeration)
[ ] Forgot with nonexistent email → generic success (LGPD)
[ ] Forgot with real email → reset link received
[ ] Reset link: expired/invalid → gateLocked body shown
[ ] Reset: mismatched passwords → errorMismatch
[ ] Reset: weak password (<8 chars) → errorWeakPassword
[ ] Reset: happy path → password updated, redirect
[ ] Non-admin user logs in → /admin/login?error=unauthorized

Access gating:
[ ] Direct /zadmin/* request → 404 (middleware blocks internal path)

Shell & navigation:
[ ] Sidebar shows 5 sections with correct lucide icons
[ ] Topbar shows branding (BrightTale) + Sair button
[ ] Navigate /admin → /admin/users → /admin/orgs → /admin/agents → /admin/analytics

Dashboard:
[ ] KPI numeric values match baseline (same Supabase queries)
[ ] AlertsPanel renders with API/Supabase health entries
[ ] ActivityFeed renders ≥5 recent users
[ ] RefreshIndicator visible; clicking triggers server refresh
```

### Level 3 — Staging

- Push branch → Vercel preview build (requires P1)
- Run 20-item checklist against preview URL with real Supabase staging admin
- Google OAuth specifically requires canonical staging URL registered (preview PR URLs won't work due to dynamic subdomains)

### Level 4 — Production (post-merge)

- Reduced smoke: login + dashboard + logout
- Monitor Axiom 10 min post-deploy (spike detection)
- Monitor PostHog funnel `login → dashboard view`
- No Sentry in apps/web (confirmed not installed)

### Rollback triggers

| Trigger | Action |
|---|---|
| Smoke fails at any step during dev | Revert commit; fix; re-run |
| Preview broken | Revert last commit OR `git reset --hard pre-admin-062 && force-push` (with team notice) |
| Post-merge to staging: error rate `/admin/*` > 5 req/min sustained for 10min | Investigate |
| Post-merge to staging: error rate > 10 req/min sustained for 5min OR >20% admin 5xx | `git revert` merge commit; redeploy |
| Production: any React hydration crash, shell render failure | Rollback Vercel deploy to prior commit |

### Visual regression policy

**Accept as "same":**
- BrightTale brand colors preserved (teal `#2DD4A8`, dark navy `#0F1620`)
- Layout: sidebar left, vertical nav, main content with current padding
- Dashboard KPI labels + numeric values identical

**Accept as "different":**
- Topbar (new in 0.6.0) with branding + Sair button
- Dashboard: `AlertsPanel` shape replaces custom `HealthDot`
- Dashboard: `ActivityFeed` shape replaces custom `RecentUsers`
- Login: Google button + forgot-password link present
- New pages: `/admin/forgot-password`, `/admin/reset-password`

### Browser coverage

- Chrome latest (primary, dev)
- Safari latest (staging smoke — Mac-heavy user base)
- Mobile: not tested — admin not mobile-responsive today, documented limitation

### PR description template

```
## Upgrade @tn-figueiredo/admin 0.1.1 → 0.6.2 + auth-nextjs 2.0.0 → 2.2.0

**Spec:** docs/superpowers/specs/2026-04-16-admin-062-upgrade-design.md

### Change summary
[Paste inventory totals table]

### Visual diff
[Paste before/after screenshots; 5 routes × 2 modes where applicable]

### Smoke checklist (20 items)
- [ ] ... (all checked with evidence)

### Accept as same / different
[Paste §7 visual policy table]

### Rollback
`git revert` merge commit within 30 min if /admin/* error rate > 10/min.
```

---

## 8. Risks & Mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Breaking API changes admin 0.1→0.6 cause typecheck to explode | High | Step 1 accepts type errors; Steps 3–5 fix inline during refactor |
| R2 | Slate remap causes light-mode regression across login / users / orgs | High | Smoke explicitly tests light mode; remap only the 6 shades actually used by lib; narrow if needed |
| R3 | Google OAuth callback URL mismatch blocks login | Medium | Fallback plan B (stub action); prerequisite P2/P3 enforced before Step 3 |
| R4 | Edge runtime incompat for auth-nextjs in middleware | **Medium** | Static probe (grep for CJS `require('fs'|...)` + `Buffer`/`process.versions` tokens) cleans at install time — this is smoke, not proof. Dynamic imports, inlined crypto, and transitive deps from `@supabase/ssr` could still break at runtime. Real verification: `next build` in Task 6.3 catches build-time violations; runtime failures surface on first request in staging. If runtime rejects, revert Step 6 only — other steps retain their value |
| R5 | Vercel preview build fails (no `NPM_TOKEN`) | Medium | P1 prerequisite; fail fast on first push |
| R6 | `features.darkMode: true` config flag is type-only (not consumed upstream) | Low | Known, documented; consumer retains local toggle using `useDarkModeGuard` |
| R7 | LOC estimates off by ±20 per file | Low | Accept; actuals captured in PR diff |
| R8 | `packages/admin` upstream upgrade 0.6.2 → 0.7.x during Phase 1 | Low | Pin `--save-exact`; ignore upstream releases mid-phase |
| R9 | Supabase SMTP quota exhausted or misconfigured → forgot/reset emails never arrive | Medium | P5 prerequisite; test with real email in staging before declaring Step 3 accepted |

---

## 9. Out of Scope (reiterated)

- `agents/`, `users/`, `orgs/`, `analytics/` internals — untouched
- New analytics charts or metrics
- SiteSwitcher / multi-tenant
- Support chat module
- Mobile responsiveness
- Affiliate features (Phase 2)

---

## 10. Open Questions

None. All decisions made during brainstorm. If unexpected questions arise during implementation, log them as new issues — do not silently decide.

---

## 11. References

- Admin package README + CHANGELOG: `npm.pkg.github.com/@tn-figueiredo/admin/0.6.2`
- Auth-nextjs package: `npm.pkg.github.com/@tn-figueiredo/auth-nextjs/2.2.0`
- TNF Ecosystem architecture doc: `/Users/figueiredo/Workspace/TNF_Ecosystem_Architecture.md`
- Next.js Tailwind 4 class-based dark mode pattern: `@custom-variant dark (&:where(.dark, .dark *))`
- Supabase SSR cookie pattern: already in place via `lib/supabase/server.ts`

---

## 12. Next Phase (Phase 2)

After Phase 1 merges + stabilizes in production, open a new spec:

- Title: Affiliates + Derivatives
- Packages: `@tn-figueiredo/affiliate@0.4.0` (domain + 5 SQL migrations) + `@tn-figueiredo/affiliate-admin@0.3.3` (RSC admin UI with `AffiliateAdminProvider`)
- Likely derivatives: fraud-detection link for affiliate fraud scoring; billing integration for commission calculations + payouts
- New admin section in `admin-layout-config.ts` — Phase 1's config structure directly supports adding it

---

## Appendix A — Code skeletons for new files

These are the exact shapes to implement. Not full code — just enough to remove ambiguity.

### `src/lib/admin-layout-config.tsx`

```typescript
import type { AdminLayoutConfig } from '@tn-figueiredo/admin'
import { adminPath } from '@/lib/admin-path'
import { ThemeToggle } from '@/app/zadmin/(protected)/theme-toggle'

export const ADMIN_LAYOUT_CONFIG: AdminLayoutConfig = {
  appName: 'BrightTale Admin',
  sections: [
    {
      group: 'Principal',
      items: [
        { label: 'Dashboard', path: adminPath(),          icon: 'LayoutDashboard' },
      ],
    },
    {
      group: 'Gestão',
      items: [
        { label: 'Usuários',      path: adminPath('/users'),     icon: 'Users' },
        { label: 'Organizations', path: adminPath('/orgs'),      icon: 'Building2' },
        { label: 'Agentes',       path: adminPath('/agents'),    icon: 'Bot' },
        { label: 'Analytics',     path: adminPath('/analytics'), icon: 'BarChart3' },
      ],
    },
  ],
  branding: {
    siteName: 'BrightTale',
    primaryDomain: 'brighttale.io',
    defaultLocale: 'pt-BR',
    primaryColor: '#2DD4A8',
  },
  logoutPath: adminPath('/logout'),
  logoutLabel: 'Sair',
  siteSwitcherSlot: <ThemeToggle />, // repurposed slot; see §4
  // features.darkMode omitted — flag is type-only upstream (no-op)
}
```

### `src/lib/auth/admin-actions.ts`

```typescript
'use server'

import {
  signInWithPassword as _signInWithPassword,
  signInWithGoogle   as _signInWithGoogle,
  forgotPassword     as _forgotPassword,
  resetPassword      as _resetPassword,
  signOutAction      as _signOut,
} from '@tn-figueiredo/auth-nextjs/actions'

function requireAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL
  if (!url) throw new Error('NEXT_PUBLIC_APP_URL is not configured (see spec §3 env inventory)')
  return url
}

const RESET_PATH = '/admin/reset-password'

export async function signInWithPassword(input: { email: string; password: string }) {
  return _signInWithPassword(input)
}

export async function signInWithGoogle(input: { redirectTo?: string }) {
  return _signInWithGoogle({ appUrl: requireAppUrl(), redirectTo: input.redirectTo ?? '/admin' })
}

export async function forgotPassword(input: { email: string }) {
  return _forgotPassword({ email: input.email, appUrl: requireAppUrl(), resetPath: RESET_PATH })
}

export async function resetPassword(input: { password: string }) {
  return _resetPassword(input)
}

export async function signOut() {
  // Logout UX must always appear successful. Swallow lib errors.
  try {
    return await _signOut()
  } catch {
    return { ok: true as const }
  }
}
```

### `src/app/zadmin/login/page.tsx`

```tsx
'use client'

import { AdminLogin } from '@tn-figueiredo/admin/login'
import { useSearchParams } from 'next/navigation'
import * as actions from '@/lib/auth/admin-actions'

const THEME = {
  bg:            'var(--auth-bg)',
  card:          'var(--auth-card-bg)',
  accent:        'var(--auth-accent)',
  accentHover:   'var(--auth-accent-hover)',
  text:          'var(--auth-text)',
  muted:         'var(--auth-muted)',
  border:        'var(--auth-border)',
}

export default function LoginPage() {
  const authError = useSearchParams().get('error') ?? undefined
  return (
    <AdminLogin
      actions={{
        signInWithPassword: actions.signInWithPassword,
        signInWithGoogle:   actions.signInWithGoogle,
      }}
      theme={THEME}
      authError={authError}
      redirectTo="/admin"
    />
  )
}
```

### `src/app/zadmin/forgot-password/page.tsx` and `reset-password/page.tsx`

Same pattern: client wrapper, imports lib component from `/login`, passes matching subset of `actions` + `theme={THEME}`.

### `src/app/zadmin/logout/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { signOut } from '@/lib/auth/admin-actions'
import { adminPath } from '@/lib/admin-path'

export async function POST(request: Request) {
  await signOut() // swallow errors — logout UX should always appear successful
  const loginUrl = new URL(adminPath('/login'), request.url)
  return NextResponse.redirect(loginUrl, { status: 303 })
}
```

### Shrunk `src/app/zadmin/(protected)/theme-toggle.tsx`

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useDarkModeGuard } from '@tn-figueiredo/admin/client'

const STORAGE_KEY = 'bt-admin-theme'

export function ThemeToggle() {
  const { mounted, isDark: initialDark } = useDarkModeGuard()
  const [isDark, setIsDark] = useState(initialDark)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as 'dark' | 'light' | null
    if (stored) {
      document.documentElement.classList.toggle('dark', stored === 'dark')
      document.documentElement.classList.toggle('light', stored === 'light')
      setIsDark(stored === 'dark')
    }
  }, [])

  if (!mounted) return null

  function toggle() {
    const next = isDark ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', next === 'dark')
    document.documentElement.classList.toggle('light', next === 'light')
    localStorage.setItem(STORAGE_KEY, next)
    setIsDark(next === 'dark')
  }

  return (
    <button onClick={toggle} aria-label={isDark ? 'Modo claro' : 'Modo escuro'}>
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
```

### FOUC-prevention script — add to root `apps/web/src/app/layout.tsx`

Add inside `<head>` (before any `<body>` content), as a blocking inline script. Must run before React hydrates to avoid flash:

```tsx
// in the root layout.tsx JSX
<head>
  <script
    dangerouslySetInnerHTML={{
      __html: `(function(){try{var t=localStorage.getItem('bt-admin-theme');var d=t==='dark'||(t==null&&window.matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.classList.toggle('light',!d);}catch(e){}})();`,
    }}
  />
</head>
```

Reads `bt-admin-theme` (same key as `ThemeToggle`), falls back to system preference when unset, applies class before paint. Try/catch in case of SSR or storage-disabled browsers.

### `apps/web/src/lib/auth/__tests__/admin-actions.test.ts` (new, ~80 LOC)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tn-figueiredo/auth-nextjs/actions', () => ({
  signInWithPassword: vi.fn(),
  signInWithGoogle: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  signOutAction: vi.fn(),
}))

import * as lib from '@tn-figueiredo/auth-nextjs/actions'
import * as actions from '../admin-actions'

describe('admin-actions wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = 'https://brighttale.test'
  })

  it('signInWithGoogle injects appUrl from env', async () => {
    vi.mocked(lib.signInWithGoogle).mockResolvedValue({ ok: true, url: 'https://…' })
    await actions.signInWithGoogle({})
    expect(lib.signInWithGoogle).toHaveBeenCalledWith({
      appUrl: 'https://brighttale.test',
      redirectTo: '/admin',
    })
  })

  it('signOut swallows lib errors and returns ok', async () => {
    vi.mocked(lib.signOutAction).mockRejectedValue(new Error('supabase down'))
    const result = await actions.signOut()
    expect(result).toEqual({ ok: true })
  })

  // remaining 6 tests per §7.1 table
})
```

### `src/app/zadmin/(protected)/admin-shell.tsx` (new client shim)

```tsx
'use client'

import { createAdminLayout } from '@tn-figueiredo/admin'
import { ADMIN_LAYOUT_CONFIG } from '@/lib/admin-layout-config'

const AdminLayout = createAdminLayout(ADMIN_LAYOUT_CONFIG)

export function AdminShell({
  userEmail,
  children,
}: {
  userEmail: string
  children: React.ReactNode
}) {
  return <AdminLayout userEmail={userEmail}>{children}</AdminLayout>
}
```

### `src/app/zadmin/(protected)/layout.tsx` (shrunk, Server Component)

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin-check'
import { adminPath } from '@/lib/admin-path'
import { AdminShell } from './admin-shell'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(adminPath('/login'))
  if (!(await isAdminUser(supabase, user.id))) redirect(adminPath('/login?error=unauthorized'))
  return <AdminShell userEmail={user.email!}>{children}</AdminShell>
}
```

---

## Appendix B — Supabase email templates

Forgot-password emails are sent by Supabase using its default template. For Phase 1, accept the default (functional but unbranded). Follow-up task: customize template in Supabase Dashboard → Auth → Email Templates to include BrightTale branding. Not a blocker for this spec.
