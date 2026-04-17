# Affiliate Phase 2D — Legacy Cutover — Design Spec

**Date:** 2026-04-17
**Status:** draft (on-branch partial completion; prod-execution deferred)
**Phase:** 2D of the affiliate migration (Sub-project 5 of 5 on branch `feat/affiliate-2a-foundation`)
**Predecessors on branch:** 0 (email provider abstraction), 2A (foundation), 2B (end-user UI), 2C (admin UI), 2E (fraud), 2F (billing/payout/tax)
**Successor:** none — this is the last sub-project of the long-lived branch.

> **Partial-completion semantics (read first):** this sub-project ships **code artifacts and locally-tested SQL** — the migration file, the route deletion, the apps/app consumer cleanup, and a seed→migrate→verify integration test. It does **not** execute the cutover against real production data. Actual prod cutover is a **separate event** after branch merge (or during the pre-activation rehearsal window) requiring a prod-snapshot dry-run or short staging soak. §9 Done Criteria draws the line explicitly: "branch-done" vs "prod-done." The destructive SQL runs last and only after a human review step acknowledges the residual risks in §8.

---

## 1. Context & Goals

### Background

Phase 2A renamed the legacy table `affiliate_referrals` to `affiliate_referrals_legacy`
(`supabase/migrations/20260417000000_rename_legacy_affiliate_referrals.sql`) to free
the namespace for the package-shipped `affiliate_referrals` table. `affiliate_programs`
was left in place (no name collision — the package uses `affiliates`). A thin
compatibility shim, `apps/api/src/routes/affiliate-legacy.ts` (145 LOC, marked
`@deprecated`), continues to serve the existing `apps/app/(app)/settings/affiliate/page.tsx`
against the legacy schema on three routes: `GET /program`, `POST /program`,
`GET /referrals`. The legacy data model is:

```text
affiliate_programs (10 columns)         affiliate_referrals_legacy (9 columns)
  id              uuid PK                  id                       uuid PK
  user_id         → auth.users             affiliate_program_id     → affiliate_programs
  code            text UNIQUE              referred_org_id          → organizations
  commission_pct  numeric(5,2)             first_touch_at           timestamptz
  payout_method   text                     conversion_at            timestamptz NULL
  payout_details  jsonb                    subscription_amount_cents integer NULL
  total_referrals integer                  commission_cents         integer NULL
  total_revenue_cents integer              status                   text (pending|approved|paid|refunded)
  total_paid_cents integer                 created_at               timestamptz
  created_at      timestamptz
```

Phase 2B rewrote the settings page against the new package schema. As of the top
of 2D, the legacy routes are **no longer** referenced by any production UI path —
but they remain callable until deleted.

### Goals (2D on-branch scope)

1. **(a)** Ship a forward-only data migration that copies `affiliate_programs` rows
   into `affiliates` (package table) — mapping `{user_id, code, commission_pct}`
   to `{user_id, code, commission_rate}` with correct `name`/`email`/`status`/`tier`
   defaults, null-handling, and idempotency.
2. **(b)** Ship a forward-only migration that copies `affiliate_referrals_legacy`
   rows into `affiliate_referrals` (user via org→primary-user lookup per the
   existing convention in `apps/api/src/routes/affiliate.ts:13-19` — now preserved
   in `affiliate-legacy.ts:20-38` since affiliate.ts no longer exists) and derives
   zero-or-one `affiliate_commissions` rows from legacy referrals with non-null
   `commission_cents`.
3. **(c)** Ship a destructive migration that conditionally drops
   `affiliate_referrals_legacy` and `affiliate_programs` (`DROP TABLE IF EXISTS … CASCADE`),
   **gated behind a separate migration file** that operators apply manually
   **after** the rehearsal confirms mapping integrity.
4. **(d)** Delete `apps/api/src/routes/affiliate-legacy.ts` and its test file (if any).
5. **(e)** Remove every `/api/affiliate-legacy/*` call from `apps/app` — verified
   via exhaustive grep (currently 3 call sites in `settings/affiliate/page.tsx`;
   2B should have removed them, but 2D validates they are gone or removes any
   that survived).
6. **(f)** Ship a Category-C-but-runnable integration test that seeds representative
   legacy data into a local Supabase instance, applies the data + drop migrations
   in sequence, and asserts mapping integrity across all edge cases listed in §8.
7. Keep the destructive step reversible-in-dev: Appendix A reproduces the 2A
   Appendix C rollback SQL **extended** for the 2D changes (re-create dropped
   tables, undo the legacy rename). Dev-only — prod rollback is "restore snapshot."

### Non-goals (out of scope for 2D)

- **Executing the cutover against production data.** Deferred to a separate
  post-merge rehearsal event (see §7.2D.R + §9 "prod-done" criteria).
- Replaying historical clicks (the legacy schema has no per-click table — click
  totals are aggregated counters; we don't attempt to reconstruct synthetic
  `affiliate_clicks` rows).
- Backfilling tier assignment based on referral volume (all migrated affiliates
  start `tier='nano'`, the package default; tier upgrades happen via the
  existing admin `propose-change` / accept flow).
- Preserving legacy `total_revenue_cents` / `total_paid_cents` aggregates into
  new `total_earnings_brl` (the counters are derived by package use cases from
  `affiliate_commissions`; migrating the aggregated snapshot would diverge
  from that source-of-truth). Documented in §8 E10.
- Archiving dropped-table data to object storage — prod DBA is responsible for
  taking a Supabase snapshot immediately before running the drop migration;
  the spec calls this out in §7.2D.R but does not automate it.
- Content-submissions / PIX-keys / payouts migration — these tables do not
  exist in the legacy schema. Nothing to migrate.

### Cross-cutting constraints reaffirmed

- **CC-1 (branch stability):** this is the last sub-project on
  `feat/affiliate-2a-foundation`; no rename. All sub-projects merge together.
- **CC-2 (rebase cadence):** before final commit, confirm `supabase/migrations/`
  still orders correctly against `main`. No other migrations have landed on main
  during the branch's lifetime (verified in 2C); if this changes, reorder
  timestamps in a dedicated commit.
- **CC-3 (local-test-first):** the seed→migrate→verify integration test from
  goal (f) runs against the local Supabase stack (`npm run db:reset` +
  `npm run test:integration` against a seeded fixture). Prod rehearsal is a
  separate manual step per CC-4.
- **CC-4 (local-only smoke validation replaces staging-soak):** no staging
  deployment. The "prod rehearsal" described in §7.2D.R happens as a manual
  DBA step after branch merge, using a prod snapshot restored into a disposable
  staging DB or into `localhost` — operator-driven, outside this branch's CI.

---

## 2. Current State (end of 2C, start of 2D)

### Legacy route handler

`apps/api/src/routes/affiliate-legacy.ts` — 145 LOC, `@deprecated` marker in
JSDoc, registered in `src/index.ts:192` under prefix `/affiliate-legacy`.
Three handlers:

| Method | Path | Implementation |
|---|---|---|
| GET | `/program` | Reads from `affiliate_programs` filtered by `user_id`; plan-gate via `org_memberships` + `organizations.plan ∈ {starter, creator, pro}` |
| POST | `/program` | Creates a row in `affiliate_programs` with `commission_pct=20`, auto-generated `code = 'BT-' + crypto.randomBytes(4).toString('hex').toUpperCase()` |
| GET | `/referrals` | Reads from `affiliate_referrals_legacy` filtered by `affiliate_program_id`; note the `'affiliate_referrals_legacy' as never` cast — typegen has not regenerated since 2A |

The file imports `authenticate`, `createServiceClient`, `sendError`, and `ApiError`.
No test file at `__tests__/affiliate-legacy.test.ts` exists (verified via Glob).

### Legacy database tables

Both live in `public` schema, RLS enabled from
`supabase/migrations/20260414040000_publishing_destinations.sql:72-73`.
Foreign-key dependents:

- `affiliate_programs.id` ← `affiliate_referrals_legacy.affiliate_program_id`
  (`ON DELETE CASCADE`; the rename in 2A preserved FK OIDs)
- `affiliate_programs.user_id` → `auth.users(id)` (`ON DELETE CASCADE`)
- `affiliate_referrals_legacy.referred_org_id` → `organizations(id)` (`ON DELETE CASCADE`)

Indexes: `affiliate_programs_user_idx(user_id)`, `affiliate_referrals_program_idx(affiliate_program_id)`.

No RLS policies beyond "RLS enabled" — effectively deny-all except `service_role`,
matching the rest of the codebase. No `updated_at` trigger (the tables have only
`created_at`).

### apps/app consumer calls (verified via grep)

| File | Line | Call |
|---|---|---|
| `apps/app/src/app/(app)/settings/affiliate/page.tsx` | 41 | `fetch('/api/affiliate-legacy/program')` |
| `apps/app/src/app/(app)/settings/affiliate/page.tsx` | 56 | `fetch('/api/affiliate-legacy/referrals')` |
| `apps/app/src/app/(app)/settings/affiliate/page.tsx` | 72 | `fetch('/api/affiliate-legacy/program', { method: 'POST' })` |

**Status note:** the page as checked in on branch HEAD still targets the legacy
endpoints. This is expected — 2B's rewrite lives on a later commit of the same
branch (see `feat/affiliate-2a-foundation` log). By the time 2D applies, 2B has
landed and these fetch calls have been replaced with new `/api/affiliate/*`
calls. 2D's goal (e) is a **verification sweep**, not a bulk rewrite — if
leftover calls are found, the 2D commit removes them but 2B is expected to have
handled the substantive rewrite already.

### Package tables (target schema, from 2A)

Relevant columns for the mapping (verified from
`supabase/migrations/20260417000001_affiliate_001_schema.sql`
and `…002_payouts.sql`):

```text
affiliates                           affiliate_referrals            affiliate_commissions
  id uuid PK                           id uuid PK                    id uuid PK
  user_id uuid NULL (package default)  affiliate_id → affiliates     affiliate_id → affiliates
  code VARCHAR(12) UNIQUE              affiliate_code VARCHAR(12)    affiliate_code VARCHAR(12)
  name TEXT NOT NULL                   user_id uuid NOT NULL UNIQUE  user_id uuid NULL
  email TEXT NOT NULL                  click_id uuid NULL            referral_id → referrals
  status (pending|approved|active|     attribution_status (active|   payout_id uuid NULL
          paused|terminated|rejected)                  pending_contract|  payment_amount INT (cents? see §3)
  tier (nano|micro|mid|macro|mega)                     expired|paused)   stripe_fee INT default 0
  commission_rate NUMERIC(5,4)         signup_date TIMESTAMPTZ       net_amount INT
  fixed_fee_brl INT NULL               window_end TIMESTAMPTZ        commission_rate NUMERIC(5,4)
  total_clicks INT default 0           converted_at TIMESTAMPTZ NULL commission_brl INT
  total_referrals INT default 0        platform (android|ios|web) NULL fixed_fee_brl INT NULL
  total_conversions INT default 0      signup_ip_hash TEXT NULL      total_brl INT
  total_earnings_brl INT default 0     created_at TIMESTAMPTZ        payment_type (monthly|annual)
  … 20+ contract/proposal fields                                     status (pending|paid|cancelled)
```

Crucial constraints the migration must satisfy:

- `affiliates.code VARCHAR(12) UNIQUE` — legacy code format is `'BT-' + 8 hex` = 11 chars, fits.
- `affiliates.name TEXT NOT NULL` and `affiliates.email TEXT NOT NULL` — legacy has
  neither; we must derive from `auth.users` (email) and a placeholder name
  (§3 mapping table).
- `affiliate_referrals.user_id uuid NOT NULL UNIQUE` — every referral needs a
  user (we map via `org_memberships ASC LIMIT 1`) AND no two referrals can
  share a user. Edge case E3 in §8.
- `affiliate_commissions.payment_amount INT NOT NULL CHECK (> 0)` — legacy
  `subscription_amount_cents` can be NULL or 0; we skip commission insert when it is.
- `affiliate_commissions.commission_brl INT NOT NULL CHECK (>= 0)` — derived
  from `subscription_amount_cents * commission_pct / 100`, rounded.

### Branch head state (for reviewer orientation)

As of the 2D commit landing: 7 prior affiliate migrations exist
(20260417000000 through …000006), and all earlier sub-project commits
(0, 2A, 2B, 2C, 2E, 2F) have merged into the branch. No unrelated migrations
have landed on `main` during the branch's lifetime (re-verified in §7.2D.0).

---

## 3. Target State

### New migration files (2 added; third is manual-apply, see §7)

```text
supabase/migrations/
├── 20260417000007_affiliate_legacy_data_migration.sql   (new — data copy)
├── 20260417000008_affiliate_legacy_drop_tables.sql      (new — destructive drop)
```

Numbering resumes after `…000006` (the last 2A consumer migration). Gap-free
sequence preserves `db:push:dev` ordering.

The **drop** migration is timestamp-separated from the data migration so an
operator can apply …000007 in dev/rehearsal, verify counts, then apply …000008
in a second deliberate step. `db:push:dev` does apply both if they're committed
together — **this is fine for the branch** (local dev). For prod, see §7.2D.R
which describes the two-phase manual apply.

### Mapping contract (verified column-by-column)

#### `affiliate_programs` → `affiliates`

| Source | Destination | Transform / Default | Edge case |
|---|---|---|---|
| `id` | — | not carried (new `id` generated) | — |
| `user_id` | `user_id` | direct | — |
| `code` | `code` | direct (11 chars fits VARCHAR(12)) | E1: legacy code collides with existing `affiliates.code` |
| `commission_pct` (numeric(5,2)) | `commission_rate` (NUMERIC(5,4)) | `commission_pct / 100.0` (20.00 → 0.2000) | E2: rate > 1.0 after scaling (malformed legacy data where pct was stored as decimal already) |
| `total_referrals` | `total_referrals` | direct | — |
| `total_revenue_cents` | — (intentionally dropped) | see Non-goals §1; counters rebuild from commissions | E10 |
| `total_paid_cents` | — (intentionally dropped) | same | E10 |
| `payout_method`, `payout_details` | — | dropped; PIX-key rows are a 2F concern; legacy had no structured PIX | — |
| `created_at` | `created_at` | direct | — |
| — | `name` | `COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = ap.user_id), 'Legacy Affiliate')` | E5: auth.users row missing (cascade would have deleted the program, but snapshot race possible) |
| — | `email` | `COALESCE((SELECT email FROM auth.users WHERE id = ap.user_id), ap.code || '@legacy.invalid')` | E5 |
| — | `status` | `'active'` — legacy program existed = affiliate was approved and active | E6: paused/terminated semantics lost |
| — | `tier` | `'nano'` (package default) | tier upgrades via admin flow post-cutover |
| — | `updated_at` | `created_at` (seed from existing timestamp, not `NOW()`; preserves ordering in admin views) | — |
| — | `affiliate_type` | `'internal'` — legacy program implies existing BrightTale user, matching the "internal" semantics of the package | — |
| — | contract fields (`contract_start_date`, `contract_end_date`, `contract_version`, `contract_acceptance_version`, `contract_accepted_at/ip/ua`) | NULLs except `contract_version = 1`; pre-existing affiliates are deemed on the "v1 contract" by virtue of existing | — |

**SQL shape (excerpted; full text in Appendix B):**

```sql
INSERT INTO public.affiliates (user_id, code, name, email, status, tier, commission_rate,
    affiliate_type, total_referrals, total_clicks, total_conversions, total_earnings_brl,
    contract_version, created_at, updated_at)
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
    0, 0, 0,        -- total_clicks/conversions/earnings rebuild from commissions
    1,
    ap.created_at,
    ap.created_at
FROM public.affiliate_programs ap
LEFT JOIN auth.users au ON au.id = ap.user_id
WHERE NOT EXISTS (SELECT 1 FROM public.affiliates a WHERE a.user_id = ap.user_id OR a.code = ap.code);
```

The `WHERE NOT EXISTS` clause is the **idempotency guard** and also handles edge
cases E1 (code collision) and E4 (affiliate already exists for user — re-apply
safe). Rows that fail this predicate are silently skipped and logged via a
**post-migration audit query** run by the rehearsal operator (see §7.2D.R).

#### `affiliate_referrals_legacy` → `affiliate_referrals`

The mapping requires org→user resolution. The existing convention (`affiliate.ts:13-19`,
preserved in `affiliate-legacy.ts:20-38`):

```sql
SELECT user_id FROM org_memberships WHERE org_id = ? ORDER BY created_at ASC LIMIT 1
```

| Source | Destination | Transform |
|---|---|---|
| `id` | — | new `id` generated |
| `affiliate_program_id` | `affiliate_id` | resolve via `JOIN affiliates a ON a.user_id = old_program.user_id` (identified by the mapped affiliate, which has the same `user_id` and `code`) |
| — | `affiliate_code` | pulled from the mapped `affiliates.code` |
| `referred_org_id` | `user_id` | `(SELECT user_id FROM org_memberships WHERE org_id = arl.referred_org_id ORDER BY created_at ASC LIMIT 1)` — E3, E7 |
| `first_touch_at` | `signup_date` | direct |
| — | `window_end` | `first_touch_at + INTERVAL '12 months'` (package default) |
| `conversion_at` | `converted_at` | direct (NULL OK) |
| `status` | `attribution_status` | mapping table below |
| — | `click_id` | NULL — legacy had no click granularity (E8) |
| — | `platform` | NULL — legacy never captured platform |
| — | `signup_ip_hash` | NULL — legacy never captured IP |
| `created_at` | `created_at` | direct |

**Status mapping:**

| Legacy `status` | New `attribution_status` | Derived commission? |
|---|---|---|
| `'pending'` | `'active'` (attribution window still valid if within 12mo) | no |
| `'approved'` | `'active'` (commission derived if `commission_cents > 0`) | yes |
| `'paid'` | `'active'` (commission derived, status `'paid'`) | yes |
| `'refunded'` | `'expired'` (no longer attributable) | yes, status `'cancelled'` |

**Critical:** the package `affiliate_referrals.user_id` has a `UNIQUE` constraint.
The same BrightTale user cannot appear in two referral rows. If the legacy data
has duplicate `referred_org_id → primary-user` mappings (two separate orgs whose
primary user is the same person), the `INSERT` collides. E3 spells out the
resolution: dedupe by keeping the **earliest** `first_touch_at` row and dropping
the rest (log dropped IDs in the audit query).

**Idempotency:** guard the insert with `WHERE NOT EXISTS (SELECT 1 FROM affiliate_referrals ar WHERE ar.user_id = <resolved-user>)`.

#### Derived `affiliate_commissions`

For each `affiliate_referrals_legacy` row with `subscription_amount_cents IS NOT NULL
AND subscription_amount_cents > 0 AND status IN ('approved', 'paid', 'refunded')`,
insert one `affiliate_commissions` row:

| Destination | Derivation |
|---|---|
| `affiliate_id`, `affiliate_code` | from the mapped referral |
| `user_id` | from the mapped referral |
| `referral_id` | from the mapped referral's new `id` |
| `payout_id` | NULL — legacy payout tracking was aggregated, not per-row (see §1 Non-goals) |
| `payment_amount` | `subscription_amount_cents` (unit note: see §4 "Currency unit reconciliation") |
| `stripe_fee` | 0 — legacy never stored fees separately |
| `net_amount` | `subscription_amount_cents` (same as payment; fee assumption above) |
| `commission_rate` | mapped `affiliates.commission_rate` (i.e., `commission_pct/100`) |
| `commission_brl` | `COALESCE(commission_cents, ROUND(subscription_amount_cents * commission_rate))` |
| `fixed_fee_brl` | NULL |
| `total_brl` | same as `commission_brl` (no fixed fee) |
| `payment_type` | `'monthly'` — legacy never distinguished; we assume monthly for v1 and flag in E9 |
| `status` | from legacy status: `approved → 'pending'`, `paid → 'paid'`, `refunded → 'cancelled'` |
| `created_at` | from legacy `conversion_at` if present, else `first_touch_at` |

### Post-migration counter refresh

After the data copies, run an UPDATE to rebuild `affiliates.total_earnings_brl` from
the derived commissions (the `total_clicks`/`conversions` stay at 0 — legacy had
no equivalent granularity):

```sql
UPDATE public.affiliates a
SET total_earnings_brl = COALESCE(sums.s, 0)
FROM (SELECT affiliate_id, SUM(total_brl) AS s FROM public.affiliate_commissions GROUP BY affiliate_id) sums
WHERE sums.affiliate_id = a.id;
```

### Files deleted / edited (code)

```text
DELETE  apps/api/src/routes/affiliate-legacy.ts              (-145 LOC)
EDIT    apps/api/src/index.ts                                 (-2 LOC import + register)
EDIT    apps/app/src/app/(app)/settings/affiliate/page.tsx    (verification sweep — 0 LOC expected
                                                               if 2B already rewrote; commit diff
                                                               documents any surviving call as a
                                                               2B-miss + removal)
NEW     supabase/migrations/20260417000007_affiliate_legacy_data_migration.sql   (~140 LOC)
NEW     supabase/migrations/20260417000008_affiliate_legacy_drop_tables.sql      (~20 LOC)
NEW     apps/api/src/__tests__/migrations/affiliate-legacy-cutover.test.ts       (~180 LOC integration test)
NEW     scripts/rehearsal-audit-legacy-cutover.sql                               (~40 LOC — run by operator during rehearsal)
```

---

## 4. Architecture

### Migration execution order (within 2D)

```text
20260417000007  (data copy; idempotent; INSERT … WHERE NOT EXISTS guards)
                ├─ affiliates           (from affiliate_programs)
                ├─ affiliate_referrals  (from affiliate_referrals_legacy)
                ├─ affiliate_commissions (derived)
                └─ counter refresh

20260417000008  (destructive; IF EXISTS guards)
                ├─ DROP TABLE public.affiliate_referrals_legacy CASCADE
                └─ DROP TABLE public.affiliate_programs CASCADE
```

Both run inside the implicit transaction that `supabase db push` wraps around
each migration file. Partial failure within …000007 rolls back the entire file.
…000008 is deliberately short so a partial failure is unambiguous.

### Currency unit reconciliation

The legacy schema stores amounts in **cents** (`subscription_amount_cents`,
`commission_cents`). The package's `affiliate_commissions` columns are named
`payment_amount`, `net_amount`, `commission_brl`, `total_brl`. The package's
type definitions (`@tn-figueiredo/affiliate` exports in `dist/types.d.ts`) and
the 2A mapper layer treat these as integer cents. **We preserve the cent unit
1:1 across the migration** — no division by 100. E11 flags the risk: if the
package semantics turn out to be "reais × 100" vs "cents of BRL" (same number,
different label), no change; if they turn out to be "whole reais," we're
inflating values 100×. Verified against `apps/api/src/lib/affiliate/repository/mappers.ts`
in 2A — **unit is cents, confirmed.**

### Org-to-user lookup correctness

The convention `SELECT user_id FROM org_memberships WHERE org_id = ? ORDER BY created_at ASC LIMIT 1`
returns the **earliest-joined member**, which is the org owner by creation-time
proxy. `affiliate-legacy.ts:20-38` uses this to scope "which affiliate-program
belongs to this request"; 2D reuses the same convention for referrals. Known
drawbacks:

- An org with **0 members** at migration time (an account that was
  administratively suspended mid-lifecycle and all memberships cascaded out)
  yields NULL and fails the `NOT NULL` constraint on `affiliate_referrals.user_id`.
  E7 handles.
- An org that transferred ownership (the earliest-joined member is no longer
  the owner) still resolves to that earliest member — not semantically wrong
  for attribution, but historically noisy if the earliest member left.
  Accepted; documented in E7.

### Idempotency model

All three INSERTs use `WHERE NOT EXISTS (…)` guards keyed by the relevant
uniqueness predicate:

| INSERT target | Uniqueness guard |
|---|---|
| `affiliates` | `a.user_id = ap.user_id OR a.code = ap.code` (both unique independently) |
| `affiliate_referrals` | `ar.user_id = <resolved-user>` (UNIQUE constraint) |
| `affiliate_commissions` | `ac.referral_id = <new-referral-id>` — note: a referral COULD have multiple commissions in the new schema (monthly subscriptions), but legacy had at most one, so `referral_id` is a safe dedupe key for this migration only |

Running …000007 twice is a no-op. This is important for the rehearsal workflow
(run in staging, examine, re-run in prod).

### Route handler removal — safety

Deleting `affiliate-legacy.ts` + removing the `server.register(affiliateLegacyRoutes, …)`
line in `src/index.ts` causes any surviving `/api/affiliate-legacy/*` fetch to
return **404**, not 500. The Next.js rewrite in `apps/app` still forwards the
request to `apps/api`; `apps/api`'s Fastify returns 404 because no route matches.
The API envelope wraps 404s via the global `setErrorHandler`, so the client
receives `{ data: null, error: { code: 'NOT_FOUND', message: 'Route not found' } }` —
consistent with the rest of the API. This is what we want: if 2B missed a call
site, the user sees a 404 toast instead of a thrown exception.

### Rollback shape (dev only)

Appendix A concatenates the 2A rollback SQL (Appendix C in the 2A spec) with a
2D-specific prefix that re-creates `affiliate_programs` and `affiliate_referrals_legacy`
(re-reads `20260414040000_publishing_destinations.sql` and
`20260417000000_rename_legacy_affiliate_referrals.sql`). **Prod rollback is
"restore Supabase snapshot" — the 2D drop is destructive of user-visible
history**, and re-creating empty tables does not restore the rows. This is
why §8 R1 escalates the severity and why the rehearsal step in §7.2D.R
**requires a confirmed snapshot timestamp** before approving the drop.

---

## 5. Testing

### Unit tests

None. 2D is pure SQL + file deletion + consumer verification. Unit-testing SQL
is low-value; the integration test is the load-bearing one.

### Integration test (`apps/api/src/__tests__/migrations/affiliate-legacy-cutover.test.ts`)

**Gating:** this is a **Category C** test per CLAUDE.md (DB-hitting). Per the
branch's CC-3/CC-4 posture, it runs against **local Supabase** via
`npm run db:reset` + a test harness. It is **not** `describe.skip`-d — it is
wired into the new `test:integration` script introduced in sub-project 0 (email
provider abstraction). The vitest integration config from sub-project 0 already
excludes it from `npm test` (fast unit path).

**Runner command:** `npm run db:reset && npm run test:integration -- affiliate-legacy-cutover`.

**Fixture shape (seeded in `beforeAll`):**

```ts
// 10 legacy affiliate_programs covering the edge cases from §8:
// - 5 "happy path" programs with 2 referrals each (10 referrals total)
// - 1 with a commission_pct that scales to exactly 1.0 (E2 boundary)
// - 1 with a code that collides with a pre-existing affiliates.code (E1)
// - 1 with a user_id whose auth.users.email is NULL (E5)
// - 1 whose user has an org with 0 memberships (E7 — expect referral dropped + logged)
// - 1 with a referred_org_id whose primary user already appears as a separate
//   referral target for another affiliate (E3 — expect dedupe)
```

**Assertions:**

1. After …000007 applies, `affiliates` row count increases by exactly 9
   (10 minus the 1 that collides on code).
2. Every migrated `affiliates` row has non-null `name` and `email`, `status='active'`,
   `tier='nano'`, `commission_rate = programs.commission_pct / 100.0`.
3. `affiliate_referrals` row count matches the seed minus dedupe drops (E3) and
   minus zero-member-org drops (E7). The test records the expected count precisely.
4. Every `affiliate_referrals` row has a resolvable `user_id` (non-null, referenced
   in `auth.users`).
5. `affiliate_commissions` count equals the number of legacy referrals with
   `subscription_amount_cents > 0 AND status ∈ {approved, paid, refunded}`.
6. For `status='refunded'` legacy rows, the derived commission row has
   `status='cancelled'` and the referral has `attribution_status='expired'`.
7. `affiliates.total_earnings_brl` for each migrated affiliate equals the
   `SUM(total_brl)` of its derived commissions.
8. Running …000007 a second time is a no-op (row counts unchanged).
9. After …000008 applies, `SELECT to_regclass('public.affiliate_programs')` and
   `SELECT to_regclass('public.affiliate_referrals_legacy')` return NULL.
10. Post-drop, `SELECT COUNT(*) FROM public.affiliates` still matches the
    assertion-1 count (i.e., the `CASCADE` did not null-cascade data).
11. GET `/api/affiliate-legacy/program` returns 404 with the standard
    `{ data: null, error: { code: 'NOT_FOUND' } }` envelope (this asserts the
    route handler deletion — run against the in-process test server).

**Timeout:** 30s. SQL-heavy, multiple table operations, one Fastify request.

### Local consumer-sweep verification (step, not test)

Before committing, run:

```bash
grep -rn "/api/affiliate-legacy" apps/
```

Expected output: **zero matches.** If non-zero, the 2D commit either removes the
surviving calls or aborts (depending on what they do — if 2B missed a component,
the fix belongs in 2B; if it's a new 2D-introduced reference, it's a spec bug).
The grep runs in the `npm run typecheck`-adjacent step, not in CI (per CC-4).

### Typecheck

`npm run typecheck` must remain green. The `'affiliate_referrals_legacy' as never`
cast in the deleted file disappears with the file. The regenerated
`packages/shared/src/types/database.ts` (from `npm run db:types` after migration
apply) will no longer contain `affiliate_programs` or `affiliate_referrals_legacy`
— any surviving reference in app code would fail typecheck. This is a **free
second-line sweep** beyond the grep.

---

## 6. Configuration

No new environment variables. No `.env.example` changes.

The data-migration SQL uses only `public.` and `auth.` schema — no `extensions.`
surfaces (`gen_random_uuid()` is already enabled project-wide since the initial
schema).

`db:push:dev` applies both migrations atomically per-file; the operator must
approve the destructive drop (see §7.2D.R). `db:types` regeneration runs once
after both migrations apply.

---

## 7. Migration Path

Three named commits on `feat/affiliate-2a-foundation` (may be squashed at merge
time; CC-1 keeps the branch history coherent for review).

### 7.2D.0 — Pre-flight (no commit)

- Confirm `main` has not gained new migrations since last rebase (`git fetch origin main && git log origin/main --since="$(date -d '7 days ago' --iso-8601)" -- supabase/migrations/`).
  If new migrations exist, rebase + reorder timestamps before proceeding.
- Confirm the branch already has all 2A/2B/2C/2E/2F commits landed. If 2B's
  `settings/affiliate/page.tsx` rewrite is not yet present, 2D is premature.
- Confirm local Supabase is up (`npm run db:start`) and `npm run db:reset`
  applies the full migration chain through `…000006` without error.

### 7.2D.1 — Commit A: migrations + integration test (non-destructive)

- Create `supabase/migrations/20260417000007_affiliate_legacy_data_migration.sql`
  (Appendix B full SQL).
- Create `apps/api/src/__tests__/migrations/affiliate-legacy-cutover.test.ts`
  (fixture + 11 assertions per §5).
- Create `scripts/rehearsal-audit-legacy-cutover.sql` (audit queries the
  rehearsal operator runs between …000007 and …000008).
- Run: `npm run db:reset && npm run test:integration -- affiliate-legacy-cutover` — green.
- Run: `npm run db:types` — regenerate `packages/shared/src/types/database.ts`
  (note: at this point the legacy tables still exist, so types still include
  them; regeneration happens again after Commit B).
- Commit message: `feat(api): affiliate 2D — legacy data-migration SQL + integration test`.

### 7.2D.2 — Commit B: drop migration + route deletion + consumer sweep

- Create `supabase/migrations/20260417000008_affiliate_legacy_drop_tables.sql`.
- Delete `apps/api/src/routes/affiliate-legacy.ts`.
- Edit `apps/api/src/index.ts` lines 56 + 192 (remove import + register).
- Run `grep -rn "/api/affiliate-legacy" apps/` — confirm zero matches.
- If matches exist, remove them (with a line-by-line diff review explaining
  why each surviving call was missed by 2B).
- Run: `npm run db:reset && npm run test:integration` — green
  (now including assertions 9/10/11).
- Run: `npm run db:types` — regenerate; verify `affiliate_programs` and
  `affiliate_referrals_legacy` are gone from the generated types.
- Run: `npm run typecheck` across all 4 workspaces — green.
- Run: `npm test` (unit) — green.
- Commit message: `feat(api): affiliate 2D — drop legacy routes + tables`.

### 7.2D.R — Prod rehearsal (post-branch, DEFERRED — not in branch scope)

**This step does not happen on the branch.** It is a separate event after
branch merge, led by the DBA/operator. Spec'd here so the operator knows
what to do.

1. **Snapshot:** take a Supabase prod snapshot. Record snapshot ID in the
   rehearsal log.
2. **Restore-to-staging OR local:** restore the snapshot into a disposable
   staging DB (or into local Supabase if snapshot is small enough). This is
   the "short staging soak" option per CC-4.
3. **Apply …000007:** `psql $STAGING_URL -f supabase/migrations/20260417000007_affiliate_legacy_data_migration.sql`.
4. **Run audit:** `psql $STAGING_URL -f scripts/rehearsal-audit-legacy-cutover.sql`.
   The audit queries output:
   - count of legacy `affiliate_programs` rows
   - count of newly-inserted `affiliates` rows
   - diff list: programs with no corresponding new affiliate (skipped by idempotency
     guard — should all be E1 code-collision or E4 user-already-exists; operator
     reviews each)
   - count of legacy `affiliate_referrals_legacy` rows
   - count of newly-inserted `affiliate_referrals` rows
   - diff list: referrals dropped by E3 (duplicate user) or E7 (zero-member org)
   - count of derived `affiliate_commissions` rows
   - diff list: referrals with `subscription_amount_cents > 0` that did NOT get a
     commission row (sanity check — should be zero)
5. **Review:** operator reviews the audit output against the 2D spec §8 edge-case
   table. Every dropped row is explained by an E# ID.
6. **Decision gate:** if audit clean, proceed to step 7. If audit shows
   unexplained drops or unexpected counts, abort; file a spec-amendment card;
   do not apply …000008 against prod.
7. **Apply …000008** (destructive drop): `psql $PROD_URL -f supabase/migrations/20260417000008_affiliate_legacy_drop_tables.sql`.
   The preceding two-phase approach means both …000007 and …000008 have been
   validated against prod-shaped data before touching prod.
8. **Regenerate types** against prod: `npm run db:types`. Commit the regenerated
   `packages/shared/src/types/database.ts` to `main` (a trivial doc-style
   follow-up commit, not an on-branch concern).

**Total elapsed prod-cutover time:** ~1h including review. The snapshot is the
rollback mechanism if anything unexpected emerges in the 24h after step 7.

### Commit-split rationale

Commit A is non-destructive and can be paused, reviewed, or rebased without
breaking anything. Commit B is destructive (at least of the file / route
surface) and also atomic for safety — route deletion and consumer sweep must
go together.

---

## 8. Risks

This is the **highest-risk sub-project** of the branch — it mutates and then
deletes user-visible production data. Risks are split into **edge cases**
(E#, known data-shape variations that the migration must handle) and
**residual risks** (R#, known unknowns that could only be fully exercised
against prod data).

### Edge cases enumerated (MUST read before rehearsal)

| # | Edge case | Migration behavior | Residual risk to prod |
|---|---|---|---|
| **E1** | Legacy `affiliate_programs.code` collides with an existing `affiliates.code` (e.g., a user has both a legacy program and a 2B-era new-schema affiliate with the same code by coincidence) | `NOT EXISTS` guard skips the row; audit query surfaces the skip for manual review | **Medium** — if the code format `BT-XXXXXXXX` overlaps, operator must merge or reassign |
| **E2** | `commission_pct > 100` in malformed legacy row → `commission_rate > 1.0` after /100, violates `CHECK (commission_rate <= 1)` | Migration fails hard; rehearsal catches it | **Low** — the legacy CHECK was `numeric(5,2)` (≤999.99), but default=20 and the only insert path hard-codes 20; unlikely in prod |
| **E3** | Same auth user is primary for 2+ orgs, both referred by different affiliates → duplicate `user_id` violates `affiliate_referrals.user_id UNIQUE` | Dedupe by keeping the earliest `first_touch_at` row; other rows skipped via `WHERE NOT EXISTS`; skipped IDs logged in audit | **High** — the lost referrals are real attribution history; operator must decide whether to manually re-insert or accept loss |
| **E4** | Same `user_id` already has an `affiliates` row from Phase 2B/2C direct signup (not migrated) | `NOT EXISTS` guard skips; audit flags | **Medium** — user effectively has two affiliate identities in legacy vs new; operator reconciles |
| **E5** | `auth.users` row missing for legacy program's `user_id` (should be impossible due to `ON DELETE CASCADE`, but snapshot-race or stale-FK scenarios exist) | `LEFT JOIN` → email falls back to `<code>@legacy.invalid`; name to `'Legacy Affiliate'` | **Low** — the affiliate is orphaned anyway; audit surfaces for manual triage |
| **E6** | Legacy program represented a "paused" / "terminated" affiliate via an ad-hoc convention (e.g., `code` prefixed with `'DISABLED-'`) — no formal status column in legacy | All migrated affiliates set to `status='active'`; ad-hoc disable conventions are LOST | **Medium** — operator must scan for convention-based disables pre-cutover and `UPDATE affiliates SET status='paused'` post-cutover |
| **E7** | Org with 0 members at cutover time (administrative action emptied the org) | `org_memberships LIMIT 1` → NULL → `affiliate_referrals.user_id` NOT NULL violation | Migration handles by **skipping** the referral (inner query check `WHERE user_id IS NOT NULL` in INSERT predicate); audit logs the drop | **Medium** — legitimate attribution history lost; operator reviews |
| **E8** | Legacy referrals have no per-click data; new schema's `affiliate_clicks` gets zero synthetic rows → `affiliates.total_clicks = 0` for migrated affiliates | Accepted per §1 Non-goals | **Low** — cosmetic in admin UI; post-cutover clicks will populate normally |
| **E9** | Legacy commissions were monthly-vs-annual-ambiguous → we assume monthly for all | `payment_type='monthly'` hard-coded | **Low–Medium** — admin reports may show slightly different totals; no data loss |
| **E10** | Legacy `total_revenue_cents` / `total_paid_cents` counters not migrated; post-cutover `affiliates.total_earnings_brl` is rebuilt from derived commissions only (E9 caveat) | Post-migration `UPDATE affiliates SET total_earnings_brl = SUM(commissions.total_brl)` | **Low** — slight numeric drift (fees not tracked); acceptable for first-cut admin view |
| **E11** | Currency unit mismatch between legacy (cents) and package (assumed cents; see §4 reconciliation) | Verified against 2A mapper layer; unit is cents — no transform | **Low** — but flagged because if package semantics ever change (e.g., a 0.5.0 bump), the migration silently becomes wrong |
| **E12** | Legacy `affiliate_referrals_legacy.subscription_amount_cents = 0` with `status = 'approved'` (free-plan-signup edge case in legacy billing) | `WHERE subscription_amount_cents > 0` excludes; no commission row; referral still copied with `attribution_status='active'` | **Low** |
| **E13** | `NULL commission_cents` with `status='paid'` (paid without commission recorded — likely operator error in legacy data) | `commission_brl = ROUND(subscription_amount_cents * rate)`; we compute what was presumably paid | **Medium** — if legacy "paid" meant a manual transfer with no commission recorded, we create a commission row that implies double-payment; operator reviews audit |
| **E14** | `NULL first_touch_at` (shouldn't happen — legacy default `now()`) | `INSERT` would fail; verify via pre-migration assertion in audit script | **Low** |
| **E15** | Two legacy referrals with same `referred_org_id` under the same affiliate program (shouldn't happen — no unique constraint in legacy, but semantically odd) | Package schema requires unique `user_id`; dedupe per E3 applies | **Low–Medium** |
| **E16** | Legacy `code` has lowercase or non-hex chars (if operator manually inserted a non-standard code for a VIP affiliate) — violates `affiliates.code VARCHAR(12)` length only, not format | If length fits, migrates fine; if >12, INSERT fails hard | **Low** — rehearsal catches it; operator manually shortens |

### Residual risks (R#)

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| **R1** | **Prod data has edge cases not covered by local seed fixture.** The fixture in §5 covers E1/E2/E3/E5/E7 explicitly; E6/E8/E9/E10/E11/E12/E13/E14/E15/E16 are checked only via audit script assertions, not seeded test rows. The 2D code is correct for the enumerated cases; **unknown unknowns in prod data are the core residual risk**. | **CRITICAL** | Prod rehearsal (§7.2D.R) with prod snapshot restored into staging/local; audit script surfaces unexpected drops; abort gate if anything unexplained. **Prod execution is NOT in branch scope** — this spec does not claim prod-done. |
| **R2** | Destructive drop of `affiliate_programs` / `affiliate_referrals_legacy` is irreversible without snapshot restore. | **High** | Two-phase apply (§7.2D.R steps 3/7); mandatory snapshot (§7.2D.R step 1); audit gate between data-migrate and drop. |
| **R3** | `NPM RUN DB:TYPES` regeneration drift could cause merge conflicts if other migrations land on `main` during the rehearsal window. | Low–Medium | CC-2 rebase pre-flight in §7.2D.0; if the window extends, re-run db:types post-rehearsal and land as a follow-up commit. |
| **R4** | 2B-miss: a `/api/affiliate-legacy/*` call survived 2B and is only caught in 2D. The 2D route-deletion causes a 404 in a previously-working flow. | Medium | Exhaustive grep in §7.2D.2; typecheck-second-line via regenerated types; manual smoke of the affiliate settings page before branch merge. |
| **R5** | `SELECT user_id FROM org_memberships ORDER BY created_at ASC LIMIT 1` no longer matches a user intuition (owners transferred, early joiners left), attribution history is nominally correct but semantically surprising. | Low | Document the convention in the rehearsal runbook; post-cutover support may need to re-attribute specific referrals via admin UI. |
| **R6** | The assumption that "legacy program exists → affiliate is active" (E6) loses paused/terminated state if it was encoded ad-hoc. | Medium | Pre-rehearsal grep of legacy `code` / `payout_method` values for disable conventions; operator applies manual status updates post-cutover if found. |
| **R7** | Package's `payment_type='monthly'` default for all migrated commissions (E9) may cause admin reports to diverge from historical Stripe invoices. | Low | Accepted; documented; future correction possible via admin UI bulk-edit (not in scope). |
| **R8** | Integration test coverage is local-only and does not simulate concurrent admin activity during the migration. | Low | Prod cutover runs in a maintenance window with no admin traffic; documented in rehearsal runbook. |
| **R9** | Supabase migration transaction size: inserting thousands of rows in a single transaction + deriving thousands of commissions could exceed default `statement_timeout`. | Low | Legacy tables are small (single-digit thousands of programs/referrals at most, based on branch-timeline feature adoption); prod snapshot reveals actual row count pre-rehearsal; SQL batched via `INSERT … SELECT` which is single-statement efficient. |
| **R10** | `affiliate_referrals.user_id UNIQUE` collides with an existing direct-signup referral from 2B/2C era. | Medium | `NOT EXISTS` guard skips; E3 dedupe handles; audit surfaces for review. |
| **R11** | Rehearsal operator runs …000008 before …000007 (order-of-apply mistake). | Low | File timestamps enforce ordering in `supabase db push`; manual psql apply requires operator to run in order — checklisted in §7.2D.R. |
| **R12** | `db:types` regeneration after drop removes types still referenced in a buried code path we didn't grep. | Low | Typecheck sweep in §7.2D.2 catches this before commit. |
| **R13** | The `commission_brl = COALESCE(commission_cents, ROUND(subscription_amount_cents * rate))` COALESCE semantics quietly mask a data-quality issue: `commission_cents` differing from `subscription_amount_cents * rate` means the legacy system either charged or recorded a non-standard rate. | Medium | Audit query includes a "legacy commission_cents vs derived" diff report; operator reviews. |
| **R14** | Running the integration test against local Supabase uses a clean DB; running the same SQL against prod with RLS still enabled could hit permission issues IF `db:push` runs as anon. | Low | `supabase db push` uses the service-role connection; verified in all prior 2A migrations. |
| **R15** | Post-cutover, `affiliates.total_clicks = 0` across all migrated affiliates may surprise affiliates who were proud of their click count. | Low | UX-only; affiliates get fresh-start click counts. Communications plan (if any) is outside this spec's scope. |

### "What could break prod cutover" — summary list (for quick ref)

1. Unexpected `affiliate_programs.code` format (non-standard admin insert) — E16
2. Zero-membership orgs at snapshot time — E7
3. Duplicate primary users across orgs → UNIQUE collision — E3
4. Ad-hoc "disabled" convention encoded in `code` or `payout_method` — E6
5. Commission-amount sanity mismatch (cents vs reais drift) — E11
6. `commission_cents` in legacy that disagrees with `subscription_amount × rate` — R13
7. Running …000008 without …000007 audit approval — R11/R2
8. Missed `/api/affiliate-legacy/*` call from 2B — R4
9. Row volume exceeds `statement_timeout` — R9
10. Pre-existing `affiliates` row for same user or code — E1/E4
11. `NULL` auth.users row for migrated affiliate — E5
12. "Paid" legacy referrals with NULL commission_cents — E13

---

## 9. Done Criteria

**Split between "branch-done" (this sub-project's deliverable) and
"prod-done" (the post-branch rehearsal+cutover event). The spec
explicitly scopes the former; the latter is operator-driven and
separately tracked.**

### Branch-done (required for this sub-project to merge into the long-lived branch's HEAD)

1. `supabase/migrations/20260417000007_affiliate_legacy_data_migration.sql`
   exists and is idempotent (confirmed by assertion 8 in §5).
2. `supabase/migrations/20260417000008_affiliate_legacy_drop_tables.sql` exists
   and uses `DROP TABLE IF EXISTS … CASCADE`.
3. `apps/api/src/routes/affiliate-legacy.ts` deleted.
4. `apps/api/src/index.ts` no longer imports or registers `affiliateLegacyRoutes`.
5. `grep -rn "/api/affiliate-legacy" apps/` returns zero matches.
6. `grep -rn "affiliate-legacy" apps/` returns zero matches in code (JSDoc
   mentions in spec files are fine).
7. `grep -rn "affiliate_referrals_legacy\|affiliate_programs" apps/` returns zero
   matches in code (migration SQL files and spec docs fine).
8. `npm run db:reset && npm run test:integration -- affiliate-legacy-cutover`
   green (all 11 assertions in §5).
9. `npm run db:types` regenerated `packages/shared/src/types/database.ts` no
   longer includes `affiliate_programs` or `affiliate_referrals_legacy`.
10. `npm run typecheck` green across 4 workspaces.
11. `npm test` (unit) green.
12. `scripts/rehearsal-audit-legacy-cutover.sql` committed and documented in
    §7.2D.R.
13. 2 commits on branch with the messages in §7.2D.1 and §7.2D.2.
14. Residual risks §8 R1/R2/R4 explicitly acknowledged in the PR description
    at branch-merge time, with a link to this spec section.

### Prod-done (tracked separately; NOT a branch merge gate)

15. Prod snapshot taken; snapshot ID recorded in a rehearsal log.
16. …000007 applied against snapshot-restored staging/local DB; audit output
    reviewed; every dropped row traceable to a documented E# edge case.
17. …000008 applied against the same environment; snapshot-restore capability
    confirmed by smoke test.
18. Operator green-light to apply against prod, with maintenance window
    scheduled.
19. …000007 applied to prod; audit re-run against prod; unexplained drops =
    abort.
20. …000008 applied to prod.
21. Post-cutover: `npm run db:types` run against prod, regenerated types
    committed as a follow-up to `main`.
22. Monitoring check: 24h post-cutover, no `affiliate.*` errors in Axiom,
    no unhandled exceptions in Sentry from the affiliate module.

**The branch merges with criteria 1–14 satisfied. Criteria 15–22 are scheduled
as a separate operator-led event after the branch lands on `main`.**

---

## 10. Out of Scope (reiterated)

- Production execution of the cutover (deferred to separate post-branch event).
- Archiving dropped-table data to object storage (DBA snapshot suffices).
- Synthetic click replay.
- Backfilling tier assignments or historical `total_clicks` / `total_conversions`.
- Preserving legacy aggregated counters (`total_revenue_cents`, `total_paid_cents`).
- Content-submissions / PIX-keys / payouts migration — no legacy equivalents exist.
- Notification to affiliates about the migration — comms plan is product's call.
- Amending admin UI to display legacy-migrated rows with a badge — 2C-era decision;
  accepted-as-is.

---

## 11. Handoff notes

### For operators (rehearsal runbook)

- **Read §7.2D.R top-to-bottom** before touching prod.
- **Snapshot first** — non-negotiable. The drop is not reversible.
- **Audit the audit** — the audit script is a tool; the operator's judgment
  is the gate.
- **Abort if ambiguity** — if any audit row cannot be explained by an E#
  edge case from §8, STOP. File a spec-amendment card. Do not apply …000008.

### For this branch's merge-to-main gate

- This is the **last** sub-project. After 2D commits land, the branch is ready
  to PR against `main`. The PR description should link to all 5 sub-project
  specs and this spec's §8 residual-risk summary.
- The PR **does not block on prod-cutover completion**. Merge proceeds after
  criteria 1–14 pass; prod-cutover happens post-merge.

### For post-merge activation

- Sub-project 0 (email provider abstraction) and 2A set `EMAIL_PROVIDER` and
  Resend keys as deferred. Activation is decoupled from cutover.
- The `scripts/rehearsal-audit-legacy-cutover.sql` file remains in the repo
  post-cutover as a one-off; it can be deleted in a follow-up tidy commit
  once the cutover is complete and no longer a reference.

---

## 12. References

- Affiliate 2A spec: `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`
  (especially §11.2D handoff and Appendix C rollback SQL patterns)
- Email provider abstraction spec: `docs/superpowers/specs/2026-04-17-email-provider-abstraction-design.md`
  (format template)
- Legacy rename migration: `supabase/migrations/20260417000000_rename_legacy_affiliate_referrals.sql`
- Legacy route handler (to be deleted): `apps/api/src/routes/affiliate-legacy.ts`
- Legacy schema origin: `supabase/migrations/20260414040000_publishing_destinations.sql`
  lines 38–73
- Package core schema: `supabase/migrations/20260417000001_affiliate_001_schema.sql`
- Package payouts/commissions schema: `supabase/migrations/20260417000002_affiliate_002_payouts.sql`
- Org→user convention: `apps/api/src/routes/affiliate-legacy.ts:20-38`
  (originally `apps/api/src/routes/affiliate.ts:13-19` before 2A rename;
  preserved after deletion of the old `affiliate.ts`)
- Branch: `feat/affiliate-2a-foundation` (long-lived; 5 sub-projects)
- CLAUDE.md (repo-root) — Category-C test convention, db:push/db:types workflow

---

## Appendix A — Dev rollback SQL (not a prod tool)

**Prod rollback = "restore Supabase snapshot."** This SQL reverses local-dev
apply of …000007 and …000008 only. It **does not** restore data that the drop
eliminated.

```sql
BEGIN;

-- Reverse 20260417000008: re-create legacy tables (empty)
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
CREATE INDEX IF NOT EXISTS affiliate_programs_user_idx       ON public.affiliate_programs (user_id);
CREATE INDEX IF NOT EXISTS affiliate_referrals_program_idx   ON public.affiliate_referrals_legacy (affiliate_program_id);
ALTER TABLE public.affiliate_programs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_referrals_legacy ENABLE ROW LEVEL SECURITY;

-- Reverse 20260417000007: remove migrated rows.
--   Heuristic: "migrated" affiliate rows have affiliate_type='internal' +
--   tier='nano' + total_clicks=0 + total_conversions=0. DEV ONLY — in prod
--   this filter would nuke legitimate new-schema signups that happen to have
--   those defaults. Use a dev-specific `db:reset` instead.
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

**To rollback the full 2A+2D stack**, append this block to the Appendix C
rollback SQL from the 2A spec (execute 2D-reverse first, then 2A-reverse).

---

## Appendix B — Full data-migration SQL (20260417000007)

```sql
-- affiliate@2D — legacy data migration
-- Idempotent: safe to run multiple times. NOT-EXISTS guards on every INSERT.
-- Assumes package migrations 20260417000001..000006 have applied.

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
--    Skip rows where the resolution is NULL (E7) or the user already has a
--    referral (E3/E10).
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
    COALESCE(
      arl.commission_cents,
      ROUND(arl.subscription_amount_cents * a.commission_rate)::INTEGER
    ),
    NULL,
    COALESCE(
      arl.commission_cents,
      ROUND(arl.subscription_amount_cents * a.commission_rate)::INTEGER
    ),
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

### Destructive drop (20260417000008)

```sql
-- affiliate@2D — drop legacy tables. Destructive. Apply only after
-- rehearsal audit (scripts/rehearsal-audit-legacy-cutover.sql) clean.

BEGIN;
DROP TABLE IF EXISTS public.affiliate_referrals_legacy CASCADE;
DROP TABLE IF EXISTS public.affiliate_programs        CASCADE;
COMMIT;
```

### Rehearsal audit (`scripts/rehearsal-audit-legacy-cutover.sql`)

```sql
-- Run between …000007 and …000008 during rehearsal.
-- Each query's output should be explainable by an E# edge case from the 2D spec §8.

-- 1. Counts
SELECT 'affiliate_programs'            AS src, COUNT(*) FROM public.affiliate_programs
UNION ALL SELECT 'affiliates (migrated)', COUNT(*) FROM public.affiliates WHERE affiliate_type = 'internal' AND tier = 'nano' AND status = 'active' AND total_clicks = 0
UNION ALL SELECT 'affiliate_referrals_legacy', COUNT(*) FROM public.affiliate_referrals_legacy
UNION ALL SELECT 'affiliate_referrals (all)', COUNT(*) FROM public.affiliate_referrals
UNION ALL SELECT 'affiliate_commissions (all)', COUNT(*) FROM public.affiliate_commissions;

-- 2. Skipped affiliate_programs (E1 / E4)
SELECT ap.id, ap.user_id, ap.code, 'skipped' AS reason
FROM public.affiliate_programs ap
WHERE NOT EXISTS (SELECT 1 FROM public.affiliates a WHERE a.user_id = ap.user_id AND a.code = ap.code);

-- 3. Dropped referrals (E3 / E7)
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

-- 4. Commission-amount sanity check (R13)
SELECT arl.id,
       arl.commission_cents                                            AS legacy,
       ROUND(arl.subscription_amount_cents * (ap.commission_pct/100.0))::INT AS derived,
       arl.commission_cents - ROUND(arl.subscription_amount_cents * (ap.commission_pct/100.0))::INT AS diff
FROM public.affiliate_referrals_legacy arl
JOIN public.affiliate_programs ap ON ap.id = arl.affiliate_program_id
WHERE arl.commission_cents IS NOT NULL
  AND arl.subscription_amount_cents IS NOT NULL
  AND arl.commission_cents <> ROUND(arl.subscription_amount_cents * (ap.commission_pct/100.0))::INT;

-- 5. Code / name / email sanity
SELECT id, code, name, email FROM public.affiliates
WHERE email LIKE '%@legacy.invalid' OR name = 'Legacy Affiliate';

-- 6. Counter rebuild sanity
SELECT a.id, a.code, a.total_earnings_brl,
       COALESCE((SELECT SUM(total_brl) FROM public.affiliate_commissions WHERE affiliate_id = a.id), 0) AS sum_from_commissions
FROM public.affiliates a
WHERE a.affiliate_type = 'internal'
  AND a.total_earnings_brl <> COALESCE((SELECT SUM(total_brl) FROM public.affiliate_commissions WHERE affiliate_id = a.id), 0);
```

The audit's every non-empty output row must map to an E# from §8 before …000008
is applied.
