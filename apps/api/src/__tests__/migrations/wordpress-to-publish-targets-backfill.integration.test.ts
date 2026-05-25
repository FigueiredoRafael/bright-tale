/**
 * Integration test for T2.8 — wordpress_configs → publish_targets backfill.
 * Category C per CLAUDE.md — DB-hitting. Wired into `test:integration`.
 * Runner: `npm run db:reset && npm run test:integration -- wordpress-to-publish-targets-backfill`
 *
 * Uses psql exclusively (port 54322) — same pattern as affiliate-legacy-cutover.
 *
 * Behaviors covered:
 *   1. One publish_targets row created per wordpress_configs row (type='wordpress', channel scope).
 *   2. Field mapping: display_name=site_url, credentials_encrypted=password, config_json carries siteUrl/username.
 *   3. Forward pointer wordpress_configs.publish_targets_id is set.
 *   4. Re-running migration is a no-op (idempotent).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, accessSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const MIG_BACKFILL = path.join(
  REPO_ROOT,
  'supabase/migrations/20260514160000_backfill_wordpress_configs_to_publish_targets.sql',
);
const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';

// ---------------------------------------------------------------------------
// Fixed UUIDs / IDs for deterministic seeds
// ---------------------------------------------------------------------------
const U = {
  wpUser1: '00000010-0001-0000-0000-000000000000',
  wpUser2: '00000010-0002-0000-0000-000000000000',
};
const O = {
  org1: '00000020-0001-0000-0000-000000000000',
  org2: '00000020-0002-0000-0000-000000000000',
};
const C = {
  channel1: '00000030-0001-0000-0000-000000000000',
  channel2: '00000030-0002-0000-0000-000000000000',
};
const WP_ID = {
  wp1: 't28-wp-config-1',
  wp2: 't28-wp-config-2',
};

function applyMigration(sqlPath: string): void {
  accessSync(sqlPath); // ENOENT → TDD red sentinel
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

function runSql(sql: string, label = 'sql'): void {
  const tmp = path.join(os.tmpdir(), `${label}-${Date.now()}.sql`);
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

describe('T2.8 — wordpress_configs → publish_targets backfill', { timeout: 60_000 }, () => {
  beforeAll(() => {
    runSql(
      `
-- ============================================================
-- CLEANUP: remove any leftover state from prior test runs
-- ============================================================
DELETE FROM public.publish_targets WHERE channel_id IN ('${C.channel1}'::uuid, '${C.channel2}'::uuid);
DELETE FROM public.wordpress_configs WHERE id IN ('${WP_ID.wp1}', '${WP_ID.wp2}');
DELETE FROM public.channels WHERE id IN ('${C.channel1}'::uuid, '${C.channel2}'::uuid);
DELETE FROM public.organizations WHERE id IN ('${O.org1}'::uuid, '${O.org2}'::uuid);
DELETE FROM auth.users WHERE id IN ('${U.wpUser1}'::uuid, '${U.wpUser2}'::uuid);

-- ============================================================
-- AUTH USERS
-- ============================================================
INSERT INTO auth.users
  (id, email, email_confirmed_at, encrypted_password, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES
  ('${U.wpUser1}', 'wpuser1@test.local', now(), 'x', now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
  ('${U.wpUser2}', 'wpuser2@test.local', now(), 'x', now(), now(), '{}', '{}', 'authenticated', 'authenticated');

-- ============================================================
-- ORGANIZATIONS + CHANNELS
-- ============================================================
INSERT INTO public.organizations (id, name, slug) VALUES
  ('${O.org1}'::uuid, 'T2.8 Org 1', 't28-org-1-fixed'),
  ('${O.org2}'::uuid, 'T2.8 Org 2', 't28-org-2-fixed');

INSERT INTO public.channels (id, org_id, user_id, name) VALUES
  ('${C.channel1}'::uuid, '${O.org1}'::uuid, '${U.wpUser1}'::uuid, 'T2.8 Channel 1'),
  ('${C.channel2}'::uuid, '${O.org2}'::uuid, '${U.wpUser2}'::uuid, 'T2.8 Channel 2');

-- ============================================================
-- WORDPRESS CONFIGS (the source rows to backfill)
-- ============================================================
INSERT INTO public.wordpress_configs (id, site_url, username, password, channel_id) VALUES
  ('${WP_ID.wp1}', 'https://site1.example.com', 'admin1', 'enc-app-pass-1', '${C.channel1}'::uuid),
  ('${WP_ID.wp2}', 'https://site2.example.com', 'admin2', 'enc-app-pass-2', '${C.channel2}'::uuid);
`,
      't28-backfill-setup',
    );
  }, 60_000);

  it('1. one publish_targets row per wordpress_configs row, type=wordpress, scoped to channel', () => {
    applyMigration(MIG_BACKFILL);
    const rows = rowsQuery(
      `SELECT channel_id::text, type
         FROM public.publish_targets
         WHERE channel_id IN ('${C.channel1}'::uuid, '${C.channel2}'::uuid)
         ORDER BY channel_id;`,
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const [, targetType] = row.split('|').map((s) => s.trim());
      expect(targetType).toBe('wordpress');
    }
  });

  it('2. fields map: display_name=site_url, credentials_encrypted=password, config_json carries siteUrl+username', () => {
    const rows = rowsQuery(
      `SELECT
         wc.id,
         pt.display_name,
         pt.credentials_encrypted,
         pt.config_json->>'siteUrl',
         pt.config_json->>'username'
       FROM public.wordpress_configs wc
       JOIN public.publish_targets pt
         ON pt.channel_id = wc.channel_id AND pt.type = 'wordpress'
       WHERE wc.id IN ('${WP_ID.wp1}', '${WP_ID.wp2}')
       ORDER BY wc.id;`,
    );
    expect(rows).toHaveLength(2);

    const [r1, r2] = rows.map((r) => r.split('|').map((s) => s.trim()));
    expect(r1).toEqual([
      WP_ID.wp1,
      'https://site1.example.com',
      'enc-app-pass-1',
      'https://site1.example.com',
      'admin1',
    ]);
    expect(r2).toEqual([
      WP_ID.wp2,
      'https://site2.example.com',
      'enc-app-pass-2',
      'https://site2.example.com',
      'admin2',
    ]);
  });

  it('3. wordpress_configs.publish_targets_id points to the matching publish_targets row', () => {
    const mismatches = countQuery(
      `SELECT COUNT(*)
         FROM public.wordpress_configs wc
         LEFT JOIN public.publish_targets pt ON pt.id = wc.publish_targets_id
         WHERE wc.id IN ('${WP_ID.wp1}', '${WP_ID.wp2}')
           AND (
             wc.publish_targets_id IS NULL
             OR pt.channel_id <> wc.channel_id
             OR pt.type <> 'wordpress'
           );`,
    );
    expect(mismatches).toBe(0);
  });

  it('4. re-running migration is a no-op (no duplicate publish_targets, pointer unchanged)', () => {
    const beforeRows = rowsQuery(
      `SELECT wc.id, wc.publish_targets_id::text
         FROM public.wordpress_configs wc
         WHERE wc.id IN ('${WP_ID.wp1}', '${WP_ID.wp2}')
         ORDER BY wc.id;`,
    );
    const beforeTargets = countQuery(
      `SELECT COUNT(*) FROM public.publish_targets
         WHERE channel_id IN ('${C.channel1}'::uuid, '${C.channel2}'::uuid);`,
    );

    applyMigration(MIG_BACKFILL);

    const afterRows = rowsQuery(
      `SELECT wc.id, wc.publish_targets_id::text
         FROM public.wordpress_configs wc
         WHERE wc.id IN ('${WP_ID.wp1}', '${WP_ID.wp2}')
         ORDER BY wc.id;`,
    );
    const afterTargets = countQuery(
      `SELECT COUNT(*) FROM public.publish_targets
         WHERE channel_id IN ('${C.channel1}'::uuid, '${C.channel2}'::uuid);`,
    );

    expect(afterTargets).toBe(beforeTargets);
    expect(afterRows).toEqual(beforeRows);
  });
});
