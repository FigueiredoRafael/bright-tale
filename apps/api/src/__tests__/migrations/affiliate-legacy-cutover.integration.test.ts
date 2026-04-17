/**
 * Integration test for Phase 2D legacy cutover.
 * Category C per CLAUDE.md — DB-hitting. Wired into `test:integration`, NOT `npm test`.
 * Runner: `npm run db:reset && npm run test:integration -- affiliate-legacy-cutover`
 *
 * Uses psql exclusively (port 54322) — no PostgREST/GoTrue dependency.
 * This makes the suite resilient to Supabase REST service instability.
 *
 * Fixture overview (10 programs, edge cases E1/E2/E3/E5/E7):
 *   E1: code collision (progUser7, code='BT-COLLIDE0') → program SKIPPED
 *   E2: 100% commission_pct (progUser6) → commission_rate = 1.0
 *   E3: duplicate user_id in referral (prog10 → refUser0 already in prog1) → referral DROPPED
 *   E5: simplified (progUser8 has normal email, no NULL email path)
 *   E7: org_prog9 has 0 members → referral DROPPED
 *
 * Expected post-MIG_007 counts:
 *   affiliates migrated:       +9  (10 programs - 1 E1 skip)
 *   affiliate_referrals:       +12 (14 legacy rows - 1 E7 - 1 E3)
 *   affiliate_commissions:     +9  (paid/approved/refunded with amount > 0)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { accessSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const MIG_007 = path.join(
  REPO_ROOT,
  'supabase/migrations/20260417000007_affiliate_legacy_data_migration.sql',
);
const MIG_008 = path.join(
  REPO_ROOT,
  'supabase/migrations/20260417000008_affiliate_legacy_drop_tables.sql',
);
const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';

// ---------------------------------------------------------------------------
// Fixed UUIDs for deterministic test data — makes SQL seeds self-contained.
// ---------------------------------------------------------------------------
const U = {
  progUser1:     '00000001-0001-0000-0000-000000000000',
  progUser2:     '00000001-0002-0000-0000-000000000000',
  progUser3:     '00000001-0003-0000-0000-000000000000',
  progUser4:     '00000001-0004-0000-0000-000000000000',
  progUser5:     '00000001-0005-0000-0000-000000000000',
  progUser6:     '00000001-0006-0000-0000-000000000000',
  progUser7:     '00000001-0007-0000-0000-000000000000',
  progUser8:     '00000001-0008-0000-0000-000000000000',
  progUser9:     '00000001-0009-0000-0000-000000000000',
  progUser10:    '00000001-000a-0000-0000-000000000000',
  collisionUser: '00000001-000b-0000-0000-000000000000',
  refUser0:      '00000002-0000-0000-0000-000000000000',
  refUser1:      '00000002-0001-0000-0000-000000000000',
  refUser2:      '00000002-0002-0000-0000-000000000000',
  refUser3:      '00000002-0003-0000-0000-000000000000', // refunded
  refUser4:      '00000002-0004-0000-0000-000000000000',
  refUser5:      '00000002-0005-0000-0000-000000000000',
  refUser6:      '00000002-0006-0000-0000-000000000000',
  refUser7:      '00000002-0007-0000-0000-000000000000',
  refUser8:      '00000002-0008-0000-0000-000000000000',
  refUser9:      '00000002-0009-0000-0000-000000000000', // refunded
  refUser10:     '00000002-000a-0000-0000-000000000000',
  refUser11:     '00000002-000b-0000-0000-000000000000',
};
const O = {
  org1a:  '00000003-0001-0000-0000-000000000000',
  org1b:  '00000003-0002-0000-0000-000000000000',
  org2a:  '00000003-0003-0000-0000-000000000000',
  org2b:  '00000003-0004-0000-0000-000000000000',
  org3a:  '00000003-0005-0000-0000-000000000000',
  org3b:  '00000003-0006-0000-0000-000000000000',
  org4a:  '00000003-0007-0000-0000-000000000000',
  org4b:  '00000003-0008-0000-0000-000000000000',
  org5a:  '00000003-0009-0000-0000-000000000000',
  org5b:  '00000003-000a-0000-0000-000000000000',
  org6:   '00000003-000b-0000-0000-000000000000',
  org8:   '00000003-000c-0000-0000-000000000000',
  org9:   '00000003-000d-0000-0000-000000000000', // E7 — no members
  org10:  '00000003-000e-0000-0000-000000000000', // E3 — refUser0 already referred
};

function applyMigration(sqlPath: string): void {
  accessSync(sqlPath); // throws ENOENT if file missing — TDD red sentinel
  try {
    execSync(`psql "${LOCAL_DB_URL}" --set=ON_ERROR_STOP=1 -f "${sqlPath}"`, {
      cwd: REPO_ROOT,
      stdio: 'pipe',
    });
  } catch (err: unknown) {
    const e = err as { stderr?: Buffer; stdout?: Buffer };
    throw new Error(
      `applyMigration(${sqlPath}) failed:\n${e.stderr?.toString()}\n${e.stdout?.toString()}`,
    );
  }
}

/** Run SQL via temp file (safe for multi-line + special chars). */
function runSql(sql: string, label = 'sql'): void {
  const tmp = path.join(os.tmpdir(), `${label}-${Date.now()}.sql`);
  // Prepend ON_ERROR_STOP so any SQL error surfaces as a thrown exception
  writeFileSync(tmp, `\\set ON_ERROR_STOP on\n${sql}`);
  try {
    execSync(`psql "${LOCAL_DB_URL}" -f "${tmp}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
  } catch (err: unknown) {
    const e = err as { stderr?: Buffer; stdout?: Buffer };
    throw new Error(`runSql(${label}) failed:\n${e.stderr?.toString()}\n${e.stdout?.toString()}`);
  } finally {
    unlinkSync(tmp);
  }
}

/** Return a single integer count from a psql -t query. */
function countQuery(sql: string): number {
  const tmp = path.join(os.tmpdir(), `count-${Date.now()}.sql`);
  writeFileSync(tmp, sql);
  try {
    const out = execSync(`psql "${LOCAL_DB_URL}" -t -f "${tmp}"`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    return parseInt(out, 10);
  } finally {
    unlinkSync(tmp);
  }
}

/** Return rows as an array of tab-separated strings. */
function rowsQuery(sql: string): string[] {
  const tmp = path.join(os.tmpdir(), `rows-${Date.now()}.sql`);
  writeFileSync(tmp, sql);
  try {
    const out = execSync(`psql "${LOCAL_DB_URL}" -t -f "${tmp}"`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  } finally {
    unlinkSync(tmp);
  }
}

// ---------------------------------------------------------------------------
// Seed state populated during beforeAll — shared across assertions
// ---------------------------------------------------------------------------
const seed = {
  expectedCommissionCount: 9,
  affiliatesCountBefore: 0,
  referralsCountBefore: 0,
  commissionsCountBefore: 0,
};

describe('Phase 2D — legacy cutover migration', { timeout: 60_000 }, () => {
  beforeAll(() => {
    // All setup via psql (port 54322). No PostgREST dependency.
    // Prerequisites: `npm run db:reset` must be run once before this suite.
    runSql(`
-- ============================================================
-- CLEANUP: clear previous test run data
-- ============================================================
DELETE FROM public.affiliate_commissions WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@test.local'
);
DELETE FROM public.affiliate_referrals WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@test.local'
);
DELETE FROM public.affiliates WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@test.local'
);
DELETE FROM public.org_memberships WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@test.local'
);
DELETE FROM public.organizations WHERE id IN (
  '${O.org1a}','${O.org1b}','${O.org2a}','${O.org2b}','${O.org3a}','${O.org3b}',
  '${O.org4a}','${O.org4b}','${O.org5a}','${O.org5b}','${O.org6}','${O.org8}',
  '${O.org9}','${O.org10}'
);
DELETE FROM auth.users WHERE email LIKE '%@test.local';

-- ============================================================
-- LEGACY TABLES: recreate (migration 000008 drops them)
-- ============================================================
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
CREATE INDEX IF NOT EXISTS affiliate_programs_user_idx ON public.affiliate_programs (user_id);
ALTER TABLE public.affiliate_programs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.affiliate_referrals_legacy (
  id uuid primary key default gen_random_uuid(),
  affiliate_program_id uuid not null references public.affiliate_programs(id) on delete cascade,
  referred_org_id uuid not null references public.organizations(id) on delete cascade,
  first_touch_at timestamptz not null default now(),
  conversion_at timestamptz,
  subscription_amount_cents integer,
  commission_cents integer,
  status text not null default 'pending' check (status in ('pending','approved','paid','refunded')),
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS affiliate_referrals_legacy_prog_idx
  ON public.affiliate_referrals_legacy (affiliate_program_id);
ALTER TABLE public.affiliate_referrals_legacy ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- AUTH USERS (23 total: 11 prog-owners + 12 referral-users)
-- ============================================================
INSERT INTO auth.users
  (id, email, email_confirmed_at, encrypted_password, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES
  ('${U.progUser1}',    'proguser1@test.local',  now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.progUser2}',    'proguser2@test.local',  now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.progUser3}',    'proguser3@test.local',  now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.progUser4}',    'proguser4@test.local',  now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.progUser5}',    'proguser5@test.local',  now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.progUser6}',    'proguser6@test.local',  now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.progUser7}',    'proguser7@test.local',  now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.progUser8}',    'proguser8@test.local',  now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.progUser9}',    'proguser9@test.local',  now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.progUser10}',   'proguser10@test.local', now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.collisionUser}','collision@test.local',   now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.refUser0}',     'refuser0@test.local',   now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.refUser1}',     'refuser1@test.local',   now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.refUser2}',     'refuser2@test.local',   now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.refUser3}',     'refuser3@test.local',   now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.refUser4}',     'refuser4@test.local',   now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.refUser5}',     'refuser5@test.local',   now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.refUser6}',     'refuser6@test.local',   now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.refUser7}',     'refuser7@test.local',   now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.refUser8}',     'refuser8@test.local',   now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.refUser9}',     'refuser9@test.local',   now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.refUser10}',    'refuser10@test.local',  now(),'x',now(),now(),'{}','{}','authenticated','authenticated'),
  ('${U.refUser11}',    'refuser11@test.local',  now(),'x',now(),now(),'{}','{}','authenticated','authenticated');

-- ============================================================
-- E1: pre-existing affiliate (collision target — same code as progUser7's program)
-- ============================================================
INSERT INTO public.affiliates
  (user_id, code, name, email, status, tier, commission_rate, affiliate_type)
VALUES
  ('${U.collisionUser}', 'BT-COLLIDE0', 'Existing Affiliate', 'collision@test.local',
   'active', 'nano', 0.2, 'internal');

-- ============================================================
-- ORGANIZATIONS (14 test orgs with fixed IDs)
-- ============================================================
INSERT INTO public.organizations (id, name, slug, created_at)
VALUES
  ('${O.org1a}',  'Prog1 Org A', 'test-org-prog1a-fixed', now()),
  ('${O.org1b}',  'Prog1 Org B', 'test-org-prog1b-fixed', now()),
  ('${O.org2a}',  'Prog2 Org A', 'test-org-prog2a-fixed', now()),
  ('${O.org2b}',  'Prog2 Org B', 'test-org-prog2b-fixed', now()),
  ('${O.org3a}',  'Prog3 Org A', 'test-org-prog3a-fixed', now()),
  ('${O.org3b}',  'Prog3 Org B', 'test-org-prog3b-fixed', now()),
  ('${O.org4a}',  'Prog4 Org A', 'test-org-prog4a-fixed', now()),
  ('${O.org4b}',  'Prog4 Org B', 'test-org-prog4b-fixed', now()),
  ('${O.org5a}',  'Prog5 Org A', 'test-org-prog5a-fixed', now()),
  ('${O.org5b}',  'Prog5 Org B', 'test-org-prog5b-fixed', now()),
  ('${O.org6}',   'Prog6 Org',   'test-org-prog6-fixed',  now()),
  ('${O.org8}',   'Prog8 Org',   'test-org-prog8-fixed',  now()),
  ('${O.org9}',   'Prog9 Org',   'test-org-prog9-fixed',  now()),  -- E7: no members
  ('${O.org10}',  'Prog10 Org',  'test-org-prog10-fixed', now());  -- E3: refUser0 reused

-- ============================================================
-- ORG MEMBERSHIPS (13 orgs get members; org9 gets none for E7)
-- ============================================================
INSERT INTO public.org_memberships (org_id, user_id) VALUES
  ('${O.org1a}'::uuid, '${U.refUser0}'::uuid),
  ('${O.org1b}'::uuid, '${U.refUser1}'::uuid),
  ('${O.org2a}'::uuid, '${U.refUser2}'::uuid),
  ('${O.org2b}'::uuid, '${U.refUser3}'::uuid),
  ('${O.org3a}'::uuid, '${U.refUser4}'::uuid),
  ('${O.org3b}'::uuid, '${U.refUser5}'::uuid),
  ('${O.org4a}'::uuid, '${U.refUser6}'::uuid),
  ('${O.org4b}'::uuid, '${U.refUser7}'::uuid),
  ('${O.org5a}'::uuid, '${U.refUser8}'::uuid),
  ('${O.org5b}'::uuid, '${U.refUser9}'::uuid),
  ('${O.org6}'::uuid,  '${U.refUser10}'::uuid),
  ('${O.org8}'::uuid,  '${U.refUser11}'::uuid),
  -- org9: no member (E7)
  ('${O.org10}'::uuid, '${U.refUser0}'::uuid);  -- E3: refUser0 also referred via prog1

-- ============================================================
-- LEGACY AFFILIATE_PROGRAMS (10 programs)
-- ============================================================
INSERT INTO public.affiliate_programs (user_id, code, commission_pct) VALUES
  ('${U.progUser1}',  'PROG1',       20),
  ('${U.progUser2}',  'PROG2',       20),
  ('${U.progUser3}',  'PROG3',       20),
  ('${U.progUser4}',  'PROG4',       20),
  ('${U.progUser5}',  'PROG5',       20),
  ('${U.progUser6}',  'PROG6',      100),  -- E2: 100% commission
  ('${U.progUser7}',  'BT-COLLIDE0', 20),  -- E1: same code as existing affiliate
  ('${U.progUser8}',  'PROG8',       20),
  ('${U.progUser9}',  'PROG9',       20),
  ('${U.progUser10}', 'PROG10',      20);

-- ============================================================
-- LEGACY AFFILIATE_REFERRALS (14 rows: -E7 -E3 = 12 migrated)
-- ============================================================
WITH progs AS (SELECT id, code FROM public.affiliate_programs)
INSERT INTO public.affiliate_referrals_legacy
  (affiliate_program_id, referred_org_id, status, subscription_amount_cents, commission_cents)
SELECT p.id, '${O.org1a}'::uuid,  'paid',     5000,  1000 FROM progs p WHERE p.code = 'PROG1'  UNION ALL
SELECT p.id, '${O.org1b}'::uuid,  'pending',  NULL,  NULL FROM progs p WHERE p.code = 'PROG1'  UNION ALL
SELECT p.id, '${O.org2a}'::uuid,  'approved', 3000,   600 FROM progs p WHERE p.code = 'PROG2'  UNION ALL
SELECT p.id, '${O.org2b}'::uuid,  'refunded', 5000,  1000 FROM progs p WHERE p.code = 'PROG2'  UNION ALL
SELECT p.id, '${O.org3a}'::uuid,  'paid',    10000,  2000 FROM progs p WHERE p.code = 'PROG3'  UNION ALL
SELECT p.id, '${O.org3b}'::uuid,  'pending',  NULL,  NULL FROM progs p WHERE p.code = 'PROG3'  UNION ALL
SELECT p.id, '${O.org4a}'::uuid,  'approved', 5000,  1000 FROM progs p WHERE p.code = 'PROG4'  UNION ALL
SELECT p.id, '${O.org4b}'::uuid,  'pending',  NULL,  NULL FROM progs p WHERE p.code = 'PROG4'  UNION ALL
SELECT p.id, '${O.org5a}'::uuid,  'paid',     5000,  1000 FROM progs p WHERE p.code = 'PROG5'  UNION ALL
SELECT p.id, '${O.org5b}'::uuid,  'refunded', 5000,  1000 FROM progs p WHERE p.code = 'PROG5'  UNION ALL
SELECT p.id, '${O.org6}'::uuid,   'paid',    10000, 10000 FROM progs p WHERE p.code = 'PROG6'  UNION ALL
SELECT p.id, '${O.org8}'::uuid,   'approved', 5000,  1000 FROM progs p WHERE p.code = 'PROG8'  UNION ALL
SELECT p.id, '${O.org9}'::uuid,   'approved', 5000,  1000 FROM progs p WHERE p.code = 'PROG9'  UNION ALL  -- E7
SELECT p.id, '${O.org10}'::uuid,  'approved', 5000,  1000 FROM progs p WHERE p.code = 'PROG10'; -- E3
`, 'affiliate-setup');

    // Capture baseline counts (before migration 000007 runs)
    seed.affiliatesCountBefore = countQuery(
      `SELECT COUNT(*) FROM public.affiliates WHERE user_id IN (
         SELECT id FROM auth.users WHERE email LIKE '%@test.local'
       );`,
    );
    seed.referralsCountBefore = countQuery(
      `SELECT COUNT(*) FROM public.affiliate_referrals WHERE user_id IN (
         SELECT id FROM auth.users WHERE email LIKE '%@test.local'
       );`,
    );
    seed.commissionsCountBefore = countQuery(
      `SELECT COUNT(*) FROM public.affiliate_commissions WHERE user_id IN (
         SELECT id FROM auth.users WHERE email LIKE '%@test.local'
       );`,
    );
  }, 60_000);

  // =========================================================================
  // Assertions 1–8 (Commit A)
  // =========================================================================

  it('1. affiliates count increases by exactly 9 after migration (10 programs minus 1 E1 skip)', () => {
    applyMigration(MIG_007);
    const count = countQuery(
      `SELECT COUNT(*) FROM public.affiliates WHERE user_id IN (
         SELECT id FROM auth.users WHERE email LIKE '%@test.local'
       );`,
    );
    expect(count).toBe(seed.affiliatesCountBefore + 9);
  });

  it('2. every migrated affiliate has non-null name/email, status=active, tier=nano, commission_rate in (0,1]', () => {
    const rows = rowsQuery(
      `SELECT code, name, email, status, tier, commission_rate::text
       FROM public.affiliates
       WHERE affiliate_type = 'internal'
         AND user_id IN (SELECT id FROM auth.users WHERE email LIKE 'proguser%@test.local');`,
    );
    // 9 migrated (progUser1-5,6,8,9,10 — progUser7/BT-COLLIDE0 skipped by E1)
    expect(rows).toHaveLength(9);
    for (const row of rows) {
      const [code, name, email, status, tier, commRate] = row.split('|').map((s) => s.trim());
      expect(name, `name null for ${code}`).not.toBe('');
      expect(email, `email null for ${code}`).not.toBe('');
      expect(status).toBe('active');
      expect(tier).toBe('nano');
      const rate = parseFloat(commRate);
      expect(rate, `commission_rate for ${code}`).toBeGreaterThan(0);
      expect(rate, `commission_rate for ${code} (E2 check)`).toBeLessThanOrEqual(1);
    }
  });

  it('3. affiliate_referrals count matches seed minus E3 dedupe and E7 zero-member-org drops', () => {
    const count = countQuery(
      `SELECT COUNT(*) FROM public.affiliate_referrals WHERE user_id IN (
         SELECT id FROM auth.users WHERE email LIKE '%@test.local'
       );`,
    );
    expect(count).toBe(seed.referralsCountBefore + 12);
  });

  it('4. every migrated referral has a resolvable (non-null) user_id', () => {
    const rows = rowsQuery(
      `SELECT user_id::text FROM public.affiliate_referrals
       WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@test.local');`,
    );
    expect(rows).toHaveLength(seed.referralsCountBefore + 12);
    for (const row of rows) {
      expect(row.trim()).not.toBe('');
    }
  });

  it('5. affiliate_commissions count equals legacy referrals with amount>0 AND status in (approved,paid,refunded)', () => {
    const count = countQuery(
      `SELECT COUNT(*) FROM public.affiliate_commissions WHERE user_id IN (
         SELECT id FROM auth.users WHERE email LIKE '%@test.local'
       );`,
    );
    expect(count).toBe(seed.commissionsCountBefore + seed.expectedCommissionCount);
  });

  it('6. refunded legacy rows → commission.status=cancelled AND referral.attribution_status=expired', () => {
    for (const userId of [U.refUser3, U.refUser9]) {
      const refRows = rowsQuery(
        `SELECT id::text, attribution_status
         FROM public.affiliate_referrals WHERE user_id = '${userId}';`,
      );
      expect(refRows).toHaveLength(1);
      const [, attrStatus] = refRows[0].split('|').map((s) => s.trim());
      expect(attrStatus).toBe('expired');

      const refId = refRows[0].split('|')[0].trim();
      const commRows = rowsQuery(
        `SELECT status FROM public.affiliate_commissions WHERE referral_id = '${refId}';`,
      );
      expect(commRows).toHaveLength(1);
      expect(commRows[0].trim()).toBe('cancelled');
    }
  });

  it('7. affiliates.total_earnings_brl equals SUM(total_brl) of derived commissions per affiliate', () => {
    const rows = rowsQuery(
      `SELECT a.id::text, a.total_earnings_brl::text,
              COALESCE(SUM(ac.total_brl), 0)::text AS sum_total_brl
       FROM public.affiliates a
       LEFT JOIN public.affiliate_commissions ac ON ac.affiliate_id = a.id
       WHERE a.user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@test.local')
       GROUP BY a.id, a.total_earnings_brl;`,
    );
    for (const row of rows) {
      const parts = row.split('|').map((s) => s.trim());
      const [id, totalEarnings, sumCommissions] = parts;
      expect(
        parseFloat(totalEarnings),
        `total_earnings_brl mismatch for affiliate ${id}`,
      ).toBe(parseFloat(sumCommissions));
    }
  });

  it('8. running …000007 a second time is a no-op (idempotency guard)', () => {
    const before = {
      aff: countQuery(`SELECT COUNT(*) FROM public.affiliates WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@test.local');`),
      ref: countQuery(`SELECT COUNT(*) FROM public.affiliate_referrals WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@test.local');`),
      com: countQuery(`SELECT COUNT(*) FROM public.affiliate_commissions WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@test.local');`),
    };
    applyMigration(MIG_007);
    expect(countQuery(`SELECT COUNT(*) FROM public.affiliates WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@test.local');`)).toBe(before.aff);
    expect(countQuery(`SELECT COUNT(*) FROM public.affiliate_referrals WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@test.local');`)).toBe(before.ref);
    expect(countQuery(`SELECT COUNT(*) FROM public.affiliate_commissions WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@test.local');`)).toBe(before.com);
  });

  // =========================================================================
  // Assertions 9–11 (Commit B)
  // =========================================================================

  it('9. after …000008 applies, legacy tables no longer exist', () => {
    applyMigration(MIG_008);
    const result = execSync(
      `psql "${LOCAL_DB_URL}" -t -c "SELECT to_regclass('public.affiliate_programs')::text, to_regclass('public.affiliate_referrals_legacy')::text;"`,
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    const cols = result.trim().split('|').map((s) => s.trim());
    expect(cols[0]).toBe(''); // NULL → empty string in psql -t mode
    expect(cols[1]).toBe('');
  });

  it('10. post-drop affiliates count unchanged (CASCADE did not null-cascade package-table data)', () => {
    const count = countQuery(
      `SELECT COUNT(*) FROM public.affiliates WHERE user_id IN (
         SELECT id FROM auth.users WHERE email LIKE '%@test.local'
       );`,
    );
    expect(count).toBe(seed.affiliatesCountBefore + 9);
  });

  it('11. GET /affiliate-legacy/program returns 404 (route was deleted in Phase 2D)', async () => {
    const { default: app } = await import('@/index.js');
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
    } finally {
      await app.close();
    }
  });
});
