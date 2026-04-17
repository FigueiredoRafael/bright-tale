# Phase 2E Fraud Detection + Rate-Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `undefined` fraud-service placeholder at `apps/api/src/lib/affiliate/container.ts:62` with a real `AffiliateFraudAdapter` wrapping `@tn-figueiredo/fraud-detection@0.2.0`, and rate-limit the public `GET /ref/:code` redirect via `@fastify/rate-limit@9` scoped to the `/ref` prefix. Closes the two High-risk gaps accepted in Phase 2A §9 R9 + R15. Sub-project 3 of the affiliate migration (follows SP0 email abstraction already merged on the branch).

**Architecture:** Adapter-style wrapping. `FraudDetectionEngine<Affiliate>` is composed via factory `buildFraudEngine()` with three collaborators: (a) `SupabaseFraudRepository` writing to the existing 2A `affiliate_fraud_flags` / `affiliate_risk_scores` tables (column-name remap `entity_id` → `affiliate_id` inside the adapter — NO migration); (b) `AffiliateEntityAdapter` delegating to `SupabaseAffiliateRepository` with a remap of the engine's `action: 'paused_fraud'` → `'paused'` to satisfy the existing CHECK constraint; (c) `sendFraudAdminAlert` going through `@/lib/email/provider.sendEmail` (post-SP0). Kill-switch `FRAUD_DETECTION_ENABLED` gates container wiring — `undefined` when disabled preserves 2A parity byte-for-byte. Rate-limit registered inside a Fastify child scope (v4 encapsulation semantics) so limits apply only to `/ref/*`. Three commits: (A) install + infra + tests + rate-limit, (B) atomic container wire, (C) doc reconciliation.

**Tech Stack:** TypeScript 5.9 strict, Vitest 4.1.4, Fastify 4.28.1, `@tn-figueiredo/fraud-detection@0.2.0`, `@tn-figueiredo/fraud-detection-utils@0.1.0` (transitive), `@fastify/rate-limit@^9.1.0` (Fastify 4 compat — v10 requires Fastify 5), Node ≥20.

**Spec:** `docs/superpowers/specs/2026-04-17-affiliate-2e-fraud-detection-design.md`

---

## File Structure

| Path | Disposition | Responsibility |
|---|---|---|
| `apps/api/src/lib/affiliate/fraud/engine.ts` | **new** (Commit A) | `buildFraudEngine(deps)` factory composing `FraudDetectionEngine<Affiliate>` with repo adapters, alert callback, env-parsed thresholds |
| `apps/api/src/lib/affiliate/fraud/service.ts` | **new** (Commit A) | `AffiliateFraudAdapter` implements `IAffiliateFraudDetectionService`; translates `affiliate → entity`, narrows `platform`, supplies `getUserEmail`, swallows engine errors |
| `apps/api/src/lib/affiliate/fraud/fraud-repo.ts` | **new** (Commit A) | `SupabaseFraudRepository` implements `IFraudRepository`; writes to `affiliate_fraud_flags` / `affiliate_risk_scores` with column-name remap |
| `apps/api/src/lib/affiliate/fraud/entity-adapter.ts` | **new** (Commit A) | `AffiliateEntityAdapter` implements `IEntityRepository<Affiliate>`; delegates to `SupabaseAffiliateRepository`, remaps `'paused_fraud'` → `'paused'` |
| `apps/api/src/lib/affiliate/fraud/alert.ts` | **new** (Commit A) | `sendFraudAdminAlert: OnAdminAlert` renders HTML-escaped subject+body, dispatches via `@/lib/email/provider`, swallows transport errors |
| `apps/api/src/lib/affiliate/fraud/__tests__/service.test.ts` | **new** (Commit A) | ~8 unit tests: platform narrow, knownIpHashes pass-through, error swallow, `getUserEmail` via Supabase mock |
| `apps/api/src/lib/affiliate/fraud/__tests__/fraud-repo.test.ts` | **new** (Commit A) | ~7 unit tests: column remap, createFlag insert, listOpenFlags filter, upsertRiskScore on conflict |
| `apps/api/src/lib/affiliate/fraud/__tests__/entity-adapter.test.ts` | **new** (Commit A) | ~6 unit tests: delegation, action remap with note prefix, null entity |
| `apps/api/src/lib/affiliate/fraud/__tests__/alert.test.ts` | **new** (Commit A) | ~4 unit tests: recipient, subject shape, HTML escape, swallow |
| `apps/api/src/__tests__/ref-rate-limit.test.ts` | **new** (Commit A) | ~6 tests via Fastify `inject()`: first 30 pass, 31st 429, headers, per-IP key, `trustProxy` header, scope isolation |
| `apps/api/src/__tests__/integration/affiliate-fraud-flow.test.ts` | **new** (Commit A) | Skipped stub (Category C); documents end-to-end self-referral assertions |
| `apps/api/src/index.ts` | **modify** (Commit A) | Add `trustProxy: true` to Fastify opts; register `@fastify/rate-limit` inside `/ref` child scope |
| `apps/api/src/lib/affiliate/container.ts` | **modify** (Commit B) | Replace `undefined` on line 62 with env-gated `fraudService`; import `buildFraudEngine` + `AffiliateFraudAdapter` |
| `apps/api/src/__tests__/lib/affiliate/container.test.ts` | **modify** (Commit B) | Add 2 assertions: env=true → fraud service non-undefined; unset/false → undefined (2A parity) |
| `apps/api/package.json` | **modify** (Commit A) | Add `@tn-figueiredo/fraud-detection@0.2.0`, `@fastify/rate-limit@9.1.0` (both `--save-exact`) |
| `apps/api/.env.example` | **modify** (Commit C) | New Affiliate fraud detection + rate-limit section |
| `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md` | **modify** (Commit C) | Errata note at top linking to 2E spec (R9 + R15 addressed) |
| `docs/superpowers/plans/2026-04-17-affiliate-2a-foundation.md` | **modify** (Commit C) | Matching errata block |

---

# Phase A — Commit A: Install + infra + rate-limit (no container wire)

All of Phase A is behaviorally additive for the fraud engine (no runtime detection yet because `container.ts` still passes `undefined`) but activates the rate-limit. At end of Phase A, `npm test` passes with the existing 2A suite intact **plus** the new ~31 unit/route tests.

## Task 1: Install dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install fraud-detection package (exact pin)**

Run from repo root:

```bash
npm install --workspace @brighttale/api --save-exact @tn-figueiredo/fraud-detection@0.2.0
```

This auto-installs transitive dep `@tn-figueiredo/fraud-detection-utils@0.1.0`. Both end up in `apps/api/package.json` under `dependencies`.

- [ ] **Step 2: Install rate-limit plugin (Fastify 4 compat pin)**

Run from repo root:

```bash
npm install --workspace @brighttale/api --save-exact @fastify/rate-limit@9.1.0
```

**Important:** `@fastify/rate-limit@10.x` requires Fastify 5; this repo is on Fastify 4.28.1. v9.1.0 is the last v9 release and the correct pin.

- [ ] **Step 3: Verify pins**

Run from repo root:

```bash
npm ls @tn-figueiredo/fraud-detection --workspace @brighttale/api
npm ls @fastify/rate-limit --workspace @brighttale/api
```

Expected: exact versions `0.2.0` and `9.1.0`. No `^` prefix in `apps/api/package.json`.

- [ ] **Step 4: Typecheck baseline**

Run from repo root: `npm run typecheck`

Expected: 4 workspaces green. No new code yet; typecheck verifies the packages' `.d.ts` exports don't conflict with existing types.

## Task 2: Preflight — add `trustProxy: true` to Fastify server

**Files:**
- Modify: `apps/api/src/index.ts`

**Why before anything else:** `@fastify/rate-limit` uses `request.ip` from Fastify. Without `trustProxy: true`, `req.ip` is the Vercel proxy IP for every request → the rate-limit collapses to a **global** 30/min across all clients. Mandatory precondition per spec §7 Commit A step 6.

- [ ] **Step 1: Add option**

Edit `apps/api/src/index.ts` around line 68 (the `Fastify({ ... })` constructor). Add `trustProxy: true` as a new property alongside `bodyLimit` / `logger` / `disableRequestLogging`:

```ts
const server = Fastify({
  bodyLimit: 25 * 1024 * 1024,
  logger: { /* ...unchanged... */ },
  disableRequestLogging: true,
  trustProxy: true, // required for @fastify/rate-limit on Vercel (sets req.ip from X-Forwarded-For)
});
```

- [ ] **Step 2: Verify existing tests still pass**

Run from `apps/api/`: `npm test -- --reporter=dot`

Expected: full green (no regressions). `trustProxy` changes `req.ip` resolution but no existing test asserts on `req.ip`.

## Task 3: Fraud repository (TDD)

**Files:**
- Create: `apps/api/src/lib/affiliate/fraud/__tests__/fraud-repo.test.ts`
- Create: `apps/api/src/lib/affiliate/fraud/fraud-repo.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/lib/affiliate/fraud/__tests__/fraud-repo.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseFraudRepository } from '../fraud-repo';

function chainable(returnValue: unknown) {
  const chain: Record<string, unknown> = {};
  const fns = ['select', 'eq', 'gte', 'in', 'order', 'limit'];
  for (const fn of fns) chain[fn] = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(returnValue);
  chain.insert = vi.fn().mockResolvedValue(returnValue);
  chain.upsert = vi.fn().mockResolvedValue(returnValue);
  // terminal operator for non-single reads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (chain as any).then = (resolve: (v: unknown) => void) => resolve(returnValue);
  return chain;
}

function mockSb(returnValue: unknown): SupabaseClient<never> {
  const from = vi.fn().mockReturnValue(chainable(returnValue));
  return { from } as unknown as SupabaseClient<never>;
}

describe('SupabaseFraudRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('findRecentFlag queries affiliate_fraud_flags keyed on affiliate_id', async () => {
    const sb = mockSb({ data: { id: 'flag-1' }, error: null });
    const repo = new SupabaseFraudRepository(sb);
    const res = await repo.findRecentFlag({ entityId: 'aff-1', flagType: 'self_referral_ip_match', since: '2026-04-16' });
    expect(sb.from).toHaveBeenCalledWith('affiliate_fraud_flags');
    expect(res).toEqual({ id: 'flag-1' });
  });

  it('findRecentFlag returns null when data is null', async () => {
    const sb = mockSb({ data: null, error: null });
    const repo = new SupabaseFraudRepository(sb);
    const res = await repo.findRecentFlag({ entityId: 'aff-1', flagType: 'x', since: '2026-01-01' });
    expect(res).toBeNull();
  });

  it('findRecentFlag throws on Supabase error', async () => {
    const sb = mockSb({ data: null, error: { message: 'db down' } });
    const repo = new SupabaseFraudRepository(sb);
    await expect(repo.findRecentFlag({ entityId: 'x', flagType: 'y', since: 'z' }))
      .rejects.toMatchObject({ message: 'db down' });
  });

  it('createFlag inserts with affiliate_id remap + status open', async () => {
    const sb = mockSb({ error: null });
    const repo = new SupabaseFraudRepository(sb);
    await repo.createFlag({
      entityId: 'aff-2', referralId: 'ref-1', flagType: 'self_referral_ip_match',
      severity: 'high', details: { foo: 'bar' }, status: 'open',
    });
    const insertArgs = (sb.from('affiliate_fraud_flags') as unknown as { insert: ReturnType<typeof vi.fn> }).insert.mock.calls[0][0];
    expect(insertArgs.affiliate_id).toBe('aff-2');
    expect(insertArgs.referral_id).toBe('ref-1');
    expect(insertArgs.status).toBe('open');
  });

  it('createFlag accepts null referralId', async () => {
    const sb = mockSb({ error: null });
    const repo = new SupabaseFraudRepository(sb);
    await repo.createFlag({
      entityId: 'aff-3', flagType: 'self_referral_email_similar',
      severity: 'medium', details: {}, status: 'open',
    });
    const insertArgs = (sb.from('affiliate_fraud_flags') as unknown as { insert: ReturnType<typeof vi.fn> }).insert.mock.calls[0][0];
    expect(insertArgs.referral_id).toBeNull();
  });

  it('listOpenFlags filters status in [open, investigating]', async () => {
    const sb = mockSb({ data: [{ flag_type: 'x', severity: 'high' }], error: null });
    const repo = new SupabaseFraudRepository(sb);
    const res = await repo.listOpenFlags('aff-4');
    expect(res).toEqual([{ flagType: 'x', severity: 'high' }]);
  });

  it('upsertRiskScore upserts on affiliate_id conflict', async () => {
    const sb = mockSb({ error: null });
    const repo = new SupabaseFraudRepository(sb);
    await repo.upsertRiskScore({ entityId: 'aff-5', score: 55, flagCount: 2, updatedAt: '2026-04-17T00:00:00Z' });
    const upsertArgs = (sb.from('affiliate_risk_scores') as unknown as { upsert: ReturnType<typeof vi.fn> }).upsert.mock.calls[0];
    expect(upsertArgs[0].affiliate_id).toBe('aff-5');
    expect(upsertArgs[1]).toMatchObject({ onConflict: 'affiliate_id' });
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run from `apps/api/`: `npx vitest run src/lib/affiliate/fraud/__tests__/fraud-repo.test.ts`

Expected: FAIL with "Cannot find module '../fraud-repo'".

- [ ] **Step 3: Write implementation**

Create `apps/api/src/lib/affiliate/fraud/fraud-repo.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@brighttale/shared/types/database';
import type {
  IFraudRepository,
  FraudSeverity,
  RiskScore,
} from '@tn-figueiredo/fraud-detection';

/**
 * Writer-side IFraudRepository backed by the 2A `affiliate_fraud_flags` and
 * `affiliate_risk_scores` tables. Column-name remap: upstream `entity_id` →
 * local `affiliate_id`.
 *
 * Separate from `apps/api/src/lib/affiliate/repository/fraud-repo.ts` (which
 * is the admin READER for ListAffiliateFraudFlagsUseCase et al.). Writer and
 * reader live in sibling modules to keep IAffiliateRepository's surface in
 * repository/ uncluttered.
 */
export class SupabaseFraudRepository implements IFraudRepository {
  constructor(private readonly sb: SupabaseClient<Database>) {}

  async findRecentFlag(params: { entityId: string; flagType: string; since: string }) {
    const { data, error } = await this.sb
      .from('affiliate_fraud_flags')
      .select('id')
      .eq('affiliate_id', params.entityId)
      .eq('flag_type', params.flagType)
      .gte('created_at', params.since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? { id: data.id } : null;
  }

  async createFlag(input: {
    entityId: string;
    referralId?: string | null;
    flagType: string;
    severity: FraudSeverity;
    details: Record<string, unknown>;
    status: 'open';
  }) {
    const { error } = await this.sb.from('affiliate_fraud_flags').insert({
      affiliate_id: input.entityId,
      referral_id: input.referralId ?? null,
      flag_type: input.flagType,
      severity: input.severity,
      details: input.details as never, // Database Json cast
      status: input.status,
    });
    if (error) throw error;
  }

  async listOpenFlags(entityId: string) {
    const { data, error } = await this.sb
      .from('affiliate_fraud_flags')
      .select('flag_type, severity')
      .eq('affiliate_id', entityId)
      .in('status', ['open', 'investigating']);
    if (error) throw error;
    return (data ?? []).map((r: { flag_type: string; severity: string }) => ({
      flagType: r.flag_type,
      severity: r.severity as FraudSeverity,
    }));
  }

  async upsertRiskScore(score: RiskScore) {
    const { error } = await this.sb
      .from('affiliate_risk_scores')
      .upsert(
        {
          affiliate_id: score.entityId,
          score: score.score,
          flag_count: score.flagCount,
          updated_at: score.updatedAt,
        },
        { onConflict: 'affiliate_id' },
      );
    if (error) throw error;
  }
}
```

- [ ] **Step 4: Run — expect green**

Run from `apps/api/`: `npx vitest run src/lib/affiliate/fraud/__tests__/fraud-repo.test.ts`

Expected: 7 tests pass.

## Task 4: Entity adapter (TDD)

**Files:**
- Create: `apps/api/src/lib/affiliate/fraud/__tests__/entity-adapter.test.ts`
- Create: `apps/api/src/lib/affiliate/fraud/entity-adapter.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/lib/affiliate/fraud/__tests__/entity-adapter.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AffiliateEntityAdapter } from '../entity-adapter';
import type { SupabaseAffiliateRepository } from '../../repository';

function fakeRepo() {
  return {
    findById: vi.fn(),
    pause: vi.fn(),
    addContractHistory: vi.fn(),
  } as unknown as SupabaseAffiliateRepository & {
    findById: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    addContractHistory: ReturnType<typeof vi.fn>;
  };
}

describe('AffiliateEntityAdapter', () => {
  let repo: ReturnType<typeof fakeRepo>;
  let adapter: AffiliateEntityAdapter;

  beforeEach(() => {
    repo = fakeRepo();
    adapter = new AffiliateEntityAdapter(repo);
  });

  it('findById delegates to SupabaseAffiliateRepository.findById', async () => {
    repo.findById.mockResolvedValue({ id: 'aff-1', email: 'x@y.com' });
    const res = await adapter.findById('aff-1');
    expect(repo.findById).toHaveBeenCalledWith('aff-1');
    expect(res).toEqual({ id: 'aff-1', email: 'x@y.com' });
  });

  it('findById returns null when repo returns null', async () => {
    repo.findById.mockResolvedValue(null);
    expect(await adapter.findById('missing')).toBeNull();
  });

  it('pause delegates with options pass-through', async () => {
    repo.pause.mockResolvedValue({ id: 'aff-1' });
    await adapter.pause('aff-1', { skipAudit: true });
    expect(repo.pause).toHaveBeenCalledWith('aff-1', { skipAudit: true });
  });

  it('addHistory remaps paused_fraud → paused with note prefix', async () => {
    repo.addContractHistory.mockResolvedValue(undefined);
    await adapter.addHistory({
      entityId: 'aff-2', action: 'paused_fraud',
      notes: 'score 82 auto-pause', oldStatus: 'active', newStatus: 'paused',
    });
    expect(repo.addContractHistory).toHaveBeenCalledWith(expect.objectContaining({
      affiliateId: 'aff-2',
      action: 'paused',
      notes: '[fraud-engine] score 82 auto-pause',
      oldStatus: 'active',
      newStatus: 'paused',
    }));
  });

  it('addHistory passes through non-fraud actions verbatim', async () => {
    repo.addContractHistory.mockResolvedValue(undefined);
    await adapter.addHistory({ entityId: 'aff-3', action: 'paused', notes: 'manual' });
    expect(repo.addContractHistory).toHaveBeenCalledWith(expect.objectContaining({
      affiliateId: 'aff-3', action: 'paused', notes: 'manual',
    }));
  });

  it('addHistory supplies default notes when paused_fraud without notes', async () => {
    repo.addContractHistory.mockResolvedValue(undefined);
    await adapter.addHistory({ entityId: 'aff-4', action: 'paused_fraud' });
    expect(repo.addContractHistory).toHaveBeenCalledWith(expect.objectContaining({
      notes: '[fraud-engine] auto-pause',
    }));
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run from `apps/api/`: `npx vitest run src/lib/affiliate/fraud/__tests__/entity-adapter.test.ts`

Expected: FAIL (module not found).

- [ ] **Step 3: Write implementation**

Create `apps/api/src/lib/affiliate/fraud/entity-adapter.ts`:

```ts
import type { IEntityRepository } from '@tn-figueiredo/fraud-detection';
import type { Affiliate } from '@tn-figueiredo/affiliate';
import type { SupabaseAffiliateRepository } from '../repository';

/**
 * Bridges FraudDetectionEngine's IEntityRepository<Affiliate> port to the
 * domain's SupabaseAffiliateRepository. One non-trivial translation: the
 * engine emits `action: 'paused_fraud'` which is NOT permitted by
 * affiliate_contract_history's CHECK constraint (2A migration
 * 20260417000004_affiliate_004_contract.sql:6-9 allows only approved/paused/
 * terminated/contract_renewed/proposal_*). We remap paused_fraud → paused
 * with a prefixed note to preserve the audit trail without a schema change.
 */
export class AffiliateEntityAdapter implements IEntityRepository<Affiliate> {
  constructor(private readonly repo: SupabaseAffiliateRepository) {}

  findById(id: string): Promise<Affiliate | null> {
    return this.repo.findById(id);
  }

  pause(id: string, options?: { skipAudit?: boolean }): Promise<Affiliate> {
    return this.repo.pause(id, options);
  }

  async addHistory(entry: {
    entityId: string;
    action: string;
    notes?: string | null;
    oldStatus?: string | null;
    newStatus?: string | null;
  }): Promise<void> {
    const isFraudPause = entry.action === 'paused_fraud';
    await this.repo.addContractHistory({
      affiliateId: entry.entityId,
      action: (isFraudPause ? 'paused' : entry.action) as never,
      notes: isFraudPause
        ? `[fraud-engine] ${entry.notes ?? 'auto-pause'}`
        : (entry.notes ?? null),
      oldStatus: entry.oldStatus ?? null,
      newStatus: entry.newStatus ?? null,
    });
  }
}
```

- [ ] **Step 4: Run — expect green**

Run from `apps/api/`: `npx vitest run src/lib/affiliate/fraud/__tests__/entity-adapter.test.ts`

Expected: 6 tests pass.

## Task 5: Admin alert (TDD)

**Files:**
- Create: `apps/api/src/lib/affiliate/fraud/__tests__/alert.test.ts`
- Create: `apps/api/src/lib/affiliate/fraud/alert.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/lib/affiliate/fraud/__tests__/alert.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/email/provider', () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: 'x', provider: 'none' }),
}));

import * as provider from '@/lib/email/provider';
import { sendFraudAdminAlert } from '../alert';

const basePayload = {
  entityId: 'aff-1',
  flagType: 'self_referral_ip_match',
  severity: 'high',
  details: { foo: 'bar' },
  riskScore: 55,
  flagCount: 1,
  adminUrl: 'https://app.brighttale.io/admin/affiliates/aff-1',
} as const;

describe('sendFraudAdminAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AFFILIATE_ADMIN_EMAIL = 'admin@brighttale.test';
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it('sends to AFFILIATE_ADMIN_EMAIL with subject including flagType + severity', async () => {
    await sendFraudAdminAlert(basePayload);
    expect(provider.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'admin@brighttale.test',
      subject: expect.stringMatching(/self_referral_ip_match.*high/),
    }));
  });

  it('escapes HTML in details', async () => {
    await sendFraudAdminAlert({
      ...basePayload,
      details: { note: '<script>alert(1)</script>' },
    });
    const arg = vi.mocked(provider.sendEmail).mock.calls[0][0];
    expect(arg.html).not.toContain('<script>alert(1)</script>');
    expect(arg.html).toContain('&lt;script&gt;');
  });

  it('falls back to derived adminUrl when payload.adminUrl absent', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.brighttale.io';
    const { adminUrl: _drop, ...rest } = basePayload;
    void _drop;
    await sendFraudAdminAlert(rest);
    const arg = vi.mocked(provider.sendEmail).mock.calls[0][0];
    expect(arg.html).toContain('https://staging.brighttale.io/admin/affiliates/aff-1');
  });

  it('swallows provider errors (alerts are best-effort)', async () => {
    vi.mocked(provider.sendEmail).mockRejectedValueOnce(new Error('transport down'));
    await expect(sendFraudAdminAlert(basePayload)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run from `apps/api/`: `npx vitest run src/lib/affiliate/fraud/__tests__/alert.test.ts`

Expected: FAIL (module not found).

- [ ] **Step 3: Write implementation**

Create `apps/api/src/lib/affiliate/fraud/alert.ts`:

```ts
import type { OnAdminAlert } from '@tn-figueiredo/fraud-detection';
import { sendEmail } from '@/lib/email/provider';

function adminEmail(): string {
  return process.env.AFFILIATE_ADMIN_EMAIL ?? 'admin@brighttale.io';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const sendFraudAdminAlert: OnAdminAlert = async (payload) => {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://brighttale.io';
  const adminUrl = payload.adminUrl ?? `${base}/admin/affiliates/${payload.entityId}`;
  const html = `
    <h2>Fraude detectada: ${escapeHtml(payload.flagType)}</h2>
    <p><strong>Severity:</strong> ${escapeHtml(String(payload.severity))}</p>
    <p><strong>Entity:</strong> ${escapeHtml(payload.entityId)}</p>
    <pre>${escapeHtml(JSON.stringify(payload.details, null, 2))}</pre>
    <p><a href="${escapeHtml(adminUrl)}">Open admin view</a></p>
  `;
  try {
    await sendEmail({
      to: adminEmail(),
      subject: `[Fraud] ${payload.flagType} (${payload.severity})`,
      html,
    });
  } catch (err) {
    // Alerts are best-effort; DB flags are the source of truth.
    // eslint-disable-next-line no-console
    console.error('[fraud:alert] email send failed (swallowed):', err);
  }
};
```

- [ ] **Step 4: Run — expect green**

Run from `apps/api/`: `npx vitest run src/lib/affiliate/fraud/__tests__/alert.test.ts`

Expected: 4 tests pass.

## Task 6: Service adapter (TDD)

**Files:**
- Create: `apps/api/src/lib/affiliate/fraud/__tests__/service.test.ts`
- Create: `apps/api/src/lib/affiliate/fraud/service.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/lib/affiliate/fraud/__tests__/service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AffiliateFraudAdapter } from '../service';

type EngineMock = {
  checkSelfReferral: ReturnType<typeof vi.fn>;
};

function fakeEngine(): EngineMock {
  return { checkSelfReferral: vi.fn().mockResolvedValue(undefined) };
}

function fakeSb(email: string | null): SupabaseClient<never> {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({
    data: email ? { email } : null,
    error: null,
  });
  const from = vi.fn().mockReturnValue(chain);
  return { from } as unknown as SupabaseClient<never>;
}

const basePayload = {
  affiliate: { id: 'aff-1', email: 'a@b.com', knownIpHashes: ['hash-1'] },
  referral: { id: 'ref-1' },
  signupIpHash: 'hash-1',
  userId: 'user-1',
  platform: 'web',
} as const;

describe('AffiliateFraudAdapter', () => {
  let engine: EngineMock;
  let logger: { error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    engine = fakeEngine();
    logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
  });

  it('maps affiliate → entity and passes knownIpHashes through', async () => {
    const adapter = new AffiliateFraudAdapter(engine as never, fakeSb('x@y.com'), logger);
    await adapter.checkSelfReferral(basePayload);
    const call = engine.checkSelfReferral.mock.calls[0][0];
    expect(call.entity).toEqual(basePayload.affiliate);
    expect(call.signupIpHash).toBe('hash-1');
    expect(call.userId).toBe('user-1');
  });

  it('narrows platform: web stays web', async () => {
    const adapter = new AffiliateFraudAdapter(engine as never, fakeSb(null), logger);
    await adapter.checkSelfReferral(basePayload);
    expect(engine.checkSelfReferral.mock.calls[0][0].platform).toBe('web');
  });

  it('narrows platform: android and ios pass through', async () => {
    const adapter = new AffiliateFraudAdapter(engine as never, fakeSb(null), logger);
    await adapter.checkSelfReferral({ ...basePayload, platform: 'android' });
    expect(engine.checkSelfReferral.mock.calls[0][0].platform).toBe('android');
    await adapter.checkSelfReferral({ ...basePayload, platform: 'ios' });
    expect(engine.checkSelfReferral.mock.calls[1][0].platform).toBe('ios');
  });

  it('narrows platform: unknown values → null', async () => {
    const adapter = new AffiliateFraudAdapter(engine as never, fakeSb(null), logger);
    await adapter.checkSelfReferral({ ...basePayload, platform: 'pwa' });
    expect(engine.checkSelfReferral.mock.calls[0][0].platform).toBeNull();
  });

  it('getUserEmail resolves via user_profiles.id', async () => {
    const sb = fakeSb('resolved@x.com');
    const adapter = new AffiliateFraudAdapter(engine as never, sb, logger);
    await adapter.checkSelfReferral(basePayload);
    const getEmailFn = engine.checkSelfReferral.mock.calls[0][0].getUserEmail;
    expect(await getEmailFn('user-1')).toBe('resolved@x.com');
  });

  it('getUserEmail returns null when profile missing', async () => {
    const adapter = new AffiliateFraudAdapter(engine as never, fakeSb(null), logger);
    await adapter.checkSelfReferral(basePayload);
    const getEmailFn = engine.checkSelfReferral.mock.calls[0][0].getUserEmail;
    expect(await getEmailFn('user-unknown')).toBeNull();
  });

  it('swallows engine errors and logs once — never rethrows', async () => {
    engine.checkSelfReferral.mockRejectedValueOnce(new Error('engine exploded'));
    const adapter = new AffiliateFraudAdapter(engine as never, fakeSb(null), logger);
    await expect(adapter.checkSelfReferral(basePayload)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('returns void on success', async () => {
    const adapter = new AffiliateFraudAdapter(engine as never, fakeSb('x@y.com'), logger);
    const res = await adapter.checkSelfReferral(basePayload);
    expect(res).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run from `apps/api/`: `npx vitest run src/lib/affiliate/fraud/__tests__/service.test.ts`

Expected: FAIL (module not found).

- [ ] **Step 3: Write implementation**

Create `apps/api/src/lib/affiliate/fraud/service.ts`:

```ts
import type { FraudDetectionEngine } from '@tn-figueiredo/fraud-detection';
import type { IAffiliateFraudDetectionService, Affiliate } from '@tn-figueiredo/affiliate';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@brighttale/shared/types/database';

type Logger = {
  info: (m: string, meta?: unknown) => void;
  warn: (m: string, meta?: unknown) => void;
  error: (m: string, meta?: unknown) => void;
};

function narrowPlatform(p?: string): 'android' | 'ios' | 'web' | null {
  return p === 'android' || p === 'ios' || p === 'web' ? p : null;
}

/**
 * Implements IAffiliateFraudDetectionService by delegating to a
 * FraudDetectionEngine<Affiliate>. Responsibilities:
 *  - translate `affiliate → entity` (package naming difference);
 *  - narrow `platform: string` → `'android' | 'ios' | 'web' | null`;
 *  - supply `getUserEmail` callback (user_profiles.id === auth.users.id);
 *  - swallow engine errors — fraud is a side-observer, never blocks signup.
 */
export class AffiliateFraudAdapter implements IAffiliateFraudDetectionService {
  constructor(
    private readonly engine: FraudDetectionEngine<Affiliate>,
    private readonly sb: SupabaseClient<Database>,
    private readonly logger: Logger = console,
  ) {}

  async checkSelfReferral(data: {
    affiliate: { id: string; email: string; knownIpHashes?: string[] };
    referral: { id: string };
    signupIpHash: string;
    userId: string;
    platform?: string;
  }): Promise<void> {
    try {
      await this.engine.checkSelfReferral({
        entity: data.affiliate,
        referral: data.referral,
        signupIpHash: data.signupIpHash,
        userId: data.userId,
        platform: narrowPlatform(data.platform),
        getUserEmail: async (userId: string) => {
          const { data: u } = await this.sb
            .from('user_profiles')
            .select('email')
            .eq('id', userId)
            .maybeSingle();
          return (u as { email?: string } | null)?.email ?? null;
        },
      });
    } catch (err) {
      this.logger.error('[fraud] checkSelfReferral failed (swallowed):', err);
    }
  }
}
```

- [ ] **Step 4: Run — expect green**

Run from `apps/api/`: `npx vitest run src/lib/affiliate/fraud/__tests__/service.test.ts`

Expected: 8 tests pass.

## Task 7: Engine factory

**Files:**
- Create: `apps/api/src/lib/affiliate/fraud/engine.ts`

No dedicated test file — the factory is exercised indirectly by the container test in Commit B and by the integration stub. It's a ~30-line composition with pure property wiring; a direct unit test would be tautological.

- [ ] **Step 1: Write factory**

Create `apps/api/src/lib/affiliate/fraud/engine.ts`:

```ts
import { FraudDetectionEngine, DEFAULT_FRAUD_CONFIG } from '@tn-figueiredo/fraud-detection';
import type { Affiliate } from '@tn-figueiredo/affiliate';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@brighttale/shared/types/database';
import type { SupabaseAffiliateRepository } from '../repository';
import { SupabaseFraudRepository } from './fraud-repo';
import { AffiliateEntityAdapter } from './entity-adapter';
import { sendFraudAdminAlert } from './alert';

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

type Logger = {
  info: (m: string, meta?: unknown) => void;
  warn: (m: string, meta?: unknown) => void;
  error: (m: string, meta?: unknown) => void;
};

export function buildFraudEngine(deps: {
  sb: SupabaseClient<Database>;
  repo: SupabaseAffiliateRepository;
  logger?: Logger;
}): FraudDetectionEngine<Affiliate> {
  return new FraudDetectionEngine<Affiliate>({
    config: {
      ...DEFAULT_FRAUD_CONFIG,
      autoPauseThreshold: parseIntEnv(
        'FRAUD_AUTO_PAUSE_THRESHOLD',
        DEFAULT_FRAUD_CONFIG.autoPauseThreshold,
      ),
      notifyAdminThreshold: parseIntEnv(
        'FRAUD_NOTIFY_ADMIN_THRESHOLD',
        DEFAULT_FRAUD_CONFIG.notifyAdminThreshold,
      ),
    },
    fraudRepo: new SupabaseFraudRepository(deps.sb),
    entityRepo: new AffiliateEntityAdapter(deps.repo),
    onAdminAlert: sendFraudAdminAlert,
    logger: deps.logger,
  });
}
```

- [ ] **Step 2: Typecheck**

Run from repo root: `npm run typecheck`

Expected: 4 workspaces green.

## Task 8: `/ref` rate-limit registration + tests (TDD)

**Files:**
- Create: `apps/api/src/__tests__/ref-rate-limit.test.ts`
- Modify: `apps/api/src/index.ts`

The rate-limit is registered inside the existing `/ref` child scope (index.ts:197–202). Fastify v4 plugin encapsulation guarantees the limit applies only to handlers attached to that scope.

- [ ] **Step 1: Write failing test using Fastify inject()**

Create `apps/api/src/__tests__/ref-rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

/**
 * Self-contained Fastify instance mirroring the /ref scope registration in
 * apps/api/src/index.ts. We don't boot the full server — just the piece under
 * test. This makes the test fast (no Supabase, no real config).
 */
async function buildTestServer(): Promise<FastifyInstance> {
  const server = Fastify({ trustProxy: true });
  await server.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 30,
      timeWindow: '1 minute',
      cache: 10_000,
      keyGenerator: (req) => req.ip,
      continueExceeding: false,
      errorResponseBuilder: (_req, ctx) => ({
        data: null,
        error: {
          code: 'RATE_LIMITED',
          message: `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)}s.`,
        },
      }),
    });
    scope.get('/:code', async (_req, reply) => {
      reply.code(302).header('location', 'https://brighttale.io/signup').send();
    });
  }, { prefix: '/ref' });

  // Sibling scope without rate-limit — to verify scope isolation
  server.register(async (scope) => {
    scope.get('/me', async () => ({ data: { ok: true }, error: null }));
  }, { prefix: '/affiliate' });

  await server.ready();
  return server;
}

describe('/ref rate-limit', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('first 30 requests from the same IP pass', async () => {
    for (let i = 0; i < 30; i++) {
      const res = await server.inject({ url: '/ref/ABC', remoteAddress: '1.1.1.1' });
      expect(res.statusCode).toBe(302);
    }
  });

  it('31st request from same IP returns 429 with envelope', async () => {
    const res = await server.inject({ url: '/ref/ABC', remoteAddress: '1.1.1.1' });
    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({
      data: null,
      error: { code: 'RATE_LIMITED' },
    });
    expect(body.error.message).toMatch(/Too many requests/);
  });

  it('response includes x-ratelimit-* headers', async () => {
    const res = await server.inject({ url: '/ref/ABC', remoteAddress: '2.2.2.2' });
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('different IP gets fresh allowance (keyGenerator isolates)', async () => {
    const res = await server.inject({ url: '/ref/ABC', remoteAddress: '9.9.9.9' });
    expect(res.statusCode).toBe(302);
  });

  it('trustProxy: X-Forwarded-For header drives keying', async () => {
    // Reset by using a fresh XFF that hasn't been limited
    for (let i = 0; i < 30; i++) {
      const res = await server.inject({
        url: '/ref/ABC',
        remoteAddress: '127.0.0.1',
        headers: { 'x-forwarded-for': '5.5.5.5' },
      });
      expect(res.statusCode).toBe(302);
    }
    const blocked = await server.inject({
      url: '/ref/ABC',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '5.5.5.5' },
    });
    expect(blocked.statusCode).toBe(429);

    // A different X-Forwarded-For from the same socket still has allowance
    const other = await server.inject({
      url: '/ref/ABC',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '6.6.6.6' },
    });
    expect(other.statusCode).toBe(302);
  });

  it('scope isolation: /affiliate/me unaffected by /ref limit exhaustion', async () => {
    // IP 1.1.1.1 is already blocked on /ref from the first test
    const res = await server.inject({ url: '/affiliate/me', remoteAddress: '1.1.1.1' });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run — expect green (self-contained reference test)**

Run from `apps/api/`: `npx vitest run src/__tests__/ref-rate-limit.test.ts`

Expected: 6 tests pass.

**Design note (TDD deviation, intentional):** this test builds its own Fastify instance rather than booting the full server (which would pull in Supabase, every route module, auth middleware, etc.). The inline server IS the red-green target: Step 3 below **must** produce an `apps/api/src/index.ts` `/ref` scope that matches the shape of the inline server byte-for-byte (same `max`, `timeWindow`, `cache`, `keyGenerator`, `errorResponseBuilder`, `continueExceeding`). Structural parity is verified manually in Step 5 via curl smoke, and by the line-level diff review in Task 10 Step 2.

- [ ] **Step 3: Apply the same registration shape to production `index.ts`**

Edit `apps/api/src/index.ts`. At the top of the imports block, add:

```ts
import rateLimit from "@fastify/rate-limit";
```

Then find the `/ref` scope registration (currently at lines 197–202):

```ts
server.register(async (scope) => {
  registerAffiliateRedirectRoute(scope as never, {
    webBaseUrl: affiliateContainer.config.webBaseUrl,
    trackClickUseCase: affiliateContainer.trackClickUseCase,
  });
}, { prefix: "/ref" });
```

Replace with:

```ts
function parseRefRateLimitMax(): number {
  const raw = process.env.REF_RATE_LIMIT_MAX;
  if (raw === undefined || raw === "") return 30;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

server.register(async (scope) => {
  await scope.register(rateLimit, {
    max: parseRefRateLimitMax(),
    timeWindow: process.env.REF_RATE_LIMIT_WINDOW ?? "1 minute",
    cache: 10_000,
    keyGenerator: (req) => req.ip,
    continueExceeding: false,
    errorResponseBuilder: (_req, ctx) => ({
      data: null,
      error: {
        code: "RATE_LIMITED",
        message: `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)}s.`,
      },
    }),
  });
  registerAffiliateRedirectRoute(scope as never, {
    webBaseUrl: affiliateContainer.config.webBaseUrl,
    trackClickUseCase: affiliateContainer.trackClickUseCase,
  });
}, { prefix: "/ref" });
```

The `parseRefRateLimitMax` helper can live alongside the scope block (local function). Keep `parseIntEnv` in `fraud/engine.ts`; we don't extract a shared utility for two call-sites.

- [ ] **Step 4: Typecheck + test**

Run from repo root: `npm run typecheck`

Expected: 4 workspaces green.

Run from `apps/api/`: `npx vitest run src/__tests__/ref-rate-limit.test.ts`

Expected: 6 tests still pass (the test was self-contained; this step aligns prod).

- [ ] **Step 5: Manual smoke (optional but recommended)**

Run from `apps/api/` with the dev server:

```bash
npm run dev  # port 3001
# In a second terminal:
for i in $(seq 1 31); do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/ref/SMOKE
done
```

Expected: 30 responses of `302`, 1 response of `429` on the 31st.

## Task 9: Integration test stub (skipped, Category C)

**Files:**
- Create: `apps/api/src/__tests__/integration/affiliate-fraud-flow.test.ts`

Per CLAUDE.md, Category C tests (DB-hitting) are `describe.skip`ped with a `// TODO-test` marker. This file is a test-shape placeholder documenting the end-to-end flow for 2F when MailHog + local Supabase integration is wired up.

- [ ] **Step 1: Write stub**

Create `apps/api/src/__tests__/integration/affiliate-fraud-flow.test.ts`:

```ts
import { describe, it } from 'vitest';

// TODO-test: Category C — requires local Supabase + MailHog + seeded affiliate.
// Ships as a documentation stub of the assertions we want once 2F wires the
// signup → attribute → fraud end-to-end harness.
describe.skip('affiliate fraud flow (integration, Category C)', () => {
  it('self-referral with same IP creates self_referral_ip_match flag + risk score', () => {
    // 1. Applicant A applies, admin approves (→ code C-A).
    // 2. Applicant A signs up second account via ?ref=C-A with same hashed IP.
    // 3. Assert affiliate_fraud_flags has one row where flag_type='self_referral_ip_match', severity='high'.
    // 4. Assert affiliate_risk_scores.score >= 45 for affiliate A.
    // 5. Assert MailHog captured one email with subject matching /\[Fraud\] self_referral_ip_match/.
  });

  it('auto-pause triggers when combined flags push score ≥ 80', () => {
    // Additional self_referral_email_similar flag lifts score over threshold;
    // affiliates.status flips to 'paused' and affiliate_contract_history has
    // one row with action='paused', notes starting '[fraud-engine]'.
  });
});
```

- [ ] **Step 2: Verify skip is respected**

Run from `apps/api/`: `npx vitest run src/__tests__/integration/affiliate-fraud-flow.test.ts`

Expected: test file reports 2 tests, both skipped.

## Task 10: Commit A verification + commit

- [ ] **Step 1: Full verification sweep**

Run from repo root:

```bash
npm run typecheck
```

Expected: 4 workspaces green.

Run from `apps/api/`:

```bash
npm test -- --reporter=dot
```

Expected: existing pre-2E tests pass + ~31 new (fraud-repo 7, entity-adapter 6, alert 4, service 8, rate-limit 6). Container test unchanged at this commit; integration stub skipped.

- [ ] **Step 2: Review staged diff scope**

Run from repo root:

```bash
git status && git diff --stat
```

Expected files modified/created in Commit A:
- `apps/api/package.json` + `package-lock.json` (2 new deps, exact pins)
- `apps/api/src/index.ts` (`trustProxy` + rate-limit scope registration + `rateLimit` import)
- `apps/api/src/lib/affiliate/fraud/engine.ts`
- `apps/api/src/lib/affiliate/fraud/service.ts`
- `apps/api/src/lib/affiliate/fraud/fraud-repo.ts`
- `apps/api/src/lib/affiliate/fraud/entity-adapter.ts`
- `apps/api/src/lib/affiliate/fraud/alert.ts`
- `apps/api/src/lib/affiliate/fraud/__tests__/{service,fraud-repo,entity-adapter,alert}.test.ts`
- `apps/api/src/__tests__/ref-rate-limit.test.ts`
- `apps/api/src/__tests__/integration/affiliate-fraud-flow.test.ts`

**No changes to `container.ts` in this commit.** The fraud engine infra is built but not wired — runtime behavior is identical to post-2A for the signup attribution path. Rate-limit is active on `/ref`.

- [ ] **Step 3: Commit**

```bash
git add \
  apps/api/package.json \
  apps/api/package-lock.json \
  apps/api/src/index.ts \
  apps/api/src/lib/affiliate/fraud/ \
  apps/api/src/__tests__/ref-rate-limit.test.ts \
  apps/api/src/__tests__/integration/affiliate-fraud-flow.test.ts

git commit -m "$(cat <<'EOF'
feat(api): affiliate 2E fraud infra + /ref rate-limit (Commit A — additive)

Lay the fraud-detection adapter layer and activate @fastify/rate-limit on
the public /ref/:code redirect without wiring the container yet.

- Install @tn-figueiredo/fraud-detection@0.2.0 --save-exact (+ transitive
  @tn-figueiredo/fraud-detection-utils@0.1.0)
- Install @fastify/rate-limit@9.1.0 --save-exact (Fastify 4 compat; v10
  requires Fastify 5)
- New apps/api/src/lib/affiliate/fraud/:
  - fraud-repo.ts: IFraudRepository backed by affiliate_fraud_flags /
    affiliate_risk_scores with column-name remap (no migration)
  - entity-adapter.ts: IEntityRepository<Affiliate> delegating to
    SupabaseAffiliateRepository; remaps engine's 'paused_fraud' action to
    'paused' with '[fraud-engine]' note prefix (CHECK constraint compat)
  - alert.ts: OnAdminAlert via @/lib/email/provider; HTML-escapes details,
    swallows transport errors
  - service.ts: IAffiliateFraudDetectionService wrapping the engine;
    narrows platform, resolves user email via Supabase, swallows engine
    errors (fraud is a side-observer, never blocks signup)
  - engine.ts: factory composing the engine with env-parsed thresholds
- apps/api/src/index.ts: add trustProxy: true (required for rate-limit IP
  resolution on Vercel); register @fastify/rate-limit inside the /ref
  child scope with max=30 per minute, envelope-compliant 429 body
- Tests: 31 new (7+6+4+8 unit + 6 rate-limit + 2 skipped Category C stub)

container.ts is untouched in this commit — AttributeSignupToAffiliateUseCase
still receives undefined. Commit B performs the atomic container wire.

Spec: docs/superpowers/specs/2026-04-17-affiliate-2e-fraud-detection-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify**

Run: `git log -1 --stat`

Expected: one new commit with ~14 file changes, all under `apps/api/`.

---

# Phase B — Commit B: Atomic container wire

One commit. Replaces the `undefined` placeholder in `container.ts` with an env-gated `fraudService`. This is the single semantic change that activates runtime fraud detection (when the env is set).

## Task 11: Wire `container.ts` (TDD)

**Files:**
- Modify: `apps/api/src/__tests__/lib/affiliate/container.test.ts`
- Modify: `apps/api/src/lib/affiliate/container.ts`

- [ ] **Step 1: Extend container test**

Instead of reflecting on `AttributeSignupToAffiliateUseCase`'s private field (name not part of the public contract), spy on the constructor via `vi.mock('@tn-figueiredo/affiliate', …)` to capture the 3rd argument directly. This is both more robust and a better unit boundary — we test container behavior, not package internals.

Open `apps/api/src/__tests__/lib/affiliate/container.test.ts`. Append these tests (do not replace existing ones):

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// Capture constructor args across rebuilds. Must be mocked BEFORE the module
// imports — vi.mock is hoisted by vitest.
const attributeCtorCalls: unknown[][] = [];

vi.mock('@tn-figueiredo/affiliate', async () => {
  const actual = await vi.importActual<typeof import('@tn-figueiredo/affiliate')>('@tn-figueiredo/affiliate');
  return {
    ...actual,
    AttributeSignupToAffiliateUseCase: class {
      constructor(...args: unknown[]) {
        attributeCtorCalls.push(args);
      }
    },
  };
});

import { __resetAffiliateContainer, buildAffiliateContainer } from '@/lib/affiliate/container';

describe('AffiliateContainer — fraud service gating (2E)', () => {
  const originalFlag = process.env.FRAUD_DETECTION_ENABLED;

  beforeEach(() => {
    attributeCtorCalls.length = 0;
    __resetAffiliateContainer();
  });

  afterAll(() => {
    if (originalFlag === undefined) delete process.env.FRAUD_DETECTION_ENABLED;
    else process.env.FRAUD_DETECTION_ENABLED = originalFlag;
    __resetAffiliateContainer();
  });

  it('passes a non-undefined fraud service when FRAUD_DETECTION_ENABLED=true', () => {
    process.env.FRAUD_DETECTION_ENABLED = 'true';
    buildAffiliateContainer();
    expect(attributeCtorCalls.length).toBe(1);
    const thirdArg = attributeCtorCalls[0][2];
    expect(thirdArg).toBeDefined();
    expect(typeof (thirdArg as { checkSelfReferral?: unknown }).checkSelfReferral).toBe('function');
  });

  it('passes undefined when FRAUD_DETECTION_ENABLED unset (parity with 2A)', () => {
    delete process.env.FRAUD_DETECTION_ENABLED;
    buildAffiliateContainer();
    expect(attributeCtorCalls[0][2]).toBeUndefined();
  });

  it('passes undefined when FRAUD_DETECTION_ENABLED=false', () => {
    process.env.FRAUD_DETECTION_ENABLED = 'false';
    buildAffiliateContainer();
    expect(attributeCtorCalls[0][2]).toBeUndefined();
  });
});
```

This asserts on the **3rd constructor argument** (the documented `fraudDetectionService` position per spec §2 verified excerpt) instead of a private field — stable against any future package refactor that preserves the constructor signature.

Caveat: if the existing container test file already imports `AttributeSignupToAffiliateUseCase` (likely does, for type assertions elsewhere), the `vi.mock` above must be declared **at the top of the file** so hoisting affects all preceding tests equally. If that's disruptive, put the new tests in a sibling file `container.fraud.test.ts` — safer than retrofitting the mock into an existing well-tested file.

- [ ] **Step 2: Run — expect fail**

Run from `apps/api/`: `npx vitest run src/__tests__/lib/affiliate/container.test.ts`

Expected: FAIL — the two true-branch + false-branch tests expect a non-undefined service when the env is truthy, but `container.ts:62` still passes `undefined`.

- [ ] **Step 3: Update `container.ts`**

Open `apps/api/src/lib/affiliate/container.ts`. At the top of the import block, add:

```ts
import { buildFraudEngine } from './fraud/engine';
import { AffiliateFraudAdapter } from './fraud/service';
```

Then replace line 62 (currently `const attributeUseCase = new AttributeSignupToAffiliateUseCase(repo, config, undefined /* fraud — 2E */)`) with:

```ts
  const fraudService = process.env.FRAUD_DETECTION_ENABLED === 'true'
    ? new AffiliateFraudAdapter(buildFraudEngine({ sb, repo }), sb)
    : undefined
  const attributeUseCase = new AttributeSignupToAffiliateUseCase(repo, config, fraudService)
```

No other lines change. The rest of the `buildAffiliateContainer()` body — endUserDeps, adminDeps, cache — stays untouched.

- [ ] **Step 4: Run — expect green**

Run from `apps/api/`: `npx vitest run src/__tests__/lib/affiliate/container.test.ts`

Expected: all container tests pass including the 3 new ones.

- [ ] **Step 5: Full typecheck + test sweep**

```bash
npm run typecheck
```

Expected: 4 workspaces green.

```bash
cd apps/api && npm test -- --reporter=dot
```

Expected: full green. Total test count ≈ existing + 31 (from Commit A) + 3 (container additions) = +34 new tests across A+B. No regressions.

## Task 12: Commit B

- [ ] **Step 1: Verify diff scope**

Run from repo root: `git status && git diff --stat`

Expected only these two files changed:
- `apps/api/src/lib/affiliate/container.ts`
- `apps/api/src/__tests__/lib/affiliate/container.test.ts`

**Do NOT** set `FRAUD_DETECTION_ENABLED=true` in any `.env*` file. Activation is a deploy-time Vercel env change, not a code change.

- [ ] **Step 2: Commit**

```bash
git add \
  apps/api/src/lib/affiliate/container.ts \
  apps/api/src/__tests__/lib/affiliate/container.test.ts

git commit -m "$(cat <<'EOF'
feat(api): affiliate 2E container wire — activate fraud service (Commit B)

Replace the undefined placeholder at container.ts:62 with an env-gated
AffiliateFraudAdapter. When FRAUD_DETECTION_ENABLED=true, the signup
attribution path now routes through FraudDetectionEngine<Affiliate>:
self-referral IP + email-similarity checks write to affiliate_fraud_flags,
risk scores upsert to affiliate_risk_scores, and admin alerts dispatch
via the SP0 email provider.

Default behavior is unchanged: when FRAUD_DETECTION_ENABLED is unset or
'false', the use case receives undefined and the 2A semantics hold
byte-for-byte. Activation is a deploy-time env flip, not a code change.

Tests: 3 new container assertions gate the env branches; 2A parity
preserved. Closes 2A §9 R9 (self-referral gap).

Spec: docs/superpowers/specs/2026-04-17-affiliate-2e-fraud-detection-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verify**

```bash
git log -2 --oneline
```

Expected: two commits A + B on `feat/affiliate-2a-foundation`.

```bash
cd apps/api && npm test -- --reporter=dot
```

Expected: full green.

---

# Phase C — Commit C: Documentation reconciliation

## Task 13: Update `.env.example`

**Files:**
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Append 2E env section**

Open `apps/api/.env.example`. At the bottom of the file (or within an existing affiliate section if one exists), append:

```bash
# ─── Affiliate fraud detection (Phase 2E) ─────────────────────────────
# Set to "true" to enable runtime fraud detection on signup attribution.
# Unset or "false" → AttributeSignupToAffiliateUseCase reverts to 2A behavior (no-op).
# FRAUD_DETECTION_ENABLED=true

# Thresholds (defaults from DEFAULT_FRAUD_CONFIG; tune post-launch from false-positive rate).
# FRAUD_AUTO_PAUSE_THRESHOLD=80
# FRAUD_NOTIFY_ADMIN_THRESHOLD=50

# ─── /ref/:code rate-limit (Phase 2E) ─────────────────────────────────
# @fastify/rate-limit config for the public redirect route. Applies per client IP.
# REF_RATE_LIMIT_MAX=30
# REF_RATE_LIMIT_WINDOW="1 minute"
```

All lines commented; defaults match code. Operators opt in per environment.

## Task 14: 2A spec errata

**Files:**
- Modify: `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`

- [ ] **Step 1: Insert errata block at top**

Open the file. Insert directly after the first-line `# ...` title, before the first `## N.` section:

```markdown
> **Errata — 2026-04-17 post-publication:** The two High-risk gaps accepted
> in §9 (R9 self-referral fraud service + R15 `/ref/:code` rate-limit) are
> addressed in sub-project 3 of the affiliate migration — see
> `docs/superpowers/specs/2026-04-17-affiliate-2e-fraud-detection-design.md`
> and `docs/superpowers/plans/2026-04-17-affiliate-2e-fraud-detection.md`.
> The `undefined /* fraud — 2E */` placeholder at `container.ts:62` is
> replaced with an env-gated `AffiliateFraudAdapter` (kill-switch:
> `FRAUD_DETECTION_ENABLED`). Inline text in §9 is preserved as historical
> record.
```

Do not modify §9 inline. Errata-at-top pattern matches SP0's approach
(`2026-04-17-email-provider-abstraction-design.md` §7.13 errata note).

## Task 15: 2A plan errata

**Files:**
- Modify: `docs/superpowers/plans/2026-04-17-affiliate-2a-foundation.md`

- [ ] **Step 1: Insert matching errata block**

Same pattern as Task 14. Insert directly after the first-line `# ...` title:

```markdown
> **Errata — 2026-04-17 post-publication:** The `undefined /* fraud — 2E */`
> argument at `container.ts:62` (referenced throughout this plan) is replaced
> in sub-project 3 — see
> `docs/superpowers/plans/2026-04-17-affiliate-2e-fraud-detection.md`.
> Inline task text is preserved as historical record.
```

## Task 16: Commit C verification + commit

- [ ] **Step 1: Verify typecheck + tests still green**

```bash
npm run typecheck
cd apps/api && npm test -- --reporter=dot
```

Expected: fully green across all three commits combined.

- [ ] **Step 2: Verify diff scope**

Run from repo root: `git status`

Expected only these files modified in Commit C:
- `apps/api/.env.example`
- `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`
- `docs/superpowers/plans/2026-04-17-affiliate-2a-foundation.md`

- [ ] **Step 3: Commit**

```bash
git add \
  apps/api/.env.example \
  docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md \
  docs/superpowers/plans/2026-04-17-affiliate-2a-foundation.md

git commit -m "$(cat <<'EOF'
docs(affiliate): reconcile 2A → 2E errata + .env.example (Commit C)

- apps/api/.env.example: add Affiliate fraud detection (2E) section with
  FRAUD_DETECTION_ENABLED kill-switch + thresholds; add /ref rate-limit
  knobs (REF_RATE_LIMIT_MAX / REF_RATE_LIMIT_WINDOW). All commented;
  defaults match code.
- affiliate 2A spec: errata note at top linking to 2E spec/plan (R9 +
  R15 resolution).
- affiliate 2A plan: matching errata note.

Spec: docs/superpowers/specs/2026-04-17-affiliate-2e-fraud-detection-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify final branch state**

```bash
git log -3 --oneline
```

Expected: three commits A + B + C on `feat/affiliate-2a-foundation`, each with the subject line indicating its role.

---

## Done Criteria Checklist

- [ ] Typecheck green across 4 workspaces
- [ ] `@tn-figueiredo/fraud-detection@0.2.0` pinned exactly in `apps/api/package.json`
- [ ] `@fastify/rate-limit@9.1.0` pinned exactly in `apps/api/package.json`
- [ ] `apps/api/src/lib/affiliate/fraud/` directory with 5 impl files + 4 test files
- [ ] `apps/api/src/index.ts` has `trustProxy: true` in Fastify options
- [ ] `@fastify/rate-limit` registered inside the `/ref` child scope with `max=30, timeWindow='1 minute'` and `{data,error}` envelope
- [ ] `apps/api/src/lib/affiliate/container.ts:62` no longer contains literal `undefined /* fraud — 2E */`
- [ ] With `FRAUD_DETECTION_ENABLED` unset or `false`: `npm test` green, runtime byte-for-byte identical to post-2A
- [ ] With `FRAUD_DETECTION_ENABLED=true`: `npm test` green including the new 34 unit/route tests
- [ ] Manual smoke: 31 curls to `/ref/ABC` → 30 × 302 + 1 × 429 with `{data:null, error:{code:'RATE_LIMITED', ...}}`
- [ ] Zero SQL migrations authored (2A tables reused verbatim)
- [ ] 2A spec + plan bear errata notes linking to 2E spec/plan
- [ ] `.env.example` carries the fraud + rate-limit section
- [ ] Three commits on `feat/affiliate-2a-foundation`: A (infra + rate-limit), B (container wire), C (docs)
