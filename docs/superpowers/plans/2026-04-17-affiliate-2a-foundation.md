# Affiliate Platform — Phase 2A Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **v2 rewrite:** all column names, signatures, mappers, and migration content verified against `@tn-figueiredo/affiliate@0.4.0` package source (extracted via `npm pack`). v1 had 18 critical inaccuracies — see spec `## v2 rewrite changes`.

**Goal:** Adopt `@tn-figueiredo/affiliate@0.4.0` in `apps/api`: 10 new tables, 4 route helpers (end-user / admin / internal / redirect), 11 sub-repos + mappers composing `SupabaseAffiliateRepository`, Resend email service (with HTML escape + guard), stub tax-id, optional fraud (deferred), Inngest cron for expiring referrals (mirrors existing `referenceCheck` pattern). Legacy custom impl renamed to `*-legacy` for parallel coexistence until 2D cutover.

**Architecture:** Composition root container (module-level cached singleton) wires 35 use cases with Supabase-backed repository (mappers handle camelCase ↔ snake_case), Resend-backed email, stubbed tax-id, undefined fraud. 4 package route helpers register under prefixes `/affiliate`, `/admin/affiliate`, `/internal/affiliate`, `/ref`. apps/web (Phase 1) is unaffected; apps/app legacy settings page calls `/api/affiliate-legacy/*` until 2B rewrites it.

**Tech Stack:** Fastify 5, Supabase JS v2 (service_role), Inngest (existing), Resend (existing; SMTP later via provider abstraction in 2F+), vitest 4, TypeScript strict. Package: `@tn-figueiredo/affiliate@0.4.0`.

---

## Pre-flight Context

**Spec:** `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md` (v2 rewrite)

**Pre-requisites (operator-verified BEFORE Phase 2A.1):**

| Pre-req | Required for | If missing |
|---|---|---|
| Phase 1 (`feat/admin-upgrade-062`) merged to `staging` | Branch base | Branch from `feat/admin-upgrade-062` head instead |
| `SUPABASE_ACCESS_TOKEN` in root `.env.local` | `db:push:dev` + `db:types` | Tooling fails — must be set before 2A.1 Task 1.5 |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `apps/api/.env.local` | Container init at runtime | Container throws on first request — must be set |
| npm authenticated for GitHub Packages (`@tn-figueiredo/*`) | `npm install @tn-figueiredo/affiliate@0.4.0` | `npm install` fails — must auth before 2A.1 Task 1.1 |

**Deferrable env vars (NOT required to deploy 2A):**

| Var | Activates | If absent in 2A |
|---|---|---|
| `RESEND_API_KEY`, `RESEND_FROM` (optional), `AFFILIATE_ADMIN_EMAIL` (optional, default `admin@brighttale.io`) | Email side-effects (admin notifications, applicant confirmations, approval emails, proposal emails) | Email service no-ops via `isResendConfigured()` guard; affiliate flows continue without email side-effects |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Cron `affiliate-expire-referrals` registers in Inngest cloud (prod) | Inngest dev server still works locally without keys; in prod, cron simply doesn't register; manual fallback: call `POST /api/internal/affiliate/expire-pending` via curl |

These vars activate features post-merge — they are NOT blockers to commit, deploy, or merge any phase. Set them in Vercel apps/api prod when ready to activate (see operator-action checklist in 2A.5).

**Future SMTP support (Phase 2F+):** spec §11 handoff documents how to introduce `apps/api/src/lib/email/provider.ts` to dispatch Resend|SMTP via `EMAIL_PROVIDER` env var. 2A keeps email-service tied to Resend directly (zero churn now, 1-PR swap later).

**Branch:** create `feat/affiliate-2a-foundation` from `staging` (or `feat/admin-upgrade-062` if Phase 1 not merged yet).

---

## Phase 2A.0 — Branch + verification gates (NEW vs v1)

### Task 0.1: Branch + rollback tag

**Files:** none (git only)

- [ ] **Step 1: Verify clean working tree on staging**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git status
git rev-parse --abbrev-ref HEAD
```
Expected: clean tree, on `staging` (or Phase 1 branch).

- [ ] **Step 2: Create branch + tag**

```bash
git checkout -b feat/affiliate-2a-foundation
git tag pre-affiliate-2a
rm -rf apps/api/dist apps/api/node_modules/.cache 2>/dev/null
```

### Task 0.2: Verify package source (NEW vs v1)

**Files:** none (verification only)

- [ ] **Step 1: Pull package tarball + display key types**

```bash
mkdir -p /tmp/affiliate-pkg-inspect && cd /tmp/affiliate-pkg-inspect
rm -f tn-figueiredo-affiliate-*.tgz
npm pack @tn-figueiredo/affiliate@0.4.0 --registry=https://npm.pkg.github.com
tar -xzf tn-figueiredo-affiliate-0.4.0.tgz
```
Expected: `package/` dir created with `dist/`, `migrations/` subdirs.

- [ ] **Step 2: Verify column names referenced by counter migration**

```bash
grep -E "total_clicks|total_referrals|total_conversions|total_earnings_brl" /tmp/affiliate-pkg-inspect/package/migrations/001_schema.sql
```
Expected: 4 lines matching column declarations on `affiliates` table. **If 0 matches**, package schema has changed — STOP and update Task 1.4 migration's counter functions to use the actual column names.

- [ ] **Step 3: Confirm 10 tables (not 11)**

```bash
grep -c "^CREATE TABLE" /tmp/affiliate-pkg-inspect/package/migrations/001_schema.sql /tmp/affiliate-pkg-inspect/package/migrations/002_payouts.sql /tmp/affiliate-pkg-inspect/package/migrations/003_pix_content.sql /tmp/affiliate-pkg-inspect/package/migrations/004_contract.sql
```
Expected total: 3 + 2 + 2 + 3 = **10** (not 11). `005_fk_supabase.sql` adds 0 tables.

- [ ] **Step 4: Confirm `IAffiliateRepository` method shapes that drive mappers**

```bash
grep -A2 "createReferral\|createClick\|expirePendingReferrals\|getStats\|addContractHistory\|updatePayoutStatus" /tmp/affiliate-pkg-inspect/package/dist/fraud-admin-DiX4kqdI.d.ts | head -40
```
Expected: confirms `createReferral`/`createClick`/etc. take camelCase inputs; `expirePendingReferrals(today: string): Promise<number>`; `getStats(...) → { pendingPayoutBrl, paidPayoutBrl }`; `addContractHistory({ affiliateId, action, oldTier?, ... })`. **If signatures differ**, update Appendix D mappers + sub-repo plans accordingly.

- [ ] **Step 5: Confirm 5 use case constructor signatures driving the container**

```bash
grep -B1 -A2 "ApproveAffiliateUseCase\|AttributeSignupToAffiliateUseCase\|ProposeContractChangeUseCase\|CreateAffiliatePayoutUseCase\|CalculateAffiliateCommissionUseCase" /tmp/affiliate-pkg-inspect/package/dist/fraud-admin-DiX4kqdI.d.ts | grep "constructor"
```
Expected: signatures match spec §6 table — `Approve(repo, email, config, taxId?)`, `Attribute(repo, config, fraud?)`, `Propose(repo, email, config)`, `CreatePayout(repo, taxId, config)`, `Calculate(repo, config)`. **If different**, update Task 4.7 container assembly.

### Task 0.3: Verify `user_roles` table exists (NEW vs v1)

**Files:** none (verification only)

- [ ] **Step 1: Confirm migration present**

```bash
ls /Users/figueiredo/Workspace/BrightCurios/bright-tale/supabase/migrations/ | grep user_roles
```
Expected: `20260411030000_user_roles.sql` listed.

- [ ] **Step 2: Confirm schema (column names auth-context.ts depends on)**

```bash
grep -E "create table|user_id|role" /Users/figueiredo/Workspace/BrightCurios/bright-tale/supabase/migrations/20260411030000_user_roles.sql | head -10
```
Expected: `create table public.user_roles`, `user_id uuid not null`, `role text not null check (role in ('admin', 'user'))`.

If file missing or schema differs, `isAdmin()` in `auth-context.ts` won't work — STOP and reconcile.

---

## Phase 2A.1 — Foundation: install, migrations, skeleton + mappers, legacy rename

### Task 1.1: Install `@tn-figueiredo/affiliate@0.4.0`

**Files:** Modify: `apps/api/package.json`, `package-lock.json`

- [ ] **Step 1: Install package (exact pin)**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api
npm install @tn-figueiredo/affiliate@0.4.0 --save-exact
```

- [ ] **Step 2: Verify version**

```bash
grep '"@tn-figueiredo/affiliate"' /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api/package.json
```
Expected: `"@tn-figueiredo/affiliate": "0.4.0"` (no `^` or `~`).

### Task 1.2: Copy package migrations into supabase/migrations

**Files:** Create: 5 SQL files in `supabase/migrations/`

- [ ] **Step 1: Copy 5 package migrations with new timestamps**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
SRC=apps/api/node_modules/@tn-figueiredo/affiliate/migrations
DST=supabase/migrations
cp $SRC/001_schema.sql       $DST/20260417000001_affiliate_001_schema.sql
cp $SRC/002_payouts.sql      $DST/20260417000002_affiliate_002_payouts.sql
cp $SRC/003_pix_content.sql  $DST/20260417000003_affiliate_003_pix_content.sql
cp $SRC/004_contract.sql     $DST/20260417000004_affiliate_004_contract.sql
cp $SRC/005_fk_supabase.sql  $DST/20260417000005_affiliate_005_supabase.sql
ls supabase/migrations/ | grep affiliate_0
```
Expected: 5 files listed.

### Task 1.3: Create rename-legacy migration

**Files:** Create: `supabase/migrations/20260417000000_rename_legacy_affiliate_referrals.sql`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/20260417000000_rename_legacy_affiliate_referrals.sql`:

```sql
ALTER TABLE public.affiliate_referrals RENAME TO affiliate_referrals_legacy;
COMMENT ON TABLE public.affiliate_referrals_legacy IS
  'Legacy schema renamed in Phase 2A.1; replaced by package affiliate_referrals. To drop in 2D.';
```

### Task 1.4: Create triggers + atomic counter functions (CORRECTED vs v1)

**Files:** Create: `supabase/migrations/20260417000006_affiliate_triggers_counters.sql`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/20260417000006_affiliate_triggers_counters.sql`:

```sql
-- updated_at triggers (CLAUDE.md convention; package adds columns but no triggers)
-- Tables with updated_at columns: affiliates, affiliate_pix_keys,
-- affiliate_content_submissions, affiliate_risk_scores
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliate_pix_keys
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliate_content_submissions
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliate_risk_scores
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Atomic counter functions (race-safe; columns verified against 001_schema.sql)
-- Column names: total_clicks, total_referrals, total_conversions, total_earnings_brl
-- (NOT clicks/referrals/conversions — that was a v1 spec error)
CREATE OR REPLACE FUNCTION public.increment_affiliate_clicks(aff_id uuid)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  UPDATE public.affiliates SET total_clicks = total_clicks + 1 WHERE id = aff_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_affiliate_referrals(aff_id uuid)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  UPDATE public.affiliates SET total_referrals = total_referrals + 1 WHERE id = aff_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_affiliate_conversions(aff_id uuid, earnings_brl integer)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  UPDATE public.affiliates
  SET total_conversions = total_conversions + 1,
      total_earnings_brl = total_earnings_brl + earnings_brl
  WHERE id = aff_id;
$$;

REVOKE ALL ON FUNCTION public.increment_affiliate_clicks(uuid)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_affiliate_referrals(uuid)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_affiliate_conversions(uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_affiliate_clicks(uuid)        TO service_role;
GRANT  EXECUTE ON FUNCTION public.increment_affiliate_referrals(uuid)     TO service_role;
GRANT  EXECUTE ON FUNCTION public.increment_affiliate_conversions(uuid, integer) TO service_role;
```

**Note vs v1:** removed phantom `affiliate_social_links` references (no such table); added trigger for `affiliate_risk_scores`; corrected counter column names to `total_*`; added `SET search_path` for SECURITY DEFINER hardening; explicit GRANT to service_role.

### Task 1.5: Apply migrations to Supabase dev

**Files:** none (DB operation)

- [ ] **Step 1: Push migrations**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run db:push:dev 2>&1 | tail -30
```
Expected: 7 migrations applied (1 rename + 5 package + 1 triggers/counters).

If any migration fails: STOP. Run `npm run db:reset` to wipe local + reapply, OR investigate the failing migration. Do NOT proceed to Task 1.6 until all 7 apply.

- [ ] **Step 2: Verify counter functions exist**

```bash
psql $(supabase status --json 2>/dev/null | jq -r '.DB_URL // "postgresql://postgres:postgres@localhost:54322/postgres"') -c "\df public.increment_affiliate_*" 2>/dev/null | head -10
```
Expected: 3 functions listed.

### Task 1.6: Regenerate Supabase types

**Files:** Modify: `packages/shared/src/types/database.ts`

- [ ] **Step 1: Regenerate**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run db:types 2>&1 | tail -5
```

- [ ] **Step 2: Verify new tables present**

```bash
grep -E "affiliates:|affiliate_clicks:|affiliate_pix_keys:|affiliate_risk_scores:" packages/shared/src/types/database.ts | head -10
```
Expected: 4+ matches.

- [ ] **Step 3: Verify counter functions present (Functions section)**

```bash
grep -E "increment_affiliate_(clicks|referrals|conversions)" packages/shared/src/types/database.ts
```
Expected: 3 matches under generated `Functions: {}` block.

### Task 1.7: Rename legacy route file

**Files:**
- Rename: `apps/api/src/routes/affiliate.ts` → `apps/api/src/routes/affiliate-legacy.ts`
- Modify: legacy route — adjust queries to use `affiliate_referrals_legacy`
- Modify: `apps/api/src/index.ts` — register prefix `/affiliate-legacy`

- [ ] **Step 1: Rename file**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git mv apps/api/src/routes/affiliate.ts apps/api/src/routes/affiliate-legacy.ts
```

- [ ] **Step 2: Rename exported function + table reference**

Edit `apps/api/src/routes/affiliate-legacy.ts`:

- Find `export async function affiliateRoutes(fastify: FastifyInstance)` → replace with `export async function affiliateLegacyRoutes(fastify: FastifyInstance)`
- Confirm count of `affiliate_referrals` references:

```bash
grep -n "affiliate_referrals" /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api/src/routes/affiliate-legacy.ts
```
Expected: 1 line (around L121).

- Replace `.from('affiliate_referrals')` with `.from('affiliate_referrals_legacy' as never)`. The `as never` cast is needed because regenerated `database.ts` (after Task 1.6) will not include `affiliate_referrals_legacy` in its types — it's a runtime-only legacy table awaiting drop in 2D.

- [ ] **Step 3: Update import + register in `apps/api/src/index.ts`**

Find:
```ts
import { affiliateRoutes } from "./routes/affiliate.js";
```
Replace with:
```ts
import { affiliateLegacyRoutes } from "./routes/affiliate-legacy.js";
```

Find (around line 184):
```ts
server.register(affiliateRoutes, { prefix: "/affiliate" });
```
Replace with:
```ts
server.register(affiliateLegacyRoutes, { prefix: "/affiliate-legacy" });
```

### Task 1.8: Update apps/app settings page to use legacy URLs

**Files:** Modify: `apps/app/src/app/(app)/settings/affiliate/page.tsx`

- [ ] **Step 1: Update 3 fetch URLs**

```bash
grep -n "/api/affiliate/" /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/app/src/app/\(app\)/settings/affiliate/page.tsx
```
Expected ~3 matches (program GET, program POST, referrals GET).

Replace each `'/api/affiliate/'` with `'/api/affiliate-legacy/'` via Edit tool.

### Task 1.9: Scaffold repository skeleton (method-syntax, all 52 methods throw)

**Files:** Create: 12 files in `apps/api/src/lib/affiliate/repository/`

- [ ] **Step 1: Create skeleton sub-repos**

For EACH of the 11 sub-repos, create a file with this pattern (substitute `<SubRepo>` and method names):

```ts
// apps/api/src/lib/affiliate/repository/affiliate-query-repo.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createQueryRepo(_sb: SupabaseClient<Database>) {
  return {
    async findById(_id: string): Promise<never> { throw new Error('not_impl_2a1') },
    async findByCode(_code: string): Promise<never> { throw new Error('not_impl_2a1') },
    async findByUserId(_userId: string): Promise<never> { throw new Error('not_impl_2a1') },
    async findByEmail(_email: string): Promise<never> { throw new Error('not_impl_2a1') },
    async isCodeTaken(_code: string): Promise<never> { throw new Error('not_impl_2a1') },
    async create(_input: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async createInternal(_input: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async linkUserId(_affiliateId: string, _userId: string): Promise<never> { throw new Error('not_impl_2a1') },
    async listAll(_options?: unknown): Promise<never> { throw new Error('not_impl_2a1') },
  }
}
```

Method lists per sub-repo:

- `affiliate-query-repo.ts` — `findById, findByCode, findByUserId, findByEmail, isCodeTaken, create, createInternal, linkUserId, listAll` (9)
- `affiliate-lifecycle-repo.ts` — `approve, pause, terminate, updateProfile, updateContract, activateAfterContractAcceptance` (6) — `addContractHistory` lives in history-repo
- `affiliate-proposals-repo.ts` — `proposeContractChange, cancelProposal, acceptProposal, rejectProposal` (4)
- `affiliate-history-repo.ts` — `addContractHistory, getContractHistory` (2)
- `clicks-repo.ts` — `incrementClicks, createClick, markClickConverted, getClicksByPlatform` (4)
- `referrals-repo.ts` — `incrementReferrals, createReferral, findReferralByUserId, listReferralsByAffiliate, expirePendingReferrals` (5)
- `commissions-repo.ts` — `incrementConversions, createCommission, listPendingCommissions, markCommissionsPaid` (4)
- `payouts-repo.ts` — `createPayout, findPayoutById, updatePayoutStatus, listPayouts` (4)
- `pix-repo.ts` — `addPixKey, listPixKeys, setDefaultPixKey, deletePixKey` (4)
- `content-repo.ts` — `submitContent, reviewContent, listContentSubmissions` (3)
- `fraud-repo.ts` — `listFraudFlags, listRiskScores, findFraudFlagById, updateFraudFlagStatus` (4)
- `stats-repo.ts` — `getStats, getPendingContractsCount` (2)

Total: 9+6+4+2+4+5+4+4+4+3+4+2 = **51** delegation targets in sub-repos. The repository class adds `addContractHistory` from `history-repo` and exposes 52 methods total to satisfy `IAffiliateRepository`.

- [ ] **Step 2: Create `repository/index.ts` with method-syntax delegations**

Create `apps/api/src/lib/affiliate/repository/index.ts` using **the EXACT skeleton from Spec Appendix A.2**. Critical points:

- Use `private query: ReturnType<typeof createQueryRepo>` field declarations (no inline init)
- Initialize ALL sub-repos in constructor body (`this.query = createQueryRepo(sb)` etc.)
- Use **method syntax** for delegations — NEVER arrow-field syntax
- Type each method param using `Parameters<IAffiliateRepository['<method>']>[N]` — TypeScript infers correctly without `as any`

**Why method-syntax matters:** arrow-field properties (`findById = (...args) => this.query.findById(...args)`) run as class-field initializers, **before** the constructor body. At that moment, `this.query` is `undefined` and the call crashes. Method syntax (`findById(id: string) { return this.query.findById(id) }`) defines a prototype method — `this.query` is read at *call time*, after the constructor has run. Spec §4 has an explicit warning.

- [ ] **Step 3: Smoke compile**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run typecheck 2>&1 | tail -5
```
Expected: 0 errors. Class declares `implements IAffiliateRepository` from the start; `Promise<never>` is assignable to any `Promise<X>` so TS is happy.

### Task 1.10: Create mappers file (NEW vs v1)

**Files:** Create: `apps/api/src/lib/affiliate/repository/mappers.ts`

- [ ] **Step 1: Write the full mappers file**

This file is the single place where camelCase ↔ snake_case translation happens for affiliate writes. **All sub-repo `insert`/`update` calls go through these mappers** — no `as any` in sub-repos.

Create `apps/api/src/lib/affiliate/repository/mappers.ts`:

```ts
import type {
  Affiliate, AffiliateClick, AffiliateReferral, AffiliateCommission,
  AffiliatePayout, AffiliatePixKey, AffiliateContentSubmission,
  AffiliateContractHistoryEntry, IAffiliateRepository,
} from '@tn-figueiredo/affiliate'

// ── Click ───────────────────────────────────────────────────────────────
export type DbAffiliateClick = {
  id: string
  affiliate_id: string
  affiliate_code: string
  ip_hash: string | null
  user_agent: string | null
  landing_url: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  source_platform: string | null
  device_type: string | null
  converted_at: string | null
  converted_user_id: string | null
  created_at: string
}

export function mapClickFromDb(r: DbAffiliateClick): AffiliateClick {
  return {
    id: r.id, affiliateId: r.affiliate_id, affiliateCode: r.affiliate_code,
    ipHash: r.ip_hash, userAgent: r.user_agent, landingUrl: r.landing_url,
    utmSource: r.utm_source, utmMedium: r.utm_medium, utmCampaign: r.utm_campaign,
    sourcePlatform: r.source_platform, deviceType: r.device_type,
    convertedAt: r.converted_at, convertedUserId: r.converted_user_id,
    createdAt: r.created_at,
  }
}

export function mapClickToDbInsert(input: Parameters<IAffiliateRepository['createClick']>[0]) {
  return {
    affiliate_id: input.affiliateId,
    affiliate_code: input.affiliateCode,
    ip_hash: input.ipHash ?? null,
    user_agent: input.userAgent ?? null,
    landing_url: input.landingUrl ?? null,
    utm_source: input.utmSource ?? null,
    utm_medium: input.utmMedium ?? null,
    utm_campaign: input.utmCampaign ?? null,
    source_platform: input.sourcePlatform ?? null,
    device_type: input.deviceType ?? null,
  }
}

// ── Referral ────────────────────────────────────────────────────────────
export type DbAffiliateReferral = {
  id: string
  affiliate_id: string
  affiliate_code: string
  user_id: string
  click_id: string | null
  attribution_status: 'active' | 'pending_contract' | 'expired' | 'paused'
  signup_date: string
  window_end: string
  converted_at: string | null
  platform: 'android' | 'ios' | 'web' | null
  signup_ip_hash: string | null
  created_at: string
}

export function mapReferralFromDb(r: DbAffiliateReferral): AffiliateReferral {
  return {
    id: r.id,
    affiliateId: r.affiliate_id,
    affiliateCode: r.affiliate_code,
    userId: r.user_id,
    clickId: r.click_id,
    attributionStatus: r.attribution_status,
    signupDate: r.signup_date,
    windowEnd: r.window_end,
    convertedAt: r.converted_at,
    platform: r.platform,
    signupIpHash: r.signup_ip_hash,
    createdAt: r.created_at,
  }
}

export function mapReferralToDbInsert(input: Parameters<IAffiliateRepository['createReferral']>[0]) {
  return {
    affiliate_id: input.affiliateId,
    affiliate_code: input.affiliateCode,
    user_id: input.userId,
    click_id: input.clickId ?? null,
    attribution_status: input.attributionStatus,
    signup_date: input.signupDate,
    window_end: input.windowEnd,
    platform: input.platform ?? null,
    signup_ip_hash: input.signupIpHash ?? null,
  }
}

// ── Commission ──────────────────────────────────────────────────────────
export type DbAffiliateCommission = {
  id: string
  affiliate_id: string
  affiliate_code: string
  user_id: string | null
  referral_id: string
  payout_id: string | null
  payment_amount: number
  stripe_fee: number
  net_amount: number
  commission_rate: number
  commission_brl: number
  fixed_fee_brl: number | null
  total_brl: number
  payment_type: 'monthly' | 'annual'
  status: 'pending' | 'paid' | 'cancelled'
  created_at: string
}

export function mapCommissionFromDb(r: DbAffiliateCommission): AffiliateCommission {
  return {
    id: r.id,
    affiliateId: r.affiliate_id,
    affiliateCode: r.affiliate_code,
    userId: r.user_id,
    referralId: r.referral_id,
    payoutId: r.payout_id,
    paymentAmount: r.payment_amount,
    stripeFee: r.stripe_fee,
    netAmount: r.net_amount,
    commissionRate: r.commission_rate,
    commissionBrl: r.commission_brl,
    fixedFeeBrl: r.fixed_fee_brl,
    totalBrl: r.total_brl,
    paymentType: r.payment_type,
    status: r.status,
    createdAt: r.created_at,
  }
}

export function mapCommissionToDbInsert(input: Parameters<IAffiliateRepository['createCommission']>[0]) {
  return {
    affiliate_id: input.affiliateId,
    affiliate_code: input.affiliateCode,
    user_id: input.userId ?? null,
    referral_id: input.referralId,
    payout_id: input.payoutId ?? null,
    payment_amount: input.paymentAmount,
    stripe_fee: input.stripeFee,
    net_amount: input.netAmount,
    commission_rate: input.commissionRate,
    commission_brl: input.commissionBrl,
    fixed_fee_brl: input.fixedFeeBrl ?? null,
    total_brl: input.totalBrl,
    payment_type: input.paymentType,
    status: input.status,
  }
}

// ── Payout ──────────────────────────────────────────────────────────────
export type DbAffiliatePayout = {
  id: string
  affiliate_id: string
  affiliate_code: string
  total_brl: number
  commission_ids: string[]
  pix_key_id: string | null
  pix_key_value: string | null
  pix_key_type: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random' | null
  status: 'pending' | 'approved' | 'rejected' | 'processing' | 'completed' | 'failed'
  requested_at: string
  reviewed_at: string | null
  completed_at: string | null
  admin_notes: string | null
  payment_reference: string | null
  tax_id: string | null
  tax_id_type: 'cpf' | 'cnpj' | null
}

export function mapPayoutFromDb(r: DbAffiliatePayout): AffiliatePayout {
  return {
    id: r.id,
    affiliateId: r.affiliate_id,
    affiliateCode: r.affiliate_code,
    totalBrl: r.total_brl,
    commissionIds: r.commission_ids,
    pixKeyId: r.pix_key_id,
    pixKeyValue: r.pix_key_value,
    pixKeyType: r.pix_key_type,
    status: r.status,
    requestedAt: r.requested_at,
    reviewedAt: r.reviewed_at,
    completedAt: r.completed_at,
    adminNotes: r.admin_notes,
    paymentReference: r.payment_reference,
    taxId: r.tax_id,
    taxIdType: r.tax_id_type,
  }
}

export function mapPayoutToDbInsert(input: Parameters<IAffiliateRepository['createPayout']>[0]) {
  return {
    affiliate_id: input.affiliateId,
    affiliate_code: input.affiliateCode,
    total_brl: input.totalBrl,
    commission_ids: input.commissionIds,
    pix_key_id: input.pixKeyId ?? null,
    pix_key_value: input.pixKeyValue ?? null,
    pix_key_type: input.pixKeyType ?? null,
    status: input.status,
    reviewed_at: input.reviewedAt ?? null,
    completed_at: input.completedAt ?? null,
    admin_notes: input.adminNotes ?? null,
    payment_reference: input.paymentReference ?? null,
    tax_id: input.taxId ?? null,
    tax_id_type: input.taxIdType ?? null,
  }
}

// ── PIX key ─────────────────────────────────────────────────────────────
export type DbAffiliatePixKey = {
  id: string
  affiliate_id: string
  key_type: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'
  key_value: string
  key_display: string
  is_default: boolean
  label: string | null
  created_at: string
  updated_at: string
}

export function mapPixKeyFromDb(r: DbAffiliatePixKey): AffiliatePixKey {
  return {
    id: r.id,
    affiliateId: r.affiliate_id,
    keyType: r.key_type,
    keyValue: r.key_value,
    keyDisplay: r.key_display,
    isDefault: r.is_default,
    label: r.label,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function mapPixKeyToDbInsert(input: Parameters<IAffiliateRepository['addPixKey']>[0]) {
  return {
    affiliate_id: input.affiliateId,
    key_type: input.keyType,
    key_value: input.keyValue,
    key_display: input.keyDisplay,
    is_default: input.isDefault,
    label: input.label ?? null,
  }
}

// ── Content submission ──────────────────────────────────────────────────
export type DbAffiliateContentSubmission = {
  id: string
  affiliate_id: string
  platform: 'youtube' | 'instagram' | 'tiktok' | 'twitter' | 'linkedin' | 'blog' | 'other'
  content_type: 'video' | 'reel' | 'story' | 'post' | 'article' | 'other'
  url: string
  title: string | null
  description: string | null
  status: 'pending' | 'approved' | 'rejected'
  review_notes: string | null
  posted_at: string | null
  created_at: string
  updated_at: string
}

export function mapContentSubmissionFromDb(r: DbAffiliateContentSubmission): AffiliateContentSubmission {
  return {
    id: r.id,
    affiliateId: r.affiliate_id,
    platform: r.platform,
    contentType: r.content_type,
    url: r.url,
    title: r.title,
    description: r.description,
    status: r.status,
    reviewNotes: r.review_notes,
    postedAt: r.posted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function mapContentSubmissionToDbInsert(input: Parameters<IAffiliateRepository['submitContent']>[0]) {
  return {
    affiliate_id: input.affiliateId,
    platform: input.platform,
    content_type: input.contentType,
    url: input.url,
    title: input.title ?? null,
    description: input.description ?? null,
    posted_at: input.postedAt ?? null,
  }
}

// ── Contract history entry ──────────────────────────────────────────────
export type DbAffiliateContractHistoryEntry = {
  id: string
  affiliate_id: string
  action: string
  old_tier: string | null
  new_tier: string | null
  old_commission_rate: number | null
  new_commission_rate: number | null
  old_fixed_fee_brl: number | null
  new_fixed_fee_brl: number | null
  old_status: string | null
  new_status: string | null
  performed_by: string | null
  notes: string | null
  contract_version: number | null
  accepted_ip: string | null
  accepted_ua: string | null
  created_at: string
}

export function mapContractHistoryFromDb(r: DbAffiliateContractHistoryEntry): AffiliateContractHistoryEntry {
  return {
    id: r.id,
    affiliateId: r.affiliate_id,
    action: r.action as AffiliateContractHistoryEntry['action'],
    oldTier: r.old_tier,
    newTier: r.new_tier,
    oldCommissionRate: r.old_commission_rate,
    newCommissionRate: r.new_commission_rate,
    oldFixedFeeBrl: r.old_fixed_fee_brl,
    newFixedFeeBrl: r.new_fixed_fee_brl,
    oldStatus: r.old_status,
    newStatus: r.new_status,
    performedBy: r.performed_by,
    notes: r.notes,
    contractVersion: r.contract_version,
    acceptedIp: r.accepted_ip,
    acceptedUa: r.accepted_ua,
    createdAt: r.created_at,
  }
}

export function mapContractHistoryToDbInsert(input: Parameters<IAffiliateRepository['addContractHistory']>[0]) {
  return {
    affiliate_id: input.affiliateId,
    action: input.action,
    old_tier: input.oldTier ?? null,
    new_tier: input.newTier ?? null,
    old_commission_rate: input.oldCommissionRate ?? null,
    new_commission_rate: input.newCommissionRate ?? null,
    old_fixed_fee_brl: input.oldFixedFeeBrl ?? null,
    new_fixed_fee_brl: input.newFixedFeeBrl ?? null,
    old_status: input.oldStatus ?? null,
    new_status: input.newStatus ?? null,
    performed_by: input.performedBy ?? null,
    notes: input.notes ?? null,
    contract_version: input.contractVersion ?? null,
    accepted_ip: input.acceptedIp ?? null,
    accepted_ua: input.acceptedUa ?? null,
  }
}

// ── Affiliate (centralized — single source of truth for affiliate row mapping) ─
import type { Database } from '@brighttale/shared/types/database'
import type { Affiliate } from '@tn-figueiredo/affiliate'
export type DbAffiliate = Database['public']['Tables']['affiliates']['Row']

export function mapAffiliateFromDb(r: DbAffiliate): Affiliate {
  return {
    id: r.id, userId: r.user_id, code: r.code, name: r.name, email: r.email,
    status: r.status as Affiliate['status'],
    tier: r.tier as Affiliate['tier'],
    commissionRate: Number(r.commission_rate),
    fixedFeeBrl: r.fixed_fee_brl,
    contractStartDate: r.contract_start_date,
    contractEndDate: r.contract_end_date,
    contractVersion: r.contract_version,
    contractAcceptanceVersion: r.contract_acceptance_version,
    contractAcceptedAt: r.contract_accepted_at,
    contractAcceptedIp: r.contract_accepted_ip,
    contractAcceptedUa: r.contract_accepted_ua,
    proposedTier: r.proposed_tier as Affiliate['proposedTier'],
    proposedCommissionRate: r.proposed_commission_rate !== null ? Number(r.proposed_commission_rate) : null,
    proposedFixedFeeBrl: r.proposed_fixed_fee_brl,
    proposalNotes: r.proposal_notes,
    proposalCreatedAt: r.proposal_created_at,
    channelName: r.channel_name,
    channelUrl: r.channel_url,
    channelPlatform: r.channel_platform,
    socialLinks: (r.social_links as Affiliate['socialLinks']) ?? [],
    subscribersCount: r.subscribers_count,
    adjustedFollowers: r.adjusted_followers,
    affiliateType: r.affiliate_type as Affiliate['affiliateType'],
    knownIpHashes: r.known_ip_hashes ?? [],
    notes: r.notes,
    taxId: r.tax_id,
    totalClicks: r.total_clicks,
    totalReferrals: r.total_referrals,
    totalConversions: r.total_conversions,
    totalEarningsBrl: r.total_earnings_brl,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
```

**Why centralize `mapAffiliateFromDb`:** it's used by query-repo (find/create/list — 8 methods), lifecycle-repo (all 6 methods return `Affiliate`), and proposals-repo (all 4 methods return `Affiliate`). Single source of truth means: if the package adds a column in a minor version bump, you change one file, not three.

### Task 1.11: Verify typecheck + commit Phase 2A.1

**Files:** none (git only)

- [ ] **Step 1: Typecheck**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run typecheck 2>&1 | tail -5
```
Expected: 0 errors.

- [ ] **Step 2: Build api**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api
npm run build 2>&1 | tail -3
```
Expected: build succeeds.

- [ ] **Step 3: Manual smoke — legacy still works**

In two terminals:
```bash
# Terminal 1
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale && npm run dev:api
# Terminal 2
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale && npm run dev:app
```
Open `http://localhost:3000/settings/affiliate` (logged in as user with org). Page should load (calls `/api/affiliate-legacy/program`). Stop dev (Ctrl+C in both terminals).

- [ ] **Step 4: Commit**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add apps/api/package.json apps/api/src/routes/affiliate-legacy.ts apps/api/src/index.ts apps/api/src/lib/affiliate/repository/ apps/app/src/app/\(app\)/settings/affiliate/page.tsx supabase/migrations/2026041700000* package-lock.json packages/shared/src/types/database.ts
git rm apps/api/src/routes/affiliate.ts 2>/dev/null || true
git commit -m "feat(api): scaffold affiliate@0.4.0 + 7 migrations + repo skeleton + mappers + legacy rename"
```

---

## Phase 2A.2 — Lifecycle + Email + Tax stub + Container partial

### Task 2.1: Create config

**Files:** Create: `apps/api/src/lib/affiliate/config.ts`

- [ ] **Step 1: Write config**

```ts
import type { AffiliateConfig } from '@tn-figueiredo/affiliate'

export const AFFILIATE_CONFIG: AffiliateConfig = {
  minimumPayoutCents: 5000,                      // R$ 50,00
  tierRates: { nano: 0.15, micro: 0.20, mid: 0.25, macro: 0.30, mega: 0.35 },
  currentContractVersion: 1,
  webBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://brighttale.io',
  appStoreUrl: 'https://brighttale.io',
}
```

### Task 2.2: Create stub tax-id service

**Files:**
- Create: `apps/api/src/lib/affiliate/tax-id-service.ts`
- Create: `apps/api/src/__tests__/lib/affiliate/tax-id-service.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/api/src/__tests__/lib/affiliate/tax-id-service.test.ts
import { describe, it, expect } from 'vitest'
import { StubTaxIdRepository } from '@/lib/affiliate/tax-id-service'

describe('StubTaxIdRepository', () => {
  const repo = new StubTaxIdRepository()
  it('findByEntity returns null', async () => {
    expect(await repo.findByEntity('user', 'abc')).toBeNull()
  })
  it('save is no-op', async () => {
    await expect(repo.save({
      entityType: 'user', entityId: 'abc', taxId: '123', taxIdType: 'cpf',
      status: 'regular', legalName: null, lastCheckedAt: null,
    })).resolves.toBeUndefined()
  })
  it('getStatus returns regular', async () => {
    expect(await repo.getStatus('123.456.789-00')).toEqual({ status: 'regular' })
  })
})
```

- [ ] **Step 2: Run test — fails**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api
npm run test -- src/__tests__/lib/affiliate/tax-id-service.test.ts 2>&1 | tail -10
```
Expected: FAIL.

- [ ] **Step 3: Implement using Spec Appendix A.4**

Create `apps/api/src/lib/affiliate/tax-id-service.ts` from Spec Appendix A.4 verbatim.

- [ ] **Step 4: Run test — passes**

```bash
npm run test -- src/__tests__/lib/affiliate/tax-id-service.test.ts 2>&1 | tail -5
```
Expected: PASS 3/3.

### Task 2.3: Create email service (XSS-safe + Resend-guarded)

**Files:**
- Create: `apps/api/src/lib/affiliate/email-service.ts`
- Create: `apps/api/src/__tests__/lib/affiliate/email-service.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/api/src/__tests__/lib/affiliate/email-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/email/resend', () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: 'r1', provider: 'resend' }),
  isResendConfigured: vi.fn().mockReturnValue(true),
}))

import * as resend from '@/lib/email/resend'
import { ResendAffiliateEmailService } from '@/lib/affiliate/email-service'

describe('ResendAffiliateEmailService', () => {
  const svc = new ResendAffiliateEmailService()

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AFFILIATE_ADMIN_EMAIL = 'admin@brighttale.test'
  })

  it('sendAffiliateApplicationReceivedAdmin sends to AFFILIATE_ADMIN_EMAIL', async () => {
    await svc.sendAffiliateApplicationReceivedAdmin({
      name: 'Maria', email: 'maria@example.com',
      channelPlatform: 'youtube', channelUrl: 'https://youtube.com/maria',
    })
    expect(resend.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'admin@brighttale.test',
      subject: expect.stringContaining('Maria'),
    }))
  })

  it('escapes HTML in user-controlled fields (XSS guard)', async () => {
    await svc.sendAffiliateApplicationReceivedAdmin({
      name: '<script>alert(1)</script>', email: 'x@y.com',
      channelPlatform: 'youtube', channelUrl: 'https://y.com',
    })
    const arg = (resend.sendEmail as any).mock.calls[0][0]
    expect(arg.html).not.toContain('<script>')
    expect(arg.html).toContain('&lt;script&gt;')
  })

  it('rewrites javascript: URLs to # in href', async () => {
    await svc.sendAffiliateApplicationReceivedAdmin({
      name: 'X', email: 'x@y.com',
      channelPlatform: 'web', channelUrl: 'javascript:alert(1)',
    })
    const arg = (resend.sendEmail as any).mock.calls[0][0]
    expect(arg.html).toContain('href="#"')
  })

  it('sendAffiliateApprovalEmail includes tier + commission percent', async () => {
    await svc.sendAffiliateApprovalEmail('joao@x.com', 'João', 'nano', 0.15, 'https://app.com')
    expect(resend.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'joao@x.com',
      html: expect.stringContaining('15%'),
    }))
  })

  it('returns early when Resend not configured', async () => {
    vi.mocked(resend.isResendConfigured).mockReturnValueOnce(false)
    await svc.sendAffiliateApplicationConfirmation('x@x.com', 'X')
    expect(resend.sendEmail).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test — fails**

```bash
npm run test -- src/__tests__/lib/affiliate/email-service.test.ts 2>&1 | tail -10
```
Expected: FAIL (file doesn't exist).

- [ ] **Step 3: Implement using Spec Appendix A.3 verbatim**

Create `apps/api/src/lib/affiliate/email-service.ts` from Spec Appendix A.3.

- [ ] **Step 4: Run test — passes**

```bash
npm run test -- src/__tests__/lib/affiliate/email-service.test.ts 2>&1 | tail -5
```
Expected: PASS 5/5.

### Task 2.4: Create auth-context (with `user_roles` integration test)

**Files:**
- Create: `apps/api/src/lib/affiliate/auth-context.ts`
- Create: `apps/api/src/__tests__/lib/affiliate/auth-context.test.ts`

- [ ] **Step 1: Write file**

Create `apps/api/src/lib/affiliate/auth-context.ts` from Spec Appendix A.5 verbatim.

- [ ] **Step 2: Write smoke test for `getAuthenticatedUser` (no DB needed)**

```ts
// apps/api/src/__tests__/lib/affiliate/auth-context.test.ts
import { describe, it, expect } from 'vitest'
import { getAuthenticatedUser } from '@/lib/affiliate/auth-context'
import { ApiError } from '@/lib/api/errors'

describe('getAuthenticatedUser', () => {
  it('returns id when request.userId set', async () => {
    const req = { userId: 'user-1' }
    expect(await getAuthenticatedUser(req)).toEqual({ id: 'user-1' })
  })
  it('throws 401 when userId missing', async () => {
    await expect(getAuthenticatedUser({})).rejects.toBeInstanceOf(ApiError)
  })
})
```

- [ ] **Step 3: Run test**

```bash
npm run test -- src/__tests__/lib/affiliate/auth-context.test.ts 2>&1 | tail -5
```
Expected: PASS 2/2. (`isAdmin` covered via integration smoke at 2A.4.)

### Task 2.5: Implement affiliate-query-repo (using mappers where applicable)

**Files:**
- Modify: `apps/api/src/lib/affiliate/repository/affiliate-query-repo.ts`
- Create: `apps/api/src/lib/affiliate/repository/__tests__/affiliate-query-repo.test.ts`

- [ ] **Step 1: Write failing tests for `findById` and `findByCode`**

```ts
// apps/api/src/lib/affiliate/repository/__tests__/affiliate-query-repo.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createQueryRepo } from '../affiliate-query-repo'

describe('affiliate-query-repo', () => {
  it('findById returns mapped affiliate when found', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'aff-1', code: 'X', user_id: 'u1', name: 'A', email: 'a@x.com', status: 'active', tier: 'nano', commission_rate: 0.15 },
      error: null,
    })
    const sb = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })) } as any
    const repo = createQueryRepo(sb)
    const r = await repo.findById('aff-1')
    expect(sb.from).toHaveBeenCalledWith('affiliates')
    expect(r?.id).toBe('aff-1')
    expect(r?.commissionRate).toBe(0.15)  // verify camelCase mapping
  })

  it('findByCode returns null when not found', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const sb = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })) } as any
    const repo = createQueryRepo(sb)
    expect(await repo.findByCode('NONE')).toBeNull()
  })
})
```

- [ ] **Step 2: Run — fails**

```bash
npm run test -- src/lib/affiliate/repository/__tests__/affiliate-query-repo.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Implement using centralized mapper**

Replace `apps/api/src/lib/affiliate/repository/affiliate-query-repo.ts`. **Imports `mapAffiliateFromDb` from `./mappers` (defined in Task 1.10) — do NOT redefine.**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapAffiliateFromDb } from './mappers'

export function createQueryRepo(sb: SupabaseClient<Database>) {
  return {
    async findById(id: string): Promise<Affiliate | null> {
      const { data } = await sb.from('affiliates').select('*').eq('id', id).maybeSingle()
      return data ? mapAffiliateFromDb(data) : null
    },
    async findByCode(code: string) {
      const { data } = await sb.from('affiliates').select('*').eq('code', code).maybeSingle()
      return data ? mapAffiliateFromDb(data) : null
    },
    async findByUserId(userId: string) {
      const { data } = await sb.from('affiliates').select('*').eq('user_id', userId).maybeSingle()
      return data ? mapAffiliateFromDb(data) : null
    },
    async findByEmail(email: string) {
      const { data } = await sb.from('affiliates').select('*').eq('email', email).maybeSingle()
      return data ? mapAffiliateFromDb(data) : null
    },
    async isCodeTaken(code: string): Promise<boolean> {
      const { data } = await sb.from('affiliates').select('id').eq('code', code).maybeSingle()
      return data !== null
    },
    async create(input: Parameters<IAffiliateRepository['create']>[0]) {
      const row = {
        code: input.code, name: input.name, email: input.email,
        channel_name: input.channelName ?? null, channel_url: input.channelUrl ?? null,
        channel_platform: input.channelPlatform ?? null,
        social_links: input.socialLinks ?? [],
        subscribers_count: input.subscribersCount ?? null,
        tax_id: input.taxId ?? null, notes: input.notes ?? null,
      }
      const { data, error } = await sb.from('affiliates').insert(row).select().single()
      if (error) throw error
      return mapAffiliateFromDb(data)
    },
    async createInternal(input: Parameters<IAffiliateRepository['createInternal']>[0]) {
      const row = {
        code: input.code, name: input.name, email: input.email,
        affiliate_type: 'internal' as const, status: 'active' as const,
      }
      const { data, error } = await sb.from('affiliates').insert(row).select().single()
      if (error) throw error
      return mapAffiliateFromDb(data)
    },
    async linkUserId(affiliateId: string, userId: string) {
      const { data, error } = await sb.from('affiliates').update({ user_id: userId }).eq('id', affiliateId).select().single()
      if (error) throw error
      return mapAffiliateFromDb(data)
    },
    async listAll(options?: Parameters<IAffiliateRepository['listAll']>[0]) {
      let q = sb.from('affiliates').select('*')
      if (options?.status) q = q.eq('status', options.status)
      if (options?.limit) q = q.limit(options.limit)
      if (options?.offset) q = q.range(options.offset, options.offset + (options.limit ?? 20) - 1)
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapAffiliateFromDb).map(({ id, code, name, email, status, tier, totalClicks, totalReferrals, totalConversions, totalEarningsBrl, createdAt }) => ({
        id, code, name, email, status, tier,
        totalClicks, totalReferrals, totalConversions, totalEarningsBrl,
        createdAt,
      }))  // listAll returns AffiliateAdminSummary, not full Affiliate
    },
  }
}
```

(`listAll` returns `AffiliateAdminSummary[]` per `IAffiliateRepository` — verify the exact shape against `dist/fraud-admin-DiX4kqdI.d.ts` L163 and adjust the projection.)

- [ ] **Step 4: Run tests — passes**

```bash
npm run test -- src/lib/affiliate/repository/__tests__/affiliate-query-repo.test.ts 2>&1 | tail -5
```
Expected: PASS 2/2.

### Task 2.6: Implement affiliate-lifecycle-repo

**Files:**
- Modify: `apps/api/src/lib/affiliate/repository/affiliate-lifecycle-repo.ts`
- Create: tests

- [ ] **Step 1: Write failing tests**

```ts
// apps/api/src/lib/affiliate/repository/__tests__/affiliate-lifecycle-repo.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createLifecycleRepo } from '../affiliate-lifecycle-repo'

describe('affiliate-lifecycle-repo', () => {
  it('approve sets status=approved and applies tier+rate+contract dates', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'a1', status: 'approved', tier: 'nano', commission_rate: 0.15 },
      error: null,
    })
    const update = vi.fn().mockReturnValue({ eq: () => ({ select: () => ({ single }) }) })
    const sb = { from: vi.fn(() => ({ update })) } as any
    const repo = createLifecycleRepo(sb)
    await repo.approve('a1', {
      affiliateId: 'a1', tier: 'nano', commissionRate: 0.15,
      contractStartDate: '2026-04-17', contractEndDate: '2027-04-17', contractVersion: 1,
    })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'approved', tier: 'nano', commission_rate: 0.15,
      contract_start_date: '2026-04-17', contract_end_date: '2027-04-17',
    }))
  })

  it('pause sets status=paused', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'a1', status: 'paused' }, error: null })
    const update = vi.fn().mockReturnValue({ eq: () => ({ select: () => ({ single }) }) })
    const sb = { from: vi.fn(() => ({ update })) } as any
    const repo = createLifecycleRepo(sb)
    await repo.pause('a1')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'paused' }))
  })
})
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Implement using centralized mapper**

```ts
// apps/api/src/lib/affiliate/repository/affiliate-lifecycle-repo.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { Affiliate, IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapAffiliateFromDb, type DbAffiliate } from './mappers'

export function createLifecycleRepo(sb: SupabaseClient<Database>) {
  async function update(id: string, fields: Partial<DbAffiliate>): Promise<Affiliate> {
    const { data, error } = await sb.from('affiliates').update(fields).eq('id', id).select().single()
    if (error) throw error
    return mapAffiliateFromDb(data)
  }

  return {
    async approve(id: string, input: Parameters<IAffiliateRepository['approve']>[1]) {
      const fields: Partial<DbAffiliate> = {
        status: 'approved',
        tier: input.tier,
        commission_rate: input.commissionRate,
        fixed_fee_brl: input.fixedFeeBrl ?? null,
        contract_start_date: input.contractStartDate,
        contract_end_date: input.contractEndDate,
        contract_version: input.contractVersion,
      }
      return update(id, fields)
    },
    async pause(id: string, _options?: { skipAudit?: boolean }) {
      return update(id, { status: 'paused' })
    },
    async terminate(id: string) {
      return update(id, { status: 'terminated' })
    },
    async updateProfile(affiliateId: string, input: Parameters<IAffiliateRepository['updateProfile']>[1]) {
      const fields: Partial<DbAffiliate> = {}
      if (input.channelName !== undefined) fields.channel_name = input.channelName
      if (input.channelUrl !== undefined) fields.channel_url = input.channelUrl
      if (input.channelPlatform !== undefined) fields.channel_platform = input.channelPlatform
      if (input.socialLinks !== undefined) fields.social_links = input.socialLinks as never
      if (input.subscribersCount !== undefined) fields.subscribers_count = input.subscribersCount
      if (input.notes !== undefined) fields.notes = input.notes
      return update(affiliateId, fields)
    },
    async updateContract(affiliateId: string, contractStartDate: string, contractEndDate: string) {
      return update(affiliateId, { contract_start_date: contractStartDate, contract_end_date: contractEndDate })
    },
    async activateAfterContractAcceptance(id: string) {
      return update(id, {
        status: 'active',
        contract_accepted_at: new Date().toISOString(),
      })
    },
  }
}
```

**Note:** `mapAffiliateFromDb` is centralized in `mappers.ts` (Task 1.10). All three sub-repos that return `Affiliate` (query, lifecycle, proposals) import from there — single source of truth.

- [ ] **Step 4: Run — passes**

```bash
npm run test -- src/lib/affiliate/repository/__tests__/affiliate-lifecycle-repo.test.ts 2>&1 | tail -5
```

### Task 2.7: Implement affiliate-history-repo (with `addContractHistory` mapping)

**Files:** Modify: `apps/api/src/lib/affiliate/repository/affiliate-history-repo.ts`

- [ ] **Step 1: Implement using mappers**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapContractHistoryFromDb, mapContractHistoryToDbInsert } from './mappers'

export function createHistoryRepo(sb: SupabaseClient<Database>) {
  return {
    async addContractHistory(entry: Parameters<IAffiliateRepository['addContractHistory']>[0]): Promise<void> {
      const row = mapContractHistoryToDbInsert(entry)
      const { error } = await sb.from('affiliate_contract_history').insert(row)
      if (error) throw error
    },
    async getContractHistory(affiliateId: string) {
      const { data, error } = await sb
        .from('affiliate_contract_history')
        .select('*')
        .eq('affiliate_id', affiliateId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapContractHistoryFromDb)
    },
  }
}
```

(Skip dedicated test for this 2-method file; covered by integration smoke in 2A.5.)

### Task 2.8: Build container partial (8 use cases)

**Files:** Create: `apps/api/src/lib/affiliate/container.ts`

- [ ] **Step 1: Create container with 8 use cases (verified signatures)**

```ts
import {
  ApplyAsAffiliateUseCase,
  GetMyAffiliateUseCase,
  GetAffiliateStatsUseCase,
  GetMyCommissionsUseCase,
  GetAffiliateReferralsUseCase,
  UpdateAffiliateProfileUseCase,
  ApproveAffiliateUseCase,
  PauseAffiliateUseCase,
  type AffiliateConfig,
} from '@tn-figueiredo/affiliate'
import { createServiceClient } from '@/lib/supabase'
import { SupabaseAffiliateRepository } from './repository'
import { ResendAffiliateEmailService } from './email-service'
import { StubTaxIdRepository } from './tax-id-service'
import { AFFILIATE_CONFIG } from './config'
import { getAuthenticatedUser, isAdmin } from './auth-context'

export type AffiliateContainer = ReturnType<typeof buildAffiliateContainer>
let cached: AffiliateContainer | null = null

export function buildAffiliateContainer() {
  if (cached) return cached

  const sb = createServiceClient()
  const repo = new SupabaseAffiliateRepository(sb)
  const email = new ResendAffiliateEmailService()
  const taxId = new StubTaxIdRepository()
  const config: AffiliateConfig = AFFILIATE_CONFIG

  cached = {
    config, repo, email, taxId,
    getAuthenticatedUser, isAdmin,
    // 2A.2 wires 8 use cases (verified signatures vs IAffiliateRepository); rest in 2A.3 + 2A.4
    applyUseCase: new ApplyAsAffiliateUseCase(repo, email, taxId),
    getMyAffiliateUseCase: new GetMyAffiliateUseCase(repo),
    getStatsUseCase: new GetAffiliateStatsUseCase(repo),
    getMyCommissionsUseCase: new GetMyCommissionsUseCase(repo),
    getReferralsUseCase: new GetAffiliateReferralsUseCase(repo),
    updateProfileUseCase: new UpdateAffiliateProfileUseCase(repo),
    approveUseCase: new ApproveAffiliateUseCase(repo, email, config, taxId),
    pauseUseCase: new PauseAffiliateUseCase(repo),
  }
  return cached
}

export function __resetAffiliateContainer(): void { cached = null }
```

- [ ] **Step 2: Verify compiles**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run typecheck 2>&1 | tail -5
```
Expected: 0 errors.

### Task 2.9: Smoke 2A.2 + commit

**Files:** none

- [ ] **Step 1: Run all new tests**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api
npm run test -- src/__tests__/lib/affiliate/ src/lib/affiliate/repository/__tests__/ 2>&1 | tail -10
```
Expected: tax-id (3) + email (5) + auth (2) + query (2) + lifecycle (2) = **14 passing**.

- [ ] **Step 2: Commit Phase 2A.2**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add apps/api/src/lib/affiliate/ apps/api/src/__tests__/lib/affiliate/
git commit -m "feat(api): wire affiliate query/lifecycle/history repos + email + tax stub + container partial"
```

---

## Phase 2A.3 — Tracking + Cron + Internal/Redirect routes

### Task 3.1: Implement clicks-repo (with mapper)

**Files:** Modify: `apps/api/src/lib/affiliate/repository/clicks-repo.ts` + add test

- [ ] **Step 1: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapClickFromDb, mapClickToDbInsert } from './mappers'

export function createClicksRepo(sb: SupabaseClient<Database>) {
  return {
    async incrementClicks(affiliateId: string): Promise<void> {
      // Atomic via Postgres function (race-safe; see migration 20260417000006)
      const { error } = await sb.rpc('increment_affiliate_clicks', { aff_id: affiliateId })
      if (error) throw error
    },

    async createClick(input: Parameters<IAffiliateRepository['createClick']>[0]) {
      const row = mapClickToDbInsert(input)
      const { data, error } = await sb.from('affiliate_clicks').insert(row).select().single()
      if (error) throw error
      return mapClickFromDb(data)
    },

    async markClickConverted(clickId: string, userId: string): Promise<void> {
      const { error } = await sb.from('affiliate_clicks').update({
        converted_user_id: userId,
        converted_at: new Date().toISOString(),
      }).eq('id', clickId)
      if (error) throw error
    },

    async getClicksByPlatform(affiliateId: string, days?: number) {
      const since = days
        ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        : '1970-01-01T00:00:00Z'
      const { data, error } = await sb
        .from('affiliate_clicks')
        .select('source_platform, converted_at')
        .eq('affiliate_id', affiliateId)
        .gte('created_at', since)
      if (error) throw error
      const grouped = new Map<string, { clicks: number; conversions: number }>()
      for (const c of data ?? []) {
        const key = c.source_platform ?? 'unknown'
        const cur = grouped.get(key) ?? { clicks: 0, conversions: 0 }
        cur.clicks += 1
        if (c.converted_at) cur.conversions += 1
        grouped.set(key, cur)
      }
      return Array.from(grouped.entries()).map(([sourcePlatform, v]) => ({ sourcePlatform, ...v }))
    },
  }
}
```

- [ ] **Step 2: Quick test for `incrementClicks` calling RPC**

```ts
// apps/api/src/lib/affiliate/repository/__tests__/clicks-repo.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createClicksRepo } from '../clicks-repo'

describe('clicks-repo', () => {
  it('incrementClicks calls RPC with correct name+args', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const sb = { rpc } as any
    await createClicksRepo(sb).incrementClicks('aff-1')
    expect(rpc).toHaveBeenCalledWith('increment_affiliate_clicks', { aff_id: 'aff-1' })
  })
})
```

### Task 3.2: Implement referrals-repo (with mapper, correct expire logic)

**Files:** Modify: `apps/api/src/lib/affiliate/repository/referrals-repo.ts` + test

- [ ] **Step 1: Implement (CORRECTED expire logic)**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapReferralFromDb, mapReferralToDbInsert } from './mappers'

export function createReferralsRepo(sb: SupabaseClient<Database>) {
  return {
    async incrementReferrals(affiliateId: string): Promise<void> {
      const { error } = await sb.rpc('increment_affiliate_referrals', { aff_id: affiliateId })
      if (error) throw error
    },

    async createReferral(input: Parameters<IAffiliateRepository['createReferral']>[0]) {
      const row = mapReferralToDbInsert(input)
      const { data, error } = await sb.from('affiliate_referrals').insert(row).select().single()
      if (error) throw error
      return mapReferralFromDb(data)
    },

    async findReferralByUserId(userId: string) {
      const { data } = await sb.from('affiliate_referrals').select('*').eq('user_id', userId).maybeSingle()
      return data ? mapReferralFromDb(data) : null
    },

    async listReferralsByAffiliate(affiliateId: string, options?: Parameters<IAffiliateRepository['listReferralsByAffiliate']>[1]) {
      let q = sb.from('affiliate_referrals').select('*').eq('affiliate_id', affiliateId)
      if (options?.limit) q = q.limit(options.limit)
      if (options?.offset) q = q.range(options.offset, options.offset + (options.limit ?? 20) - 1)
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapReferralFromDb)
    },

    async expirePendingReferrals(today: string): Promise<number> {
      // Verified vs package: signature is (today: string) → Promise<number>
      // Logic: expire referrals whose attribution window has ended and are still pending_contract.
      // window_end is set by package on createReferral (default NOW() + 12 months per 001_schema.sql).
      const { data, error } = await sb
        .from('affiliate_referrals')
        .update({ attribution_status: 'expired' })
        .eq('attribution_status', 'pending_contract')
        .lt('window_end', today)
        .select('id')
      if (error) throw error
      return data?.length ?? 0
    },
  }
}
```

- [ ] **Step 2: Quick test for `expirePendingReferrals`**

```ts
// apps/api/src/lib/affiliate/repository/__tests__/referrals-repo.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createReferralsRepo } from '../referrals-repo'

describe('referrals-repo', () => {
  it('expirePendingReferrals filters by attribution_status + window_end', async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: 'r1' }, { id: 'r2' }], error: null })
    const lt = vi.fn().mockReturnValue({ select })
    const eq = vi.fn().mockReturnValue({ lt })
    const update = vi.fn().mockReturnValue({ eq })
    const sb = { from: vi.fn(() => ({ update })) } as any
    const n = await createReferralsRepo(sb).expirePendingReferrals('2026-04-17T00:00:00Z')
    expect(eq).toHaveBeenCalledWith('attribution_status', 'pending_contract')
    expect(lt).toHaveBeenCalledWith('window_end', '2026-04-17T00:00:00Z')
    expect(n).toBe(2)
  })
})
```

### Task 3.3: Implement commissions-repo (with mapper)

**Files:** Modify: `apps/api/src/lib/affiliate/repository/commissions-repo.ts` + test

- [ ] **Step 1: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapCommissionFromDb, mapCommissionToDbInsert } from './mappers'

export function createCommissionsRepo(sb: SupabaseClient<Database>) {
  return {
    async incrementConversions(affiliateId: string, earningsBrl: number): Promise<void> {
      const { error } = await sb.rpc('increment_affiliate_conversions', {
        aff_id: affiliateId, earnings_brl: earningsBrl,
      })
      if (error) throw error
    },

    async createCommission(input: Parameters<IAffiliateRepository['createCommission']>[0]) {
      const row = mapCommissionToDbInsert(input)
      const { data, error } = await sb.from('affiliate_commissions').insert(row).select().single()
      if (error) throw error
      return mapCommissionFromDb(data)
    },

    async listPendingCommissions(affiliateId: string) {
      const { data, error } = await sb
        .from('affiliate_commissions')
        .select('*')
        .eq('affiliate_id', affiliateId)
        .eq('status', 'pending')
      if (error) throw error
      return (data ?? []).map(mapCommissionFromDb)
    },

    async markCommissionsPaid(commissionIds: string[], payoutId: string): Promise<void> {
      const { error } = await sb
        .from('affiliate_commissions')
        .update({ status: 'paid', payout_id: payoutId })
        .in('id', commissionIds)
      if (error) throw error
    },
  }
}
```

- [ ] **Step 2: Quick test**

```ts
// apps/api/src/lib/affiliate/repository/__tests__/commissions-repo.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createCommissionsRepo } from '../commissions-repo'

describe('commissions-repo', () => {
  it('listPendingCommissions filters by status=pending', async () => {
    const eq2 = vi.fn().mockResolvedValue({ data: [], error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const sb = { from: vi.fn(() => ({ select: () => ({ eq: eq1 }) })) } as any
    await createCommissionsRepo(sb).listPendingCommissions('aff-1')
    expect(eq1).toHaveBeenCalledWith('affiliate_id', 'aff-1')
    expect(eq2).toHaveBeenCalledWith('status', 'pending')
  })
})
```

### Task 3.4: Update container with tracking use cases (verified signatures)

**Files:** Modify: `apps/api/src/lib/affiliate/container.ts`

- [ ] **Step 1: Add 5 new use case instances**

Replace the entire `buildAffiliateContainer()` body in `container.ts` (or carefully extend):

```ts
import {
  // ...existing imports
  TrackAffiliateLinkClickUseCase,
  AttributeSignupToAffiliateUseCase,
  CalculateAffiliateCommissionUseCase,
  ExpirePendingReferralsUseCase,
  GetAffiliateClicksByPlatformUseCase,
} from '@tn-figueiredo/affiliate'
```

Add inside `buildAffiliateContainer()` after `const config = AFFILIATE_CONFIG`:

```ts
  const trackClickUseCase = new TrackAffiliateLinkClickUseCase(repo, config)
  const expirePendingUseCase = new ExpirePendingReferralsUseCase(repo)

  cached = {
    config, repo, email, taxId,
    getAuthenticatedUser, isAdmin,

    // From 2A.2:
    applyUseCase: new ApplyAsAffiliateUseCase(repo, email, taxId),
    getMyAffiliateUseCase: new GetMyAffiliateUseCase(repo),
    getStatsUseCase: new GetAffiliateStatsUseCase(repo),
    getMyCommissionsUseCase: new GetMyCommissionsUseCase(repo),
    getReferralsUseCase: new GetAffiliateReferralsUseCase(repo),
    updateProfileUseCase: new UpdateAffiliateProfileUseCase(repo),
    approveUseCase: new ApproveAffiliateUseCase(repo, email, config, taxId),
    pauseUseCase: new PauseAffiliateUseCase(repo),

    // 2A.3 additions (5 use cases — verified signatures):
    trackClickUseCase,
    attributeUseCase: new AttributeSignupToAffiliateUseCase(repo, config, undefined /* fraud — 2E */),
    calcCommissionUseCase: new CalculateAffiliateCommissionUseCase(repo, config),
    expirePendingUseCase,
    clicksByPlatformUseCase: new GetAffiliateClicksByPlatformUseCase(repo),
  }
```

### Task 3.5: Register `/ref` redirect route

**Files:** Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add imports**

```ts
import {
  registerAffiliateRedirectRoute,
  registerAffiliateInternalRoutes,
} from '@tn-figueiredo/affiliate/routes'
import { buildAffiliateContainer } from './lib/affiliate/container.js'
```

- [ ] **Step 2: Register `/ref` after the legacy register block**

```ts
const affiliateContainer = buildAffiliateContainer()

server.register(async (scope) => {
  registerAffiliateRedirectRoute(scope as never, {
    webBaseUrl: affiliateContainer.config.webBaseUrl,
    trackClickUseCase: affiliateContainer.trackClickUseCase,
  })
}, { prefix: '/ref' })
```

### Task 3.6: Register `/internal/affiliate` route

**Files:** Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add register block**

```ts
server.register(async (scope) => {
  scope.addHook('preHandler', authenticate)
  registerAffiliateInternalRoutes(scope as never, {
    getAuthenticatedUser: affiliateContainer.getAuthenticatedUser,
    isAdmin: affiliateContainer.isAdmin,
    expirePendingUseCase: affiliateContainer.expirePendingUseCase,
  })
}, { prefix: '/internal/affiliate' })
```

### Task 3.7: Create Inngest cron `affiliate-expire-referrals`

**Files:**
- Create: `apps/api/src/jobs/affiliate-expire-referrals.ts`
- Modify: `apps/api/src/jobs/index.ts`
- Modify: `apps/api/src/routes/inngest.ts`

- [ ] **Step 1: Create cron job (mirrors `referenceCheck` pattern)**

Use Spec Appendix A.6 verbatim. Key points:
- Cron expression: `'0 5 * * *'` (UTC = 02:00 BRT, Brazil DST abolished 2019; **NOT** `TZ=America/Sao_Paulo` prefix — Inngest doesn't support it)
- Use case signature: `expirePendingUseCase.execute(today: string): Promise<{ totalExpired: number }>` — pass `new Date().toISOString()` (string, NOT a `Date` object); destructure `result.totalExpired` from the object return
- Wraps step in try/catch + `console.error + throw`; existing global Fastify error handler + `instrument.ts` Sentry hook capture re-thrown errors automatically (no explicit `Sentry.captureException` import needed)

- [ ] **Step 2: Add to barrel export**

In `apps/api/src/jobs/index.ts`, add:
```ts
export { affiliateExpireReferrals } from './affiliate-expire-referrals.js'
```

- [ ] **Step 3: Register in serve handler**

In `apps/api/src/routes/inngest.ts`, update import and add to `functions: [...]`:
```ts
import {
  contentGenerate, brainstormGenerate, researchGenerate,
  productionGenerate, referenceCheck, affiliateExpireReferrals,
} from '../jobs/index.js'

const handler = serve({
  client: inngest,
  functions: [
    contentGenerate, brainstormGenerate, researchGenerate,
    productionGenerate, referenceCheck, affiliateExpireReferrals,
  ],
})
```

### Task 3.8: Smoke 2A.3 + commit

**Files:** none

- [ ] **Step 1: Typecheck + build**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run typecheck && cd apps/api && npm run build 2>&1 | tail -5
```

- [ ] **Step 2: Smoke `/ref/:code`**

```bash
# Terminal 1
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale && npm run dev:api
```

Seed an affiliate row manually via Supabase SQL Editor or `psql`:
```sql
INSERT INTO affiliates (code, status, tier, commission_rate, name, email)
VALUES ('TEST123', 'active', 'nano', 0.15, 'Test', 'test@x.com');
```

Then curl:
```bash
curl -i 'http://localhost:3001/ref/TEST123'
```
Expected: 302 redirect to `webBaseUrl`. Verify a row appeared in `affiliate_clicks`:
```sql
SELECT id, affiliate_code, source_platform, created_at FROM affiliate_clicks WHERE affiliate_code = 'TEST123';
```
Verify `affiliates.total_clicks` incremented:
```sql
SELECT total_clicks FROM affiliates WHERE code = 'TEST123';
```
Expected: `total_clicks` >= 1 (counter migration 20260417000006 + RPC working).

- [ ] **Step 3: Smoke `/internal/affiliate/expire-pending`**

```bash
curl -i -X POST -H 'X-Internal-Key: <YOUR_KEY>' -H 'X-User-Id: <ANY>' http://localhost:3001/internal/affiliate/expire-pending
```
Expected: 200 with `{ data: { totalExpired: 0 }, error: null }` (assuming no expired-eligible referrals).

- [ ] **Step 4: Verify Inngest dev server lists cron**

In another terminal: `npx inngest-cli@latest dev` → open http://localhost:8288 → Functions tab → confirm `affiliate-expire-referrals` listed with cron `0 5 * * *`.

- [ ] **Step 5: Commit Phase 2A.3**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add apps/api/src/lib/affiliate/repository/{clicks,referrals,commissions}-repo.ts apps/api/src/lib/affiliate/repository/__tests__/{clicks,referrals,commissions}-repo.test.ts apps/api/src/lib/affiliate/container.ts apps/api/src/index.ts apps/api/src/jobs/affiliate-expire-referrals.ts apps/api/src/jobs/index.ts apps/api/src/routes/inngest.ts
git commit -m "feat(api): wire affiliate tracking + internal routes + expire-pending cron"
```

---

## Phase 2A.4 — Payouts + PIX + Content + Fraud + Proposals + END-USER + ADMIN routes

### Task 4.1: Implement payouts-repo (with mapper, correct meta)

**Files:** Modify: `apps/api/src/lib/affiliate/repository/payouts-repo.ts`

- [ ] **Step 1: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapPayoutFromDb, mapPayoutToDbInsert } from './mappers'

export function createPayoutsRepo(sb: SupabaseClient<Database>) {
  return {
    async createPayout(input: Parameters<IAffiliateRepository['createPayout']>[0]) {
      const row = mapPayoutToDbInsert(input)
      const { data, error } = await sb.from('affiliate_payouts').insert(row).select().single()
      if (error) throw error
      return mapPayoutFromDb(data)
    },

    async findPayoutById(id: string) {
      const { data } = await sb.from('affiliate_payouts').select('*').eq('id', id).maybeSingle()
      return data ? mapPayoutFromDb(data) : null
    },

    async updatePayoutStatus(
      id: string,
      status: Parameters<IAffiliateRepository['updatePayoutStatus']>[1],
      meta?: Parameters<IAffiliateRepository['updatePayoutStatus']>[2],
    ) {
      // CORRECTED vs v1: meta keys are camelCase per package interface — must map
      const fields: Record<string, unknown> = { status }
      if (meta?.reviewedAt) fields.reviewed_at = meta.reviewedAt
      if (meta?.completedAt) fields.completed_at = meta.completedAt
      if (meta?.adminNotes !== undefined) fields.admin_notes = meta.adminNotes
      const { data, error } = await sb.from('affiliate_payouts').update(fields).eq('id', id).select().single()
      if (error) throw error
      return mapPayoutFromDb(data)
    },

    async listPayouts(options?: Parameters<IAffiliateRepository['listPayouts']>[0]) {
      let q = sb.from('affiliate_payouts').select('*')
      if (options?.status) q = q.eq('status', options.status)
      if (options?.affiliateId) q = q.eq('affiliate_id', options.affiliateId)
      if (options?.limit) q = q.limit(options.limit)
      if (options?.offset) q = q.range(options.offset, options.offset + (options.limit ?? 20) - 1)
      const { data, error } = await q.order('requested_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapPayoutFromDb)
    },
  }
}
```

### Task 4.2: Implement pix-repo (with mapper)

**Files:** Modify: `apps/api/src/lib/affiliate/repository/pix-repo.ts`

- [ ] **Step 1: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapPixKeyFromDb, mapPixKeyToDbInsert } from './mappers'

export function createPixRepo(sb: SupabaseClient<Database>) {
  return {
    async addPixKey(input: Parameters<IAffiliateRepository['addPixKey']>[0]) {
      const row = mapPixKeyToDbInsert(input)
      const { data, error } = await sb.from('affiliate_pix_keys').insert(row).select().single()
      if (error) throw error
      return mapPixKeyFromDb(data)
    },

    async listPixKeys(affiliateId: string) {
      const { data, error } = await sb
        .from('affiliate_pix_keys')
        .select('*')
        .eq('affiliate_id', affiliateId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapPixKeyFromDb)
    },

    async setDefaultPixKey(affiliateId: string, pixKeyId: string): Promise<void> {
      // Two-step: unset all then set chosen. Race condition window is tiny but exists.
      // Acceptable for MVP; if abuse, wrap in pl/pgsql function.
      await sb.from('affiliate_pix_keys').update({ is_default: false }).eq('affiliate_id', affiliateId)
      const { error } = await sb.from('affiliate_pix_keys').update({ is_default: true }).eq('id', pixKeyId)
      if (error) throw error
    },

    async deletePixKey(pixKeyId: string): Promise<void> {
      const { error } = await sb.from('affiliate_pix_keys').delete().eq('id', pixKeyId)
      if (error) throw error
    },
  }
}
```

### Task 4.3: Implement content-repo (with mapper, corrected return)

**Files:** Modify: `apps/api/src/lib/affiliate/repository/content-repo.ts`

- [ ] **Step 1: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapContentSubmissionFromDb, mapContentSubmissionToDbInsert } from './mappers'

export function createContentRepo(sb: SupabaseClient<Database>) {
  return {
    async submitContent(input: Parameters<IAffiliateRepository['submitContent']>[0]) {
      const row = mapContentSubmissionToDbInsert(input)
      const { data, error } = await sb.from('affiliate_content_submissions').insert(row).select().single()
      if (error) throw error
      return mapContentSubmissionFromDb(data)
    },

    async reviewContent(submissionId: string, status: 'approved' | 'rejected', reviewNotes?: string) {
      // CORRECTED vs v1: status type narrowed; returns AffiliateContentSubmission (not void)
      const { data, error } = await sb
        .from('affiliate_content_submissions')
        .update({ status, review_notes: reviewNotes ?? null })
        .eq('id', submissionId)
        .select()
        .single()
      if (error) throw error
      return mapContentSubmissionFromDb(data)
    },

    async listContentSubmissions(affiliateId: string) {
      const { data, error } = await sb
        .from('affiliate_content_submissions')
        .select('*')
        .eq('affiliate_id', affiliateId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapContentSubmissionFromDb)
    },
  }
}
```

### Task 4.4: Implement fraud-repo (with corrected return type)

**Files:** Modify: `apps/api/src/lib/affiliate/repository/fraud-repo.ts`

- [ ] **Step 1: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { AffiliateFraudFlag, AffiliateRiskScore, IAffiliateRepository } from '@tn-figueiredo/affiliate'

type DbFraudFlag = Database['public']['Tables']['affiliate_fraud_flags']['Row']
type DbRiskScore = Database['public']['Tables']['affiliate_risk_scores']['Row']

function mapFraudFlagFromDb(r: DbFraudFlag): AffiliateFraudFlag {
  return {
    id: r.id,
    affiliateId: r.affiliate_id,
    referralId: r.referral_id,
    flagType: r.flag_type as AffiliateFraudFlag['flagType'],
    severity: r.severity as AffiliateFraudFlag['severity'],
    details: (r.details as Record<string, unknown>) ?? {},
    status: r.status as AffiliateFraudFlag['status'],
    adminNotes: r.admin_notes,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
  }
}

function mapRiskScoreFromDb(r: DbRiskScore): AffiliateRiskScore {
  return {
    affiliateId: r.affiliate_id,
    score: r.score,
    flagCount: r.flag_count,
    updatedAt: r.updated_at,
  }
}

export function createFraudRepo(sb: SupabaseClient<Database>) {
  return {
    async listFraudFlags(options?: Parameters<IAffiliateRepository['listFraudFlags']>[0]) {
      let q = sb.from('affiliate_fraud_flags').select('*', { count: 'exact' })
      if (options?.status) q = q.eq('status', options.status)
      if (options?.severity) q = q.eq('severity', options.severity)
      if (options?.affiliateId) q = q.eq('affiliate_id', options.affiliateId)
      const perPage = options?.perPage ?? 50
      const page = options?.page ?? 1
      q = q.range((page - 1) * perPage, page * perPage - 1)
      const { data, count, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      return { items: (data ?? []).map(mapFraudFlagFromDb), total: count ?? 0 }
    },

    async listRiskScores(options?: Parameters<IAffiliateRepository['listRiskScores']>[0]) {
      let q = sb.from('affiliate_risk_scores').select('*')
      if (options?.minScore !== undefined) q = q.gte('score', options.minScore)
      const { data, error } = await q.order('score', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapRiskScoreFromDb)
    },

    async findFraudFlagById(flagId: string) {
      const { data } = await sb.from('affiliate_fraud_flags').select('*').eq('id', flagId).maybeSingle()
      return data ? mapFraudFlagFromDb(data) : null
    },

    async updateFraudFlagStatus(
      flagId: string,
      status: Parameters<IAffiliateRepository['updateFraudFlagStatus']>[1],
      notes?: string,
    ) {
      // CORRECTED vs v1: returns AffiliateFraudFlag (not void)
      const fields: Record<string, unknown> = { status }
      if (notes !== undefined) fields.admin_notes = notes
      if (status === 'resolved' || status === 'confirmed_fraud' || status === 'false_positive') {
        fields.resolved_at = new Date().toISOString()
      }
      const { data, error } = await sb.from('affiliate_fraud_flags').update(fields).eq('id', flagId).select().single()
      if (error) throw error
      return mapFraudFlagFromDb(data)
    },
  }
}
```

### Task 4.5: Implement affiliate-proposals-repo (correct status semantics)

**Files:** Modify: `apps/api/src/lib/affiliate/repository/affiliate-proposals-repo.ts`

- [ ] **Step 1: Implement**

The `affiliates.status` CHECK constraint values are `('pending', 'approved', 'active', 'paused', 'terminated', 'rejected')` — there is **NO** `'pending_proposal'` status (v1 spec invented this). Proposal state is tracked via `proposed_*` columns + `proposal_created_at`, not a status change.

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { Affiliate, IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapAffiliateFromDb, type DbAffiliate } from './mappers'

export function createProposalsRepo(sb: SupabaseClient<Database>) {
  async function update(id: string, fields: Partial<DbAffiliate>): Promise<Affiliate> {
    const { data, error } = await sb.from('affiliates').update(fields).eq('id', id).select().single()
    if (error) throw error
    return mapAffiliateFromDb(data)
  }

  return {
    async proposeContractChange(id: string, input: Parameters<IAffiliateRepository['proposeContractChange']>[1]) {
      // Sets proposed_* columns; status stays 'active' (or whatever it was).
      // The use case orchestrates calling addContractHistory + sending email.
      return update(id, {
        proposed_tier: input.proposedTier ?? null,
        proposed_commission_rate: input.proposedCommissionRate ?? null,
        proposed_fixed_fee_brl: input.proposedFixedFeeBrl ?? null,
        proposal_notes: input.notes ?? null,
        proposal_created_at: new Date().toISOString(),
      })
    },

    async cancelProposal(id: string) {
      return update(id, {
        proposed_tier: null,
        proposed_commission_rate: null,
        proposed_fixed_fee_brl: null,
        proposal_notes: null,
        proposal_created_at: null,
      })
    },

    async acceptProposal(id: string) {
      // Accepts: clears proposed_*. Use case calls activateAfterContractAcceptance separately.
      return update(id, {
        proposed_tier: null,
        proposed_commission_rate: null,
        proposed_fixed_fee_brl: null,
        proposal_notes: null,
        proposal_created_at: null,
      })
    },

    async rejectProposal(id: string) {
      return update(id, {
        proposed_tier: null,
        proposed_commission_rate: null,
        proposed_fixed_fee_brl: null,
        proposal_notes: null,
        proposal_created_at: null,
      })
    },
  }
}
```

**Note:** the actual tier/rate update happens via `updateProfile`/`updateContract` orchestrated by the use case — `acceptProposal` just clears the proposal. Verify against the use case body if behavior surprises in smoke (`grep -A20 "class AcceptContractProposalUseCase" /tmp/affiliate-pkg-inspect/package/dist/index.cjs`).

### Task 4.6: Implement stats-repo (CORRECTED return shape)

**Files:** Modify: `apps/api/src/lib/affiliate/repository/stats-repo.ts`

- [ ] **Step 1: Implement (returns `{pendingPayoutBrl, paidPayoutBrl}`)**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createStatsRepo(sb: SupabaseClient<Database>) {
  return {
    async getStats(affiliateId: string) {
      // CORRECTED vs v1: package interface returns { pendingPayoutBrl, paidPayoutBrl }
      // computed by aggregating affiliate_payouts.total_brl GROUP BY status.
      // 'pending' + 'approved' + 'processing' = pendingPayoutBrl
      // 'completed' = paidPayoutBrl
      const { data, error } = await sb
        .from('affiliate_payouts')
        .select('status, total_brl')
        .eq('affiliate_id', affiliateId)
      if (error) throw error
      let pendingPayoutBrl = 0
      let paidPayoutBrl = 0
      for (const p of data ?? []) {
        if (p.status === 'completed') paidPayoutBrl += p.total_brl
        else if (p.status === 'pending' || p.status === 'approved' || p.status === 'processing') {
          pendingPayoutBrl += p.total_brl
        }
      }
      return { pendingPayoutBrl, paidPayoutBrl }
    },

    async getPendingContractsCount(): Promise<number> {
      // Counts affiliates with a non-null proposal_created_at (i.e., active proposal).
      const { count, error } = await sb
        .from('affiliates')
        .select('id', { count: 'exact', head: true })
        .not('proposal_created_at', 'is', null)
      if (error) throw error
      return count ?? 0
    },
  }
}
```

### Task 4.7: Complete container with all 35 use cases

**Files:** Modify: `apps/api/src/lib/affiliate/container.ts`

- [ ] **Step 1: Replace container with full version from Spec Appendix A.1**

Use Spec Appendix A.1 verbatim — all 35 use case constructors with verified signatures.

### Task 4.8: Register `/affiliate` (end-user) and `/admin/affiliate` (admin) routes

**Files:** Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add imports**

```ts
import {
  registerAffiliateRoutes,
  registerAffiliateAdminRoutes,
  // existing redirect + internal already imported in 2A.3
} from '@tn-figueiredo/affiliate/routes'
```

- [ ] **Step 2: Add register blocks after `/internal/affiliate`**

```ts
server.register(async (scope) => {
  scope.addHook('preHandler', authenticate)
  registerAffiliateRoutes(scope as never, affiliateContainer.endUserDeps)
}, { prefix: '/affiliate' })

server.register(async (scope) => {
  scope.addHook('preHandler', authenticate)
  registerAffiliateAdminRoutes(scope as never, affiliateContainer.adminDeps)
}, { prefix: '/admin/affiliate' })
```

### Task 4.9: Smoke 2A.4 + commit

**Files:** none

- [ ] **Step 1: Typecheck + build**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run typecheck && cd apps/api && npm run build 2>&1 | tail -5
```

- [ ] **Step 2: Smoke `POST /affiliate/apply`**

Start dev. With a valid user session (set X-User-Id manually OR through apps/app):
```bash
curl -i -X POST http://localhost:3001/affiliate/apply \
  -H 'X-Internal-Key: <KEY>' -H 'X-User-Id: <UUID-from-auth.users>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"t@x.com","channelPlatform":"youtube","channelUrl":"https://youtube.com/x"}'
```
Expected: 201 with affiliate row created (response includes `id` + `code`). Verify with:
```sql
SELECT id, code, status, tier FROM affiliates WHERE email = 't@x.com';
```

- [ ] **Step 3: Smoke `GET /admin/affiliate/`**

Insert admin role for your test user:
```sql
INSERT INTO user_roles (user_id, role) VALUES ('<UUID>', 'admin');
```

```bash
curl -i http://localhost:3001/admin/affiliate/ \
  -H 'X-Internal-Key: <KEY>' -H 'X-User-Id: <ADMIN_UUID>'
```
Expected: 200 with overview JSON. Without admin role: 403.

- [ ] **Step 4: Test coverage check**

Per spec quality target, each sub-repo should have at least 1 happy-path test. After Task 4.9:
- 2A.2: tax-id (3) + email (5) + auth (2) + query (2) + lifecycle (2) = 14
- 2A.3: clicks (1) + referrals (1) + commissions (1) = 3
- 2A.4: payouts/pix/content/fraud/proposals/stats can defer dedicated tests to a follow-up "test hardening" sprint OR write 1 happy-path test each here (~15 LOC each)

Run all repo tests:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api
npm run test -- src/lib/affiliate/repository/__tests__/ src/__tests__/lib/affiliate/ 2>&1 | tail -10
```
Expected: ≥17 tests passing.

- [ ] **Step 5: Commit Phase 2A.4**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add apps/api/src/lib/affiliate/repository/{payouts,pix,content,fraud,affiliate-proposals,stats}-repo.ts apps/api/src/lib/affiliate/repository/__tests__/ apps/api/src/lib/affiliate/container.ts apps/api/src/index.ts
git commit -m "feat(api): wire affiliate payouts/pix/content/fraud/proposals + end-user + admin routes"
```

---

## Phase 2A.5 — Smoke + config review + `.env.example` + Deprecation

### Task 5.1: Add `@deprecated` to legacy route

**Files:** Modify: `apps/api/src/routes/affiliate-legacy.ts`

- [ ] **Step 1: Add JSDoc at top of file**

```ts
/**
 * @deprecated since Phase 2A.5 (2026-04-17). To be removed in Phase 2D cutover.
 * Use new package routes from @tn-figueiredo/affiliate instead.
 */
```

### Task 5.2: Update `.env.local.example` (NEW vs v1)

**Files:** Modify or Create: `apps/api/.env.local.example`

- [ ] **Step 1: Document the 4 deferrable env vars**

Append (or create) `apps/api/.env.local.example`:

```bash
# Affiliate platform — deferrable (set when activating each feature)
# RESEND_API_KEY=re_xxx           # required for email side-effects (admin/applicant notifications, approval, proposal)
# RESEND_FROM=BrightTale <noreply@brighttale.io>
# AFFILIATE_ADMIN_EMAIL=admin@brighttale.io   # default fallback
# INNGEST_EVENT_KEY=               # required for prod cron registration
# INNGEST_SIGNING_KEY=             # required for prod cron registration
```

### Task 5.3: Create skipped integration test

**Files:** Create: `apps/api/src/__tests__/integration/affiliate-flow.test.ts`

- [ ] **Step 1: Write skipped test**

```ts
import { describe, it, expect } from 'vitest'

// TODO-test: Category C — runs against Supabase dev manually.
// Per CLAUDE.md, Category C tests are skipped in CI.
describe.skip('affiliate end-to-end flow', () => {
  it('apply → admin approve → track click → attribute → calculate commission → payout', async () => {
    // Manual smoke per spec §7 + plan Task 5.4 12-item checklist.
    expect(true).toBe(true)
  })
})
```

### Task 5.4: Operator config review

**Files:** Modify (potentially): `apps/api/src/lib/affiliate/config.ts`

- [ ] **Step 1: Review with product**

Confirm with product owner the values:
- `minimumPayoutCents: 5000` (R$ 50,00) — confirm threshold
- `tierRates`: nano 15% / micro 20% / mid 25% / macro 30% / mega 35% — confirm percentages
- `currentContractVersion: 1` — confirm starts at 1
- `webBaseUrl` / `appStoreUrl` — confirm production URLs

Edit values if needed. If no changes, proceed.

### Task 5.5: Run full smoke checklist (12 items)

**Files:** none (manual smoke)

- [ ] **Step 1-12: Record outcome of each item**

Items needing `RESEND_API_KEY` are marked **(R)**; needing Inngest cron in prod are marked **(I)**. Both can be skipped if env vars not set; document as "deferred — env not set".

```
[ ]  1. POST /api/affiliate/apply (user A) → 201, payload tem `id` + `code`
[ ]  2. (R) Email Resend recebido em AFFILIATE_ADMIN_EMAIL com nome de A — OR log shows isResendConfigured=false
[ ]  3. (R) Email confirmação recebido em A — OR log shows skip
[ ]  4. POST /api/admin/affiliate/:id/approve (admin) → status `approved`, tier `nano`
[ ]  5. (R) Email aprovação recebido em A — OR log shows skip
[ ]  6. GET /api/affiliate/me (user A) → status approved, tier nano
[ ]  7. GET /api/ref/{A.code} (anon) → 302 redirect; affiliate_clicks +1, affiliates.total_clicks +1
[ ]  8. Atribuição via use case direto (script Node REPL ou test one-shot): chamar attributeUseCase.execute → cria affiliate_referrals attribution_status='active' or 'pending_contract'
[ ]  9. Chamar calcCommissionUseCase.execute direto → cria affiliate_commissions
[ ] 10. POST /api/affiliate/payouts (user A com R$50+ commissions) → cria payout pending
[ ] 11. POST /api/admin/affiliate/:id/payouts/:payoutId/approve (admin) → status approved
[ ] 12. (I) Inngest cron `affiliate-expire-referrals` rodado manualmente via inngest-cli OU `POST /api/internal/affiliate/expire-pending` retorna `{ totalExpired }` — production cron deferred until INNGEST_EVENT_KEY set
```

For items 8 + 9, use a one-shot script (signatures verified against `dist/fraud-admin-DiX4kqdI.d.ts`):

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api
cat > /tmp/affiliate-smoke-8-9.ts << 'EOF'
import 'dotenv/config'
import { buildAffiliateContainer } from './src/lib/affiliate/container'

const c = buildAffiliateContainer()

// Item 8: AttributeSignupToAffiliateUseCase
//   .execute(affiliateCode, userId, today, options?) → Promise<AffiliateReferral | null>
const ref = await c.attributeUseCase.execute(
  'TEST123',                               // affiliateCode (must exist + status='active')
  '<UUID-from-auth.users>',                // userId
  new Date().toISOString(),                // today (ISO string)
  { platform: 'web' },                     // options (optional)
)
console.log('referral:', ref)

// Item 9: CalculateAffiliateCommissionUseCase
//   .execute({ userId, paymentAmount, stripeFee, paymentType, today, ... }) → Promise<AffiliateCommission | null>
const com = await c.calcCommissionUseCase.execute({
  userId: '<UUID-of-referred-user>',
  paymentAmount: 19990,                    // R$ 199,90 in cents
  stripeFee: 200,                          // R$ 2,00 in cents
  paymentType: 'monthly',                  // or 'annual'
  today: new Date().toISOString(),
})
console.log('commission:', com)
EOF
npx tsx /tmp/affiliate-smoke-8-9.ts
```

**Pre-requisite:** `attributeUseCase.execute` returns `null` if `affiliateCode` doesn't exist OR no matching click row exists for the user. Seed an `affiliate_clicks` row first via `GET /api/ref/TEST123` (item 7) using the same client (matching IP hash improves attribution).

Record outcomes. Do NOT proceed to 5.6 unless all 12 pass (or operator decides which gaps acceptable).

### Task 5.6: Final commit + PR

**Files:** none (commit + PR)

- [ ] **Step 1: Commit Phase 2A.5**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add apps/api/src/routes/affiliate-legacy.ts apps/api/src/__tests__/integration/affiliate-flow.test.ts apps/api/src/lib/affiliate/config.ts apps/api/.env.local.example
git commit -m "feat(api): finalize affiliate 2A foundation + integration smoke + deprecation + .env.example"
```

- [ ] **Step 2: Full workspace verification**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run typecheck && npm run build --workspaces --if-present && npm run lint && npm run test --workspaces --if-present 2>&1 | tail -20
```

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/affiliate-2a-foundation
gh pr create --base staging --title "Affiliate Platform 2A Foundation" --body "$(cat <<'EOF'
**Spec:** docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md (v2 — verified against package source)
**Plan:** docs/superpowers/plans/2026-04-17-affiliate-2a-foundation.md (v2)
**Predecessor:** Phase 1 (admin upgrade) — merged + 7d stable in prod

## Summary
- Adopt @tn-figueiredo/affiliate@0.4.0 in apps/api
- 7 migrations (5 package + 2 bright-tale): 10 new tables + triggers + atomic counter functions
- SupabaseAffiliateRepository (52 methods, 11 sub-repos + typed mappers — no `as any`)
- 4 route helpers wired: /affiliate, /admin/affiliate, /internal/affiliate, /ref
- ResendAffiliateEmailService (XSS-safe + Resend-guarded; SMTP swap-ready in 2F+)
- StubTaxIdRepository
- Inngest cron `affiliate-expire-referrals` daily 02:00 BRT (= 05:00 UTC; Brazil DST abolished 2019)
- Legacy custom impl renamed to /api/affiliate-legacy/* (kept alive until 2D cutover)

## Smoke (12 items)
[paste smoke result from Task 5.5]

## Out of scope (future phases)
- 2B end-user UI rewrite
- 2C admin UI adoption (affiliate-admin@0.3.3)
- 2D data migration + cutover (drops legacy)
- 2E fraud detection real impl + /ref rate-limit
- 2F billing/payouts integration + Receita Federal tax-id + idempotency tokens + email provider abstraction (SMTP)

## Deferrable env vars (set in Vercel apps/api prod when activating features)
- RESEND_API_KEY, RESEND_FROM, AFFILIATE_ADMIN_EMAIL → activates emails
- INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY → activates daily cron (prod)

## Rollback
Spec Appendix C contains tested DROP SQL (7 statements, reverse order, single transaction). If needed:
1. git revert merge commit
2. Apply rollback SQL via supabase SQL Editor or psql
3. Run `npm run db:types` to regenerate types

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Return the PR URL.

---

## Phase 2A.6 — Staging soak + prod gate (NEW vs v1)

### Task 6.1: Merge to staging + monitor 48h

**Files:** none (release process)

- [ ] **Step 1: Merge PR after CI green + review**

- [ ] **Step 2: Deploy to staging environment** (standard process; Vercel auto-deploys `staging` branch)

- [ ] **Step 3: Monitor 48h**

Check Axiom for `affiliate.*` errors:
```
| where service == "api"
| where path startswith "/affiliate" or path startswith "/admin/affiliate" or path startswith "/internal/affiliate" or path startswith "/ref"
| where status_code >= 500
| summarize count() by status_code, path
```

Check Sentry for unhandled exceptions in affiliate module (`@/lib/affiliate/*` paths).

Check Inngest dashboard (if `INNGEST_EVENT_KEY` set in staging) — confirm `affiliate-expire-referrals` is registered.

If errors: triage; if blocker, prepare rollback (Spec Appendix C SQL + revert commit).

### Task 6.2: Prod release + activation

**Files:** none

- [ ] **Step 1: Merge `staging` → `main` via standard release PR**

- [ ] **Step 2: Verify prod deploy succeeded** (Vercel dashboard, smoke `GET /api/affiliate-legacy/program` continues to respond)

- [ ] **Step 3: Set env vars when ready to activate features (operator decides timing)**

In Vercel apps/api prod:
- `RESEND_API_KEY`, `AFFILIATE_ADMIN_EMAIL` → activates emails
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` → activates cron (cron registers automatically on next deploy after vars set)

- [ ] **Step 4: Smoke prod**

```bash
# Verify legacy still alive
curl -i https://api.brighttale.io/affiliate-legacy/program ... # expect normal response

# Verify new namespace returns 401 unauthenticated
curl -i https://api.brighttale.io/affiliate/me  # expect 401

# Verify redirect works
curl -i https://api.brighttale.io/ref/<existing-active-code>  # expect 302
```

### Task 6.3: Update spec with implemented status

**Files:** Modify: `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`

- [ ] **Step 1: Mark spec implemented**

Update spec frontmatter `**Status:**` to `implemented (commit <SHA>, deployed prod <DATE>)`. Commit on a `chore/docs` branch + open quick PR.

---

## Troubleshooting

**`npm run db:push:dev` fails "function moddatetime does not exist":**
Local Supabase missing extension. Run `npx supabase db reset` to wipe + reapply (initial migration enables `moddatetime` extension).

**`npm run db:push:dev` fails on Task 1.4 migration "column total_clicks does not exist":**
Package schema changed since this plan was written. Re-run Task 0.2 Step 2 to get current column names; update `20260417000006` accordingly.

**Typecheck error "Type 'X' is not assignable to 'IAffiliateRepository'":**
A sub-repo method has wrong signature. Compare to `dist/fraud-admin-DiX4kqdI.d.ts` `IAffiliateRepository` (L319) for the exact member shape. Check `Parameters<IAffiliateRepository['<method>']>[N]` types match.

**`POST /affiliate/apply` returns 500 with "not_impl_2a1":**
A sub-repo method needed by `ApplyAsAffiliateUseCase` is still skeleton. In 2A.2 we implement query + lifecycle + history; if apply still fails after 2A.2 commit, check which method threw and implement it.

**Insert fails "column \"affiliateId\" of relation \"affiliate_clicks\" does not exist":**
A sub-repo passed camelCase to `.insert(input)` instead of going through a mapper. Find the call site and route via `mapXxxToDbInsert(input)`.

**Inngest cron `0 5 * * *` not appearing in dev UI:**
`inngest-cli@latest dev` must be running BEFORE `npm run dev:api`. Restart in correct order.

**Email not arriving:**
1. Check `isResendConfigured()` — `RESEND_API_KEY` must be set
2. Check Resend domain DNS (SPF/DKIM verified)
3. Check `RESEND_FROM` if customized — must match verified domain

**`isAdmin` returns false for known admin user:**
1. Confirm row exists: `SELECT * FROM user_roles WHERE user_id = '<UUID>' AND role = 'admin';`
2. Confirm `request.userId` is set (apps/app middleware injects after Supabase SSR)

**Click fraud (R15) suspected:**
Quick mitigation: add `@fastify/rate-limit` plugin to the `/ref` register block (see https://github.com/fastify/fastify-rate-limit). Example:
```ts
import rateLimit from '@fastify/rate-limit'
server.register(async (scope) => {
  await scope.register(rateLimit, { max: 10, timeWindow: '1 minute' })
  registerAffiliateRedirectRoute(scope as never, { ... })
}, { prefix: '/ref' })
```
Real fraud detection (IP cluster, velocity) lands in 2E.

**Duplicate payouts (R16) detected:**
Quick mitigation: add unique constraint on `(affiliate_id, commission_ids[1])` if commission_ids is non-empty (manual check before insert in `createPayout`). Real idempotency tokens land in 2F.

**MinimalFastify TS warning on `as never` cast:**
Expected — package's `MinimalFastify` declares fewer methods than full `FastifyInstance`. Cast is intentional and one-way safe; runtime calls succeed because `MinimalFastify` is a strict subset.
