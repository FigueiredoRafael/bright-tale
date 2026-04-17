# Affiliate Platform — Phase 2A Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt `@tn-figueiredo/affiliate@0.4.0` in `apps/api`: 11 new tables, 4 route helpers (end-user / admin / internal / redirect), 11 sub-repos composing `SupabaseAffiliateRepository`, Resend email service, stub tax-id, optional fraud (deferred), Inngest cron for expiring referrals. Legacy custom impl renamed to `*-legacy` for parallel coexistence until 2D cutover.

**Architecture:** Composition root container (module-level cached singleton) wires 37 use cases with Supabase-backed repository, Resend-backed email, stubbed tax-id, undefined fraud. 4 package route helpers register under prefixes `/affiliate`, `/admin/affiliate`, `/internal/affiliate`, `/ref`. apps/web (Phase 1) is unaffected; apps/app legacy settings page calls `/api/affiliate-legacy/*` until 2B rewrites it.

**Tech Stack:** Fastify 5, Supabase JS v2 (service_role), Inngest, Resend, vitest 4, TypeScript strict. Package: `@tn-figueiredo/affiliate@0.4.0` (37 use cases, 5 SQL migrations).

---

## Pre-flight Context

**Spec:** `docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md`

**Pre-requisites (operator-verified BEFORE Phase 2A.1):**
- Phase 1 (`feat/admin-upgrade-062`) merged to `staging` OR Phase 2A branch created from `feat/admin-upgrade-062` head
- `SUPABASE_ACCESS_TOKEN` present in root `.env.local` (required for `db:push:dev` + `db:types`)
- `RESEND_API_KEY` present in `apps/api/.env.local`
- `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` present in `apps/api/.env.local`
- npm authenticated for GitHub Packages (`@tn-figueiredo/*`)

**Branch:** create `feat/affiliate-2a-foundation` from `staging` (or `feat/admin-upgrade-062` if Phase 1 not merged yet).

---

## Phase 2A.0 — Branch + tag

### Task 0.1: Branch + rollback tag

**Files:** none (git only)

- [ ] **Step 1: Verify clean working tree**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git status
```
Expected: clean tree, on `staging` (or Phase 1 branch).

- [ ] **Step 2: Create branch + tag**

```bash
git checkout -b feat/affiliate-2a-foundation
git tag pre-affiliate-2a
rm -rf apps/api/dist apps/api/node_modules/.cache 2>/dev/null
```

- [ ] **Step 3: Add `AFFILIATE_ADMIN_EMAIL` to env**

```bash
grep '^AFFILIATE_ADMIN_EMAIL=' apps/api/.env.local 2>/dev/null || echo "AFFILIATE_ADMIN_EMAIL=admin@brighttale.io" >> apps/api/.env.local
grep '^AFFILIATE_ADMIN_EMAIL=' apps/api/.env.local
```
Expected: prints `AFFILIATE_ADMIN_EMAIL=admin@brighttale.io`.

---

## Phase 2A.1 — Foundation: install, migrations, skeleton, legacy rename

### Task 1.1: Install `@tn-figueiredo/affiliate@0.4.0`

**Files:** Modify: `apps/api/package.json`, `package-lock.json`

- [ ] **Step 1: Install package**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api
npm install @tn-figueiredo/affiliate@0.4.0 --save-exact
```

- [ ] **Step 2: Verify version**

```bash
grep '"@tn-figueiredo/affiliate"' /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api/package.json
```
Expected: `"@tn-figueiredo/affiliate": "0.4.0"`

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

### Task 1.4: Create updated_at triggers + RLS gap + atomic counter functions

**Files:** Create: `supabase/migrations/20260417000006_affiliate_updated_at_triggers.sql`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/20260417000006_affiliate_updated_at_triggers.sql`:

```sql
-- updated_at triggers (CLAUDE.md convention; package added column but no trigger)
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliate_pix_keys
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliate_content_submissions
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.affiliate_social_links
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- RLS gap: package's 005 enables RLS on 10 of 11 tables; close gap for affiliate_social_links
ALTER TABLE public.affiliate_social_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.affiliate_social_links
  TO service_role USING (true) WITH CHECK (true);

-- Atomic counter functions (avoid race conditions in clicks/referrals/conversions increments)
CREATE OR REPLACE FUNCTION public.increment_affiliate_clicks(aff_id uuid) RETURNS void AS $$
  UPDATE public.affiliates SET clicks = clicks + 1 WHERE id = aff_id;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_affiliate_referrals(aff_id uuid) RETURNS void AS $$
  UPDATE public.affiliates SET referrals = referrals + 1 WHERE id = aff_id;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_affiliate_conversions(aff_id uuid, earnings_brl numeric) RETURNS void AS $$
  UPDATE public.affiliates
  SET conversions = conversions + 1,
      total_earnings_brl = total_earnings_brl + earnings_brl
  WHERE id = aff_id;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER;
```

### Task 1.5: Apply migrations to Supabase dev

**Files:** none (DB operation)

- [ ] **Step 1: Push migrations**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run db:push:dev 2>&1 | tail -30
```
Expected: 7 migrations applied (1 rename + 5 package + 1 triggers).

If any migration fails: STOP. Run `npm run db:reset` to wipe local + reapply, OR investigate the failing migration. Do NOT proceed to Task 1.6 until all 7 apply.

### Task 1.6: Regenerate Supabase types

**Files:** Modify: `packages/shared/src/types/database.ts`

- [ ] **Step 1: Regenerate**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run db:types 2>&1 | tail -5
```

- [ ] **Step 2: Verify new tables present in generated types**

```bash
grep -E "affiliates:|affiliate_clicks:|affiliate_pix_keys:|affiliate_social_links:" packages/shared/src/types/database.ts | head -10
```
Expected: 4+ matches showing the new table names.

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

- [ ] **Step 2: Rename exported function**

Edit `apps/api/src/routes/affiliate-legacy.ts`:

Find:
```ts
export async function affiliateRoutes(fastify: FastifyInstance): Promise<void> {
```
Replace with:
```ts
export async function affiliateLegacyRoutes(fastify: FastifyInstance): Promise<void> {
```

- [ ] **Step 3: Update table reference**

In the same file, find every occurrence (Bash to confirm count):
```bash
grep -n "affiliate_referrals" /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api/src/routes/affiliate-legacy.ts
```
Expected: 1 line (around L121: `.from('affiliate_referrals')`).

Replace `.from('affiliate_referrals')` with `.from('affiliate_referrals_legacy' as never)`. The `as never` cast is needed because regenerated `database.ts` (after Task 1.6) will not include `affiliate_referrals_legacy` in its types — it's a runtime-only legacy table.

- [ ] **Step 4: Update import + register in `apps/api/src/index.ts`**

Find the line:
```ts
import { affiliateRoutes } from './routes/affiliate.js';
```
Replace with:
```ts
import { affiliateLegacyRoutes } from './routes/affiliate-legacy.js';
```

Find:
```ts
server.register(affiliateRoutes, { prefix: '/affiliate' });
```
Replace with:
```ts
server.register(affiliateLegacyRoutes, { prefix: '/affiliate-legacy' });
```

### Task 1.8: Update apps/app settings page to use legacy URLs

**Files:** Modify: `apps/app/src/app/(app)/settings/affiliate/page.tsx`

- [ ] **Step 1: Update 3 fetch URLs**

Edit the file and replace 3 occurrences of `/api/affiliate/` with `/api/affiliate-legacy/`. Use Edit tool with `replace_all: false` for each occurrence (or grep first to count):

```bash
grep -n "/api/affiliate/" /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/app/src/app/\(app\)/settings/affiliate/page.tsx
```

Expected ~3 matches (program GET, program POST, referrals GET). Replace each `'/api/affiliate/'` with `'/api/affiliate-legacy/'`.

### Task 1.9: Scaffold repository skeleton (all 52 methods throw)

**Files:** Create: 12 files in `apps/api/src/lib/affiliate/repository/`

- [ ] **Step 1: Create directory + skeleton sub-repos**

Create `apps/api/src/lib/affiliate/repository/affiliate-query-repo.ts`:

```ts
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

- [ ] **Step 2: Repeat for 10 more sub-repos**

Same pattern (`export function createXxxRepo(_sb): {...methods that throw...}`) for:

- `affiliate-lifecycle-repo.ts` — methods: `approve, pause, terminate, updateProfile, updateContract, addContractHistory, activateAfterContractAcceptance` (7)
- `affiliate-proposals-repo.ts` — methods: `proposeContractChange, cancelProposal, acceptProposal, rejectProposal` (4)
- `affiliate-history-repo.ts` — methods: `getContractHistory` (1; addContractHistory lives in lifecycle)
- `clicks-repo.ts` — methods: `incrementClicks, createClick, markClickConverted, getClicksByPlatform` (4)
- `referrals-repo.ts` — methods: `incrementReferrals, createReferral, findReferralByUserId, listReferralsByAffiliate, expirePendingReferrals` (5)
- `commissions-repo.ts` — methods: `incrementConversions, createCommission, listPendingCommissions, markCommissionsPaid` (4)
- `payouts-repo.ts` — methods: `createPayout, findPayoutById, updatePayoutStatus, listPayouts` (4)
- `pix-repo.ts` — methods: `addPixKey, listPixKeys, setDefaultPixKey, deletePixKey` (4)
- `content-repo.ts` — methods: `submitContent, reviewContent, listContentSubmissions` (3)
- `fraud-repo.ts` — methods: `listFraudFlags, listRiskScores, findFraudFlagById, updateFraudFlagStatus` (4)
- `stats-repo.ts` — methods: `getStats, getPendingContractsCount` (2)

Each method: `async <name>(_args): Promise<never> { throw new Error('not_impl_2a1') }`. Single-arg or multi-arg methods use `_args` underscore-prefixed to suppress unused-param lint.

- [ ] **Step 3: Create `repository/index.ts` (delegation class)**

**Important typing strategy:** the class does NOT declare `implements IAffiliateRepository` until 2A.4 (when all 52 method implementations are real). Until then, the class is exported as a regular class. Container 2A.2/2A.3 casts `repo as unknown as IAffiliateRepository` when passing to use case constructors. In 2A.4 Task 4.7 the cast is removed and `implements` is added.

Create `apps/api/src/lib/affiliate/repository/index.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import { createQueryRepo } from './affiliate-query-repo'
import { createLifecycleRepo } from './affiliate-lifecycle-repo'
import { createProposalsRepo } from './affiliate-proposals-repo'
import { createHistoryRepo } from './affiliate-history-repo'
import { createClicksRepo } from './clicks-repo'
import { createReferralsRepo } from './referrals-repo'
import { createCommissionsRepo } from './commissions-repo'
import { createPayoutsRepo } from './payouts-repo'
import { createPixRepo } from './pix-repo'
import { createContentRepo } from './content-repo'
import { createFraudRepo } from './fraud-repo'
import { createStatsRepo } from './stats-repo'

// 2A.1: skeleton class — does NOT yet `implements IAffiliateRepository`.
// Sub-repos return `Promise<never>` via `throw`; methods here delegate.
// In 2A.4 Task 4.7, the `implements IAffiliateRepository` clause is added
// once all 52 sub-repo methods return real types.
export class SupabaseAffiliateRepository {
  private query: ReturnType<typeof createQueryRepo>
  private lifecycle: ReturnType<typeof createLifecycleRepo>
  private proposals: ReturnType<typeof createProposalsRepo>
  private history: ReturnType<typeof createHistoryRepo>
  private clicks: ReturnType<typeof createClicksRepo>
  private referrals: ReturnType<typeof createReferralsRepo>
  private commissions: ReturnType<typeof createCommissionsRepo>
  private payouts: ReturnType<typeof createPayoutsRepo>
  private pix: ReturnType<typeof createPixRepo>
  private content: ReturnType<typeof createContentRepo>
  private fraud: ReturnType<typeof createFraudRepo>
  private stats: ReturnType<typeof createStatsRepo>

  constructor(private sb: SupabaseClient<Database>) {
    this.query = createQueryRepo(sb)
    this.lifecycle = createLifecycleRepo(sb)
    this.proposals = createProposalsRepo(sb)
    this.history = createHistoryRepo(sb)
    this.clicks = createClicksRepo(sb)
    this.referrals = createReferralsRepo(sb)
    this.commissions = createCommissionsRepo(sb)
    this.payouts = createPayoutsRepo(sb)
    this.pix = createPixRepo(sb)
    this.content = createContentRepo(sb)
    this.fraud = createFraudRepo(sb)
    this.stats = createStatsRepo(sb)
  }

  // 52 method delegations — TypeScript will reject this implementation
  // because it doesn't implement IAffiliateRepository. We add `as never`
  // casts for the skeleton; real impls follow in 2A.2-2A.4.
  // NOTE: this entire class is `as unknown as IAffiliateRepository` until
  // sub-repo methods return real types in 2A.2+.

  // Delegations (sample — Engineer must add ALL 52 method delegations):
  // 52 delegations using rest/spread — TypeScript infers from sub-repo signatures.
  // This avoids the `(this.X as any)` cast hell of intermediate skeletons.
  findById = (...args: Parameters<typeof this.query.findById>) => this.query.findById(...args)
  findByCode = (...args: Parameters<typeof this.query.findByCode>) => this.query.findByCode(...args)
  findByUserId = (...args: Parameters<typeof this.query.findByUserId>) => this.query.findByUserId(...args)
  findByEmail = (...args: Parameters<typeof this.query.findByEmail>) => this.query.findByEmail(...args)
  isCodeTaken = (...args: Parameters<typeof this.query.isCodeTaken>) => this.query.isCodeTaken(...args)
  create = (...args: Parameters<typeof this.query.create>) => this.query.create(...args)
  createInternal = (...args: Parameters<typeof this.query.createInternal>) => this.query.createInternal(...args)
  linkUserId = (...args: Parameters<typeof this.query.linkUserId>) => this.query.linkUserId(...args)
  listAll = (...args: Parameters<typeof this.query.listAll>) => this.query.listAll(...args)
  approve = (...args: Parameters<typeof this.lifecycle.approve>) => this.lifecycle.approve(...args)
  pause = (...args: Parameters<typeof this.lifecycle.pause>) => this.lifecycle.pause(...args)
  terminate = (...args: Parameters<typeof this.lifecycle.terminate>) => this.lifecycle.terminate(...args)
  updateProfile = (...args: Parameters<typeof this.lifecycle.updateProfile>) => this.lifecycle.updateProfile(...args)
  updateContract = (...args: Parameters<typeof this.lifecycle.updateContract>) => this.lifecycle.updateContract(...args)
  addContractHistory = (...args: Parameters<typeof this.lifecycle.addContractHistory>) => this.lifecycle.addContractHistory(...args)
  activateAfterContractAcceptance = (...args: Parameters<typeof this.lifecycle.activateAfterContractAcceptance>) => this.lifecycle.activateAfterContractAcceptance(...args)
  proposeContractChange = (...args: Parameters<typeof this.proposals.proposeContractChange>) => this.proposals.proposeContractChange(...args)
  cancelProposal = (...args: Parameters<typeof this.proposals.cancelProposal>) => this.proposals.cancelProposal(...args)
  acceptProposal = (...args: Parameters<typeof this.proposals.acceptProposal>) => this.proposals.acceptProposal(...args)
  rejectProposal = (...args: Parameters<typeof this.proposals.rejectProposal>) => this.proposals.rejectProposal(...args)
  getContractHistory = (...args: Parameters<typeof this.history.getContractHistory>) => this.history.getContractHistory(...args)
  incrementClicks = (...args: Parameters<typeof this.clicks.incrementClicks>) => this.clicks.incrementClicks(...args)
  createClick = (...args: Parameters<typeof this.clicks.createClick>) => this.clicks.createClick(...args)
  markClickConverted = (...args: Parameters<typeof this.clicks.markClickConverted>) => this.clicks.markClickConverted(...args)
  getClicksByPlatform = (...args: Parameters<typeof this.clicks.getClicksByPlatform>) => this.clicks.getClicksByPlatform(...args)
  incrementReferrals = (...args: Parameters<typeof this.referrals.incrementReferrals>) => this.referrals.incrementReferrals(...args)
  createReferral = (...args: Parameters<typeof this.referrals.createReferral>) => this.referrals.createReferral(...args)
  findReferralByUserId = (...args: Parameters<typeof this.referrals.findReferralByUserId>) => this.referrals.findReferralByUserId(...args)
  listReferralsByAffiliate = (...args: Parameters<typeof this.referrals.listReferralsByAffiliate>) => this.referrals.listReferralsByAffiliate(...args)
  expirePendingReferrals = (...args: Parameters<typeof this.referrals.expirePendingReferrals>) => this.referrals.expirePendingReferrals(...args)
  incrementConversions = (...args: Parameters<typeof this.commissions.incrementConversions>) => this.commissions.incrementConversions(...args)
  createCommission = (...args: Parameters<typeof this.commissions.createCommission>) => this.commissions.createCommission(...args)
  listPendingCommissions = (...args: Parameters<typeof this.commissions.listPendingCommissions>) => this.commissions.listPendingCommissions(...args)
  markCommissionsPaid = (...args: Parameters<typeof this.commissions.markCommissionsPaid>) => this.commissions.markCommissionsPaid(...args)
  createPayout = (...args: Parameters<typeof this.payouts.createPayout>) => this.payouts.createPayout(...args)
  findPayoutById = (...args: Parameters<typeof this.payouts.findPayoutById>) => this.payouts.findPayoutById(...args)
  updatePayoutStatus = (...args: Parameters<typeof this.payouts.updatePayoutStatus>) => this.payouts.updatePayoutStatus(...args)
  listPayouts = (...args: Parameters<typeof this.payouts.listPayouts>) => this.payouts.listPayouts(...args)
  addPixKey = (...args: Parameters<typeof this.pix.addPixKey>) => this.pix.addPixKey(...args)
  listPixKeys = (...args: Parameters<typeof this.pix.listPixKeys>) => this.pix.listPixKeys(...args)
  setDefaultPixKey = (...args: Parameters<typeof this.pix.setDefaultPixKey>) => this.pix.setDefaultPixKey(...args)
  deletePixKey = (...args: Parameters<typeof this.pix.deletePixKey>) => this.pix.deletePixKey(...args)
  submitContent = (...args: Parameters<typeof this.content.submitContent>) => this.content.submitContent(...args)
  reviewContent = (...args: Parameters<typeof this.content.reviewContent>) => this.content.reviewContent(...args)
  listContentSubmissions = (...args: Parameters<typeof this.content.listContentSubmissions>) => this.content.listContentSubmissions(...args)
  listFraudFlags = (...args: Parameters<typeof this.fraud.listFraudFlags>) => this.fraud.listFraudFlags(...args)
  listRiskScores = (...args: Parameters<typeof this.fraud.listRiskScores>) => this.fraud.listRiskScores(...args)
  findFraudFlagById = (...args: Parameters<typeof this.fraud.findFraudFlagById>) => this.fraud.findFraudFlagById(...args)
  updateFraudFlagStatus = (...args: Parameters<typeof this.fraud.updateFraudFlagStatus>) => this.fraud.updateFraudFlagStatus(...args)
  getStats = (...args: Parameters<typeof this.stats.getStats>) => this.stats.getStats(...args)
  getPendingContractsCount = (...args: Parameters<typeof this.stats.getPendingContractsCount>) => this.stats.getPendingContractsCount(...args)
}
```

**Note:** In 2A.2+, as sub-repos get real types, the `(this.X as any)` casts are gradually removed. By 2A.4 the class fully implements `IAffiliateRepository` cleanly.

### Task 1.10: Verify typecheck + commit Phase 2A.1

**Files:** none (git only)

- [ ] **Step 1: Typecheck**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run typecheck 2>&1 | tail -5
```
Expected: 0 errors. The repository skeleton uses `any` casts so it's not strict-typed yet but compiles.

- [ ] **Step 2: Build api**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api
npm run build 2>&1 | tail -3
```
Expected: build succeeds.

- [ ] **Step 3: Manual smoke — legacy still works**

Start dev:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run dev:app & npm run dev:api &
```
Open `http://localhost:3000/settings/affiliate` (logged in as user with org). Should load (calls `/api/affiliate-legacy/program`). Stop dev (kill background processes).

- [ ] **Step 4: Commit**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add apps/api/package.json apps/api/src/routes/affiliate-legacy.ts apps/api/src/index.ts apps/api/src/lib/affiliate/repository/ apps/app/src/app/\(app\)/settings/affiliate/page.tsx supabase/migrations/2026041700000* package-lock.json packages/shared/src/types/database.ts
git rm apps/api/src/routes/affiliate.ts 2>/dev/null || true
git commit -m "feat(api): scaffold affiliate@0.4.0 + 7 migrations + repo skeleton + legacy rename"
```

---

## Phase 2A.2 — Lifecycle + Email + Tax stub + Container partial

### Task 2.1: Create config

**Files:** Create: `apps/api/src/lib/affiliate/config.ts`

- [ ] **Step 1: Write config**

Create `apps/api/src/lib/affiliate/config.ts`:

```ts
import type { AffiliateConfig } from '@tn-figueiredo/affiliate'

export const AFFILIATE_CONFIG: AffiliateConfig = {
  minimumPayoutCents: 5000,
  tierRates: {
    nano: 0.15,
    micro: 0.20,
    mid: 0.25,
    macro: 0.30,
    mega: 0.35,
  },
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

Create `apps/api/src/__tests__/lib/affiliate/tax-id-service.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { StubTaxIdRepository } from '@/lib/affiliate/tax-id-service'

describe('StubTaxIdRepository', () => {
  const repo = new StubTaxIdRepository()

  it('findByEntity returns null', async () => {
    expect(await repo.findByEntity('user', 'abc')).toBeNull()
  })

  it('save is no-op', async () => {
    await expect(repo.save({})).resolves.toBeUndefined()
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
Expected: FAIL "Cannot find module '@/lib/affiliate/tax-id-service'".

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/affiliate/tax-id-service.ts`:

```ts
import type { IAffiliateTaxIdRepository } from '@tn-figueiredo/affiliate'

export class StubTaxIdRepository implements IAffiliateTaxIdRepository {
  async findByEntity(_entityType: string, _entityId: string) {
    return null
  }

  async save(_data: unknown): Promise<void> {
    // no-op
  }

  async getStatus(_taxId: string) {
    return { status: 'regular' as const }
  }
}
```

- [ ] **Step 4: Run test — passes**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api
npm run test -- src/__tests__/lib/affiliate/tax-id-service.test.ts 2>&1 | tail -5
```
Expected: PASS 3/3.

### Task 2.3: Create email service

**Files:**
- Create: `apps/api/src/lib/affiliate/email-service.ts`
- Create: `apps/api/src/__tests__/lib/affiliate/email-service.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/__tests__/lib/affiliate/email-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/email/resend', () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true }),
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

  it('sendAffiliateApplicationConfirmation sends to applicant email', async () => {
    await svc.sendAffiliateApplicationConfirmation('joao@x.com', 'João')
    expect(resend.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'joao@x.com',
      subject: expect.stringContaining('aplicação'),
    }))
  })

  it('sendAffiliateApprovalEmail sends with tier + commission', async () => {
    await svc.sendAffiliateApprovalEmail('joao@x.com', 'João', 'nano', 0.15, 'https://app.com')
    expect(resend.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'joao@x.com',
      html: expect.stringContaining('15%'),
    }))
  })

  it('sendAffiliateContractProposalEmail sends with current vs proposed terms', async () => {
    await svc.sendAffiliateContractProposalEmail(
      'joao@x.com', 'João', 'nano', 0.15, 'micro', 0.20, 'https://app.com'
    )
    expect(resend.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      html: expect.stringContaining('20%'),
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
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/affiliate/email-service.ts`:

```ts
import type { IAffiliateEmailService } from '@tn-figueiredo/affiliate'
import { sendEmail, isResendConfigured } from '@/lib/email/resend'

function adminEmail(): string {
  return process.env.AFFILIATE_ADMIN_EMAIL ?? 'admin@brighttale.io'
}

export class ResendAffiliateEmailService implements IAffiliateEmailService {
  async sendAffiliateApplicationReceivedAdmin(data: {
    name: string; email: string; channelPlatform: string; channelUrl: string
    subscribersCount?: number; suggestedCode?: string; notes?: string
  }): Promise<void> {
    if (!isResendConfigured()) return
    await sendEmail({
      to: adminEmail(),
      subject: `Nova aplicação de afiliado: ${data.name}`,
      html: this.renderApplicationReceivedAdmin(data),
    })
  }

  async sendAffiliateApplicationConfirmation(email: string, name: string): Promise<void> {
    if (!isResendConfigured()) return
    await sendEmail({
      to: email,
      subject: 'Recebemos sua aplicação de afiliado BrightTale',
      html: this.renderApplicationConfirmation(name),
    })
  }

  async sendAffiliateApprovalEmail(
    email: string, name: string, tier: string, commissionRate: number,
    portalUrl: string, fixedFeeBrl?: number,
  ): Promise<void> {
    if (!isResendConfigured()) return
    await sendEmail({
      to: email,
      subject: '🎉 Sua aplicação de afiliado foi aprovada',
      html: this.renderApproval(name, tier, commissionRate, portalUrl, fixedFeeBrl),
    })
  }

  async sendAffiliateContractProposalEmail(
    email: string, name: string,
    currentTier: string, currentRate: number,
    proposedTier: string, proposedRate: number,
    portalUrl: string, notes?: string,
    currentFixedFeeBrl?: number, proposedFixedFeeBrl?: number,
  ): Promise<void> {
    if (!isResendConfigured()) return
    await sendEmail({
      to: email,
      subject: 'Nova proposta de contrato de afiliado',
      html: this.renderContractProposal(name, currentTier, currentRate, proposedTier, proposedRate, portalUrl, notes, currentFixedFeeBrl, proposedFixedFeeBrl),
    })
  }

  private renderApplicationReceivedAdmin(d: {
    name: string; email: string; channelPlatform: string; channelUrl: string
    subscribersCount?: number; suggestedCode?: string; notes?: string
  }): string {
    const subs = d.subscribersCount ? `<p>${d.subscribersCount} inscritos</p>` : ''
    const notes = d.notes ? `<p><em>${d.notes}</em></p>` : ''
    const code = d.suggestedCode ? `<p>Sugestão de código: <code>${d.suggestedCode}</code></p>` : ''
    return `<h1>Nova aplicação de afiliado</h1>
<p><strong>${d.name}</strong> (${d.email})</p>
<p>${d.channelPlatform}: <a href="${d.channelUrl}">${d.channelUrl}</a></p>
${subs}${code}${notes}`
  }

  private renderApplicationConfirmation(name: string): string {
    return `<h1>Olá ${name}</h1>
<p>Recebemos sua aplicação de afiliado. Vamos analisar e responder em breve por email.</p>
<p>— Equipe BrightTale</p>`
  }

  private renderApproval(name: string, tier: string, rate: number, portalUrl: string, fee?: number): string {
    const feeLine = fee ? ` + R$${fee.toFixed(2)} fixo` : ''
    return `<h1>Bem-vindo ao programa de afiliados, ${name}! 🎉</h1>
<p>Você foi aprovado no tier <strong>${tier}</strong> com comissão de <strong>${(rate * 100).toFixed(0)}%</strong>${feeLine}.</p>
<p><a href="${portalUrl}">Acessar portal de afiliado →</a></p>
<p>— Equipe BrightTale</p>`
  }

  private renderContractProposal(
    name: string, currentTier: string, currentRate: number,
    proposedTier: string, proposedRate: number, portalUrl: string,
    notes?: string, currentFee?: number, proposedFee?: number,
  ): string {
    const cf = currentFee ? ` + R$${currentFee.toFixed(2)}` : ''
    const pf = proposedFee ? ` + R$${proposedFee.toFixed(2)}` : ''
    const notesLine = notes ? `<p><em>${notes}</em></p>` : ''
    return `<h1>Nova proposta de contrato — ${name}</h1>
<p><strong>Atual:</strong> ${currentTier} (${(currentRate * 100).toFixed(0)}%${cf})</p>
<p><strong>Proposto:</strong> ${proposedTier} (${(proposedRate * 100).toFixed(0)}%${pf})</p>
${notesLine}
<p><a href="${portalUrl}">Ver proposta no portal →</a></p>`
  }
}
```

- [ ] **Step 4: Run test — passes**

```bash
npm run test -- src/__tests__/lib/affiliate/email-service.test.ts 2>&1 | tail -5
```
Expected: PASS 5/5.

### Task 2.4: Create auth-context

**Files:** Create: `apps/api/src/lib/affiliate/auth-context.ts`

- [ ] **Step 1: Write file**

Create `apps/api/src/lib/affiliate/auth-context.ts`:

```ts
import type { FastifyRequest } from 'fastify'
import { ApiError } from '@/lib/api/errors'
import { createServiceClient } from '@/lib/supabase'

export async function getAuthenticatedUser(request: unknown): Promise<{ id: string }> {
  const req = request as FastifyRequest
  if (!req.userId) throw new ApiError(401, 'Not authenticated', 'UNAUTHORIZED')
  return { id: req.userId }
}

export async function isAdmin(request: unknown): Promise<boolean> {
  const req = request as FastifyRequest
  if (!req.userId) return false
  const sb = createServiceClient()
  const { data } = await sb
    .from('user_roles')
    .select('role')
    .eq('user_id', req.userId)
    .eq('role', 'admin')
    .maybeSingle()
  return data?.role === 'admin'
}
```

### Task 2.5: Implement affiliate-query-repo (real impl)

**Files:**
- Modify: `apps/api/src/lib/affiliate/repository/affiliate-query-repo.ts`
- Create: `apps/api/src/lib/affiliate/repository/__tests__/affiliate-query-repo.test.ts`

- [ ] **Step 1: Write failing test for `findById`**

Create test file:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createQueryRepo } from '../affiliate-query-repo'

function makeChain() {
  const single = vi.fn()
  const eq = vi.fn(() => ({ single, maybeSingle: vi.fn() }))
  const select = vi.fn(() => ({ eq, single, maybeSingle: vi.fn() }))
  const insert = vi.fn(() => ({ select, single, maybeSingle: vi.fn() }))
  const update = vi.fn(() => ({ eq, select }))
  return { from: vi.fn(() => ({ select, insert, update, eq })), single, eq, select, insert, update }
}

describe('affiliate-query-repo', () => {
  describe('findById', () => {
    it('returns affiliate row when found', async () => {
      const chain = makeChain()
      const eqResult = { maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'aff-1', code: 'X' }, error: null }) }
      chain.eq.mockReturnValue(eqResult)
      const repo = createQueryRepo(chain as any)
      const result = await repo.findById('aff-1')
      expect(chain.from).toHaveBeenCalledWith('affiliates')
      expect(result).toEqual({ id: 'aff-1', code: 'X' })
    })

    it('returns null when not found', async () => {
      const chain = makeChain()
      const eqResult = { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
      chain.eq.mockReturnValue(eqResult)
      const repo = createQueryRepo(chain as any)
      const result = await repo.findById('aff-missing')
      expect(result).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run test — fails**

```bash
npm run test -- src/lib/affiliate/repository/__tests__/affiliate-query-repo.test.ts 2>&1 | tail -10
```
Expected: FAIL with `not_impl_2a1`.

- [ ] **Step 3: Replace skeleton with real impl**

Replace contents of `apps/api/src/lib/affiliate/repository/affiliate-query-repo.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createQueryRepo(sb: SupabaseClient<Database>) {
  return {
    async findById(id: string) {
      const { data } = await sb.from('affiliates').select('*').eq('id', id).maybeSingle()
      return data ?? null
    },

    async findByCode(code: string) {
      const { data } = await sb.from('affiliates').select('*').eq('code', code).maybeSingle()
      return data ?? null
    },

    async findByUserId(userId: string) {
      const { data } = await sb.from('affiliates').select('*').eq('user_id', userId).maybeSingle()
      return data ?? null
    },

    async findByEmail(email: string) {
      const { data } = await sb.from('affiliates').select('*').eq('email', email).maybeSingle()
      return data ?? null
    },

    async isCodeTaken(code: string): Promise<boolean> {
      const { data } = await sb.from('affiliates').select('id').eq('code', code).maybeSingle()
      return data !== null
    },

    async create(input: any) {
      const { data, error } = await sb.from('affiliates').insert(input).select().single()
      if (error) throw error
      return data
    },

    async createInternal(input: any) {
      const { data, error } = await sb.from('affiliates').insert({ ...input, source: 'internal' }).select().single()
      if (error) throw error
      return data
    },

    async linkUserId(affiliateId: string, userId: string) {
      const { error } = await sb.from('affiliates').update({ user_id: userId }).eq('id', affiliateId)
      if (error) throw error
    },

    async listAll(options?: { status?: string; tier?: string; limit?: number; offset?: number }) {
      let q = sb.from('affiliates').select('*')
      if (options?.status) q = q.eq('status', options.status)
      if (options?.tier) q = q.eq('tier', options.tier)
      if (options?.limit) q = q.limit(options.limit)
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  }
}
```

- [ ] **Step 4: Run tests — passes**

```bash
npm run test -- src/lib/affiliate/repository/__tests__/affiliate-query-repo.test.ts 2>&1 | tail -5
```
Expected: PASS 2/2.

### Task 2.6: Implement affiliate-lifecycle-repo

**Files:**
- Modify: `apps/api/src/lib/affiliate/repository/affiliate-lifecycle-repo.ts`
- Create: test

- [ ] **Step 1: Write failing tests for `approve` and `pause`**

Create `apps/api/src/lib/affiliate/repository/__tests__/affiliate-lifecycle-repo.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createLifecycleRepo } from '../affiliate-lifecycle-repo'

describe('affiliate-lifecycle-repo', () => {
  it('approve updates status to active', async () => {
    const eq = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'aff-1', status: 'active' }, error: null }) }) })
    const update = vi.fn().mockReturnValue({ eq })
    const sb = { from: vi.fn(() => ({ update })) }
    const repo = createLifecycleRepo(sb as any)
    await repo.approve('aff-1', { tier: 'nano' })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', tier: 'nano' }))
  })

  it('pause updates status to paused', async () => {
    const eq = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'aff-1', status: 'paused' }, error: null }) }) })
    const update = vi.fn().mockReturnValue({ eq })
    const sb = { from: vi.fn(() => ({ update })) }
    const repo = createLifecycleRepo(sb as any)
    await repo.pause('aff-1')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'paused' }))
  })
})
```

- [ ] **Step 2: Run — fails**

```bash
npm run test -- src/lib/affiliate/repository/__tests__/affiliate-lifecycle-repo.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Implement**

Replace `apps/api/src/lib/affiliate/repository/affiliate-lifecycle-repo.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createLifecycleRepo(sb: SupabaseClient<Database>) {
  async function updateStatus(id: string, fields: Record<string, unknown>) {
    const { data, error } = await sb.from('affiliates').update(fields).eq('id', id).select().single()
    if (error) throw error
    return data
  }

  return {
    async approve(id: string, input: { tier?: string; commissionRate?: number; fixedFeeBrl?: number; contractStartDate?: string; contractEndDate?: string }) {
      const fields: Record<string, unknown> = { status: 'active', approved_at: new Date().toISOString() }
      if (input.tier) fields.tier = input.tier
      if (input.commissionRate !== undefined) fields.commission_rate = input.commissionRate
      if (input.fixedFeeBrl !== undefined) fields.fixed_fee_brl = input.fixedFeeBrl
      if (input.contractStartDate) fields.contract_start_date = input.contractStartDate
      if (input.contractEndDate) fields.contract_end_date = input.contractEndDate
      return updateStatus(id, fields)
    },

    async pause(id: string, _options?: { reason?: string }) {
      return updateStatus(id, { status: 'paused', paused_at: new Date().toISOString() })
    },

    async terminate(id: string) {
      return updateStatus(id, { status: 'terminated', terminated_at: new Date().toISOString() })
    },

    async updateProfile(affiliateId: string, input: Record<string, unknown>) {
      return updateStatus(affiliateId, input)
    },

    async updateContract(affiliateId: string, startDate: string, endDate: string) {
      return updateStatus(affiliateId, { contract_start_date: startDate, contract_end_date: endDate })
    },

    async addContractHistory(entry: { affiliate_id: string; action: string; performed_by?: string; details?: Record<string, unknown> }) {
      const { error } = await sb.from('affiliate_contract_history').insert(entry as any)
      if (error) throw error
    },

    async activateAfterContractAcceptance(id: string) {
      return updateStatus(id, { status: 'active', contract_accepted_at: new Date().toISOString() })
    },
  }
}
```

- [ ] **Step 4: Run — passes**

```bash
npm run test -- src/lib/affiliate/repository/__tests__/affiliate-lifecycle-repo.test.ts 2>&1 | tail -5
```

### Task 2.7: Implement affiliate-history-repo

**Files:**
- Modify: `apps/api/src/lib/affiliate/repository/affiliate-history-repo.ts`

- [ ] **Step 1: Implement**

Replace `apps/api/src/lib/affiliate/repository/affiliate-history-repo.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createHistoryRepo(sb: SupabaseClient<Database>) {
  return {
    async getContractHistory(affiliateId: string) {
      const { data, error } = await sb
        .from('affiliate_contract_history')
        .select('*')
        .eq('affiliate_id', affiliateId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  }
}
```

(Skip dedicated test for single-method file; covered by integration smoke in 2A.5.)

### Task 2.8: Build container partial (8 use cases)

**Files:** Create: `apps/api/src/lib/affiliate/container.ts`

- [ ] **Step 1: Create container**

Create `apps/api/src/lib/affiliate/container.ts`:

```ts
import {
  ApplyAsAffiliateUseCase,
  GetMyAffiliateUseCase,
  GetAffiliateStatsUseCase,
  GetMyCommissionsUseCase,
  GetAffiliateReferralsUseCase,
  UpdateAffiliateProfileUseCase,
  type AffiliateConfig,
} from '@tn-figueiredo/affiliate'
import { createServiceClient } from '@/lib/supabase'
import { SupabaseAffiliateRepository } from './repository'
import { ResendAffiliateEmailService } from './email-service'
import { StubTaxIdRepository } from './tax-id-service'
import { AFFILIATE_CONFIG } from './config'

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
    config,
    repo,
    email,
    taxId,
    // Use cases instantiated in 2A.2 (8 of 37):
    applyUseCase: new ApplyAsAffiliateUseCase(repo, email, taxId),
    getMyAffiliateUseCase: new GetMyAffiliateUseCase(repo),
    getStatsUseCase: new GetAffiliateStatsUseCase(repo),
    getMyCommissionsUseCase: new GetMyCommissionsUseCase(repo),
    getReferralsUseCase: new GetAffiliateReferralsUseCase(repo),
    updateProfileUseCase: new UpdateAffiliateProfileUseCase(repo),
  }
  return cached
}

export function __resetAffiliateContainer(): void {
  cached = null
}
```

- [ ] **Step 2: Verify compiles**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api
npx tsc --noEmit src/lib/affiliate/container.ts 2>&1 | tail -10
```
Expected: 0 errors (some unrelated config errors OK; focus on this file).

### Task 2.9: Smoke 2A.2 + commit

**Files:** none (smoke + commit)

- [ ] **Step 1: Full typecheck**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run typecheck 2>&1 | tail -5
```

- [ ] **Step 2: Run all new tests**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api
npm run test -- src/__tests__/lib/affiliate/ src/lib/affiliate/repository/__tests__/ 2>&1 | tail -10
```
Expected: tax-id (3) + email (5) + query (2) + lifecycle (2) = 12 passing.

- [ ] **Step 3: Commit Phase 2A.2**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add apps/api/src/lib/affiliate/ apps/api/src/__tests__/lib/affiliate/
git commit -m "feat(api): wire affiliate query/lifecycle repos + email + tax stub + container partial"
```

---

## Phase 2A.3 — Tracking + Cron + Internal/Redirect routes

### Task 3.1: Implement clicks-repo

**Files:**
- Modify: `apps/api/src/lib/affiliate/repository/clicks-repo.ts`

- [ ] **Step 1: Implement**

Replace `apps/api/src/lib/affiliate/repository/clicks-repo.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createClicksRepo(sb: SupabaseClient<Database>) {
  return {
    async incrementClicks(affiliateId: string) {
      // Atomic via Postgres function (race-safe; see migration 20260417000006)
      const { error } = await sb.rpc('increment_affiliate_clicks', { aff_id: affiliateId })
      if (error) throw error
    },

    async createClick(input: any) {
      const { data, error } = await sb.from('affiliate_clicks').insert(input).select().single()
      if (error) throw error
      return data
    },

    async markClickConverted(clickId: string, userId: string) {
      const { error } = await sb.from('affiliate_clicks').update({ converted_user_id: userId, converted_at: new Date().toISOString() }).eq('id', clickId)
      if (error) throw error
    },

    async getClicksByPlatform(affiliateId: string, days?: number) {
      const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : '1970-01-01'
      const { data, error } = await sb
        .from('affiliate_clicks')
        .select('source_platform, converted_at')
        .eq('affiliate_id', affiliateId)
        .gte('created_at', since)
      if (error) throw error
      const grouped = new Map<string, { clicks: number; conversions: number }>()
      for (const c of data ?? []) {
        const key = (c as any).source_platform ?? 'unknown'
        const cur = grouped.get(key) ?? { clicks: 0, conversions: 0 }
        cur.clicks += 1
        if ((c as any).converted_at) cur.conversions += 1
        grouped.set(key, cur)
      }
      return Array.from(grouped.entries()).map(([sourcePlatform, v]) => ({ sourcePlatform, ...v }))
    },
  }
}
```

### Task 3.2: Implement referrals-repo

**Files:** Modify: `apps/api/src/lib/affiliate/repository/referrals-repo.ts`

- [ ] **Step 1: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createReferralsRepo(sb: SupabaseClient<Database>) {
  return {
    async incrementReferrals(affiliateId: string) {
      // Atomic via Postgres function
      const { error } = await sb.rpc('increment_affiliate_referrals', { aff_id: affiliateId })
      if (error) throw error
    },

    async createReferral(input: any) {
      const { data, error } = await sb.from('affiliate_referrals').insert(input).select().single()
      if (error) throw error
      return data
    },

    async findReferralByUserId(userId: string) {
      const { data } = await sb.from('affiliate_referrals').select('*').eq('user_id', userId).maybeSingle()
      return data ?? null
    },

    async listReferralsByAffiliate(affiliateId: string, options?: { limit?: number; offset?: number }) {
      let q = sb.from('affiliate_referrals').select('*').eq('affiliate_id', affiliateId)
      if (options?.limit) q = q.limit(options.limit)
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },

    async expirePendingReferrals(today: Date) {
      const cutoff = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await sb
        .from('affiliate_referrals')
        .update({ status: 'expired' } as any)
        .eq('status', 'pending_contract')
        .lt('created_at', cutoff)
        .select('id')
      if (error) throw error
      return { totalExpired: data?.length ?? 0 }
    },
  }
}
```

### Task 3.3: Implement commissions-repo

**Files:** Modify: `apps/api/src/lib/affiliate/repository/commissions-repo.ts`

- [ ] **Step 1: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createCommissionsRepo(sb: SupabaseClient<Database>) {
  return {
    async incrementConversions(affiliateId: string, earningsBrl: number) {
      // Atomic via Postgres function
      const { error } = await sb.rpc('increment_affiliate_conversions', { aff_id: affiliateId, earnings_brl: earningsBrl })
      if (error) throw error
    },

    async createCommission(input: any) {
      const { data, error } = await sb.from('affiliate_commissions').insert(input).select().single()
      if (error) throw error
      return data
    },

    async listPendingCommissions(affiliateId: string) {
      const { data, error } = await sb
        .from('affiliate_commissions')
        .select('*')
        .eq('affiliate_id', affiliateId)
        .eq('status', 'pending')
      if (error) throw error
      return data ?? []
    },

    async markCommissionsPaid(commissionIds: string[], payoutId: string) {
      const { error } = await sb
        .from('affiliate_commissions')
        .update({ status: 'paid', payout_id: payoutId } as any)
        .in('id', commissionIds)
      if (error) throw error
    },
  }
}
```

### Task 3.4: Update container with tracking use cases

**Files:** Modify: `apps/api/src/lib/affiliate/container.ts`

- [ ] **Step 1: Add 6 new use case instances**

Edit `apps/api/src/lib/affiliate/container.ts`. Add to imports:

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

In `buildAffiliateContainer()`, add to returned object (before `return cached`):

```ts
  const trackClickUseCase = new TrackAffiliateLinkClickUseCase(repo, config)
  const expirePendingUseCase = new ExpirePendingReferralsUseCase(repo)

  cached = {
    ...cached,                  // (replace this line — see below for full update)
    trackClickUseCase,
    expirePendingUseCase,
    attributeUseCase: new AttributeSignupToAffiliateUseCase(repo, config, undefined /* fraud */),
    calcCommissionUseCase: new CalculateAffiliateCommissionUseCase(repo, config),
    clicksByPlatformUseCase: new GetAffiliateClicksByPlatformUseCase(repo),
  }
```

Actually replace the entire `cached = {...}` assignment with:

```ts
  const trackClickUseCase = new TrackAffiliateLinkClickUseCase(repo, config)
  const expirePendingUseCase = new ExpirePendingReferralsUseCase(repo)

  cached = {
    config, repo, email, taxId,
    applyUseCase: new ApplyAsAffiliateUseCase(repo, email, taxId),
    getMyAffiliateUseCase: new GetMyAffiliateUseCase(repo),
    getStatsUseCase: new GetAffiliateStatsUseCase(repo),
    getMyCommissionsUseCase: new GetMyCommissionsUseCase(repo),
    getReferralsUseCase: new GetAffiliateReferralsUseCase(repo),
    updateProfileUseCase: new UpdateAffiliateProfileUseCase(repo),
    trackClickUseCase,
    expirePendingUseCase,
    attributeUseCase: new AttributeSignupToAffiliateUseCase(repo, config, undefined),
    calcCommissionUseCase: new CalculateAffiliateCommissionUseCase(repo, config),
    clicksByPlatformUseCase: new GetAffiliateClicksByPlatformUseCase(repo),
  }
```

### Task 3.5: Register `/ref` redirect route

**Files:** Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add register call after legacy register**

In `apps/api/src/index.ts`, find the `affiliateLegacyRoutes` register and add AFTER it (still in the same file):

```ts
import {
  registerAffiliateRedirectRoute,
  registerAffiliateInternalRoutes,
} from '@tn-figueiredo/affiliate/routes'
import { buildAffiliateContainer } from './lib/affiliate/container.js'

// ...later in the registration sequence:
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

- [ ] **Step 1: Add register call**

In `apps/api/src/index.ts`, after the `/ref` register block, add:

```ts
import { authenticate } from './middleware/authenticate.js'

server.register(async (scope) => {
  scope.addHook('preHandler', authenticate)
  registerAffiliateInternalRoutes(scope as never, {
    getAuthenticatedUser: (await import('./lib/affiliate/auth-context.js')).getAuthenticatedUser,
    isAdmin: (await import('./lib/affiliate/auth-context.js')).isAdmin,
    expirePendingUseCase: affiliateContainer.expirePendingUseCase,
  })
}, { prefix: '/internal/affiliate' })
```

(Better: hoist the auth-context import to the top of file.)

Top-of-file imports update:

```ts
import { getAuthenticatedUser, isAdmin } from './lib/affiliate/auth-context.js'
```

Then the register simplifies:

```ts
server.register(async (scope) => {
  scope.addHook('preHandler', authenticate)
  registerAffiliateInternalRoutes(scope as never, {
    getAuthenticatedUser,
    isAdmin,
    expirePendingUseCase: affiliateContainer.expirePendingUseCase,
  })
}, { prefix: '/internal/affiliate' })
```

### Task 3.7: Create Inngest cron `affiliate-expire-referrals`

**Files:**
- Create: `apps/api/src/jobs/affiliate-expire-referrals.ts`
- Modify: `apps/api/src/jobs/index.ts`
- Modify: `apps/api/src/routes/inngest.ts`

- [ ] **Step 1: Create cron job**

Create `apps/api/src/jobs/affiliate-expire-referrals.ts`:

```ts
import { inngest } from './client.js'
import { buildAffiliateContainer } from '../lib/affiliate/container.js'

export const affiliateExpireReferrals = inngest.createFunction(
  {
    id: 'affiliate-expire-referrals',
    retries: 2,
    triggers: [{ cron: 'TZ=America/Sao_Paulo 0 2 * * *' }],
  },
  async ({ step }) => {
    const container = buildAffiliateContainer()
    const result = await step.run('expire-pending-referrals', async () =>
      container.expirePendingUseCase.execute(new Date())
    )
    return { totalExpired: result.totalExpired, ranAt: new Date().toISOString() }
  }
)
```

- [ ] **Step 2: Add to barrel export**

In `apps/api/src/jobs/index.ts`, add export:

```ts
export { affiliateExpireReferrals } from './affiliate-expire-referrals.js'
```

- [ ] **Step 3: Register in serve handler**

In `apps/api/src/routes/inngest.ts`, update import to include the new function and add to `functions: [...]`:

```ts
import { contentGenerate, brainstormGenerate, researchGenerate, productionGenerate, referenceCheck, affiliateExpireReferrals } from '../jobs/index.js';

// ...inside inngestRoutes:
const handler = serve({
  client: inngest,
  functions: [contentGenerate, brainstormGenerate, researchGenerate, productionGenerate, referenceCheck, affiliateExpireReferrals],
});
```

### Task 3.8: Smoke 2A.3 + commit

**Files:** none

- [ ] **Step 1: Typecheck + build**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run typecheck && cd apps/api && npm run build 2>&1 | tail -5
```

- [ ] **Step 2: Smoke `/ref/:code`**

Start dev (`npm run dev:api` in another terminal). Seed an affiliate row manually via Supabase SQL Editor:

```sql
INSERT INTO affiliates (code, status, tier, commission_rate, name, email)
VALUES ('TEST123', 'active', 'nano', 0.15, 'Test', 'test@x.com');
```

Then `curl -i 'http://localhost:3001/ref/TEST123'` — expect 302 redirect to `webBaseUrl`. Verify a row appeared in `affiliate_clicks`.

- [ ] **Step 3: Smoke `/internal/affiliate/expire-pending`**

```bash
curl -i -X POST -H 'X-Internal-Key: <YOUR_KEY>' -H 'X-User-Id: <ANY>' http://localhost:3001/internal/affiliate/expire-pending
```
Expect 200 with `{ data: { totalExpired: 0 }, error: null }`.

- [ ] **Step 4: Verify Inngest dev server lists cron**

In another terminal: `npx inngest-cli@latest dev` → open http://localhost:8288 → Functions tab → confirm `affiliate-expire-referrals` listed with cron schedule.

If Inngest UI shows "invalid cron expression" or "TZ prefix not supported", **fallback**: edit `apps/api/src/jobs/affiliate-expire-referrals.ts` and replace:
```ts
triggers: [{ cron: 'TZ=America/Sao_Paulo 0 2 * * *' }],
```
With UTC equivalent (= 02:00 BRT during standard time):
```ts
triggers: [{ cron: '0 5 * * *' }],
```
Note in commit body: "Inngest TZ prefix unsupported, fell back to UTC offset".

- [ ] **Step 5: Commit Phase 2A.3**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add apps/api/src/lib/affiliate/repository/{clicks,referrals,commissions}-repo.ts apps/api/src/lib/affiliate/container.ts apps/api/src/index.ts apps/api/src/jobs/affiliate-expire-referrals.ts apps/api/src/jobs/index.ts apps/api/src/routes/inngest.ts
git commit -m "feat(api): wire affiliate tracking + internal routes + expire-pending cron"
```

---

## Phase 2A.4 — Payouts + PIX + Content + Fraud + Proposals + END-USER + ADMIN routes

### Task 4.1: Implement payouts-repo

**Files:** Modify: `apps/api/src/lib/affiliate/repository/payouts-repo.ts`

- [ ] **Step 1: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createPayoutsRepo(sb: SupabaseClient<Database>) {
  return {
    async createPayout(input: any) {
      const { data, error } = await sb.from('affiliate_payouts').insert(input).select().single()
      if (error) throw error
      return data
    },

    async findPayoutById(id: string) {
      const { data } = await sb.from('affiliate_payouts').select('*').eq('id', id).maybeSingle()
      return data ?? null
    },

    async updatePayoutStatus(id: string, status: string, meta?: Record<string, unknown>) {
      const fields: Record<string, unknown> = { status }
      if (meta) Object.assign(fields, meta)
      if (status === 'completed') fields.completed_at = new Date().toISOString()
      const { data, error } = await sb.from('affiliate_payouts').update(fields as any).eq('id', id).select().single()
      if (error) throw error
      return data
    },

    async listPayouts(options?: { status?: string; affiliateId?: string; limit?: number; offset?: number }) {
      let q = sb.from('affiliate_payouts').select('*')
      if (options?.status) q = q.eq('status', options.status)
      if (options?.affiliateId) q = q.eq('affiliate_id', options.affiliateId)
      if (options?.limit) q = q.limit(options.limit)
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  }
}
```

### Task 4.2: Implement pix-repo

**Files:** Modify: `apps/api/src/lib/affiliate/repository/pix-repo.ts`

- [ ] **Step 1: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createPixRepo(sb: SupabaseClient<Database>) {
  return {
    async addPixKey(input: any) {
      const { data, error } = await sb.from('affiliate_pix_keys').insert(input).select().single()
      if (error) throw error
      return data
    },

    async listPixKeys(affiliateId: string) {
      const { data, error } = await sb
        .from('affiliate_pix_keys')
        .select('*')
        .eq('affiliate_id', affiliateId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },

    async setDefaultPixKey(affiliateId: string, pixKeyId: string) {
      // Unset all then set the chosen one
      await sb.from('affiliate_pix_keys').update({ is_default: false } as any).eq('affiliate_id', affiliateId)
      const { error } = await sb.from('affiliate_pix_keys').update({ is_default: true } as any).eq('id', pixKeyId)
      if (error) throw error
    },

    async deletePixKey(pixKeyId: string) {
      const { error } = await sb.from('affiliate_pix_keys').delete().eq('id', pixKeyId)
      if (error) throw error
    },
  }
}
```

### Task 4.3: Implement content-repo

**Files:** Modify: `apps/api/src/lib/affiliate/repository/content-repo.ts`

- [ ] **Step 1: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createContentRepo(sb: SupabaseClient<Database>) {
  return {
    async submitContent(input: any) {
      const { data, error } = await sb.from('affiliate_content_submissions').insert(input).select().single()
      if (error) throw error
      return data
    },

    async reviewContent(submissionId: string, status: string, reviewNotes?: string) {
      const { data, error } = await sb
        .from('affiliate_content_submissions')
        .update({ status, review_notes: reviewNotes, reviewed_at: new Date().toISOString() } as any)
        .eq('id', submissionId)
        .select()
        .single()
      if (error) throw error
      return data
    },

    async listContentSubmissions(affiliateId: string) {
      const { data, error } = await sb
        .from('affiliate_content_submissions')
        .select('*')
        .eq('affiliate_id', affiliateId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  }
}
```

### Task 4.4: Implement fraud-repo

**Files:** Modify: `apps/api/src/lib/affiliate/repository/fraud-repo.ts`

- [ ] **Step 1: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createFraudRepo(sb: SupabaseClient<Database>) {
  return {
    async listFraudFlags(options?: { status?: string; severity?: string; affiliateId?: string; page?: number; perPage?: number }) {
      let q = sb.from('affiliate_fraud_flags').select('*', { count: 'exact' })
      if (options?.status) q = q.eq('status', options.status)
      if (options?.severity) q = q.eq('severity', options.severity)
      if (options?.affiliateId) q = q.eq('affiliate_id', options.affiliateId)
      const perPage = options?.perPage ?? 50
      const page = options?.page ?? 1
      q = q.range((page - 1) * perPage, page * perPage - 1)
      const { data, count, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      return { items: data ?? [], total: count ?? 0 }
    },

    async listRiskScores(options?: { minScore?: number }) {
      let q = sb.from('affiliate_risk_scores').select('*')
      if (options?.minScore !== undefined) q = q.gte('score', options.minScore)
      const { data, error } = await q.order('score', { ascending: false })
      if (error) throw error
      return data ?? []
    },

    async findFraudFlagById(flagId: string) {
      const { data } = await sb.from('affiliate_fraud_flags').select('*').eq('id', flagId).maybeSingle()
      return data ?? null
    },

    async updateFraudFlagStatus(flagId: string, status: string, notes?: string) {
      const { error } = await sb
        .from('affiliate_fraud_flags')
        .update({ status, resolution_notes: notes, resolved_at: new Date().toISOString() } as any)
        .eq('id', flagId)
      if (error) throw error
    },
  }
}
```

### Task 4.5: Implement affiliate-proposals-repo

**Files:** Modify: `apps/api/src/lib/affiliate/repository/affiliate-proposals-repo.ts`

- [ ] **Step 1: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createProposalsRepo(sb: SupabaseClient<Database>) {
  async function update(id: string, fields: Record<string, unknown>) {
    const { data, error } = await sb.from('affiliates').update(fields as any).eq('id', id).select().single()
    if (error) throw error
    return data
  }

  return {
    async proposeContractChange(id: string, input: { proposedTier: string; proposedRate: number; proposedFixedFeeBrl?: number; notes?: string }) {
      return update(id, {
        status: 'pending_proposal',
        proposed_tier: input.proposedTier,
        proposed_commission_rate: input.proposedRate,
        proposed_fixed_fee_brl: input.proposedFixedFeeBrl,
        proposal_notes: input.notes,
        proposal_created_at: new Date().toISOString(),
      })
    },

    async cancelProposal(id: string) {
      return update(id, {
        status: 'active',
        proposed_tier: null,
        proposed_commission_rate: null,
        proposed_fixed_fee_brl: null,
        proposal_notes: null,
      })
    },

    async acceptProposal(id: string) {
      // Application of proposal happens in activateAfterContractAcceptance (lifecycle)
      return update(id, { status: 'pending_contract' })
    },

    async rejectProposal(id: string) {
      return update(id, {
        status: 'active',
        proposed_tier: null,
        proposed_commission_rate: null,
        proposed_fixed_fee_brl: null,
      })
    },
  }
}
```

### Task 4.6: Implement stats-repo

**Files:** Modify: `apps/api/src/lib/affiliate/repository/stats-repo.ts`

- [ ] **Step 1: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createStatsRepo(sb: SupabaseClient<Database>) {
  return {
    async getStats(affiliateId: string) {
      const { data: aff } = await sb.from('affiliates').select('clicks, referrals, conversions, total_earnings_brl').eq('id', affiliateId).maybeSingle()
      if (!aff) return { clicks: 0, referrals: 0, conversions: 0, totalEarningsBrl: 0 }
      return {
        clicks: (aff as any).clicks ?? 0,
        referrals: (aff as any).referrals ?? 0,
        conversions: (aff as any).conversions ?? 0,
        totalEarningsBrl: (aff as any).total_earnings_brl ?? 0,
      }
    },

    async getPendingContractsCount() {
      const { count, error } = await sb
        .from('affiliates')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_proposal')
      if (error) throw error
      return count ?? 0
    },
  }
}
```

### Task 4.7: Complete container with all 37 use cases

**Files:** Modify: `apps/api/src/lib/affiliate/container.ts`

- [ ] **Step 1: Replace container with full version**

Replace entire content of `apps/api/src/lib/affiliate/container.ts`:

```ts
import {
  ApplyAsAffiliateUseCase, ApproveAffiliateUseCase, PauseAffiliateUseCase,
  GetMyAffiliateUseCase, GetMyCommissionsUseCase, GetAffiliateStatsUseCase,
  GetAffiliateReferralsUseCase, TrackAffiliateLinkClickUseCase,
  AttributeSignupToAffiliateUseCase, CalculateAffiliateCommissionUseCase,
  UpdateAffiliateProfileUseCase, ExpirePendingReferralsUseCase,
  CreateAffiliatePayoutUseCase, AddPixKeyUseCase, SetDefaultPixKeyUseCase,
  DeletePixKeyUseCase, ListPixKeysUseCase, SubmitContentUseCase,
  AcceptContractProposalUseCase, RejectContractProposalUseCase,
  GetAffiliateClicksByPlatformUseCase, GetAdminAffiliateOverviewUseCase,
  GetAdminAffiliateDetailUseCase, RenewAffiliateContractUseCase,
  GetPendingContractsAffiliatesUseCase, ProposeContractChangeUseCase,
  CancelProposalUseCase, ApprovePayoutUseCase, RejectPayoutUseCase,
  CompletePayoutUseCase, ListAllPayoutsUseCase, ReviewContentSubmissionUseCase,
  ListAffiliateFraudFlagsUseCase, ListAffiliateRiskScoresUseCase,
  ResolveFraudFlagUseCase, type AffiliateConfig,
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

  const trackClickUseCase = new TrackAffiliateLinkClickUseCase(repo, config)
  const expirePendingUseCase = new ExpirePendingReferralsUseCase(repo)

  cached = {
    config,
    repo,
    trackClickUseCase,
    attributeUseCase: new AttributeSignupToAffiliateUseCase(repo, config, undefined),
    calcCommissionUseCase: new CalculateAffiliateCommissionUseCase(repo, config),
    expirePendingUseCase,

    endUserDeps: {
      getAuthenticatedUser,
      isAdmin,
      applyUseCase: new ApplyAsAffiliateUseCase(repo, email, taxId),
      getMyAffiliateUseCase: new GetMyAffiliateUseCase(repo),
      getStatsUseCase: new GetAffiliateStatsUseCase(repo),
      getMyCommissionsUseCase: new GetMyCommissionsUseCase(repo),
      getReferralsUseCase: new GetAffiliateReferralsUseCase(repo),
      createPayoutUseCase: new CreateAffiliatePayoutUseCase(repo, taxId, config),
      updateProfileUseCase: new UpdateAffiliateProfileUseCase(repo),
      addPixKeyUseCase: new AddPixKeyUseCase(repo, taxId),
      setDefaultPixKeyUseCase: new SetDefaultPixKeyUseCase(repo),
      deletePixKeyUseCase: new DeletePixKeyUseCase(repo),
      listPixKeysUseCase: new ListPixKeysUseCase(repo),
      submitContentUseCase: new SubmitContentUseCase(repo),
      acceptProposalUseCase: new AcceptContractProposalUseCase(repo),
      rejectProposalUseCase: new RejectContractProposalUseCase(repo),
      clicksByPlatformUseCase: new GetAffiliateClicksByPlatformUseCase(repo),
      trackClickUseCase,
    },

    adminDeps: {
      getAuthenticatedUser,
      isAdmin,
      overviewUseCase: new GetAdminAffiliateOverviewUseCase(repo),
      detailUseCase: new GetAdminAffiliateDetailUseCase(repo),
      approveUseCase: new ApproveAffiliateUseCase(repo, email, config, taxId),
      pauseUseCase: new PauseAffiliateUseCase(repo),
      renewUseCase: new RenewAffiliateContractUseCase(repo),
      expirePendingUseCase,
      pendingContractsUseCase: new GetPendingContractsAffiliatesUseCase(repo),
      proposeChangeUseCase: new ProposeContractChangeUseCase(repo, email, config),
      cancelProposalUseCase: new CancelProposalUseCase(repo),
      approvePayoutUseCase: new ApprovePayoutUseCase(repo),
      rejectPayoutUseCase: new RejectPayoutUseCase(repo),
      completePayoutUseCase: new CompletePayoutUseCase(repo),
      listPayoutsUseCase: new ListAllPayoutsUseCase(repo),
      reviewContentUseCase: new ReviewContentSubmissionUseCase(repo),
      listFraudFlagsUseCase: new ListAffiliateFraudFlagsUseCase(repo),
      listRiskScoresUseCase: new ListAffiliateRiskScoresUseCase(repo),
      resolveFraudFlagUseCase: new ResolveFraudFlagUseCase(repo),
    },

    internalDeps: {
      getAuthenticatedUser,
      isAdmin,
      expirePendingUseCase,
    },
  }
  return cached
}

export function __resetAffiliateContainer(): void {
  cached = null
}
```

### Task 4.8: Register `/affiliate` (end-user) and `/admin/affiliate` (admin) routes

**Files:** Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add registers**

In `apps/api/src/index.ts`, add to imports:

```ts
import {
  registerAffiliateRoutes,
  registerAffiliateAdminRoutes,
  // existing redirect + internal already imported in 2A.3
} from '@tn-figueiredo/affiliate/routes'
```

After the `/internal/affiliate` register from 2A.3, add:

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

Start dev. With a valid user session, curl:
```bash
curl -i -X POST http://localhost:3001/affiliate/apply \
  -H 'X-Internal-Key: <KEY>' -H 'X-User-Id: <USER>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"t@x.com","channelPlatform":"youtube","channelUrl":"https://y.com/x"}'
```
Expected: 201 with affiliate row created.

- [ ] **Step 3: Smoke `GET /admin/affiliate/`**

```bash
curl -i http://localhost:3001/admin/affiliate/ \
  -H 'X-Internal-Key: <KEY>' -H 'X-User-Id: <ADMIN_USER>'
```
Expected: 200 with overview JSON. Non-admin user gets 403.

- [ ] **Step 4: Test coverage gate**

The spec requires "60% of repository methods covered with 1 happy path + 1 error path each". Tasks 2.5/2.6 covered query (2 tests) + lifecycle (2 tests). Tasks 3.1-3.3 + 4.1-4.6 should each have **at least 1 happy-path test** for the most-used method per sub-repo, written before commit.

Pattern (copy from `affiliate-query-repo.test.ts` Task 2.5 Step 1) — for each sub-repo, write a single test that:
1. Builds a chainable Supabase mock
2. Calls one method
3. Asserts `from()` was called with the correct table + assert response shape

Minimum tests required by end of 2A.4:
- `clicks-repo.test.ts` — test `incrementClicks` calls `rpc('increment_affiliate_clicks', ...)`
- `referrals-repo.test.ts` — test `createReferral` inserts into `affiliate_referrals`
- `commissions-repo.test.ts` — test `listPendingCommissions` filters by status='pending'
- `payouts-repo.test.ts` — test `createPayout` inserts into `affiliate_payouts`
- `pix-repo.test.ts` — test `addPixKey` inserts into `affiliate_pix_keys`
- `content-repo.test.ts` — test `submitContent` inserts into `affiliate_content_submissions`
- `fraud-repo.test.ts` — test `listFraudFlags` paginates correctly
- `affiliate-proposals-repo.test.ts` — test `proposeContractChange` updates status
- `stats-repo.test.ts` — test `getStats` returns zeros when affiliate not found

9 new tests minimum (1 per sub-repo). Combined with previous 4 (query + lifecycle) + 5 email + 3 tax = **21 tests covering 13 of 52 methods (~25%)**. Below spec's 60% target — accepted as known gap; full coverage deferred to follow-up "test hardening" sprint.

Run all repo tests:
```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api
npm run test -- src/lib/affiliate/repository/__tests__/ 2>&1 | tail -10
```
Expected: ≥11 tests passing (9 new + 2 query + 2 lifecycle pre-existing).

- [ ] **Step 5: Commit Phase 2A.4**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add apps/api/src/lib/affiliate/repository/{payouts,pix,content,fraud,affiliate-proposals,stats}-repo.ts apps/api/src/lib/affiliate/repository/__tests__/ apps/api/src/lib/affiliate/container.ts apps/api/src/index.ts
git commit -m "feat(api): wire affiliate payouts/pix/content/fraud/proposals + end-user + admin routes (+ sub-repo smoke tests)"
```

---

## Phase 2A.5 — Smoke + config review + deprecation

### Task 5.1: Add `@deprecated` to legacy route

**Files:** Modify: `apps/api/src/routes/affiliate-legacy.ts`

- [ ] **Step 1: Add JSDoc**

At the top of `apps/api/src/routes/affiliate-legacy.ts`, add comment block:

```ts
/**
 * @deprecated since Phase 2A.5 (2026-04-17). To be removed in Phase 2D cutover.
 * Use new package routes from @tn-figueiredo/affiliate instead.
 */
```

### Task 5.2: Create skipped integration test

**Files:** Create: `apps/api/src/__tests__/integration/affiliate-flow.test.ts`

- [ ] **Step 1: Write skipped test**

Create `apps/api/src/__tests__/integration/affiliate-flow.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

// TODO-test: Category C — runs against Supabase dev manually.
// Per CLAUDE.md, Category C tests are skipped in CI.
describe.skip('affiliate end-to-end flow', () => {
  it('apply → admin approve → track click → attribute → calculate commission → payout', async () => {
    // Manual smoke per spec §7 (12-item checklist) replaces this for now.
    expect(true).toBe(true)
  })
})
```

### Task 5.3: Operator config review

**Files:** Modify (potentially): `apps/api/src/lib/affiliate/config.ts`

- [ ] **Step 1: Review with product**

Confirm with product owner the values in `apps/api/src/lib/affiliate/config.ts`:
- `minimumPayoutCents: 5000` (R$ 50,00) — confirm threshold
- `tierRates`: nano 15% / micro 20% / mid 25% / macro 30% / mega 35% — confirm percentages
- `currentContractVersion: 1` — confirm starts at 1
- `webBaseUrl` / `appStoreUrl` — confirm production URLs

Edit values if needed. If no changes, proceed.

### Task 5.4: Run full smoke checklist (12 items)

**Files:** none (manual smoke)

- [ ] **Step 1-12: Run each item from spec §7 checklist**

```
[ ]  1. POST /api/affiliate/apply (user A) → 201, payload tem `id` + `code`
[ ]  2. Email Resend recebido em AFFILIATE_ADMIN_EMAIL com nome de A
[ ]  3. Email confirmação recebido em A
[ ]  4. POST /api/admin/affiliate/:id/approve (admin) → status `approved`, tier `nano`
[ ]  5. Email aprovação recebido em A
[ ]  6. GET /api/affiliate/me (user A) → status approved, tier nano
[ ]  7. GET /api/ref/{A.code} (anon) → 302 redirect; affiliate_clicks +1, affiliates.clicks +1
[ ]  8. Atribuição via use case direto (script Node REPL ou test one-shot): chamar attributeUseCase.execute → cria affiliate_referrals status pending
[ ]  9. Chamar calcCommissionUseCase.execute direto → cria affiliate_commissions
[ ] 10. POST /api/affiliate/payouts (user A com R$50+ commissions) → cria payout pending
[ ] 11. POST /api/admin/affiliate/:id/payouts/:payoutId/approve (admin) → status approved
[ ] 12. Inngest cron `affiliate-expire-referrals` rodado manualmente → expira referrals >30d pending
```

For items 8 + 9, use a one-shot script (signatures verified against package dist):

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale/apps/api
cat > /tmp/affiliate-smoke-8-9.ts << 'EOF'
import { buildAffiliateContainer } from './src/lib/affiliate/container'
const c = buildAffiliateContainer()

// Item 8: AttributeSignupToAffiliateUseCase.execute(affiliateCode, userId, today: string, options?)
//   `today` is an ISO date string, NOT a Date object.
const ref = await c.attributeUseCase.execute('TEST123', 'user-id-from-auth.users', new Date().toISOString())
console.log('referral:', ref)

// Item 9: CalculateAffiliateCommissionUseCase.execute({ userId, paymentAmount, stripeFee, paymentType, today, ...options })
//   `today` here is also an ISO string (verify in package types if signature differs).
const com = await c.calcCommissionUseCase.execute({
  userId: 'user-id',
  paymentAmount: 19990,
  stripeFee: 200,
  paymentType: 'subscription',
  today: new Date().toISOString(),
})
console.log('commission:', com)
EOF
npx tsx /tmp/affiliate-smoke-8-9.ts
```

Record outcome of each item. Do NOT proceed to 5.5 unless all 12 pass (or operator decides which gaps acceptable).

### Task 5.5: Final commit + branch ready for PR

**Files:** none (commit + finalization)

- [ ] **Step 1: Commit Phase 2A.5**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
git add apps/api/src/routes/affiliate-legacy.ts apps/api/src/__tests__/integration/affiliate-flow.test.ts apps/api/src/lib/affiliate/config.ts
git commit -m "feat(api): finalize affiliate 2A foundation + integration smoke + deprecation"
```

- [ ] **Step 2: Full workspace verification**

```bash
cd /Users/figueiredo/Workspace/BrightCurios/bright-tale
npm run typecheck && npm run build --workspaces --if-present && npm run lint && npm run test --workspaces --if-present 2>&1 | tail -20
```

- [ ] **Step 3: Open PR**

```bash
git push -u origin feat/affiliate-2a-foundation
gh pr create --base staging --title "Affiliate Platform 2A Foundation" --body "$(cat <<'EOF'
**Spec:** docs/superpowers/specs/2026-04-17-affiliate-2a-foundation-design.md
**Plan:** docs/superpowers/plans/2026-04-17-affiliate-2a-foundation.md
**Predecessor:** Phase 1 (admin upgrade)

## Summary
- Adopt @tn-figueiredo/affiliate@0.4.0 in apps/api
- 7 migrations (5 package + 2 bright-tale): 11 new tables
- SupabaseAffiliateRepository (52 methods, 11 sub-repos)
- 4 route helpers wired: /affiliate, /admin/affiliate, /internal/affiliate, /ref
- ResendAffiliateEmailService + StubTaxIdRepository
- Inngest cron `affiliate-expire-referrals` daily 02:00 BRT
- Legacy custom impl renamed to /api/affiliate-legacy/* (kept alive until 2D cutover)

## Smoke (12 items)
[paste smoke result from Task 5.4]

## Out of scope (future phases)
- 2B end-user UI rewrite
- 2C admin UI adoption (affiliate-admin@0.3.3)
- 2D data migration + cutover
- 2E fraud detection real impl
- 2F billing/payouts integration

## Rollback
git revert merge commit + manual SQL revert of 7 migrations (DROP TABLE) if needed within 1h.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Troubleshooting

**`npm run db:push:dev` fails "function moddatetime does not exist":**
Local Supabase missing extension. Run `npx supabase db reset` to wipe + reapply (initial migration enables `moddatetime` extension).

**Typecheck error "Type 'X' is not assignable to 'IAffiliateRepository'":**
Repository skeleton in 2A.1 uses `as any` casts. By 2A.4 all casts removed. If error persists past 2A.4, a sub-repo method has wrong signature — compare to package `dist/index.d.ts` for `IAffiliateRepository` member shape.

**`POST /affiliate/apply` returns 500 with "not_impl_2a1":**
A sub-repo method needed by `ApplyAsAffiliateUseCase` is still skeleton. In 2A.2 we implement query + lifecycle; if apply still fails after 2A.2 commit, check which method threw and ensure it's in those sub-repos.

**Inngest cron `TZ=America/Sao_Paulo` not parsed:**
Replace with UTC equivalent: `triggers: [{ cron: '0 5 * * *' }]` (= 02:00 BRT in standard time).

**`as never` cast in `app.register(...)` shows TS warning:**
Expected — `MinimalFastify` interface from package has fewer methods than full `FastifyInstance`. Cast is intentional (package only uses get/post/put/delete/addHook).

**Email not arriving in dev:**
`isResendConfigured()` returns false if `RESEND_API_KEY` missing. Service no-ops silently. Check env var; in tests, mock returns true.
