# Phase 2B End-User UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `apps/app/src/app/(app)/settings/affiliate/page.tsx` against the new `@tn-figueiredo/affiliate@0.4.0` routes mounted in Phase 2A, delivering a state-machine UI that covers the full lifecycle (not-affiliate → pending → proposal → active dashboard → paused/terminated) including tier badge, contract proposal accept/reject, PIX key CRUD, content submissions, commission history, payout requests, and referral-link copy. Resolve the `/signup` URL drift via Next.js `beforeFiles` rewrites so package-emitted URLs (`/signup?ref=X`, `/parceiros/*`) land on real app routes. Capture `?ref` on signup into `localStorage` for post-confirmation attribution.

**Architecture:** Client-side state machine (`AffiliateClient.tsx`) driven by `GET /api/affiliate/me`, deriving one of six screens via a pure function. Envelope adapter (`apps/app/src/lib/affiliate-api.ts`) translates the package's `{ success, data|error }` shape into typed methods that throw `AffiliateApiError` on non-2xx. Formatters module uses hard-coded `pt-BR` locale with `Intl.NumberFormat`/`Intl.DateTimeFormat`. Ten section components render under the dashboard screen; each holds its own optimistic-UI + toast error handling. Strings live in a `strings.ts` constants module shaped as a future i18n namespace. Two commits: (A) additive scaffolding — envelope adapter, formatters, rewrites, signup capture, strings; (B) atomic page rewrite — replaces legacy `page.tsx` + 8 test files + apply stub + adapter edit in `apps/api/src/lib/affiliate/config.ts`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9 strict, Vitest 4.1.4 + jsdom, `@tn-figueiredo/affiliate@0.4.0` (pinned exact), `react-hook-form` + `zod` already in deps, shadcn/ui (`Button`, `Badge`, `Skeleton`, `AlertDialog`, `Dialog`), `sonner` for toasts, `next-intl` plugin (only wraps `[locale]/` segment — not used on this page).

**Spec:** `docs/superpowers/specs/2026-04-17-affiliate-2b-end-user-ui-design.md`

---

## File Structure

| Path | Disposition | Responsibility |
|---|---|---|
| `apps/app/src/lib/affiliate-api.ts` | **new** (Commit A) | Typed client + envelope adapter + `AffiliateApiError` + `AddPixKeyInput`/`SubmitContentInput` |
| `apps/app/src/lib/formatters.ts` | **new** (Commit A) | `formatBrl(value)` + `formatDate(iso)` — pt-BR hard-coded |
| `apps/app/src/lib/__tests__/affiliate-api.test.ts` | **new** (Commit A) | ~8 unit tests — envelope adapter paths |
| `apps/app/src/lib/__tests__/formatters.test.ts` | **new** (Commit A) | ~3 unit tests — BRL + date pt-BR |
| `apps/app/next.config.ts` | **modify** (Commit A) | `rewrites()` → `{ beforeFiles, afterFiles }`; 3 shim rewrites added |
| `apps/app/src/app/[locale]/(auth)/auth/signup/page.tsx` | **modify** (Commit A) | 4-line addition — capture `?ref` to `localStorage` |
| `apps/app/src/app/(app)/settings/affiliate/components/strings.ts` | **new** (Commit A) | pt-BR constants shaped as i18n namespace |
| `apps/app/src/app/(app)/settings/affiliate/AffiliateClient.tsx` | **new** (Commit B) | `'use client'` root + state-machine `deriveScreen()` |
| `apps/app/src/app/(app)/settings/affiliate/page.tsx` | **modify** (Commit B) | Full rewrite — server-component shell renders `<AffiliateClient />` |
| `apps/app/src/app/(app)/settings/affiliate/apply/page.tsx` | **new** (Commit B) | Minimal application-stub form |
| `apps/app/src/app/(app)/settings/affiliate/components/not-affiliate.tsx` | **new** (Commit B) | State A |
| `apps/app/src/app/(app)/settings/affiliate/components/pending-application.tsx` | **new** (Commit B) | State B |
| `apps/app/src/app/(app)/settings/affiliate/components/contract-proposal.tsx` | **new** (Commit B) | State C |
| `apps/app/src/app/(app)/settings/affiliate/components/dashboard.tsx` | **new** (Commit B) | State D composition + paused overlay |
| `apps/app/src/app/(app)/settings/affiliate/components/terminated.tsx` | **new** (Commit B) | State F |
| `apps/app/src/app/(app)/settings/affiliate/components/tier-badge.tsx` | **new** (Commit B) | Tier chip + commission pct + expiry countdown |
| `apps/app/src/app/(app)/settings/affiliate/components/referral-link-card.tsx` | **new** (Commit B) | Copy signup + homepage links; PostHog capture |
| `apps/app/src/app/(app)/settings/affiliate/components/stats-grid.tsx` | **new** (Commit B) | 5 stat cards (clicks/referrals/conversions/pending/paid) |
| `apps/app/src/app/(app)/settings/affiliate/components/clicks-by-platform.tsx` | **new** (Commit B) | Table, hides when empty |
| `apps/app/src/app/(app)/settings/affiliate/components/recent-referrals.tsx` | **new** (Commit B) | 10 most recent |
| `apps/app/src/app/(app)/settings/affiliate/components/commission-history.tsx` | **new** (Commit B) | Client pagination 20/page + status pill + retroactive badge |
| `apps/app/src/app/(app)/settings/affiliate/components/payout-section.tsx` | **new** (Commit B) | Request-payout button + confirm dialog |
| `apps/app/src/app/(app)/settings/affiliate/components/pix-key-manager.tsx` | **new** (Commit B) | List/add/setDefault/delete + client regex validators |
| `apps/app/src/app/(app)/settings/affiliate/components/content-submissions.tsx` | **new** (Commit B) | List + submit-new dialog |
| `apps/app/src/app/(app)/settings/affiliate/__tests__/page.test.tsx` | **delete** (Commit B) | Drifted legacy tests — superseded |
| `apps/app/src/app/(app)/settings/affiliate/__tests__/AffiliateClient.test.tsx` | **new** (Commit B) | ~10 state-machine tests |
| `apps/app/src/app/(app)/settings/affiliate/__tests__/tier-badge.test.tsx` | **new** (Commit B) | ~4 tests |
| `apps/app/src/app/(app)/settings/affiliate/__tests__/referral-link-card.test.tsx` | **new** (Commit B) | ~3 tests — clipboard + PostHog |
| `apps/app/src/app/(app)/settings/affiliate/__tests__/pix-key-manager.test.tsx` | **new** (Commit B) | ~9 tests |
| `apps/app/src/app/(app)/settings/affiliate/__tests__/payout-section.test.tsx` | **new** (Commit B) | ~7 tests |
| `apps/app/src/app/(app)/settings/affiliate/__tests__/commission-history.test.tsx` | **new** (Commit B) | ~4 tests |
| `apps/app/src/app/(app)/settings/affiliate/__tests__/contract-proposal.test.tsx` | **new** (Commit B) | ~6 tests |
| `apps/app/src/app/(app)/settings/affiliate/__tests__/content-submissions.test.tsx` | **new** (Commit B) | ~5 tests |
| `apps/api/src/lib/affiliate/config.ts` | **modify** (Commit B) | Delete stale KNOWN-GAP comment lines 5–9; replace with one-line resolution note |
| `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md` | **modify** (Commit B) | Top-of-file errata note referencing 2B resolution |
| `apps/app/.env.example` | **modify** (Commit A) | Document `NEXT_PUBLIC_MARKETING_URL` |

---

# Phase A — Commit A: Additive scaffolding

All of Phase A is additive. Existing `page.tsx` keeps hitting `/api/affiliate-legacy/*`; new modules are unimported until Commit B. At end of Phase A, `npm run typecheck` / `npm run lint` / `npm test --workspace=@brighttale/app` all stay green.

## Task 1: Create `affiliate-api.ts` skeleton (envelope adapter, no methods)

**Files:**
- Create: `apps/app/src/lib/__tests__/affiliate-api.test.ts`
- Create: `apps/app/src/lib/affiliate-api.ts`

- [ ] **Step 1: Write failing test**

Create `apps/app/src/lib/__tests__/affiliate-api.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AffiliateApiError, affiliateApi } from '../affiliate-api';

describe('affiliate-api envelope adapter', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  it('200 + success:true returns data', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: 'a1' } }), { status: 200 }),
    );
    const me = await affiliateApi.getMe();
    expect(me).toEqual({ id: 'a1' });
  });

  it('404 + success:false on getMe → null', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'not found' }), { status: 404 }),
    );
    const me = await affiliateApi.getMe();
    expect(me).toBeNull();
  });

  it('404 on any other method → throws NOT_FOUND AffiliateApiError', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'gone' }), { status: 404 }),
    );
    await expect(affiliateApi.getStats()).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'gone',
    });
  });

  it('403 → FORBIDDEN', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'no' }), { status: 403 }),
    );
    await expect(affiliateApi.getStats()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('409 → CONFLICT', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'dup' }), { status: 409 }),
    );
    await expect(affiliateApi.getStats()).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('422 → VALIDATION', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'bad' }), { status: 422 }),
    );
    await expect(affiliateApi.getStats()).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('non-JSON body → UNKNOWN with HTTP N message', async () => {
    fetchSpy.mockResolvedValue(new Response('<html>500</html>', { status: 500 }));
    await expect(affiliateApi.getStats()).rejects.toMatchObject({
      code: 'UNKNOWN',
      message: 'HTTP 500',
    });
  });

  it('204 No Content → undefined', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await affiliateApi.setDefaultPixKey('k1');
    expect(res).toBeUndefined();
  });

  it('success:true with no data body → undefined', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    const res = await affiliateApi.rejectProposal();
    expect(res).toBeUndefined();
  });

  it('AffiliateApiError instance branding', () => {
    const e = new AffiliateApiError(404, 'NOT_FOUND', 'x');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('AffiliateApiError');
    expect(e.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from repo root: `npx vitest run apps/app/src/lib/__tests__/affiliate-api.test.ts`

Expected: FAIL with "Cannot find module '../affiliate-api'".

- [ ] **Step 3: Write implementation**

Create `apps/app/src/lib/affiliate-api.ts`:

```ts
import type {
  Affiliate, AffiliateStats, AffiliateReferral, AffiliateCommission,
  AffiliatePixKey, AffiliatePixKeyType, AffiliatePayout,
  AffiliateContentSubmission, ContentSubmissionPlatform, ContentSubmissionType,
  ApplyAsAffiliateInput,
} from '@tn-figueiredo/affiliate';

export type AffiliateApiErrorCode =
  | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION' | 'UNKNOWN';

export class AffiliateApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: AffiliateApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AffiliateApiError';
  }
}

type PkgOk<T> = { success: true; data?: T };
type PkgErr = { success: false; error: string };
type PkgResp<T> = PkgOk<T> | PkgErr;

function codeFor(status: number): AffiliateApiErrorCode {
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

export interface ClickByPlatform {
  sourcePlatform: string;
  clicks: number;
  conversions: number;
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
  getStats: () => call<AffiliateStats>('/stats'),
  getReferrals: () => call<AffiliateReferral[]>('/referrals'),
  getCommissions: () => call<AffiliateCommission[]>('/me/commissions'),
  getClicksByPlatform: () => call<ClickByPlatform[]>('/clicks-by-platform'),
  listPixKeys: () => call<AffiliatePixKey[]>('/pix-keys'),
  addPixKey: (i: AddPixKeyInput) =>
    call<AffiliatePixKey>('/pix-keys', { method: 'POST', body: JSON.stringify(i) }),
  setDefaultPixKey: (id: string) =>
    call<void>(`/pix-keys/${encodeURIComponent(id)}/default`, { method: 'PUT' }),
  deletePixKey: (id: string) =>
    call<void>(`/pix-keys/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  submitContent: (i: SubmitContentInput) =>
    call<AffiliateContentSubmission>('/content-submissions', {
      method: 'POST', body: JSON.stringify(i),
    }),
  acceptProposal: (lgpdData?: { ip: string; ua: string }) =>
    call<Affiliate>('/accept-proposal', {
      method: 'POST', body: JSON.stringify({ lgpdData }),
    }),
  rejectProposal: () =>
    call<void>('/reject-proposal', { method: 'POST', body: '{}' }),
  requestPayout: () =>
    call<AffiliatePayout>('/payouts', { method: 'POST', body: '{}' }),
  apply: (i: ApplyAsAffiliateInput) =>
    call<Affiliate>('/apply', { method: 'POST', body: JSON.stringify(i) }),
};

export type AffiliateApi = typeof affiliateApi;
```

- [ ] **Step 4: Run test to verify it passes**

Run from repo root: `npx vitest run apps/app/src/lib/__tests__/affiliate-api.test.ts`

Expected: 10 tests pass.

- [ ] **Step 5: Typecheck**

Run from repo root: `npm run typecheck`

Expected: 4 workspaces green.

## Task 2: Create `formatters.ts` (BRL + date, pt-BR)

**Files:**
- Create: `apps/app/src/lib/__tests__/formatters.test.ts`
- Create: `apps/app/src/lib/formatters.ts`

- [ ] **Step 1: Write failing test**

Create `apps/app/src/lib/__tests__/formatters.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatBrl, formatDate } from '../formatters';

describe('formatters', () => {
  it('formatBrl renders integer BRL with pt-BR grouping and no fraction digits', () => {
    expect(formatBrl(50)).toMatch(/R\$\s?50/);
    expect(formatBrl(1234)).toMatch(/R\$\s?1\.234/);
    expect(formatBrl(0)).toMatch(/R\$\s?0/);
  });

  it('formatBrl handles negative values', () => {
    expect(formatBrl(-10)).toMatch(/-.*10/);
  });

  it('formatDate renders ISO date in pt-BR medium format', () => {
    // 2026-04-17 in pt-BR medium is "17 de abr. de 2026"
    const out = formatDate('2026-04-17T12:00:00.000Z');
    expect(out).toMatch(/17/);
    expect(out).toMatch(/2026/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from repo root: `npx vitest run apps/app/src/lib/__tests__/formatters.test.ts`

Expected: FAIL with "Cannot find module '../formatters'".

- [ ] **Step 3: Write implementation**

Create `apps/app/src/lib/formatters.ts`:

```ts
/**
 * pt-BR hard-coded formatters for affiliate (and future) UI.
 * Locale is a constant now — promoted to an argument when i18n lands.
 */
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

- [ ] **Step 4: Run test to verify it passes**

Run from repo root: `npx vitest run apps/app/src/lib/__tests__/formatters.test.ts`

Expected: 3 tests pass.

## Task 3: Convert `next.config.ts` rewrites to `{ beforeFiles, afterFiles }`

**Files:**
- Modify: `apps/app/next.config.ts`

- [ ] **Step 1: Preflight — capture current rewrites**

Run from repo root: `npx grep-ast 'rewrites' apps/app/next.config.ts 2>/dev/null || sed -n '54,66p' apps/app/next.config.ts`

Expected: current rewrites array contains exactly two entries — `/api/:path*` and `/generated-images/:path*`.

- [ ] **Step 2: Replace `rewrites()` body**

In `apps/app/next.config.ts`, locate the current `async rewrites()` block (lines 54–65 per preflight). Replace the entire `async rewrites() { return [...]; }` function body with:

```ts
  async rewrites() {
    return {
      beforeFiles: [
        // Affiliate 2B — shim package-emitted URLs onto real app routes.
        // beforeFiles runs BEFORE next-intl middleware; preserves ?ref automatically.
        { source: '/signup', destination: '/auth/signup' },
        { source: '/parceiros/login', destination: '/auth/login' },
        { source: '/parceiros/dashboard', destination: '/settings/affiliate' },
      ],
      afterFiles: [
        {
          source: '/api/:path*',
          destination: `${API_URL}/:path*`,
        },
        {
          source: '/generated-images/:path*',
          destination: `${API_URL}/generated-images/:path*`,
        },
      ],
      fallback: [],
    };
  },
```

- [ ] **Step 3: Typecheck**

Run from repo root: `npm run typecheck`

Expected: 4 workspaces green. Next.js `NextConfig['rewrites']` accepts either the array form or the `{ beforeFiles, afterFiles, fallback }` object form; both are typed by the framework.

- [ ] **Step 4: Build smoke**

Run from repo root: `npm run build --workspace=@brighttale/app 2>&1 | tail -30`

Expected: successful build output including the rewrites in the route manifest. No errors about unrecognized rewrite keys.

- [ ] **Step 5: Live smoke (dev server)**

Run from repo root in a background terminal:

```bash
npm run dev:app &
APP_PID=$!
sleep 6
curl -sS -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3000/signup?ref=abc" || true
kill $APP_PID 2>/dev/null || true
```

Expected: HTTP 307 or 308 with redirect URL pointing to `/<locale>/auth/signup?ref=abc` (locale depends on cookie default). If a 404 is returned, the rewrite ordering is wrong — re-verify `beforeFiles` vs `afterFiles`.

## Task 4: Signup page — capture `?ref` into `localStorage`

**Files:**
- Modify: `apps/app/src/app/[locale]/(auth)/auth/signup/page.tsx`

- [ ] **Step 1: Read the file**

Read `apps/app/src/app/[locale]/(auth)/auth/signup/page.tsx`. Confirm:
- `'use client'` is present at the top (it must be — `useSearchParams` requires client).
- There is a `supabase.auth.signUp(...)` call on success path.
- `useSearchParams` is not already imported.

- [ ] **Step 2: Add import**

Add to the imports block at the top of the file:

```ts
import { useSearchParams } from 'next/navigation';
```

Keep existing import order conventions (external imports before internal).

- [ ] **Step 3: Read ref inside component**

Inside the `SignupPage` (or equivalently named) component body, near the other `useState`/`useRouter` hooks, add:

```ts
const ref = useSearchParams().get('ref');
```

- [ ] **Step 4: Persist ref on successful signup**

Immediately after the successful `supabase.auth.signUp(...)` call returns without error (i.e., before the email-sent toast or redirect), add:

```ts
if (ref && typeof window !== 'undefined') {
  window.localStorage.setItem('bt.ref', ref);
}
```

No UI change on the page. No error handling — `localStorage` write failure is silent (quota/disabled-cookies path is acceptable parity).

- [ ] **Step 5: Typecheck**

Run from repo root: `npm run typecheck`

Expected: 4 workspaces green.

- [ ] **Step 6: Existing signup tests still green**

Run from repo root: `npx vitest run apps/app/src/app/\\[locale\\]/\\(auth\\)/auth/signup/ 2>&1 | tail -20`

Expected: all existing signup page tests pass (no new tests added here — 4-line change is exercised via the §5.3 smoke item 4, not a unit test).

## Task 5: Create `strings.ts` constants module

**Files:**
- Create: `apps/app/src/app/(app)/settings/affiliate/components/strings.ts`

- [ ] **Step 1: Ensure `components/` directory exists**

Run from repo root: `mkdir -p apps/app/src/app/\\(app\\)/settings/affiliate/components`

- [ ] **Step 2: Write the strings module**

Create `apps/app/src/app/(app)/settings/affiliate/components/strings.ts`:

```ts
/**
 * Hard-coded pt-BR strings for the affiliate settings tree.
 * Shape mirrors a future i18n namespace (`affiliate.*`) so extraction is
 * mechanical when NextIntlClientProvider is wired over (app)/ (out of scope
 * for 2B; see spec §10).
 */
export const strings = {
  title: 'Programa de Afiliados',
  back_to_settings: 'Configurações',
  state: {
    not_affiliate: {
      title: 'Você ainda não é afiliado',
      body: 'Cadastre-se para começar a indicar e receber comissões.',
      cta: 'Candidatar-se',
    },
    pending: {
      title: 'Candidatura em análise',
      body: 'Avaliamos em até 3 dias úteis.',
    },
    proposal: {
      title: 'Nova proposta de contrato',
      accept: 'Aceitar proposta',
      reject: 'Rejeitar',
      lgpd_consent:
        'Ao aceitar, você concorda com os termos e o tratamento dos seus dados pessoais conforme a LGPD.',
    },
    paused: {
      banner: 'Conta pausada — fale com o suporte para reativar.',
    },
    terminated: {
      title: 'Parceria encerrada',
      body: 'Seu acesso ao programa foi finalizado.',
      support: 'Falar com o suporte',
    },
  },
  tier: { nano: 'Nano', micro: 'Micro', mid: 'Mid', macro: 'Macro', mega: 'Mega' },
  stats: {
    clicks: 'Cliques',
    referrals: 'Indicações',
    conversions: 'Conversões',
    pending: 'Pendente',
    paid: 'Pago',
  },
  referral: {
    section_title: 'Link de indicação',
    copy_signup: 'Copiar link de cadastro',
    copy_homepage: 'Copiar link da página inicial',
    copied: 'Link copiado!',
  },
  payout: {
    section_title: 'Pagamentos',
    request: 'Solicitar pagamento',
    confirm_title: 'Confirmar solicitação',
    confirm_body: (amount: string, pix: string) =>
      `${amount} será enviado para ${pix}. Prosseguir?`,
    proceed: 'Solicitar',
    cancel: 'Cancelar',
    min_tooltip: (min: string) => `Mínimo de ${min} para solicitar pagamento.`,
    no_default_tooltip: 'Cadastre uma chave PIX padrão abaixo para habilitar pagamentos.',
    success: 'Pagamento solicitado — revisão pelo admin pendente.',
    tax_id_irregular: 'Seu CPF/CNPJ está com pendência. Atualize seu cadastro para solicitar pagamentos.',
  },
  pix: {
    section_title: 'Chaves PIX',
    add: 'Adicionar chave PIX',
    set_default: 'Definir como padrão',
    delete: 'Remover',
    default_badge: 'Padrão',
    confirm_delete_title: 'Remover chave PIX?',
    confirm_delete_body: 'Essa ação não pode ser desfeita.',
    cannot_delete_default:
      'Não é possível remover a chave padrão enquanto existirem outras — defina outra como padrão primeiro.',
    invalid: {
      cpf: 'CPF inválido — deve conter 11 dígitos.',
      cnpj: 'CNPJ inválido — deve conter 14 dígitos.',
      email: 'E-mail inválido.',
      phone: 'Telefone inválido — use DDI+DDD+número.',
      random: 'Chave aleatória inválida — deve ter 32–36 caracteres.',
    },
  },
  content: {
    section_title: 'Conteúdo publicado',
    submit: 'Enviar conteúdo',
    submit_success: 'Conteúdo enviado para revisão.',
    invalid_url: 'URL inválida.',
  },
  commissions: {
    section_title: 'Comissões',
    status: { pending: 'Pendente', paid: 'Pago', cancelled: 'Cancelado' },
    retroactive_badge: 'Retroativo',
    empty: 'Nenhuma comissão ainda.',
  },
  referrals: {
    section_title: 'Indicações recentes',
    empty: 'Nenhuma indicação ainda.',
  },
  clicks_by_platform: {
    section_title: 'Cliques por plataforma',
  },
  errors: {
    unknown: 'Erro — tente novamente.',
    forbidden: 'Operação não permitida — fale com o suporte.',
    get_me_failed: 'Não foi possível carregar seus dados. Tentar novamente?',
    retry: 'Tentar novamente',
  },
} as const;

export type AffiliateStrings = typeof strings;
```

- [ ] **Step 3: Typecheck**

Run from repo root: `npm run typecheck`

Expected: 4 workspaces green — the module has no runtime imports.

## Task 6: Document `NEXT_PUBLIC_MARKETING_URL` in `.env.example`

**Files:**
- Modify: `apps/app/.env.example`

- [ ] **Step 1: Read the current file**

Read `apps/app/.env.example` fully. Note that the file may not exist yet — if it doesn't, create it with the following content in Step 2; otherwise append the new section at the bottom.

- [ ] **Step 2: Append affiliate section**

Append this block to the end of `apps/app/.env.example` (create the file with this content if it does not exist):

```bash
# ─── Affiliate (Phase 2B) ──────────────────────────────────────────────
# Marketing-site origin for affiliate referral links. When
# window.location.origin does not start with "app.", the referral-link
# component falls back to this value (localhost:3002 in dev,
# https://brighttale.io in prod). Client-readable (NEXT_PUBLIC_).
# NEXT_PUBLIC_MARKETING_URL=https://brighttale.io
```

- [ ] **Step 3: Verify no actual secret leaked**

Run from repo root: `git diff apps/app/.env.example`

Expected: diff shows only the comment block above; no real `re_…`, `sk_…`, or JWT string added. `.env.example` is committed (intentionally) and must contain only documentation.

## Task 7: Commit A verification + commit

- [ ] **Step 1: Sweep**

Run from repo root:

```bash
npm run typecheck
```

Expected: 4 workspaces green.

```bash
npm run lint --workspace=@brighttale/app
```

Expected: green.

```bash
npx vitest run apps/app/src/lib/__tests__/affiliate-api.test.ts apps/app/src/lib/__tests__/formatters.test.ts
```

Expected: 13 tests pass (10 envelope + 3 formatter).

```bash
npm test --workspace=@brighttale/app 2>&1 | tail -20
```

Expected: entire existing suite still green — legacy `__tests__/page.test.tsx` still passes because `page.tsx` is unchanged at this commit; new tests pass.

- [ ] **Step 2: Build smoke**

Run from repo root: `npm run build --workspace=@brighttale/app 2>&1 | tail -10`

Expected: build succeeds; route manifest includes the 3 new beforeFiles rewrites.

- [ ] **Step 3: Review staged diff**

Run from repo root: `git status && git diff --stat`

Expected files modified/created in Commit A (none deleted):
- `apps/app/src/lib/affiliate-api.ts` (new)
- `apps/app/src/lib/formatters.ts` (new)
- `apps/app/src/lib/__tests__/affiliate-api.test.ts` (new)
- `apps/app/src/lib/__tests__/formatters.test.ts` (new)
- `apps/app/next.config.ts` (rewrites shape change + 3 shims)
- `apps/app/src/app/[locale]/(auth)/auth/signup/page.tsx` (4 lines)
- `apps/app/src/app/(app)/settings/affiliate/components/strings.ts` (new)
- `apps/app/.env.example` (append section)

- [ ] **Step 4: Commit**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add \
  apps/app/src/lib/affiliate-api.ts \
  apps/app/src/lib/formatters.ts \
  apps/app/src/lib/__tests__/affiliate-api.test.ts \
  apps/app/src/lib/__tests__/formatters.test.ts \
  apps/app/next.config.ts \
  apps/app/src/app/\[locale\]/\(auth\)/auth/signup/page.tsx \
  apps/app/src/app/\(app\)/settings/affiliate/components/strings.ts \
  apps/app/.env.example

git commit -m "$(cat <<'EOF'
feat(app): affiliate 2B — additive scaffolding (Commit A)

Add the client-side envelope adapter, pt-BR formatters, the /signup → /auth/signup
(and /parceiros/*) beforeFiles rewrites, a 4-line ?ref capture on the signup
page, and the pt-BR strings constants module. Legacy affiliate page and tests
remain unchanged and green; all new modules are unimported until Commit B.

- apps/app/src/lib/affiliate-api.ts — typed client + AffiliateApiError envelope adapter
- apps/app/src/lib/formatters.ts — formatBrl/formatDate pt-BR
- apps/app/next.config.ts — rewrites({ beforeFiles, afterFiles }) with 3 shims
- apps/app/src/app/[locale]/(auth)/auth/signup/page.tsx — capture ?ref to localStorage
- apps/app/src/app/(app)/settings/affiliate/components/strings.ts — pt-BR namespace
- apps/app/.env.example — document NEXT_PUBLIC_MARKETING_URL

Spec: docs/superpowers/specs/2026-04-17-affiliate-2b-end-user-ui-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Verify**

Run: `git log -1 --stat`

Expected: one new commit with 8 files changed.

---

# Phase B — Commit B: Atomic page rewrite

All of Phase B lands in ONE commit. The legacy test file is deleted and the page is rewritten in the same commit to avoid an intermediate broken test state. Tasks are ordered so that `npm test` only runs at Task 18 (after all replacements are in place).

## Task 8: `AffiliateClient` state machine + test

**Files:**
- Create: `apps/app/src/app/(app)/settings/affiliate/__tests__/AffiliateClient.test.tsx`
- Create: `apps/app/src/app/(app)/settings/affiliate/AffiliateClient.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/app/src/app/(app)/settings/affiliate/__tests__/AffiliateClient.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AffiliateClient } from '../AffiliateClient';

vi.mock('@/lib/affiliate-api', () => ({
  AffiliateApiError: class extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
  affiliateApi: {
    getMe: vi.fn(),
    getStats: vi.fn().mockResolvedValue({
      totalClicks: 0, totalReferrals: 0, totalConversions: 0,
      totalEarningsBrl: 0, pendingPayoutBrl: 0, paidPayoutBrl: 0,
    }),
    getReferrals: vi.fn().mockResolvedValue([]),
    getCommissions: vi.fn().mockResolvedValue([]),
    getClicksByPlatform: vi.fn().mockResolvedValue([]),
    listPixKeys: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { affiliateApi } from '@/lib/affiliate-api';

const baseAffiliate = {
  id: 'a1', userId: 'u1', code: 'CODE1', tier: 'nano', commissionRate: 0.15,
  status: 'active', contractStartDate: '2026-01-01T00:00:00Z',
  contractEndDate: '2026-12-31T00:00:00Z', contractVersion: 1,
  proposedTier: null, proposedCommissionRate: null, proposedFixedFeeBrl: null,
} as any;

describe('AffiliateClient state machine', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders not-affiliate when getMe returns null', async () => {
    vi.mocked(affiliateApi.getMe).mockResolvedValue(null);
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByText(/não é afiliado/i)).toBeInTheDocument(),
    );
  });

  it('renders pending when status=pending', async () => {
    vi.mocked(affiliateApi.getMe).mockResolvedValue({ ...baseAffiliate, status: 'pending' });
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByText(/Candidatura em análise/)).toBeInTheDocument(),
    );
  });

  it('renders proposal when proposedTier set (even on active)', async () => {
    vi.mocked(affiliateApi.getMe).mockResolvedValue({
      ...baseAffiliate, status: 'active', proposedTier: 'micro', proposedCommissionRate: 0.2,
    });
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByText(/Nova proposta de contrato/)).toBeInTheDocument(),
    );
  });

  it('renders proposal when status=approved + proposedTier', async () => {
    vi.mocked(affiliateApi.getMe).mockResolvedValue({
      ...baseAffiliate, status: 'approved', proposedTier: 'nano', proposedCommissionRate: 0.15,
    });
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByText(/Nova proposta de contrato/)).toBeInTheDocument(),
    );
  });

  it('renders dashboard when status=active + no proposal', async () => {
    vi.mocked(affiliateApi.getMe).mockResolvedValue(baseAffiliate);
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByText(/Link de indicação/)).toBeInTheDocument(),
    );
  });

  it('renders paused banner over dashboard when status=paused', async () => {
    vi.mocked(affiliateApi.getMe).mockResolvedValue({ ...baseAffiliate, status: 'paused' });
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByText(/Conta pausada/)).toBeInTheDocument(),
    );
  });

  it('renders terminated screen when status=terminated', async () => {
    vi.mocked(affiliateApi.getMe).mockResolvedValue({ ...baseAffiliate, status: 'terminated' });
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByText(/Parceria encerrada/)).toBeInTheDocument(),
    );
  });

  it('renders terminated screen when status=rejected', async () => {
    vi.mocked(affiliateApi.getMe).mockResolvedValue({ ...baseAffiliate, status: 'rejected' });
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByText(/Parceria encerrada/)).toBeInTheDocument(),
    );
  });

  it('shows loading skeleton before fetch resolves', () => {
    vi.mocked(affiliateApi.getMe).mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<AffiliateClient />);
    expect(container.querySelector('[data-testid="affiliate-loading"]')).toBeTruthy();
  });

  it('getMe failure surfaces retry button', async () => {
    vi.mocked(affiliateApi.getMe).mockRejectedValue(new Error('boom'));
    render(<AffiliateClient />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from repo root: `npx vitest run apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/AffiliateClient.test.tsx`

Expected: FAIL — module `../AffiliateClient` does not exist.

- [ ] **Step 3: Write placeholder section components (stubs)**

Create the 5 state-screen stub components so `AffiliateClient.tsx` can import them. Each file contains a bare minimum that will be fleshed out in Tasks 9–16. Create all 5 in one pass:

Create `apps/app/src/app/(app)/settings/affiliate/components/not-affiliate.tsx`:

```tsx
import { strings } from './strings';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function NotAffiliate() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">{strings.state.not_affiliate.title}</h1>
      <p>{strings.state.not_affiliate.body}</p>
      <Button asChild>
        <Link href="/settings/affiliate/apply">{strings.state.not_affiliate.cta}</Link>
      </Button>
    </div>
  );
}
```

Create `apps/app/src/app/(app)/settings/affiliate/components/pending-application.tsx`:

```tsx
import type { Affiliate } from '@tn-figueiredo/affiliate';
import { strings } from './strings';

interface Props { me: Affiliate }

export function PendingApplication({ me }: Props) {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">{strings.state.pending.title}</h1>
      <p>{strings.state.pending.body}</p>
      <dl className="text-sm text-muted-foreground">
        <dt>Código sugerido</dt><dd>{me.code ?? '—'}</dd>
      </dl>
    </div>
  );
}
```

Create `apps/app/src/app/(app)/settings/affiliate/components/terminated.tsx`:

```tsx
import type { Affiliate } from '@tn-figueiredo/affiliate';
import { strings } from './strings';

interface Props { me: Affiliate }

export function Terminated({ me: _me }: Props) {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">{strings.state.terminated.title}</h1>
      <p>{strings.state.terminated.body}</p>
      <a href="mailto:suporte@brighttale.io" className="underline">
        {strings.state.terminated.support}
      </a>
    </div>
  );
}
```

Create `apps/app/src/app/(app)/settings/affiliate/components/contract-proposal.tsx`:

```tsx
'use client';
import type { Affiliate } from '@tn-figueiredo/affiliate';
import { strings } from './strings';

interface Props {
  me: Affiliate;
  onResolved: () => Promise<void> | void;
}

export function ContractProposal({ me: _me, onResolved: _onResolved }: Props) {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4" data-testid="contract-proposal">
      <h1 className="text-2xl font-semibold">{strings.state.proposal.title}</h1>
      {/* Fleshed out in Task 13 */}
    </div>
  );
}
```

Create `apps/app/src/app/(app)/settings/affiliate/components/dashboard.tsx`:

```tsx
'use client';
import type { Affiliate, AffiliateStats } from '@tn-figueiredo/affiliate';
import { strings } from './strings';

interface Props {
  me: Affiliate;
  stats: AffiliateStats | null;
  readOnly: boolean;
  onMutate: () => Promise<void> | void;
}

export function Dashboard({ me: _me, stats: _stats, readOnly, onMutate: _onMutate }: Props) {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="affiliate-dashboard">
      {readOnly && (
        <div className="rounded border border-yellow-500 bg-yellow-50 p-3 text-sm">
          {strings.state.paused.banner}
        </div>
      )}
      <section>
        <h2 className="text-xl font-semibold">{strings.referral.section_title}</h2>
        {/* Fleshed out in Task 10 */}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Write `AffiliateClient.tsx`**

Create `apps/app/src/app/(app)/settings/affiliate/AffiliateClient.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Affiliate, AffiliateStats } from '@tn-figueiredo/affiliate';
import { affiliateApi, AffiliateApiError } from '@/lib/affiliate-api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { strings } from './components/strings';
import { NotAffiliate } from './components/not-affiliate';
import { PendingApplication } from './components/pending-application';
import { ContractProposal } from './components/contract-proposal';
import { Dashboard } from './components/dashboard';
import { Terminated } from './components/terminated';

type Screen =
  | 'loading' | 'error'
  | 'not-affiliate' | 'pending' | 'proposal'
  | 'dashboard' | 'paused' | 'terminated';

export function deriveScreen(me: Affiliate | null): Exclude<Screen, 'loading' | 'error'> {
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

  const load = useCallback(async () => {
    setScreen('loading');
    try {
      const m = await affiliateApi.getMe();
      setMe(m);
      const next = deriveScreen(m);
      setScreen(next);
      if (m && (next === 'dashboard' || next === 'paused' || next === 'proposal')) {
        try {
          setStats(await affiliateApi.getStats());
        } catch (err) {
          // Stats failure is non-fatal — dashboard renders with null stats
          const msg = err instanceof AffiliateApiError ? err.message : strings.errors.unknown;
          toast.error(msg);
        }
      }
    } catch {
      setScreen('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (screen === 'loading') return <LoadingSkeleton />;
  if (screen === 'error') return <ErrorRetry onRetry={load} />;
  if (screen === 'not-affiliate') return <NotAffiliate />;
  if (screen === 'pending') return <PendingApplication me={me!} />;
  if (screen === 'terminated') return <Terminated me={me!} />;
  if (screen === 'proposal') return <ContractProposal me={me!} onResolved={load} />;
  return <Dashboard me={me!} stats={stats} readOnly={screen === 'paused'} onMutate={load} />;
}

function LoadingSkeleton() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4" data-testid="affiliate-loading">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}

function ErrorRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <p>{strings.errors.get_me_failed}</p>
      <Button onClick={onRetry}>{strings.errors.retry}</Button>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run from repo root: `npx vitest run apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/AffiliateClient.test.tsx`

Expected: 10 tests pass.

## Task 9: `TierBadge` component + test

**Files:**
- Create: `apps/app/src/app/(app)/settings/affiliate/__tests__/tier-badge.test.tsx`
- Create: `apps/app/src/app/(app)/settings/affiliate/components/tier-badge.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/app/src/app/(app)/settings/affiliate/__tests__/tier-badge.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TierBadge } from '../components/tier-badge';

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const iso = (d: Date) => d.toISOString();

describe('TierBadge', () => {
  it('renders all 5 tier labels correctly', () => {
    const tiers = ['nano', 'micro', 'mid', 'macro', 'mega'] as const;
    for (const t of tiers) {
      const { container, unmount } = render(
        <TierBadge tier={t} commissionRate={0.15} contractEndDate={iso(addDays(new Date(), 90))} />,
      );
      expect(container.textContent?.toLowerCase()).toContain(t);
      unmount();
    }
  });

  it('renders commissionRate as percent (e.g. 0.15 → 15%)', () => {
    render(<TierBadge tier="nano" commissionRate={0.15} contractEndDate={iso(addDays(new Date(), 90))} />);
    expect(screen.getByText(/15%/)).toBeInTheDocument();
  });

  it('expiry <30d adds yellow class; <7d adds red class', () => {
    const { container: yellow, unmount: u1 } = render(
      <TierBadge tier="nano" commissionRate={0.15} contractEndDate={iso(addDays(new Date(), 20))} />,
    );
    expect(yellow.innerHTML).toMatch(/yellow/);
    u1();

    const { container: red } = render(
      <TierBadge tier="nano" commissionRate={0.15} contractEndDate={iso(addDays(new Date(), 5))} />,
    );
    expect(red.innerHTML).toMatch(/red/);
  });

  it('expiry >30d renders neutral (no yellow/red class)', () => {
    const { container } = render(
      <TierBadge tier="nano" commissionRate={0.15} contractEndDate={iso(addDays(new Date(), 120))} />,
    );
    expect(container.innerHTML).not.toMatch(/yellow|red/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from repo root: `npx vitest run apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/tier-badge.test.tsx`

Expected: FAIL — module `../components/tier-badge` does not exist.

- [ ] **Step 3: Write implementation**

Create `apps/app/src/app/(app)/settings/affiliate/components/tier-badge.tsx`:

```tsx
import type { AffiliateTier } from '@tn-figueiredo/affiliate';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/formatters';
import { strings } from './strings';

interface Props {
  tier: AffiliateTier;
  commissionRate: number;
  contractEndDate: string;
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.floor(ms / 86_400_000);
}

export function TierBadge({ tier, commissionRate, contractEndDate }: Props) {
  const days = daysUntil(contractEndDate);
  const expiryColor =
    days <= 7 ? 'text-red-600 bg-red-50 border-red-200'
    : days <= 30 ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
    : 'text-muted-foreground border-border';

  const pct = `${Math.round(commissionRate * 100)}%`;

  return (
    <div className="flex items-center gap-3">
      <Badge variant="secondary">{strings.tier[tier]}</Badge>
      <span className="text-sm font-medium">{pct}</span>
      <span className={`text-xs px-2 py-0.5 rounded border ${expiryColor}`}>
        até {formatDate(contractEndDate)}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from repo root: `npx vitest run apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/tier-badge.test.tsx`

Expected: 4 tests pass.

## Task 10: `ReferralLinkCard` component + test

**Files:**
- Create: `apps/app/src/app/(app)/settings/affiliate/__tests__/referral-link-card.test.tsx`
- Create: `apps/app/src/app/(app)/settings/affiliate/components/referral-link-card.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/app/src/app/(app)/settings/affiliate/__tests__/referral-link-card.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReferralLinkCard } from '../components/referral-link-card';

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

describe('ReferralLinkCard', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://app.brighttale.io' },
      writable: true,
    });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    (window as any).posthog = { capture: vi.fn() };
  });

  it('copy signup link writes the expected URL', async () => {
    render(<ReferralLinkCard code="ABC" tier="nano" />);
    const btn = screen.getByRole('button', { name: /Copiar link de cadastro/ });
    fireEvent.click(btn);
    await new Promise(r => setTimeout(r, 0));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://brighttale.io/signup?ref=ABC');
  });

  it('copy homepage link writes root URL', async () => {
    render(<ReferralLinkCard code="ABC" tier="nano" />);
    fireEvent.click(screen.getByRole('button', { name: /Copiar link da página inicial/ }));
    await new Promise(r => setTimeout(r, 0));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://brighttale.io/?ref=ABC');
  });

  it('PostHog capture fires with variant=signup and tier/code props', async () => {
    render(<ReferralLinkCard code="XYZ" tier="micro" />);
    fireEvent.click(screen.getByRole('button', { name: /Copiar link de cadastro/ }));
    await new Promise(r => setTimeout(r, 0));
    expect((window as any).posthog.capture).toHaveBeenCalledWith('affiliate_link_copied', {
      variant: 'signup',
      tier: 'micro',
      code: 'XYZ',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from repo root: `npx vitest run apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/referral-link-card.test.tsx`

Expected: FAIL — module missing.

- [ ] **Step 3: Write implementation**

Create `apps/app/src/app/(app)/settings/affiliate/components/referral-link-card.tsx`:

```tsx
'use client';

import { toast } from 'sonner';
import type { AffiliateTier } from '@tn-figueiredo/affiliate';
import { Button } from '@/components/ui/button';
import { strings } from './strings';

interface Props {
  code: string;
  tier: AffiliateTier;
}

function resolveWebOrigin(): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  if (origin.includes('://app.')) return origin.replace('://app.', '://');
  return process.env.NEXT_PUBLIC_MARKETING_URL ?? 'http://localhost:3002';
}

export function ReferralLinkCard({ code, tier }: Props) {
  const origin = resolveWebOrigin();
  const signupUrl = `${origin}/signup?ref=${encodeURIComponent(code)}`;
  const homeUrl = `${origin}/?ref=${encodeURIComponent(code)}`;

  const copy = async (variant: 'signup' | 'homepage', url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success(strings.referral.copied);
    (window as unknown as { posthog?: { capture: (ev: string, props: object) => void } })
      .posthog?.capture('affiliate_link_copied', { variant, tier, code });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded bg-muted px-3 py-2 text-sm">{signupUrl}</code>
        <Button onClick={() => copy('signup', signupUrl)}>
          {strings.referral.copy_signup}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded bg-muted px-3 py-2 text-sm">{homeUrl}</code>
        <Button variant="outline" onClick={() => copy('homepage', homeUrl)}>
          {strings.referral.copy_homepage}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from repo root: `npx vitest run apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/referral-link-card.test.tsx`

Expected: 3 tests pass.

## Task 11: `StatsGrid` + `ClicksByPlatform` + `RecentReferrals` (no dedicated tests — exercised via AffiliateClient)

**Files:**
- Create: `apps/app/src/app/(app)/settings/affiliate/components/stats-grid.tsx`
- Create: `apps/app/src/app/(app)/settings/affiliate/components/clicks-by-platform.tsx`
- Create: `apps/app/src/app/(app)/settings/affiliate/components/recent-referrals.tsx`

- [ ] **Step 1: Write `stats-grid.tsx`**

Create `apps/app/src/app/(app)/settings/affiliate/components/stats-grid.tsx`:

```tsx
import type { AffiliateStats } from '@tn-figueiredo/affiliate';
import { formatBrl } from '@/lib/formatters';
import { strings } from './strings';

interface Props { stats: AffiliateStats | null }

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export function StatsGrid({ stats }: Props) {
  if (!stats) {
    return <div className="text-sm text-muted-foreground">—</div>;
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Card label={strings.stats.clicks} value={stats.totalClicks} />
      <Card label={strings.stats.referrals} value={stats.totalReferrals} />
      <Card label={strings.stats.conversions} value={stats.totalConversions} />
      <Card label={strings.stats.pending} value={formatBrl(stats.pendingPayoutBrl)} />
      <Card label={strings.stats.paid} value={formatBrl(stats.paidPayoutBrl)} />
    </div>
  );
}
```

- [ ] **Step 2: Write `clicks-by-platform.tsx`**

Create `apps/app/src/app/(app)/settings/affiliate/components/clicks-by-platform.tsx`:

```tsx
import type { ClickByPlatform } from '@/lib/affiliate-api';
import { strings } from './strings';

interface Props { items: ClickByPlatform[] }

export function ClicksByPlatform({ items }: Props) {
  if (items.length === 0) return null; // hides when empty per spec §2
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{strings.clicks_by_platform.section_title}</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr><th>Plataforma</th><th>Cliques</th><th>Conversões</th></tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.sourcePlatform} className="border-t">
              <td className="py-2">{r.sourcePlatform}</td>
              <td className="py-2">{r.clicks}</td>
              <td className="py-2">{r.conversions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 3: Write `recent-referrals.tsx`**

Create `apps/app/src/app/(app)/settings/affiliate/components/recent-referrals.tsx`:

```tsx
import type { AffiliateReferral } from '@tn-figueiredo/affiliate';
import { formatDate } from '@/lib/formatters';
import { strings } from './strings';

interface Props { items: AffiliateReferral[] }

export function RecentReferrals({ items }: Props) {
  const latest = items.slice(0, 10);
  if (latest.length === 0) {
    return (
      <section className="space-y-2">
        <h3 className="font-medium">{strings.referrals.section_title}</h3>
        <p className="text-sm text-muted-foreground">{strings.referrals.empty}</p>
      </section>
    );
  }
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{strings.referrals.section_title}</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr><th>Data</th><th>Status</th><th>Conversão</th></tr>
        </thead>
        <tbody>
          {latest.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-2">{formatDate(r.firstTouchAt)}</td>
              <td className="py-2">{r.status}</td>
              <td className="py-2">{r.conversionAt ? formatDate(r.conversionAt) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 4: Typecheck**

Run from repo root: `npm run typecheck`

Expected: 4 workspaces green.

## Task 12: `CommissionHistory` component + test (client pagination 20/page)

**Files:**
- Create: `apps/app/src/app/(app)/settings/affiliate/__tests__/commission-history.test.tsx`
- Create: `apps/app/src/app/(app)/settings/affiliate/components/commission-history.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/app/src/app/(app)/settings/affiliate/__tests__/commission-history.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommissionHistory } from '../components/commission-history';

const makeRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    amountBrl: 100 + i,
    status: i % 3 === 0 ? 'paid' : i % 3 === 1 ? 'pending' : 'cancelled',
    isRetroactive: i % 5 === 0,
    createdAt: new Date(2026, 0, (i % 28) + 1).toISOString(),
  })) as any;

describe('CommissionHistory', () => {
  it('paginates at 20 per page', () => {
    render(<CommissionHistory items={makeRows(45)} />);
    expect(screen.getAllByRole('row').length - 1).toBe(20); // minus header
    fireEvent.click(screen.getByRole('button', { name: /próxima/i }));
    expect(screen.getAllByRole('row').length - 1).toBe(20);
    fireEvent.click(screen.getByRole('button', { name: /próxima/i }));
    expect(screen.getAllByRole('row').length - 1).toBe(5);
  });

  it('status pills map colors per {pending, paid, cancelled}', () => {
    const { container } = render(<CommissionHistory items={makeRows(3)} />);
    const html = container.innerHTML;
    expect(html).toMatch(/green|paid/);
    expect(html).toMatch(/yellow|pending/);
    expect(html).toMatch(/red|cancel/);
  });

  it('retroactive rows display retroactive badge', () => {
    render(<CommissionHistory items={makeRows(1)} />); // i=0 → retroactive=true
    expect(screen.getByText(/Retroativo/)).toBeInTheDocument();
  });

  it('empty list shows empty state copy', () => {
    render(<CommissionHistory items={[]} />);
    expect(screen.getByText(/Nenhuma comissão/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from repo root: `npx vitest run apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/commission-history.test.tsx`

Expected: FAIL — module missing.

- [ ] **Step 3: Write implementation**

Create `apps/app/src/app/(app)/settings/affiliate/components/commission-history.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { AffiliateCommission } from '@tn-figueiredo/affiliate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatBrl, formatDate } from '@/lib/formatters';
import { strings } from './strings';

interface Props { items: AffiliateCommission[] }

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  paid: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

const PAGE = 20;

export function CommissionHistory({ items }: Props) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE));
  const start = page * PAGE;
  const view = items.slice(start, start + PAGE);

  if (items.length === 0) {
    return (
      <section className="space-y-2">
        <h3 className="font-medium">{strings.commissions.section_title}</h3>
        <p className="text-sm text-muted-foreground">{strings.commissions.empty}</p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="font-medium">{strings.commissions.section_title}</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr><th>Data</th><th>Valor</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {view.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="py-2">{formatDate(c.createdAt)}</td>
              <td className="py-2">{formatBrl(c.amountBrl ?? (c as any).totalBrl ?? 0)}</td>
              <td className="py-2">
                <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_CLASS[c.status] ?? ''}`}>
                  {strings.commissions.status[c.status as keyof typeof strings.commissions.status] ?? c.status}
                </span>
              </td>
              <td className="py-2">
                {c.isRetroactive && <Badge variant="outline">{strings.commissions.retroactive_badge}</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span>{page + 1} / {totalPages}</span>
          <Button variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from repo root: `npx vitest run apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/commission-history.test.tsx`

Expected: 4 tests pass.

## Task 13: `ContractProposal` component + test (accept/reject)

**Files:**
- Create: `apps/app/src/app/(app)/settings/affiliate/__tests__/contract-proposal.test.tsx`
- Modify: `apps/app/src/app/(app)/settings/affiliate/components/contract-proposal.tsx` (fully replace stub from Task 8)

- [ ] **Step 1: Write failing test**

Create `apps/app/src/app/(app)/settings/affiliate/__tests__/contract-proposal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContractProposal } from '../components/contract-proposal';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/affiliate-api', () => ({
  AffiliateApiError: class extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
  affiliateApi: {
    acceptProposal: vi.fn().mockResolvedValue({}),
    rejectProposal: vi.fn().mockResolvedValue(undefined),
  },
}));
import { affiliateApi, AffiliateApiError } from '@/lib/affiliate-api';

const initialMe = {
  id: 'a', tier: null, commissionRate: null,
  proposedTier: 'nano', proposedCommissionRate: 0.15, proposedFixedFeeBrl: 0,
} as any;

const renewalMe = {
  id: 'a', tier: 'nano', commissionRate: 0.15,
  proposedTier: 'micro', proposedCommissionRate: 0.2, proposedFixedFeeBrl: 50,
} as any;

describe('ContractProposal', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('initial-contract view shows proposed tier and commission', () => {
    render(<ContractProposal me={initialMe} onResolved={vi.fn()} />);
    expect(screen.getByText(/Nano/)).toBeInTheDocument();
    expect(screen.getByText(/15%/)).toBeInTheDocument();
  });

  it('renewal view shows diff (current → proposed)', () => {
    render(<ContractProposal me={renewalMe} onResolved={vi.fn()} />);
    expect(screen.getByText(/Nano/)).toBeInTheDocument();
    expect(screen.getByText(/Micro/)).toBeInTheDocument();
    expect(screen.getByText(/15%/)).toBeInTheDocument();
    expect(screen.getByText(/20%/)).toBeInTheDocument();
  });

  it('accept calls acceptProposal and onResolved', async () => {
    const onResolved = vi.fn();
    render(<ContractProposal me={initialMe} onResolved={onResolved} />);
    fireEvent.click(screen.getByRole('button', { name: /Aceitar proposta/ }));
    await waitFor(() => expect(affiliateApi.acceptProposal).toHaveBeenCalled());
    expect(onResolved).toHaveBeenCalled();
  });

  it('reject triggers confirm; confirming calls rejectProposal', async () => {
    const onResolved = vi.fn();
    render(<ContractProposal me={initialMe} onResolved={onResolved} />);
    fireEvent.click(screen.getByRole('button', { name: /^Rejeitar$/ }));
    const confirm = await screen.findByRole('button', { name: /^Confirmar$/ });
    fireEvent.click(confirm);
    await waitFor(() => expect(affiliateApi.rejectProposal).toHaveBeenCalled());
    expect(onResolved).toHaveBeenCalled();
  });

  it('LGPD consent text is rendered', () => {
    render(<ContractProposal me={initialMe} onResolved={vi.fn()} />);
    expect(screen.getByText(/LGPD/i)).toBeInTheDocument();
  });

  it('accept failure toast fires on AffiliateApiError', async () => {
    const { toast } = await import('sonner');
    vi.mocked(affiliateApi.acceptProposal).mockRejectedValueOnce(new AffiliateApiError(409, 'CONFLICT', 'already accepted'));
    render(<ContractProposal me={initialMe} onResolved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Aceitar proposta/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('already accepted'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from repo root: `npx vitest run apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/contract-proposal.test.tsx`

Expected: FAIL — current stub does not render the expected text / buttons.

- [ ] **Step 3: Replace `contract-proposal.tsx`**

Replace the full contents of `apps/app/src/app/(app)/settings/affiliate/components/contract-proposal.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { Affiliate } from '@tn-figueiredo/affiliate';
import { affiliateApi, AffiliateApiError } from '@/lib/affiliate-api';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { strings } from './strings';

interface Props {
  me: Affiliate;
  onResolved: () => Promise<void> | void;
}

function pct(rate: number | null | undefined): string {
  if (rate == null) return '—';
  return `${Math.round(rate * 100)}%`;
}

export function ContractProposal({ me, onResolved }: Props) {
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const isRenewal = me.tier != null;

  const handleAccept = async () => {
    setBusy('accept');
    try {
      const lgpd =
        typeof window !== 'undefined'
          ? { ip: '', ua: window.navigator.userAgent }
          : undefined;
      await affiliateApi.acceptProposal(lgpd);
      (window as unknown as { posthog?: { capture: (ev: string, p: object) => void } }).posthog?.capture(
        'affiliate_proposal_accepted',
        { tier: me.proposedTier, commissionRate: me.proposedCommissionRate, contractVersion: me.contractVersion },
      );
      await onResolved();
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    setBusy('reject');
    try {
      await affiliateApi.rejectProposal();
      await onResolved();
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4" data-testid="contract-proposal">
      <h1 className="text-2xl font-semibold">{strings.state.proposal.title}</h1>
      <dl className="grid grid-cols-2 gap-3 rounded-lg border p-4">
        {isRenewal && (
          <>
            <dt className="text-muted-foreground">Tier atual</dt>
            <dd>{me.tier ? strings.tier[me.tier] : '—'} — {pct(me.commissionRate)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{isRenewal ? 'Tier proposto' : 'Tier'}</dt>
        <dd>{me.proposedTier ? strings.tier[me.proposedTier] : '—'} — {pct(me.proposedCommissionRate)}</dd>
      </dl>
      <p className="text-xs text-muted-foreground">{strings.state.proposal.lgpd_consent}</p>
      <div className="flex gap-2">
        <Button disabled={busy !== null} onClick={handleAccept}>
          {strings.state.proposal.accept}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={busy !== null}>
              {strings.state.proposal.reject}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rejeitar proposta?</AlertDialogTitle>
              <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleReject}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from repo root: `npx vitest run apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/contract-proposal.test.tsx`

Expected: 6 tests pass.

## Task 14: `PixKeyManager` component + test

**Files:**
- Create: `apps/app/src/app/(app)/settings/affiliate/__tests__/pix-key-manager.test.tsx`
- Create: `apps/app/src/app/(app)/settings/affiliate/components/pix-key-manager.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/app/src/app/(app)/settings/affiliate/__tests__/pix-key-manager.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PixKeyManager } from '../components/pix-key-manager';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/affiliate-api', () => ({
  AffiliateApiError: class extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
  affiliateApi: {
    addPixKey: vi.fn(),
    setDefaultPixKey: vi.fn().mockResolvedValue(undefined),
    deletePixKey: vi.fn().mockResolvedValue(undefined),
  },
}));
import { affiliateApi, AffiliateApiError } from '@/lib/affiliate-api';

const keys = [
  { id: 'k1', keyType: 'cpf', keyDisplay: '***.***.123-45', isDefault: true },
  { id: 'k2', keyType: 'email', keyDisplay: 'p***@x.com', isDefault: false },
] as any;

describe('PixKeyManager', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('lists keys with default badge on the default one', () => {
    render(<PixKeyManager pixKeys={keys} readOnly={false} onChange={vi.fn()} />);
    expect(screen.getByText('***.***.123-45')).toBeInTheDocument();
    expect(screen.getByText(/Padrão/)).toBeInTheDocument();
  });

  it('add happy path calls addPixKey with correct payload and fires onChange', async () => {
    vi.mocked(affiliateApi.addPixKey).mockResolvedValueOnce({} as any);
    const onChange = vi.fn();
    render(<PixKeyManager pixKeys={keys} readOnly={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar chave PIX/ }));
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: 'email' } });
    fireEvent.change(screen.getByLabelText(/Chave/), { target: { value: 'new@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));
    await waitFor(() =>
      expect(affiliateApi.addPixKey).toHaveBeenCalledWith(
        expect.objectContaining({ keyType: 'email', keyValue: 'new@x.com' }),
      ),
    );
    expect(onChange).toHaveBeenCalled();
  });

  it('invalid CPF blocks submit (no API call)', async () => {
    render(<PixKeyManager pixKeys={keys} readOnly={false} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar chave PIX/ }));
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: 'cpf' } });
    fireEvent.change(screen.getByLabelText(/Chave/), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));
    await waitFor(() => expect(screen.getByText(/CPF inválido/)).toBeInTheDocument());
    expect(affiliateApi.addPixKey).not.toHaveBeenCalled();
  });

  it('invalid email blocks submit', async () => {
    render(<PixKeyManager pixKeys={keys} readOnly={false} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar chave PIX/ }));
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: 'email' } });
    fireEvent.change(screen.getByLabelText(/Chave/), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));
    await waitFor(() => expect(screen.getByText(/E-mail inválido/)).toBeInTheDocument());
    expect(affiliateApi.addPixKey).not.toHaveBeenCalled();
  });

  it('409 duplicate surfaces toast with server message', async () => {
    const { toast } = await import('sonner');
    vi.mocked(affiliateApi.addPixKey).mockRejectedValueOnce(new AffiliateApiError(409, 'CONFLICT', 'duplicate key'));
    render(<PixKeyManager pixKeys={keys} readOnly={false} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar chave PIX/ }));
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: 'email' } });
    fireEvent.change(screen.getByLabelText(/Chave/), { target: { value: 'x@y.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('duplicate key'));
  });

  it('setDefault click calls API + onChange', async () => {
    const onChange = vi.fn();
    render(<PixKeyManager pixKeys={keys} readOnly={false} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Definir como padrão/ })[0]);
    await waitFor(() => expect(affiliateApi.setDefaultPixKey).toHaveBeenCalledWith('k2'));
    expect(onChange).toHaveBeenCalled();
  });

  it('delete default key blocked when others exist', () => {
    render(<PixKeyManager pixKeys={keys} readOnly={false} onChange={vi.fn()} />);
    const row = screen.getByText('***.***.123-45').closest('tr')!;
    const removeBtn = row.querySelector('button[data-action="remove"]') as HTMLButtonElement;
    expect(removeBtn.disabled).toBe(true);
  });

  it('delete non-default key opens confirm and calls API on confirm', async () => {
    const onChange = vi.fn();
    render(<PixKeyManager pixKeys={keys} readOnly={false} onChange={onChange} />);
    const row = screen.getByText('p***@x.com').closest('tr')!;
    const removeBtn = row.querySelector('button[data-action="remove"]') as HTMLButtonElement;
    fireEvent.click(removeBtn);
    const confirm = await screen.findByRole('button', { name: /^Confirmar$/ });
    fireEvent.click(confirm);
    await waitFor(() => expect(affiliateApi.deletePixKey).toHaveBeenCalledWith('k2'));
    expect(onChange).toHaveBeenCalled();
  });

  it('empty list shows add CTA only (no table)', () => {
    render(<PixKeyManager pixKeys={[]} readOnly={false} onChange={vi.fn()} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: /Adicionar chave PIX/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from repo root: `npx vitest run apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/pix-key-manager.test.tsx`

Expected: FAIL — module missing.

- [ ] **Step 3: Write implementation**

Create `apps/app/src/app/(app)/settings/affiliate/components/pix-key-manager.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { AffiliatePixKey, AffiliatePixKeyType } from '@tn-figueiredo/affiliate';
import { affiliateApi, AffiliateApiError, type AddPixKeyInput } from '@/lib/affiliate-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { strings } from './strings';

interface Props {
  pixKeys: AffiliatePixKey[];
  readOnly: boolean;
  onChange: () => Promise<void> | void;
}

const VALIDATORS: Record<AffiliatePixKeyType, (v: string) => boolean> = {
  cpf: (v) => /^\d{11}$/.test(v.replace(/[.\-]/g, '')),
  cnpj: (v) => /^\d{14}$/.test(v.replace(/[.\-/]/g, '')),
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  phone: (v) => /^\+?\d{10,13}$/.test(v.replace(/\s/g, '')),
  random: (v) => /^[A-Za-z0-9-]{32,36}$/.test(v),
};

const INVALID_MSG: Record<AffiliatePixKeyType, string> = {
  cpf: strings.pix.invalid.cpf,
  cnpj: strings.pix.invalid.cnpj,
  email: strings.pix.invalid.email,
  phone: strings.pix.invalid.phone,
  random: strings.pix.invalid.random,
};

export function PixKeyManager({ pixKeys, readOnly, onChange }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<AddPixKeyInput>({ keyType: 'email', keyValue: '' });
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const hasOthers = pixKeys.length > 1;

  const submit = async () => {
    setError(null);
    if (!VALIDATORS[form.keyType](form.keyValue)) {
      setError(INVALID_MSG[form.keyType]);
      return;
    }
    try {
      await affiliateApi.addPixKey(form);
      setAddOpen(false);
      setForm({ keyType: 'email', keyValue: '' });
      await onChange();
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    }
  };

  const setDefault = async (id: string) => {
    setBusyId(id);
    try {
      await affiliateApi.setDefaultPixKey(id);
      await onChange();
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    try {
      await affiliateApi.deletePixKey(id);
      await onChange();
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{strings.pix.section_title}</h3>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button disabled={readOnly}>{strings.pix.add}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{strings.pix.add}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <label className="block text-sm">
                <span>Tipo</span>
                <select
                  className="mt-1 block w-full rounded border px-2 py-1"
                  value={form.keyType}
                  onChange={(e) => setForm({ ...form, keyType: e.target.value as AffiliatePixKeyType })}
                  aria-label="Tipo"
                >
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                  <option value="email">E-mail</option>
                  <option value="phone">Telefone</option>
                  <option value="random">Aleatória</option>
                </select>
              </label>
              <label className="block text-sm">
                <span>Chave</span>
                <input
                  className="mt-1 block w-full rounded border px-2 py-1"
                  value={form.keyValue}
                  onChange={(e) => setForm({ ...form, keyValue: e.target.value })}
                  aria-label="Chave"
                />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
              <Button onClick={submit}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {pixKeys.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr><th>Tipo</th><th>Chave</th><th></th><th></th></tr>
          </thead>
          <tbody>
            {pixKeys.map((k) => (
              <tr key={k.id} className="border-t">
                <td className="py-2">{k.keyType}</td>
                <td className="py-2">{k.keyDisplay}</td>
                <td className="py-2">
                  {k.isDefault ? (
                    <Badge>{strings.pix.default_badge}</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={readOnly || busyId === k.id}
                      onClick={() => setDefault(k.id)}
                    >
                      {strings.pix.set_default}
                    </Button>
                  )}
                </td>
                <td className="py-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        data-action="remove"
                        disabled={readOnly || (k.isDefault && hasOthers)}
                      >
                        {strings.pix.delete}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{strings.pix.confirm_delete_title}</AlertDialogTitle>
                        <AlertDialogDescription>{strings.pix.confirm_delete_body}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove(k.id)}>Confirmar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from repo root: `npx vitest run apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/pix-key-manager.test.tsx`

Expected: 9 tests pass.

## Task 15: `PayoutSection` component + test

**Files:**
- Create: `apps/app/src/app/(app)/settings/affiliate/__tests__/payout-section.test.tsx`
- Create: `apps/app/src/app/(app)/settings/affiliate/components/payout-section.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/app/src/app/(app)/settings/affiliate/__tests__/payout-section.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PayoutSection } from '../components/payout-section';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/affiliate-api', () => ({
  AffiliateApiError: class extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
  affiliateApi: { requestPayout: vi.fn() },
}));
import { affiliateApi, AffiliateApiError } from '@/lib/affiliate-api';

const defaultPix = { id: 'k1', keyDisplay: 'j***@x.com', isDefault: true } as any;

describe('PayoutSection', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('button disabled under minimum (R$50)', () => {
    render(<PayoutSection pendingPayoutBrl={10} defaultPixKey={defaultPix} readOnly={false} onMutate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Solicitar pagamento/ })).toBeDisabled();
  });

  it('button disabled when no default PIX key', () => {
    render(<PayoutSection pendingPayoutBrl={100} defaultPixKey={null} readOnly={false} onMutate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Solicitar pagamento/ })).toBeDisabled();
  });

  it('button disabled in readOnly mode', () => {
    render(<PayoutSection pendingPayoutBrl={100} defaultPixKey={defaultPix} readOnly={true} onMutate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Solicitar pagamento/ })).toBeDisabled();
  });

  it('confirm dialog shows amount and pix display', async () => {
    render(<PayoutSection pendingPayoutBrl={123} defaultPixKey={defaultPix} readOnly={false} onMutate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Solicitar pagamento/ }));
    expect(await screen.findByText(/123/)).toBeInTheDocument();
    expect(screen.getByText(/j\*\*\*@x.com/)).toBeInTheDocument();
  });

  it('successful request fires toast + onMutate + posthog', async () => {
    vi.mocked(affiliateApi.requestPayout).mockResolvedValueOnce({} as any);
    (window as any).posthog = { capture: vi.fn() };
    const onMutate = vi.fn();
    const { toast } = await import('sonner');
    render(<PayoutSection pendingPayoutBrl={100} defaultPixKey={defaultPix} readOnly={false} onMutate={onMutate} />);
    fireEvent.click(screen.getByRole('button', { name: /Solicitar pagamento/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Solicitar$/ }));
    await waitFor(() => expect(affiliateApi.requestPayout).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalled();
    expect(onMutate).toHaveBeenCalled();
    expect((window as any).posthog.capture).toHaveBeenCalledWith('affiliate_payout_requested', { amountBrl: 100, tier: undefined });
  });

  it('tax-ID-irregular (422 + specific code) shows dedicated message', async () => {
    const { toast } = await import('sonner');
    vi.mocked(affiliateApi.requestPayout).mockRejectedValueOnce(
      new AffiliateApiError(422, 'VALIDATION', 'AffiliatePayoutTaxIdIrregularError'),
    );
    render(<PayoutSection pendingPayoutBrl={100} defaultPixKey={defaultPix} readOnly={false} onMutate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Solicitar pagamento/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Solicitar$/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('CPF/CNPJ')),
    );
  });

  it('generic 500 error surfaces package message verbatim', async () => {
    const { toast } = await import('sonner');
    vi.mocked(affiliateApi.requestPayout).mockRejectedValueOnce(
      new AffiliateApiError(500, 'UNKNOWN', 'oops'),
    );
    render(<PayoutSection pendingPayoutBrl={100} defaultPixKey={defaultPix} readOnly={false} onMutate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Solicitar pagamento/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Solicitar$/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('oops'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from repo root: `npx vitest run apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/payout-section.test.tsx`

Expected: FAIL — module missing.

- [ ] **Step 3: Write implementation**

Create `apps/app/src/app/(app)/settings/affiliate/components/payout-section.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { AffiliatePixKey, AffiliateTier } from '@tn-figueiredo/affiliate';
import { affiliateApi, AffiliateApiError } from '@/lib/affiliate-api';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatBrl } from '@/lib/formatters';
import { strings } from './strings';

interface Props {
  pendingPayoutBrl: number;
  defaultPixKey: AffiliatePixKey | null;
  readOnly: boolean;
  onMutate: () => Promise<void> | void;
  tier?: AffiliateTier;
}

const MIN_PAYOUT_BRL = 50;

export function PayoutSection({ pendingPayoutBrl, defaultPixKey, readOnly, onMutate, tier }: Props) {
  const [busy, setBusy] = useState(false);

  const belowMin = pendingPayoutBrl < MIN_PAYOUT_BRL;
  const noDefault = defaultPixKey == null;
  const disabled = readOnly || belowMin || noDefault || busy;

  const tooltip =
    noDefault ? strings.payout.no_default_tooltip
    : belowMin ? strings.payout.min_tooltip(formatBrl(MIN_PAYOUT_BRL))
    : null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await affiliateApi.requestPayout();
      toast.success(strings.payout.success);
      (window as unknown as { posthog?: { capture: (ev: string, p: object) => void } }).posthog?.capture(
        'affiliate_payout_requested',
        { amountBrl: pendingPayoutBrl, tier },
      );
      await onMutate();
    } catch (err) {
      if (err instanceof AffiliateApiError && err.message.includes('TaxIdIrregular')) {
        toast.error(strings.payout.tax_id_irregular);
      } else {
        toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="font-medium">{strings.payout.section_title}</h3>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={disabled} title={tooltip ?? undefined}>
            {strings.payout.request}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.payout.confirm_title}</AlertDialogTitle>
            <AlertDialogDescription>
              {strings.payout.confirm_body(formatBrl(pendingPayoutBrl), defaultPixKey?.keyDisplay ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.payout.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>{strings.payout.proceed}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {tooltip && <p className="text-xs text-muted-foreground">{tooltip}</p>}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from repo root: `npx vitest run apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/payout-section.test.tsx`

Expected: 7 tests pass.

## Task 16: `ContentSubmissions` component + test

**Files:**
- Create: `apps/app/src/app/(app)/settings/affiliate/__tests__/content-submissions.test.tsx`
- Create: `apps/app/src/app/(app)/settings/affiliate/components/content-submissions.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/app/src/app/(app)/settings/affiliate/__tests__/content-submissions.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContentSubmissions } from '../components/content-submissions';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/affiliate-api', () => ({
  AffiliateApiError: class extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
  affiliateApi: { submitContent: vi.fn() },
}));
import { affiliateApi } from '@/lib/affiliate-api';

const subs = [
  { id: 's1', url: 'https://youtube.com/x', platform: 'youtube', contentType: 'video', status: 'approved' },
  { id: 's2', url: 'https://instagram.com/x', platform: 'instagram', contentType: 'post', status: 'pending' },
  { id: 's3', url: 'https://x.com/x/rejected', platform: 'twitter', contentType: 'post', status: 'rejected' },
] as any;

describe('ContentSubmissions', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('lists items with platform labels', () => {
    render(<ContentSubmissions submissions={subs} readOnly={false} onChange={vi.fn()} />);
    expect(screen.getByText(/youtube/i)).toBeInTheDocument();
    expect(screen.getByText(/instagram/i)).toBeInTheDocument();
  });

  it('renders status styling per approved/pending/rejected', () => {
    const { container } = render(<ContentSubmissions submissions={subs} readOnly={false} onChange={vi.fn()} />);
    expect(container.innerHTML).toMatch(/green|approved/);
    expect(container.innerHTML).toMatch(/yellow|pending/);
    expect(container.innerHTML).toMatch(/red|reject/);
  });

  it('submit happy path calls API', async () => {
    vi.mocked(affiliateApi.submitContent).mockResolvedValueOnce({} as any);
    const onChange = vi.fn();
    render(<ContentSubmissions submissions={subs} readOnly={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Enviar conteúdo/ }));
    fireEvent.change(screen.getByLabelText(/URL/), { target: { value: 'https://tiktok.com/@me/v/1' } });
    fireEvent.change(screen.getByLabelText(/Plataforma/), { target: { value: 'tiktok' } });
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: 'video' } });
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));
    await waitFor(() =>
      expect(affiliateApi.submitContent).toHaveBeenCalledWith(expect.objectContaining({
        url: 'https://tiktok.com/@me/v/1', platform: 'tiktok', contentType: 'video',
      })),
    );
    expect(onChange).toHaveBeenCalled();
  });

  it('invalid URL blocks submit', async () => {
    render(<ContentSubmissions submissions={subs} readOnly={false} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Enviar conteúdo/ }));
    fireEvent.change(screen.getByLabelText(/URL/), { target: { value: 'not a url' } });
    fireEvent.change(screen.getByLabelText(/Plataforma/), { target: { value: 'tiktok' } });
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: 'video' } });
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));
    await waitFor(() => expect(screen.getByText(/URL inválida/)).toBeInTheDocument());
    expect(affiliateApi.submitContent).not.toHaveBeenCalled();
  });

  it('empty list still shows submit CTA', () => {
    render(<ContentSubmissions submissions={[]} readOnly={false} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Enviar conteúdo/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from repo root: `npx vitest run apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/content-submissions.test.tsx`

Expected: FAIL — module missing.

- [ ] **Step 3: Write implementation**

Create `apps/app/src/app/(app)/settings/affiliate/components/content-submissions.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type {
  AffiliateContentSubmission, ContentSubmissionPlatform, ContentSubmissionType,
} from '@tn-figueiredo/affiliate';
import { affiliateApi, AffiliateApiError, type SubmitContentInput } from '@/lib/affiliate-api';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { strings } from './strings';

interface Props {
  submissions: AffiliateContentSubmission[];
  readOnly: boolean;
  onChange: () => Promise<void> | void;
}

const STATUS_CLASS: Record<string, string> = {
  approved: 'bg-green-50 text-green-700 border-green-200',
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

const PLATFORMS: ContentSubmissionPlatform[] = [
  'youtube', 'instagram', 'tiktok', 'twitter', 'linkedin', 'web', 'other',
] as any;
const CONTENT_TYPES: ContentSubmissionType[] = [
  'video', 'post', 'story', 'reel', 'short', 'article',
] as any;

function isValidUrl(v: string): boolean {
  try { new URL(v); return true; } catch { return false; }
}

export function ContentSubmissions({ submissions, readOnly, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SubmitContentInput>({
    url: '', platform: 'youtube' as ContentSubmissionPlatform, contentType: 'video' as ContentSubmissionType,
  });
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!isValidUrl(form.url)) {
      setError(strings.content.invalid_url);
      return;
    }
    try {
      await affiliateApi.submitContent(form);
      (window as unknown as { posthog?: { capture: (ev: string, p: object) => void } }).posthog?.capture(
        'affiliate_content_submitted',
        { platform: form.platform, contentType: form.contentType },
      );
      setOpen(false);
      setForm({ url: '', platform: 'youtube' as ContentSubmissionPlatform, contentType: 'video' as ContentSubmissionType });
      toast.success(strings.content.submit_success);
      await onChange();
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{strings.content.section_title}</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={readOnly}>{strings.content.submit}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{strings.content.submit}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <label className="block text-sm">
                <span>URL</span>
                <input
                  className="mt-1 block w-full rounded border px-2 py-1"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  aria-label="URL"
                />
              </label>
              <label className="block text-sm">
                <span>Plataforma</span>
                <select
                  className="mt-1 block w-full rounded border px-2 py-1"
                  value={form.platform}
                  onChange={(e) => setForm({ ...form, platform: e.target.value as ContentSubmissionPlatform })}
                  aria-label="Plataforma"
                >
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span>Tipo</span>
                <select
                  className="mt-1 block w-full rounded border px-2 py-1"
                  value={form.contentType}
                  onChange={(e) => setForm({ ...form, contentType: e.target.value as ContentSubmissionType })}
                  aria-label="Tipo"
                >
                  {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
              <Button onClick={submit}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {submissions.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr><th>Plataforma</th><th>Tipo</th><th>URL</th><th>Status</th></tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="py-2">{s.platform}</td>
                <td className="py-2">{s.contentType}</td>
                <td className="py-2 truncate max-w-xs">
                  <a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.url}</a>
                </td>
                <td className="py-2">
                  <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_CLASS[s.status] ?? ''}`}>
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from repo root: `npx vitest run apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/content-submissions.test.tsx`

Expected: 5 tests pass.

## Task 17: Flesh out `Dashboard` composition and rewrite `page.tsx` + apply stub

**Files:**
- Modify: `apps/app/src/app/(app)/settings/affiliate/components/dashboard.tsx` (replace stub from Task 8)
- Modify: `apps/app/src/app/(app)/settings/affiliate/page.tsx` (full rewrite)
- Create: `apps/app/src/app/(app)/settings/affiliate/apply/page.tsx`
- Delete: `apps/app/src/app/(app)/settings/affiliate/__tests__/page.test.tsx`

- [ ] **Step 1: Replace `dashboard.tsx` with the composed section**

Replace the full contents of `apps/app/src/app/(app)/settings/affiliate/components/dashboard.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type {
  Affiliate, AffiliateStats, AffiliateReferral, AffiliateCommission,
  AffiliatePixKey, AffiliateContentSubmission,
} from '@tn-figueiredo/affiliate';
import { affiliateApi, AffiliateApiError, type ClickByPlatform } from '@/lib/affiliate-api';
import { toast } from 'sonner';
import { TierBadge } from './tier-badge';
import { ReferralLinkCard } from './referral-link-card';
import { StatsGrid } from './stats-grid';
import { ClicksByPlatform } from './clicks-by-platform';
import { RecentReferrals } from './recent-referrals';
import { CommissionHistory } from './commission-history';
import { PayoutSection } from './payout-section';
import { PixKeyManager } from './pix-key-manager';
import { ContentSubmissions } from './content-submissions';
import { strings } from './strings';

interface Props {
  me: Affiliate;
  stats: AffiliateStats | null;
  readOnly: boolean;
  onMutate: () => Promise<void> | void;
}

export function Dashboard({ me, stats, readOnly, onMutate }: Props) {
  const [referrals, setReferrals] = useState<AffiliateReferral[]>([]);
  const [commissions, setCommissions] = useState<AffiliateCommission[]>([]);
  const [clicks, setClicks] = useState<ClickByPlatform[]>([]);
  const [pixKeys, setPixKeys] = useState<AffiliatePixKey[]>([]);
  const [submissions, setSubmissions] = useState<AffiliateContentSubmission[]>([]);

  const refresh = async () => {
    try {
      const [r, c, cl, pk] = await Promise.all([
        affiliateApi.getReferrals(),
        affiliateApi.getCommissions(),
        affiliateApi.getClicksByPlatform(),
        affiliateApi.listPixKeys(),
      ]);
      setReferrals(r); setCommissions(c); setClicks(cl); setPixKeys(pk);
      // Content submissions live on the affiliate object in package v0.4.0
      setSubmissions((me as Affiliate & { contentSubmissions?: AffiliateContentSubmission[] }).contentSubmissions ?? []);
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    }
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const defaultPix = pixKeys.find((k) => k.isDefault) ?? null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="affiliate-dashboard">
      {readOnly && (
        <div
          role="alert"
          className="rounded border border-yellow-500 bg-yellow-50 p-3 text-sm"
        >
          {strings.state.paused.banner}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{strings.title}</h1>
        <TierBadge tier={me.tier!} commissionRate={me.commissionRate!} contractEndDate={me.contractEndDate!} />
      </div>

      <section className="space-y-2">
        <h3 className="font-medium">{strings.referral.section_title}</h3>
        <ReferralLinkCard code={me.code} tier={me.tier!} />
      </section>

      <StatsGrid stats={stats} />
      <ClicksByPlatform items={clicks} />
      <RecentReferrals items={referrals} />
      <CommissionHistory items={commissions} />
      <PayoutSection
        pendingPayoutBrl={stats?.pendingPayoutBrl ?? 0}
        defaultPixKey={defaultPix}
        readOnly={readOnly}
        onMutate={async () => { await onMutate(); await refresh(); }}
        tier={me.tier ?? undefined}
      />
      <PixKeyManager pixKeys={pixKeys} readOnly={readOnly} onChange={refresh} />
      <ContentSubmissions submissions={submissions} readOnly={readOnly} onChange={refresh} />
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `page.tsx`**

Replace the full contents of `apps/app/src/app/(app)/settings/affiliate/page.tsx` with:

```tsx
import { AffiliateClient } from './AffiliateClient';

export default function AffiliatePage() {
  return <AffiliateClient />;
}
```

- [ ] **Step 3: Create the apply stub page**

Create `apps/app/src/app/(app)/settings/affiliate/apply/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { affiliateApi, AffiliateApiError } from '@/lib/affiliate-api';
import { Button } from '@/components/ui/button';
import { strings } from '../components/strings';

export default function ApplyPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [suggestedCode, setSuggestedCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const ref = typeof window !== 'undefined'
        ? window.localStorage.getItem('bt.ref') ?? undefined
        : undefined;
      await affiliateApi.apply({
        name, email,
        channelUrl: channelUrl || undefined,
        suggestedCode: suggestedCode || undefined,
        referralCode: ref,
      } as any);
      toast.success('Candidatura enviada — avaliamos em até 3 dias úteis.');
      router.push('/settings/affiliate');
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-6 max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">{strings.state.not_affiliate.cta}</h1>
      <label className="block text-sm">
        <span>Nome</span>
        <input required className="mt-1 block w-full rounded border px-2 py-1"
          value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span>E-mail</span>
        <input required type="email" className="mt-1 block w-full rounded border px-2 py-1"
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span>URL do canal (opcional)</span>
        <input className="mt-1 block w-full rounded border px-2 py-1"
          value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span>Código sugerido (opcional)</span>
        <input className="mt-1 block w-full rounded border px-2 py-1"
          value={suggestedCode} onChange={(e) => setSuggestedCode(e.target.value)} />
      </label>
      <Button type="submit" disabled={busy}>Enviar candidatura</Button>
    </form>
  );
}
```

- [ ] **Step 4: Delete the legacy test file**

Run from repo root: `rm apps/app/src/app/\\(app\\)/settings/affiliate/__tests__/page.test.tsx`

Expected: file removed.

- [ ] **Step 5: Typecheck**

Run from repo root: `npm run typecheck`

Expected: 4 workspaces green.

## Task 18: Resolve `KNOWN GAP` comment in `config.ts`; add 2A errata

**Files:**
- Modify: `apps/api/src/lib/affiliate/config.ts`
- Modify: `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`

- [ ] **Step 1: Read current `config.ts` top lines**

Read `apps/api/src/lib/affiliate/config.ts` (lines 1–15). Locate the multi-line `KNOWN GAP (resolves in 2B)` comment (reported at lines 5–9 per spec §2).

- [ ] **Step 2: Replace the KNOWN-GAP comment**

In `apps/api/src/lib/affiliate/config.ts`, replace the comment block:

```ts
/*
 * KNOWN GAP (resolves in 2B): package builds ${webBaseUrl}/signup?ref=X and
 * ${webBaseUrl}/affiliate/portal. apps/app actual routes are
 * /[locale]/auth/signup and (TBD) /[locale]/settings/affiliate. Click
 * tracking still records correctly (use case fires BEFORE redirect), but the
 * browser lands on a 404 until 2B adds the matching URLs or apps/app rewrites.
 */
```

with:

```ts
// /signup drift resolved in Phase 2B via Next.js beforeFiles rewrites in
// apps/app/next.config.ts: /signup → /auth/signup, /parceiros/login → /auth/login,
// /parceiros/dashboard → /settings/affiliate. See
// docs/superpowers/specs/2026-04-17-affiliate-2b-end-user-ui-design.md §6.3.
```

Preserve all other lines in the file.

- [ ] **Step 3: Add 2A errata**

Open `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`. Immediately after the first-line top title (`# ...`), insert:

```markdown
> **Errata — 2026-04-17:** The `/signup` drift documented in §2 (and the
> `KNOWN GAP` comment in `apps/api/src/lib/affiliate/config.ts`) was resolved
> in Phase 2B via Next.js `beforeFiles` rewrites.
> See `docs/superpowers/specs/2026-04-17-affiliate-2b-end-user-ui-design.md` §6.3.
> The §11.2B handoff checklist items are complete. Inline text preserved as historical record.
```

Do not modify any other section.

- [ ] **Step 4: Typecheck**

Run from repo root: `npm run typecheck`

Expected: 4 workspaces green (api workspace compiles the modified config.ts; spec file is markdown, untyped).

## Task 19: Commit B verification + commit

- [ ] **Step 1: Full sweep — typecheck + lint + tests**

Run from repo root:

```bash
npm run typecheck
```

Expected: 4 workspaces green.

```bash
npm run lint --workspace=@brighttale/app
```

Expected: green.

```bash
npm test --workspace=@brighttale/app 2>&1 | tail -30
```

Expected: existing suite green + new tests green. New tests count: 10 (AffiliateClient) + 4 (tier-badge) + 3 (referral-link-card) + 4 (commission-history) + 6 (contract-proposal) + 9 (pix-key-manager) + 7 (payout-section) + 5 (content-submissions) + 10 (affiliate-api adapter, from Commit A) + 3 (formatters, from Commit A) = 61. Legacy `page.test.tsx` (7 tests) is deleted; net delta over Commit A baseline ≈ +48 (48 new Commit B tests replacing 7 legacy tests = +41 over full baseline).

- [ ] **Step 2: Build smoke**

Run from repo root: `npm run build --workspace=@brighttale/app 2>&1 | tail -10`

Expected: successful build; beforeFiles rewrites present in route manifest.

- [ ] **Step 3: Grep guardrails (spec §9 items 6, 7, 8)**

Run from repo root:

```bash
grep -r "/api/affiliate-legacy/" apps/app/src/app/\(app\)/settings/affiliate/ || echo "zero matches — clean"
```

Expected: "zero matches — clean".

```bash
grep -rE "commission_pct|total_revenue_cents|total_paid_cents" apps/app/src/ || echo "zero matches — clean"
```

Expected: "zero matches — clean".

```bash
grep -rE "\bsuccess:" apps/app/src/app/\(app\)/settings/affiliate/ || echo "zero matches — clean"
```

Expected: "zero matches — clean" (the `success` field name from the package envelope is confined to `lib/affiliate-api.ts`, not the UI tree).

- [ ] **Step 4: Manual smoke — §5.3 items 1–8**

Start the stack:

```bash
npm run dev
```

In a browser (or via curl for item 3/4):

1. `curl -I http://localhost:3000/settings/affiliate` → 307 to `/auth/login?next=...` (logged-out).
2. Log in as a non-affiliate user; visit `/settings/affiliate` → "Candidatar-se" CTA visible.
3. Copy referral link → paste into a notes app → confirm `.../signup?ref=<code>`.
4. In fresh tab `curl -sS -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3000/signup?ref=XYZ"` → 307/308 to `/<locale>/auth/signup?ref=XYZ`. Then complete signup; open DevTools → Application → Local Storage → confirm `bt.ref === 'XYZ'`.
5. (Skipped per spec §5.3 — locale switch not applicable to `(app)/settings/*`.)
6. Submit a content URL → list updates with status "pending".
7. Add a PIX key with CPF `12` → validation error before request.
8. Request payout without default PIX → button disabled + tooltip "Cadastre uma chave PIX padrão…".

Stop dev stack with Ctrl+C when done.

- [ ] **Step 5: Review staged diff**

Run from repo root: `git status && git diff --stat`

Expected files modified/created/deleted in Commit B:
- **new**: `AffiliateClient.tsx`, `apply/page.tsx`, 11 components under `components/` (not-affiliate, pending-application, contract-proposal, dashboard, terminated, tier-badge, referral-link-card, stats-grid, clicks-by-platform, recent-referrals, commission-history, payout-section, pix-key-manager, content-submissions), 8 new test files
- **modified**: `page.tsx`, `apps/api/src/lib/affiliate/config.ts`, `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`
- **deleted**: `__tests__/page.test.tsx`

- [ ] **Step 6: Commit**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add \
  apps/app/src/app/\(app\)/settings/affiliate/AffiliateClient.tsx \
  apps/app/src/app/\(app\)/settings/affiliate/page.tsx \
  apps/app/src/app/\(app\)/settings/affiliate/apply/page.tsx \
  apps/app/src/app/\(app\)/settings/affiliate/components/ \
  apps/app/src/app/\(app\)/settings/affiliate/__tests__/ \
  apps/api/src/lib/affiliate/config.ts \
  docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md

git add -u apps/app/src/app/\(app\)/settings/affiliate/__tests__/page.test.tsx

git commit -m "$(cat <<'EOF'
feat(app): affiliate 2B — end-user UI rewrite against new /api/affiliate/* (Commit B)

Atomic replacement of the legacy settings/affiliate page with a state-machine
UI wired to @tn-figueiredo/affiliate@0.4.0 routes. Six-state machine
(not-affiliate | pending | proposal | dashboard | paused | terminated) derived
from GET /api/affiliate/me. Ten section components cover tier badge, referral
link copy, stats, clicks-by-platform, recent referrals, commission history
(paginated), payout request, PIX key manager (add/setDefault/delete with
client regex validation), content submissions, and contract proposal
accept/reject (with LGPD consent).

- apps/app/src/app/(app)/settings/affiliate/AffiliateClient.tsx — state machine
- apps/app/src/app/(app)/settings/affiliate/page.tsx — server shell (full rewrite)
- apps/app/src/app/(app)/settings/affiliate/apply/page.tsx — minimal application stub
- apps/app/src/app/(app)/settings/affiliate/components/*.tsx — 13 components
- 8 new __tests__ files (~48 tests); legacy page.test.tsx deleted
- apps/api/src/lib/affiliate/config.ts — replaces stale KNOWN-GAP comment
  with resolution note referencing 2B rewrites
- docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md —
  top-of-file errata linking to 2B spec

PostHog events: affiliate_link_copied, affiliate_payout_requested,
affiliate_proposal_accepted, affiliate_content_submitted.

Spec: docs/superpowers/specs/2026-04-17-affiliate-2b-end-user-ui-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Verify**

Run: `git log -2 --oneline`

Expected: two commits forming Commit A + Commit B pair on `feat/affiliate-2a-foundation`.

Run: `cd apps/app && npm test 2>&1 | tail -10 && cd ../..`

Expected: full green.

---

## Done Criteria Checklist

- [ ] `npm run typecheck` green across 4 workspaces
- [ ] `npm run lint --workspace=@brighttale/app` green
- [ ] `npm run build --workspace=@brighttale/app` green with beforeFiles rewrites in manifest
- [ ] `npm test --workspace=@brighttale/app` green; new tests include 10 envelope + 3 formatters + 10 AffiliateClient + 4 tier-badge + 3 referral-link-card + 4 commission-history + 6 contract-proposal + 9 pix-key-manager + 7 payout-section + 5 content-submissions (≈61 new tests)
- [ ] Smoke items 1–8 (spec §5.3) pass manually
- [ ] `grep -r "/api/affiliate-legacy/" apps/app/src/app/(app)/settings/affiliate/` → zero matches
- [ ] `grep -rE "commission_pct|total_revenue_cents|total_paid_cents" apps/app/src/` → zero matches
- [ ] `grep -rE "\bsuccess:" apps/app/src/app/(app)/settings/affiliate/` → zero matches (envelope confined to `lib/affiliate-api.ts`)
- [ ] Legacy `__tests__/page.test.tsx` deleted; 8 new test files present
- [ ] `/signup?ref=X` in a fresh browser lands on `/<locale>/auth/signup?ref=X` with ref preserved and `localStorage.bt.ref` set post-signup
- [ ] 2A spec errata added; stale `KNOWN GAP` comment in `apps/api/src/lib/affiliate/config.ts` updated
- [ ] Diff total ~1100–1500 LOC inclusive of tests + `strings.ts` (soft target)
- [ ] Two commits on `feat/affiliate-2a-foundation`: Commit A (additive scaffolding) and Commit B (atomic rewrite)
- [ ] Integration test (spec §5.2) green manually when `AFFILIATE_INTEGRATION=1` against a live local stack (out-of-band; not blocking per spec — the file itself is not authored in 2B per cost/value tradeoff)
