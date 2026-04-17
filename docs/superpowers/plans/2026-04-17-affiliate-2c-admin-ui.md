# Phase 2C Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt `@tn-figueiredo/affiliate-admin@0.3.3` RSC package in `apps/web` to ship the operator-facing affiliate admin surface on top of the 16 HTTP routes already wired by Phase 2A. Deliver 6 RSC pages, 1 sidebar entry, 10 client-side action wrappers (+4 skipped stubs) feeding a 10-route BFF proxy layer that re-auths with Supabase and injects `X-Internal-Key` server-side before forwarding to `apps/api`.

**Architecture:** Two commits on `feat/affiliate-2a-foundation`. Commit A is additive (install + `transpilePackages` only — no visible UI). Commit B is atomic (pages + client-layout + actions + BFF proxy + sidebar + tests) because the sidebar link, pages, and actions must land together to keep typecheck green and avoid a broken nav. RSC read path uses a server-only `adminFetch()` helper; browser write path uses BFF routes under `/api/zadmin/affiliate/*` that proxy to apps/api.

**Tech Stack:** Next.js 16 (App Router, RSC + Turbopack), React 19, TypeScript 5.6 strict, Vitest 4, `@tn-figueiredo/affiliate-admin@0.3.3` (pinned `--save-exact`), `@tn-figueiredo/affiliate@0.4.0` (transitive, already installed in apps/api at same version), `@supabase/ssr` for session auth in BFF routes.

**Spec:** `docs/superpowers/specs/2026-04-17-affiliate-2c-admin-ui-design.md`

---

## File Structure

| Path | Disposition | Responsibility |
|---|---|---|
| `apps/web/package.json` | **modify** (Commit A) | Add `@tn-figueiredo/affiliate-admin: "0.3.3"` dependency, pinned exactly |
| `apps/web/next.config.ts` | **modify** (Commit A) | Add `@tn-figueiredo/affiliate-admin` to `transpilePackages` array |
| `apps/web/src/lib/admin-layout-config.tsx` | **modify** (Commit B) | +1 sidebar item `{ label: 'Afiliados', path: adminPath('/affiliates'), icon: 'Users2' }` |
| `apps/web/src/lib/admin/affiliate-queries.ts` | **new** (Commit B) | Server-only fetch helpers — `adminFetch`, `fetchAffiliates`, `fetchAffiliateDetail`, `fetchPayouts`, `fetchFraud`, `fetchContent`; local `AffiliateListData` / `AffiliateDetailPageData` wrappers |
| `apps/web/src/app/zadmin/(protected)/affiliates/layout.tsx` | **new** (Commit B) | RSC; wraps children in `<AffiliateAdminClientLayout>` |
| `apps/web/src/app/zadmin/(protected)/affiliates/client-layout.tsx` | **new** (Commit B) | `'use client'`; `<AffiliateAdminProvider>` with config + actions |
| `apps/web/src/app/zadmin/(protected)/affiliates/page.tsx` | **new** (Commit B) | List page — `AffiliateListServer` |
| `apps/web/src/app/zadmin/(protected)/affiliates/[id]/page.tsx` | **new** (Commit B) | Detail page — `AffiliateDetailServer` |
| `apps/web/src/app/zadmin/(protected)/affiliates/payouts/page.tsx` | **new** (Commit B) | Payouts page — `AffiliatePayoutsServer` |
| `apps/web/src/app/zadmin/(protected)/affiliates/fraud/page.tsx` | **new** (Commit B) | Fraud + risk page — `AffiliateFraudServer` |
| `apps/web/src/app/zadmin/(protected)/affiliates/content/page.tsx` | **new** (Commit B) | Content moderation page — `AffiliateContentServer` |
| `apps/web/src/app/zadmin/(protected)/affiliates/actions/affiliates.ts` | **new** (Commit B) | 5 client actions: `approve`, `pause`, `proposeChange`, `cancelProposal`, `renewContract` |
| `apps/web/src/app/zadmin/(protected)/affiliates/actions/payouts.ts` | **new** (Commit B) | 3 client actions: `approvePayout`, `rejectPayout`, `completePayout` |
| `apps/web/src/app/zadmin/(protected)/affiliates/actions/content.ts` | **new** (Commit B) | 1 client action: `reviewContent` |
| `apps/web/src/app/zadmin/(protected)/affiliates/actions/fraud.ts` | **new** (Commit B) | 1 client action: `resolveFlag` |
| `apps/web/src/app/zadmin/(protected)/affiliates/actions/skipped-2f.ts` | **new** (Commit B) | 4 throwing stubs: `revalidateTaxId`, `addSocialLink`, `deleteSocialLink`, `verifySocialLinks` |
| `apps/web/src/app/zadmin/(protected)/affiliates/actions/index.ts` | **new** (Commit B) | Re-export as `actions satisfies AffiliateAdminActions` |
| `apps/web/src/app/zadmin/(protected)/affiliates/TODO-2F.md` | **new** (Commit B) | Skipped-action rationale + link to 2A spec §11.2C |
| `apps/web/src/app/api/zadmin/affiliate/_shared/proxy.ts` | **new** (Commit B) | `proxyToApi(req, apiPath, method)` — session + admin gate + header injection |
| `apps/web/src/app/api/zadmin/affiliate/[id]/approve/route.ts` | **new** (Commit B) | BFF route — POST → `/admin/affiliate/:id/approve` |
| `apps/web/src/app/api/zadmin/affiliate/[id]/pause/route.ts` | **new** (Commit B) | BFF route — POST → `/admin/affiliate/:id/pause` |
| `apps/web/src/app/api/zadmin/affiliate/[id]/renew/route.ts` | **new** (Commit B) | BFF route — POST → `/admin/affiliate/:id/renew` |
| `apps/web/src/app/api/zadmin/affiliate/[id]/propose-change/route.ts` | **new** (Commit B) | BFF route — POST → `/admin/affiliate/:id/propose-change` |
| `apps/web/src/app/api/zadmin/affiliate/[id]/cancel-proposal/route.ts` | **new** (Commit B) | BFF route — POST → `/admin/affiliate/:id/cancel-proposal` |
| `apps/web/src/app/api/zadmin/affiliate/[id]/payouts/[payoutId]/approve/route.ts` | **new** (Commit B) | BFF route — POST → `/admin/affiliate/:id/payouts/:pid/approve` |
| `apps/web/src/app/api/zadmin/affiliate/[id]/payouts/[payoutId]/reject/route.ts` | **new** (Commit B) | BFF route — POST → `/admin/affiliate/:id/payouts/:pid/reject` |
| `apps/web/src/app/api/zadmin/affiliate/[id]/payouts/[payoutId]/complete/route.ts` | **new** (Commit B) | BFF route — POST → `/admin/affiliate/:id/payouts/:pid/complete` |
| `apps/web/src/app/api/zadmin/affiliate/content-submissions/[submissionId]/review/route.ts` | **new** (Commit B) | BFF route — PUT → `/admin/affiliate/content-submissions/:sid/review` |
| `apps/web/src/app/api/zadmin/affiliate/fraud-flags/[flagId]/resolve/route.ts` | **new** (Commit B) | BFF route — POST → `/admin/affiliate/fraud-flags/:fid/resolve` |
| `apps/web/src/__tests__/app/zadmin/affiliates/actions-affiliates.test.ts` | **new** (Commit B) | 5 unit tests for the 5 affiliate actions |
| `apps/web/src/__tests__/app/zadmin/affiliates/actions-payouts.test.ts` | **new** (Commit B) | 3 unit tests for the 3 payout actions |
| `apps/web/src/__tests__/app/zadmin/affiliates/actions-content-fraud.test.ts` | **new** (Commit B) | 2 unit tests for `reviewContent` + `resolveFlag` |
| `apps/web/src/__tests__/app/zadmin/affiliates/skipped-2f.test.ts` | **new** (Commit B) | 4 unit tests — each skipped stub throws the TODO-2F marker |
| `apps/web/src/__tests__/app/zadmin/affiliates/proxy.test.ts` | **new** (Commit B) | 3 unit tests for `proxyToApi` (happy path, 401 no-session, 403 non-admin) |
| `apps/web/vitest.config.ts` | **new** (Commit B) | Vitest config if not already present — mirrors apps/api alias pattern |
| `apps/web/.env.local.example` | **modify** (Commit B) | Comment block clarifying `API_URL` + `INTERNAL_API_KEY` are required for admin affiliate pages |
| `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md` | **modify** (Commit B) | Add errata note at §11.2C pointing to 2C spec |

---

# Phase A — Commit A: Install + transpile (additive, invisible)

Commit A installs the dependency and adjusts the build config. No UI changes are visible — the sidebar is untouched, no pages exist yet. Build stays green; no broken nav link.

## Task 1: Install `@tn-figueiredo/affiliate-admin@0.3.3`

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install the package, pinned exactly**

Run from repo root:

```bash
npm install @tn-figueiredo/affiliate-admin@0.3.3 --save-exact --workspace @brighttale/web
```

Expected: `apps/web/package.json` gains exactly one new line under `"dependencies"`:

```json
"@tn-figueiredo/affiliate-admin": "0.3.3"
```

No caret, no tilde. `package-lock.json` updated. No other dependency versions should change.

- [ ] **Step 2: Verify single `@tn-figueiredo/affiliate` version in the monorepo**

Run from repo root:

```bash
npm ls @tn-figueiredo/affiliate
```

Expected: every resolution points to `@tn-figueiredo/affiliate@0.4.0`. If npm shows a second version (e.g., a `0.3.x` nested under `affiliate-admin`), stop — this indicates a transitive pin mismatch and must be reconciled before continuing (adjust `apps/api` pin or open an upstream issue).

- [ ] **Step 3: Verify package resolves via import**

Run from repo root:

```bash
node -e "console.log(Object.keys(require('@tn-figueiredo/affiliate-admin')))" --input-type=commonjs
```

Expected output (order may vary): `AffiliateAdminProvider`, `useAffiliateAdmin`, `AffiliateAdminErrorFallback`. If this fails with `MODULE_NOT_FOUND`, re-run Step 1.

## Task 2: Add package to `transpilePackages`

**Files:**
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Update `transpilePackages`**

Edit `apps/web/next.config.ts`. Replace the `transpilePackages` line. Before:

```ts
transpilePackages: ['@tn-figueiredo/admin', '@brighttale/shared'],
```

After:

```ts
transpilePackages: ['@tn-figueiredo/admin', '@tn-figueiredo/affiliate-admin', '@brighttale/shared'],
```

Rationale: the package ships RSC `/server` entrypoint as ESM + CJS duals. Turbopack's RSC compiler needs transpile-through-workspace to resolve the subpath cleanly. Matches the pattern already proven for `@tn-figueiredo/admin` in Phase 1.

- [ ] **Step 2: Typecheck + build apps/web**

Run from repo root:

```bash
npm run typecheck -w @brighttale/web
npm run build -w @brighttale/web
```

Expected: both green. Zero TS errors. Turbopack build completes without "cannot resolve module" warnings for the new package.

## Task 3: Commit A verification + commit

- [ ] **Step 1: Full verification sweep**

Run from repo root:

```bash
npm run typecheck
npm run lint
```

Expected: all 4 workspaces green on both.

- [ ] **Step 2: Review staged diff**

Run from repo root:

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale && git status && git diff --stat
```

Expected files modified: `apps/web/package.json`, `apps/web/next.config.ts`, `package-lock.json`. No other files touched.

- [ ] **Step 3: Commit**

Run from repo root:

```bash
git add apps/web/package.json apps/web/next.config.ts package-lock.json
git commit -m "$(cat <<'EOF'
feat(web): install @tn-figueiredo/affiliate-admin@0.3.3 (Phase 2C — Commit A)

Add the RSC admin package to apps/web, pinned exactly (no caret/tilde).
Register it with Next.js transpilePackages alongside @tn-figueiredo/admin
so Turbopack can resolve the /server RSC subpath.

This commit is purely additive: no pages, no sidebar entry, no actions
yet. Sidebar + pages + BFF proxy layer land atomically in Commit B.

Verified: npm ls @tn-figueiredo/affiliate shows a single 0.4.0 resolution
for apps/api and apps/web. Typecheck + build green.

Spec: docs/superpowers/specs/2026-04-17-affiliate-2c-admin-ui-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify commit landed**

Run: `git log -1 --stat`

Expected: one commit with 3 files changed. No tests yet; that is intentional for additive infra.

---

# Phase B — Commit B: Pages + actions + BFF + sidebar + tests (atomic)

All of Phase B lands in ONE commit. Intermediate states would leave typecheck red (sidebar item points to a nonexistent route, or actions reference BFF routes that don't exist). Follow TDD order: each action test written before the action; proxy test before the proxy.

## Task 4: Server-only data-fetch helper (`affiliate-queries.ts`)

**Files:**
- Create: `apps/web/src/lib/admin/affiliate-queries.ts`

- [ ] **Step 1: Create the helper**

Create `apps/web/src/lib/admin/affiliate-queries.ts`:

```ts
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { AffiliateAdminSummary, AffiliateAdminDetail } from '@tn-figueiredo/affiliate';

// Note: AffiliateListData / AffiliateDetailPageData are NOT re-exported from
// the admin package's /server entrypoint (verified via tarball d.ts). We
// reconstruct the shapes locally — structural typing accepts any matching
// shape passed to AffiliateListServer / AffiliateDetailServer.
export interface AffiliateListData {
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

export interface AffiliateDetailPageData extends AffiliateAdminDetail {
  pixMismatch?: boolean;
  riskScore?: unknown | null;
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
  const body = (await res.json()) as {
    data: T | null;
    error: { code: string; message: string } | null;
  };
  if (!res.ok || body.error) {
    throw new Error(
      `[affiliate-admin] ${body.error?.code ?? res.status}: ${body.error?.message ?? res.statusText}`,
    );
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
  if (!Array.isArray(data.items) || typeof data.total !== 'number') {
    throw new Error('[affiliate-admin] malformed list response');
  }
  return data;
}

export async function fetchAffiliateDetail(id: string) {
  return adminFetch<AffiliateDetailPageData>(`/admin/affiliate/${encodeURIComponent(id)}`);
}

export async function fetchPayouts() {
  return adminFetch<{ items: unknown[]; total: number }>(`/admin/affiliate/payouts`);
}

export async function fetchFraud() {
  const [flags, risk] = await Promise.all([
    adminFetch<{ items: unknown[] }>(`/admin/affiliate/fraud-flags`),
    adminFetch<{ items: unknown[] }>(`/admin/affiliate/risk-scores`),
  ]);
  return { flags: flags.items, risk: risk.items };
}

export async function fetchContent() {
  return adminFetch<{ items: unknown[]; total: number }>(`/admin/affiliate/content-submissions`);
}
```

- [ ] **Step 2: Typecheck**

Run from repo root: `npm run typecheck -w @brighttale/web`

Expected: green. If it fails with "Cannot find module '@tn-figueiredo/affiliate'", check the transitive install from Task 1.

## Task 5: Vitest config for apps/web (if absent)

**Files:**
- Create or verify: `apps/web/vitest.config.ts`

- [ ] **Step 1: Check if config exists**

Run from repo root:

```bash
test -f apps/web/vitest.config.ts && echo "exists" || echo "missing"
```

If `exists`, skip to Task 6. If `missing`, proceed to Step 2.

- [ ] **Step 2: Create vitest.config.ts**

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@brighttale/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.ts'],
    exclude: ['**/node_modules/**', 'src/app/**'],
    pool: 'forks',
  },
});
```

- [ ] **Step 3: Verify test runner works**

Run from `apps/web/`: `npm test`

Expected: "no test files found" (exits 0 because `--passWithNoTests` is in the script) OR existing tests pass.

## Task 6: BFF proxy helper (TDD)

**Files:**
- Create: `apps/web/src/__tests__/app/zadmin/affiliates/proxy.test.ts`
- Create: `apps/web/src/app/api/zadmin/affiliate/_shared/proxy.ts`

- [ ] **Step 1: Write failing proxy test**

Create `apps/web/src/__tests__/app/zadmin/affiliates/proxy.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/lib/admin-check', () => ({
  isAdminUser: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';
import { proxyToApi } from '@/app/api/zadmin/affiliate/_shared/proxy';

function makeReq(body?: unknown): NextRequest {
  return new NextRequest('http://localhost:3002/api/zadmin/affiliate/abc/approve', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('proxyToApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_URL = 'http://api.test';
    process.env.INTERNAL_API_KEY = 'secret';
  });

  it('happy path: forwards body + secret + user id, returns apps/api status+body', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    } as never);
    vi.mocked(isAdminUser).mockResolvedValue(true);
    const upstream = { data: { ok: true }, error: null };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(upstream), { status: 200 }),
    );

    const res = await proxyToApi(makeReq({ tier: 'nano' }), '/admin/affiliate/abc/approve', 'POST');

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload).toEqual(upstream);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://api.test/admin/affiliate/abc/approve',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Internal-Key': 'secret',
          'x-user-id': 'u1',
          'Content-Type': 'application/json',
        }),
      }),
    );
    fetchSpy.mockRestore();
  });

  it('401 when no session', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as never);
    const res = await proxyToApi(makeReq({}), '/admin/affiliate/abc/approve', 'POST');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('403 when non-admin', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    } as never);
    vi.mocked(isAdminUser).mockResolvedValue(false);
    const res = await proxyToApi(makeReq({}), '/admin/affiliate/abc/approve', 'POST');
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/web/`: `npx vitest run src/__tests__/app/zadmin/affiliates/proxy.test.ts`

Expected: FAIL with "Cannot find module '@/app/api/zadmin/affiliate/_shared/proxy'".

- [ ] **Step 3: Write implementation**

Create `apps/web/src/app/api/zadmin/affiliate/_shared/proxy.ts`:

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
  apiPath: string,
  method: 'POST' | 'PUT' | 'GET' | 'DELETE' = 'POST',
): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
  if (!(await isAdminUser(supabase, user.id))) {
    return jsonError('Forbidden', 'FORBIDDEN', 403);
  }

  const bodyText = method === 'GET' || method === 'DELETE' ? undefined : await req.text();

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

  const upstreamBody = await res.text();
  return new NextResponse(upstreamBody, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `apps/web/`: `npx vitest run src/__tests__/app/zadmin/affiliates/proxy.test.ts`

Expected: 3 tests pass.

## Task 7: Client actions — affiliates (TDD)

**Files:**
- Create: `apps/web/src/__tests__/app/zadmin/affiliates/actions-affiliates.test.ts`
- Create: `apps/web/src/app/zadmin/(protected)/affiliates/actions/affiliates.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/__tests__/app/zadmin/affiliates/actions-affiliates.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('NEXT_PUBLIC_ADMIN_SLUG', 'admin');

import {
  approve, pause, proposeChange, cancelProposal, renewContract,
} from '@/app/zadmin/(protected)/affiliates/actions/affiliates';

describe('affiliate actions', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true }, error: null }), { status: 200 }),
    );
  });

  it('approve → POST /api/admin/affiliate/:id/approve with body', async () => {
    await approve('aff-1', { tier: 'nano', commissionRate: 0.15 } as never);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/admin/affiliate/aff-1/approve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ tier: 'nano', commissionRate: 0.15 }),
      }),
    );
  });

  it('pause → POST with no body', async () => {
    await pause('aff-2');
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe('/api/admin/affiliate/aff-2/pause');
    expect((call[1] as RequestInit).body).toBeUndefined();
  });

  it('proposeChange → POST /:id/propose-change', async () => {
    await proposeChange('aff-3', { newTier: 'micro', newRate: 0.2 } as never);
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/admin/affiliate/aff-3/propose-change');
  });

  it('cancelProposal → POST /:id/cancel-proposal', async () => {
    await cancelProposal('aff-4');
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/admin/affiliate/aff-4/cancel-proposal');
  });

  it('renewContract → POST /:id/renew', async () => {
    await renewContract('aff-5');
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/admin/affiliate/aff-5/renew');
  });

  it('throws with parsed envelope on 4xx', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ data: null, error: { code: 'INVALID_STATE', message: 'already paused' } }),
        { status: 409 },
      ),
    );
    await expect(pause('aff-6')).rejects.toThrow(/INVALID_STATE.*already paused/);
  });

  it('encodes id in URL (prevents path traversal)', async () => {
    await approve('a/b', {} as never);
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/admin/affiliate/a%2Fb/approve');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/web/`: `npx vitest run src/__tests__/app/zadmin/affiliates/actions-affiliates.test.ts`

Expected: FAIL with "Cannot find module ...actions/affiliates".

- [ ] **Step 3: Write implementation**

Create `apps/web/src/app/zadmin/(protected)/affiliates/actions/affiliates.ts`:

```ts
'use client';
import { adminApi } from '@/lib/admin-path';
import type {
  ApproveAffiliateInput,
  ProposeContractChangeInput,
} from '@tn-figueiredo/affiliate';

async function send(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
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

export async function approve(id: string, input: ApproveAffiliateInput): Promise<void> {
  return send('POST', adminApi(`/affiliate/${encodeURIComponent(id)}/approve`), input);
}
export async function pause(id: string): Promise<void> {
  return send('POST', adminApi(`/affiliate/${encodeURIComponent(id)}/pause`));
}
export async function proposeChange(id: string, input: ProposeContractChangeInput): Promise<void> {
  return send('POST', adminApi(`/affiliate/${encodeURIComponent(id)}/propose-change`), input);
}
export async function cancelProposal(id: string): Promise<void> {
  return send('POST', adminApi(`/affiliate/${encodeURIComponent(id)}/cancel-proposal`));
}
export async function renewContract(id: string): Promise<void> {
  return send('POST', adminApi(`/affiliate/${encodeURIComponent(id)}/renew`));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `apps/web/`: `npx vitest run src/__tests__/app/zadmin/affiliates/actions-affiliates.test.ts`

Expected: 7 tests pass (5 happy paths + error envelope + URL encoding).

## Task 8: Client actions — payouts (TDD)

**Files:**
- Create: `apps/web/src/__tests__/app/zadmin/affiliates/actions-payouts.test.ts`
- Create: `apps/web/src/app/zadmin/(protected)/affiliates/actions/payouts.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/__tests__/app/zadmin/affiliates/actions-payouts.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('NEXT_PUBLIC_ADMIN_SLUG', 'admin');

import {
  approvePayout, rejectPayout, completePayout,
} from '@/app/zadmin/(protected)/affiliates/actions/payouts';

describe('payout actions', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true }, error: null }), { status: 200 }),
    );
  });

  it('approvePayout → POST /:aid/payouts/:pid/approve', async () => {
    await approvePayout('aff-1', 'pay-1');
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/admin/affiliate/aff-1/payouts/pay-1/approve');
  });

  it('rejectPayout → POST with notes body', async () => {
    await rejectPayout('aff-2', 'pay-2', 'bad data');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/admin/affiliate/aff-2/payouts/pay-2/reject');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ notes: 'bad data' });
  });

  it('completePayout → POST /:aid/payouts/:pid/complete', async () => {
    await completePayout('aff-3', 'pay-3');
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/admin/affiliate/aff-3/payouts/pay-3/complete');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/web/`: `npx vitest run src/__tests__/app/zadmin/affiliates/actions-payouts.test.ts`

Expected: FAIL module not found.

- [ ] **Step 3: Write implementation**

Create `apps/web/src/app/zadmin/(protected)/affiliates/actions/payouts.ts`:

```ts
'use client';
import { adminApi } from '@/lib/admin-path';

async function send(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
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

export async function approvePayout(affiliateId: string, payoutId: string): Promise<void> {
  return send('POST', adminApi(
    `/affiliate/${encodeURIComponent(affiliateId)}/payouts/${encodeURIComponent(payoutId)}/approve`,
  ));
}
export async function rejectPayout(
  affiliateId: string,
  payoutId: string,
  notes: string,
): Promise<void> {
  return send('POST', adminApi(
    `/affiliate/${encodeURIComponent(affiliateId)}/payouts/${encodeURIComponent(payoutId)}/reject`,
  ), { notes });
}
export async function completePayout(affiliateId: string, payoutId: string): Promise<void> {
  return send('POST', adminApi(
    `/affiliate/${encodeURIComponent(affiliateId)}/payouts/${encodeURIComponent(payoutId)}/complete`,
  ));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `apps/web/`: `npx vitest run src/__tests__/app/zadmin/affiliates/actions-payouts.test.ts`

Expected: 3 tests pass.

## Task 9: Client actions — content + fraud (TDD)

**Files:**
- Create: `apps/web/src/__tests__/app/zadmin/affiliates/actions-content-fraud.test.ts`
- Create: `apps/web/src/app/zadmin/(protected)/affiliates/actions/content.ts`
- Create: `apps/web/src/app/zadmin/(protected)/affiliates/actions/fraud.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/__tests__/app/zadmin/affiliates/actions-content-fraud.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('NEXT_PUBLIC_ADMIN_SLUG', 'admin');

import { reviewContent } from '@/app/zadmin/(protected)/affiliates/actions/content';
import { resolveFlag } from '@/app/zadmin/(protected)/affiliates/actions/fraud';

describe('content + fraud actions', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true }, error: null }), { status: 200 }),
    );
  });

  it('reviewContent → PUT /content-submissions/:sid/review with {status, notes}', async () => {
    await reviewContent('sub-1', 'approved', 'looks good');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/admin/affiliate/content-submissions/sub-1/review');
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      status: 'approved',
      notes: 'looks good',
    });
  });

  it('resolveFlag → POST /fraud-flags/:fid/resolve with 4 fields', async () => {
    await resolveFlag('flag-1', 'false_positive', 'manual review', true);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/admin/affiliate/fraud-flags/flag-1/resolve');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      status: 'false_positive',
      notes: 'manual review',
      pauseAffiliate: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/web/`: `npx vitest run src/__tests__/app/zadmin/affiliates/actions-content-fraud.test.ts`

Expected: FAIL both modules missing.

- [ ] **Step 3: Write implementations**

Create `apps/web/src/app/zadmin/(protected)/affiliates/actions/content.ts`:

```ts
'use client';
import { adminApi } from '@/lib/admin-path';

async function send(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
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

export async function reviewContent(
  submissionId: string,
  status: 'approved' | 'rejected',
  notes?: string,
): Promise<void> {
  return send(
    'PUT',
    adminApi(`/affiliate/content-submissions/${encodeURIComponent(submissionId)}/review`),
    { status, notes },
  );
}
```

Create `apps/web/src/app/zadmin/(protected)/affiliates/actions/fraud.ts`:

```ts
'use client';
import { adminApi } from '@/lib/admin-path';
import type { FraudFlagStatus } from '@tn-figueiredo/affiliate-admin';

async function send(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
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

export async function resolveFlag(
  flagId: string,
  status: FraudFlagStatus,
  notes?: string,
  pauseAffiliate?: boolean,
): Promise<void> {
  return send('POST', adminApi(`/affiliate/fraud-flags/${encodeURIComponent(flagId)}/resolve`), {
    status,
    notes,
    pauseAffiliate,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `apps/web/`: `npx vitest run src/__tests__/app/zadmin/affiliates/actions-content-fraud.test.ts`

Expected: 2 tests pass.

## Task 10: Skipped-2F stubs (TDD)

**Files:**
- Create: `apps/web/src/__tests__/app/zadmin/affiliates/skipped-2f.test.ts`
- Create: `apps/web/src/app/zadmin/(protected)/affiliates/actions/skipped-2f.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/__tests__/app/zadmin/affiliates/skipped-2f.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  revalidateTaxId, addSocialLink, deleteSocialLink, verifySocialLinks,
} from '@/app/zadmin/(protected)/affiliates/actions/skipped-2f';

const MARKER = /not wired in 2C — tracked as TODO-2F/;

describe('skipped-2f stubs', () => {
  it('revalidateTaxId throws with TODO-2F marker', async () => {
    await expect(revalidateTaxId('aff-1')).rejects.toThrow(MARKER);
  });
  it('addSocialLink throws with TODO-2F marker', async () => {
    await expect(addSocialLink('aff-1', 'youtube', 'https://y.com/a')).rejects.toThrow(MARKER);
  });
  it('deleteSocialLink throws with TODO-2F marker', async () => {
    await expect(deleteSocialLink('aff-1', 'youtube')).rejects.toThrow(MARKER);
  });
  it('verifySocialLinks throws with TODO-2F marker', async () => {
    await expect(verifySocialLinks('aff-1')).rejects.toThrow(MARKER);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/web/`: `npx vitest run src/__tests__/app/zadmin/affiliates/skipped-2f.test.ts`

Expected: FAIL module not found.

- [ ] **Step 3: Write implementation**

Create `apps/web/src/app/zadmin/(protected)/affiliates/actions/skipped-2f.ts`:

```ts
'use client';

function skipped(name: string): never {
  throw new Error(`[affiliate-admin] ${name} not wired in 2C — tracked as TODO-2F`);
}

export async function revalidateTaxId(_affiliateId: string): Promise<void> {
  skipped('revalidateTaxId');
}
export async function addSocialLink(
  _affiliateId: string,
  _platform: string,
  _url: string,
): Promise<void> {
  skipped('addSocialLink');
}
export async function deleteSocialLink(
  _affiliateId: string,
  _platform: string,
): Promise<void> {
  skipped('deleteSocialLink');
}
export async function verifySocialLinks(_affiliateId: string): Promise<void> {
  skipped('verifySocialLinks');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `apps/web/`: `npx vitest run src/__tests__/app/zadmin/affiliates/skipped-2f.test.ts`

Expected: 4 tests pass.

## Task 11: Actions index — `satisfies AffiliateAdminActions`

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/affiliates/actions/index.ts`

- [ ] **Step 1: Create aggregator**

Create `apps/web/src/app/zadmin/(protected)/affiliates/actions/index.ts`:

```ts
'use client';
import type { AffiliateAdminActions } from '@tn-figueiredo/affiliate-admin';
import {
  approve, pause, proposeChange, cancelProposal, renewContract,
} from './affiliates';
import {
  approvePayout, rejectPayout, completePayout,
} from './payouts';
import { reviewContent } from './content';
import { resolveFlag } from './fraud';
import {
  revalidateTaxId, addSocialLink, deleteSocialLink, verifySocialLinks,
} from './skipped-2f';

export const actions = {
  approve,
  pause,
  proposeChange,
  cancelProposal,
  renewContract,
  approvePayout,
  rejectPayout,
  completePayout,
  reviewContent,
  resolveFlag,
  revalidateTaxId,
  addSocialLink,
  deleteSocialLink,
  verifySocialLinks,
} satisfies AffiliateAdminActions;
```

- [ ] **Step 2: Typecheck**

Run from repo root: `npm run typecheck -w @brighttale/web`

Expected: green. The `satisfies` clause is a structural check — if any method signature drifts from `AffiliateAdminActions`, tsc fails loudly here (R14 mitigation).

## Task 12: Client layout with `AffiliateAdminProvider`

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/affiliates/client-layout.tsx`

- [ ] **Step 1: Create client layout**

Create `apps/web/src/app/zadmin/(protected)/affiliates/client-layout.tsx`:

```tsx
'use client';
import { AffiliateAdminProvider } from '@tn-figueiredo/affiliate-admin';
import type { AffiliateAdminConfig } from '@tn-figueiredo/affiliate-admin';
import { adminPath } from '@/lib/admin-path';
import { actions } from './actions';

const config: AffiliateAdminConfig = {
  basePath: adminPath('/affiliates'),
  locale: 'pt-BR',
  currency: 'BRL',
};

export default function AffiliateAdminClientLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <AffiliateAdminProvider config={config} actions={actions}>
      {children}
    </AffiliateAdminProvider>
  );
}
```

- [ ] **Step 2: Typecheck**

Run from repo root: `npm run typecheck -w @brighttale/web`

Expected: green. If the `AffiliateAdminConfig` type requires more fields than `basePath`/`locale`/`currency`, add them with `undefined` per spec §4 edge cases 2–5 (all optional in the package's typings).

## Task 13: RSC layout

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/affiliates/layout.tsx`

- [ ] **Step 1: Create layout**

Create `apps/web/src/app/zadmin/(protected)/affiliates/layout.tsx`:

```tsx
import AffiliateAdminClientLayout from './client-layout';

export default function AffiliatesLayout({ children }: { children: React.ReactNode }) {
  return <AffiliateAdminClientLayout>{children}</AffiliateAdminClientLayout>;
}
```

- [ ] **Step 2: Typecheck**

Run from repo root: `npm run typecheck -w @brighttale/web`

Expected: green.

## Task 14: List page (`affiliates/page.tsx`)

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/affiliates/page.tsx`

- [ ] **Step 1: Create the list page**

Create `apps/web/src/app/zadmin/(protected)/affiliates/page.tsx`:

```tsx
import { AffiliateListServer } from '@tn-figueiredo/affiliate-admin/server';
import { adminPath } from '@/lib/admin-path';
import { fetchAffiliates } from '@/lib/admin/affiliate-queries';

export const dynamic = 'force-dynamic';

function flatten(sp: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') out[k] = v;
    else if (Array.isArray(v) && v.length > 0) out[k] = v[0];
  }
  return out;
}

export default async function AffiliatesListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const flat = flatten(sp);
  const data = await fetchAffiliates(flat);
  return (
    <AffiliateListServer
      data={data}
      config={{
        basePath: adminPath('/affiliates'),
        locale: 'pt-BR',
        currency: 'BRL',
      }}
      searchParams={{ tab: flat.tab, type: flat.type }}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run from repo root: `npm run typecheck -w @brighttale/web`

Expected: green.

## Task 15: Detail page (`affiliates/[id]/page.tsx`)

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/affiliates/[id]/page.tsx`

- [ ] **Step 1: Create the detail page**

Create `apps/web/src/app/zadmin/(protected)/affiliates/[id]/page.tsx`:

```tsx
import { AffiliateDetailServer } from '@tn-figueiredo/affiliate-admin/server';
import { adminPath } from '@/lib/admin-path';
import { fetchAffiliateDetail } from '@/lib/admin/affiliate-queries';

export const dynamic = 'force-dynamic';

export default async function AffiliateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchAffiliateDetail(id);
  return (
    <AffiliateDetailServer
      data={data}
      config={{
        basePath: adminPath('/affiliates'),
        locale: 'pt-BR',
        currency: 'BRL',
      }}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run from repo root: `npm run typecheck -w @brighttale/web`

Expected: green.

## Task 16: Payouts page

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/affiliates/payouts/page.tsx`

- [ ] **Step 1: Create the payouts page**

Create `apps/web/src/app/zadmin/(protected)/affiliates/payouts/page.tsx`:

```tsx
import { AffiliatePayoutsServer } from '@tn-figueiredo/affiliate-admin/server';
import { adminPath } from '@/lib/admin-path';
import { fetchPayouts } from '@/lib/admin/affiliate-queries';

export const dynamic = 'force-dynamic';

export default async function PayoutsPage() {
  const data = await fetchPayouts();
  return (
    <AffiliatePayoutsServer
      data={data}
      config={{
        basePath: adminPath('/affiliates'),
        locale: 'pt-BR',
        currency: 'BRL',
      }}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run from repo root: `npm run typecheck -w @brighttale/web`

Expected: green.

## Task 17: Fraud page

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/affiliates/fraud/page.tsx`

- [ ] **Step 1: Create the fraud page**

Create `apps/web/src/app/zadmin/(protected)/affiliates/fraud/page.tsx`:

```tsx
import { AffiliateFraudServer } from '@tn-figueiredo/affiliate-admin/server';
import { adminPath } from '@/lib/admin-path';
import { fetchFraud } from '@/lib/admin/affiliate-queries';

export const dynamic = 'force-dynamic';

export default async function FraudPage() {
  const { flags, risk } = await fetchFraud();
  return (
    <AffiliateFraudServer
      flags={flags}
      riskScores={risk}
      config={{
        basePath: adminPath('/affiliates'),
        locale: 'pt-BR',
        currency: 'BRL',
      }}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run from repo root: `npm run typecheck -w @brighttale/web`

Expected: green. If the `AffiliateFraudServer` prop names differ from `flags`/`riskScores`, adjust to match the package's `.d.ts`.

## Task 18: Content page

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/affiliates/content/page.tsx`

- [ ] **Step 1: Create the content page**

Create `apps/web/src/app/zadmin/(protected)/affiliates/content/page.tsx`:

```tsx
import { AffiliateContentServer } from '@tn-figueiredo/affiliate-admin/server';
import { adminPath } from '@/lib/admin-path';
import { fetchContent } from '@/lib/admin/affiliate-queries';

export const dynamic = 'force-dynamic';

export default async function ContentPage() {
  const data = await fetchContent();
  return (
    <AffiliateContentServer
      data={data}
      config={{
        basePath: adminPath('/affiliates'),
        locale: 'pt-BR',
        currency: 'BRL',
      }}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run from repo root: `npm run typecheck -w @brighttale/web`

Expected: green.

## Task 19: BFF proxy routes — 10 files

**Files:** 10 new route.ts files under `apps/web/src/app/api/zadmin/affiliate/`

- [ ] **Step 1: Create `[id]/approve/route.ts`**

Create `apps/web/src/app/api/zadmin/affiliate/[id]/approve/route.ts`:

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

- [ ] **Step 2: Create `[id]/pause/route.ts`**

Create `apps/web/src/app/api/zadmin/affiliate/[id]/pause/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { proxyToApi } from '../../_shared/proxy';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToApi(req, `/admin/affiliate/${encodeURIComponent(id)}/pause`, 'POST');
}
```

- [ ] **Step 3: Create `[id]/renew/route.ts`**

Create `apps/web/src/app/api/zadmin/affiliate/[id]/renew/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { proxyToApi } from '../../_shared/proxy';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToApi(req, `/admin/affiliate/${encodeURIComponent(id)}/renew`, 'POST');
}
```

- [ ] **Step 4: Create `[id]/propose-change/route.ts`**

Create `apps/web/src/app/api/zadmin/affiliate/[id]/propose-change/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { proxyToApi } from '../../_shared/proxy';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToApi(req, `/admin/affiliate/${encodeURIComponent(id)}/propose-change`, 'POST');
}
```

- [ ] **Step 5: Create `[id]/cancel-proposal/route.ts`**

Create `apps/web/src/app/api/zadmin/affiliate/[id]/cancel-proposal/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { proxyToApi } from '../../_shared/proxy';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToApi(req, `/admin/affiliate/${encodeURIComponent(id)}/cancel-proposal`, 'POST');
}
```

- [ ] **Step 6: Create `[id]/payouts/[payoutId]/approve/route.ts`**

Create `apps/web/src/app/api/zadmin/affiliate/[id]/payouts/[payoutId]/approve/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { proxyToApi } from '../../../../_shared/proxy';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; payoutId: string }> },
) {
  const { id, payoutId } = await params;
  return proxyToApi(
    req,
    `/admin/affiliate/${encodeURIComponent(id)}/payouts/${encodeURIComponent(payoutId)}/approve`,
    'POST',
  );
}
```

- [ ] **Step 7: Create `[id]/payouts/[payoutId]/reject/route.ts`**

Create `apps/web/src/app/api/zadmin/affiliate/[id]/payouts/[payoutId]/reject/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { proxyToApi } from '../../../../_shared/proxy';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; payoutId: string }> },
) {
  const { id, payoutId } = await params;
  return proxyToApi(
    req,
    `/admin/affiliate/${encodeURIComponent(id)}/payouts/${encodeURIComponent(payoutId)}/reject`,
    'POST',
  );
}
```

- [ ] **Step 8: Create `[id]/payouts/[payoutId]/complete/route.ts`**

Create `apps/web/src/app/api/zadmin/affiliate/[id]/payouts/[payoutId]/complete/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { proxyToApi } from '../../../../_shared/proxy';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; payoutId: string }> },
) {
  const { id, payoutId } = await params;
  return proxyToApi(
    req,
    `/admin/affiliate/${encodeURIComponent(id)}/payouts/${encodeURIComponent(payoutId)}/complete`,
    'POST',
  );
}
```

- [ ] **Step 9: Create `content-submissions/[submissionId]/review/route.ts`**

Create `apps/web/src/app/api/zadmin/affiliate/content-submissions/[submissionId]/review/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { proxyToApi } from '../../_shared/proxy';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const { submissionId } = await params;
  return proxyToApi(
    req,
    `/admin/affiliate/content-submissions/${encodeURIComponent(submissionId)}/review`,
    'PUT',
  );
}
```

- [ ] **Step 10: Create `fraud-flags/[flagId]/resolve/route.ts`**

Create `apps/web/src/app/api/zadmin/affiliate/fraud-flags/[flagId]/resolve/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { proxyToApi } from '../../_shared/proxy';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ flagId: string }> },
) {
  const { flagId } = await params;
  return proxyToApi(
    req,
    `/admin/affiliate/fraud-flags/${encodeURIComponent(flagId)}/resolve`,
    'POST',
  );
}
```

- [ ] **Step 11: Typecheck + confirm file count**

Run from repo root: `npm run typecheck -w @brighttale/web`

Expected: green.

Run from repo root:

```bash
find apps/web/src/app/api/zadmin/affiliate -name 'route.ts' | wc -l
```

Expected: `10`. If less, identify the missing file and create it.

## Task 20: Add sidebar entry

**Files:**
- Modify: `apps/web/src/lib/admin-layout-config.tsx`

- [ ] **Step 1: Add the "Afiliados" item**

Edit `apps/web/src/lib/admin-layout-config.tsx`. In the `Gestão` section's `items` array, after the `Analytics` entry, add a new line:

```tsx
{ label: 'Afiliados', path: adminPath('/affiliates'), icon: 'Users2' },
```

Full post-edit `Gestão` section should read:

```tsx
{
  group: 'Gestão',
  items: [
    { label: 'Usuários', path: adminPath('/users'), icon: 'Users' },
    { label: 'Organizations', path: adminPath('/orgs'), icon: 'Building2' },
    { label: 'Agentes', path: adminPath('/agents'), icon: 'Bot' },
    { label: 'Analytics', path: adminPath('/analytics'), icon: 'BarChart3' },
    { label: 'Afiliados', path: adminPath('/affiliates'), icon: 'Users2' },
  ],
},
```

- [ ] **Step 2: Typecheck**

Run from repo root: `npm run typecheck -w @brighttale/web`

Expected: green. If `Users2` is rejected as not a valid icon key, consult `@tn-figueiredo/admin`'s `AdminLayoutConfig.sections.items[].icon` union and swap for the nearest match.

## Task 21: TODO-2F anchor + env example

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/affiliates/TODO-2F.md`
- Modify: `apps/web/.env.local.example`

- [ ] **Step 1: Create TODO-2F.md**

Create `apps/web/src/app/zadmin/(protected)/affiliates/TODO-2F.md`:

```markdown
# Skipped in Phase 2C — tracked for Phase 2F

The `AffiliateAdminActions` contract from `@tn-figueiredo/affiliate-admin@0.3.3`
declares 14 actions. Phase 2C wires 10 and stubs 4 with throw-on-invoke.

- **`revalidateTaxId(affiliateId)`** — requires real Receita Federal
  integration (the current `StubTaxIdRepository` in apps/api returns a canned
  response). No corresponding admin HTTP route exists in Phase 2A.
- **`addSocialLink(affiliateId, platform, url)`** — no HTTP route in 2A; the
  package's `VerifySocialLinksUseCase` exists but is not wired.
- **`deleteSocialLink(affiliateId, platform)`** — same as above.
- **`verifySocialLinks(affiliateId)`** — same as above.

## Resolution path (2F)

1. Either add custom routes in `apps/api/src/routes/admin-affiliate/` for
   each of the four, OR upstream a PR to `@tn-figueiredo/affiliate` that
   registers them via `registerAffiliateAdminRoutes`.
2. Replace throws in `actions/skipped-2f.ts` with real `fetch` wrappers
   that POST / DELETE to the new routes.
3. Remove this file.

## References

- 2A spec §11.2C handoff:
  `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`
- 2C spec §4 decision matrix:
  `docs/superpowers/specs/2026-04-17-affiliate-2c-admin-ui-design.md`
```

- [ ] **Step 2: Update `.env.local.example`**

Check if `apps/web/.env.local.example` exists:

```bash
test -f apps/web/.env.local.example && echo "exists" || echo "missing"
```

If missing, create it. If exists, append (or insert appropriately) this block:

```bash
# ─── Admin affiliate pages (Phase 2C) ─────────────────────────────────
# API_URL — required by the admin affiliate surface (cross-app BFF calls
# to apps/api). Same value used by the dashboard /health probe.
# API_URL=http://localhost:3001

# INTERNAL_API_KEY — required for BFF proxy routes under /api/zadmin/affiliate/*
# MUST match apps/api's INTERNAL_API_KEY exactly.
# INTERNAL_API_KEY=dev-shared-secret
```

Keep existing sections untouched.

## Task 22: Errata note in 2A spec

**Files:**
- Modify: `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`

- [ ] **Step 1: Insert errata at §11.2C**

Open the 2A spec. Locate the `§11.2C` handoff section (or section titled roughly "Handoff to 2C"). At the very top of that section, before its first prose paragraph, insert:

```markdown
> **Update 2026-04-17:** Phase 2C plan and spec are now shipped. See
> `docs/superpowers/specs/2026-04-17-affiliate-2c-admin-ui-design.md` and
> `docs/superpowers/plans/2026-04-17-affiliate-2c-admin-ui.md`. The 4 orphan
> actions from the `AffiliateAdminActions` contract are formally skipped in
> 2C and tracked via `apps/web/src/app/zadmin/(protected)/affiliates/TODO-2F.md`.
```

Do not modify any other section.

## Task 23: Full verification sweep

- [ ] **Step 1: Typecheck all workspaces**

Run from repo root:

```bash
npm run typecheck
```

Expected: 4 workspaces green.

- [ ] **Step 2: Lint all workspaces**

Run from repo root:

```bash
npm run lint
```

Expected: green. Fix any reports immediately (typically unused imports).

- [ ] **Step 3: Run tests**

Run from repo root:

```bash
npm test
```

Expected: existing suites green + 17 new unit tests in apps/web (5 affiliate + 3 payouts + 2 content-fraud + 4 skipped-2f + 3 proxy).

- [ ] **Step 4: Build apps/web**

Run from repo root:

```bash
npm run build -w @brighttale/web
```

Expected: Turbopack compiles, including RSC bundles from `@tn-figueiredo/affiliate-admin/server`. No "module not found" warnings.

- [ ] **Step 5: Verify file inventory**

Run from repo root:

```bash
find apps/web/src/app/zadmin/\(protected\)/affiliates -type f | sort
find apps/web/src/app/api/zadmin/affiliate -type f | sort
find apps/web/src/__tests__/app/zadmin/affiliates -type f | sort
```

Expected counts:
- `affiliates/` page tree: 12 files (5 page.tsx + layout.tsx + client-layout.tsx + TODO-2F.md + 6 files under `actions/`).
- `api/zadmin/affiliate/`: 11 files (10 route.ts + 1 `_shared/proxy.ts`).
- `__tests__/app/zadmin/affiliates/`: 5 test files.

## Task 24: Local smoke rehearsal (9 flows)

Per spec §5 and CC-3/CC-4, local smoke substitutes for staging soak. Requires local Supabase + apps/api + apps/web running.

- [ ] **Step 1: Prepare environment**

Run from repo root:

```bash
npm run db:start             # local Supabase
npm run dev:api              # apps/api on :3001
npm run dev                  # apps/app on :3000 (optional for affiliate-apply flow)
cd apps/web && npm run dev   # apps/web on :3002
```

In a separate shell, seed test data:

```bash
# Seed: one pending affiliate, one approved, one payout-pending, one content submission.
# Use the existing affiliate test fixtures from apps/api/src/__tests__/fixtures/ or
# trigger via the /api/affiliate/apply end-user route; run the seed via:
cd apps/api && npx tsx scripts/seed-affiliate-smoke.ts 2>/dev/null || \
  echo "seed script missing — insert manually via Supabase SQL editor using rows from spec §5"
```

- [ ] **Step 2: Log in as an admin user**

Visit `http://localhost:3002/${NEXT_PUBLIC_ADMIN_SLUG}/login`, log in with a user that has a `user_roles.role='admin'` entry.

- [ ] **Step 3: Walk flows 1–9 per spec §5**

Execute the 9 flows in order from the spec:

1. Visit `/${slug}/affiliates` — confirm list renders with KPI tiles (active, pending, internal, pending-contract).
2. Click an affiliate → `/${slug}/affiliates/:id` — confirm detail renders with contract history + payouts summary.
3. Click "Aprovar" on a pending affiliate → dialog, confirm → row flips to `approved`.
4. Click "Pausar" on approved → status flips to `paused`.
5. Visit `/${slug}/affiliates/payouts` — approve one pending, reject another with notes; confirm statuses update.
6. Visit `/${slug}/affiliates/fraud` — resolve a seeded flag with `false_positive`; confirm removed from list.
7. Visit `/${slug}/affiliates/content` — approve one pending submission with notes; confirm status updates.
8. Click any skipped action (e.g., "Revalidar Tax ID") — confirm the error fallback renders the TODO-2F message.
9. Log out, log in as a non-admin user; visit `/${slug}/affiliates` — confirm redirect to login with `error=unauthorized`.

Record outcome for each flow (pass/fail) in the commit message body or a scratch note.

- [ ] **Step 4: Stop local services**

Run from repo root:

```bash
npm run db:stop
# kill dev:api and apps/web dev processes (Ctrl+C in their terminals)
```

## Task 25: Commit B

- [ ] **Step 1: Review staged diff**

Run from repo root:

```bash
git status && git diff --stat
```

Expected files (net new + modified):
- 12 files under `apps/web/src/app/zadmin/(protected)/affiliates/`
- 11 files under `apps/web/src/app/api/zadmin/affiliate/`
- 5 test files under `apps/web/src/__tests__/app/zadmin/affiliates/`
- 1 file `apps/web/src/lib/admin/affiliate-queries.ts`
- Modified: `apps/web/src/lib/admin-layout-config.tsx`, `apps/web/.env.local.example`, `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`
- Possibly: `apps/web/vitest.config.ts` if it was newly created in Task 5

Target LOC: 600–850 lines inclusive of tests (per spec §9 done criterion #14). Flag for review if breached.

- [ ] **Step 2: Stage files explicitly**

Run from repo root:

```bash
git add \
  apps/web/src/lib/admin-layout-config.tsx \
  apps/web/src/lib/admin/affiliate-queries.ts \
  apps/web/src/app/zadmin/\(protected\)/affiliates \
  apps/web/src/app/api/zadmin/affiliate \
  apps/web/src/__tests__/app/zadmin/affiliates \
  apps/web/.env.local.example \
  docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md
# Only add vitest.config.ts if newly created:
test -f apps/web/vitest.config.ts && git add apps/web/vitest.config.ts
```

- [ ] **Step 3: Commit**

Run from repo root:

```bash
git commit -m "$(cat <<'EOF'
feat(web): affiliate admin UI (Phase 2C — Commit B)

Wire the @tn-figueiredo/affiliate-admin@0.3.3 RSC package into apps/web's
admin shell. Atomic change — pages, actions, BFF proxy, and sidebar entry
land together to keep typecheck + nav functional.

- 6 RSC pages under /zadmin/(protected)/affiliates/ wrapping the
  package's *Server components: list, [id], payouts, fraud, content
- Client layout wraps the subtree in <AffiliateAdminProvider>
- 10 client-side action wrappers (5 affiliate + 3 payout + 1 content +
  1 fraud) fetch BFF routes under /api/zadmin/affiliate/*
- 4 skipped-2F action stubs (revalidateTaxId + 3 socialLink) throw the
  TODO-2F marker; tracked in affiliates/TODO-2F.md
- 10 BFF proxy routes + _shared/proxy.ts — re-auth via Supabase session
  cookie, inject X-Internal-Key server-side, forward to apps/api with
  envelope preserved
- Server-only fetch helper (adminFetch + 5 per-page fetchers) for the
  RSC read path; uses import 'server-only' to forbid client leakage
- Sidebar entry "Afiliados" added to admin-layout-config.tsx
- 17 unit tests (5 affiliate actions + 3 payout + 2 content/fraud + 4
  skipped-2F + 3 proxy); local smoke rehearsal of all 9 flows passed
- Errata note added to 2A spec §11.2C pointing to this sub-project

Verified: typecheck + lint + test + build all green. npm ls shows a
single @tn-figueiredo/affiliate@0.4.0 across workspaces.

Spec: docs/superpowers/specs/2026-04-17-affiliate-2c-admin-ui-design.md
Plan: docs/superpowers/plans/2026-04-17-affiliate-2c-admin-ui.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify commits landed**

Run from repo root:

```bash
git log -2 --oneline
```

Expected: two new commits (A and B) on top of the current branch head, forming the 2C pair.

---

## Done Criteria Checklist

- [ ] `npm run typecheck` green across all 4 workspaces
- [ ] `npm run lint` green
- [ ] `npm test` green; 17 new unit tests in apps/web pass
- [ ] `npm run build -w @brighttale/web` green (Turbopack compiles the package)
- [ ] Local smoke rehearsal passes all 9 flows (spec §5)
- [ ] `npm ls @tn-figueiredo/affiliate` shows a single `0.4.0` resolution in the monorepo
- [ ] `apps/web/package.json` has `"@tn-figueiredo/affiliate-admin": "0.3.3"` (pinned, no caret/tilde)
- [ ] `apps/web/src/lib/admin-layout-config.tsx` diff is exactly +1 item (plus trailing comma if needed)
- [ ] `apps/web/next.config.ts` `transpilePackages` includes `@tn-figueiredo/affiliate-admin`
- [ ] 4 skipped stubs present in `skipped-2f.ts`, each throws matching `/not wired in 2C — tracked as TODO-2F/`
- [ ] `TODO-2F.md` present in `affiliates/` with 4 bullet items (one per skipped action)
- [ ] 10 BFF route files present under `api/zadmin/affiliate/` (each ≤15 LOC of delegation)
- [ ] `actions/index.ts` exports the `actions` object declared with `satisfies AffiliateAdminActions`
- [ ] Errata note added to 2A spec §11.2C pointing to this sub-project
- [ ] Two commits on branch (A: install + transpile; B: pages + actions + BFF + sidebar + tests)
- [ ] Diff totals 600–850 LOC inclusive of tests
- [ ] No push to remote; local validation only (per CC-3, CC-4)
