# Phase 2D Legacy Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **PARTIAL-COMPLETION SEMANTICS (read first).** This sub-project ships **code artifacts + locally-tested SQL** on branch `feat/affiliate-2a-foundation`: the data-copy migration, the destructive drop migration, the Category-C integration test, the rehearsal audit script, and the route/consumer removal. It **does NOT execute the cutover against production data**. Prod execution is a **separate post-branch event** (the "prod-done" criteria in the spec §9). The branch merges with "branch-done" satisfied; prod-done is operator-tracked and DEFERRED. Every task below ends at local Supabase. The only human outside this plan is the post-merge DBA.

**Goal:** Ship the forward-only legacy-to-package data migration (20260417000007), the destructive drop migration (20260417000008), a seed→migrate→verify integration test exercising edge cases E1/E2/E3/E5/E7, the rehearsal audit script, and the deletion of `apps/api/src/routes/affiliate-legacy.ts` + its registration. Close out sub-project 5 of 5 on the long-lived affiliate branch.

**Architecture:**
- Two timestamp-separated SQL migrations. `…000007` is idempotent (every `INSERT` guarded by `WHERE NOT EXISTS`); `…000008` is short and destructive (`DROP TABLE IF EXISTS … CASCADE`).
- Data copy is three `INSERT … SELECT` statements — (i) `affiliate_programs → affiliates`, (ii) `affiliate_referrals_legacy → affiliate_referrals` (with org→primary-user resolution via `org_memberships ORDER BY created_at ASC LIMIT 1`), (iii) derived `affiliate_commissions` for legacy referrals with `subscription_amount_cents > 0`. A final `UPDATE` rebuilds `affiliates.total_earnings_brl` from derived commissions.
- Integration test is Category C, wired into `test:integration` (sub-project 0's script — not `npm test`). Fixture seeds 10 legacy programs covering E1/E2/E3/E5/E7; 11 assertions in §5 of the spec.
- Route deletion + `src/index.ts` surgery (-2 LOC) happens in the same commit as the drop migration so typecheck never goes red between commits.
- Rollback SQL (Appendix A of the spec) is dev-only — prod rollback is "restore Supabase snapshot", acknowledged in R2.

**Tech Stack:** PostgreSQL 15 (Supabase) SQL; TypeScript 5.9 strict; Vitest 4.1.4 (`test:integration` variant introduced in sub-project 0); `@supabase/supabase-js` v2 service-role client; local Supabase CLI for `db:reset`/`db:push:dev`/`db:types`.

**Spec:** `docs/superpowers/specs/2026-04-17-affiliate-2d-legacy-cutover-design.md`

**Branch:** `feat/affiliate-2a-foundation` (long-lived; 2D is sub-project 5 of 5; no branch rename — CC-1).

---

## File Structure

| Path | Disposition | Responsibility |
|---|---|---|
| `supabase/migrations/20260417000007_affiliate_legacy_data_migration.sql` | **new** (Commit A) | Idempotent data copy: `affiliate_programs → affiliates`, `affiliate_referrals_legacy → affiliate_referrals`, derived `affiliate_commissions`, counter rebuild. All `INSERT`s guarded by `WHERE NOT EXISTS`. Wrapped in `BEGIN; … COMMIT;`. |
| `supabase/migrations/20260417000008_affiliate_legacy_drop_tables.sql` | **new** (Commit B) | Destructive: `DROP TABLE IF EXISTS public.affiliate_referrals_legacy CASCADE;` + `DROP TABLE IF EXISTS public.affiliate_programs CASCADE;`. Short, unambiguous, one transaction. |
| `scripts/rehearsal-audit-legacy-cutover.sql` | **new** (Commit A) | 6 audit queries run by the DBA between `…000007` and `…000008` during prod rehearsal: counts, skipped-programs diff (E1/E4), dropped-referrals diff (E3/E7), legacy-vs-derived commission sanity (R13), placeholder name/email surface (E5), counter-rebuild sanity. Non-executing on branch; referenced by §7.2D.R of the spec. |
| `apps/api/src/__tests__/migrations/affiliate-legacy-cutover.test.ts` | **new** (Commit A + extended in Commit B) | Category-C integration test. Commit A: assertions 1–8 (data-copy correctness + idempotency). Commit B: assertions 9–11 (drop + 404 route-deletion). Fixture seeds 10 legacy programs per §5. Timeout 30s. |
| `apps/api/src/routes/affiliate-legacy.ts` | **delete** (Commit B) | Remove the 145-LOC `@deprecated` route handler. No replacement — the package-shipped `/api/affiliate/*` routes are the successor. |
| `apps/api/src/index.ts` | **modify** (Commit B) | Remove `import { affiliateLegacyRoutes } from "./routes/affiliate-legacy.js";` (line 56) and `server.register(affiliateLegacyRoutes, { prefix: "/affiliate-legacy" });` (line 192). Net -2 LOC. |
| `apps/app/src/app/(app)/settings/affiliate/page.tsx` | **verify only** (Commit B) | Grep sweep — 2B is expected to have already rewritten this against `/api/affiliate/*`. If 2D finds surviving `/api/affiliate-legacy/*` calls, remove them in the 2D commit with a one-line diff note explaining each (means 2B missed them). Zero-diff outcome is the expected path. |
| `packages/shared/src/types/database.ts` | **regen** (end of Commit B) | Regenerated via `npm run db:types` after both migrations apply. `affiliate_programs` and `affiliate_referrals_legacy` types are gone. Auto-commit under Commit B (same file, bigger diff — typecheck gate enforces consistency). |

**No changes to:** `packages/shared/src/schemas/**`, `packages/shared/src/mappers/db.ts` (no new package-schema surface), `apps/api/.env.example`, Fastify middleware, any UI component under `apps/app/src/components/**`.

---

# Phase A — Commit A: data-migration SQL + integration test (non-destructive)

All of Phase A is additive. No existing file is deleted; no route is unregistered. At end of Phase A, `npm run typecheck` and `npm test` are both green. The branch is safely pausable at this checkpoint.

## Task 1: Pre-flight verification

**Files:** none (verification only).

- [ ] **Step 1: Confirm prior sub-projects landed on branch**

Run from repo root:

```bash
git log --oneline feat/affiliate-2a-foundation -- supabase/migrations/20260417000001_affiliate_001_schema.sql supabase/migrations/20260417000006_affiliate_triggers_counters.sql
```

Expected: both files appear in the log (meaning 2A foundation migrations are on branch). If either is missing, stop — 2D is premature.

- [ ] **Step 2: Confirm `main` has gained no new migrations since last rebase (CC-2)**

Run:

```bash
git fetch origin main
git log origin/main..HEAD --reverse --oneline -- supabase/migrations/ | head -5
git log HEAD..origin/main --oneline -- supabase/migrations/
```

Expected: the second command's output is **empty**. If it contains new migrations, rebase before continuing (separate commit; do not bundle into 2D).

- [ ] **Step 3: Confirm local Supabase is up and the full chain applies clean**

Run from repo root:

```bash
npm run db:start
npm run db:reset
```

Expected: `db:reset` applies all 16 migrations through `…000006` without error. The `affiliate_programs` and `affiliate_referrals_legacy` tables exist; the package tables (`affiliates`, `affiliate_referrals`, `affiliate_commissions`) exist.

- [ ] **Step 4: Confirm legacy route and registration are still present (baseline)**

Run from repo root:

```bash
grep -n "affiliateLegacyRoutes\|affiliate-legacy" apps/api/src/index.ts
ls -la apps/api/src/routes/affiliate-legacy.ts
```

Expected:
- `src/index.ts` line 56 imports `affiliateLegacyRoutes`; line 192 registers under `/affiliate-legacy`.
- `affiliate-legacy.ts` exists (145 LOC).

These are the Commit B deletion targets. Do not touch yet.

- [ ] **Step 5: Confirm `apps/app` consumer is already rewritten (2B landed)**

Run from repo root:

```bash
grep -rn "/api/affiliate-legacy" apps/app/ || echo "zero — 2B cleanup complete"
```

Expected: "zero — 2B cleanup complete". If non-zero, note the file/line — Task 13 Step 4 (the commit-B sweep) will decide whether to remove them or flag as a spec-amendment. **Record the count here for later cross-check**; do not edit yet.

## Task 2: Write the integration-test fixture (TDD red)

Test-first per superpowers:test-driven-development. The test imports the migration file at runtime and runs it via `psql` or via `supabase db push --local` invocation — whichever the harness supports. Seed data is inserted with the service-role client, then the migration SQL is applied, then assertions query both legacy and new tables.

**Files:**
- Create: `apps/api/src/__tests__/migrations/affiliate-legacy-cutover.test.ts`

- [ ] **Step 1: Verify target directory exists**

Run from repo root:

```bash
ls apps/api/src/__tests__/
```

Expected: directory exists (currently houses `auth.test.ts`, `health.test.ts`, `integration/`, `jobs/`, `lib/`, `routes/`). Create `migrations/` sub-directory implicitly by the file create.

- [ ] **Step 2: Write the test file (skeleton with all 11 assertions expressed, Commit B-only assertions 9–11 marked `it.todo`)**

Create `apps/api/src/__tests__/migrations/affiliate-legacy-cutover.test.ts`:

```ts
/**
 * Integration test for Phase 2D legacy cutover.
 * Category C per CLAUDE.md — DB-hitting. Wired into `test:integration`, NOT `npm test`.
 *
 * Fixture: 10 legacy affiliate_programs covering edge cases E1/E2/E3/E5/E7 from
 * docs/superpowers/specs/2026-04-17-affiliate-2d-legacy-cutover-design.md §8.
 *
 * Runner: `npm run db:reset && npm run test:integration -- affiliate-legacy-cutover`
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { createServiceClient } from '@/lib/supabase/index.js';
import { buildServer } from '@/index.js';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const MIG_007 = path.join(REPO_ROOT, 'supabase/migrations/20260417000007_affiliate_legacy_data_migration.sql');
const MIG_008 = path.join(REPO_ROOT, 'supabase/migrations/20260417000008_affiliate_legacy_drop_tables.sql');

function applyMigration(sqlPath: string): void {
  // supabase CLI applies the SQL against the local stack using the service-role
  // connection. Equivalent to `psql $LOCAL_DB_URL -f <path>`.
  execSync(`supabase db push --local --include-all 2>/dev/null || psql "$LOCAL_DB_URL" -f "${sqlPath}"`, {
    cwd: REPO_ROOT,
    stdio: 'pipe',
  });
}

interface SeedIds {
  // Recorded during beforeAll; used in assertions.
  programIds: string[];          // 10 programs
  expectedSkippedCodeCollision: string;  // E1 — the BT-COLLIDE code
  expectedMigratedUserIds: string[];     // 9 users — 10 programs minus 1 E1 skip
  expectedDroppedReferralIds: string[];  // E3 dedupe + E7 zero-member-org
  expectedCommissionReferralIds: string[]; // referrals with subscription_amount_cents > 0 AND status IN (approved|paid|refunded)
  refundedReferralIds: string[];         // subset of above — drives assertion 6
}

const seed: SeedIds = {
  programIds: [],
  expectedSkippedCodeCollision: 'BT-COLLIDE0',
  expectedMigratedUserIds: [],
  expectedDroppedReferralIds: [],
  expectedCommissionReferralIds: [],
  refundedReferralIds: [],
};

describe('Phase 2D — legacy cutover migration', () => {
  beforeAll(async () => {
    // 1. Reset DB to …000006 baseline.
    execSync('npm run db:reset', { cwd: REPO_ROOT, stdio: 'pipe' });

    const sb = createServiceClient();

    // 2. Seed auth.users (10 primary users; user 8 has email=NULL for E5).
    //    auth.users rows are inserted directly — local Supabase allows service_role.
    // 3. Seed organizations + org_memberships (user 8 owns an org with 0 members post-seed for E7).
    // 4. Seed a pre-existing affiliates row with code='BT-COLLIDE0' for E1.
    // 5. Seed 10 affiliate_programs:
    //    - programs 1-5: happy path (commission_pct=20, 2 referrals each = 10 referrals)
    //    - program 6: commission_pct=100.00 → commission_rate=1.0 (E2 boundary)
    //    - program 7: code='BT-COLLIDE0' (E1 collision, expect skip)
    //    - program 8: user with NULL email (E5; expect <code>@legacy.invalid placeholder)
    //    - program 9: referred_org_id → org with 0 members (E7; expect referral drop)
    //    - program 10: referred_org_id → org whose primary user is also a referred
    //      party of another affiliate (E3; expect dedupe-by-first_touch_at)
    //
    //    Referrals breakdown:
    //    - 5 happy-path programs × 2 referrals = 10
    //    - program 6: 1 referral, status='paid', subscription_amount_cents=10000, commission_cents=10000
    //    - program 7: skipped entirely (no corresponding affiliate created)
    //    - program 8: 1 referral (resolvable user)
    //    - program 9: 1 referral, but org has 0 members → drop
    //    - program 10: 1 referral colliding with a happy-path user → drop earlier or later
    //    Status mix: 4× pending, 3× approved, 3× paid, 2× refunded
    //
    //    See spec §5 fixture shape.

    // (Actual seed SQL is ~80 lines of INSERT statements; populated here.)
    // The test records seed.programIds / seed.expectedSkippedCodeCollision /
    // seed.expectedDroppedReferralIds / seed.expectedCommissionReferralIds /
    // seed.refundedReferralIds for the assertions below.
  }, 60_000);

  afterAll(async () => {
    // Do not clean up — `db:reset` at next test-run start is the cleaner.
  });

  // === Assertions 1–8 (Commit A — assertions that pass after …000007 applies) ===

  it('1. affiliates count increases by exactly 9 after migration (10 programs minus 1 E1 skip)', async () => {
    applyMigration(MIG_007);
    const sb = createServiceClient();
    const { count } = await sb.from('affiliates').select('*', { count: 'exact', head: true }).eq('affiliate_type', 'internal').eq('tier', 'nano');
    expect(count).toBe(9);
  });

  it('2. every migrated affiliate has non-null name/email, status=active, tier=nano, commission_rate = pct/100', async () => {
    const sb = createServiceClient();
    const { data } = await sb.from('affiliates').select('id, code, name, email, status, tier, commission_rate').eq('affiliate_type', 'internal');
    expect(data).toHaveLength(9);
    for (const row of data ?? []) {
      expect(row.name).not.toBeNull();
      expect(row.email).not.toBeNull();
      expect(row.status).toBe('active');
      expect(row.tier).toBe('nano');
      expect(Number(row.commission_rate)).toBeGreaterThan(0);
      expect(Number(row.commission_rate)).toBeLessThanOrEqual(1);
    }
  });

  it('3. affiliate_referrals count matches seed minus E3 dedupe and E7 zero-member-org drops', async () => {
    const sb = createServiceClient();
    const { count } = await sb.from('affiliate_referrals').select('*', { count: 'exact', head: true });
    // 10 happy-path referrals + 1 E2 + 1 E5 + 0 from E1 program + 0 from E7 (dropped) + 0 from E3 dupe = 12
    expect(count).toBe(12);
  });

  it('4. every migrated referral has a resolvable (non-null, referenced) user_id', async () => {
    const sb = createServiceClient();
    const { data } = await sb.from('affiliate_referrals').select('user_id');
    expect(data).toHaveLength(12);
    for (const row of data ?? []) {
      expect(row.user_id).not.toBeNull();
    }
  });

  it('5. affiliate_commissions count equals legacy referrals with subscription_amount_cents>0 AND status IN (approved, paid, refunded)', async () => {
    const sb = createServiceClient();
    const { count } = await sb.from('affiliate_commissions').select('*', { count: 'exact', head: true });
    expect(count).toBe(seed.expectedCommissionReferralIds.length);
  });

  it('6. refunded legacy rows → commission.status=cancelled AND referral.attribution_status=expired', async () => {
    const sb = createServiceClient();
    for (const refId of seed.refundedReferralIds) {
      // refId in the legacy schema; trace forward by the referral's user-id mapping.
      // The fixture records the expected new-schema referral_id via its user_id;
      // assertions query `affiliate_commissions` where `referral_id = <new-id>`.
      const { data: commission } = await sb.from('affiliate_commissions').select('status, referral_id').eq('referral_id', refId).single();
      expect(commission?.status).toBe('cancelled');
      const { data: referral } = await sb.from('affiliate_referrals').select('attribution_status').eq('id', refId).single();
      expect(referral?.attribution_status).toBe('expired');
    }
  });

  it('7. affiliates.total_earnings_brl equals SUM(total_brl) of derived commissions per affiliate', async () => {
    const sb = createServiceClient();
    const { data: aff } = await sb.from('affiliates').select('id, total_earnings_brl').eq('affiliate_type', 'internal');
    for (const a of aff ?? []) {
      const { data: sum } = await sb.from('affiliate_commissions').select('total_brl').eq('affiliate_id', a.id);
      const expected = (sum ?? []).reduce((acc: number, r: { total_brl: number }) => acc + Number(r.total_brl), 0);
      expect(Number(a.total_earnings_brl)).toBe(expected);
    }
  });

  it('8. running …000007 a second time is a no-op (idempotency guard)', async () => {
    const sb = createServiceClient();
    const before = await sb.from('affiliates').select('*', { count: 'exact', head: true });
    const beforeRef = await sb.from('affiliate_referrals').select('*', { count: 'exact', head: true });
    const beforeComm = await sb.from('affiliate_commissions').select('*', { count: 'exact', head: true });
    applyMigration(MIG_007);
    const after = await sb.from('affiliates').select('*', { count: 'exact', head: true });
    const afterRef = await sb.from('affiliate_referrals').select('*', { count: 'exact', head: true });
    const afterComm = await sb.from('affiliate_commissions').select('*', { count: 'exact', head: true });
    expect(after.count).toBe(before.count);
    expect(afterRef.count).toBe(beforeRef.count);
    expect(afterComm.count).toBe(beforeComm.count);
  });

  // === Assertions 9–11 (Commit B — land after drop migration + route deletion) ===

  it.todo('9. after …000008 applies, legacy table lookups return NULL via to_regclass');
  it.todo('10. post-drop affiliates count unchanged (CASCADE did not null-cascade data)');
  it.todo('11. GET /api/affiliate-legacy/program returns 404 with {data:null, error:{code:NOT_FOUND}} envelope');
}, { timeout: 30_000 });
```

- [ ] **Step 3: Run the test to confirm it fails with the expected missing-migration error**

Run from `apps/api/`:

```bash
npm run test:integration -- affiliate-legacy-cutover
```

Expected: FAIL with "ENOENT: no such file or directory … supabase/migrations/20260417000007_affiliate_legacy_data_migration.sql". This is the RED state per TDD. Do not proceed to green until Task 3 lands the migration file.

## Task 3: Write the data-migration SQL (TDD green for assertions 1–8)

**Files:**
- Create: `supabase/migrations/20260417000007_affiliate_legacy_data_migration.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260417000007_affiliate_legacy_data_migration.sql`:

```sql
-- affiliate@2D — legacy data migration
-- Idempotent: safe to run multiple times. NOT-EXISTS guards on every INSERT.
-- Assumes package migrations 20260417000001..000006 have applied.
--
-- Spec: docs/superpowers/specs/2026-04-17-affiliate-2d-legacy-cutover-design.md §3
-- Rollback (DEV ONLY): Appendix A of the above spec. Prod rollback = snapshot restore.

BEGIN;

-- 1. Copy affiliate_programs → affiliates
INSERT INTO public.affiliates (
    user_id, code, name, email, status, tier, commission_rate, affiliate_type,
    total_referrals, total_clicks, total_conversions, total_earnings_brl,
    contract_version, created_at, updated_at
)
SELECT
    ap.user_id,
    ap.code,
    COALESCE(au.raw_user_meta_data->>'full_name', 'Legacy Affiliate'),
    COALESCE(au.email, ap.code || '@legacy.invalid'),
    'active',
    'nano',
    ap.commission_pct / 100.0,
    'internal',
    ap.total_referrals,
    0, 0, 0,
    1,
    ap.created_at,
    ap.created_at
FROM public.affiliate_programs ap
LEFT JOIN auth.users au ON au.id = ap.user_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.affiliates a
    WHERE a.user_id = ap.user_id OR a.code = ap.code
);

-- 2. Copy affiliate_referrals_legacy → affiliate_referrals
--    Resolve referred_org_id → user via org_memberships earliest member.
--    Skip rows where resolution is NULL (E7) or the user already has a referral (E3/R10).
INSERT INTO public.affiliate_referrals (
    affiliate_id, affiliate_code, user_id, click_id, attribution_status,
    signup_date, window_end, converted_at, platform, signup_ip_hash, created_at
)
SELECT
    a.id,
    a.code,
    (SELECT user_id FROM public.org_memberships
      WHERE org_id = arl.referred_org_id
      ORDER BY created_at ASC LIMIT 1),
    NULL,
    CASE arl.status
      WHEN 'refunded' THEN 'expired'
      ELSE 'active'
    END,
    arl.first_touch_at,
    arl.first_touch_at + INTERVAL '12 months',
    arl.conversion_at,
    NULL,
    NULL,
    arl.created_at
FROM public.affiliate_referrals_legacy arl
JOIN public.affiliate_programs ap ON ap.id = arl.affiliate_program_id
JOIN public.affiliates a ON a.user_id = ap.user_id AND a.code = ap.code
WHERE (SELECT user_id FROM public.org_memberships
        WHERE org_id = arl.referred_org_id
        ORDER BY created_at ASC LIMIT 1) IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.affiliate_referrals ar
      WHERE ar.user_id = (SELECT user_id FROM public.org_memberships
                            WHERE org_id = arl.referred_org_id
                            ORDER BY created_at ASC LIMIT 1)
  );

-- 3. Derive affiliate_commissions from approved/paid/refunded legacy referrals
INSERT INTO public.affiliate_commissions (
    affiliate_id, affiliate_code, user_id, referral_id, payout_id,
    payment_amount, stripe_fee, net_amount, commission_rate, commission_brl,
    fixed_fee_brl, total_brl, payment_type, status, created_at
)
SELECT
    ar.affiliate_id,
    ar.affiliate_code,
    ar.user_id,
    ar.id,
    NULL,
    arl.subscription_amount_cents,
    0,
    arl.subscription_amount_cents,
    a.commission_rate,
    COALESCE(arl.commission_cents, ROUND(arl.subscription_amount_cents * a.commission_rate)::INTEGER),
    NULL,
    COALESCE(arl.commission_cents, ROUND(arl.subscription_amount_cents * a.commission_rate)::INTEGER),
    'monthly',
    CASE arl.status
      WHEN 'paid'     THEN 'paid'
      WHEN 'refunded' THEN 'cancelled'
      ELSE 'pending'
    END,
    COALESCE(arl.conversion_at, arl.first_touch_at)
FROM public.affiliate_referrals_legacy arl
JOIN public.affiliate_programs ap ON ap.id = arl.affiliate_program_id
JOIN public.affiliates a   ON a.user_id = ap.user_id AND a.code = ap.code
JOIN public.affiliate_referrals ar
  ON ar.affiliate_id = a.id
 AND ar.user_id = (SELECT user_id FROM public.org_memberships
                     WHERE org_id = arl.referred_org_id
                     ORDER BY created_at ASC LIMIT 1)
WHERE arl.subscription_amount_cents IS NOT NULL
  AND arl.subscription_amount_cents > 0
  AND arl.status IN ('approved', 'paid', 'refunded')
  AND NOT EXISTS (
      SELECT 1 FROM public.affiliate_commissions ac
      WHERE ac.referral_id = ar.id
  );

-- 4. Rebuild total_earnings_brl from derived commissions
UPDATE public.affiliates a
SET total_earnings_brl = COALESCE(sums.s, 0)
FROM (
    SELECT affiliate_id, SUM(total_brl) AS s
    FROM public.affiliate_commissions
    GROUP BY affiliate_id
) sums
WHERE sums.affiliate_id = a.id;

COMMIT;
```

- [ ] **Step 2: Run the integration test and expect assertions 1–8 to pass; 9–11 remain `todo`**

Run from `apps/api/`:

```bash
npm run test:integration -- affiliate-legacy-cutover
```

Expected: 8 passing, 3 todo. If any of 1–8 fail, `git diff` the migration against the Appendix B SQL in the spec and reconcile.

- [ ] **Step 3: Re-run to verify idempotency via the in-test assertion 8**

The `it('8. running …000007 a second time is a no-op')` assertion already exercises this. If it fails, the `WHERE NOT EXISTS` guards are wrong — fix before moving on.

- [ ] **Step 4: Map each edge case E1–E16 to a test-level or audit-level check**

Create a local checklist (not a file — just verify each is covered somewhere):

| E# | Covered by | Where |
|---|---|---|
| E1 | Assertion 1 (count = 9 = 10 − 1 code-collision) | test fixture program 7 + assertion 1 |
| E2 | Assertion 2 (`commission_rate ≤ 1`); fixture program 6 at boundary | test assertion 2 |
| E3 | Assertion 3 (dedupe via `NOT EXISTS` on `user_id`); fixture program 10 | test assertion 3 |
| E4 | Same `NOT EXISTS` guard as E1 — surfaced via audit script query 2 | audit `rehearsal-audit-legacy-cutover.sql` §2 |
| E5 | Assertion 2 + fixture program 8; email falls back to `<code>@legacy.invalid` | test assertion 2 |
| E6 | No automated check — audit script §5 surfaces placeholder names; operator review | audit §5; spec R6 |
| E7 | Assertion 3 (zero-member-org drop); fixture program 9 | test assertion 3 |
| E8 | Assertion 7 (`total_clicks=0`) — accepted per Non-goals | test assertion 2 |
| E9 | Static: all commissions get `payment_type='monthly'` | migration SQL inspection |
| E10 | Assertion 7 (rebuild semantics) | test assertion 7 |
| E11 | Unit verified in 2A — migration preserves cent values 1:1; no automated 2D check | spec §4 |
| E12 | Assertion 5 (subscription_amount_cents > 0 filter) | test assertion 5 |
| E13 | Audit script §4 (commission_cents vs derived diff) | audit §4 |
| E14 | Audit script §1 pre-check for NULL first_touch_at | audit §1 (pre-migration assertion) |
| E15 | Same as E3 — dedupe by `user_id` | test assertion 3 |
| E16 | Length-fits check via `affiliates.code VARCHAR(12)` constraint — hard-fail at INSERT if exceeded; rehearsal catches | migration constraint |

All 16 edge cases are mapped. E11/E9 are static (code inspection); E6/E13/E14 are audit-only; the rest are assertion-backed.

## Task 4: Write the rehearsal audit script

**Files:**
- Create: `scripts/rehearsal-audit-legacy-cutover.sql`

- [ ] **Step 1: Create the audit script**

Create `scripts/rehearsal-audit-legacy-cutover.sql`:

```sql
-- scripts/rehearsal-audit-legacy-cutover.sql
-- Run between supabase/migrations/20260417000007 and …000008 during prod rehearsal.
-- Each query's output should be explainable by an E# edge case from spec §8.
-- See docs/superpowers/specs/2026-04-17-affiliate-2d-legacy-cutover-design.md §7.2D.R.

-- 1. Counts (high-level reconciliation)
SELECT 'affiliate_programs' AS src, COUNT(*) FROM public.affiliate_programs
UNION ALL SELECT 'affiliates (migrated)', COUNT(*) FROM public.affiliates
  WHERE affiliate_type = 'internal' AND tier = 'nano' AND status = 'active' AND total_clicks = 0
UNION ALL SELECT 'affiliate_referrals_legacy', COUNT(*) FROM public.affiliate_referrals_legacy
UNION ALL SELECT 'affiliate_referrals (all)', COUNT(*) FROM public.affiliate_referrals
UNION ALL SELECT 'affiliate_commissions (all)', COUNT(*) FROM public.affiliate_commissions;

-- 1b. Pre-migration assertion — catch any NULL first_touch_at (E14)
SELECT 'E14 null first_touch_at' AS check, COUNT(*)
FROM public.affiliate_referrals_legacy WHERE first_touch_at IS NULL;

-- 2. Skipped affiliate_programs (E1 code-collision / E4 user-already-affiliated)
SELECT ap.id, ap.user_id, ap.code, 'skipped' AS reason
FROM public.affiliate_programs ap
WHERE NOT EXISTS (SELECT 1 FROM public.affiliates a WHERE a.user_id = ap.user_id AND a.code = ap.code);

-- 3. Dropped referrals (E3 dedupe / E7 zero-member-org)
SELECT arl.id, arl.affiliate_program_id, arl.referred_org_id,
       (SELECT user_id FROM public.org_memberships
         WHERE org_id = arl.referred_org_id
         ORDER BY created_at ASC LIMIT 1) AS resolved_user
FROM public.affiliate_referrals_legacy arl
WHERE NOT EXISTS (
    SELECT 1 FROM public.affiliate_referrals ar
    WHERE ar.user_id = (SELECT user_id FROM public.org_memberships
                          WHERE org_id = arl.referred_org_id
                          ORDER BY created_at ASC LIMIT 1)
);

-- 4. Commission-amount sanity check (R13) — legacy commission_cents vs derived
SELECT arl.id,
       arl.commission_cents AS legacy,
       ROUND(arl.subscription_amount_cents * (ap.commission_pct / 100.0))::INT AS derived,
       arl.commission_cents - ROUND(arl.subscription_amount_cents * (ap.commission_pct / 100.0))::INT AS diff
FROM public.affiliate_referrals_legacy arl
JOIN public.affiliate_programs ap ON ap.id = arl.affiliate_program_id
WHERE arl.commission_cents IS NOT NULL
  AND arl.subscription_amount_cents IS NOT NULL
  AND arl.commission_cents <> ROUND(arl.subscription_amount_cents * (ap.commission_pct / 100.0))::INT;

-- 5. Placeholder name/email surface (E5)
SELECT id, code, name, email FROM public.affiliates
WHERE email LIKE '%@legacy.invalid' OR name = 'Legacy Affiliate';

-- 6. Counter rebuild sanity (E10)
SELECT a.id, a.code, a.total_earnings_brl,
       COALESCE((SELECT SUM(total_brl) FROM public.affiliate_commissions WHERE affiliate_id = a.id), 0) AS sum_from_commissions
FROM public.affiliates a
WHERE a.affiliate_type = 'internal'
  AND a.total_earnings_brl <> COALESCE((SELECT SUM(total_brl) FROM public.affiliate_commissions WHERE affiliate_id = a.id), 0);
```

- [ ] **Step 2: Dry-run the audit against local after Task 3 applied**

Run from repo root:

```bash
psql "$(supabase status --output env | grep DB_URL | cut -d= -f2 | tr -d '\"')" -f scripts/rehearsal-audit-legacy-cutover.sql
```

Expected: 6 result sets. §1 counts match the test fixture (10 legacy programs → 9 affiliates; 12 migrated referrals; N commissions). §2 shows exactly one row (program 7, E1). §3 shows exactly 2 rows (program 9 E7, program 10 E3). §4 may show rows if fixture has R13 cases (not seeded by default → empty). §5 shows program 8 (E5). §6 is empty (rebuild is correct).

If any query outputs an unexplained row, the migration is wrong — fix before committing.

## Task 5: Commit A verification + commit

- [ ] **Step 1: Full verification sweep**

Run from repo root:

```bash
npm run typecheck
```

Expected: 4 workspaces green.

```bash
cd apps/api && npm test
```

Expected: all existing tests pass. The new integration test does **not** run under `npm test` — it's excluded via the Commit A of sub-project 0's vitest integration config. Total count unchanged by this commit.

```bash
cd ../.. && npm run db:reset && cd apps/api && npm run test:integration -- affiliate-legacy-cutover
```

Expected: 8 passing, 3 `todo`. Timeout under 30s.

- [ ] **Step 2: Review staged diff**

Run:

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale && git status && git diff --stat
```

Expected files created:
- `supabase/migrations/20260417000007_affiliate_legacy_data_migration.sql`
- `scripts/rehearsal-audit-legacy-cutover.sql`
- `apps/api/src/__tests__/migrations/affiliate-legacy-cutover.test.ts`

No modifications to existing files in Commit A.

- [ ] **Step 3: Commit A**

Run:

```bash
git add \
  supabase/migrations/20260417000007_affiliate_legacy_data_migration.sql \
  scripts/rehearsal-audit-legacy-cutover.sql \
  apps/api/src/__tests__/migrations/affiliate-legacy-cutover.test.ts

git commit -m "$(cat <<'EOF'
feat(api): affiliate 2D — legacy data-migration SQL + integration test

Forward-only, idempotent copy of legacy affiliate_programs and
affiliate_referrals_legacy into the package schema (affiliates,
affiliate_referrals, affiliate_commissions).

- 20260417000007_affiliate_legacy_data_migration.sql: three INSERT … SELECT
  statements with WHERE NOT EXISTS guards; post-migration UPDATE rebuilds
  affiliates.total_earnings_brl from derived commissions. Org→primary-user
  resolution via org_memberships earliest-member (preserves the convention
  inherited from the pre-2A affiliate.ts).
- scripts/rehearsal-audit-legacy-cutover.sql: 6 audit queries the DBA runs
  between …000007 and …000008 during prod rehearsal; every non-empty output
  row must map to an E# edge case from spec §8.
- apps/api/src/__tests__/migrations/affiliate-legacy-cutover.test.ts:
  Category-C integration test (wired into test:integration, not npm test).
  Seeds 10 legacy programs covering E1/E2/E3/E5/E7 and asserts 8 of the 11
  spec assertions (assertions 9–11 marked todo; land in Commit B alongside
  the drop migration + route deletion).

NON-DESTRUCTIVE COMMIT. Legacy tables and the affiliate-legacy routes are
still live; apps/app settings page is unchanged (2B already rewrote it).

Spec: docs/superpowers/specs/2026-04-17-affiliate-2d-legacy-cutover-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify**

Run:

```bash
git log -1 --stat
```

Expected: one new commit, 3 files created, ~360 LOC total.

---

# Phase B — Commit B: drop migration + route deletion + consumer sweep (atomic)

All of Phase B lands in ONE commit. The route deletion, the `src/index.ts` edit, the drop migration, the extended assertions (9/10/11), and the regenerated types all belong together so typecheck never goes red mid-sequence. The commit is the **point of no return on branch** (the drop migration's destructive SQL is now checked in; the legacy route handler is gone from the tree).

## Task 6: Write the drop migration (TDD red for assertions 9/10)

**Files:**
- Create: `supabase/migrations/20260417000008_affiliate_legacy_drop_tables.sql`

- [ ] **Step 1: Promote `it.todo` to `it` for assertions 9 and 10**

Edit `apps/api/src/__tests__/migrations/affiliate-legacy-cutover.test.ts`. Replace:

```ts
  it.todo('9. after …000008 applies, legacy table lookups return NULL via to_regclass');
  it.todo('10. post-drop affiliates count unchanged (CASCADE did not null-cascade data)');
```

with:

```ts
  it('9. after …000008 applies, legacy table lookups return NULL via to_regclass', async () => {
    applyMigration(MIG_008);
    const sb = createServiceClient();
    const { data } = await sb.rpc('_regclass_check' as never, {}).single();
    // Fallback: direct SQL via service-role pg.query wrapper. The test harness
    // exposes a raw-SQL helper for this Category-C path.
    const { data: progs } = await (sb as any).rpc('to_regclass', { table: 'public.affiliate_programs' });
    const { data: legacy } = await (sb as any).rpc('to_regclass', { table: 'public.affiliate_referrals_legacy' });
    expect(progs).toBeNull();
    expect(legacy).toBeNull();
  });

  it('10. post-drop affiliates count unchanged (CASCADE did not null-cascade package-table data)', async () => {
    const sb = createServiceClient();
    const { count } = await sb.from('affiliates').select('*', { count: 'exact', head: true }).eq('affiliate_type', 'internal');
    expect(count).toBe(9);
  });
```

(The `to_regclass` invocation may need to be replaced with a raw SQL query helper if the Supabase JS client doesn't expose `rpc('to_regclass')` — in that case use a `psql` sub-process call. The harness pattern mirrors `applyMigration`.)

- [ ] **Step 2: Run tests — expect 9 and 10 to fail because MIG_008 doesn't exist yet**

Run from `apps/api/`:

```bash
npm run test:integration -- affiliate-legacy-cutover
```

Expected: 8 passing, 2 failing (assertion 9 fails because `MIG_008` ENOENT; assertion 10 is unreached). Assertion 11 still `todo`. This is the TDD RED state.

- [ ] **Step 3: Create the drop migration file**

Create `supabase/migrations/20260417000008_affiliate_legacy_drop_tables.sql`:

```sql
-- affiliate@2D — drop legacy tables. Destructive.
-- Apply only after rehearsal audit (scripts/rehearsal-audit-legacy-cutover.sql)
-- is clean and every non-empty row maps to a documented E# edge case.
--
-- Prod rollback = Supabase snapshot restore. Dev rollback = Appendix A of
-- docs/superpowers/specs/2026-04-17-affiliate-2d-legacy-cutover-design.md.

BEGIN;

DROP TABLE IF EXISTS public.affiliate_referrals_legacy CASCADE;
DROP TABLE IF EXISTS public.affiliate_programs        CASCADE;

COMMIT;
```

- [ ] **Step 4: Run tests — expect 9 and 10 to now pass**

Run from `apps/api/`:

```bash
npm run test:integration -- affiliate-legacy-cutover
```

Expected: 10 passing, 1 todo (assertion 11). If either 9 or 10 fails, the issue is either the `to_regclass` invocation or a CASCADE ordering bug — the spec's drop order (`affiliate_referrals_legacy` before `affiliate_programs`) is the correct dependency direction.

## Task 7: Delete the legacy route handler + unregister

**Files:**
- Delete: `apps/api/src/routes/affiliate-legacy.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Delete the route handler**

Run from repo root:

```bash
rm apps/api/src/routes/affiliate-legacy.ts
```

- [ ] **Step 2: Remove the import and register lines from `src/index.ts`**

Edit `apps/api/src/index.ts`:

Remove line 56:
```ts
import { affiliateLegacyRoutes } from "./routes/affiliate-legacy.js";
```

Remove line 192:
```ts
server.register(affiliateLegacyRoutes, { prefix: "/affiliate-legacy" });
```

- [ ] **Step 3: Typecheck**

Run from repo root:

```bash
npm run typecheck
```

Expected: green across 4 workspaces. The `'affiliate_referrals_legacy' as never` cast (formerly in the deleted file) is also gone.

If typecheck fails because `packages/shared/src/types/database.ts` still contains references to the dropped tables, that's fine — the regen in Task 10 Step 3 cleans them up. But if any **app code** references those types, the regen will catch it. If that happens, remove the app-code references in this same commit.

## Task 8: Promote assertion 11 (route 404 check)

**Files:**
- Modify: `apps/api/src/__tests__/migrations/affiliate-legacy-cutover.test.ts`

- [ ] **Step 1: Replace the `it.todo(11)` with a real assertion**

Replace:

```ts
  it.todo('11. GET /api/affiliate-legacy/program returns 404 with {data:null, error:{code:NOT_FOUND}} envelope');
```

with:

```ts
  it('11. GET /api/affiliate-legacy/program returns 404 with {data:null, error:{code:NOT_FOUND}} envelope', async () => {
    const app = await buildServer();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/affiliate-legacy/program',
        headers: {
          'x-internal-key': process.env.INTERNAL_API_KEY ?? 'test-key',
          'x-user-id': '00000000-0000-0000-0000-000000000001',
        },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body).toEqual({
        data: null,
        error: { code: 'NOT_FOUND', message: expect.stringMatching(/not found/i) },
      });
    } finally {
      await app.close();
    }
  });
```

- [ ] **Step 2: Run the full integration test**

Run from `apps/api/`:

```bash
npm run test:integration -- affiliate-legacy-cutover
```

Expected: 11 passing, 0 todo. If assertion 11 fails with a 500 (thrown error) instead of a 404, the Fastify global `setErrorHandler` wasn't invoked — check that the rewrite of the error envelope in `sendError`/`fastify-errors.ts` handles the "no route" case correctly. If it returns 404 but the body shape is wrong, the `notFoundHandler` may need adjustment (unlikely — no changes expected).

## Task 9: Consumer sweep (apps/app)

**Files:**
- Inspect / possibly modify: `apps/app/src/app/(app)/settings/affiliate/page.tsx`

- [ ] **Step 1: Grep for surviving `/api/affiliate-legacy/*` call sites**

Run from repo root:

```bash
grep -rn "/api/affiliate-legacy" apps/
```

Expected: **zero matches**. This is the "2B cleanup complete" state noted in Task 1 Step 5.

- [ ] **Step 2: If non-zero matches, remove and document**

For each surviving match:
1. Read the enclosing call site (usually `fetch('/api/affiliate-legacy/…')`).
2. Replace with the package equivalent:
   - `/api/affiliate-legacy/program` (GET) → `/api/affiliate/me`
   - `/api/affiliate-legacy/program` (POST) → `/api/affiliate/apply`
   - `/api/affiliate-legacy/referrals` (GET) → `/api/affiliate/referrals`
3. Add a one-line diff note in the commit body explaining each survivor as a 2B miss.

If the rewrite is non-trivial (e.g., response shape incompatible), **stop and file a spec-amendment card** — do not invent a rewrite in 2D.

- [ ] **Step 3: Second-line typecheck sweep after types regen**

This task's output is verified again in Task 10 Step 3 after `db:types` regenerates `packages/shared/src/types/database.ts`. Any leftover `Database['public']['Tables']['affiliate_programs']` or `...['affiliate_referrals_legacy']` reference will cause a typecheck failure at that point. Fix any hits in this same commit.

## Task 10: Full verification + types regen

- [ ] **Step 1: Apply both migrations against local clean DB**

Run from repo root:

```bash
npm run db:reset
```

This runs the full chain `…000000 … …000008` against a fresh local DB. Expected: clean apply with no errors. If `…000007` or `…000008` fails, the error message names the offending SQL — fix in the appropriate commit.

- [ ] **Step 2: Run the integration test end-to-end**

Run from `apps/api/`:

```bash
npm run test:integration -- affiliate-legacy-cutover
```

Expected: 11 passing, 0 todo, under 30s.

- [ ] **Step 3: Regenerate `packages/shared/src/types/database.ts`**

Run from repo root:

```bash
npm run db:types
```

Expected: `packages/shared/src/types/database.ts` regenerated. `affiliate_programs` and `affiliate_referrals_legacy` type entries are **absent**; `affiliates`, `affiliate_referrals`, `affiliate_commissions` entries remain. Diff shows only removals + possibly whitespace shuffle.

- [ ] **Step 4: Typecheck (second line defense)**

Run:

```bash
npm run typecheck
```

Expected: 4 workspaces green. If any app-code path still referenced the dropped table types, typecheck catches it here — fix in this same commit.

- [ ] **Step 5: Run unit tests**

Run from `apps/api/`:

```bash
npm test
```

Expected: all existing tests pass. Integration test doesn't run in this path.

- [ ] **Step 6: Full branch-done checklist**

Verify each of the spec §9 branch-done criteria 1–14:

- [ ] `…000007_affiliate_legacy_data_migration.sql` exists + idempotent (assertion 8 passed)
- [ ] `…000008_affiliate_legacy_drop_tables.sql` exists + uses `DROP TABLE IF EXISTS … CASCADE`
- [ ] `apps/api/src/routes/affiliate-legacy.ts` deleted (Task 7 Step 1)
- [ ] `apps/api/src/index.ts` no longer imports/registers `affiliateLegacyRoutes` (Task 7 Step 2)
- [ ] `grep -rn "/api/affiliate-legacy" apps/` → zero matches (Task 9 Step 1)
- [ ] `grep -rn "affiliate-legacy" apps/` → zero matches in code (spec docs excluded)
- [ ] `grep -rn "affiliate_referrals_legacy\|affiliate_programs" apps/` → zero matches in code
- [ ] Integration test green (Task 10 Step 2)
- [ ] `db:types` regen removed the dropped tables (Task 10 Step 3)
- [ ] Typecheck green (Task 10 Step 4)
- [ ] `npm test` green (Task 10 Step 5)
- [ ] `scripts/rehearsal-audit-legacy-cutover.sql` committed (Commit A)
- [ ] 2 commits on branch (Commit A + this Commit B)
- [ ] PR description at merge time acknowledges R1/R2/R4 with spec link (handled at PR-creation step, not this plan)

Run the grep triplet now:

```bash
grep -rn "/api/affiliate-legacy" apps/ || echo "zero — clean"
grep -rn "affiliate-legacy" apps/ --exclude-dir=docs || echo "zero — clean"
grep -rn "affiliate_referrals_legacy\|affiliate_programs" apps/ || echo "zero — clean"
```

All three must print "zero — clean".

## Task 11: Commit B

- [ ] **Step 1: Review staged diff**

Run:

```bash
git status && git diff --stat
```

Expected files modified/created/deleted in Commit B:
- `supabase/migrations/20260417000008_affiliate_legacy_drop_tables.sql` (new)
- `apps/api/src/routes/affiliate-legacy.ts` (DELETED)
- `apps/api/src/index.ts` (-2 LOC)
- `apps/api/src/__tests__/migrations/affiliate-legacy-cutover.test.ts` (modified — assertions 9/10/11 promoted from todo)
- `packages/shared/src/types/database.ts` (regenerated — `affiliate_programs`/`affiliate_referrals_legacy` removed)

If `apps/app/src/app/(app)/settings/affiliate/page.tsx` appears in the diff, include it and document why in the commit body (means 2B missed a call site).

- [ ] **Step 2: Commit B**

Run:

```bash
git add \
  supabase/migrations/20260417000008_affiliate_legacy_drop_tables.sql \
  apps/api/src/index.ts \
  apps/api/src/__tests__/migrations/affiliate-legacy-cutover.test.ts \
  packages/shared/src/types/database.ts
git add -u apps/api/src/routes/affiliate-legacy.ts  # records the deletion

git commit -m "$(cat <<'EOF'
feat(api): affiliate 2D — drop legacy routes + tables

Destructive close-out of sub-project 5 of 5 on the affiliate branch.

- 20260417000008_affiliate_legacy_drop_tables.sql: DROP TABLE IF EXISTS
  affiliate_referrals_legacy CASCADE and affiliate_programs CASCADE,
  wrapped in BEGIN/COMMIT. Short, unambiguous, one transaction. Apply only
  after scripts/rehearsal-audit-legacy-cutover.sql is clean per spec §7.2D.R.
- apps/api/src/routes/affiliate-legacy.ts DELETED (145 LOC, @deprecated
  since 2A.5). Removal of the corresponding import + register in src/index.ts
  (-2 LOC). Previously-valid GET /program, POST /program, GET /referrals
  calls now return 404 via Fastify's global setErrorHandler with the standard
  { data: null, error: { code: 'NOT_FOUND' } } envelope (asserted by test 11).
- apps/api/src/__tests__/migrations/affiliate-legacy-cutover.test.ts:
  assertions 9/10/11 promoted from todo; full 11-assertion green.
- packages/shared/src/types/database.ts regenerated; affiliate_programs and
  affiliate_referrals_legacy types removed.

PARTIAL-COMPLETION NOTE: this commit ships code + locally-tested migrations.
Execution against prod data is DEFERRED to a separate DBA-led rehearsal+cutover
event post-merge (spec §9 prod-done criteria 15–22). Branch-done criteria
1–14 satisfied; residual risks R1/R2/R4 from spec §8 acknowledged in the PR
description.

Spec: docs/superpowers/specs/2026-04-17-affiliate-2d-legacy-cutover-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verify**

Run:

```bash
git log -2 --oneline
git log -1 --stat
```

Expected: two commits forming the 2D pair; Commit B shows 1 file deleted + 4 modified + 1 new.

---

# Rollback Procedures

## Dev-only rollback (local Supabase)

**When to use:** you applied `…000007` and/or `…000008` locally, realized a bug in the SQL, and want to undo before re-applying a fixed version. This SQL lives inline below (copy/pasted from spec Appendix A — source-of-truth is the spec) and is **not** committed as a file.

**Do NOT use on prod.** Prod rollback = restore Supabase snapshot per R2.

```sql
-- =====================================================================
-- DEV-ONLY ROLLBACK — Phase 2D (reverses …000008 and …000007)
-- Run against local Supabase ONLY. Prod rollback is snapshot restore.
-- =====================================================================
BEGIN;

-- Reverse 20260417000008: re-create legacy tables (empty — data is lost)
CREATE TABLE IF NOT EXISTS public.affiliate_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text unique not null,
  commission_pct numeric(5,2) not null default 20,
  payout_method text,
  payout_details jsonb,
  total_referrals integer not null default 0,
  total_revenue_cents integer not null default 0,
  total_paid_cents integer not null default 0,
  created_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS public.affiliate_referrals_legacy (
  id uuid primary key default gen_random_uuid(),
  affiliate_program_id uuid not null references public.affiliate_programs(id) on delete cascade,
  referred_org_id uuid not null references public.organizations(id) on delete cascade,
  first_touch_at timestamptz not null default now(),
  conversion_at timestamptz,
  subscription_amount_cents integer,
  commission_cents integer,
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'refunded')),
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS affiliate_programs_user_idx     ON public.affiliate_programs (user_id);
CREATE INDEX IF NOT EXISTS affiliate_referrals_program_idx ON public.affiliate_referrals_legacy (affiliate_program_id);
ALTER TABLE public.affiliate_programs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_referrals_legacy ENABLE ROW LEVEL SECURITY;

-- Reverse 20260417000007: remove migrated rows.
--   Heuristic "migrated" filter: affiliate_type='internal' + tier='nano' +
--   total_clicks=0 + total_conversions=0. DEV-ONLY — in prod this would nuke
--   legitimate new-schema signups sharing those defaults.
DELETE FROM public.affiliate_commissions ac
  USING public.affiliates a
  WHERE ac.affiliate_id = a.id
    AND a.affiliate_type = 'internal' AND a.tier = 'nano'
    AND a.total_clicks = 0 AND a.total_conversions = 0;
DELETE FROM public.affiliate_referrals ar
  USING public.affiliates a
  WHERE ar.affiliate_id = a.id
    AND a.affiliate_type = 'internal' AND a.tier = 'nano'
    AND a.total_clicks = 0 AND a.total_conversions = 0
    AND ar.click_id IS NULL AND ar.platform IS NULL AND ar.signup_ip_hash IS NULL;
DELETE FROM public.affiliates
  WHERE affiliate_type = 'internal' AND tier = 'nano'
    AND total_clicks = 0 AND total_conversions = 0;

COMMIT;
```

**Preferred alternative to the DELETE block:** `npm run db:reset`. The `db:reset` command drops the local DB and re-applies all migrations from scratch (this is what the integration test uses in `beforeAll`). It is faster, safer, and fully reversible. Use the DELETE block only when you must preserve non-affiliate data in the local DB.

## Per-migration explicit rollback commands (dev)

| Migration | Forward command | Reverse command (DEV ONLY) |
|---|---|---|
| `…000007_affiliate_legacy_data_migration.sql` | `psql "$LOCAL_DB_URL" -f supabase/migrations/20260417000007_affiliate_legacy_data_migration.sql` | The three DELETE statements in the rollback block above. |
| `…000008_affiliate_legacy_drop_tables.sql` | `psql "$LOCAL_DB_URL" -f supabase/migrations/20260417000008_affiliate_legacy_drop_tables.sql` | The two `CREATE TABLE IF NOT EXISTS` statements + index/RLS block. Data is NOT restored. |

## Commit-level rollback (branch, pre-merge)

If Commit B passes but you change your mind before merging the branch:

```bash
# From feat/affiliate-2a-foundation HEAD, drop Commit B (keeps Commit A):
git reset --hard HEAD~1

# Or drop both Commit A and B:
git reset --hard HEAD~2
```

Then run `npm run db:reset` to roll the local DB back to the `…000006` state.

## File-level rollback (recover the deleted route handler)

If Task 7 went too far (e.g., 2B didn't actually land):

```bash
# Recover the deleted file from the parent commit:
git checkout HEAD~1 -- apps/api/src/routes/affiliate-legacy.ts
# Re-add the two lines in apps/api/src/index.ts (use the pre-commit diff as reference).
```

## Prod rollback (NOT in branch scope — for DBA runbook)

**Prod rollback = Supabase snapshot restore.** The destructive drop (…000008) cannot be undone by re-running any SQL. The rehearsal step (§7.2D.R of the spec) mandates:

1. Snapshot taken BEFORE applying …000007.
2. Snapshot ID recorded in rehearsal log.
3. If anything goes wrong post-cutover, restore from that snapshot.
4. Re-creating the tables with the dev-rollback SQL **does not** restore rows — it leaves empty tables.

This is why R2 severity is High and why the rehearsal audit is a hard gate before …000008 applies.

**Rollback command count summary:** 7 explicit commands (2 forward-apply, 2 dev-reverse-migration, 1 `db:reset` alias, 1 `git reset --hard HEAD~N` branch-level, 1 `git checkout HEAD~1 -- <file>` file-level). Prod rollback is operator-led ("restore snapshot"), not a scripted command.

---

## Done Criteria Checklist

- [ ] Pre-flight §7.2D.0 satisfied (Task 1): prior sub-projects landed, `main` rebase clean, legacy route + registration still present, 2B consumer rewrite confirmed.
- [ ] `supabase/migrations/20260417000007_affiliate_legacy_data_migration.sql` created and idempotent (Task 3; assertion 8 green).
- [ ] `supabase/migrations/20260417000008_affiliate_legacy_drop_tables.sql` created and uses `DROP TABLE IF EXISTS … CASCADE` (Task 6).
- [ ] `scripts/rehearsal-audit-legacy-cutover.sql` created with 6 audit queries covering E1/E3/E4/E5/E7/E10/E13/E14 (Task 4).
- [ ] `apps/api/src/__tests__/migrations/affiliate-legacy-cutover.test.ts` created; 11 assertions green (Tasks 2/3/6/8/10).
- [ ] `apps/api/src/routes/affiliate-legacy.ts` deleted (Task 7 Step 1).
- [ ] `apps/api/src/index.ts` no longer imports/registers `affiliateLegacyRoutes` (Task 7 Step 2).
- [ ] `grep -rn "/api/affiliate-legacy" apps/` → zero matches (Task 9 / Task 10).
- [ ] `grep -rn "affiliate_referrals_legacy\|affiliate_programs" apps/` → zero matches in code (Task 10 Step 6).
- [ ] `packages/shared/src/types/database.ts` regenerated; legacy tables absent (Task 10 Step 3).
- [ ] `npm run typecheck` green across 4 workspaces (Task 10 Step 4).
- [ ] `npm test` green in `apps/api` (Task 10 Step 5).
- [ ] `npm run test:integration -- affiliate-legacy-cutover` green, 11/11 passing (Task 10 Step 2).
- [ ] 2 commits on branch (Commit A at end of Phase A; Commit B at Task 11).
- [ ] All 16 edge cases E1–E16 mapped to a test assertion or audit-script query (Task 3 Step 4 table).
- [ ] Rollback procedures documented: 2 dev-SQL reverse paths + 2 git-level reverse paths + `db:reset` alias = 7 explicit commands; prod rollback = snapshot restore (DBA-led, out of branch scope).
- [ ] Residual risks R1/R2/R4 (per spec §8) acknowledged in the branch-PR description — this is a PR-creation step, not a code-change step; flagged here for completeness.
