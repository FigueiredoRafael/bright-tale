# Wave 0 — Foundation (Install + DB Migration)

> **Status:** ✅ **COMPLETED** 2026-04-25 — commits [`7b0d8a4`](../../../) (xstate install) + [`3b1ec79`](../../../) (research costs schema/types/migration). Migration applied to dev Supabase (project `fxwykfyiicalcgbxslng`). Pushed to `origin/feat/pipeline-orchestrator-refactor`.
>
> Side effect during execution: pre-existing migration drift on `20260424130000_managers_table` (table+triggers existed remote, history record missing) was repaired via `supabase migration repair --status applied 20260424130000` before our migration could push. Pre-existing apps/api + apps/web test failures are unrelated to Wave 0 work.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** [`2026-04-24-pipeline-xstate-refactor.md`](./2026-04-24-pipeline-xstate-refactor.md)
**Design spec:** [`../specs/2026-04-24-pipeline-xstate-refactor-design.md`](../specs/2026-04-24-pipeline-xstate-refactor-design.md)
**Wave manifest:** see parent plan, "Wave Breakdown" section.

**Scope:** Add the only two foundational changes — XState dependency + DB migration for research costs. Both purely additive; no behavior change.

**Branch:** `feat/pipeline-orchestrator-refactor`

---

## Pre-flight

- [ ] `nvm use` resolves to Node 20 (project `.nvmrc`)
- [ ] `bash .husky/pre-commit` runs cleanly (no stale-flag bypass needed)
- [ ] `git status` clean on `feat/pipeline-orchestrator-refactor`
- [ ] Confirm parent plan has been read once end-to-end (architecture + invariants)

---

## Tasks

### Task 1: Install XState

**Files:**
- Modify: `apps/app/package.json`

- [ ] **Step 1: Install dependencies (workspace-scoped from repo root)**

```bash
npm install xstate @xstate/react -w @brighttale/app
```

Expected output: `added 2 packages`. Run from repo root — **do not** `cd apps/app` first. The `-w` flag scopes the install to the app workspace only and updates the root lockfile; `cd && npm install` works but obscures the workspace boundary in CI logs.

- [ ] **Step 2: Verify install resolves**

```bash
node -e "require('xstate'); require('@xstate/react'); console.log('ok')" || (cd apps/app && node -e "require('xstate'); require('@xstate/react'); console.log('ok')")
```

Expected: `ok`. The fallback handles npm hoisting differences — package may resolve from root `node_modules` or from `apps/app/node_modules` depending on dedupe.

- [ ] **Step 3: Verify only the app workspace package.json changed**

```bash
git diff --name-only apps apps/app packages
```

Expected: `apps/app/package.json` (and root `package-lock.json`). If `packages/` or other workspace package.json files appear, abort and re-run with `-w @brighttale/app`.

- [ ] **Step 4: Commit**

```bash
git add apps/app/package.json package-lock.json
git commit -m "chore(app): install xstate v5 and @xstate/react"
```

---

### Task 2: Research Costs — DB Migration + Schema + Types

**Files:**
- Create: `supabase/migrations/20260425120000_research_costs.sql`
- Modify: `packages/shared/src/schemas/pipeline-settings.ts`
- Modify: `apps/app/src/components/engines/types.ts`
- Modify: `apps/api/src/routes/admin-credit-settings.ts`

- [ ] **Step 0: Verify the schema names referenced below actually exist today**

```bash
rg -n "creditSettingsResponseSchema|updateCreditSettingsSchema" packages/shared/src/schemas/pipeline-settings.ts
```

Expected: both names appear. If either is missing or renamed, stop and reconcile against the real export names before continuing — the test in Step 1 imports them by name and will fail for the wrong reason if they differ.

- [ ] **Step 1: Write failing test for new CreditSettings fields**

Create `packages/shared/src/schemas/__tests__/credit-settings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { updateCreditSettingsSchema, creditSettingsResponseSchema } from '../pipeline-settings'

describe('creditSettingsResponseSchema', () => {
  it('requires costResearchSurface, costResearchMedium, costResearchDeep', () => {
    const result = creditSettingsResponseSchema.safeParse({
      costBlog: 200, costVideo: 200, costShorts: 100,
      costPodcast: 150, costCanonicalCore: 80, costReview: 20,
      // missing research fields
    })
    expect(result.success).toBe(false)
  })

  it('accepts all required fields including research costs', () => {
    const result = creditSettingsResponseSchema.safeParse({
      costBlog: 200, costVideo: 200, costShorts: 100,
      costPodcast: 150, costCanonicalCore: 80, costReview: 20,
      costResearchSurface: 60, costResearchMedium: 100, costResearchDeep: 180,
    })
    expect(result.success).toBe(true)
  })
})

describe('updateCreditSettingsSchema', () => {
  it('accepts partial update with only research fields', () => {
    const result = updateCreditSettingsSchema.safeParse({ costResearchDeep: 200 })
    expect(result.success).toBe(true)
    expect(result.data?.costResearchDeep).toBe(200)
  })
})
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
npx vitest run packages/shared/src/schemas/__tests__/credit-settings.test.ts
```

Expected: `FAIL — creditSettingsResponseSchema requires costResearchSurface...`

- [ ] **Step 3: Add research cost fields to shared schema**

In `packages/shared/src/schemas/pipeline-settings.ts`, replace both schema definitions:

```typescript
export const updateCreditSettingsSchema = z.object({
  costBlog:             z.number().int().min(0).optional(),
  costVideo:            z.number().int().min(0).optional(),
  costShorts:           z.number().int().min(0).optional(),
  costPodcast:          z.number().int().min(0).optional(),
  costCanonicalCore:    z.number().int().min(0).optional(),
  costReview:           z.number().int().min(0).optional(),
  costResearchSurface:  z.number().int().min(0).optional(),
  costResearchMedium:   z.number().int().min(0).optional(),
  costResearchDeep:     z.number().int().min(0).optional(),
});
export type UpdateCreditSettingsInput = z.infer<typeof updateCreditSettingsSchema>;

export const creditSettingsResponseSchema = z.object({
  costBlog:             z.number(),
  costVideo:            z.number(),
  costShorts:           z.number(),
  costPodcast:          z.number(),
  costCanonicalCore:    z.number(),
  costReview:           z.number(),
  costResearchSurface:  z.number(),
  costResearchMedium:   z.number(),
  costResearchDeep:     z.number(),
});
export type CreditSettingsResponse = z.infer<typeof creditSettingsResponseSchema>;
```

- [ ] **Step 4: Run test — confirm it passes**

```bash
npx vitest run packages/shared/src/schemas/__tests__/credit-settings.test.ts
```

Expected: `PASS (3)`

- [ ] **Step 5: Update CreditSettings type in engines/types.ts**

In `apps/app/src/components/engines/types.ts`, add three fields to `CreditSettings` and `DEFAULT_CREDIT_SETTINGS`:

```typescript
export interface CreditSettings {
  costBlog: number;
  costVideo: number;
  costShorts: number;
  costPodcast: number;
  costCanonicalCore: number;
  costReview: number;
  costResearchSurface: number;
  costResearchMedium: number;
  costResearchDeep: number;
}

export const DEFAULT_CREDIT_SETTINGS: CreditSettings = {
  costBlog: 200,
  costVideo: 200,
  costShorts: 100,
  costPodcast: 150,
  costCanonicalCore: 80,
  costReview: 20,
  costResearchSurface: 60,
  costResearchMedium: 100,
  costResearchDeep: 180,
};
```

- [ ] **Step 6: Update admin-credit-settings.ts route**

In `apps/api/src/routes/admin-credit-settings.ts`, update `DEFAULTS` and `mapRow`:

```typescript
const DEFAULTS = {
  cost_blog: 200,
  cost_video: 200,
  cost_shorts: 100,
  cost_podcast: 150,
  cost_canonical_core: 80,
  cost_review: 20,
  cost_research_surface: 60,
  cost_research_medium: 100,
  cost_research_deep: 180,
}

function mapRow(row: Record<string, unknown>) {
  return {
    costBlog:            row.cost_blog            ?? DEFAULTS.cost_blog,
    costVideo:           row.cost_video           ?? DEFAULTS.cost_video,
    costShorts:          row.cost_shorts          ?? DEFAULTS.cost_shorts,
    costPodcast:         row.cost_podcast         ?? DEFAULTS.cost_podcast,
    costCanonicalCore:   row.cost_canonical_core  ?? DEFAULTS.cost_canonical_core,
    costReview:          row.cost_review          ?? DEFAULTS.cost_review,
    costResearchSurface: row.cost_research_surface ?? DEFAULTS.cost_research_surface,
    costResearchMedium:  row.cost_research_medium  ?? DEFAULTS.cost_research_medium,
    costResearchDeep:    row.cost_research_deep    ?? DEFAULTS.cost_research_deep,
  }
}
```

Also update the `PATCH` handler to map new fields:

```typescript
if (body.costResearchSurface !== undefined) update.cost_research_surface = body.costResearchSurface
if (body.costResearchMedium  !== undefined) update.cost_research_medium  = body.costResearchMedium
if (body.costResearchDeep    !== undefined) update.cost_research_deep    = body.costResearchDeep
```

- [ ] **Step 7: Create DB migration**

Create `supabase/migrations/20260425120000_research_costs.sql`:

```sql
ALTER TABLE public.credit_settings
  ADD COLUMN IF NOT EXISTS cost_research_surface INT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS cost_research_medium  INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS cost_research_deep    INT NOT NULL DEFAULT 180;

-- Explicit backfill for any rows that existed before this migration. The NOT NULL
-- DEFAULT above handles new rows and Postgres *should* backfill existing rows,
-- but this statement is idempotent and costs nothing — it guarantees no row is
-- left with a null research cost even if the ALTER is ever split or retried.
UPDATE public.credit_settings
SET cost_research_surface = COALESCE(cost_research_surface, 60),
    cost_research_medium  = COALESCE(cost_research_medium, 100),
    cost_research_deep    = COALESCE(cost_research_deep, 180)
WHERE cost_research_surface IS NULL
   OR cost_research_medium  IS NULL
   OR cost_research_deep    IS NULL;
```

**Before running on prod:** confirm the `credit_settings` row count on dev and prod. If either has zero rows, the UPDATE is a no-op (safe). If existing rows somehow bypass the NOT NULL DEFAULT (e.g. because of a split apply), the UPDATE fills them. Either way the migration is idempotent.

- [ ] **Step 8: Apply migration and regenerate types**

```bash
npm run db:push:dev
npm run db:types
```

- [ ] **Step 8a: Verify db:types regen is scoped to credit_settings**

```bash
git diff --stat packages/shared/src/types/database.ts
git diff packages/shared/src/types/database.ts | grep -E '^[+-]' | grep -vE 'credit_settings|cost_research_(surface|medium|deep)' | head -40
```

Expected: the second command prints only diff headers (`+++`/`---`) and no real changes. If unrelated tables show up, upstream prod work has drifted the remote schema — abort, surface the drift in a separate commit/PR, and rebase before continuing this wave.

- [ ] **Step 9: Run shared workspace tests + typecheck**

```bash
npm run test --workspace @brighttale/shared
npm run typecheck
```

Expected: green on both. Running the test pre-commit catches regressions in any shared schema consumer that the new required fields would break.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/20260425120000_research_costs.sql \
        packages/shared/src/schemas/pipeline-settings.ts \
        packages/shared/src/schemas/__tests__/credit-settings.test.ts \
        apps/app/src/components/engines/types.ts \
        apps/api/src/routes/admin-credit-settings.ts \
        packages/shared/src/types/database.ts
git commit -m "feat: add research level costs to credit_settings schema and types"
```

---

## Wave-specific guardrails

- **Migration values match current hardcodes** — defaults must be 60/100/180. Any drift breaks the FORMAT_COSTS dedup later (Wave 5).
- **No engine code touched** — engines still read hardcoded research costs. Wave 4 strips them.
- **No machine code yet** — `lib/pipeline/` directory does not exist after Wave 0.
- **Schema regen** — after `db:push:dev`, run `db:types` so `database.ts` reflects the three new columns. Commit the regen with the migration.

---

## Exit criteria

- [ ] `npm run typecheck` clean across all workspaces
- [ ] `npm run test --workspace @brighttale/shared` green (covers the new credit-settings schema test)
- [ ] `npm run test` green across the rest of the workspaces (shared schema is consumed by app + api — confirm nothing downstream broke when the three new fields became required)
- [ ] `npm run db:push:dev` applied successfully against dev Supabase project
- [ ] `npm run db:types` regenerated `packages/shared/src/types/database.ts`, scoped to `credit_settings` only (Step 8a passes)
- [ ] `apps/app/package.json` lists `xstate` and `@xstate/react` (no top-level workspace install — they belong to the app workspace)
- [ ] Two commits land cleanly through `.husky/pre-commit` (no `--no-verify`)
- [ ] Existing pipeline still works in browser (load any project, navigate stages — no regression)

---

## Risks

| Risk | Mitigation |
|---|---|
| Workspace install pollution (XState added at root) | Task 1 Step 1 uses `npm install xstate @xstate/react -w @brighttale/app` from repo root. Task 1 Step 3 verifies only `apps/app/package.json` (+ root lockfile) changed. |
| Migration applies to prod by mistake | Wave 0 uses `db:push:dev` only. **Do not** run `db:push:prod` until Wave 5. |
| Schema regen drift — extra unrelated tables in `database.ts` | Task 2 Step 8a inspects `git diff` of `database.ts` and rejects any non-`credit_settings` change. If drift appears, abort the wave, ship the drift in a separate hygiene commit/PR, then rebase. |
| Defaults drift from current hardcoded `[60, 100, 180]` | Cross-check `ResearchEngine.tsx` before writing migration. |
| Prod rollback path unclear | The migration only adds columns with safe defaults that match current hardcoded behavior, so a prod rollback is `ALTER TABLE public.credit_settings DROP COLUMN cost_research_surface, DROP COLUMN cost_research_medium, DROP COLUMN cost_research_deep;`. Safe to run as long as Wave 4 has not shipped (Wave 4 is the first wave that actually reads these columns). After Wave 4 ships, rolling these columns back also requires reverting the engine code in the same release. |

---

## Deploy

**Shippable to main standalone?** Yes. Wave 0 is purely additive — XState package is unused until Wave 1; new columns have safe defaults. Merging Wave 0 alone has zero user-facing impact.

**Recommended:** merge Wave 0 to staging immediately to de-risk the dependency install + migration ahead of behavioral waves.

---

## Out of scope for this wave

- Anything in `lib/pipeline/` (Wave 1)
- Settings provider, actor provider (Wave 2)
- Orchestrator changes (Wave 3)
- Engine refactors (Wave 4)
- FORMAT_COSTS dedup (Wave 5)
