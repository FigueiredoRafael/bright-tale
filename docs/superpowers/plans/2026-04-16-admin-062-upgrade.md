# Admin Package Upgrade 0.1.1 → 0.6.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `@tn-figueiredo/admin` from `0.1.1` to `0.6.2` + peer `@tn-figueiredo/auth-nextjs` from `2.0.0` to `^2.2.0` in `apps/web`, replacing custom sidebar/login/theme-toggle with lib primitives while preserving BrightTale brand via Tailwind 4 @theme overrides and AuthTheme CSS vars.

**Architecture:** Consumer retains auth/data/theme responsibilities; the lib owns shell + components + login UI + hooks. Single `ADMIN_LAYOUT_CONFIG` drives sidebar & topbar; server actions in `admin-actions.ts` wrap auth-nextjs 2.2 actions with `NEXT_PUBLIC_APP_URL` injection. See `docs/superpowers/specs/2026-04-16-admin-062-upgrade-design.md`.

**Tech Stack:** Next.js 16 + React 19 + Supabase SSR + Tailwind 4 + Vitest 4 + TypeScript strict.

---

## Pre-flight Context

**Spec:** `docs/superpowers/specs/2026-04-16-admin-062-upgrade-design.md`

**Pre-requisites (operator-verified BEFORE starting):**
- P1 `NPM_TOKEN` set in Vercel (web project)
- P2 Google OAuth Client credentials created in Google Cloud Console
- P3 Google provider enabled in Supabase (Auth → Providers → Google)
- P4 Callback URLs registered in Google Cloud: dev (`http://localhost:3002/auth/callback`) + staging canonical URL
- P5 Supabase SMTP configured + test email sent
- P6 `NEXT_PUBLIC_APP_URL` present in `apps/web/.env.local`

If any pre-req is not met, **stop** and complete it before running Phase 0. Plan B for Google (stub signInWithGoogle) is documented in spec §6 Step 3; only activate if P2/P3 block execution.

**Branch:** create `feat/admin-upgrade-062` from `staging` before starting.

---

## Phase 0 — Baseline

### Task 0.1: Create branch + rollback tag

**Files:** none (git operations only)

- [ ] **Step 1: Verify clean working tree on staging**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git status
git branch --show-current
```
Expected: `staging` branch, no staged/unstaged changes.

- [ ] **Step 2: Create branch and tag**

Run:
```bash
git checkout -b feat/admin-upgrade-062
git tag pre-admin-062
```
Expected: switched to new branch; tag `pre-admin-062` created.

- [ ] **Step 3: Clear stale Next.js cache**

Run:
```bash
rm -rf apps/web/.next
```
Expected: no output. Prevents Tailwind 4 from serving stale `@source` scans during later phases.

### Task 0.2: Verify NEXT_PUBLIC_APP_URL is set

**Files:** Modify: `apps/web/.env.local` if needed

- [ ] **Step 1: Check for env var**

Run:
```bash
grep '^NEXT_PUBLIC_APP_URL=' apps/web/.env.local 2>/dev/null || echo "MISSING"
```

- [ ] **Step 2: Add if missing**

If Step 1 printed `MISSING`, append to `apps/web/.env.local`:

```
NEXT_PUBLIC_APP_URL=http://localhost:3002
```

- [ ] **Step 3: Verify**

Run:
```bash
grep '^NEXT_PUBLIC_APP_URL=' apps/web/.env.local
```
Expected: prints `NEXT_PUBLIC_APP_URL=http://localhost:3002`

### Task 0.3: Capture baseline screenshots [OPERATOR, ~20 min]

**Files:** Create: `docs/superpowers/specs/assets/admin-062-baseline/*.png` (7 files)

**⚠ Human-in-loop.** Cannot be automated — requires browser + admin credentials. Agent executors must stop here and request operator run this task, or skip and accept no visual regression baseline (spec §7 "visual regression policy" cannot be fully enforced without it).

- [ ] **Step 1: Start dev server**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run dev:web
```
Expected: dev server on port 3002. Leave running for screenshots.

- [ ] **Step 2: Log in and capture 5 dark-mode routes + 2 login modes**

In browser, log in as admin and screenshot each route:
1. `http://localhost:3002/admin` (dashboard, dark)
2. `http://localhost:3002/admin/users` (dark)
3. `http://localhost:3002/admin/orgs` (dark)
4. `http://localhost:3002/admin/agents` (dark)
5. `http://localhost:3002/admin/analytics` (dark)

Log out. Screenshot login in both modes:

6. `http://localhost:3002/admin/login` (dark — default)
7. `http://localhost:3002/admin/login` (light — login has no visible toggle today; open DevTools console and run `document.documentElement.classList.add('light'); document.documentElement.classList.remove('dark');` then screenshot)

Save as: `docs/superpowers/specs/assets/admin-062-baseline/{01-dashboard,02-users,03-orgs,04-agents,05-analytics,06-login-dark,07-login-light}.png`

- [ ] **Step 3: Stop dev server**

Ctrl+C the dev process.

- [ ] **Step 4: Commit baselines**

Run:
```bash
git add docs/superpowers/specs/assets/admin-062-baseline/
git commit -m "docs: admin baseline screenshots before 0.6.2 upgrade"
```

---

## Phase 1 — Package upgrades

### Task 1.1: Install admin 0.6.2 + auth-nextjs 2.2.0

**Files:** Modify: `apps/web/package.json`, `package-lock.json` (root)

- [ ] **Step 1: Install**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/web
npm install @tn-figueiredo/admin@0.6.2 @tn-figueiredo/auth-nextjs@^2.2.0 --save-exact
```
Expected: lockfile updated; new versions visible in `apps/web/package.json`.

- [ ] **Step 2: Verify versions**

Run:
```bash
grep -E '"@tn-figueiredo/(admin|auth-nextjs)"' /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/web/package.json
```
Expected:
```
"@tn-figueiredo/admin": "0.6.2",
"@tn-figueiredo/auth-nextjs": "2.2.0",
```

### Task 1.2: Edge-runtime compatibility probe (static smoke, not full verification)

**Files:** none (diagnostic only, evidence captured in commit body)

**What this probe is and isn't:** a literal grep for `require('fs'|...)` CJS patterns. It **misses**: dynamic imports, Buffer/process usage inlined without `require`, transitive Node deps via `@supabase/ssr`. A clean grep raises confidence but does **not** prove Edge compatibility. Runtime verification happens in Task 6.3 (`next build` catches most build-time Edge violations) and in staging deploy. See spec §8 R4.

- [ ] **Step 1: Grep dist for Node-only built-ins**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
grep -rE "require\(['\"](fs|path|crypto|child_process|os|stream|net|tls)['\"]" \
  apps/web/node_modules/@tn-figueiredo/auth-nextjs/dist/ 2>/dev/null || echo "No Node-only requires"
```
Expected: `No Node-only requires`. Save output for commit body. If matches appear, **skip Phase 6** and update spec R4 mitigation accordingly.

- [ ] **Step 2: Additional smoke — look for Buffer/process global usage**

Run:
```bash
grep -rE "\b(Buffer|process\.versions|process\.platform)" \
  apps/web/node_modules/@tn-figueiredo/auth-nextjs/dist/ 2>/dev/null | head -5 || echo "No Node globals"
```
Clean output raises confidence further; matches mean Phase 6 is higher-risk.

### Task 1.3: Record typecheck baseline errors

**Files:** none (diagnostic only)

- [ ] **Step 1: Run typecheck**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run typecheck 2>&1 | tee /tmp/typecheck-post-install.log
```
Expected: **errors are expected** — API drift between admin 0.1 and 0.6. Count them: `grep -cE "error TS" /tmp/typecheck-post-install.log`. Save count for commit body.

- [ ] **Step 2: Commit package upgrades**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add apps/web/package.json package-lock.json
git commit -m "chore(web): upgrade admin 0.1.1→0.6.2 + auth-nextjs 2.0.0→2.2.0

Edge probe: No Node-only requires
Typecheck errors at this commit: N (to be fixed in phases 3-5)"
```
(Replace `N` with actual count from grep.)

---

## Phase 2 — Theme tokens

### Task 2.1: Add slate remap to @theme block

**Files:** Modify: `apps/web/src/app/globals.css:10-53` (`@theme` block — extend)

- [ ] **Step 1: Edit globals.css**

Insert the following inside the `@theme { … }` block in `apps/web/src/app/globals.css`, just before the closing `}` on line 53 (right after the shadcn block, before `}`):

```css
  /* ── slate remap for @tn-figueiredo/admin shell (0.6.2) ── */
  /* Lib uses hardcoded `bg-slate-50 dark:bg-slate-900`, etc.  */
  /* Remap to BrightTale tokens so shell inherits brand colors */
  --color-slate-50: #F7F9FC;
  --color-slate-100: #EEF2F7;
  --color-slate-200: #E2E8F0;
  --color-slate-300: #CBD5E1;
  --color-slate-400: #94A3B8;
  --color-slate-500: #64748B;
  --color-slate-600: #475569;
  --color-slate-700: #1E2E40;
  --color-slate-800: #141E2A;
  --color-slate-900: #0A1017;
```

- [ ] **Step 2: Verify insertion**

Run:
```bash
grep -A1 "slate remap" /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/web/src/app/globals.css
```
Expected: shows the comment + first remap line.

### Task 2.2: Add AuthTheme CSS variables

**Files:** Modify: `apps/web/src/app/globals.css:56-69` (`:root` block), `:86-99` (`html.light` block)

- [ ] **Step 1: Add AuthTheme vars to `:root` (dark default)**

Append to the `:root { … }` block in `globals.css` just before the closing `}`:

```css

  /* ── @tn-figueiredo/admin AuthTheme — dark ── */
  --auth-bg: var(--color-sh-background);
  --auth-card-bg: var(--color-sh-card);
  --auth-accent: var(--color-sh-primary);
  --auth-accent-hover: var(--color-v-teal);
  --auth-text: var(--color-sh-foreground);
  --auth-muted: var(--color-v-secondary);
  --auth-border: var(--color-sh-border);
```

- [ ] **Step 2: Add AuthTheme vars to `html.light` block**

Append to the `html.light { … }` block:

```css

  /* ── @tn-figueiredo/admin AuthTheme — light ── */
  --auth-bg: var(--color-sh-background);
  --auth-card-bg: var(--color-sh-card);
  --auth-accent: var(--color-sh-primary);
  --auth-accent-hover: #14B8A6;
  --auth-text: var(--color-sh-foreground);
  --auth-muted: var(--color-sh-muted-foreground);
  --auth-border: var(--color-sh-border);
```

- [ ] **Step 3: Verify**

Run:
```bash
grep -c "AuthTheme" /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/web/src/app/globals.css
```
Expected: `2` (one comment per block).

### Task 2.3: Smoke-test light mode on slate-heavy pages

**Files:** none (visual verification only)

- [ ] **Step 1: Start dev server**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run dev:web
```

- [ ] **Step 2: Inspect light mode on users + login**

Open `http://localhost:3002/admin/login`, toggle to light mode (DevTools: add `light` class to `<html>`, remove `dark`). Confirm page still reads — minor shade drift OK, hue reversal (e.g. white text on white) NOT ok.

Repeat for `http://localhost:3002/admin/users` after logging in.

If hue reversal observed, narrow the slate remap in `globals.css` Task 2.1 to only the 4 shades the new shell uses (`50/100/800/900`) and retest.

- [ ] **Step 3: Stop dev server**

Ctrl+C.

- [ ] **Step 4: Commit theme tokens**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add apps/web/src/app/globals.css
git commit -m "feat(web): add admin shell slate remap + AuthTheme color tokens"
```

---

## Phase 3 — Login flow replacement (TDD)

### Task 3.1: Write failing tests for admin-actions wrappers

**Files:** Create: `apps/web/src/lib/auth/__tests__/admin-actions.test.ts`

- [ ] **Step 1: Create test file**

Create `apps/web/src/lib/auth/__tests__/admin-actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://brighttale.test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('signInWithPassword forwards input unchanged', async () => {
    vi.mocked(lib.signInWithPassword).mockResolvedValue({ ok: true })
    await actions.signInWithPassword({ email: 'a@b.co', password: 'pw' })
    expect(lib.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw' })
  })

  it('signInWithGoogle injects appUrl from env', async () => {
    vi.mocked(lib.signInWithGoogle).mockResolvedValue({ ok: true, url: 'https://…' })
    await actions.signInWithGoogle({})
    expect(lib.signInWithGoogle).toHaveBeenCalledWith({
      appUrl: 'https://brighttale.test',
      redirectTo: '/admin',
    })
  })

  it('signInWithGoogle respects caller-provided redirectTo', async () => {
    vi.mocked(lib.signInWithGoogle).mockResolvedValue({ ok: true, url: 'https://…' })
    await actions.signInWithGoogle({ redirectTo: '/admin/users' })
    expect(lib.signInWithGoogle).toHaveBeenCalledWith({
      appUrl: 'https://brighttale.test',
      redirectTo: '/admin/users',
    })
  })

  it('signInWithGoogle throws if NEXT_PUBLIC_APP_URL missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    await expect(actions.signInWithGoogle({})).rejects.toThrow(/NEXT_PUBLIC_APP_URL/)
  })

  it('forgotPassword injects appUrl + resetPath', async () => {
    vi.mocked(lib.forgotPassword).mockResolvedValue({ ok: true })
    await actions.forgotPassword({ email: 'a@b.co' })
    expect(lib.forgotPassword).toHaveBeenCalledWith({
      email: 'a@b.co',
      appUrl: 'https://brighttale.test',
      resetPath: '/admin/reset-password',
    })
  })

  it('resetPassword forwards input unchanged', async () => {
    vi.mocked(lib.resetPassword).mockResolvedValue({ ok: true })
    await actions.resetPassword({ password: 'newpass12' })
    expect(lib.resetPassword).toHaveBeenCalledWith({ password: 'newpass12' })
  })

  it('signOut returns lib result when ok', async () => {
    vi.mocked(lib.signOutAction).mockResolvedValue({ ok: true })
    const result = await actions.signOut()
    expect(result).toEqual({ ok: true })
  })

  it('signOut swallows lib errors and returns ok', async () => {
    vi.mocked(lib.signOutAction).mockRejectedValue(new Error('supabase down'))
    const result = await actions.signOut()
    expect(result).toEqual({ ok: true })
  })
})
```

**Note:** `vi.stubEnv` / `vi.unstubAllEnvs` scope env changes to a single test so parallel test runs don't pollute each other.

- [ ] **Step 2: Run tests — must fail (module not found)**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npx vitest run apps/web/src/lib/auth/__tests__/admin-actions.test.ts 2>&1 | tail -20
```
Expected: FAIL with "Cannot find module '../admin-actions'".

### Task 3.2: Implement admin-actions.ts to pass tests

**Files:** Create: `apps/web/src/lib/auth/admin-actions.ts`

- [ ] **Step 1: Create file**

Create `apps/web/src/lib/auth/admin-actions.ts`:

```typescript
'use server'

import {
  signInWithPassword as _signInWithPassword,
  signInWithGoogle as _signInWithGoogle,
  forgotPassword as _forgotPassword,
  resetPassword as _resetPassword,
  signOutAction as _signOut,
} from '@tn-figueiredo/auth-nextjs/actions'

function requireAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL
  if (!url) {
    throw new Error('NEXT_PUBLIC_APP_URL is not configured (see spec §3 env inventory)')
  }
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
  try {
    return await _signOut()
  } catch {
    return { ok: true as const }
  }
}
```

- [ ] **Step 2: Run tests — must pass**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npx vitest run apps/web/src/lib/auth/__tests__/admin-actions.test.ts
```
Expected: all 8 tests PASS.

### Task 3.3: Rewrite login/page.tsx to wrap AdminLogin

**Files:** Modify (full rewrite): `apps/web/src/app/zadmin/login/page.tsx`

- [ ] **Step 1: Replace entire file content**

Replace the full content of `apps/web/src/app/zadmin/login/page.tsx` with:

```tsx
'use client'

import { Suspense } from 'react'
import { AdminLogin } from '@tn-figueiredo/admin/login'
import { useSearchParams } from 'next/navigation'
import { adminPath } from '@/lib/admin-path'
import * as actions from '@/lib/auth/admin-actions'

export const dynamic = 'force-dynamic'

const THEME = {
  bg: 'var(--auth-bg)',
  card: 'var(--auth-card-bg)',
  accent: 'var(--auth-accent)',
  accentHover: 'var(--auth-accent-hover)',
  text: 'var(--auth-text)',
  muted: 'var(--auth-muted)',
  border: 'var(--auth-border)',
} as const

function LoginForm() {
  const authError = useSearchParams().get('error') ?? undefined
  return (
    <AdminLogin
      actions={{
        signInWithPassword: actions.signInWithPassword,
        signInWithGoogle: actions.signInWithGoogle,
      }}
      theme={THEME}
      authError={authError}
      redirectTo={adminPath()}
    />
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
```

**Why both `dynamic = 'force-dynamic'` and `<Suspense>`:** Next 16 enforces Suspense-wrapping for `useSearchParams` during build; the `dynamic` export is a belt-and-suspenders guard since the page is inherently runtime-dependent. `adminPath()` replaces hardcoded `/admin` so slug customization propagates.

- [ ] **Step 2: Typecheck just this file**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/web
npx tsc --noEmit src/app/zadmin/login/page.tsx 2>&1 | tail -10
```
Expected: no errors (may show unrelated config errors from `--noEmit` on single file; prioritize absence of errors in this path).

### Task 3.4: Create forgot-password page

**Files:** Create: `apps/web/src/app/zadmin/forgot-password/page.tsx`

- [ ] **Step 1: Create file**

Create `apps/web/src/app/zadmin/forgot-password/page.tsx`:

```tsx
'use client'

import { AdminForgotPassword } from '@tn-figueiredo/admin/login'
import { adminPath } from '@/lib/admin-path'
import * as actions from '@/lib/auth/admin-actions'

export const dynamic = 'force-dynamic'

const THEME = {
  bg: 'var(--auth-bg)',
  card: 'var(--auth-card-bg)',
  accent: 'var(--auth-accent)',
  accentHover: 'var(--auth-accent-hover)',
  text: 'var(--auth-text)',
  muted: 'var(--auth-muted)',
  border: 'var(--auth-border)',
} as const

export default function ForgotPasswordPage() {
  return (
    <AdminForgotPassword
      actions={{ forgotPassword: actions.forgotPassword }}
      theme={THEME}
      loginHref={adminPath('/login')}
    />
  )
}
```

### Task 3.5: Create reset-password page

**Files:** Create: `apps/web/src/app/zadmin/reset-password/page.tsx`

- [ ] **Step 1: Create file**

Create `apps/web/src/app/zadmin/reset-password/page.tsx`:

```tsx
'use client'

import { AdminResetPassword } from '@tn-figueiredo/admin/login'
import { adminPath } from '@/lib/admin-path'
import * as actions from '@/lib/auth/admin-actions'

export const dynamic = 'force-dynamic'

const THEME = {
  bg: 'var(--auth-bg)',
  card: 'var(--auth-card-bg)',
  accent: 'var(--auth-accent)',
  accentHover: 'var(--auth-accent-hover)',
  text: 'var(--auth-text)',
  muted: 'var(--auth-muted)',
  border: 'var(--auth-border)',
} as const

export default function ResetPasswordPage() {
  return (
    <AdminResetPassword
      actions={{ resetPassword: actions.resetPassword }}
      theme={THEME}
      redirectAfterReset={adminPath('/login?reset=ok')}
    />
  )
}
```

### Task 3.6: Create logout POST route handler

**Files:** Create: `apps/web/src/app/zadmin/logout/route.ts`

- [ ] **Step 1: Create file**

Create `apps/web/src/app/zadmin/logout/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { signOut } from '@/lib/auth/admin-actions'
import { adminPath } from '@/lib/admin-path'

export async function POST(request: Request) {
  // Logout UX must always appear successful — admin-actions.ts swallows errors
  await signOut()
  const loginUrl = new URL(adminPath('/login'), request.url)
  return NextResponse.redirect(loginUrl, { status: 303 })
}
```

### Task 3.7: Broaden middleware exempt list

**Files:** Modify: `apps/web/src/middleware.ts:23-26` (replace single login exemption with full public list)

- [ ] **Step 1: Edit middleware.ts**

Replace this block in `apps/web/src/middleware.ts`:

```typescript
  // Login page is public
  if (pathname === adminPath('/login')) {
    return response;
  }
```

With:

```typescript
  // Public admin paths — no auth required
  const PUBLIC_ADMIN_PATHS = new Set([
    adminPath('/login'),
    adminPath('/forgot-password'),
    adminPath('/reset-password'),
    adminPath('/logout'),
  ]);
  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    return response;
  }
```

- [ ] **Step 2: Verify**

Run:
```bash
grep -A5 "PUBLIC_ADMIN_PATHS" /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/web/src/middleware.ts
```
Expected: shows the new set with all 4 paths.

### Task 3.8: Add FOUC-prevention script to root layout

**Files:** Modify: `apps/web/src/app/layout.tsx:46-57`

**Note:** current file has a pre-existing bug — `<WebVitals />` sits as a sibling of `<body>` inside `<html>`, which is invalid JSX placement. This task fixes that bug incidentally by moving WebVitals inside `<body>` while adding the FOUC `<head>`.

- [ ] **Step 1: Add script tag and fix WebVitals placement**

Replace lines 46-57 (the `RootLayout` function) in `apps/web/src/app/layout.tsx` with:

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* FOUC-prevention: set dark/light class before React hydrates.
            Reads localStorage, falls back to system preference. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('bt-admin-theme');var d=t==='dark'||(t==null&&window.matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.classList.toggle('light',!d);}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`}>
        <WebVitals />
        <PostHogProvider>
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
```

### Task 3.9: Run typecheck + unit tests

**Files:** none

- [ ] **Step 1: Typecheck web**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/web
npx tsc --noEmit
```
Expected: no errors in login/forgot/reset/logout/middleware/admin-actions paths. Remaining errors from stale types in shell/sidebar/theme-toggle are fixed in Phase 4 — note them but don't fix yet.

- [ ] **Step 2: Run full test suite**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run test --workspaces --if-present
```
Expected: admin-actions test file: 8 pass. Other workspaces: passWithNoTests or pre-existing passes.

### Task 3.10: Commit Phase 3

**Files:** none (git only)

- [ ] **Step 1: Stage all Phase 3 files**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add apps/web/src/lib/auth/ \
        apps/web/src/app/zadmin/login/page.tsx \
        apps/web/src/app/zadmin/forgot-password/ \
        apps/web/src/app/zadmin/reset-password/ \
        apps/web/src/app/zadmin/logout/ \
        apps/web/src/middleware.ts \
        apps/web/src/app/layout.tsx
```

- [ ] **Step 2: Commit**

Run:
```bash
git commit -m "feat(web): adopt AdminLogin + forgot/reset + logout route

- admin-actions.ts wrapper layer (+ 8 unit tests: appUrl injection,
  error swallowing on logout)
- login/page.tsx rewritten as thin AdminLogin wrapper (~40 LOC)
- forgot-password + reset-password pages (new)
- logout POST route (new)
- middleware broadened: 4 public admin paths exempted
- FOUC-prevention script in root layout"
```

- [ ] **Step 3: Smoke subset (14 items)**

Start dev server (`npm run dev:web`). Run items from spec §7 Level 2 "After Step 3" subset: 14 items covering auth happy paths, error paths, access gating.

**Handling failures:**
- **All 14 pass:** proceed to Phase 4.
- **Only Google OAuth fails** (P2/P3 pending): activate Plan B — edit `admin-actions.ts` so `signInWithGoogle` returns `{ ok: false, error: 'google_not_configured' }` and update login `strings` prop: `strings={{ googleButton: 'Google (em breve)' }}`. Make as a **separate commit** on top of the main Phase 3 commit: `chore(web): stub Google OAuth until P2/P3 configured`. This keeps the main Phase 3 commit pristine for when Google lights up.
- **Other items fail** (forgot/reset email, logout, etc.): **stop**, investigate, fix, and re-run smoke before advancing. Do NOT accumulate regressions across phases.
- **SMTP unavailable** (P5 pending): skip forgot/reset items and mark them explicitly pending in Phase 7 PR body.

---

## Phase 4 — Shell swap

### Task 4.1: Create admin-layout-config.tsx

**Files:** Create: `apps/web/src/lib/admin-layout-config.tsx`

- [ ] **Step 1: Create file**

Create `apps/web/src/lib/admin-layout-config.tsx`:

```tsx
import type { AdminLayoutConfig } from '@tn-figueiredo/admin'
import { adminPath } from '@/lib/admin-path'
import { ThemeToggle } from '@/app/zadmin/(protected)/theme-toggle'

export const ADMIN_LAYOUT_CONFIG: AdminLayoutConfig = {
  appName: 'BrightTale Admin',
  sections: [
    {
      group: 'Principal',
      items: [
        { label: 'Dashboard', path: adminPath(), icon: 'LayoutDashboard' },
      ],
    },
    {
      group: 'Gestão',
      items: [
        { label: 'Usuários', path: adminPath('/users'), icon: 'Users' },
        { label: 'Organizations', path: adminPath('/orgs'), icon: 'Building2' },
        { label: 'Agentes', path: adminPath('/agents'), icon: 'Bot' },
        { label: 'Analytics', path: adminPath('/analytics'), icon: 'BarChart3' },
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
  siteSwitcherSlot: <ThemeToggle />,
}
```

### Task 4.2: Shrink theme-toggle.tsx

**Files:** Modify (full rewrite): `apps/web/src/app/zadmin/(protected)/theme-toggle.tsx`

- [ ] **Step 1: Replace entire file content**

Replace full content of `apps/web/src/app/zadmin/(protected)/theme-toggle.tsx` with:

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
      const dark = stored === 'dark'
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.classList.toggle('light', !dark)
      setIsDark(dark)
    }
  }, [])

  if (!mounted) return null

  function toggle() {
    const next: 'dark' | 'light' = isDark ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', next === 'dark')
    document.documentElement.classList.toggle('light', next === 'light')
    localStorage.setItem(STORAGE_KEY, next)
    setIsDark(next === 'dark')
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Modo claro' : 'Modo escuro'}
      className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
      title={isDark ? 'Modo claro' : 'Modo escuro'}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
```

### Task 4.3: Create admin-shell client shim + rewrite protected layout.tsx

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/admin-shell.tsx`
- Modify (full rewrite): `apps/web/src/app/zadmin/(protected)/layout.tsx`

**Why a shim:** `@tn-figueiredo/admin@0.6.2` root barrel re-exports `SiteSwitcherProvider` (which uses `createContext`) for backward compat. In Next 16 with Turbopack dev, `transpilePackages` alone does NOT inject `'use client'` into those re-exports on the server bundle, causing runtime RSC crash: `createContext only works in Client Components`. The lib's CHANGELOG 0.6.1 recommends a consumer 'use client' shim — this task creates it.

- [ ] **Step 1: Create admin-shell.tsx (client)**

Create `apps/web/src/app/zadmin/(protected)/admin-shell.tsx`:

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

- [ ] **Step 2: Rewrite protected layout.tsx (server)**

Replace full content of `apps/web/src/app/zadmin/(protected)/layout.tsx` with:

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
  if (!(await isAdminUser(supabase, user.id))) {
    redirect(adminPath('/login?error=unauthorized'))
  }
  return <AdminShell userEmail={user.email!}>{children}</AdminShell>
}
```

### Task 4.4: Delete admin-sidebar.tsx

**Files:** Delete: `apps/web/src/app/zadmin/(protected)/admin-sidebar.tsx`

- [ ] **Step 1: Delete file**

Run:
```bash
rm /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/web/src/app/zadmin/\(protected\)/admin-sidebar.tsx
```

- [ ] **Step 2: Verify no stale imports**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
grep -rn "admin-sidebar\|AdminSidebarCustom" apps/web/src/ 2>/dev/null
```
Expected: no matches (empty output). If matches appear, fix the imports before proceeding.

### Task 4.5: Typecheck + build + smoke Phase 4

**Files:** none

- [ ] **Step 1: Typecheck**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run typecheck
```
Expected: 0 errors related to admin shell. Dashboard errors expected (Phase 5 fixes them).

- [ ] **Step 2: Build**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/web
rm -rf .next
npm run build 2>&1 | tail -30
```
Expected: build completes. If it fails on Phase 5 dashboard, note and proceed (Phase 5 fixes).

- [ ] **Step 3: Smoke (17-item subset)**

Start `npm run dev:web`. Run spec §7 Level 2 "After Step 4" subset: all Phase 3 items (14) + 3 shell items. Verify: sidebar shows 5 sections; topbar has BrightTale branding + Sair button; theme toggle (Sun/Moon icon) visible in topbar siteSwitcherSlot.

- [ ] **Step 4: Commit**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add apps/web/src/lib/admin-layout-config.tsx \
        apps/web/src/app/zadmin/\(protected\)/theme-toggle.tsx \
        apps/web/src/app/zadmin/\(protected\)/layout.tsx \
        apps/web/src/app/zadmin/\(protected\)/admin-sidebar.tsx
git commit -m "refactor(web): adopt createAdminLayout; drop custom sidebar

- admin-layout-config.tsx as single source of sidebar+topbar config
- layout.tsx shrunk to auth check + <AdminLayout>
- theme-toggle shrunk to useDarkModeGuard-based (54→~35 LOC)
- admin-sidebar.tsx deleted (-92 LOC)"
```

---

## Phase 5 — Dashboard cleanup

### Task 5.1: Prepare ActivityFeed + AlertsPanel data builders

**Files:** Modify: `apps/web/src/app/zadmin/(protected)/page.tsx` (full rewrite — keep `fetchDashboardData` + `STAGE_LABELS`, replace subcomponents)

- [ ] **Step 1: Replace entire file content**

Replace full content of `apps/web/src/app/zadmin/(protected)/page.tsx` with:

```tsx
import { createAdminClient } from '@/lib/supabase/admin'
import { adminPath } from '@/lib/admin-path'
import {
  KpiCard,
  KpiSection,
  AlertsPanel,
  ActivityFeed,
  RefreshIndicator,
} from '@tn-figueiredo/admin/client'
import type { ActivityEntry, AlertEntry } from '@tn-figueiredo/admin'
import {
  User, UserPlus, Activity, CheckCircle, Search, FileEdit, Lightbulb, Cpu, HeartPulse,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

const STAGE_LABELS: Record<string, string> = {
  brainstorm: 'Brainstorm',
  research: 'Research',
  production: 'Production',
  review: 'Review',
  publish: 'Publish',
}

async function fetchDashboardData() {
  const db = createAdminClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const [
    totalUsers,
    newToday,
    newThisWeek,
    recentUsers,
    totalProjects,
    projectStages,
    publishedProjects,
    researchArchives,
    blogDrafts,
    ideaArchives,
    activeAI,
    apiHealth,
  ] = await Promise.allSettled([
    db.from('user_profiles').select('id', { count: 'exact', head: true }),
    db.from('user_profiles').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
    db.from('user_profiles').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()),
    db.from('user_profiles').select('id, first_name, last_name, created_at').order('created_at', { ascending: false }).limit(8),
    db.from('projects').select('id', { count: 'exact', head: true }),
    db.from('projects').select('current_stage'),
    db.from('projects').select('id', { count: 'exact', head: true }).eq('winner', true),
    db.from('research_archives').select('id', { count: 'exact', head: true }),
    db.from('blog_drafts').select('id', { count: 'exact', head: true }),
    db.from('idea_archives').select('id', { count: 'exact', head: true }),
    db.from('ai_provider_configs').select('id', { count: 'exact', head: true }).eq('is_active', true),
    fetch(`${process.env.API_URL ?? 'https://api.brighttale.io'}/health`, { cache: 'no-store' })
      .then((r) => r.ok)
      .catch(() => false),
  ])

  const byStage: Record<string, number> = {}
  if (projectStages.status === 'fulfilled' && projectStages.value.data) {
    for (const p of projectStages.value.data) {
      const s = p.current_stage as string
      byStage[s] = (byStage[s] ?? 0) + 1
    }
  }

  return {
    users: {
      total: totalUsers.status === 'fulfilled' ? (totalUsers.value.count ?? 0) : 0,
      today: newToday.status === 'fulfilled' ? (newToday.value.count ?? 0) : 0,
      week: newThisWeek.status === 'fulfilled' ? (newThisWeek.value.count ?? 0) : 0,
      recent: recentUsers.status === 'fulfilled' ? (recentUsers.value.data ?? []) : [],
    },
    pipeline: {
      total: totalProjects.status === 'fulfilled' ? (totalProjects.value.count ?? 0) : 0,
      byStage,
      published: publishedProjects.status === 'fulfilled' ? (publishedProjects.value.count ?? 0) : 0,
    },
    content: {
      research: researchArchives.status === 'fulfilled' ? (researchArchives.value.count ?? 0) : 0,
      drafts: blogDrafts.status === 'fulfilled' ? (blogDrafts.value.count ?? 0) : 0,
      ideas: ideaArchives.status === 'fulfilled' ? (ideaArchives.value.count ?? 0) : 0,
    },
    system: {
      activeAI: activeAI.status === 'fulfilled' ? (activeAI.value.count ?? 0) : 0,
    },
    health: {
      api: apiHealth.status === 'fulfilled' ? (apiHealth.value as boolean) : false,
      supabase: totalUsers.status === 'fulfilled',
    },
  }
}

type RecentUser = { id: string; first_name: string | null; last_name: string | null; created_at: string }

function toActivityEntry(u: RecentUser): ActivityEntry {
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || `Usuário ${u.id.slice(-6)}`
  return {
    id: u.id,
    label: `${name} se cadastrou`,
    timestamp: u.created_at,
    iconBg: 'bg-emerald-100',
  }
}

function buildHealthAlerts(health: { api: boolean; supabase: boolean }): AlertEntry[] {
  const alerts: AlertEntry[] = []
  if (!health.api) alerts.push({ type: 'api_down', message: 'API (apps/api) não respondeu ao health check', severity: 'high' })
  if (!health.supabase) alerts.push({ type: 'db_down', message: 'Supabase queries falharam', severity: 'high' })
  return alerts
}

export default async function AdminDashboard() {
  const data = await fetchDashboardData()
  const stageEntries = Object.entries(data.pipeline.byStage)
  const alerts = buildHealthAlerts(data.health)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Visão geral do BrightTale</p>
        </div>
        <RefreshIndicator />
      </div>

      <AlertsPanel alerts={alerts} title="Saúde do sistema" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <KpiSection title="Crescimento" color="green">
          <KpiCard label="Usuários" value={data.users.total} icon={<User className="w-4 h-4" />} subText={`${data.users.week} esta semana`} />
          <KpiCard label="Novos hoje" value={data.users.today} icon={<UserPlus className="w-4 h-4" />} subText={`${data.users.week} nos últimos 7d`} />
        </KpiSection>

        <KpiSection title="Pipeline de Conteúdo" color="blue">
          <KpiCard label="Total Projetos" value={data.pipeline.total} icon={<Activity className="w-4 h-4" />} subText="no pipeline" />
          <KpiCard label="Publicados" value={data.pipeline.published} icon={<CheckCircle className="w-4 h-4" />} subText="winner=true" />
          {stageEntries.map(([stage, count]) => (
            <KpiCard key={stage} label={STAGE_LABELS[stage] ?? stage} value={count} />
          ))}
        </KpiSection>

        <KpiSection title="Conteúdo" color="purple">
          <KpiCard label="Research Archives" value={data.content.research} icon={<Search className="w-4 h-4" />} />
          <KpiCard label="Blog Drafts" value={data.content.drafts} icon={<FileEdit className="w-4 h-4" />} />
          <KpiCard label="Idea Archives" value={data.content.ideas} icon={<Lightbulb className="w-4 h-4" />} />
        </KpiSection>

        <KpiSection title="Sistema" color="amber">
          <KpiCard label="AI Providers ativos" value={data.system.activeAI} icon={<Cpu className="w-4 h-4" />} />
          <KpiCard
            label="Health"
            value={data.health.api && data.health.supabase ? 'OK' : 'WARN'}
            icon={<HeartPulse className="w-4 h-4" />}
            subText={data.health.api && data.health.supabase ? 'todos os serviços' : 'ver alertas acima'}
          />
        </KpiSection>
      </div>

      {data.users.recent.length > 0 && (
        <div className="rounded-xl p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Cadastros Recentes
            </h2>
            <a
              href={adminPath('/users')}
              className="text-xs text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
            >
              Ver todos →
            </a>
          </div>
          <ActivityFeed entries={data.users.recent.map(toActivityEntry)} />
        </div>
      )}
    </div>
  )
}
```

### Task 5.2: Typecheck + build + smoke Phase 5

**Files:** none

- [ ] **Step 1: Typecheck**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 2: Build**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/web
rm -rf .next
npm run build 2>&1 | tail -30
```
Expected: build succeeds.

- [ ] **Step 3: Smoke full 20 items**

Start `npm run dev:web`. Run all 20 items from spec §7 Level 2. Verify dashboard KPI numeric values match baseline screenshots; AlertsPanel + ActivityFeed + RefreshIndicator render.

### Task 5.3: Commit Phase 5

**Files:** none (git only)

- [ ] **Step 1: Commit**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add apps/web/src/app/zadmin/\(protected\)/page.tsx
git commit -m "refactor(web): dashboard uses AlertsPanel + ActivityFeed + RefreshIndicator

Replaces custom HealthDot, RecentUsers, and refresh pill with lib
primitives. fetchDashboardData and STAGE_LABELS unchanged.
Custom animate-fade-in-up-* usages removed (keyframes remain in
globals.css for users/page.tsx)."
```

---

## Phase 6 — Middleware consolidation

### Task 6.1: Verify Edge compat probe result

**Files:** none (decision gate)

- [ ] **Step 1: Recall Task 1.2 result**

Locate Phase 1 commit:
```bash
git log --grep="upgrade admin" --format="%H %s" | head -1
```
Then inspect its body:
```bash
git log -1 --format=%b $(git log --grep="upgrade admin" --format="%H" | head -1)
```
If the commit body shows "No Node-only requires", proceed to Task 6.2. If matches were found, **skip this phase** and jump to Phase 7 — open a follow-up issue to update spec R4.

### Task 6.2: Replace middleware createServerClient import

**Files:** Modify: `apps/web/src/middleware.ts:2` (import line) and related config block

- [ ] **Step 1: Edit middleware.ts**

In `apps/web/src/middleware.ts`, replace:

```typescript
import { createServerClient } from '@supabase/ssr';
```

With:

```typescript
import { createServerClient } from '@tn-figueiredo/auth-nextjs';
```

Then replace the `createServerClient(...)` call block (lines ~33-50) with:

```typescript
  const supabase = createServerClient({
    env: {
      apiBaseUrl: '',
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });
```

### Task 6.3: Build + smoke + commit or revert

**Files:** none unless reverting

- [ ] **Step 1: Build**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/web
rm -rf .next
npm run build 2>&1 | tail -30
```
Expected: build completes.

If build **fails** with Edge runtime error, revert:
```bash
git checkout -- apps/web/src/middleware.ts
```
Then skip commit below and update spec §8 R4 in a follow-up issue.

- [ ] **Step 2: Smoke**

Start `npm run dev:web`. Verify: `/admin` redirects to login when logged out; login works; protected routes gated.

- [ ] **Step 3: Commit (if build + smoke passed)**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add apps/web/src/middleware.ts
git commit -m "refactor(web): consolidate middleware on auth-nextjs createServerClient

Removes direct @supabase/ssr import. Edge probe from Phase 1 confirmed
no Node-only requires. Middleware behavior unchanged."
```

---

## Phase 7 — Final verification + PR

### Task 7.1: Full workspace checks

**Files:** none

- [ ] **Step 1: Full typecheck**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run typecheck
```
Expected: 0 errors across all workspaces.

- [ ] **Step 2: Full build**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run build --workspaces --if-present
```
Expected: all workspaces build.

- [ ] **Step 3: Full lint**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run lint
```
Expected: 0 errors.

- [ ] **Step 4: Full tests**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run test --workspaces --if-present
```
Expected: admin-actions 8/8 pass; other workspaces passWithNoTests or pre-existing green.

### Task 7.2: Capture post-upgrade screenshots [OPERATOR, ~20 min]

**Files:** Create: `docs/superpowers/specs/assets/admin-062-post/*.png` (7 files)

**⚠ Human-in-loop.** Cannot be automated — requires browser + admin credentials. Mirror of Task 0.3 setup.

- [ ] **Step 1: Start dev + capture same 7 screenshots as Task 0.3**

Start `npm run dev:web`. Capture the same 7 routes/modes as Task 0.3, saved under `docs/superpowers/specs/assets/admin-062-post/` with identical filenames.

- [ ] **Step 2: Commit screenshots**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add docs/superpowers/specs/assets/admin-062-post/
git commit -m "docs: admin screenshots after 0.6.2 upgrade"
```

### Task 7.3: Push + open PR

**Files:** none

- [ ] **Step 1: Push branch**

Run:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git push -u origin feat/admin-upgrade-062
```

- [ ] **Step 2: Open PR**

Run:
```bash
gh pr create --base staging --title "Upgrade @tn-figueiredo/admin 0.1.1 → 0.6.2 + auth-nextjs 2.0.0 → 2.2.0" --body "$(cat <<'EOF'
**Spec:** docs/superpowers/specs/2026-04-16-admin-062-upgrade-design.md
**Plan:** docs/superpowers/plans/2026-04-16-admin-062-upgrade.md

## Summary
- Upgrade to admin 0.6.2 + auth-nextjs 2.2.0
- Adopt createAdminLayout shell, AdminLogin flow (+ forgot/reset), topbar with branding + Sair
- Delete custom sidebar (−92 LOC); shrink theme-toggle, login, dashboard, middleware
- Add 8 unit tests for admin-actions wrappers (first tests in apps/web)
- Preserve BrightTale brand via Tailwind 4 @theme slate remap + AuthTheme CSS vars

## Visual diff
Before/after screenshots in `docs/superpowers/specs/assets/admin-062-{baseline,post}/`.

## Smoke checklist (20 items — spec §7)
All 20 items checked locally; summary:
- [x] Auth happy + error paths (13)
- [x] Access gating (1)
- [x] Shell + nav (3)
- [x] Dashboard (4)

## Accept as same
- BrightTale brand colors preserved
- KPI numeric values identical
- Auth gating behavior identical

## Accept as different
- New topbar with branding + Sair
- AlertsPanel replaces HealthDot
- ActivityFeed replaces RecentUsers
- Google OAuth button in login
- New /admin/forgot-password + /admin/reset-password pages

## Rollback
`git revert` merge commit within 30 min if /admin/* error rate > 10 req/min post-deploy.
EOF
)"
```

- [ ] **Step 3: Report PR URL to user**

---

## Troubleshooting

**Phase 3 Google OAuth returns `redirect_uri_mismatch`:**
- Verify callback URL in Google Cloud matches Supabase callback URL exactly (no trailing slash, correct domain)
- For Vercel PR previews, this will always fail (dynamic subdomains) — test on staging canonical URL only

**Phase 3 forgot-password email never arrives:**
- Check Supabase SMTP config (P5)
- Check Supabase Auth → Email Templates → Recovery is enabled
- Check spam folder

**Phase 4 shell renders with slate-gray instead of BrightTale dark:**
- `rm -rf apps/web/.next` and re-run `npm run dev:web` (Tailwind 4 @source cache)
- Verify Task 2.1 slate remap landed (grep for `--color-slate-900: #0A1017`)

**Phase 5 dashboard KPI numeric values differ from baseline:**
- `fetchDashboardData` is unchanged — numeric drift means Supabase data changed between baseline and now. Acceptable.

**Phase 6 build fails with Edge runtime error:**
- Skip Phase 6 commit, revert `git checkout -- apps/web/src/middleware.ts`
- Update spec §8 R4 mitigation from "Low" to "Confirmed; middleware stays on @supabase/ssr"

**8 unit tests fail after package install but before Task 3.2:**
- Expected (TDD). Fix by completing Task 3.2.

**Typecheck still shows errors after Task 4.5:**
- Phase 5 fixes dashboard errors. Proceed to Phase 5.
