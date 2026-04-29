# Pipeline Autopilot Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-flight `TOGGLE_AUTO_PILOT` toggle with an upfront wizard (mode + per-stage config), add reusable autopilot templates, an Overview dashboard, and an end-to-end abort path that settles within seconds.

**Architecture:** Adds a top-level `setup` state to `pipelineMachine`; wizard captures a frozen `AutopilotConfig` snapshot on `SETUP_COMPLETE`; orchestrator selects between wizard / overview / engine render branches; abort flag on `projects.abort_requested_at` is polled (3s) and propagates to engine `AbortController`s and Inngest `step.run` boundaries via `assertNotAborted`.

**Tech Stack:** Next.js 16 (App Router), XState v5, Fastify-style Route Handlers, Supabase (service_role), Zod, react-hook-form, shadcn/ui, Inngest, Vitest.

**Source spec:** `docs/superpowers/specs/2026-04-28-pipeline-autopilot-wizard-design.md`

**Deploy gating:**
- Waves 0–4 ship as backend-only deploys.
- **Waves 5+6+7+8 must deploy together** in one release — legacy projects need machine + UI consumers in lockstep.
- Wave 9 (cleanup) ships after acceptance.

---

## File Structure

### Created
- `supabase/migrations/20260428100000_content_drafts_paused_status.sql` — adds `'paused'` to status CHECK (Wave 0).
- `supabase/migrations/20260428100001_provider_local_to_ollama.sql` — renames `'local'` → `'ollama'` in `ai_provider_configs` (Wave 0).
- `supabase/migrations/20260428100002_pipeline_settings_provider_extension.sql` — extends `default_providers_json` with `canonicalCore` + `assets` (Wave 0).
- `supabase/migrations/20260428100003_autopilot_templates.sql` — `autopilot_templates` table + `clear_autopilot_default()` RPC (Wave 1).
- `supabase/migrations/20260428100004_projects_autopilot_columns.sql` — `projects.{channel_id, mode, autopilot_config_json, autopilot_template_id, abort_requested_at}` + backfill (Wave 1, depends on autopilot_templates).
- `supabase/migrations/20260428200000_drop_auto_advance.sql` — Wave 9 cleanup.
- `packages/shared/src/schemas/autopilotConfig.ts` — `autopilotConfigSchema`, `autopilotConfigPatchSchema`.
- `packages/shared/src/schemas/projectSetup.ts` — `setupProjectSchema`, `startStageSchema`.
- `packages/shared/src/schemas/autopilotTemplates.ts` — CRUD payload schemas.
- `apps/api/src/lib/projects/ownership.ts` — `assertProjectOwner`.
- `apps/api/src/lib/pipeline-state.ts` — `derivedFromStageResults`, `nextStageAfter`.
- `apps/api/src/lib/ai/stageMapping.ts` — `AGENT_FOR_AUTOPILOT_STAGE`.
- `apps/api/src/lib/ai/resolveProvider.ts` — `resolveStageProvider`.
- `apps/api/src/lib/ai/abortable.ts` — `assertNotAborted`, `JobAborted`, `sleepCancellable`.
- `apps/api/src/routes/project-setup.ts` — `POST /api/projects/:id/setup`, `PATCH/DELETE /api/projects/:id/abort`.
- `apps/api/src/routes/autopilot-templates.ts` — `GET/POST/PUT/DELETE /api/autopilot-templates`.
- `apps/app/src/components/pipeline/PipelineWizard.tsx` — main wizard UI.
- `apps/app/src/components/pipeline/MiniWizardSheet.tsx` — mid-flow `GO_AUTOPILOT` UI.
- `apps/app/src/components/pipeline/PipelineOverview.tsx` — overview dashboard.
- `apps/app/src/components/pipeline/OverviewProgressRail.tsx` — left rail.
- `apps/app/src/components/pipeline/OverviewStageResults.tsx` — right column.
- `apps/app/src/components/pipeline/PickChannelModal.tsx` — legacy NULL channel modal.
- `apps/app/src/components/pipeline/PipelineAbortProvider.tsx` — polling abort signal source.
- `apps/app/src/lib/pipeline/deepMergeAutopilotConfig.ts` — template-load + form-edit helper.
- `apps/app/src/app/channels/[id]/autopilot-templates/page.tsx` — templates admin UI.
- `docs/superpowers/specs/2026-04-28-test-baseline.txt` — Wave 0 entry pinned baseline.

### Modified
- `packages/shared/src/schemas/ai.ts` — `aiProviderSchema` to `['openai','anthropic','gemini','ollama']`; add `aiProviderSchemaWithAlias`.
- `packages/shared/src/schemas/index.ts` — export new schemas.
- `packages/shared/src/types/database.ts` — regenerate after migrations.
- `packages/shared/src/mappers/db.ts` — add mappers for new project columns + autopilot_templates.
- `apps/api/src/lib/ai/provider.ts` — `GenerateContentParams` adds `signal?: AbortSignal`.
- `apps/api/src/lib/ai/router.ts` — thread `signal` through `generateWithFallback`; cancellable retry sleep.
- `apps/api/src/lib/ai/providers/{openai,anthropic,gemini,ollama,mock}.ts` — pass `signal` to `fetch`.
- `apps/api/src/jobs/{brainstorm-generate,research-generate,production-generate,production-produce,content-generate}.ts` — `assertNotAborted` between every `step.run`; `JobAborted` exit path.
- `apps/api/src/jobs/emitter.ts` — add `'aborted'` to `JobStage` union.
- `apps/api/src/jobs/index.ts` — register new abort plumbing imports.
- `apps/api/src/routes/inngest.ts` / route registry — register new routes.
- `apps/api/src/routes/content-drafts.ts` — accept `'paused'` in status filters/responses.
- `apps/app/src/lib/pipeline/machine.ts` — new `setup` state, events, guards, actions, `abortRequester` actor.
- `apps/app/src/lib/pipeline/machine.types.ts` — new context fields, events.
- `apps/app/src/lib/pipeline/legacy-state-migration.ts` — `mapLegacyToSnapshot`, tri-mode `normalizeMode`.
- `apps/app/src/components/pipeline/PipelineOrchestrator.tsx` — render branches for setup / overview / engine; remove `TOGGLE_AUTO_PILOT` button site.
- `apps/app/src/components/pipeline/AutoModeControls.tsx` / `PipelineStages.tsx` — replace `toggleMode` with `GO_AUTOPILOT` / `Reconfigure...`.
- `apps/app/src/components/engines/{Brainstorm,Research,Draft,Review,Assets,Preview,Publish}Engine.tsx` — consume `usePipelineAbort()` controller.
- `apps/app/src/components/generation/GenerationProgressFloat.tsx` / `GenerationProgressModal.tsx` — handle `'aborted'` job stage.
- `apps/app/src/components/pipeline/CompletedStageSummary.tsx` — handle Skipped review state.
- `CLAUDE.md` — Wave 9: replace stray "Route Handlers" wording with Fastify references.
- `.claude/rules/api-routes.md` — document `assertProjectOwner` ownership rule (Wave 9).

---

## Wave 0 — Baseline pin + non-breaking schema/data prep

> **Deploy:** Backend-only, ships independently.

### Task 0.1: Pin the test baseline

**Files:**
- Create: `docs/superpowers/specs/2026-04-28-test-baseline.txt`

- [ ] **Step 1: Run the full test suite and capture failures**

```bash
npm run test 2>&1 | tee /tmp/test-baseline.log
```

- [ ] **Step 2: Extract failing test ids into the baseline file**

```bash
# Vitest 4 output: failure lines start with " FAIL ", "❯ ", or "×". Adjust pattern
# if your local output format differs (some terminals strip ANSI; some CI runners
# prefix with workspace name).
grep -E '^( FAIL |❯ |×)' /tmp/test-baseline.log > docs/superpowers/specs/2026-04-28-test-baseline.txt
```

- [ ] **Step 3: Sanity-check the baseline matches expected counts**

```bash
wc -l docs/superpowers/specs/2026-04-28-test-baseline.txt
grep -c 'apps/api/src/__tests__/routes/' docs/superpowers/specs/2026-04-28-test-baseline.txt
grep -c 'apps/web/src/lib/auth/__tests__/admin-actions' docs/superpowers/specs/2026-04-28-test-baseline.txt
```

Expected (per memory `project_preexisting_test_failures.md`): total ≈ 60; ~56 in `apps/api/src/__tests__/routes/`; 3 in `apps/web` admin-actions.

If counts differ by more than ±20%, the grep pattern likely missed a Vitest output variant — inspect `/tmp/test-baseline.log` manually and tune the pattern (try adding `^FAIL ` without leading space, or `^ ✗ `) before continuing.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-28-test-baseline.txt
git commit -m "chore(test): pin pre-wizard test baseline"
```

### Task 0.2: Add `'paused'` to `content_drafts.status` CHECK

**Files:**
- Create: `supabase/migrations/20260428100000_content_drafts_paused_status.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add 'paused' to content_drafts.status. Wave 4 abort path writes this status
-- when an Inngest job exits early via JobAborted.
alter table content_drafts
  drop constraint if exists content_drafts_status_check;

alter table content_drafts
  add constraint content_drafts_status_check
  check (status in (
    'draft', 'in_review', 'approved', 'scheduled',
    'published', 'failed', 'awaiting_manual', 'publishing',
    'paused'
  ));
```

- [ ] **Step 2: Apply locally**

Run: `npm run db:push:dev`
Expected: migration succeeds.

- [ ] **Step 3: Smoke check**

```sql
-- via supabase CLI psql
update content_drafts set status = 'paused' where id = '<any-test-id>' returning status;
```

Expected: row updates to `'paused'`. Revert manually after check.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260428100000_content_drafts_paused_status.sql
git commit -m "feat(db): allow 'paused' status on content_drafts"
```

### Task 0.3: Rename `'local'` → `'ollama'` in `ai_provider_configs`

**Files:**
- Create: `supabase/migrations/20260428100001_provider_local_to_ollama.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Unify provider enum with router code: 'local' is only the router tier name;
-- the runtime provider is 'ollama'. Wave 0 alias window keeps client payloads
-- accepting 'local' via aiProviderSchemaWithAlias until Wave 9.
update ai_provider_configs set provider = 'ollama' where provider = 'local';
```

- [ ] **Step 2: Apply locally**

Run: `npm run db:push:dev`

- [ ] **Step 3: Verify no rows remain with `'local'`**

```sql
select count(*) from ai_provider_configs where provider = 'local';
```

Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260428100001_provider_local_to_ollama.sql
git commit -m "feat(db): rename ai_provider_configs.provider 'local' to 'ollama'"
```

### Task 0.4: Update `aiProviderSchema` + add alias schema

**Files:**
- Modify: `packages/shared/src/schemas/ai.ts`
- Test: `packages/shared/src/schemas/__tests__/ai.test.ts` (create if absent)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { aiProviderSchema, aiProviderSchemaWithAlias } from '../ai'

describe('aiProviderSchema', () => {
  it('accepts the four canonical providers', () => {
    for (const p of ['openai', 'anthropic', 'gemini', 'ollama']) {
      expect(aiProviderSchema.parse(p)).toBe(p)
    }
  })
  it("rejects 'local' on strict schema", () => {
    expect(() => aiProviderSchema.parse('local')).toThrow()
  })
})

describe('aiProviderSchemaWithAlias', () => {
  it("accepts 'local' and coerces to 'ollama'", () => {
    expect(aiProviderSchemaWithAlias.parse('local')).toBe('ollama')
  })
  it('passes canonical providers through unchanged', () => {
    expect(aiProviderSchemaWithAlias.parse('openai')).toBe('openai')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run packages/shared/src/schemas/__tests__/ai.test.ts`
Expected: failure (`aiProviderSchemaWithAlias` undefined or schema includes/excludes `'local'` incorrectly).

- [ ] **Step 3: Update the schema**

```ts
import { z } from 'zod'

export const aiProviderSchema = z.enum(['openai', 'anthropic', 'gemini', 'ollama'])

export const aiProviderSchemaWithAlias = z.union([
  aiProviderSchema,
  z.literal('local').transform(() => 'ollama' as const),
])

export type AiProvider = z.infer<typeof aiProviderSchema>
```

If the file already had a different shape, preserve any other exports — only swap the enum values + add the alias schema.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run packages/shared/src/schemas/__tests__/ai.test.ts`

- [ ] **Step 5: Typecheck the workspace**

Run: `npm run typecheck`
Expected: green; if any consumer was importing `'local'`, fix to use the alias schema or drop it.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/ai.ts packages/shared/src/schemas/__tests__/ai.test.ts
git commit -m "feat(schemas): canonical aiProviderSchema + 'local' alias coercion"
```

### Task 0.5: Extend `pipeline_settings.default_providers_json` with `canonicalCore` + `assets`

**Files:**
- Create: `supabase/migrations/20260428100002_pipeline_settings_provider_extension.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Backfill canonicalCore + assets from brainstorm to preserve user intent;
-- admin can change later via the pipeline settings UI.
update pipeline_settings
   set default_providers_json = jsonb_set(
     jsonb_set(
       default_providers_json,
       '{canonicalCore}',
       to_jsonb(coalesce(default_providers_json->>'brainstorm', 'gemini')),
       true
     ),
     '{assets}',
     to_jsonb(coalesce(default_providers_json->>'brainstorm', 'gemini')),
     true
   )
 where not (default_providers_json ? 'canonicalCore' and default_providers_json ? 'assets');
```

- [ ] **Step 2: Apply locally**

Run: `npm run db:push:dev`

- [ ] **Step 3: Verify the keys exist**

```sql
select default_providers_json from pipeline_settings limit 1;
```

Expected: object contains both `canonicalCore` and `assets` keys.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260428100002_pipeline_settings_provider_extension.sql
git commit -m "feat(db): extend default_providers_json with canonicalCore + assets"
```

### Task 0.6: Add `'aborted'` to `JobStage` union

**Files:**
- Modify: `apps/api/src/jobs/emitter.ts`

- [ ] **Step 1: Append `'aborted'` to the `JobStage` union**

```ts
export type JobStage =
  | 'queued'
  | 'loading_prompt'
  | 'calling_provider'
  | 'parsing_output'
  | 'saving'
  | 'completed'
  | 'failed'
  | 'aborted';
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: green; downstream consumers like `GenerationProgressFloat.tsx` may show an exhaustiveness warning — leave them; Wave 7/8 hooks the new branch.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/jobs/emitter.ts
git commit -m "feat(jobs): add 'aborted' to JobStage union"
```

### Task 0.7: Regenerate database types

- [ ] **Step 1: Pull fresh types**

Run: `npm run db:types`
Expected: `packages/shared/src/types/database.ts` updates (no functional drift expected from Wave 0 migrations beyond the CHECK constraint, but the file may shift).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: green.

- [ ] **Step 3: Commit if file changed**

```bash
git add packages/shared/src/types/database.ts
git commit -m "chore(types): regenerate database.ts after Wave 0 migrations" || echo "no changes"
```

---

## Wave 1 — Templates table + `projects` columns + mode backfill

> **Deploy:** Backend-only, ships independently.

### Task 1.1: Create `autopilot_templates` table + `clear_autopilot_default()` RPC

**Files:**
- Create: `supabase/migrations/20260428100003_autopilot_templates.sql`

- [ ] **Step 1: Write the migration**

```sql
create table autopilot_templates (
  id              text primary key default gen_random_uuid()::text,
  user_id         uuid not null references auth.users(id) on delete cascade,
  channel_id      uuid references channels(id) on delete cascade,
  name            text not null,
  config_json     jsonb not null,
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_autopilot_templates_user_channel
  on autopilot_templates(user_id, channel_id);

create unique index idx_autopilot_templates_one_channel_default
  on autopilot_templates(user_id, channel_id)
  where is_default = true and channel_id is not null;

create unique index idx_autopilot_templates_one_global_default
  on autopilot_templates(user_id)
  where is_default = true and channel_id is null;

create trigger handle_updated_at before update on autopilot_templates
  for each row execute function moddatetime(updated_at);

alter table autopilot_templates enable row level security;

create or replace function clear_autopilot_default(p_user_id uuid, p_channel_id uuid)
returns void language sql as $$
  update autopilot_templates
     set is_default = false
   where user_id = p_user_id
     and channel_id is not distinct from p_channel_id
     and is_default = true;
$$;
```

- [ ] **Step 2: Apply locally**

Run: `npm run db:push:dev`

- [ ] **Step 3: Smoke check the partial unique indexes**

```sql
insert into autopilot_templates (user_id, channel_id, name, config_json, is_default)
values
  ('<test-uuid>', null, 'global-1', '{}'::jsonb, true),
  ('<test-uuid>', null, 'global-2', '{}'::jsonb, true);
```

Expected: second insert fails with unique violation. Then test the RPC clears it cleanly.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260428100003_autopilot_templates.sql
git commit -m "feat(db): autopilot_templates table + clear_autopilot_default RPC"
```

### Task 1.2: Add new columns to `projects` + backfill `mode`

**Files:**
- Create: `supabase/migrations/20260428100004_projects_autopilot_columns.sql`

- [ ] **Step 1: Write the migration**

```sql
alter table projects
  add column channel_id              uuid references channels(id) on delete set null,
  add column mode                    text,
  add column autopilot_config_json   jsonb,
  add column autopilot_template_id   text references autopilot_templates(id) on delete set null,
  add column abort_requested_at      timestamptz;

create index idx_projects_channel_id on projects(channel_id);

-- Mode backfill from legacy pipeline_state_json + auto_advance.
-- 'overview' is never auto-assigned; users opt in via mid-flow toggle.
update projects set mode = case
  when pipeline_state_json->>'mode' = 'auto'                    then 'supervised'
  when auto_advance = true and pipeline_state_json is not null  then 'supervised'
  when pipeline_state_json is not null                          then 'step-by-step'
  else null
end;
```

> Note: `projects.channel_id` is intentionally NOT backfilled. Legacy projects with `NULL` channel_id surface a one-time `<PickChannelModal />` on first reopen (Wave 6).

- [ ] **Step 2: Apply locally**

Run: `npm run db:push:dev`

- [ ] **Step 3: Verify backfill rules**

```sql
-- Spot-check each branch
select id, mode, auto_advance, pipeline_state_json->>'mode' as legacy_mode
from projects
order by created_at desc
limit 20;
```

Expected:
- `auto_advance = true` rows → `mode = 'supervised'`
- `pipeline_state_json.mode = 'auto'` rows → `'supervised'`
- non-empty pipeline_state_json without auto signal → `'step-by-step'`
- empty/null pipeline_state_json → `mode IS NULL`

- [ ] **Step 4: Regenerate types + typecheck**

Run: `npm run db:types && npm run typecheck`

- [ ] **Step 5: Update `packages/shared/src/mappers/db.ts`**

Find the existing project mapper (search for `fromDbProject` / `toDbProject` or equivalent) and append fields:

```ts
// In fromDbProject — read snake_case from DB row
channelId:            row.channel_id,
mode:                 row.mode as 'step-by-step' | 'supervised' | 'overview' | null,
autopilotConfigJson:  row.autopilot_config_json,
autopilotTemplateId:  row.autopilot_template_id,
abortRequestedAt:     row.abort_requested_at,

// In toDbProject — write snake_case to DB
channel_id:               input.channelId ?? null,
mode:                     input.mode ?? null,
autopilot_config_json:    input.autopilotConfigJson ?? null,
autopilot_template_id:    input.autopilotTemplateId ?? null,
abort_requested_at:       input.abortRequestedAt ?? null,
```

If a typed `Project` interface lives in `packages/shared/src/schemas/projects.ts`, extend it accordingly (camelCase fields).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: green; address any callers passing `Project` objects that no longer match.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260428100004_projects_autopilot_columns.sql \
        packages/shared/src/types/database.ts \
        packages/shared/src/mappers/db.ts \
        packages/shared/src/schemas/projects.ts
git commit -m "feat(db): projects autopilot columns + mode backfill + mappers"
```

---

## Wave 2 — Shared Zod schemas

> **Deploy:** Backend-only, ships independently.

### Task 2.1: `autopilotConfigSchema`

**Files:**
- Create: `packages/shared/src/schemas/autopilotConfig.ts`
- Test: `packages/shared/src/schemas/__tests__/autopilotConfig.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { autopilotConfigSchema } from '../autopilotConfig'

const minimalCanonical = {
  defaultProvider: 'recommended',
  brainstorm: { providerOverride: null, mode: 'topic_driven', topic: 'AI agents' },
  research:   { providerOverride: null, depth: 'medium' },
  canonicalCore: { providerOverride: null, personaId: null },
  draft:  { providerOverride: null, format: 'blog', wordCount: 1200 },
  review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 },
  assets: { providerOverride: null, mode: 'briefing' },
}

describe('autopilotConfigSchema', () => {
  it('parses a minimal valid config', () => {
    expect(autopilotConfigSchema.parse(minimalCanonical)).toMatchObject(minimalCanonical)
  })

  it("requires topic in brainstorm.topic_driven mode", () => {
    const bad = { ...minimalCanonical, brainstorm: { ...minimalCanonical.brainstorm, topic: undefined } }
    expect(() => autopilotConfigSchema.parse(bad)).toThrow(/topic/i)
  })

  it("requires referenceUrl in brainstorm.reference_guided mode", () => {
    const bad = {
      ...minimalCanonical,
      brainstorm: { providerOverride: null, mode: 'reference_guided', referenceUrl: '' },
    }
    expect(() => autopilotConfigSchema.parse(bad)).toThrow(/url/i)
  })

  it("requires wordCount when format = 'blog'", () => {
    const bad = { ...minimalCanonical, draft: { providerOverride: null, format: 'blog' } }
    expect(() => autopilotConfigSchema.parse(bad)).toThrow(/word count/i)
  })

  it('rejects review.hardFail >= autoApprove (infinite loop)', () => {
    const bad = { ...minimalCanonical, review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 80, hardFailThreshold: 80 } }
    expect(() => autopilotConfigSchema.parse(bad)).toThrow(/lower than/i)
  })

  it('allows brainstorm/research to be null (project from research/blog entry)', () => {
    const ok = { ...minimalCanonical, brainstorm: null, research: null }
    expect(autopilotConfigSchema.parse(ok)).toMatchObject(ok)
  })

  it('allows review.maxIterations = 0 (skip review)', () => {
    const ok = { ...minimalCanonical, review: { providerOverride: null, maxIterations: 0, autoApproveThreshold: 90, hardFailThreshold: 40 } }
    expect(autopilotConfigSchema.parse(ok).review.maxIterations).toBe(0)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run packages/shared/src/schemas/__tests__/autopilotConfig.test.ts`

- [ ] **Step 3: Implement the schema**

Implement exactly per spec section 5.1. Save to `packages/shared/src/schemas/autopilotConfig.ts`.

```ts
import { z } from 'zod'
import { aiProviderSchema } from './ai'

const ProviderOrInherit = aiProviderSchema.nullable()
const DefaultProvider = z.union([z.literal('recommended'), aiProviderSchema])

const BrainstormSlot = z.object({
  providerOverride: ProviderOrInherit,
  mode: z.enum(['topic_driven', 'reference_guided']),
  topic: z.string().trim().optional().nullable(),
  referenceUrl: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().url().nullable().optional(),
  ),
  niche: z.string().trim().optional(),
  tone: z.string().trim().optional(),
  audience: z.string().trim().optional(),
  goal: z.string().trim().optional(),
  constraints: z.string().trim().optional(),
}).superRefine((v, ctx) => {
  if (v.mode === 'topic_driven' && !v.topic) {
    ctx.addIssue({ code: 'custom', path: ['topic'], message: 'Topic required for topic-driven mode' })
  }
  if (v.mode === 'reference_guided' && !v.referenceUrl) {
    ctx.addIssue({ code: 'custom', path: ['referenceUrl'], message: 'URL required for reference-guided mode' })
  }
})

const ResearchSlot = z.object({
  providerOverride: ProviderOrInherit,
  depth: z.enum(['surface', 'medium', 'deep']),
})

const CanonicalCoreSlot = z.object({
  providerOverride: ProviderOrInherit,
  personaId: z.string().nullable(),
})

const DraftSlot = z.object({
  providerOverride: ProviderOrInherit,
  format: z.enum(['blog', 'video', 'shorts', 'podcast']),
  wordCount: z.number().int().positive().optional(),
}).superRefine((v, ctx) => {
  if (v.format === 'blog' && (!v.wordCount || v.wordCount <= 0)) {
    ctx.addIssue({ code: 'custom', path: ['wordCount'], message: 'Word count required for blog' })
  }
})

const ReviewSlot = z.object({
  providerOverride: ProviderOrInherit,
  maxIterations: z.number().int().min(0).max(20),
  autoApproveThreshold: z.number().int().min(0).max(100),
  hardFailThreshold: z.number().int().min(0).max(100),
}).superRefine((v, ctx) => {
  if (v.hardFailThreshold >= v.autoApproveThreshold) {
    ctx.addIssue({ code: 'custom', path: ['hardFailThreshold'], message: 'Must be lower than auto-approve threshold (else infinite loop)' })
  }
})

const AssetsSlot = z.object({
  providerOverride: ProviderOrInherit,
  mode: z.enum(['skip', 'manual', 'briefing', 'auto']),
})

export const autopilotConfigSchema = z.object({
  defaultProvider: DefaultProvider,
  brainstorm:    BrainstormSlot.nullable(),
  research:      ResearchSlot.nullable(),
  canonicalCore: CanonicalCoreSlot,
  draft:         DraftSlot,
  review:        ReviewSlot,
  assets:        AssetsSlot,
})

export const autopilotConfigPatchSchema = autopilotConfigSchema.deepPartial()

export type AutopilotConfig = z.infer<typeof autopilotConfigSchema>
export type AutopilotConfigPatch = z.infer<typeof autopilotConfigPatchSchema>
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run packages/shared/src/schemas/__tests__/autopilotConfig.test.ts`

- [ ] **Step 5: Export from `packages/shared/src/schemas/index.ts`**

```ts
export * from './autopilotConfig'
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/autopilotConfig.ts \
        packages/shared/src/schemas/__tests__/autopilotConfig.test.ts \
        packages/shared/src/schemas/index.ts
git commit -m "feat(schemas): autopilotConfigSchema + patch variant"
```

### Task 2.2: `setupProjectSchema` + `startStageSchema`

**Files:**
- Create: `packages/shared/src/schemas/projectSetup.ts`
- Test: `packages/shared/src/schemas/__tests__/projectSetup.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { setupProjectSchema, startStageSchema } from '../projectSetup'

describe('startStageSchema', () => {
  it('accepts the 7 pipeline stages', () => {
    for (const s of ['brainstorm','research','draft','review','assets','preview','publish']) {
      expect(startStageSchema.parse(s)).toBe(s)
    }
  })
})

describe('setupProjectSchema', () => {
  it("requires autopilotConfig when mode != 'step-by-step'", () => {
    expect(() => setupProjectSchema.parse({
      mode: 'supervised', autopilotConfig: null, templateId: null, startStage: 'brainstorm',
    })).toThrow(/autopilotConfig required/i)
  })
  it("allows null autopilotConfig when mode = 'step-by-step'", () => {
    expect(setupProjectSchema.parse({
      mode: 'step-by-step', autopilotConfig: null, templateId: null, startStage: 'brainstorm',
    }).mode).toBe('step-by-step')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run packages/shared/src/schemas/__tests__/projectSetup.test.ts`

- [ ] **Step 3: Implement**

```ts
import { z } from 'zod'
import { autopilotConfigSchema } from './autopilotConfig'

export const startStageSchema = z.enum([
  'brainstorm', 'research', 'draft', 'review', 'assets', 'preview', 'publish',
])

export const setupProjectSchema = z.object({
  mode: z.enum(['step-by-step', 'supervised', 'overview']),
  autopilotConfig: autopilotConfigSchema.nullable(),
  templateId: z.string().nullable(),
  startStage: startStageSchema,
}).superRefine((v, ctx) => {
  if (v.mode !== 'step-by-step' && !v.autopilotConfig) {
    ctx.addIssue({
      code: 'custom',
      path: ['autopilotConfig'],
      message: 'autopilotConfig required for supervised/overview modes',
    })
  }
})

export type StartStage = z.infer<typeof startStageSchema>
export type SetupProjectInput = z.infer<typeof setupProjectSchema>
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run packages/shared/src/schemas/__tests__/projectSetup.test.ts`

- [ ] **Step 5: Export + commit**

Append `export * from './projectSetup'` to `packages/shared/src/schemas/index.ts`.

```bash
git add packages/shared/src/schemas/projectSetup.ts \
        packages/shared/src/schemas/__tests__/projectSetup.test.ts \
        packages/shared/src/schemas/index.ts
git commit -m "feat(schemas): setupProjectSchema + startStageSchema"
```

### Task 2.3: `autopilotTemplates` request/response schemas

**Files:**
- Create: `packages/shared/src/schemas/autopilotTemplates.ts`
- Test: `packages/shared/src/schemas/__tests__/autopilotTemplates.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import {
  createAutopilotTemplateSchema,
  updateAutopilotTemplateSchema,
} from '../autopilotTemplates'

const validConfig = {
  defaultProvider: 'recommended',
  brainstorm: { providerOverride: null, mode: 'topic_driven', topic: 'x' },
  research:   { providerOverride: null, depth: 'medium' },
  canonicalCore: { providerOverride: null, personaId: null },
  draft:  { providerOverride: null, format: 'blog', wordCount: 1200 },
  review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 },
  assets: { providerOverride: null, mode: 'briefing' },
}

describe('createAutopilotTemplateSchema', () => {
  it('accepts a complete payload', () => {
    expect(createAutopilotTemplateSchema.parse({
      name: 'My default', channelId: null, configJson: validConfig, isDefault: true,
    }).isDefault).toBe(true)
  })
  it('rejects empty name', () => {
    expect(() => createAutopilotTemplateSchema.parse({
      name: '', channelId: null, configJson: validConfig, isDefault: false,
    })).toThrow()
  })
})

describe('updateAutopilotTemplateSchema', () => {
  it('accepts a partial payload (just isDefault)', () => {
    expect(updateAutopilotTemplateSchema.parse({ isDefault: true }).isDefault).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run packages/shared/src/schemas/__tests__/autopilotTemplates.test.ts`

- [ ] **Step 3: Implement**

```ts
import { z } from 'zod'
import { autopilotConfigSchema } from './autopilotConfig'

export const createAutopilotTemplateSchema = z.object({
  name:       z.string().trim().min(1).max(120),
  channelId:  z.string().uuid().nullable(),
  configJson: autopilotConfigSchema,
  isDefault:  z.boolean(),
})

export const updateAutopilotTemplateSchema = createAutopilotTemplateSchema.partial()

export type CreateAutopilotTemplateInput = z.infer<typeof createAutopilotTemplateSchema>
export type UpdateAutopilotTemplateInput = z.infer<typeof updateAutopilotTemplateSchema>
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run packages/shared/src/schemas/__tests__/autopilotTemplates.test.ts`

- [ ] **Step 5: Export + commit**

```bash
git add packages/shared/src/schemas/autopilotTemplates.ts \
        packages/shared/src/schemas/__tests__/autopilotTemplates.test.ts \
        packages/shared/src/schemas/index.ts
git commit -m "feat(schemas): autopilot template CRUD payload schemas"
```

---

## Wave 3 — API routes (setup, abort, templates) + helpers

> **Deploy:** Backend-only, ships independently. Routes are inert until Wave 8 wires the wizard UI.

### Task 3.1: `assertProjectOwner` helper with legacy fallback

**Files:**
- Create: `apps/api/src/lib/projects/ownership.ts`
- Test: `apps/api/src/lib/projects/__tests__/ownership.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi } from 'vitest'
import { assertProjectOwner } from '../ownership'
import { ApiError } from '../../api/errors'

function mkSb(rows: { project: any; channel?: any; research?: any }) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'projects')          return { data: rows.project }
            if (table === 'channels')          return { data: rows.channel ?? null }
            if (table === 'research_archives') return { data: rows.research ?? null }
            return { data: null }
          },
        }),
      }),
    }),
  } as any
}

describe('assertProjectOwner', () => {
  it('passes via channel ownership', async () => {
    const sb = mkSb({ project: { channel_id: 'c1', research_id: null }, channel: { user_id: 'u1' } })
    await expect(assertProjectOwner('p1', 'u1', sb)).resolves.toBeUndefined()
  })

  it('falls back to research_archives.user_id when channel_id is NULL', async () => {
    const sb = mkSb({ project: { channel_id: null, research_id: 'r1' }, research: { user_id: 'u1' } })
    await expect(assertProjectOwner('p1', 'u1', sb)).resolves.toBeUndefined()
  })

  it('throws 404 when project missing', async () => {
    const sb = mkSb({ project: null })
    await expect(assertProjectOwner('p1', 'u1', sb)).rejects.toMatchObject({ status: 404 })
  })

  it('throws 403 when neither chain matches', async () => {
    const sb = mkSb({ project: { channel_id: 'c1', research_id: null }, channel: { user_id: 'someone-else' } })
    await expect(assertProjectOwner('p1', 'u1', sb)).rejects.toMatchObject({ status: 403 })
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run apps/api/src/lib/projects/__tests__/ownership.test.ts`

- [ ] **Step 3: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '../api/errors'

export async function assertProjectOwner(
  projectId: string,
  userId: string,
  sb: SupabaseClient,
): Promise<void> {
  const { data: project } = await sb
    .from('projects')
    .select('channel_id, research_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) throw new ApiError(404, 'Project not found', 'NOT_FOUND')

  if (project.channel_id) {
    const { data: ch } = await sb
      .from('channels').select('user_id').eq('id', project.channel_id).maybeSingle()
    if (ch?.user_id === userId) return
  }
  if (project.research_id) {
    const { data: ra } = await sb
      .from('research_archives').select('user_id').eq('id', project.research_id).maybeSingle()
    if (ra?.user_id === userId) return
  }
  throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
}
```

If `ApiError` constructor signature differs, match the codebase's actual signature (see `apps/api/src/lib/api/errors.ts`).

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run apps/api/src/lib/projects/__tests__/ownership.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/projects/ownership.ts apps/api/src/lib/projects/__tests__/ownership.test.ts
git commit -m "feat(api): assertProjectOwner with legacy research fallback"
```

### Task 3.2: `derivedFromStageResults` + `nextStageAfter` helpers

**Files:**
- Create: `apps/api/src/lib/pipeline-state.ts`
- Test: `apps/api/src/lib/__tests__/pipeline-state.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { derivedFromStageResults, nextStageAfter } from '../pipeline-state'

describe('derivedFromStageResults', () => {
  it('returns null for empty/undefined state', () => {
    expect(derivedFromStageResults(null)).toBeNull()
    expect(derivedFromStageResults({ stageResults: {} })).toBeNull()
  })
  it('returns the furthest completed stage', () => {
    expect(derivedFromStageResults({
      stageResults: { brainstorm: {}, research: {}, draft: {} },
    })).toBe('draft')
  })
})

describe('nextStageAfter', () => {
  it('null → brainstorm (fresh)', () => {
    expect(nextStageAfter(null)).toBe('brainstorm')
  })
  it('research → draft', () => {
    expect(nextStageAfter('research')).toBe('draft')
  })
  it('publish → publish (terminal)', () => {
    expect(nextStageAfter('publish')).toBe('publish')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
const STAGES = ['brainstorm','research','draft','review','assets','preview','publish'] as const
export type PipelineStage = typeof STAGES[number]

export function derivedFromStageResults(state: any): PipelineStage | null {
  const results = state?.stageResults ?? state?.stage_results
  if (!results || typeof results !== 'object') return null
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (results[STAGES[i]]) return STAGES[i]
  }
  return null
}

export function nextStageAfter(completed: PipelineStage | null): PipelineStage {
  if (completed === null) return 'brainstorm'
  const idx = STAGES.indexOf(completed)
  if (idx === -1 || idx === STAGES.length - 1) return 'publish'
  return STAGES[idx + 1]
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/pipeline-state.ts apps/api/src/lib/__tests__/pipeline-state.test.ts
git commit -m "feat(api): pipeline-state helpers (derivedFromStageResults, nextStageAfter)"
```

### Task 3.3: `POST /api/projects/:id/setup`

**Files:**
- Create: `apps/api/src/routes/project-setup.ts`
- Modify: route registry (find by `grep -rn 'createProjectsRouter\|registerRoutes\|app.use' apps/api/src` and append registration)
- Test: `apps/api/src/__tests__/routes/project-setup.test.ts`

- [ ] **Step 1: Write the route handler**

```ts
import { setupProjectSchema } from '@brighttale/shared'
import { ok, fail } from '../lib/api/response'
import { assertProjectOwner } from '../lib/projects/ownership'
import { derivedFromStageResults, nextStageAfter } from '../lib/pipeline-state'
import { createServiceClient } from '../lib/supabase'

export async function postProjectSetup(req: any, res: any) {
  const sb = createServiceClient()
  const userId = req.headers['x-user-id'] as string
  const projectId = req.params.id as string

  await assertProjectOwner(projectId, userId, sb)

  const parsed = setupProjectSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 400, { code: 'INVALID_BODY', message: parsed.error.message })
  const body = parsed.data

  const { data: project } = await sb.from('projects')
    .select('pipeline_state_json').eq('id', projectId).maybeSingle()
  const completed = derivedFromStageResults(project?.pipeline_state_json)
  const expectedStart = nextStageAfter(completed)

  if (body.startStage !== expectedStart) {
    return fail(res, 400, { code: 'STAGE_MISMATCH',
      message: `Cannot start at ${body.startStage}; project state requires ${expectedStart}` })
  }

  const update: Record<string, unknown> = {
    mode: body.mode,
    autopilot_config_json: body.autopilotConfig,
    autopilot_template_id: body.templateId,
  }
  // Fresh setup → clear pipeline_state_json. Resume → leave it.
  if (completed === null) update.pipeline_state_json = null

  const { error } = await sb.from('projects').update(update).eq('id', projectId)
  if (error) return fail(res, 500, { code: 'DB_ERROR', message: error.message })
  return ok(res, { ok: true })
}
```

> Match the actual handler signature used in `apps/api/src/routes/projects.ts` — Fastify-style or Next-style. Mirror the existing CRUD route patterns.

- [ ] **Step 2: Write tests**

```ts
import { describe, it, expect, vi } from 'vitest'
// Mock Supabase + ownership; assert validation, STAGE_MISMATCH, success path
// Follow the established test pattern in apps/api/src/__tests__/routes/*
```

- [ ] **Step 3: Run tests — expect PASS**

Run: `npx vitest run apps/api/src/__tests__/routes/project-setup.test.ts`

- [ ] **Step 4: Register the route**

Find the existing route registration site and add the new route handler.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/project-setup.ts apps/api/src/__tests__/routes/project-setup.test.ts <registry-file>
git commit -m "feat(api): POST /api/projects/:id/setup with startStage validation"
```

### Task 3.4: `PATCH/DELETE /api/projects/:id/abort`

**Files:**
- Modify: `apps/api/src/routes/project-setup.ts` (or split — co-locate with setup since shared resource)
- Test: `apps/api/src/__tests__/routes/project-abort.test.ts`

- [ ] **Step 1: Add handlers**

```ts
export async function patchProjectAbort(req: any, res: any) {
  const sb = createServiceClient()
  const userId = req.headers['x-user-id'] as string
  await assertProjectOwner(req.params.id, userId, sb)
  const { error } = await sb.from('projects')
    .update({ abort_requested_at: new Date().toISOString() })
    .eq('id', req.params.id)
  if (error) return fail(res, 500, { code: 'DB_ERROR', message: error.message })
  return ok(res, { ok: true })
}

export async function deleteProjectAbort(req: any, res: any) {
  const sb = createServiceClient()
  const userId = req.headers['x-user-id'] as string
  await assertProjectOwner(req.params.id, userId, sb)
  const { error } = await sb.from('projects')
    .update({ abort_requested_at: null })
    .eq('id', req.params.id)
  if (error) return fail(res, 500, { code: 'DB_ERROR', message: error.message })
  return ok(res, { ok: true })
}
```

- [ ] **Step 2: Write tests covering 403/404/200**

- [ ] **Step 3: Register routes + run tests**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(api): project abort PATCH/DELETE endpoints"
```

### Task 3.5: `/api/autopilot-templates` CRUD

**Files:**
- Create: `apps/api/src/routes/autopilot-templates.ts`
- Test: `apps/api/src/__tests__/routes/autopilot-templates.test.ts`

- [ ] **Step 1: Write tests covering**:
  - `GET ?channelId=<uuid>` returns user's globals + channel-scoped templates.
  - `POST` with `isDefault: true` calls `clear_autopilot_default` RPC before insert.
  - `PUT` flipping `isDefault: true` calls the RPC.
  - `DELETE` succeeds (`projects.autopilot_template_id` becomes NULL via FK).
  - Channel-scoped + global defaults coexist independently.

- [ ] **Step 2: Implement handlers**

Each mutation follows the same shape:

```ts
if (body.isDefault) {
  await sb.rpc('clear_autopilot_default', { p_user_id: userId, p_channel_id: body.channelId })
}
// then insert/update the template row
```

- [ ] **Step 3: Register routes + run tests — expect PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(api): autopilot-templates CRUD with default-clearing RPC"
```

### Task 3.6: Document `assertProjectOwner` in API rules

**Files:**
- Modify: `.claude/rules/api-routes.md`

- [ ] **Step 1: Append a section**

```markdown
## Ownership Guard

Routes scoped to a `:projectId` MUST call `assertProjectOwner(projectId, userId, sb)` from
`apps/api/src/lib/projects/ownership.ts` before any read/write. Resolves ownership via
`channels.user_id`; falls back to `research_archives.user_id` for legacy projects with
`channel_id IS NULL` (see Wave 1 backfill rules in pipeline-autopilot-wizard plan).
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/api-routes.md
git commit -m "docs(rules): document assertProjectOwner ownership guard"
```

---

## Wave 4 — Abort plumbing through providers + Inngest jobs

> **Deploy:** Backend-only, ships independently. Browser-side abort polling lands in Wave 7.

### Task 4.1: `JobAborted` + `assertNotAborted` + `sleepCancellable`

**Files:**
- Create: `apps/api/src/lib/ai/abortable.ts`
- Test: `apps/api/src/lib/ai/__tests__/abortable.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { JobAborted, assertNotAborted, sleepCancellable } from '../abortable'

describe('JobAborted', () => {
  it('extends Error and is non-retriable', () => {
    const e = new JobAborted('p1')
    expect(e).toBeInstanceOf(Error)
    expect((e as any).noRetry).toBe(true)
  })
})

describe('assertNotAborted', () => {
  it('throws JobAborted when projects.abort_requested_at is set', async () => {
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { abort_requested_at: '2026-04-28T00:00:00Z' } }) }) }) }) } as any
    await expect(assertNotAborted('p1', undefined, sb)).rejects.toBeInstanceOf(JobAborted)
  })
  it('no-ops when projectId is undefined (bulk path)', async () => {
    await expect(assertNotAborted(undefined, undefined, {} as any)).resolves.toBeUndefined()
  })
})

describe('sleepCancellable', () => {
  it('rejects fast on already-aborted signal', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(sleepCancellable(1000, ac.signal)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Verify the `NonRetriableError` import path for the pinned Inngest version**

```bash
# Confirm zero existing usage in the codebase (so we have to discover the path).
grep -rn 'NonRetriableError' apps/api/src
# Expected: empty.

# Read the pinned Inngest version + inspect the package's exports map.
node -p "require('./apps/api/package.json').dependencies.inngest"
# In node_modules, confirm the export:
node -e "console.log(Object.keys(require('inngest')))" | grep -o 'NonRetriableError'
# If empty, try the subpath: node -e "console.log(Object.keys(require('inngest/errors')))"
```

Expected: `NonRetriableError` exposed by `'inngest'` (Inngest 3.x) — if not, use `'inngest/errors'` for older 2.x. Record the resolved import path; use it in Step 4.

- [ ] **Step 4: Implement**

```ts
import { NonRetriableError } from 'inngest'  // ← swap to 'inngest/errors' if Step 3 says so
import type { SupabaseClient } from '@supabase/supabase-js'

export class JobAborted extends NonRetriableError {
  constructor(projectId: string, draftId?: string) {
    super(`Job aborted for project ${projectId}${draftId ? `, draft ${draftId}` : ''}`)
    this.name = 'JobAborted'
  }
}

export async function assertNotAborted(
  projectId: string | undefined,
  draftId: string | undefined,
  sb: SupabaseClient,
): Promise<void> {
  if (!projectId) return
  const { data } = await sb.from('projects')
    .select('abort_requested_at')
    .eq('id', projectId)
    .maybeSingle()
  if (data?.abort_requested_at) throw new JobAborted(projectId, draftId)
}

export function sleepCancellable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(() => resolve(), ms)
    const onAbort = () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
```

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/ai/abortable.ts apps/api/src/lib/ai/__tests__/abortable.test.ts
git commit -m "feat(api): JobAborted + assertNotAborted + sleepCancellable helpers"
```

### Task 4.2: Thread `signal` through `GenerateContentParams` + providers

**Files:**
- Modify: `apps/api/src/lib/ai/provider.ts`, `apps/api/src/lib/ai/router.ts`, `apps/api/src/lib/ai/providers/{openai,anthropic,gemini,ollama,mock}.ts`
- Modify tests: `apps/api/src/lib/ai/__tests__/router.test.ts`

- [ ] **Step 1: Verify each provider's call surface accepts `signal` per request**

```bash
# Read each provider's current generateContent body to find the call site.
sed -n '1,80p' apps/api/src/lib/ai/providers/anthropic.ts
sed -n '1,80p' apps/api/src/lib/ai/providers/openai.ts
sed -n '1,60p' apps/api/src/lib/ai/providers/gemini.ts
sed -n '1,60p' apps/api/src/lib/ai/providers/ollama.ts
sed -n '1,40p' apps/api/src/lib/ai/mock.ts

# Confirm pinned SDK versions accept signal:
node -p "require('./apps/api/package.json').dependencies['@anthropic-ai/sdk']"
node -p "require('./apps/api/package.json').dependencies['openai']"
```

For each SDK-backed provider, document the abort surface:

| Provider | SDK / fetch | Per-request abort |
|---|---|---|
| anthropic | `@anthropic-ai/sdk` | second arg `{ signal }` on `messages.create(params, { signal })` (≥0.20). If pinned version is older, swap to a manual `fetch` wrapper. |
| openai    | `openai` | second arg `{ signal }` on `chat.completions.create(params, { signal })` (≥4.0). Same fallback. |
| gemini    | bare `fetch` | passes `signal` directly. |
| ollama    | bare `fetch` | passes `signal` directly (already supported per `ollama.ts:36`). |
| mock      | timer | reject with `AbortError` if `signal.aborted` or on `signal.addEventListener('abort')`. |

If either SDK does NOT expose `signal` at the call level, **stop** and document the workaround (manual `fetch` wrapper or AbortController-aware client) in the plan before proceeding to Step 2.

- [ ] **Step 2: Add `signal?: AbortSignal` to `GenerateContentParams`**

```ts
// provider.ts
export interface GenerateContentParams {
  agentType: AgentType;
  systemPrompt: string;
  userMessage: string;
  schema?: unknown;
  signal?: AbortSignal;
}
```

- [ ] **Step 3: Pass `signal` to each provider's call site**

Use the surface confirmed in Step 1. Each provider must either accept `signal` per request OR fail-fast on already-aborted in a pre-call check (`if (params.signal?.aborted) throw new DOMException('Aborted', 'AbortError')`).

`mock.ts` reject promptly with `AbortError` if aborted (the timer-based mock already exists; just wire signal through).

- [ ] **Step 4: Make `generateWithFallback` cancellable**

```ts
// router.ts (around the retry loop)
import { sleepCancellable } from './abortable'
// ...
await sleepCancellable(backoffMs, params.signal)
// rethrow immediately on AbortError so the loop exits cleanly
```

- [ ] **Step 5: Add a router test that aborts mid-retry**

```ts
it('exits retry loop promptly on signal abort', async () => {
  const ac = new AbortController()
  setTimeout(() => ac.abort(), 50)
  const start = Date.now()
  await expect(generateWithFallback(/* ... */, { ...params, signal: ac.signal }))
    .rejects.toThrow()
  expect(Date.now() - start).toBeLessThan(500)
})
```

- [ ] **Step 6: Run all AI tests — expect PASS**

Run: `npx vitest run apps/api/src/lib/ai`

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(ai): thread AbortSignal through provider chain + cancellable retries"
```

### Task 4.3: Insert `assertNotAborted` into Inngest jobs

**Files:**
- Modify: `apps/api/src/jobs/brainstorm-generate.ts`
- Modify: `apps/api/src/jobs/research-generate.ts`
- Modify: `apps/api/src/jobs/production-generate.ts`
- Modify: `apps/api/src/jobs/production-produce.ts`
- Modify: `apps/api/src/jobs/content-generate.ts`

For each job:

- [ ] **Step 1: Import `assertNotAborted` + `JobAborted`**

```ts
import { assertNotAborted, JobAborted } from '../lib/ai/abortable'
```

- [ ] **Step 2: Insert a check between every `step.run` call**

Pattern:

```ts
await assertNotAborted(projectId, draftId, sb)
const x = await step.run('emit-loading-prompt', async () => { /* ... */ })

await assertNotAborted(projectId, draftId, sb)
const y = await step.run('load-prompt', async () => { /* ... */ })
```

If the job doesn't have `projectId` in scope, look up the parent project from `content_drafts.project_id` once at the top and reuse.

- [ ] **Step 3: Wrap the top-level catch**

```ts
} catch (err) {
  if (err instanceof JobAborted) {
    await sb.from('content_drafts')
      .update({ status: 'paused' })
      .eq('id', draftId)
    await emitJobEvent(sessionId, sessionType, 'aborted', 'Job aborted by user')
    return
  }
  // existing failed-status path
  await sb.from('<table>').update({ status: 'failed', error_message: message.slice(0, 500) }).eq('id', sessionId)
  throw err
}
```

- [ ] **Step 4: Add a test per job**

`apps/api/src/jobs/__tests__/<job>-abort.test.ts`:

```ts
it('exits early with content_drafts.status = paused when abort flag set', async () => {
  // mock supabase: first call returns abort_requested_at = now()
  // run job entrypoint, assert update({ status: 'paused' }) was called
})
```

- [ ] **Step 5: Run job tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(jobs): assertNotAborted between every step.run + paused exit path"
```

### Task 4.4: Stage→agent map + `resolveStageProvider`

**Files:**
- Create: `apps/api/src/lib/ai/stageMapping.ts`
- Create: `apps/api/src/lib/ai/resolveProvider.ts`
- Test: `apps/api/src/lib/ai/__tests__/resolveProvider.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { resolveStageProvider } from '../resolveProvider'

const cfg: any = {
  defaultProvider: 'recommended',
  brainstorm: { providerOverride: null, mode: 'topic_driven', topic: 'x' },
  research:   { providerOverride: 'anthropic', depth: 'medium' },
  canonicalCore: { providerOverride: null, personaId: null },
  draft:  { providerOverride: null, format: 'blog', wordCount: 1200 },
  review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 },
  assets: { providerOverride: null, mode: 'briefing' },
}
const admin: any = { defaultProviders: { brainstorm: 'gemini', research: 'gemini', canonicalCore: 'openai', draft: 'anthropic', review: 'gemini', assets: 'gemini' } }

describe('resolveStageProvider', () => {
  it('per-stage override wins', () => {
    expect(resolveStageProvider('research', cfg, admin)).toBe('anthropic')
  })
  it("falls back to admin default when defaultProvider = 'recommended'", () => {
    expect(resolveStageProvider('brainstorm', cfg, admin)).toBe('gemini')
  })
  it('uses project default when not "recommended" and no override', () => {
    const c = { ...cfg, defaultProvider: 'openai' }
    expect(resolveStageProvider('brainstorm', c, admin)).toBe('openai')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// stageMapping.ts
import type { AgentType } from './provider'
export type AutopilotStage = 'brainstorm'|'research'|'canonicalCore'|'draft'|'review'|'assets'
export const AGENT_FOR_AUTOPILOT_STAGE: Record<AutopilotStage, AgentType> = {
  brainstorm:    'brainstorm',
  research:      'research',
  canonicalCore: 'production',
  draft:         'production',
  review:        'review',
  assets:        'assets',
}
```

```ts
// resolveProvider.ts
import type { AutopilotConfig } from '@brighttale/shared'
import type { AutopilotStage } from './stageMapping'

export function resolveStageProvider(
  stage: AutopilotStage,
  config: AutopilotConfig,
  adminDefaults: { defaultProviders: Record<AutopilotStage, string> },
): string {
  const slot = config[stage] as { providerOverride?: string | null } | null
  if (slot && slot.providerOverride) return slot.providerOverride
  if (config.defaultProvider === 'recommended') {
    return adminDefaults.defaultProviders[stage]
  }
  return config.defaultProvider
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/ai/stageMapping.ts apps/api/src/lib/ai/resolveProvider.ts \
        apps/api/src/lib/ai/__tests__/resolveProvider.test.ts
git commit -m "feat(ai): stage→agent map + resolveStageProvider helper"
```

---

## Wave 5 — XState machine: setup state, events, snapshot hydration

> **Deploy:** Must ship together with Waves 6+7+8.

### Task 5.1: Extend `PipelineMachineContext` + `PipelineEvent` types

**Files:**
- Modify: `apps/app/src/lib/pipeline/machine.types.ts`

- [ ] **Step 1: Update context type**

```ts
import type { AutopilotConfig } from '@brighttale/shared'

export interface PipelineMachineContext {
  projectId: string
  channelId: string | null              // changed: nullable for legacy
  projectTitle: string
  mode: 'step-by-step' | 'supervised' | 'overview' | null
  autopilotConfig: AutopilotConfig | null
  templateId: string | null
  stageResults: StageResultMap
  iterationCount: number
  lastError: string | null
  pipelineSettings: PipelineSettings
  creditSettings: CreditSettings
  paused: boolean
  pauseReason: PauseReason | null
}
```

- [ ] **Step 2: Update input type**

```ts
export interface PipelineMachineInput {
  projectId: string
  channelId: string | null
  projectTitle: string
  mode?: 'step-by-step' | 'supervised' | 'overview' | null
  autopilotConfig?: AutopilotConfig | null
  templateId?: string | null
  pipelineSettings: PipelineSettings
  creditSettings: CreditSettings
  initialStageResults?: StageResultMap
  initialIterationCount?: number
  initialPaused?: boolean
  initialPauseReason?: PauseReason | null
}
```

- [ ] **Step 3: Drop `TOGGLE_AUTO_PILOT`; add new events**

```ts
export type PipelineEvent =
  | { type: 'BRAINSTORM_COMPLETE'; result: BrainstormResult }
  | { type: 'RESEARCH_COMPLETE';   result: ResearchResult }
  | { type: 'DRAFT_COMPLETE';      result: DraftResult }
  | { type: 'REVIEW_COMPLETE';     result: ReviewResult }
  | { type: 'ASSETS_COMPLETE';     result: AssetsResult }
  | { type: 'PREVIEW_COMPLETE';    result: PreviewResult }
  | { type: 'PUBLISH_COMPLETE';    result: PublishResult }
  | { type: 'STAGE_ERROR';         error: string }
  | { type: 'STAGE_PROGRESS';      stage: PipelineStage; partial: Record<string, unknown> }
  | { type: 'RETRY' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'NAVIGATE';            toStage: PipelineStage }
  | { type: 'REDO_FROM';           fromStage: PipelineStage }
  | { type: 'SET_PROJECT_TITLE';   title: string }
  | { type: 'SETUP_COMPLETE';      mode: 'step-by-step'|'supervised'|'overview'; autopilotConfig: AutopilotConfig | null; templateId: string | null; startStage: PipelineStage }
  | { type: 'RESET_TO_SETUP' }
  | { type: 'GO_AUTOPILOT';        mode: 'supervised' | 'overview'; autopilotConfig: AutopilotConfig }
  | { type: 'REQUEST_ABORT' }
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: failures across consumers — those will be fixed in subsequent tasks. For now, just confirm errors are limited to expected sites.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/lib/pipeline/machine.types.ts
git commit -m "feat(pipeline): types for setup state, autopilot config, abort events"
```

### Task 5.2: Add `setup` state + new events to the machine

**Files:**
- Modify: `apps/app/src/lib/pipeline/machine.ts`
- Test: `apps/app/src/lib/pipeline/__tests__/machine.test.ts`

- [ ] **Step 1: Write failing tests for new transitions**

```ts
it('boots into setup when no input.mode is provided', () => {
  const actor = createActor(pipelineMachine, { input: { /* fresh input */ } })
  actor.start()
  expect(actor.getSnapshot().value).toBe('setup')
})

it('SETUP_COMPLETE with startStage=draft transitions to draft', () => {
  // ...
  actor.send({ type: 'SETUP_COMPLETE', mode: 'supervised', autopilotConfig: cfg, templateId: null, startStage: 'draft' })
  expect(actor.getSnapshot().value).toBe('draft')
  expect(actor.getSnapshot().context.mode).toBe('supervised')
  expect(actor.getSnapshot().context.autopilotConfig).toEqual(cfg)
})

it('GO_AUTOPILOT updates mode + config without changing stage', () => {
  // boot directly into draft via input/snapshot
  actor.send({ type: 'GO_AUTOPILOT', mode: 'overview', autopilotConfig: cfg })
  expect(actor.getSnapshot().value).toBe('draft')
  expect(actor.getSnapshot().context.mode).toBe('overview')
})

it('RESET_TO_SETUP returns to setup and wipes results AND mode/config/templateId', () => {
  // Boot a project mid-flow with mode='supervised' + autopilotConfig set + draft completed.
  actor.send({ type: 'RESET_TO_SETUP' })
  const ctx = actor.getSnapshot().context
  expect(actor.getSnapshot().value).toBe('setup')
  expect(ctx.stageResults).toEqual({})
  expect(ctx.iterationCount).toBe(0)
  expect(ctx.mode).toBeNull()
  expect(ctx.autopilotConfig).toBeNull()
  expect(ctx.templateId).toBeNull()
  expect(ctx.paused).toBe(false)
})

it('DRAFT_COMPLETE with maxIterations=0 routes to assets (skip review)', () => {
  // configure autopilotConfig.review.maxIterations = 0, send DRAFT_COMPLETE
  expect(actor.getSnapshot().value).toBe('assets')
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run apps/app/src/lib/pipeline/__tests__/machine.test.ts`

- [ ] **Step 3: Update machine — add setup state, guards, actions, drop toggle**

```ts
// machine.ts (key changes — keep existing stage substates verbatim)

const STAGE_TARGETS: Record<PipelineStage, string> = {
  brainstorm: 'brainstorm', research: 'research', draft: 'draft',
  review: 'review', assets: 'assets', preview: 'preview', publish: 'publish',
}

setup({
  // ...
  guards: {
    // existing guards
    startsAtBrainstorm: ({ event }: any) => event.startStage === 'brainstorm',
    startsAtResearch:   ({ event }: any) => event.startStage === 'research',
    startsAtDraft:      ({ event }: any) => event.startStage === 'draft',
    startsAtReview:     ({ event }: any) => event.startStage === 'review',
    startsAtAssets:     ({ event }: any) => event.startStage === 'assets',
    startsAtPreview:    ({ event }: any) => event.startStage === 'preview',
    startsAtPublish:    ({ event }: any) => event.startStage === 'publish',
    shouldSkipReview:   ({ context }: any) => context.autopilotConfig?.review.maxIterations === 0,
  },
  actions: {
    // existing actions, MINUS toggleMode
    applySetup: assign(({ event }: any) => ({
      mode: event.mode,
      autopilotConfig: event.autopilotConfig,
      templateId: event.templateId,
    })),
    setAutopilotConfig: assign({ autopilotConfig: ({ event }: any) => event.autopilotConfig }),
    setMode: assign({ mode: ({ event }: any) => event.mode }),
    clearAllResults: assign({
      stageResults: () => ({}),
      iterationCount: 0,
      mode: () => null,
      autopilotConfig: () => null,
      templateId: () => null,
      paused: () => false,
      pauseReason: () => null,
    }),
    showAbortFailedToast: ({ context }: any) => { /* toast.error(`Failed to pause: ${context.lastError}`) */ },
  },
}).createMachine({
  id: 'pipeline',
  context: ({ input }) => ({
    projectId: input.projectId,
    channelId: input.channelId ?? null,
    projectTitle: input.projectTitle,
    mode: input.mode ?? null,
    autopilotConfig: input.autopilotConfig ?? null,
    templateId: input.templateId ?? null,
    stageResults: input.initialStageResults ?? {},
    iterationCount: input.initialIterationCount ?? 0,
    lastError: null,
    pipelineSettings: input.pipelineSettings ?? DEFAULT_PIPELINE_SETTINGS,
    creditSettings: input.creditSettings ?? DEFAULT_CREDIT_SETTINGS,
    paused: input.initialPaused ?? false,
    pauseReason: input.initialPauseReason ?? null,
  }),
  initial: 'setup',
  on: {
    PAUSE: { actions: 'pauseAuto' },
    SET_PROJECT_TITLE: { actions: 'setProjectTitle' },
    STAGE_PROGRESS: { actions: 'mergeStageProgress' },
    NAVIGATE: [ /* existing */ ],
    REDO_FROM: [ /* existing */ ],
    RESET_TO_SETUP: { target: '.setup', actions: 'clearAllResults' },
    GO_AUTOPILOT: { actions: ['setMode', 'setAutopilotConfig'] },
    // REQUEST_ABORT handled by orchestrator-side fetch; machine doesn't need a transition for it.
  },
  states: {
    setup: {
      on: {
        SETUP_COMPLETE: [
          { guard: 'startsAtBrainstorm', target: 'brainstorm', actions: 'applySetup' },
          { guard: 'startsAtResearch',   target: 'research',   actions: 'applySetup' },
          { guard: 'startsAtDraft',      target: 'draft',      actions: 'applySetup' },
          { guard: 'startsAtReview',     target: 'review',     actions: 'applySetup' },
          { guard: 'startsAtAssets',     target: 'assets',     actions: 'applySetup' },
          { guard: 'startsAtPreview',    target: 'preview',    actions: 'applySetup' },
          { guard: 'startsAtPublish',    target: 'publish',    actions: 'applySetup' },
        ],
      },
    },
    brainstorm: { /* existing substates */ },
    research:   { /* existing */ },
    draft: {
      // existing idle/error substates kept verbatim
      on: {
        DRAFT_COMPLETE: [
          { guard: 'shouldSkipReview', target: 'assets', actions: 'saveDraftResult' },
          { target: 'review', actions: 'saveDraftResult' },
        ],
        STAGE_ERROR: { target: '.error', actions: 'recordError' },
      },
    },
    review:  { /* existing */ },
    assets:  { /* existing */ },
    preview: { /* existing */ },
    publish: { /* existing */ },
  },
})
```

> Drop `toggleMode` action and `TOGGLE_AUTO_PILOT` event from the `on` block. Drop `isAutoMode`/`isStepMode` if no longer referenced; otherwise update them to use `'supervised'` semantics.

- [ ] **Step 4: Update guards.ts mode references**

`isAutoMode` likely becomes `mode === 'supervised' || mode === 'overview'`. Update each guard.

- [ ] **Step 5: Run machine tests — expect PASS**

Run: `npx vitest run apps/app/src/lib/pipeline/__tests__/machine.test.ts`

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/lib/pipeline/machine.ts apps/app/src/lib/pipeline/guards.ts \
        apps/app/src/lib/pipeline/__tests__/machine.test.ts
git commit -m "feat(pipeline): setup state + SETUP_COMPLETE/GO_AUTOPILOT/RESET_TO_SETUP"
```

### Task 5.3: `abortRequester` actor (spawn-on-event, no dedicated state)

**Decision:** No dedicated `aborting` parent state. XState v5 has no built-in "previous state" target, and a context-stored prior stage adds complexity without benefit — the abort flag lives in the database, polled by `PipelineAbortProvider`, which is the actual source of truth. The machine just needs to fire the PATCH and surface a toast on failure. On success, the orchestrator's existing `paused` flag (set when polling sees `abort_requested_at`) takes care of the UI; we also call `pauseAuto` immediately for snappy local feedback.

**Files:**
- Modify: `apps/app/src/lib/pipeline/actors.ts`
- Modify: `apps/app/src/lib/pipeline/machine.ts`
- Test: `apps/app/src/lib/pipeline/__tests__/actors.test.ts`
- Test: `apps/app/src/lib/pipeline/__tests__/machine.test.ts`

- [ ] **Step 1: Add the actor**

```ts
// actors.ts
import { fromPromise } from 'xstate'

export const abortRequester = fromPromise(async ({ input }: { input: { projectId: string } }) => {
  const res = await fetch(`/api/projects/${input.projectId}/abort`, { method: 'PATCH' })
  if (!res.ok) throw new Error('Failed to request abort')
})
```

- [ ] **Step 2: Wire into machine via spawn on REQUEST_ABORT**

```ts
// machine.ts — register the actor alongside reproduceActor
setup({
  // ...
  actors: { reproduceActor, abortRequester },
  actions: {
    // ...
    spawnAbortRequester: assign({
      // We don't need to retain the spawned ref; it's fire-and-forget.
      // onError surfaces via the `xstate.error.actor.<id>` event below.
    }, ({ context, spawn, self }) => {
      spawn('abortRequester', {
        input: { projectId: context.projectId },
        // anonymous spawn — error event is `xstate.error.actor.*`; rely on
        // sendBack pattern instead for typed error capture.
        syncSnapshot: false,
      })
      // Optimistic local pause; the polling layer will confirm via DB flag.
      return {}
    }),
  },
})
.createMachine({
  id: 'pipeline',
  // ...
  on: {
    REQUEST_ABORT: { actions: ['pauseAuto', 'spawnAbortRequester'] },
    // Surface failures from the spawned actor:
    'xstate.error.actor.abortRequester': {
      actions: ['recordActorError', 'resumeAuto', 'showAbortFailedToast'],
    },
  },
})
```

If the codebase already uses an alternative pattern for fire-and-forget actors (e.g. invoking from a transient state with `always` to return), match that pattern instead. The ONLY hard requirements are: (a) PATCH fires, (b) success leaves `paused: true`, (c) failure restores `paused: false` and shows the toast.

- [ ] **Step 3: Test the actor in isolation**

```ts
import { createActor } from 'xstate'
import { abortRequester } from '../actors'

it('PATCHes /api/projects/:id/abort on input.projectId', async () => {
  const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchSpy)
  const actor = createActor(abortRequester, { input: { projectId: 'p1' } })
  actor.start()
  await new Promise((r) => actor.subscribe((s) => s.status === 'done' && r(undefined)))
  expect(fetchSpy).toHaveBeenCalledWith('/api/projects/p1/abort', { method: 'PATCH' })
})

it('rejects on non-2xx', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  const actor = createActor(abortRequester, { input: { projectId: 'p1' } })
  actor.start()
  await expect(new Promise((_, rej) => actor.subscribe({ error: rej })))
    .rejects.toThrow(/Failed to request abort/)
})
```

- [ ] **Step 4: Test the machine integration (REQUEST_ABORT pause + toast on failure)**

```ts
it('REQUEST_ABORT optimistically sets paused=true and fires PATCH', async () => {
  const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchSpy)
  // boot machine into draft mid-run, then send REQUEST_ABORT
  actor.send({ type: 'REQUEST_ABORT' })
  expect(actor.getSnapshot().context.paused).toBe(true)
  await tick()
  expect(fetchSpy).toHaveBeenCalledWith('/api/projects/p1/abort', { method: 'PATCH' })
})

it('on PATCH failure, machine reverts paused and surfaces toast', async () => {
  const toastSpy = vi.fn()
  vi.mock('@/lib/toast', () => ({ toast: { error: toastSpy } }))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  actor.send({ type: 'REQUEST_ABORT' })
  await tick()
  expect(actor.getSnapshot().context.paused).toBe(false)
  expect(toastSpy).toHaveBeenCalled()
})
```

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/lib/pipeline/actors.ts apps/app/src/lib/pipeline/machine.ts \
        apps/app/src/lib/pipeline/__tests__/actors.test.ts \
        apps/app/src/lib/pipeline/__tests__/machine.test.ts
git commit -m "feat(pipeline): abortRequester spawn-on-event with toast on failure"
```

### Task 5.4: `mapLegacyToSnapshot` + tri-mode `normalizeMode`

**Files:**
- Modify: `apps/app/src/lib/pipeline/legacy-state-migration.ts`
- Test: `apps/app/src/lib/pipeline/__tests__/legacy-state-migration.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { mapLegacyToSnapshot } from '../legacy-state-migration'

describe('normalizeMode', () => {
  it("'auto' → 'supervised'", () => {
    const snap = mapLegacyToSnapshot({ mode: 'auto', stageResults: { brainstorm: {} } })
    expect(snap?.context.mode).toBe('supervised')
  })
  it("'step' → 'step-by-step'", () => {
    const snap = mapLegacyToSnapshot({ mode: 'step', stageResults: { brainstorm: {} } })
    expect(snap?.context.mode).toBe('step-by-step')
  })
  it("'step-by-step' input is preserved (NOT a legacy marker)", () => {
    const snap = mapLegacyToSnapshot({ mode: 'step-by-step', stageResults: { brainstorm: {} } })
    expect(snap?.context.mode).toBe('step-by-step')
  })
  it("'overview' is preserved", () => {
    const snap = mapLegacyToSnapshot({ mode: 'overview', stageResults: { brainstorm: {} } })
    expect(snap?.context.mode).toBe('overview')
  })
})

describe('mapLegacyToSnapshot', () => {
  it('returns null for empty input (fresh project → input path)', () => {
    expect(mapLegacyToSnapshot(null)).toBeNull()
    expect(mapLegacyToSnapshot({})).toBeNull()
  })

  it('builds an active snapshot at the saved stage that boots a real actor', () => {
    // Behavior test, not shape test: cast-through-unknown can hide missing
    // context fields. The only way to know the snapshot is valid is to feed it
    // back into createActor and confirm it starts.
    const snap = mapLegacyToSnapshot({ mode: 'auto', currentStage: 'draft', stageResults: { brainstorm: {}, research: {} } })
    expect(snap).not.toBeNull()
    const actor = createActor(pipelineMachine, { snapshot: snap! })
    actor.start()
    const state = actor.getSnapshot()
    expect(state.value).toBe('draft')
    expect(state.context.mode).toBe('supervised')
    expect(state.context.autopilotConfig).toBeNull()  // legacy rows always null
    expect(state.context.templateId).toBeNull()
    expect(Object.keys(state.context.stageResults)).toEqual(expect.arrayContaining(['brainstorm', 'research']))
  })

  it('hydrated actor accepts subsequent events (proves snapshot is well-formed)', () => {
    const snap = mapLegacyToSnapshot({ mode: 'auto', currentStage: 'draft', stageResults: { brainstorm: {}, research: {} } })!
    const actor = createActor(pipelineMachine, { snapshot: snap })
    actor.start()
    actor.send({ type: 'STAGE_ERROR', error: 'test' })
    expect(actor.getSnapshot().value).toMatchObject({ draft: 'error' })
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Update file**

```ts
// legacy-state-migration.ts (replace existing exports as needed)

import type { Snapshot } from 'xstate'
import type { pipelineMachine } from './machine'
import { PIPELINE_STAGES } from '@/components/engines/types'
import type { AutopilotConfig } from '@brighttale/shared'

type NewMode = 'step-by-step' | 'supervised' | 'overview' | null

function normalizeMode(mode: unknown): NewMode {
  if (mode === 'auto') return 'supervised'
  if (mode === 'step' || mode === 'step-by-step') return 'step-by-step'
  if (mode === 'supervised' || mode === 'overview') return mode
  return null
}

function looksLegacy(x: { currentStage?: unknown; autoConfig?: unknown }): boolean {
  // 'step-by-step' is now the canonical mode value — must NOT be a legacy marker
  return x.currentStage !== undefined || x.autoConfig !== undefined
}

interface MigratedPipelineInput {
  mode: NewMode
  initialStage: PipelineStage
  initialStageResults: StageResultMap
  initialIterationCount: number
  initialPaused: boolean
  initialPauseReason: PauseReason | null
  autopilotConfig: AutopilotConfig | null
}

export function mapLegacyPipelineState(raw: unknown): MigratedPipelineInput | null { /* ...existing logic, swap normalizeMode + add autopilotConfig: null... */ }

export function mapLegacyToSnapshot(raw: unknown): Snapshot<typeof pipelineMachine> | null {
  const migrated = mapLegacyPipelineState(raw)
  if (!migrated) return null
  return {
    value: migrated.initialStage,
    context: {
      mode: migrated.mode,
      iterationCount: migrated.initialIterationCount,
      stageResults: migrated.initialStageResults,
      autopilotConfig: migrated.autopilotConfig ?? null,
      templateId: null,
      lastError: null,
      // remaining context fields populated from machine defaults at hydration time
    },
    status: 'active',
  } as unknown as Snapshot<typeof pipelineMachine>
}
```

- [ ] **Step 4: Update `PipelineActorProvider` boot path**

Wherever the provider currently calls `mapLegacyPipelineState`, switch to:

```ts
const snapshot = mapLegacyToSnapshot(initialPipelineState)
const [state, send] = useMachine(pipelineMachine, snapshot ? { snapshot } : { input })
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `npx vitest run apps/app/src/lib/pipeline`

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/lib/pipeline/legacy-state-migration.ts \
        apps/app/src/lib/pipeline/__tests__/legacy-state-migration.test.ts \
        apps/app/src/lib/pipeline/PipelineActorProvider.tsx 2>/dev/null \
        apps/app/src/lib/pipeline/actor-provider.tsx 2>/dev/null
git commit -m "feat(pipeline): mapLegacyToSnapshot + tri-mode normalize"
```

---

## Wave 6 — Wizard UI + mid-flow sheet + channel modal + helper

> **Deploy:** Must ship together with Waves 5+7+8.

### Task 6.1: `deepMergeAutopilotConfig` helper

**Files:**
- Create: `apps/app/src/lib/pipeline/deepMergeAutopilotConfig.ts`
- Test: `apps/app/src/lib/pipeline/__tests__/deepMergeAutopilotConfig.test.ts`

- [ ] **Step 1: Tests**

```ts
import { describe, it, expect } from 'vitest'
import { deepMergeAutopilotConfig } from '../deepMergeAutopilotConfig'

const base: any = { defaultProvider: 'recommended', brainstorm: { providerOverride: null, mode: 'topic_driven', topic: 'x' }, research: null, canonicalCore: { providerOverride: null, personaId: null }, draft: { providerOverride: null, format: 'blog', wordCount: 1200 }, review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 }, assets: { providerOverride: null, mode: 'briefing' } }

describe('deepMergeAutopilotConfig', () => {
  it('merges shallow patch into matching slot', () => {
    const out = deepMergeAutopilotConfig(base, { draft: { wordCount: 2000 } } as any)
    expect(out.draft.wordCount).toBe(2000)
    expect(out.draft.format).toBe('blog')
  })
  it('preserves null slots — patch never resurrects them', () => {
    const out = deepMergeAutopilotConfig(base, { research: { depth: 'deep' } } as any)
    expect(out.research).toBeNull()
  })
  it('throws if base is null', () => {
    expect(() => deepMergeAutopilotConfig(null as any, {})).toThrow(/non-null base/)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement (per spec section 9.4)**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pipeline): deepMergeAutopilotConfig helper"
```

### Task 6.2: `PipelineWizard` component

**Files:**
- Create: `apps/app/src/components/pipeline/PipelineWizard.tsx`
- Test: `apps/app/src/components/pipeline/__tests__/PipelineWizard.test.tsx`

- [ ] **Step 1: Write the wizard→API contract test in full (most load-bearing)**

```ts
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { PipelineWizard } from '../PipelineWizard'

function renderWizard(opts: { sendSpy?: ReturnType<typeof vi.fn> } = {}) {
  const sendSpy = opts.sendSpy ?? vi.fn()
  // Mock the actor provider — same pattern as PipelineOrchestrator.behavior.test.tsx
  vi.mock('@/lib/pipeline/PipelineActorContext', () => ({
    usePipelineActor: () => ({
      state: { value: 'setup', context: { projectId: 'p1', channelId: 'c1', stageResults: {} } },
      send: sendSpy,
    }),
  }))
  vi.mock('@/lib/pipeline/PipelineSettingsProvider', () => ({
    usePipelineSettings: () => ({
      defaultProviders: { brainstorm: 'gemini', research: 'gemini', canonicalCore: 'openai', draft: 'anthropic', review: 'gemini', assets: 'gemini' },
    }),
  }))
  return { sendSpy, ...render(<PipelineWizard />) }
}

it('on submit, posts setup payload then sends SETUP_COMPLETE with the same shape', async () => {
  const fetchSpy = vi.fn().mockResolvedValue({
    ok: true, json: async () => ({ data: { ok: true }, error: null }),
  })
  vi.stubGlobal('fetch', fetchSpy)
  const { sendSpy } = renderWizard()

  // Pick supervised mode + fill the topic_driven brainstorm fields
  await userEvent.click(screen.getByLabelText(/supervised/i))
  await userEvent.type(screen.getByLabelText(/topic/i), 'AI agents')
  // Defaults satisfy the rest of the form (admin defaults + Zod parse)

  await userEvent.click(screen.getByRole('button', { name: /start autopilot \(supervised\)/i }))

  await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
  const [url, init] = fetchSpy.mock.calls[0]
  expect(url).toBe('/api/projects/p1/setup')
  expect(init.method).toBe('POST')
  const body = JSON.parse(init.body as string)
  expect(body.mode).toBe('supervised')
  expect(body.startStage).toBe('brainstorm')
  expect(body.autopilotConfig.brainstorm.topic).toBe('AI agents')
  expect(body.autopilotConfig.review.maxIterations).toBeGreaterThanOrEqual(0)

  // Wizard must dispatch SETUP_COMPLETE with the SAME payload (machine doesn't re-fetch)
  expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({
    type: 'SETUP_COMPLETE', mode: 'supervised', startStage: 'brainstorm',
  }))
})
```

This is the load-bearing test — it locks the wizard→API contract end-to-end. The remaining tests are scaffolds; flesh out each before its corresponding implementation step. Do not commit with `/* ... */` placeholders.

- [ ] **Step 2: Add scaffold tests (must be filled in before commit)**

```ts
it('renders all 6 stage sections for a fresh project', () => {
  // Render with empty stageResults; assert <details> elements for each of:
  // brainstorm, research, canonicalCore, draft, review, assets
})

it('disables completed stages with "Already done" badge', () => {
  // Render with stageResults: { brainstorm: { ... }, research: { ... } };
  // assert those <details> elements have aria-disabled + show "Already done"
})

it('switches submit CTA label by mode', async () => {
  // step-by-step → "Start step-by-step →"
  // supervised   → "Start autopilot (supervised) →"
  // overview     → "Start autopilot (overview) →"
})

it('expands <details> containing errors on submit', async () => {
  // Submit a form that fails Zod review.hardFailThreshold check;
  // assert the review <details open> attribute is true and scrollIntoView was called.
})

it('Save as new posts to /api/autopilot-templates with isDefault flag', async () => {
  // Click "Save as new", fill name + isDefault, assert POST body.
})

it('Update template "X" shows confirm dialog then PUTs', async () => {
  // Load a template, dirty the form, click "Update template", assert confirm
  // dialog text + PUT call.
})
```

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Implement the component**

Build per spec section 8.1:
- `react-hook-form` + Zod resolver against `setupProjectSchema`.
- Sticky header (channel chip + template dropdown + Save buttons), sticky submit footer.
- Sections in order: mode radio, default provider, 6 collapsible `<details>` cards.
- Disabled stages: read-only summary derived from `stageResults`. Their slot in the form value derives from completed results so "Save as template" produces a complete config.
- Submit: `await fetch('/api/projects/:id/setup', { method: 'POST', body: JSON.stringify(form) })` then `send({ type: 'SETUP_COMPLETE', ...form })`.

Pull provider/model lists from existing `PipelineSettingsProvider`.

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(pipeline): PipelineWizard component"
```

### Task 6.3: `MiniWizardSheet`

**Files:**
- Create: `apps/app/src/components/pipeline/MiniWizardSheet.tsx`
- Test: `apps/app/src/components/pipeline/__tests__/MiniWizardSheet.test.tsx`

- [ ] **Step 1: Tests** (scaffolds — flesh out each before commit; the GO_AUTOPILOT contract test is load-bearing)

```ts
it('pre-fills upstream slots from admin defaults when no autopilotConfig exists', () => {
  // Mount with mode='step-by-step' (no existing config); assert form's upstream
  // brainstorm/research slots match adminDefaults.defaultProviders.
})

it('renders read-only summary cards for completed stages', () => {
  // Mount with stageResults.brainstorm + .research populated; assert those
  // cards render summaries (read-only) and remaining slots are editable.
})

it('submit dispatches GO_AUTOPILOT with a COMPLETE AutopilotConfig (never partial)', async () => {
  const sendSpy = vi.fn()
  // mount with usePipelineActor mocked to expose sendSpy + a draft-stage state
  // userEvent.click submit
  // expect sendSpy to be called with type=GO_AUTOPILOT and autopilotConfig
  //   that satisfies autopilotConfigSchema.parse() — assert .parse() does not throw.
  expect(() => autopilotConfigSchema.parse(sendSpy.mock.calls[0][0].autopilotConfig)).not.toThrow()
})

it('rejects an invalid config inline (server-side schema)', () => {
  // Set review.hardFailThreshold >= autoApprove; assert error message renders
  // inline before any network call.
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement per spec section 8.2**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pipeline): MiniWizardSheet for mid-flow GO_AUTOPILOT"
```

### Task 6.4: `PickChannelModal`

**Files:**
- Create: `apps/app/src/components/pipeline/PickChannelModal.tsx`
- Test: `apps/app/src/components/pipeline/__tests__/PickChannelModal.test.tsx`

- [ ] **Step 1: Test that the modal**:
  - Renders only for legacy projects with `channel_id IS NULL`.
  - Is unskippable (no close button, ESC disabled).
  - PATCHes `/api/projects/:id { channelId }` and reloads.

- [ ] **Step 2: Implement + run tests**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(pipeline): PickChannelModal for legacy NULL projects"
```

### Task 6.5: Templates admin page

**Files:**
- Create: `apps/app/src/app/channels/[id]/autopilot-templates/page.tsx`

- [ ] **Step 1: List + create + delete UI**

Wire to `/api/autopilot-templates?channelId=<uuid>`. Match the styling of existing channel admin pages (look at `apps/app/src/app/channels/[id]/`).

- [ ] **Step 2: Smoke-test in dev**

Run: `npm run dev:app` and walk through create / set default / delete.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(app): channel autopilot-templates admin page"
```

---

## Wave 7 — Overview + abort polling

> **Deploy:** Must ship together with Waves 5+6+8.

### Task 7.1: `PipelineAbortProvider`

**Files:**
- Create: `apps/app/src/components/pipeline/PipelineAbortProvider.tsx`
- Test: `apps/app/src/components/pipeline/__tests__/PipelineAbortProvider.test.tsx`

- [ ] **Step 1: Write the abort-on-flag-change test in full (load-bearing — locks the contract)**

```ts
import { renderHook, act } from '@testing-library/react'
import { vi } from 'vitest'

it('calls controller.abort() within one polling tick after abort_requested_at flips', async () => {
  vi.useFakeTimers()
  let abortAt: string | null = null
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, json: async () => ({ data: { abortRequestedAt: abortAt }, error: null }),
  })))

  const wrapper = ({ children }: any) => (
    <PipelineAbortProvider projectId="p1" machineState="running" currentStage="draft" isPaused={false}>
      {children}
    </PipelineAbortProvider>
  )
  const { result } = renderHook(() => usePipelineAbort(), { wrapper })
  const controller = result.current!
  expect(controller.signal.aborted).toBe(false)

  // Tick past the 3s interval — flag still null, still not aborted
  await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
  expect(controller.signal.aborted).toBe(false)

  // Flip the flag; next poll tick should abort
  abortAt = '2026-04-28T00:00:00Z'
  await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
  expect(controller.signal.aborted).toBe(true)

  vi.useRealTimers()
})
```

- [ ] **Step 1b: Add scaffold tests (flesh out each before commit — do not leave `/* ... */`)**

```ts
it('polls every 3s while not setup/done', async () => {
  // assert fetch called once per 3s tick; assert NOT called when machineState='setup'
})
it('backs off to 10s when isPaused=true', () => {
  // assert fetch called once per 10s tick (not 3s)
})
it('stops polling on setup and publish.done', () => {
  // assert fetch never called when machineState='setup' or 'done'
})
it('mints a fresh AbortController on stage entry', () => {
  // rerender with currentStage='review'; assert returned controller is a new instance
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```tsx
'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'

const Ctx = createContext<AbortController | null>(null)
export const usePipelineAbort = () => useContext(Ctx)

export function PipelineAbortProvider({ projectId, machineState, currentStage, isPaused, children }: {
  projectId: string
  machineState: 'setup' | 'running' | 'done'
  currentStage: string
  isPaused: boolean
  children: React.ReactNode
}) {
  const [controller, setController] = useState<AbortController | null>(() => new AbortController())
  const lastAbortAtRef = useRef<string | null>(null)

  useEffect(() => {
    setController(new AbortController())
  }, [currentStage])

  useEffect(() => {
    if (machineState === 'setup' || machineState === 'done') return
    const interval = isPaused ? 10_000 : 3_000
    const tick = async () => {
      const res = await fetch(`/api/projects/${projectId}`, { headers: { 'Cache-Control': 'max-age=1' } })
      if (!res.ok) return
      const { data } = await res.json()
      const next = data?.abortRequestedAt ?? null
      if (next !== lastAbortAtRef.current) {
        lastAbortAtRef.current = next
        if (next) controller?.abort()
      }
    }
    const id = setInterval(tick, interval)
    return () => clearInterval(id)
  }, [projectId, machineState, isPaused, controller])

  return <Ctx.Provider value={controller}>{children}</Ctx.Provider>
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pipeline): PipelineAbortProvider with polling-based abort signal"
```

### Task 7.2: `OverviewProgressRail` + `OverviewStageResults` + `PipelineOverview`

**Files:**
- Create: `apps/app/src/components/pipeline/OverviewProgressRail.tsx`
- Create: `apps/app/src/components/pipeline/OverviewStageResults.tsx`
- Create: `apps/app/src/components/pipeline/PipelineOverview.tsx`
- Test: `apps/app/src/components/pipeline/__tests__/PipelineOverview.test.tsx`

- [ ] **Step 1: Tests covering**:
  - 7-stage rail with each status icon (`✓`/`◐`/`○`/`⏸`/`✗`/`⊘`).
  - Right column renders one card per stage, with `Open ... engine →` for completed stages.
  - "Open engine" calls `setShowEngine(stage)` (prop) — not `router.push`.
  - Skipped review (`maxIterations === 0`) shows "Skipped" badge.
  - Pause-at-gate inline panel renders when `review.score < hardFailThreshold`.
  - Pause click dispatches `REQUEST_ABORT`.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement per spec section 8.3**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pipeline): PipelineOverview with progress rail + stage cards"
```

### Task 7.3: Wire `usePipelineAbort` into engines

**Files:**
- Modify: `apps/app/src/components/engines/{Brainstorm,Research,Draft,Review,Assets,Preview,Publish}Engine.tsx`

- [ ] **Step 1: For each engine fetch call**, pass the controller's signal:

```ts
const controller = usePipelineAbort()
// ...
await fetch(url, { method: 'POST', body, signal: controller?.signal })
```

- [ ] **Step 2: Add a unit test per engine confirming AbortError surfaces correctly**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(engines): consume PipelineAbortProvider signal on all fetch calls"
```

### Task 7.4: Handle `'aborted'` job stage in progress UI

**Files:**
- Modify: `apps/app/src/components/generation/GenerationProgressFloat.tsx`
- Modify: `apps/app/src/components/generation/GenerationProgressModal.tsx`

- [ ] **Step 1: Add a switch arm for `'aborted'`**

```tsx
case 'aborted':
  return <span className="text-amber-700">Paused</span>
```

- [ ] **Step 2: Smoke check**

`npm run dev` → trigger pause via dev tools → verify the indicator switches to "Paused".

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(ui): render 'aborted' job stage as Paused indicator"
```

---

## Wave 8 — Orchestrator render branches + entry-point routing + `auto_advance` sweep

> **Deploy:** Must ship together with Waves 5+6+7.

### Task 8.1: `PipelineOrchestrator` render branches

**Files:**
- Modify: `apps/app/src/components/pipeline/PipelineOrchestrator.tsx`
- Test: `apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.behavior.test.tsx`

- [ ] **Step 1: Update tests to cover the render branches** (scaffolds — flesh out each before commit; one assertion per branch is enough)

```ts
it('renders <PipelineWizard /> when state.matches("setup")', () => {
  // mock state.value='setup'; assert screen.getByTestId('pipeline-wizard')
})
it("renders <PipelineOverview /> when mode='overview' and showEngine is null", () => {
  // mock state.value='draft', mode='overview'; assert screen.getByTestId('pipeline-overview')
})
it("renders engine when mode='overview' and showEngine is set", () => {
  // same as above + click an "Open engine" button; assert engine renders
})
it("renders engine for 'step-by-step' / 'supervised' modes", () => {
  // assert engine for current top stage renders, no overview
})
it('"← Back to overview" button clears showEngine state', () => {
  // open engine, click back, assert overview re-renders
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement the render branch (per spec section 3.1)**

```tsx
const [showEngine, setShowEngine] = useState<PipelineStage | null>(null)
const topStage: PipelineStage = typeof state.value === 'string'
  ? state.value
  : (Object.keys(state.value)[0] as PipelineStage)

if (state.matches('setup'))            return <PipelineWizard />
if (mode === 'overview' && !showEngine) return <PipelineOverview onOpenEngine={setShowEngine} />
const stageToRender = showEngine ?? topStage
return (
  <>
    {showEngine && <Button onClick={() => setShowEngine(null)}>← Back to overview</Button>}
    <CurrentEngineForStage stage={stageToRender} />
  </>
)
```

- [ ] **Step 4: Replace `<AutoModeControls />` site**

Find the existing `TOGGLE_AUTO_PILOT` button site. Replace with a "Reconfigure..." or "Go Autopilot" button that opens `<MiniWizardSheet />`.

- [ ] **Step 5: Wrap with `<PipelineAbortProvider />`**

In the project page (`apps/app/src/app/projects/[id]/...`), wrap the orchestrator subtree.

- [ ] **Step 6: Run tests — expect PASS**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(pipeline): orchestrator render branches for setup/overview/engine"
```

### Task 8.2: Entry-point `startStage` derivation

**Files:**
- Modify: project creation entry endpoints (look in `apps/api/src/routes/projects.ts` for "from idea" / "from research" / "from blog content" creation paths)

- [ ] **Step 1: Verify which projects-table columns the entry-point hint can rely on**

```bash
grep -nE 'idea_id|blog_draft_id|research_id' supabase/migrations/*.sql | grep -i 'projects'
```

Expected: at minimum `research_id` is present (confirmed by the spec's `assertProjectOwner` legacy fallback). If `idea_id` / `blog_draft_id` columns DO exist, use them. If they DO NOT, derive the entry-point from one of:
1. `projects.pipeline_state_json->'stageResults'` keys (presence of brainstorm/research/draft).
2. A join through `idea_archives.project_id` / `blog_drafts.project_id` (look in `packages/shared/src/types/database.ts` after Wave 1 regen — search for back-references to `projects(id)`).
3. The creation route's explicit `entry_source` field (if added in this task).

Document the resolved approach in this task before continuing — do NOT silently substitute one source for another. Whatever you pick must round-trip through `nextStageAfter` from Task 3.2.

- [ ] **Step 2: Each creation path writes `channel_id` and stamps the entry-point**:
  - Fresh: `startStage = 'brainstorm'`, no completed stages
  - From idea: `startStage = 'research'`, brainstorm marked completed in `stageResults`
  - From research session: `startStage = 'draft'`, brainstorm + research marked completed
  - From blog content: `startStage = 'review'`, all upstream marked completed

These don't trigger setup directly — the orchestrator opens the wizard pre-filled with disabled upstream stages, derived from `stageResults` (Step 1's choice).

- [ ] **Step 3: Update wizard to receive entry-point hint** from `stageResults` presence and disable matching stage cards.

- [ ] **Step 4: Tests in `PipelineWizard.test.tsx` for each entry-point** (one assertion each: which stages are disabled, what the submit CTA reads, what `startStage` is sent in the POST body).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(pipeline): entry-point derived startStage + disabled stage cards"
```

### Task 8.3: `RESET_TO_SETUP` redo-modal flow

**Files:**
- Modify: `apps/app/src/components/pipeline/PipelineOrchestrator.tsx` (or wherever the existing redo-modal lives)
- Test: `apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.behavior.test.tsx`

- [ ] **Step 1: Tests for the three redo strategies** (scaffolds — flesh out before commit)

```ts
it('Redo from start (wipe) dispatches RESET_TO_SETUP and clears stageResults', () => {
  // const sendSpy = vi.fn(); render orchestrator; click "Redo from start" then "Wipe";
  // expect(sendSpy).toHaveBeenCalledWith({ type: 'RESET_TO_SETUP' })
})
it('Redo from start (clone) POSTs to /api/projects with the same channelId + autopilotConfig and routes to the new project', () => {
  // mock fetch returning { data: { id: 'p2' } }; click "Clone";
  // expect fetch called with channelId + autopilotConfigJson; expect router.push('/projects/p2')
})
it('Redo from start (new) router.pushes /projects/new without dispatching to machine', () => {
  // const sendSpy = vi.fn(); click "Start new"; expect router.push called, sendSpy NOT.
})
```

- [ ] **Step 2: Implement per spec section 3 / wave plan Wave 8**

- [ ] **Step 3: Run tests — expect PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(pipeline): RESET_TO_SETUP redo flow (wipe/clone/new)"
```

### Task 8.4: `auto_advance` → `mode` code sweep (5 sites)

- [ ] **Step 1: Find all production references**

```bash
grep -rn 'auto_advance\|autoAdvance' apps/ packages/ --include='*.ts' --include='*.tsx' --include='*.sql'
```

- [ ] **Step 2: For each hit**:
  - Replace `auto_advance ? 'auto' : 'step'` with `project.mode === 'supervised' || project.mode === 'overview'`.
  - In creation paths, drop the `auto_advance` insert column.
  - Leave migrations untouched (history is immutable).

- [ ] **Step 3: Run typecheck + tests**

```bash
npm run typecheck && npm run test
```

Expected: green vs Wave 0 baseline.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: replace auto_advance reads with project.mode"
```

### Task 8.5: Mid-rollout alias coercion smoke (alias window still open)

> The `aiProviderSchemaWithAlias` Zod transform from Task 0.4 is dropped in Wave 9.2. This is the last wave where it's exercisable; verify it before the alias goes away.

- [ ] **Step 1: Run a unit-level alias parse smoke**

```bash
node -e "
const { aiProviderSchemaWithAlias } = require('./packages/shared/src/schemas/ai');
console.log(aiProviderSchemaWithAlias.parse('local'));
"
```

Expected output: `ollama`.

- [ ] **Step 2: Send a request through any API route that ingests `provider`** (e.g. POST to `/api/ai-config` with `{ provider: 'local', ... }`) and assert the persisted row stores `'ollama'`.

If no current route ingests provider strings client-side, mark this step N/A and document so in the commit message.

- [ ] **Step 3: Commit (or skip — no code change unless a route is missing the alias schema)**

```bash
git commit --allow-empty -m "chore: mid-rollout alias coercion smoke verified"
```

---

## Wave 9 — Cleanup, docs, grep verification

> **Deploy:** After acceptance smoke checklist passes.

### Task 9.1: Drop `auto_advance` column with grep verification

**Files:**
- Create: `supabase/migrations/20260428200000_drop_auto_advance.sql`

- [ ] **Step 1: Verify no production references remain**

```bash
grep -rn 'auto_advance' apps/ packages/ --include='*.ts' --include='*.tsx' --include='*.sql' \
  | grep -v 'supabase/migrations/' \
  | grep -v '__tests__/' \
  | head
```

Expected: empty.

- [ ] **Step 2: Write the migration**

```sql
alter table projects drop column auto_advance;
```

- [ ] **Step 3: Apply locally**

Run: `npm run db:push:dev && npm run db:types`

- [ ] **Step 4: Typecheck + test**

```bash
npm run typecheck && npm run test
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260428200000_drop_auto_advance.sql packages/shared/src/types/database.ts
git commit -m "feat(db): drop projects.auto_advance after mode migration"
```

### Task 9.2: Drop `aiProviderSchemaWithAlias`

**Files:**
- Modify: `packages/shared/src/schemas/ai.ts`
- Modify: any API ingestion routes that imported the alias.

- [ ] **Step 1: Verify zero `'local'` rows in DB**

```sql
select count(*) from ai_provider_configs where provider = 'local';
```

Expected: `0`.

- [ ] **Step 2: Remove the export + alias schema; update consumers to use `aiProviderSchema`**

- [ ] **Step 3: Run schema tests**

```bash
npx vitest run packages/shared/src/schemas/__tests__/ai.test.ts
```

Update tests to remove the alias assertions.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(schemas): drop aiProviderSchemaWithAlias alias window"
```

### Task 9.3: Delete dead `TOGGLE_AUTO_PILOT` references

```bash
grep -rn 'TOGGLE_AUTO_PILOT\|toggleMode' apps/ packages/
```

- [ ] **Step 1: Remove every match (event types, dispatchers, button handlers, tests).**

- [ ] **Step 2: Typecheck + test**

```bash
npm run typecheck && npm run test
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(pipeline): delete dead TOGGLE_AUTO_PILOT references"
```

### Task 9.4: Documentation sync

**Files:**
- Modify: `CLAUDE.md`
- Modify: `apps/docs-site/` pipeline page (find via `find apps/docs-site -name '*.mdx' | xargs grep -l 'pipeline'`)
- Verify: `.claude/rules/api-routes.md` ownership rule (added in Task 3.6)

- [ ] **Step 1: Fix CLAUDE.md framework wording**

Search for "Route Handlers" inside CLAUDE.md and replace with "Fastify-style handlers" wherever it describes `apps/api`.

```bash
grep -n 'Route Handlers' CLAUDE.md
```

- [ ] **Step 2: Add a short "Pipeline Setup" section to the docs-site pipeline page** describing the wizard, modes, templates, and abort flow.

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: sync pipeline docs + CLAUDE.md framework correction"
```

### Task 9.5: Final smoke checklist + acceptance gate

- [ ] **Step 1: Walk every checkbox in spec section 13** in dev (`npm run dev`):
  - Fresh project → wizard.
  - "From Research" project → brainstorm/research disabled.
  - Step-by-step / supervised / overview submits each lead to expected branch.
  - Pause from overview settles within ms; Inngest exits at next `step.run`; `content_drafts.status = 'paused'`.
  - Resume → flag cleared, fresh `AbortController`.
  - Inline pause-at-gate.
  - Switch to Supervised from overview.
  - Mid-flow GO_AUTOPILOT.
  - Template default-clearing (channel and global independent).
  - PickChannelModal on legacy projects.
  - Three redo strategies.
  - Legacy hydration.
  - `shouldSkipReview` corner case.
  - Provider rows: `select count(*) from ai_provider_configs where provider = 'local'` → `0`. (The alias schema is gone after 9.2, so testing coercion at this gate would always fail; verifying clean DB is the right end-state check.)
  - `assertProjectOwner` legacy fallback.
  - Mode backfill correctness (spot-check rows).

- [ ] **Step 2: Code-health gates (Wave 9 exit)**

```bash
npm run test 2>&1 | tee /tmp/test-final.log
diff <(grep -E '^( FAIL |❯ |×)' /tmp/test-final.log | sort) \
     <(sort docs/superpowers/specs/2026-04-28-test-baseline.txt)
```

Expected: no new failures vs baseline.

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: all green (lint warnings allowed if pre-existing).

- [ ] **Step 3: Confirm zero `--no-verify` on the branch**

```bash
git log --grep='no-verify' feat/pipeline-autopilot-wizard
```

Expected: empty.

- [ ] **Step 4: Tag the acceptance commit**

```bash
git tag -a pipeline-autopilot-wizard-accepted -m "Pipeline autopilot wizard acceptance"
```

(Don't push the tag without user confirmation.)

---

## Risks & Watchpoints

- **Wave 5 typecheck failures cascade.** Updating context types in 5.1 will break consumers all over `apps/app`. Plan to fix follow-on TS errors as part of Tasks 5.2–8.x; do not let them accumulate across multiple commits without a green build.
- **`mapLegacyToSnapshot` snapshot shape.** XState v5's `Snapshot` type expects all context fields. If TypeScript complains, add the missing fields with explicit defaults in `mapLegacyToSnapshot` rather than casting.
- **Polling at 3s × N projects.** If the request log shows storms in dev, drop the polling interval to 5s in `PipelineAbortProvider` and revisit. The mitigation lives in spec section 12.
- **`channel_id` NULL on legacy.** `assertProjectOwner` legacy fallback is the only thing keeping pre-channel projects accessible — do not drop it before all rows are backfilled (no migration plan exists for that yet).
- **Inngest jobs deployed mid-flight.** Wave 4 deploys backend abort plumbing. Existing in-flight jobs keep running because `assertNotAborted` is conditional on `projectId` — if the column already exists from Wave 1 and is `NULL`, the check no-ops. Confirm Wave 1 deployed before Wave 4.
- **`Update template "X"` is destructive across projects.** The confirm dialog must explicitly say "Future projects using this template will use these settings."
