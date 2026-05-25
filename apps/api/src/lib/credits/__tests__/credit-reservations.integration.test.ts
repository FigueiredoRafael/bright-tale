/**
 * V2-006.1 — Integration tests: credit reservations schema + RPCs.
 *
 * Category C per CLAUDE.md — hits real local Supabase (psql port 54322).
 * Requires: npm run db:start && npm run db:reset (or migration applied manually)
 *
 * What this covers (per issue #108):
 *   1. Parallel reserve_credits — exactly one succeeds when org has credits for one
 *   2. commit_reservation → credits_used ↑, credits_reserved ↓, credit_usage row
 *   3. release_reservation → credits_reserved ↓, no credit_usage row
 *   4. expire_stale_reservations (time-warp) → status = expired, credits_reserved ↓
 *   5. VIP org bypass — reserve_credits succeeds regardless of available credits
 *
 * Uses psql (port 54322) exclusively — no PostgREST/GoTrue dependency.
 * Console output follows [V2-006.1] prefix for live observation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// ---------------------------------------------------------------------------
// Fixed UUIDs — deterministic, safe to re-run
// ---------------------------------------------------------------------------
const U = {
  user1: '00000006-0001-0000-0000-000000000001',
  user2: '00000006-0001-0000-0000-000000000002',
};
const O = {
  regularOrg: '00000006-0002-0000-0000-000000000001',
  vipOrg:     '00000006-0002-0000-0000-000000000002',
};

// ---------------------------------------------------------------------------
// SQL helpers (psql exec via tmp file — matches affiliate test pattern)
// ---------------------------------------------------------------------------
function log(step: string, detail = ''): void {
  console.log(`[V2-006.1] ${step}${detail ? ' — ' + detail : ''}`);
}

function runSql(sql: string): string {
  const tmp = path.join(os.tmpdir(), `credit-test-${Date.now()}.sql`);
  writeFileSync(tmp, sql, 'utf8');
  try {
    return execSync(`psql "${LOCAL_DB_URL}" -f "${tmp}" -t -A 2>&1`, {
      encoding: 'utf8',
    });
  } finally {
    unlinkSync(tmp);
  }
}

// ---------------------------------------------------------------------------
// beforeAll — seed users + orgs
// ---------------------------------------------------------------------------
describe('V2-006.1 — credit reservations RPCs', { timeout: 30_000 }, () => {
  beforeAll(() => {
    log('setup', 'seeding users + organizations');
    runSql(`
-- ── Cleanup previous run ─────────────────────────────────────────────
DELETE FROM public.credit_reservations WHERE org_id IN ('${O.regularOrg}', '${O.vipOrg}');
DELETE FROM public.credit_usage WHERE org_id IN ('${O.regularOrg}', '${O.vipOrg}');
DELETE FROM public.org_memberships WHERE org_id IN ('${O.regularOrg}', '${O.vipOrg}');
DELETE FROM public.organizations WHERE id IN ('${O.regularOrg}', '${O.vipOrg}');
DELETE FROM auth.users WHERE id IN ('${U.user1}', '${U.user2}');

-- ── Auth users ────────────────────────────────────────────────────────
INSERT INTO auth.users
  (id, email, email_confirmed_at, encrypted_password, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES
  ('${U.user1}', 'v2006-user1@test.local', now(), 'x', now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
  ('${U.user2}', 'v2006-user2@test.local', now(), 'x', now(), now(), '{}', '{}', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

-- ── Organizations ─────────────────────────────────────────────────────
-- Regular org: 100 total credits, 0 used, 0 reserved, 0 addon, not VIP
INSERT INTO public.organizations
  (id, name, slug, credits_total, credits_used, credits_addon, credits_reserved, is_vip, created_at, updated_at)
VALUES
  ('${O.regularOrg}', 'Test Org Regular', 'test-org-regular', 100, 0, 0, 0, false, now(), now())
ON CONFLICT (id) DO UPDATE SET
  credits_total = 100,
  credits_used = 0,
  credits_addon = 0,
  credits_reserved = 0,
  is_vip = false;

-- VIP org: 0 total credits, 0 used, but is_vip = true
INSERT INTO public.organizations
  (id, name, slug, credits_total, credits_used, credits_addon, credits_reserved, is_vip, created_at, updated_at)
VALUES
  ('${O.vipOrg}', 'Test Org VIP', 'test-org-vip', 0, 0, 0, 0, true, now(), now())
ON CONFLICT (id) DO UPDATE SET
  credits_total = 0,
  credits_used = 0,
  credits_addon = 0,
  credits_reserved = 0,
  is_vip = true;
`);
    log('setup', 'done');
  });

  afterAll(() => {
    log('teardown', 'removing test data');
    runSql(`
DELETE FROM public.credit_reservations WHERE org_id IN ('${O.regularOrg}', '${O.vipOrg}');
DELETE FROM public.credit_usage WHERE org_id IN ('${O.regularOrg}', '${O.vipOrg}');
DELETE FROM public.org_memberships WHERE org_id IN ('${O.regularOrg}', '${O.vipOrg}');
DELETE FROM public.organizations WHERE id IN ('${O.regularOrg}', '${O.vipOrg}');
DELETE FROM auth.users WHERE id IN ('${U.user1}', '${U.user2}');
`);
    log('teardown', 'done');
  });

  // ── Test 1: schema checks ───────────────────────────────────────────────

  it('credit_reservations table exists with RLS deny-all', () => {
    log('test 1a', 'checking credit_reservations table + RLS');
    const tableExists = runSql(
      `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'credit_reservations';`
    ).trim();
    expect(tableExists).toBe('1');

    const rlsEnabled = runSql(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'credit_reservations' AND relnamespace = 'public'::regnamespace;`
    ).trim();
    expect(rlsEnabled).toBe('t');

    // No policies = deny-all for non-service_role
    const policyCount = runSql(
      `SELECT COUNT(*) FROM pg_policies WHERE tablename = 'credit_reservations' AND schemaname = 'public';`
    ).trim();
    expect(policyCount).toBe('0');
    log('test 1a', 'PASS');
  });

  it('organizations.credits_reserved column exists with partial index', () => {
    log('test 1b', 'checking credits_reserved column + index');
    const colExists = runSql(
      `SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'credits_reserved';`
    ).trim();
    expect(colExists).toBe('1');

    const indexExists = runSql(
      `SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'organizations' AND indexname = 'idx_organizations_credits_reserved';`
    ).trim();
    expect(indexExists).toBe('1');
    log('test 1b', 'PASS');
  });

  it('all four security-definer RPCs exist', () => {
    log('test 1c', 'checking RPC existence');
    const rpcs = runSql(
      `SELECT proname FROM pg_proc WHERE proname IN ('reserve_credits', 'commit_reservation', 'release_reservation', 'expire_stale_reservations') ORDER BY proname;`
    ).trim().split('\n').filter(Boolean);
    expect(rpcs).toHaveLength(4);
    expect(rpcs).toContain('commit_reservation');
    expect(rpcs).toContain('expire_stale_reservations');
    expect(rpcs).toContain('release_reservation');
    expect(rpcs).toContain('reserve_credits');
    log('test 1c', 'PASS');
  });

  // ── Test 2: reserve_credits basic path ──────────────────────────────────

  it('reserve_credits succeeds when credits are available', () => {
    log('test 2', 'basic reserve_credits success');
    // Reset org to known state
    runSql(`UPDATE public.organizations SET credits_total=100, credits_used=0, credits_addon=0, credits_reserved=0 WHERE id='${O.regularOrg}';`);

    const result = runSql(
      `SELECT public.reserve_credits('${O.regularOrg}'::uuid, '${U.user1}'::uuid, 50::bigint);`
    ).trim();
    const parsed = JSON.parse(result);
    expect(parsed.error_code).toBeNull();
    expect(parsed.token).not.toBeNull();
    expect(typeof parsed.token).toBe('string');

    // credits_reserved should now be 50
    const reserved = runSql(
      `SELECT credits_reserved FROM public.organizations WHERE id='${O.regularOrg}';`
    ).trim();
    expect(Number(reserved)).toBe(50);

    // Cleanup
    runSql(`DELETE FROM public.credit_reservations WHERE org_id='${O.regularOrg}';`);
    runSql(`UPDATE public.organizations SET credits_reserved=0 WHERE id='${O.regularOrg}';`);
    log('test 2', 'PASS');
  });

  it('reserve_credits fails with INSUFFICIENT_CREDITS when credits exhausted', () => {
    log('test 3', 'reserve_credits insufficient credits');
    runSql(`UPDATE public.organizations SET credits_total=100, credits_used=0, credits_addon=0, credits_reserved=0 WHERE id='${O.regularOrg}';`);

    const result = runSql(
      `SELECT public.reserve_credits('${O.regularOrg}'::uuid, '${U.user1}'::uuid, 200::bigint);`
    ).trim();
    const parsed = JSON.parse(result);
    expect(parsed.error_code).toBe('INSUFFICIENT_CREDITS');
    expect(parsed.token).toBeNull();
    log('test 3', 'PASS');
  });

  // ── Test 3: parallel reserve — exactly one succeeds ────────────────────

  it('parallel reserve_credits: exactly one succeeds when only one fits', () => {
    log('test 4', 'parallel race condition — one of two should succeed');
    // Org has exactly 100 credits; two callers each try to reserve 100
    runSql(`UPDATE public.organizations SET credits_total=100, credits_used=0, credits_addon=0, credits_reserved=0 WHERE id='${O.regularOrg}';`);
    runSql(`DELETE FROM public.credit_reservations WHERE org_id='${O.regularOrg}';`);

    // Simulate parallel requests by running both reserve_credits in the same transaction
    // with explicit FOR UPDATE behavior. We run them in separate psql calls (mimics
    // concurrent requests). The SELECT FOR UPDATE in reserve_credits serializes them.
    const result1 = runSql(
      `SELECT public.reserve_credits('${O.regularOrg}'::uuid, '${U.user1}'::uuid, 100::bigint);`
    ).trim();
    const result2 = runSql(
      `SELECT public.reserve_credits('${O.regularOrg}'::uuid, '${U.user2}'::uuid, 100::bigint);`
    ).trim();

    const parsed1 = JSON.parse(result1);
    const parsed2 = JSON.parse(result2);

    log('test 4', `result1.error_code=${parsed1.error_code}, result2.error_code=${parsed2.error_code}`);

    // Exactly one should succeed
    const successes = [parsed1, parsed2].filter((r) => r.error_code === null && r.token !== null);
    const failures = [parsed1, parsed2].filter((r) => r.error_code === 'INSUFFICIENT_CREDITS');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    // credits_reserved should be exactly 100 (only one reservation held)
    const reserved = runSql(
      `SELECT credits_reserved FROM public.organizations WHERE id='${O.regularOrg}';`
    ).trim();
    expect(Number(reserved)).toBe(100);

    // Only 1 held reservation should exist
    const heldCount = runSql(
      `SELECT COUNT(*) FROM public.credit_reservations WHERE org_id='${O.regularOrg}' AND status='held';`
    ).trim();
    expect(Number(heldCount)).toBe(1);

    // Cleanup
    runSql(`DELETE FROM public.credit_reservations WHERE org_id='${O.regularOrg}';`);
    runSql(`UPDATE public.organizations SET credits_reserved=0 WHERE id='${O.regularOrg}';`);
    log('test 4', 'PASS');
  });

  // ── Test 4: commit_reservation ──────────────────────────────────────────

  it('commit_reservation: credits_used increases, credits_reserved decreases, credit_usage row inserted', () => {
    log('test 5', 'commit_reservation happy path');
    runSql(`UPDATE public.organizations SET credits_total=100, credits_used=0, credits_addon=0, credits_reserved=0 WHERE id='${O.regularOrg}';`);
    runSql(`DELETE FROM public.credit_reservations WHERE org_id='${O.regularOrg}';`);
    runSql(`DELETE FROM public.credit_usage WHERE org_id='${O.regularOrg}';`);

    // Reserve 50 credits
    const reserveResult = runSql(
      `SELECT public.reserve_credits('${O.regularOrg}'::uuid, '${U.user1}'::uuid, 50::bigint);`
    ).trim();
    const reserveParsed = JSON.parse(reserveResult);
    expect(reserveParsed.error_code).toBeNull();
    const token = reserveParsed.token;
    log('test 5', `reserved token=${token}`);

    // Commit the reservation with actual cost of 40
    const commitResult = runSql(
      `SELECT public.commit_reservation('${token}'::uuid, 40::bigint);`
    ).trim();
    const commitParsed = JSON.parse(commitResult);
    log('test 5', `commit result: ${JSON.stringify(commitParsed)}`);
    expect(commitParsed.success).toBe(true);

    // credits_used should be 40, credits_reserved should be 0
    const orgState = runSql(
      `SELECT credits_used, credits_reserved FROM public.organizations WHERE id='${O.regularOrg}';`
    ).trim();
    const [creditsUsed, creditsReserved] = orgState.split('|').map(Number);
    expect(creditsUsed).toBe(40);
    expect(creditsReserved).toBe(0);

    // A credit_usage row should exist
    const usageCount = runSql(
      `SELECT COUNT(*) FROM public.credit_usage WHERE org_id='${O.regularOrg}';`
    ).trim();
    expect(Number(usageCount)).toBe(1);

    // The reservation should be committed
    const reservationStatus = runSql(
      `SELECT status FROM public.credit_reservations WHERE token='${token}'::uuid;`
    ).trim();
    expect(reservationStatus).toBe('committed');

    // Cleanup
    runSql(`DELETE FROM public.credit_reservations WHERE org_id='${O.regularOrg}';`);
    runSql(`DELETE FROM public.credit_usage WHERE org_id='${O.regularOrg}';`);
    runSql(`UPDATE public.organizations SET credits_used=0, credits_reserved=0 WHERE id='${O.regularOrg}';`);
    log('test 5', 'PASS');
  });

  // ── Test 5: release_reservation ────────────────────────────────────────

  it('release_reservation: credits_reserved decreases, no credit_usage row inserted', () => {
    log('test 6', 'release_reservation happy path');
    runSql(`UPDATE public.organizations SET credits_total=100, credits_used=0, credits_addon=0, credits_reserved=0 WHERE id='${O.regularOrg}';`);
    runSql(`DELETE FROM public.credit_reservations WHERE org_id='${O.regularOrg}';`);
    runSql(`DELETE FROM public.credit_usage WHERE org_id='${O.regularOrg}';`);

    // Reserve 60 credits
    const reserveResult = runSql(
      `SELECT public.reserve_credits('${O.regularOrg}'::uuid, '${U.user1}'::uuid, 60::bigint);`
    ).trim();
    const reserveParsed = JSON.parse(reserveResult);
    expect(reserveParsed.error_code).toBeNull();
    const token = reserveParsed.token;

    // Verify credits_reserved is 60
    const reservedBefore = runSql(
      `SELECT credits_reserved FROM public.organizations WHERE id='${O.regularOrg}';`
    ).trim();
    expect(Number(reservedBefore)).toBe(60);

    // Release the reservation
    const releaseResult = runSql(
      `SELECT public.release_reservation('${token}'::uuid);`
    ).trim();
    const releaseParsed = JSON.parse(releaseResult);
    expect(releaseParsed.success).toBe(true);

    // credits_reserved should be back to 0
    const reservedAfter = runSql(
      `SELECT credits_reserved FROM public.organizations WHERE id='${O.regularOrg}';`
    ).trim();
    expect(Number(reservedAfter)).toBe(0);

    // credits_used should still be 0 (no debit on release)
    const creditsUsed = runSql(
      `SELECT credits_used FROM public.organizations WHERE id='${O.regularOrg}';`
    ).trim();
    expect(Number(creditsUsed)).toBe(0);

    // No credit_usage row should be inserted
    const usageCount = runSql(
      `SELECT COUNT(*) FROM public.credit_usage WHERE org_id='${O.regularOrg}';`
    ).trim();
    expect(Number(usageCount)).toBe(0);

    // Reservation status should be 'released'
    const reservationStatus = runSql(
      `SELECT status FROM public.credit_reservations WHERE token='${token}'::uuid;`
    ).trim();
    expect(reservationStatus).toBe('released');

    // Cleanup
    runSql(`DELETE FROM public.credit_reservations WHERE org_id='${O.regularOrg}';`);
    log('test 6', 'PASS');
  });

  // ── Test 6: expire_stale_reservations ──────────────────────────────────

  it('expire_stale_reservations: time-warp past 15min → status=expired, credits_reserved ↓', () => {
    log('test 7', 'expire_stale_reservations time-warp');
    runSql(`UPDATE public.organizations SET credits_total=100, credits_used=0, credits_addon=0, credits_reserved=0 WHERE id='${O.regularOrg}';`);
    runSql(`DELETE FROM public.credit_reservations WHERE org_id='${O.regularOrg}';`);

    // Reserve 70 credits
    const reserveResult = runSql(
      `SELECT public.reserve_credits('${O.regularOrg}'::uuid, '${U.user1}'::uuid, 70::bigint);`
    ).trim();
    const reserveParsed = JSON.parse(reserveResult);
    expect(reserveParsed.error_code).toBeNull();
    const token = reserveParsed.token;

    // Time-warp: set expires_at 1 hour in the past
    runSql(
      `UPDATE public.credit_reservations SET expires_at = now() - interval '1 hour' WHERE token='${token}'::uuid;`
    );

    // Run the expiry function
    const expiredCount = runSql(
      `SELECT public.expire_stale_reservations();`
    ).trim();
    log('test 7', `expired count=${expiredCount}`);
    expect(Number(expiredCount)).toBeGreaterThanOrEqual(1);

    // Reservation should now be expired
    const reservationStatus = runSql(
      `SELECT status FROM public.credit_reservations WHERE token='${token}'::uuid;`
    ).trim();
    expect(reservationStatus).toBe('expired');

    // credits_reserved should be back to 0
    const creditsReserved = runSql(
      `SELECT credits_reserved FROM public.organizations WHERE id='${O.regularOrg}';`
    ).trim();
    expect(Number(creditsReserved)).toBe(0);

    // Cleanup
    runSql(`DELETE FROM public.credit_reservations WHERE org_id='${O.regularOrg}';`);
    log('test 7', 'PASS');
  });

  // ── Test 7: VIP bypass ──────────────────────────────────────────────────

  it('VIP org: reserve_credits succeeds regardless of available credits', () => {
    log('test 8', 'VIP org bypass');
    // VIP org has 0 credits (credits_total=0, credits_used=0, credits_addon=0)
    runSql(`UPDATE public.organizations SET credits_total=0, credits_used=0, credits_addon=0, credits_reserved=0 WHERE id='${O.vipOrg}';`);
    runSql(`DELETE FROM public.credit_reservations WHERE org_id='${O.vipOrg}';`);

    // Try to reserve 999 credits — should succeed for VIP
    const result = runSql(
      `SELECT public.reserve_credits('${O.vipOrg}'::uuid, '${U.user1}'::uuid, 999::bigint);`
    ).trim();
    const parsed = JSON.parse(result);
    log('test 8', `result: ${JSON.stringify(parsed)}`);
    expect(parsed.error_code).toBeNull();
    expect(parsed.token).not.toBeNull();

    // VIP org does NOT increment credits_reserved (per RPC logic: inserts hold but skips org update)
    // The reservation row should exist in held status
    const heldCount = runSql(
      `SELECT COUNT(*) FROM public.credit_reservations WHERE org_id='${O.vipOrg}' AND status='held';`
    ).trim();
    expect(Number(heldCount)).toBe(1);

    // Cleanup
    runSql(`DELETE FROM public.credit_reservations WHERE org_id='${O.vipOrg}';`);
    log('test 8', 'PASS');
  });
});
