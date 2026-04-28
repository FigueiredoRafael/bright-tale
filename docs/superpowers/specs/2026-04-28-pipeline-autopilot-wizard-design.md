# Pipeline Autopilot Wizard — Design Spec

**Status:** draft · **Date:** 2026-04-28 · **Branch:** `feat/pipeline-autopilot-wizard` _(provisional — confirm at sign-off; current dev is on `feat/pipeline-orchestrator-refactor`)_

---

## 1. Goal

Front-load mode + per-stage configuration when opening a project, introduce reusable autopilot templates, add an Overview page for unsupervised runs, and replace the in-flight `TOGGLE_AUTO_PILOT` toggle with a structured `GO_AUTOPILOT` flow. Pipe an immediate-abort signal end-to-end (browser fetch + Inngest jobs) so a Pause button settles within seconds rather than after the next stage.

The previous refactor (XState actor model, completed 2026-04-25) delivered the machine substrate. This design builds the user-facing layer on top: wizard → mode selector → per-stage form → either engine pages (supervised/step-by-step) or a 2-column overview dashboard.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **mode** | `'step-by-step' \| 'supervised' \| 'overview' \| null`. `null` only for fresh projects in `setup`. |
| **autopilotConfig** | Frozen JSON snapshot of all stage settings (provider per stage, depth, persona, format, thresholds, assets mode). Captured on `SETUP_COMPLETE`. |
| **template** | Saved `AutopilotConfig` reusable across projects. Scoped per (user, channel) or per user (global). One default per scope. |
| **start stage** | The first machine stage the project enters after setup. Derived from project entry point (fresh / from idea / from research / from blog content / resumed). |
| **setup state** | New top-level XState state. Fresh projects boot here; legacy snapshots boot directly into their saved stage. |
| **abort_requested_at** | Timestamp on `projects` row. Polling browser triggers `AbortController.abort()` on change. Inngest jobs check between every `step.run`. |
| **AGENT_FOR_AUTOPILOT_STAGE** | Lookup table mapping autopilot config stage (6 keys) to AI agent type used by the router. `canonicalCore` and `draft` both map to `'production'`. |

---

## 3. Architecture

### 3.1 Top-level render branches

`PipelineOrchestrator.tsx` (single component, single route at `/projects/[id]`) selects what to render based on machine state and `mode`:

```
state === 'setup'                                         → <PipelineWizard />
mode === 'overview' && !showEngine                        → <PipelineOverview />
mode === 'overview' && showEngine                         → <CurrentEngineForStage stage={showEngine} />
                                                            (with "← Back to overview" button)
otherwise (mode === 'step-by-step' | 'supervised')        → <CurrentEngineForStage stage={topStage} />
```

`state.value` is an object for stages with substates (e.g., `{ review: 'reviewing' }`); engines need the top-level key. Derive once:

```ts
const topStage: PipelineStage =
  typeof state.value === 'string'
    ? state.value
    : (Object.keys(state.value)[0] as PipelineStage)
```

`showEngine` is a local React state on the orchestrator — not a machine state. Used only by Overview's `Open ... engine →` action. Engines stay mounted under the same orchestrator instance, so the machine remains authoritative.

### 3.2 Mode semantics

- **`step-by-step`** — engine pages render, autopilot effects do not fire. User clicks "Continue" to advance each stage.
- **`supervised`** — engine pages render, autopilot effects fire (auto-advance after each stage's `*_COMPLETE` event). User can pause at any time.
- **`overview`** — `PipelineOverview` page renders, autopilot effects fire. Pause + per-stage drill-in available. Inline panels handle human gates without redirect.

`step-by-step` and `supervised` differ only in autopilot-effect activation. Engine components are identical.

### 3.3 Polling abort propagation

No SSE in v1 — the codebase has no `EventSource` infrastructure today. `PipelineAbortProvider` polls `GET /api/projects/:id` every 3s while machine state is **not** `setup` or `publish.done`, every 10s when current stage is in a `paused` substate, and stops entirely on `setup` and `publish.done`.

On `abort_requested_at` change → `AbortController.abort()` propagates to all in-flight engine fetches. New controller minted per stage entry or on `RESUME` event.

### 3.4 Cancellation pipeline (D2-B)

```
User clicks Pause                                                                  (Overview)
  ↓ requestAbort action (invoked promise actor; toast on failure)
PATCH /api/projects/:id/abort                                                      (apps/api)
  ↓ writes abort_requested_at = now()
Browser polling detects change within 3s
  ↓ controller.abort()
In-flight fetch                                                                    (engine)
  ↓ AbortError surfaces, user sees "Paused" state
Inngest job picks up the flag at next step.run boundary
  ↓ assertNotAborted(projectId, draftId) throws JobAborted (NonRetriableError)
content_drafts.status = 'paused', emitJobEvent('aborted')
```

User clicks Resume → `DELETE /api/projects/:id/abort` clears flag → `RESUME` event → machine re-enters current stage with fresh `AbortController`.

---

## 4. Database Schema

### 4.1 New table: `autopilot_templates`

```sql
CREATE TABLE autopilot_templates (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id      UUID REFERENCES channels(id) ON DELETE CASCADE,  -- NULL = global per user
  name            TEXT NOT NULL,
  config_json     JSONB NOT NULL,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_autopilot_templates_user_channel
  ON autopilot_templates(user_id, channel_id);

CREATE UNIQUE INDEX idx_autopilot_templates_one_channel_default
  ON autopilot_templates(user_id, channel_id)
  WHERE is_default = TRUE AND channel_id IS NOT NULL;

CREATE UNIQUE INDEX idx_autopilot_templates_one_global_default
  ON autopilot_templates(user_id)
  WHERE is_default = TRUE AND channel_id IS NULL;

CREATE TRIGGER trg_autopilot_templates_updated_at
  BEFORE UPDATE ON autopilot_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE autopilot_templates ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION clear_autopilot_default(p_user_id UUID, p_channel_id UUID)
RETURNS void LANGUAGE sql AS $$
  UPDATE autopilot_templates
     SET is_default = FALSE
   WHERE user_id = p_user_id
     AND channel_id IS NOT DISTINCT FROM p_channel_id
     AND is_default = TRUE;
$$;
```

### 4.2 New columns on `projects`

```sql
ALTER TABLE projects
  ADD COLUMN channel_id              UUID REFERENCES channels(id) ON DELETE SET NULL,
  ADD COLUMN mode                    TEXT,
  ADD COLUMN autopilot_config_json   JSONB,
  ADD COLUMN autopilot_template_id   TEXT REFERENCES autopilot_templates(id) ON DELETE SET NULL,
  ADD COLUMN abort_requested_at      TIMESTAMPTZ;

CREATE INDEX idx_projects_channel_id ON projects(channel_id);

UPDATE projects SET mode = CASE
  WHEN pipeline_state_json->>'mode' = 'auto'                    THEN 'supervised'
  WHEN auto_advance = TRUE AND pipeline_state_json IS NOT NULL  THEN 'supervised'
  WHEN pipeline_state_json IS NOT NULL                          THEN 'step-by-step'
  ELSE NULL
END;
```

`projects.channel_id` is **not backfilled from `research_archives`** — that table has no `channel_id`. Legacy projects with `NULL` `channel_id` trigger a one-time `<PickChannelModal />` on first reopen.

### 4.3 Modified table: `content_drafts`

```sql
ALTER TABLE content_drafts DROP CONSTRAINT IF EXISTS content_drafts_status_check;
ALTER TABLE content_drafts ADD CONSTRAINT content_drafts_status_check
  CHECK (status IN (
    'draft', 'in_review', 'approved', 'scheduled',
    'published', 'failed', 'awaiting_manual', 'publishing',
    'paused'
  ));
```

Lands in Wave 0 — must precede Wave 4's abort plumbing that writes `'paused'`.

### 4.4 Provider enum unification

`ai_provider_configs.provider` rows with `'local'` rename to `'ollama'` to match router code:

```sql
UPDATE ai_provider_configs SET provider = 'ollama' WHERE provider = 'local';
```

Zod schema `aiProviderSchema` updated to `['openai', 'anthropic', 'gemini', 'ollama']`. A sister schema `aiProviderSchemaWithAlias` accepts the legacy `'local'` value and coerces to `'ollama'` for one release window, applied only in API ingestion routes that may receive client-supplied provider strings:

```ts
export const aiProviderSchemaWithAlias = z.union([
  aiProviderSchema,
  z.literal('local').transform(() => 'ollama' as const),
])
```

Wave 9 drops `aiProviderSchemaWithAlias` after `ai_provider_configs` rows confirmed clean and admin UI migrated.

### 4.5 Pipeline settings extension

`pipeline_settings.default_providers_json` extended:

```sql
UPDATE pipeline_settings
   SET default_providers_json = jsonb_set(
     jsonb_set(
       default_providers_json,
       '{canonicalCore}',
       to_jsonb(COALESCE(default_providers_json->>'brainstorm', 'gemini')),
       true
     ),
     '{assets}',
     to_jsonb(COALESCE(default_providers_json->>'brainstorm', 'gemini')),
     true
   )
 WHERE NOT (default_providers_json ? 'canonicalCore' AND default_providers_json ? 'assets');
```

Backfill inherits from `brainstorm` to preserve user intent — admin can change later.

### 4.6 Cleanup (Wave 9)

```sql
ALTER TABLE projects DROP COLUMN auto_advance;
```

Pre-drop verification: `grep -rn 'auto_advance' apps/ packages/ --include='*.ts' --include='*.tsx' --include='*.sql'` returns no production hits.

---

## 5. Shared Schemas (Zod)

### 5.1 `autopilotConfigSchema`

`packages/shared/src/schemas/autopilotConfig.ts`:

```ts
import { z } from 'zod'
import { aiProviderSchema } from './ai'

const Provider = aiProviderSchema
const ProviderOrInherit = aiProviderSchema.nullable()  // null = inherit
const DefaultProvider = z.union([z.literal('recommended'), aiProviderSchema])

const BrainstormSlot = z.object({
  providerOverride: ProviderOrInherit,
  mode: z.enum(['topic_driven', 'reference_guided']),
  topic: z.string().trim().optional().nullable(),
  referenceUrl: z.preprocess(
    v => (v === '' ? null : v),
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
  personaId: z.string().nullable(),  // null = recommended
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
  maxIterations: z.number().int().min(0).max(20),       // 0 = skip review
  autoApproveThreshold: z.number().int().min(0).max(100),
  hardFailThreshold: z.number().int().min(0).max(100),
}).superRefine((v, ctx) => {
  if (v.hardFailThreshold >= v.autoApproveThreshold) {
    ctx.addIssue({
      code: 'custom',
      path: ['hardFailThreshold'],
      message: 'Must be lower than auto-approve threshold (else infinite loop)',
    })
  }
})

const AssetsSlot = z.object({
  providerOverride: ProviderOrInherit,
  mode: z.enum(['skip', 'manual', 'briefing', 'auto']),
})

export const autopilotConfigSchema = z.object({
  defaultProvider: DefaultProvider,
  brainstorm:    BrainstormSlot.nullable(),     // null = stage skipped (from research/blog entry)
  research:      ResearchSlot.nullable(),
  canonicalCore: CanonicalCoreSlot,
  draft:         DraftSlot,
  review:        ReviewSlot,
  assets:        AssetsSlot,
})

export type AutopilotConfig = z.infer<typeof autopilotConfigSchema>
```

### 5.2 `setupProjectSchema`

`packages/shared/src/schemas/projectSetup.ts`:

```ts
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
```

### 5.3 Mid-flow patch schema

`autopilotConfigPatchSchema = autopilotConfigSchema.deepPartial()` exists for template-load + form-edit only. **Mid-flow `GO_AUTOPILOT` submits a complete `AutopilotConfig`, not a patch** — the mini-wizard pre-fills upstream slots from admin defaults. Server validates against `autopilotConfigSchema.parse`, never `autopilotConfigPatchSchema.parse`.

---

## 6. API Surface

All endpoints live in `apps/api` (Fastify), guarded by `INTERNAL_API_KEY` middleware, scoped via `assertProjectOwner`.

### 6.1 Setup & abort

```
POST   /api/projects/:id/setup
       body: setupProjectSchema
       behavior: validate startStage matches pipeline_state_json completion;
                 write mode + autopilot_config_json + autopilot_template_id;
                 clear pipeline_state_json on fresh setup (not on resume)

PATCH  /api/projects/:id/abort
       body: {} → sets abort_requested_at = now()

DELETE /api/projects/:id/abort
       → clears abort_requested_at (called on RESUME)
```

`startStage` validation:

```ts
const project = await loadProject(id)
const completedStage = derivedFromStageResults(project.pipeline_state_json)
const expectedStart  = nextStageAfter(completedStage)
if (body.startStage !== expectedStart) {
  return fail(reply, 400, {
    code: 'STAGE_MISMATCH',
    message: `Cannot start at ${body.startStage}; project state requires ${expectedStart}`,
  })
}
```

`derivedFromStageResults` and `nextStageAfter` live in `apps/api/src/lib/pipeline-state.ts`.

### 6.2 Templates

```
GET    /api/autopilot-templates?channelId=<uuid>
       → list user's + channel's templates (channel-scoped grouped above globals)

POST   /api/autopilot-templates
       body: { name, channelId | null, configJson: AutopilotConfig, isDefault: boolean }
       behavior: if isDefault === true, run clear_autopilot_default(userId, channelId) RPC first

PUT    /api/autopilot-templates/:id
       body: partial of POST body
       behavior: same default-clearing rule on isDefault transition

DELETE /api/autopilot-templates/:id
       behavior: ON DELETE SET NULL on projects.autopilot_template_id (snapshot config_json preserved)
```

### 6.3 Ownership helper

`apps/api/src/lib/projects/ownership.ts`:

```ts
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
  if (project.research_id) {  // legacy fallback for NULL channel_id projects
    const { data: ra } = await sb
      .from('research_archives').select('user_id').eq('id', project.research_id).maybeSingle()
    if (ra?.user_id === userId) return
  }
  throw new ApiError(403, 'Forbidden', 'FORBIDDEN')
}
```

Document in `.claude/rules/api-routes.md`.

---

## 7. Machine Spec

### 7.1 States (flat — no `running` compound parent)

Existing machine substate shapes preserved verbatim. Only `setup` is new.

```
pipelineMachine
├── setup                                     ← NEW sibling, initial for fresh projects
├── brainstorm.{idle, error}
├── research.{idle, error}
├── draft.{idle, error}
├── review.{idle, reviewing, reproducing, paused, done, error}
├── assets.{idle, error}
├── preview.{idle, error}
└── publish.{idle, error, done}               ← publish.done is terminal (D1-B)
```

`reproducing` lives under `review` (it is the AI re-draft loop, scoped to the review stage). Stages other than `review` have only `idle` + `error` substates today; the wave plan does not introduce new substates.

### 7.2 Context

```ts
interface PipelineMachineContext {
  projectId: string
  channelId: string | null   // NULL for legacy projects
  mode: 'step-by-step' | 'supervised' | 'overview' | null
  autopilotConfig: AutopilotConfig | null
  templateId: string | null
  iterationCount: number
  stageResults: StageResults
  lastError: string | null
}
```

### 7.3 Events

| Event | Payload | Effect |
|---|---|---|
| `SETUP_COMPLETE` | `{ mode, autopilotConfig, templateId, startStage }` | Transitions setup → startStage, applies config |
| `RESET_TO_SETUP` | `{}` | Top-level handler. Returns to setup, clears all results |
| `GO_AUTOPILOT` | `{ mode: 'supervised' \| 'overview', autopilotConfig }` | Mid-flow toggle. Updates mode + config, no stage change |
| `REQUEST_ABORT` | `{}` | Invokes `abortRequester` actor |
| `RESUME` | `{}` | Clears abort flag via DELETE, re-enters current stage |
| `DRAFT_COMPLETE` | stage-specific | **Modified** — adds `shouldSkipReview` branch: `[{ target: 'assets', guard: 'shouldSkipReview' }, { target: 'review' }]` |
| `*_COMPLETE` (other stages) | stage-specific | Existing — unchanged |
| `NAVIGATE` / `REDO_FROM` | existing | Existing — unchanged |

`TOGGLE_AUTO_PILOT` and `toggleMode` action are removed.

### 7.4 Guards

```ts
guards: {
  startsAtBrainstorm: ({ event }) => event.startStage === 'brainstorm',
  startsAtResearch:   ({ event }) => event.startStage === 'research',
  startsAtDraft:      ({ event }) => event.startStage === 'draft',
  startsAtReview:     ({ event }) => event.startStage === 'review',
  startsAtAssets:     ({ event }) => event.startStage === 'assets',
  startsAtPreview:    ({ event }) => event.startStage === 'preview',
  startsAtPublish:    ({ event }) => event.startStage === 'publish',
  shouldSkipReview:   ({ context }) => context.autopilotConfig?.review.maxIterations === 0,
}
```

### 7.5 Actions

```ts
actions: {
  applySetup: assign(({ event }) => ({
    mode: event.mode,
    autopilotConfig: event.autopilotConfig,
    templateId: event.templateId,
  })),
  setAutopilotConfig: assign({
    autopilotConfig: ({ event }) => event.autopilotConfig,
  }),
  setMode: assign({ mode: ({ event }) => event.mode }),
  clearAllResults: assign({ stageResults: () => emptyStageResults(), iterationCount: 0 }),
  saveDraftResult: /* existing */,
  showAbortFailedToast: ({ context }) => { toast.error(`Failed to pause: ${context.lastError}`) },
  // pauseAuto / resumeAuto / clearError / recordError / recordActorError /
  // setPauseReasonReproduceError / saveReviewResult / incrementIteration /
  // resetIteration / saveStageResult — all existing, unchanged
}
```

### 7.6 Snapshot hydration

Wave 5 extends `MigratedPipelineInput` to include `autopilotConfig: AutopilotConfig | null`. Legacy rows always produce `null` here (they pre-date the wizard); the field exists so the snapshot builder can populate context unconditionally.

`apps/app/src/lib/pipeline/legacy-state-migration.ts`:

```ts
function looksLegacy(x: LegacyShape): boolean {
  return x.currentStage !== undefined || x.autoConfig !== undefined
  // 'step-by-step' is now the canonical mode value — must NOT be a legacy marker
}

function normalizeMode(mode: unknown):
  'step-by-step' | 'supervised' | 'overview' | null {
  if (mode === 'auto')                                 return 'supervised'
  if (mode === 'step' || mode === 'step-by-step')      return 'step-by-step'
  if (mode === 'supervised' || mode === 'overview')    return mode
  return null
}

export function mapLegacyToSnapshot(
  pipelineStateJson: unknown,
): Snapshot<typeof pipelineMachine> | null {
  const migrated = mapLegacyPipelineState(pipelineStateJson)
  if (!migrated) return null
  return {
    value: migrated.initialStage,
    context: {
      mode: migrated.mode,
      iterationCount: migrated.initialIterationCount,
      stageResults: migrated.initialStageResults,
      autopilotConfig: migrated.autopilotConfig ?? null,  // always null for pre-wizard rows
      templateId: null,
      lastError: null,
      // remaining context fields populated from machine defaults
    },
    status: 'active',
  } as Snapshot<typeof pipelineMachine>
}
```

`PipelineActorProvider` boots:

```ts
const snapshot = mapLegacyToSnapshot(initialPipelineState)
const [state, send] = useMachine(pipelineMachine, snapshot ? { snapshot } : { input })
// fresh project (no pipeline_state_json) → input path → initial 'setup'
// resumed project → snapshot path → initial = persisted stage
```

`requestAbort` is a `fromPromise` invoked actor (not a pure action — it does network I/O):

```ts
abortRequester: fromPromise(async ({ input }: { input: { projectId: string } }) => {
  const res = await fetch(`/api/projects/${input.projectId}/abort`, { method: 'PATCH' })
  if (!res.ok) throw new Error('Failed to request abort')
}),
```

Top-level `aborting` state with `onDone` / `onError` transitions back to previous stage with the existing `pauseAuto` action (sets `paused: true`, `pauseReason: 'user_paused'`) or `showAbortFailedToast` on failure.

---

## 8. UI Components

### 8.1 `PipelineWizard`

`apps/app/src/components/pipeline/PipelineWizard.tsx` — rendered when `state.matches('setup')`.

Single-page vertical scroll. Sticky header + sticky submit. Sections:

1. Channel chip (read-only) + template dropdown + Save buttons
2. Mode radio (`step-by-step` / `supervised` / `overview`)
3. Default provider dropdown (`recommended` or specific)
4. Per-stage `<details>` cards (collapsible) — Brainstorm, Research, Canonical Core, Draft, Review, Assets

Behavior:
- Template dropdown lists `WHERE user_id = me AND (channel_id = currentChannel OR channel_id IS NULL)`. Channel-scoped grouped above globals. Default star highlighted.
- `Save as new` opens 3-field popover (name, scope, default checkbox) → `POST /api/autopilot-templates`.
- `Update template "X"` button shows when template loaded + form dirty → confirmation dialog ("Future projects using this template will use these settings. Update?") → `PUT /api/autopilot-templates/:id`.
- Mode = `step-by-step` collapses per-stage form, shows note "You'll configure each stage as you go."
- Disabled stages (already completed) render summary read-only with "Already done" badge. Their slot in `autopilotConfig` derives from `stageResults` so "Save as template" captures the full config.
- Form validation via `react-hook-form` + Zod resolver. On submit failure: all `<details>` containing errors auto-`open`, then `scrollIntoView` first error.
- Submit → `POST /api/projects/:id/setup` → `SETUP_COMPLETE` event with full payload.
- Submit CTA label switches: `Start step-by-step →` / `Start autopilot (supervised) →` / `Start autopilot (overview) →`.

Entry-point logic:

| Project source | Disabled stages | startStage |
|---|---|---|
| Fresh | none | `brainstorm` |
| From idea | brainstorm | `research` |
| From research session | brainstorm, research | `draft` |
| From blog content | brainstorm, research, canonical core, draft | `review` |
| Resumed (any stage) | upstream completed stages | current stage |

### 8.2 `MiniWizardSheet`

Mid-flow `GO_AUTOPILOT` UI. Shown when user clicks "Reconfigure..." or "Go Autopilot" button. Sheet-style modal containing:

- Default provider dropdown
- Collapsed cards for **remaining stages only** (active stages onwards)
- Read-only summary cards for upstream completed stages

If `mode === 'step-by-step'` (no existing `autopilotConfig`), pre-fills upstream slots from admin pipeline-settings defaults + completed `stageResults`. Submit body is always a complete `AutopilotConfig`, never a partial. Server-side does no merging.

### 8.3 `PipelineOverview`

`apps/app/src/components/pipeline/PipelineOverview.tsx` — rendered when `mode === 'overview'` and not in setup or showEngine.

2-column layout:

```
┌──────────────────────────┬────────────────────────────────────────┐
│ Pipeline progress (33%)  │ Stage results (67%, scrollable)        │
│ ● Brainstorm   ✓ 12s     │ Per-stage cards: summary + Open engine │
│ ● Research     ✓ 38s     │ Current stage: live status / actions   │
│ ◐ Reviewing    iter 2/5  │ Pause-at-gate inline panels            │
│ ○ Assets                 │                                        │
│ ...                      │                                        │
│ [Pause] [Switch to       │                                        │
│  Supervised] [Reconfig...] │                                      │
└──────────────────────────┴────────────────────────────────────────┘
```

- Left rail: 7 stage rows with status icons:

  | Icon | Meaning |
  |---|---|
  | `✓` | Stage completed |
  | `◐` | Stage currently running |
  | `○` | Stage pending |
  | `⏸` | Stage paused (user requested abort or hit a human gate) |
  | `✗` | Stage errored |
  | `⊘` | Stage skipped (e.g., review with `maxIterations === 0`) |

  Current-stage live indicators inline (review iteration count, abort spinner). Bottom action group below the rail.
- Right column: one card per stage. Done = summary + "Open engine" link. Current = live status. Pending = config preview from `autopilotConfig`. Pause-at-gate = inline action panel (Approve anyway / Open engine).
- "Open engine" calls `setShowEngine(stage)` on parent orchestrator — same machine, same actor, no routing.
- Skipped review (maxIterations = 0): right column Review card renders "Skipped" badge, rail shows Skipped instead of `✓`.

### 8.4 `PickChannelModal`

Renders only when reopening a project with `channel_id IS NULL` (legacy). Unskippable. User picks channel → `PATCH /api/projects/:id { channelId }` → page re-renders into wizard or saved stage.

### 8.5 `PipelineAbortProvider`

Polling-based abort signal source. Mounts a fresh `AbortController` per stage entry; polls `GET /api/projects/:id` every 3s while machine state is not `setup`/`publish.done`, every 10s when current stage is in a `paused` substate; calls `controller.abort()` on `abort_requested_at` change. `usePipelineAbort()` returns the current controller for engine consumers.

---

## 9. Provider Integration

### 9.1 Stage → agent mapping

`apps/api/src/lib/ai/stageMapping.ts`:

```ts
export type AutopilotStage =
  'brainstorm' | 'research' | 'canonicalCore' | 'draft' | 'review' | 'assets'

export const AGENT_FOR_AUTOPILOT_STAGE: Record<AutopilotStage, AgentType> = {
  brainstorm:    'brainstorm',
  research:      'research',
  canonicalCore: 'production',
  draft:         'production',
  review:        'review',
  assets:        'assets',
}
```

### 9.2 `resolveStageProvider`

`apps/api/src/lib/ai/resolveProvider.ts`:

```ts
export function resolveStageProvider(
  stage: AutopilotStage,
  config: AutopilotConfig,
  adminDefaults: PipelineSettings,
): Provider {
  const slot = config[stage]
  if (slot && 'providerOverride' in slot && slot.providerOverride) {
    return slot.providerOverride
  }
  if (config.defaultProvider === 'recommended') {
    return adminDefaults.defaultProviders[stage]
  }
  return config.defaultProvider
}
```

Resolution order: per-stage override > project defaultProvider (when not 'recommended') > admin per-stage default.

### 9.3 Abort plumbing

- `GenerateContentParams` adds `signal?: AbortSignal`
- `generateWithFallback` accepts and passes through `signal` to all 5 providers
- All providers (openai, anthropic, gemini, ollama, mock) pass `signal` to underlying `fetch`
- Router retry-loop uses `sleepCancellable(ms, signal)` instead of bare `setTimeout`
- Inngest jobs call `assertNotAborted(projectId, draftId)` between every `step.run`
- `JobAborted extends NonRetriableError` — Inngest does not retry
- Top-level catch in jobs: `JobAborted` → `content_drafts.status = 'paused'` + emit `'aborted'` event; other errors → existing failed-status path

### 9.4 `deepMergeAutopilotConfig`

Used only for template-load + form-edit, never for server-side merge.

```ts
export function deepMergeAutopilotConfig(
  base: AutopilotConfig,
  patch: DeepPartial<AutopilotConfig>,
): AutopilotConfig {
  // Helper is for template-load + form-edit only. Both call sites guarantee a
  // non-null base. Fail fast if that invariant breaks.
  if (!base) throw new Error('deepMergeAutopilotConfig requires a non-null base')
  return {
    defaultProvider: patch.defaultProvider ?? base.defaultProvider,
    brainstorm:    base.brainstorm    === null ? null : { ...base.brainstorm,    ...(patch.brainstorm    ?? {}) },
    research:      base.research      === null ? null : { ...base.research,      ...(patch.research      ?? {}) },
    canonicalCore: { ...base.canonicalCore, ...(patch.canonicalCore ?? {}) },
    draft:         { ...base.draft,         ...(patch.draft         ?? {}) },
    review:        { ...base.review,        ...(patch.review        ?? {}) },
    assets:        { ...base.assets,        ...(patch.assets        ?? {}) },
  }
}
```

Null-slot preservation: `base.brainstorm === null` (project from research) → patch never resurrects it as `{}`.

---

## 10. Wave Plan

| Wave | Scope |
|---|---|
| **0** | Provider unification (`'local' → 'ollama'` + Zod alias) · `default_providers_json` extension (canonicalCore + assets) · `JobStage` adds `'aborted'` · `content_drafts.status` CHECK adds `'paused'`. No UI. |
| **1** | `autopilot_templates` table · `projects` columns (`channel_id` UUID, `mode`, `autopilot_config_json`, `autopilot_template_id`, `abort_requested_at`) · `clear_autopilot_default()` PG function · `mode` backfill from legacy `pipeline_state_json` + `auto_advance` · regenerate `database.ts` + update `mappers/db.ts` |
| **2** | Shared schemas: `autopilotConfigSchema`, `setupProjectSchema`, `startStageSchema`, `autopilotConfigPatchSchema`. All cross-field refines. |
| **3** | API routes: `/api/projects/:id/setup`, `/api/projects/:id/abort` (PATCH + DELETE), `/api/autopilot-templates` CRUD · `assertProjectOwner` helper with legacy fallback · `derivedFromStageResults` + `nextStageAfter` helpers · Zod-gated startStage validation |
| **4** | Abort plumbing (D2-B): `signal` through `GenerateContentParams`, all 5 providers, `generateWithFallback`, cancellable retry-sleep · `assertNotAborted` helper + insert between every `step.run` in 5 Inngest jobs · `JobAborted extends NonRetriableError` · `content_drafts.status='paused'` path |
| **5** | Machine: new `setup` state · `SETUP_COMPLETE` (with stage guards), `RESET_TO_SETUP`, `GO_AUTOPILOT` events · drop `TOGGLE_AUTO_PILOT` + `toggleMode` action · `shouldSkipReview` guard · `setMode`/`setAutopilotConfig`/`applySetup` actions · `abortRequester` invoked actor · legacy migration: `looksLegacy` (structural-only), `normalizeMode` (tri-mode), `mapLegacyToSnapshot` · **type amendments:** `PipelineMachineContext.channelId: string \| null`, `PipelineMachineContext.autopilotConfig: AutopilotConfig \| null`, `PipelineMachineContext.templateId: string \| null`, `MigratedPipelineInput.autopilotConfig` (always null for legacy) |
| **6** | `PipelineWizard` component · template dropdown · mode picker · per-stage form sections · validation/error-expand · `Update template "X"` flow + confirm dialog · channel chip · mid-flow `MiniWizardSheet` · `PickChannelModal` for legacy NULL projects |
| **7** | `PipelineOverview` 2-col layout · `OverviewProgressRail` · `OverviewStageResults` · `showEngine` UI flag in orchestrator · `← Back to overview` button · inline pause-at-gate panels · `PipelineAbortProvider` (polling-based) |
| **8** | Orchestrator render branch for `setup`/`overview`/`engine` · project page wraps with `PipelineAbortProvider` · entry-point `startStage` derivation · `RESET_TO_SETUP` redo-modal flow (3 strategies) · `Reconfigure...` mid-flow · "from idea/research/blog" entry endpoints write `channel_id` · templates admin page (`/channels/[id]/autopilot-templates`) · **`auto_advance` → `mode` code sweep** (5 sites) |
| **9** | Drop `auto_advance` column with grep verification · doc sync (`docs-site` pipeline page, `.claude/rules/api-routes.md` ownership rule, **CLAUDE.md framework correction Fastify vs Route Handlers**) · delete dead `TOGGLE_AUTO_PILOT` references · final smoke checklist |

### Deploy gating

- Waves 0–4: backend-only, can deploy as they ship.
- **Waves 5+6+7+8 must deploy together** in one release — legacy projects need machine + UI consumers in lockstep.
- Wave 9: cleanup-only, deploy after acceptance.

### Test baseline pin

**Wave 0 entry:** Capture `npm run test` failure list, save as `docs/superpowers/specs/2026-04-28-test-baseline.txt`. The baseline already includes ~56 pre-existing failures in `apps/api/src/__tests__/routes/*` and 3 in `apps/web/src/lib/auth/__tests__/admin-actions.test.ts` per memory `project_preexisting_test_failures.md`.

**Wave 9 exit:** Re-run `npm run test`, diff against baseline. New failures block. Baseline failures don't.

---

## 11. Backward Compatibility Invariants

1. **Existing projects keep working.** Legacy `pipeline_state_json` rows hydrate via `mapLegacyToSnapshot` directly into their saved stage. They never enter `setup`. `mode` backfill ensures rail shows the right autopilot indicator.
2. **Step-by-step is unchanged for legacy projects.** No `autopilot_config_json` → engines call AI without going through `resolveStageProvider`; old code path survives until cleanup wave.
3. **Inngest jobs in flight at deploy time** keep running. Abort check is conditional on `projects.abort_requested_at` — column exists after Wave 1, populated after Wave 4. No mid-job state migration needed.
4. **Bulk drafts unchanged.** `bulk.ts` doesn't pass `projectId` → abort check no-ops. Templates not applicable.
5. **Provider enum migration is reversible** for one release window: Zod accepts `'local'` as alias for `'ollama'` via transform. Drop alias in Wave 9 only after admin UI + `ai_provider_configs` rows confirmed clean.

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Provider rename breaks in-flight LLM calls during deploy | Zod alias `'local'` → `'ollama'` for one release; admin migrates rows in Wave 0 before any other code reads provider |
| `mode` backfill misclassifies user intent | Backfill rule: `auto_advance OR mode='auto' → supervised`; `'overview'` mode never auto-assigned (user opts in via mid-flow toggle); legacy users see no behavior change |
| Polling abort introduces request storm at scale | 3s interval × N concurrent projects per user is bounded; backoff to 10s on `paused`/`done`; response cache header (1s TTL) |
| Mini-wizard invalid configs (mid-flow, base=null) | Mini-wizard pre-fills full config from admin defaults; submit body validated against full `autopilotConfigSchema`; server rejects partial |
| `channel_id` NULL on legacy → ownership chain skipped | `assertProjectOwner` legacy fallback through `research_archives.user_id`; `<PickChannelModal />` on first reopen forces channel pick |
| Orphan `autopilot_template_id` after template deletion | FK `ON DELETE SET NULL`; project's `autopilot_config_json` snapshot survives — template deletion only loses provenance, not config |
| XState legacy snapshot incompatibility | `mapLegacyToSnapshot` returns `null` for unparseable rows; falls back to fresh `setup` with toast "Couldn't restore previous state"; covered by new tests in Wave 5 |

---

## 13. Browser Smoke Checklist (final acceptance gate)

- [ ] Fresh project (no idea/research/blog) → wizard renders with all 6 stage sections
- [ ] "From Research" project → wizard renders with brainstorm + research disabled, "Start at draft" CTA
- [ ] Step-by-step submit → lands on brainstorm engine, no autopilot effects fire
- [ ] Supervised submit → lands on brainstorm, autopilot drives stage-to-stage
- [ ] Overview submit → lands on overview page, 2-column layout, polls `/api/projects/:id` every 3s
- [ ] Pause from overview → "Pausing..." → engine fetch aborts within ms; Inngest job exits at next `step.run` boundary; `content_drafts.status = 'paused'`
- [ ] Resume from overview → abort flag cleared, machine re-enters current stage with fresh `AbortController`
- [ ] Inline pause-at-gate (review<40) → action panel renders in right column, no redirect
- [ ] "Switch to Supervised" from overview → flips render branch, same orchestrator instance, no `router.push`
- [ ] Mid-flow `GO_AUTOPILOT` from step-by-step → `MiniWizardSheet` pre-fills from admin defaults, submit applies full config
- [ ] Template save (channel-scoped, default=true) → previous channel default cleared in same transaction
- [ ] Template save (global, default=true) → independent of channel default; both can coexist
- [ ] `<PickChannelModal />` renders for legacy `channel_id IS NULL` projects, blocks until picked
- [ ] Redo from start (wipe) → `RESET_TO_SETUP` fires, wizard renders, prior results cleared
- [ ] Redo from start (clone) → new project created with same config, original untouched, redirected
- [ ] Redo from start (new) → `router.push('/projects/new')`, no machine event
- [ ] Legacy project hydrates via `mapLegacyToSnapshot`, lands at saved stage, mode = `'supervised'` or `'step-by-step'`
- [ ] **shouldSkipReview corner case:** project with `autopilotConfig.review.maxIterations === 0` → `DRAFT_COMPLETE` routes draft → assets, review state never entered, `stageResults.review` stays undefined, Overview rail shows "Skipped" badge
- [ ] **Provider alias coercion:** input `provider: 'local'` accepted via Zod transform, persisted as `'ollama'` (Wave 0 alias window verification — drops in Wave 9)
- [ ] **`assertProjectOwner` legacy fallback:** legacy project with `channel_id IS NULL` + valid `research_id` resolves owner via `research_archives.user_id`; reject if neither chain matches
- [ ] **Mode backfill correctness:** legacy `auto_advance=true` row → `mode='supervised'`; `pipeline_state_json.mode='auto'` row → `'supervised'`; non-empty state without auto signal → `'step-by-step'`; empty/null state → `mode IS NULL`
- [ ] All Wave 9 cleanup verified: `grep auto_advance` returns no production hits; CLAUDE.md framework refs corrected (Fastify, not Route Handlers)

### Code-health gates (Wave 9 exit)

- `npm run test` green vs pinned baseline at `docs/superpowers/specs/2026-04-28-test-baseline.txt`. New failures block; baseline failures don't.
- `npm run typecheck` green
- `npm run lint` green (warnings allowed if pre-existing)
- `npm run build` green
- No `--no-verify` on this branch

---

## 14. Out of Scope

- SSE for live updates (deferred to follow-up sub-milestone — also wires unbuilt `job_events` SSE)
- Browser-side Supabase auth (independent project; unblocks RLS-based realtime)
- Template marketplace / cross-user sharing
- Multi-format projects (single format per project remains the limit for v1)
- Visual DAG builder for autopilot config
- Real-time collaborative editing of in-flight pipelines
- Tighter mid-LLM-call cancellation in `reproducing` actor (currently relies on XState invoke cancellation)

---

## 15. Open Follow-ups (deferred)

- Refactor `requestAbort` from action-with-fetch to fully invoked-actor pattern (XState v5 idiom, currently mixed)
- Build SSE infra to replace polling — also wires unbuilt `job_events` SSE
- Browser Supabase auth (separate sub-milestone)
- Template marketplace / cross-user sharing
- Multi-format projects (blog + shorts in one run)
- Visual DAG builder for templates
- Real-time collab on in-flight pipelines

---

## Appendix A — Existing branch context

This spec builds on the completed `feat/pipeline-orchestrator-refactor` work (XState v5 actor model, completed 2026-04-25). The previous refactor delivered:

- `pipelineMachine` with 7 stage states, guards, actions, invoked actors
- `PipelineActorProvider` (per-project actor scope)
- `PipelineSettingsProvider` (admin settings cache)
- `mapLegacyPipelineState` migration helper
- 488-line `PipelineOrchestrator` (down from 808)

This spec extends — does not replace — that substrate. The `setup` state is a sibling addition, not a wrapper. Engine components remain mounted under the same orchestrator. The wizard is a new render branch; the overview is a new render branch; both share the same actor instance.
