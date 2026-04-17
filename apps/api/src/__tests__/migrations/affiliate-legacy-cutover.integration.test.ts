/**
 * Integration test for Phase 2D legacy cutover.
 * Category C per CLAUDE.md — DB-hitting. Wired into `test:integration`, NOT `npm test`.
 * Runner: `npm run db:reset && npm run test:integration -- affiliate-legacy-cutover`
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
import { accessSync } from 'node:fs';
import path from 'node:path';
import { createServiceClient } from '@/lib/supabase/index.js';
// NOTE: `server` from '@/index.js' is NOT imported at the top level because the module
// initialises the DI container (which calls createServiceClient) at import time, crashing
// before Supabase env vars are available. Assertion 11 (it.todo) will do a dynamic import
// once the local DB is up and the env is configured.

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

function applyMigration(sqlPath: string): void {
  accessSync(sqlPath); // throws ENOENT if file missing — TDD red sentinel
  execSync(`psql "${LOCAL_DB_URL}" -f "${sqlPath}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
}

// ---------------------------------------------------------------------------
// Seed state populated during beforeAll — shared across assertions
// ---------------------------------------------------------------------------
const seed = {
  refundedRefUserIds: [] as string[],
  expectedCommissionCount: 9,
  refUser0Id: '',
  // Counts before migration (set after fixture inserts)
  affiliatesCountBefore: 0,
  referralsCountBefore: 0,
  commissionsCountBefore: 0,
};

describe('Phase 2D — legacy cutover migration', { timeout: 30_000 }, () => {
  beforeAll(async () => {
    // Reset local DB to clean state (applies all migrations up to 000006)
    execSync('npm run db:reset', { cwd: REPO_ROOT, stdio: 'pipe' });

    const sb = createServiceClient();

    // -----------------------------------------------------------------------
    // 1. Create 23 auth users
    // -----------------------------------------------------------------------

    // Program owners: progUser1..progUser10 + collisionUser
    const createUser = async (email: string) => {
      const { data, error } = await sb.auth.admin.createUser({
        email,
        email_confirm: true,
        password: 'testpass123',
      });
      if (error) throw new Error(`createUser(${email}): ${error.message}`);
      return data.user;
    };

    const [
      progUser1,
      progUser2,
      progUser3,
      progUser4,
      progUser5,
      progUser6,
      progUser7,
      progUser8,
      progUser9,
      progUser10,
      collisionUser,
    ] = await Promise.all([
      createUser('proguser1@test.local'),
      createUser('proguser2@test.local'),
      createUser('proguser3@test.local'),
      createUser('proguser4@test.local'),
      createUser('proguser5@test.local'),
      createUser('proguser6@test.local'),
      createUser('proguser7@test.local'),
      createUser('proguser8@test.local'),
      createUser('proguser9@test.local'),
      createUser('proguser10@test.local'),
      createUser('collision@test.local'),
    ]);

    // Referral users: refUser0..refUser11
    const [
      refUser0,
      refUser1,
      refUser2,
      refUser3,
      refUser4,
      refUser5,
      refUser6,
      refUser7,
      refUser8,
      refUser9,
      refUser10,
      refUser11,
    ] = await Promise.all([
      createUser('refuser0@test.local'),
      createUser('refuser1@test.local'),
      createUser('refuser2@test.local'),
      createUser('refuser3@test.local'),
      createUser('refuser4@test.local'),
      createUser('refuser5@test.local'),
      createUser('refuser6@test.local'),
      createUser('refuser7@test.local'),
      createUser('refuser8@test.local'),
      createUser('refuser9@test.local'),
      createUser('refuser10@test.local'),
      createUser('refuser11@test.local'),
    ]);

    // Populate refunded user ids (E ref for assertion 6)
    seed.refundedRefUserIds = [refUser3.id, refUser9.id];
    seed.refUser0Id = refUser0.id;

    // -----------------------------------------------------------------------
    // 2. Pre-existing affiliates row (E1 setup — collision target)
    // -----------------------------------------------------------------------
    const { error: e1Err } = await sb.from('affiliates').insert({
      user_id: collisionUser.id,
      code: 'BT-COLLIDE0',
      name: 'Existing Affiliate',
      email: 'collision@test.local',
      status: 'active',
      tier: 'nano',
      commission_rate: 0.2,
      affiliate_type: 'internal',
    });
    if (e1Err) throw new Error(`E1 pre-existing row: ${e1Err.message}`);

    // -----------------------------------------------------------------------
    // 3. Capture baseline counts (before migration)
    // -----------------------------------------------------------------------
    const [{ count: affBefore }, { count: refBefore }, { count: comBefore }] = await Promise.all([
      sb.from('affiliates').select('*', { count: 'exact', head: true }).then((r) => ({
        count: r.count ?? 0,
      })),
      sb
        .from('affiliate_referrals')
        .select('*', { count: 'exact', head: true })
        .then((r) => ({ count: r.count ?? 0 })),
      sb
        .from('affiliate_commissions')
        .select('*', { count: 'exact', head: true })
        .then((r) => ({ count: r.count ?? 0 })),
    ]);
    seed.affiliatesCountBefore = affBefore;
    seed.referralsCountBefore = refBefore;
    seed.commissionsCountBefore = comBefore;

    // -----------------------------------------------------------------------
    // 4. Create 14 organizations
    // -----------------------------------------------------------------------
    const makeSlug = (label: string) => `test-org-${label}-${Date.now()}`;

    const insertOrg = async (name: string, slugLabel: string) => {
      const { data, error } = await sb
        .from('organizations')
        .insert({ name, slug: makeSlug(slugLabel) })
        .select('id')
        .single();
      if (error) throw new Error(`insertOrg(${name}): ${error.message}`);
      return data.id as string;
    };

    const [
      orgProg1aId,
      orgProg1bId,
      orgProg2aId,
      orgProg2bId,
      orgProg3aId,
      orgProg3bId,
      orgProg4aId,
      orgProg4bId,
      orgProg5aId,
      orgProg5bId,
      orgProg6Id,
      orgProg8Id,
      orgProg9Id,
      orgProg10Id,
    ] = await Promise.all([
      insertOrg('Prog1 Org A', 'prog1a'),
      insertOrg('Prog1 Org B', 'prog1b'),
      insertOrg('Prog2 Org A', 'prog2a'),
      insertOrg('Prog2 Org B', 'prog2b'),
      insertOrg('Prog3 Org A', 'prog3a'),
      insertOrg('Prog3 Org B', 'prog3b'),
      insertOrg('Prog4 Org A', 'prog4a'),
      insertOrg('Prog4 Org B', 'prog4b'),
      insertOrg('Prog5 Org A', 'prog5a'),
      insertOrg('Prog5 Org B', 'prog5b'),
      insertOrg('Prog6 Org', 'prog6'),
      insertOrg('Prog8 Org', 'prog8'),
      insertOrg('Prog9 Org', 'prog9'), // E7 — no members
      insertOrg('Prog10 Org', 'prog10'), // E3 — refUser0 already used
    ]);

    // -----------------------------------------------------------------------
    // 5. Create org_memberships (13 orgs get members; org_prog9 gets none)
    // -----------------------------------------------------------------------
    const insertMember = async (orgId: string, userId: string) => {
      const { error } = await sb.from('org_memberships').insert({ org_id: orgId, user_id: userId });
      if (error) throw new Error(`insertMember(org=${orgId}, user=${userId}): ${error.message}`);
    };

    await Promise.all([
      insertMember(orgProg1aId, refUser0.id),
      insertMember(orgProg1bId, refUser1.id),
      insertMember(orgProg2aId, refUser2.id),
      insertMember(orgProg2bId, refUser3.id),
      insertMember(orgProg3aId, refUser4.id),
      insertMember(orgProg3bId, refUser5.id),
      insertMember(orgProg4aId, refUser6.id),
      insertMember(orgProg4bId, refUser7.id),
      insertMember(orgProg5aId, refUser8.id),
      insertMember(orgProg5bId, refUser9.id),
      insertMember(orgProg6Id, refUser10.id),
      insertMember(orgProg8Id, refUser11.id),
      // org_prog9: no members (E7 — referral will be dropped)
      insertMember(orgProg10Id, refUser0.id), // E3 — same user_id already referred via prog1
    ]);

    // -----------------------------------------------------------------------
    // 6. Create legacy affiliate_programs (10 rows)
    // -----------------------------------------------------------------------
    const { error: progErr } = await sb.from('affiliate_programs').insert([
      { user_id: progUser1.id, code: 'PROG1', commission_pct: 20 },
      { user_id: progUser2.id, code: 'PROG2', commission_pct: 20 },
      { user_id: progUser3.id, code: 'PROG3', commission_pct: 20 },
      { user_id: progUser4.id, code: 'PROG4', commission_pct: 20 },
      { user_id: progUser5.id, code: 'PROG5', commission_pct: 20 },
      { user_id: progUser6.id, code: 'PROG6', commission_pct: 100 }, // E2: boundary 100% = 1.0
      { user_id: progUser7.id, code: 'BT-COLLIDE0', commission_pct: 20 }, // E1: skip
      { user_id: progUser8.id, code: 'PROG8', commission_pct: 20 }, // E5 (simplified)
      { user_id: progUser9.id, code: 'PROG9', commission_pct: 20 }, // E7: no org member
      { user_id: progUser10.id, code: 'PROG10', commission_pct: 20 }, // E3: dedup
    ]);
    if (progErr) throw new Error(`affiliate_programs insert: ${progErr.message}`);

    // Look up program IDs by code
    const { data: progs, error: progsErr } = await sb
      .from('affiliate_programs')
      .select('id, code');
    if (progsErr) throw new Error(`affiliate_programs select: ${progsErr.message}`);
    const progIdByCode = Object.fromEntries((progs ?? []).map((p) => [p.code, p.id]));

    // -----------------------------------------------------------------------
    // 7. Create legacy affiliate_referrals_legacy (14 rows)
    // -----------------------------------------------------------------------
    const legacyReferrals = [
      // prog1
      {
        affiliate_program_id: progIdByCode['PROG1'],
        referred_org_id: orgProg1aId,
        status: 'paid',
        subscription_amount_cents: 5000,
        commission_cents: 1000,
      },
      {
        affiliate_program_id: progIdByCode['PROG1'],
        referred_org_id: orgProg1bId,
        status: 'pending',
        subscription_amount_cents: null,
        commission_cents: null,
      },
      // prog2
      {
        affiliate_program_id: progIdByCode['PROG2'],
        referred_org_id: orgProg2aId,
        status: 'approved',
        subscription_amount_cents: 3000,
        commission_cents: 600,
      },
      {
        affiliate_program_id: progIdByCode['PROG2'],
        referred_org_id: orgProg2bId,
        status: 'refunded',
        subscription_amount_cents: 5000,
        commission_cents: 1000,
      },
      // prog3
      {
        affiliate_program_id: progIdByCode['PROG3'],
        referred_org_id: orgProg3aId,
        status: 'paid',
        subscription_amount_cents: 10000,
        commission_cents: 2000,
      },
      {
        affiliate_program_id: progIdByCode['PROG3'],
        referred_org_id: orgProg3bId,
        status: 'pending',
        subscription_amount_cents: null,
        commission_cents: null,
      },
      // prog4
      {
        affiliate_program_id: progIdByCode['PROG4'],
        referred_org_id: orgProg4aId,
        status: 'approved',
        subscription_amount_cents: 5000,
        commission_cents: 1000,
      },
      {
        affiliate_program_id: progIdByCode['PROG4'],
        referred_org_id: orgProg4bId,
        status: 'pending',
        subscription_amount_cents: null,
        commission_cents: null,
      },
      // prog5
      {
        affiliate_program_id: progIdByCode['PROG5'],
        referred_org_id: orgProg5aId,
        status: 'paid',
        subscription_amount_cents: 5000,
        commission_cents: 1000,
      },
      {
        affiliate_program_id: progIdByCode['PROG5'],
        referred_org_id: orgProg5bId,
        status: 'refunded',
        subscription_amount_cents: 5000,
        commission_cents: 1000,
      },
      // prog6 — E2 boundary: 100% commission
      {
        affiliate_program_id: progIdByCode['PROG6'],
        referred_org_id: orgProg6Id,
        status: 'paid',
        subscription_amount_cents: 10000,
        commission_cents: 10000,
      },
      // prog8 — E5 (simplified: user has normal email)
      {
        affiliate_program_id: progIdByCode['PROG8'],
        referred_org_id: orgProg8Id,
        status: 'approved',
        subscription_amount_cents: 5000,
        commission_cents: 1000,
      },
      // prog9 — E7: org has 0 members → DROPPED
      {
        affiliate_program_id: progIdByCode['PROG9'],
        referred_org_id: orgProg9Id,
        status: 'approved',
        subscription_amount_cents: 5000,
        commission_cents: 1000,
      },
      // prog10 — E3: refUser0 already used by prog1 → DROPPED
      {
        affiliate_program_id: progIdByCode['PROG10'],
        referred_org_id: orgProg10Id,
        status: 'approved',
        subscription_amount_cents: 5000,
        commission_cents: 1000,
      },
    ];

    const { error: legRefErr } = await sb
      .from('affiliate_referrals_legacy')
      .insert(legacyReferrals);
    if (legRefErr) throw new Error(`affiliate_referrals_legacy insert: ${legRefErr.message}`);
  }, 60_000);

  // =========================================================================
  // Assertions 1–8 (Commit A)
  // =========================================================================

  it('1. affiliates count increases by exactly 9 after migration (10 programs minus 1 E1 skip)', async () => {
    applyMigration(MIG_007);
    const sb = createServiceClient();
    const { count } = await sb
      .from('affiliates')
      .select('*', { count: 'exact', head: true })
      .throwOnError();
    expect(count).toBe(seed.affiliatesCountBefore + 9);
  });

  it('2. every migrated affiliate has non-null name/email, status=active, tier=nano, commission_rate in (0,1]', async () => {
    const sb = createServiceClient();
    const { data } = await sb.from('affiliates').select('id, code, name, email, status, tier, commission_rate').eq('affiliate_type', 'internal');
    expect(data).toHaveLength(9);
    for (const row of data ?? []) {
      expect(row.name).not.toBeNull();
      expect(row.email).not.toBeNull();
      expect(row.status).toBe('active');
      expect(row.tier).toBe('nano');
      expect(Number(row.commission_rate)).toBeGreaterThan(0);
      expect(Number(row.commission_rate)).toBeLessThanOrEqual(1); // E2: prog6 at 100% = 1.0
    }
  });

  it('3. affiliate_referrals count matches seed minus E3 dedupe and E7 zero-member-org drops', async () => {
    const sb = createServiceClient();
    const { count } = await sb.from('affiliate_referrals').select('*', { count: 'exact', head: true });
    // 10 happy-path referrals + 1 E2 (prog6) + 1 E5 (prog8) = 12 migrated; E7 + E3 dropped
    expect(count).toBe(seed.referralsCountBefore + 12);
  });

  it('4. every migrated referral has a resolvable (non-null) user_id', async () => {
    const sb = createServiceClient();
    const { data } = await sb.from('affiliate_referrals').select('user_id');
    expect(data).toHaveLength(seed.referralsCountBefore + 12);
    for (const row of data ?? []) {
      expect(row.user_id).not.toBeNull();
    }
  });

  it('5. affiliate_commissions count equals legacy referrals with amount>0 AND status in (approved,paid,refunded)', async () => {
    const sb = createServiceClient();
    const { count } = await sb.from('affiliate_commissions').select('*', { count: 'exact', head: true });
    expect(count).toBe(seed.commissionsCountBefore + seed.expectedCommissionCount); // 9
  });

  it('6. refunded legacy rows → commission.status=cancelled AND referral.attribution_status=expired', async () => {
    const sb = createServiceClient();
    for (const userId of seed.refundedRefUserIds) {
      const { data: referral } = await sb
        .from('affiliate_referrals')
        .select('id, attribution_status')
        .eq('user_id', userId)
        .single()
        .throwOnError();
      expect(referral).not.toBeNull();
      expect(referral?.attribution_status).toBe('expired');
      const { data: commission } = await sb
        .from('affiliate_commissions')
        .select('status')
        .eq('referral_id', referral!.id)
        .single()
        .throwOnError();
      expect(commission?.status).toBe('cancelled');
    }
  });

  it('7. affiliates.total_earnings_brl equals SUM(total_brl) of derived commissions per affiliate', async () => {
    const sb = createServiceClient();
    const { data: affiliates } = await sb.from('affiliates').select('id, total_earnings_brl').eq('affiliate_type', 'internal');
    for (const aff of affiliates ?? []) {
      const { data: commissions } = await sb.from('affiliate_commissions').select('total_brl').eq('affiliate_id', aff.id);
      const expectedSum = (commissions ?? []).reduce((acc, c) => acc + Number(c.total_brl), 0);
      expect(Number(aff.total_earnings_brl)).toBe(expectedSum);
    }
  });

  it('8. running …000007 a second time is a no-op (idempotency guard)', async () => {
    const sb = createServiceClient();
    const { count: beforeAff } = await sb.from('affiliates').select('*', { count: 'exact', head: true });
    const { count: beforeRef } = await sb.from('affiliate_referrals').select('*', { count: 'exact', head: true });
    const { count: beforeComm } = await sb.from('affiliate_commissions').select('*', { count: 'exact', head: true });
    applyMigration(MIG_007);
    const { count: afterAff } = await sb.from('affiliates').select('*', { count: 'exact', head: true });
    const { count: afterRef } = await sb.from('affiliate_referrals').select('*', { count: 'exact', head: true });
    const { count: afterComm } = await sb.from('affiliate_commissions').select('*', { count: 'exact', head: true });
    expect(afterAff).toBe(beforeAff);
    expect(afterRef).toBe(beforeRef);
    expect(afterComm).toBe(beforeComm);
  });

  // =========================================================================
  // Assertions 9–11 (Commit B — it.todo)
  // =========================================================================
  it.todo(
    '9. after …000008 applies, legacy table lookups return NULL via to_regclass',
  );
  it.todo(
    '10. post-drop affiliates count unchanged (CASCADE did not null-cascade package-table data)',
  );
  it.todo(
    // server imported dynamically inside the test body to avoid module-level Supabase init crash
    '11. GET /api/affiliate-legacy/program returns 404 with {data:null, error:{code:NOT_FOUND}} envelope',
  );
});
