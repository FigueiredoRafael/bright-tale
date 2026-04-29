# Autopilot Foundation, Gates & Templates — Design

**Status:** draft · **Branch:** `feat/pipeline-autopilot-wizard-impl` · **Date:** 2026-04-29

## 1. Summary

The pipeline autopilot wizard (plan `2026-04-28-pipeline-autopilot-wizard.md`) shipped a wizard, a polling abort signal, and an overview render branch — but **engines never read `autopilotConfig` from the actor**. As a result, opening a project on Overview mode parks the machine at the current stage with engines unmounted (or mounted but with empty form state), no autopilot trigger fires, and the dashboard shows every stage as "Pending…" forever.

This spec specifies the missing wiring plus two layered improvements: configurable gates (assets, preview, publish) with per-iteration review tracking, and a project-creation flow with templates polish. Three specs land sequentially as commits on the same branch.

## 2. Goals

1. Make Overview-mode autopilot demonstrably run a project from brainstorm to publish without user input on the happy path.
2. Give the user modern, intentional progress feedback while autopilot runs (Live Console UI).
3. Let the user configure asset, preview, and publish behavior in the wizard with sensible defaults.
4. Track per-iteration review history so the user can see *why* a review iteration was rejected.
5. Provide a project-creation flow (`/projects/new`) with channel picker — current channel first.
6. Verify the existing template save/reload/list flow works end-to-end.

## 3. Non-Goals

- Persisting engine drill-in edits back to `autopilotConfig`.
- `'scheduled'` publish status (date picker, scheduling backend).
- Server-side recent-channels tracking (uses localStorage).
- Mocked-AI Playwright variant for CI.
- Moving autopilot orchestration server-side (Inngest workflow). Browser-hidden engine architecture is a deliberate v1 choice, consistent with the xstate-refactor (2026-04-24) premise that engines are thin actor-views.

## 4. Architecture overview

### 4.1 Browser-hidden engines in Overview mode

Overview-mode `PipelineOrchestrator` mounts the current-stage engine in a `display:none` wrapper while rendering the Live Console as the primary UI. Engine effects fire (fetch, SSE streams), the autopilot trigger fires (because local state is hydrated from `autopilotConfig`), and the engine emits `STAGE_PROGRESS` events that the Live Console reads to show meaningful feedback. Drill-in via `setShowEngine(stage)` flips the engine to visible (overview hides) — used for asset/preview gates and user inspection.

### 4.2 Engine hydration from `autopilotConfig`

Each engine, on mount, reads its slot from `actor.context.autopilotConfig` and seeds local form state. Hydration is one-way (no write-back); edits during drill-in stay local for the run. New helper module `apps/app/src/lib/pipeline/hydrateEngineFromConfig.ts` exposes one function per engine.

### 4.3 STAGE_PROGRESS event protocol

Existing `mergeStageProgress` action handles the merge. Locked partial shape:

```ts
interface StageProgressPartial {
  status: string                  // ≤30 chars, present-tense
  current?: number                // sub-units completed
  total?: number                  // sub-units total (only when known up front)
  detail?: string                 // ≤120 chars, freeform
}
```

When `*_COMPLETE` fires, `mergeStageProgress` is overwritten by the full result; partial fields drop from rendering.

### 4.4 Three-spec decomposition

All three specs commit to `feat/pipeline-autopilot-wizard-impl`. Sequential, no branching. Single PR at the end.

| Spec | Title | Acceptance Gate |
|---|---|---|
| **1** | Autopilot Foundation | RTL+Vitest: 7-stage happy-path test green; engine hydration tests green; LiveConsole renders running/completed states |
| **2** | Gates & Per-Iteration Tracking | RTL+Vitest: 7 gate scenarios green; per-iteration review test green |
| **3** | Project Creation & Templates Polish | RTL+Vitest: channel picker + templates roundtrip green; Playwright autopilot-happy-path smoke green against dev DB |

## 5. Spec 1 — Autopilot Foundation

### 5.1 Engine hydration — wizard form ↔ engine state

**Invariant:** every wizard form field has a corresponding engine local-state seed, end-to-end. Wizard writes to `autopilotConfig.<slot>.<field>` → machine stores it on `SETUP_COMPLETE` via `applySetup` → engine reads it on mount and seeds local form state. Adding a new wizard field means updating both the schema and the matching engine hydrator in the same commit.

The full hydration table, exhaustive against `autopilotConfigSchema` (`packages/shared/src/schemas/autopilotConfig.ts`):

| Slot | Schema field | Wizard input | Engine local state seed |
|---|---|---|---|
| (top-level) | `defaultProvider` | Provider radio at the top of the wizard | Inherited by every slot's `providerOverride` resolution; engines read via `resolveStageProvider` server-side, not directly |
| `brainstorm` | `providerOverride` | (per-stage advanced control) | `BrainstormEngine.provider` |
| `brainstorm` | `mode` | Radio: topic-driven / reference-guided | `BrainstormEngine.mode` |
| `brainstorm` | `topic` | Text input | `BrainstormEngine.topic` |
| `brainstorm` | `referenceUrl` | URL input (when `mode='reference_guided'`) | `BrainstormEngine.referenceUrl` |
| `brainstorm` | `niche` | Text input | `BrainstormEngine.niche` (fine-tuning) |
| `brainstorm` | `tone` | Text input | `BrainstormEngine.tone` (fine-tuning) |
| `brainstorm` | `audience` | Text input | `BrainstormEngine.audience` (fine-tuning) |
| `brainstorm` | `goal` | Text input | `BrainstormEngine.goal` (fine-tuning) |
| `brainstorm` | `constraints` | Text input | `BrainstormEngine.constraints` (fine-tuning) |
| `research` | `providerOverride` | (per-stage advanced control) | `ResearchEngine.provider` |
| `research` | `depth` | Select (surface/medium/deep) | `ResearchEngine.researchDepth` |
| `canonicalCore` | `providerOverride` | (per-stage advanced control) | `DraftEngine.canonicalCoreProvider` |
| `canonicalCore` | `personaId` | Persona Select (active personas only; "Auto-select" = null) | `DraftEngine.selectedPersonaId` |
| `draft` | `providerOverride` | (per-stage advanced control) | `DraftEngine.draftProvider` |
| `draft` | `format` | Select (blog/video/shorts/podcast) | `DraftEngine.format` |
| `draft` | `wordCount` | Number input (required when `format='blog'`) | `DraftEngine.wordCount` |
| `review` | `providerOverride` | (per-stage advanced control) | `ReviewEngine.provider` |
| `review` | `maxIterations` | Number input | Read by machine guard `hasReachedMaxIterationsGuard` (already wired) — Spec 1 verifies |
| `review` | `autoApproveThreshold` | Number input | Read by machine guard `isApprovedGuard` (already wired) — Spec 1 verifies |
| `review` | `hardFailThreshold` | Number input | Read by machine guard `isRejectedGuard` (already wired) — Spec 1 verifies |
| `assets` | `providerOverride` | (per-stage advanced control) | `AssetsEngine.provider` |
| `assets` | `mode` | Radio (3 options: skip / briefs_only / auto_generate — see §6.1) | `AssetsEngine.assetsMode` (Spec 2; Spec 1 always skips assets) |
| `preview` | `enabled` | Switch (Spec 2) | `PreviewEngine.previewEnabled` (Spec 2) |
| `publish` | `status` | Radio (Spec 2) | `PublishEngine.wpStatus` (Spec 2) |

Engines hydrate inside the existing "Initialize from initial values" `useEffect`, **before** `useAutoPilotTrigger` evaluates `canFire()`. This is what makes `canFire()` return true once required fields are present in the config — the missing wiring this whole spec exists to fix.

**One-way flow.** Engines never write back to `autopilotConfig`. If the user drills into an engine and edits a field, the edit lives in engine local state for the duration of the run; the next reload re-hydrates from `autopilotConfig`. (Lifting drill-in edits back to config is deferred — see §3 Non-Goals.)

**`hydrateEngineFromConfig.ts` shape:**

```ts
// One pure function per engine. No side effects.
export function hydrateBrainstormFromConfig(
  config: AutopilotConfig | null,
): Partial<BrainstormEngineLocalState>

export function hydrateResearchFromConfig(
  config: AutopilotConfig | null,
): Partial<ResearchEngineLocalState>

// ... etc for each engine
```

Each function returns an object with the keys to seed; the engine spreads the returned object into its `useState` initializers. `null` config (legacy projects, step-by-step mode) returns an empty object — engines fall back to existing localStorage / channel-default behavior.

### 5.2 Hidden engine wrapper

`PipelineOrchestrator.tsx` render branch:

```tsx
{ctx.mode === 'overview' && !showEngine ? (
  <>
    <PipelineOverview setShowEngine={setShowEngine} />
    <div style={{ display: 'none' }} aria-hidden="true">
      {renderEngine(stageToRender)}
    </div>
  </>
) : (
  renderEngine(stageToRender)
)}
```

`display:none` keeps DOM mounted, effects firing, fetches running. Drill-in flips the branch — engine becomes visible, overview hides.

### 5.3 Live Console UI

Replaces `OverviewProgressRail.tsx` and `OverviewStageResults.tsx`. New components:

- `OverviewTimeline.tsx` — vertical list, one row per stage
- `StageRow.tsx` — handles four states (pending / running / completed / skipped) with appropriate iconography (check / spinner / circle / dash)
- `LiveActivityLog.tsx` — last 5 transitions inline below the timeline

Visual sketch:

```
┌── Pipeline · started 14:32 · 3/7 stages ──────────────────────┐
│ ✓ Brainstorm     12s · 12 ideas · selected "AI agents in..."  │
│ ✓ Research       38s · 8 cards · confidence 0.84               │
│ ◐ Draft          ↻ Generating canonical core      [progress]  │
│   Status: "Building section 3/7"                               │
│ ○ Review         · iteration 0/5                               │
│ ○ Assets         · skipped                                     │
│ ○ Preview        · skipped (auto)                              │
│ ○ Publish        · pending → draft                             │
│ [Pause]  [Reconfigure...]  [Open current engine →]            │
└────────────────────────────────────────────────────────────────┘
```

Current-stage row gets pulsing border, status text in 14px, progress bar when `total > 0`.

### 5.4 STAGE_PROGRESS emit points (per stage)

| Stage | Emit points |
|---|---|
| Brainstorm | `starting → generating (per SSE chunk: current=ideas.length, total=expected) → ranking → done` |
| Research | `starting → generating-cards (per SSE chunk: current/total) → done` |
| Draft | `starting → generating-canonical-core → generating-content (per section if available) → done` |
| Review | `iterating (current=iterationCount, total=maxIterations, status="Iteration N/M: scoring") → done` |
| Assets | (Spec 2 — Spec 1 always skips assets) |
| Preview | (Spec 2 — Spec 1 always skips preview) |
| Publish | `starting → publishing → done` |

### 5.5 Spec 1 test plan

**Vitest + RTL:**

1. `e2e-happy-path.test.tsx` — boots `<PipelineOrchestrator>` with a fake actor + mocked `fetch`. Mocks return canned brainstorm SSE chunks, canned research cards, canned draft, review at score 92, publish 200. Asserts: 7 stage rows render; brainstorm transitions `pending → running (status "Generating ideas") → completed (12 ideas)`; same for research, draft; review shows `iteration 1/5` then completes at `score 92`; publish completes with `wpStatus="draft"`; LiveActivityLog shows 5 transition entries. No user input dispatched.
2. `engine-hydration.test.tsx` — for each engine, mounts with a populated `autopilotConfig`, asserts local form state matches the config after first render.
3. Existing tests get updated where they reference deleted components.

## 6. Spec 2 — Gates & Per-Iteration Tracking

### 6.1 Schema diff — `autopilotConfigSchema`

Working against the existing schema in `packages/shared/src/schemas/autopilotConfig.ts`. `AssetsSlot.mode` already exists with four values; the user-facing model in this spec is three (`auto_generate / briefs_only / skip`). Reconciliation: rename the four values for clarity and drop `manual` (which currently means "user does everything by hand with no AI" — a step-by-step concept that doesn't belong in autopilot). `manual` users use step-by-step mode instead.

```diff
 const AssetsSlot = z.object({
   providerOverride: ProviderOrInherit,
-  mode: z.enum(['skip', 'manual', 'briefing', 'auto']),
+  mode: z.enum(['skip', 'briefs_only', 'auto_generate']),
 })

+const PreviewSlot = z.object({
+  enabled: z.boolean(),  // ON = drill-in for review; OFF = auto-derive + skip UI
+})
+
+const PublishSlot = z.object({
+  status: z.enum(['draft', 'published']),  // 'scheduled' deferred
+})

 export const autopilotConfigSchema = z.object({
   // ...existing fields unchanged...
   assets:  AssetsSlot,
+  preview: PreviewSlot,
+  publish: PublishSlot,
 })
```

**Mapping from legacy assets values during the migration:**
- `'skip'` → `'skip'` (unchanged)
- `'briefing'` → `'briefs_only'` (rename)
- `'auto'` → `'auto_generate'` (rename)
- `'manual'` → `'skip'` (no longer expressible in autopilot; user-effective behavior matches `skip` since manual mode never auto-progressed anyway)

**Defaults for a fresh wizard:** `assets.mode='skip'`, `preview.enabled=false`, `publish.status='draft'`.

**Migration:** No SQL needed (JSON column). Existing `projects.autopilot_config_json` rows upgrade on read via `mapLegacyToSnapshot`:
- `assets.mode` legacy values mapped per the table above.
- Missing `preview` slot → `{ enabled: false }`.
- Missing `publish` slot → `{ status: 'draft' }`.

### 6.2 New machine events

```ts
| { type: 'ASSETS_GATE_TRIGGERED' }            // engine signals it needs drill-in
| { type: 'PREVIEW_GATE_TRIGGERED' }            // preview engine signals drill-in needed
| { type: 'CONTINUE_AUTOPILOT' }                // user said "yes" to return-to-overview
| { type: 'STOP_AUTOPILOT' }                    // user said "no" → step-by-step
```

Context additions:

```ts
pendingDrillIn: 'assets' | 'preview' | null
returnPromptOpen: boolean
```

New action `flipToStepByStep` — `STOP_AUTOPILOT` handler sets `mode='step-by-step'`, clears `pendingDrillIn`, closes return prompt.

### 6.3 Asset gate flow

`assets.mode === 'auto_generate'`:
- Engine reads config, generates images automatically, fires `ASSETS_COMPLETE` directly. No drill-in, no dialog.

`assets.mode === 'briefs_only'`:
- Engine sends `ASSETS_GATE_TRIGGERED` on mount.
- Machine assigns `context.pendingDrillIn = 'assets'`.
- Orchestrator sees `pendingDrillIn` → `setShowEngine('assets')` → engine becomes visible.
- User generates briefs / uploads / etc.
- Engine sends `ASSETS_COMPLETE` (existing event).
- Machine clears `pendingDrillIn`.
- Orchestrator opens `ConfirmReturnDialog`.
- User clicks **Continue Autopilot** → `CONTINUE_AUTOPILOT` event → orchestrator clears `showEngine`, returns to overview branch, autopilot continues to preview.
- User clicks **Finish Manually** → `STOP_AUTOPILOT` event → machine sets `mode='step-by-step'`. Orchestrator's overview branch no longer matches; engine renders visibly. User drives the rest.

`assets.mode === 'skip'`:
- New machine action `skipAssets` runs on `DRAFT_COMPLETE` when `assets.mode === 'skip'`. Writes `{ assetIds: [], skipped: true, completedAt: ... }` to `stageResults.assets` and transitions to preview without entering assets state.

### 6.4 Preview gate flow

`preview.enabled === false`:
- New helper `apps/app/src/lib/pipeline/derivePreview.ts` extracts the deterministic client-side derivation logic that `PreviewEngine.tsx` already uses (categories/tags/featured-image picks from `draft.publishPlan` + assets). New machine action `autoDerivePreview` runs on `ASSETS_COMPLETE` when `preview.enabled === false`: invokes `derivePreview(draftJson, assets)`, writes the result to `stageResults.preview`, fires `PREVIEW_COMPLETE` programmatically. No drill-in, no UI, no server call (derivation is pure client-side today). PreviewEngine refactors to consume the same helper so behavior stays identical to the manual path.

`preview.enabled === true`:
- Engine sends `PREVIEW_GATE_TRIGGERED` on mount.
- Same drill-in pattern as assets `briefs_only`.
- On `PREVIEW_COMPLETE`, `ConfirmReturnDialog` opens, same continue/stop semantics.

### 6.5 Publish behavior

`PublishEngine` reads `autopilotConfig.publish.status` on mount. In overview mode it auto-publishes with that status (no UI prompt). In step-by-step / supervised mode, the status pre-fills the existing publish form's status field.

### 6.6 Per-iteration review history

```ts
interface ReviewIterationSummary {
  iterationNum: number
  score: number
  verdict: 'approved' | 'rejected' | 'needs_revision'
  oneLineSummary: string  // ≤120 chars
  timestamp: string
}

interface ReviewResult {
  // existing: score, verdict, completedAt, iterationCount
  iterations: ReviewIterationSummary[]
  latestFeedbackJson: ReviewFeedbackJson | null  // full feedback only for latest iter
}
```

`ReviewEngine` produces `oneLineSummary` by reading the feedback's top-level `summary` field (existing field in BC_REVIEW_OUTPUT). Spec 2 includes a one-shot review of `agents/agent-4-review.md` to confirm the summary field is in the contract and emitted reliably; if not, the prompt is updated to require a leading `summary` line ≤120 chars. Truncation applied client-side as a safety net.

**Live Console rendering** for review:

```
◐ Review        · iteration 3/5
   ⓘ Iter 1: 67/100 · rejected · "Tone too informal"
   ⓘ Iter 2: 81/100 · needs_revision · "Add 2 sources, fix CTA"
   ↻ Iter 3: scoring...
```

Iteration chips stack vertically. Click expands to show `latestFeedbackJson` for that iteration in a collapsible drawer (only the latest iteration has full feedback; earlier chips show summary only).

### 6.7 ConfirmReturnDialog

`apps/app/src/components/pipeline/ConfirmReturnDialog.tsx` — opens when machine context flips `returnPromptOpen` to true.

```
┌─ Continue autopilot? ─────────────────────────────┐
│  Assets are ready. Continue running on autopilot, │
│  or finish the rest of the pipeline manually?     │
│  [Continue autopilot →]   [Finish manually]       │
└────────────────────────────────────────────────────┘
```

Triggered for `briefs_only` assets and `enabled=true` preview after `*_COMPLETE`. Auto modes never trigger it.

### 6.8 Wizard UI changes

Three new field groups in `PipelineWizard.tsx` and `MiniWizardSheet.tsx`:

**Assets** (radio, three options matching the schema enum):
- `skip` → "Skip" — go straight to preview (no images)
- `auto_generate` → "Auto-generate" — AI generates images, no manual review
- `briefs_only` → "Briefs only" — AI generates briefs, you finish in the engine

**Preview** (switch with explainer):
- "Preview before publish" toggle. Off note: "Categories and tags are auto-applied from the AI's analysis."

**Publish** (radio):
- Draft — review on WordPress before going live (default)
- Published — go live immediately

### 6.9 Spec 2 test plan

**Vitest + RTL — 7 focused gate scenarios + iteration history:**

1. `assets-skip.test.tsx` — assets mode `skip` → no engine drill, transitions draft → preview directly, `stageResults.assets.skipped=true`.
2. `assets-auto-generate.test.tsx` — assets mode `auto_generate` → engine mounts (still hidden in overview), generates images, fires `ASSETS_COMPLETE` without drill-in dialog.
3. `assets-briefs-only-continue.test.tsx` — mode `briefs_only` → drill-in fires, user clicks Continue Autopilot → returns to overview, continues to preview.
4. `assets-briefs-only-stop.test.tsx` — mode `briefs_only` → drill-in fires, user clicks Finish Manually → mode flips to step-by-step, orchestrator renders engine visibly.
5. `preview-enabled.test.tsx` — preview switch ON → drill-in fires after assets complete, user approves, ConfirmReturnDialog appears.
6. `preview-disabled.test.tsx` — preview switch OFF → auto-derives categories/tags, transitions to publish without drill-in.
7. `publish-status.test.tsx` — `publish.status='draft'` and `publish.status='published'` produce different request bodies to `POST /api/wordpress/publish`.
8. `review-iteration-history.test.tsx` — review loops through 3 iterations (scores 60, 78, 92), final stageResults.review.iterations has 3 entries with `oneLineSummary` populated, `latestFeedbackJson` is the iter-3 feedback.

## 7. Spec 3 — Project Creation & Templates Polish

### 7.1 `/projects/new` page

`apps/app/src/app/[locale]/(app)/projects/new/page.tsx`:

```
┌─ Start a new project ─────────────────────────────┐
│  Pick a channel                                    │
│  ● AI Tutor      (last visited 2h ago)            │
│  ○ Tech Reviews  (last visited 1d ago)            │
│  ○ Cooking Hub   (last visited 5d ago)            │
│  ───────                                           │
│  ○ Astronomy     (alphabetical from here)         │
│  ○ Books                                           │
│           [ Continue → ]                           │
└────────────────────────────────────────────────────┘
```

After Continue → `POST /api/projects { channelId, mode: null }` creates a fresh project, redirects to `/projects/:id`. Project loads in `setup` state → orchestrator renders wizard branch → user picks template / fills form / submits.

### 7.2 Channel ordering

`usePinnedChannels()` hook reads `localStorage` keys matching `lastVisitedChannelAt:{channelId}`, sorts descending by timestamp, returns top 3 as "recent" with a divider; rest sorted alphabetically. `/channels/[id]` page mount writes the current timestamp.

**Edge cases:**
- No channels → empty state with "Create your first channel" CTA pointing at the existing channel-create page.
- Single channel → skip picker, redirect to `/projects/new?channelId=<the-only-one>` which auto-creates and forwards to project page.
- Deep link `/projects/new?channelId=X` → skip picker, auto-create.

### 7.3 Templates page (`/channels/[id]/autopilot-templates`)

Already exists from autopilot-wizard Wave 6. Spec 3 verification only:
- Lists all templates for the channel (`GET /api/autopilot-templates?channelId=X`).
- Each row: template name, mode, brainstorm topic, creation date, "Default" badge if `is_default=true`.
- Clear-default action (existing).
- Delete action (existing).
- Edit action — opens a small modal with the same field set as the wizard. Verify it opens, edits, saves.

If anything is broken, fix it as part of Spec 3.

### 7.4 Wizard "Save as template" — verify, don't rebuild

Save-as-template flow shipped in autopilot-wizard Wave 6. Spec 3 verifies + polishes:
- "Save as template" checkbox/button visible and labelled clearly.
- `POST /api/autopilot-templates` called with the right shape on submit.
- Reload of the same channel's project list shows the template in the wizard's "Load template" dropdown.
- Pre-fill of all fields, including the three new Spec-2 ones (assets mode, preview switch, publish status).
- Persona Select round-trips through template save/load.

### 7.5 Playwright smoke test

`apps/app/e2e/autopilot-happy-path.spec.ts` — single test, gated to manual / pre-merge run. Walks the exact scenario from the user's brief:

```ts
test('autopilot end-to-end: create project, save template, reload, run on overview', async ({ page }) => {
  await page.goto('/projects/new')

  // Channel picker — current channel first
  await expect(page.getByTestId('channel-option').first()).toContainText(activeChannelName)
  await page.getByTestId('channel-option').first().click()
  await page.getByRole('button', { name: 'Continue' }).click()

  // Land on /projects/:id, wizard renders, no templates yet
  await expect(page.getByTestId('pipeline-wizard')).toBeVisible()
  await expect(page.getByTestId('template-dropdown')).toContainText('No templates yet')

  // Fill wizard form (mode=overview, brainstorm topic, persona, etc.)
  await page.getByLabel('Mode').selectOption('overview')
  await page.getByLabel('Topic').fill('AI agents in 2026')
  await page.getByLabel('Persona').selectOption({ label: 'Tech Analyst' })
  await page.getByLabel('Save as template').check()
  await page.getByLabel('Template name').fill('My First Autopilot')

  await page.getByRole('button', { name: /Start autopilot/i }).click()
  await expect(page.getByTestId('pipeline-overview')).toBeVisible()

  // Reload → template should now exist + pre-fill on next wizard open
  await page.goto('/projects/new')
  await page.getByTestId('channel-option').first().click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByTestId('template-dropdown').click()
  await expect(page.getByText('My First Autopilot')).toBeVisible()
  await page.getByText('My First Autopilot').click()
  await expect(page.getByLabel('Topic')).toHaveValue('AI agents in 2026')

  // Visit templates page → template is listed
  await page.goto(`/channels/${activeChannelId}/autopilot-templates`)
  await expect(page.getByText('My First Autopilot')).toBeVisible()

  // Back to the original project → autopilot should have progressed
  await page.goto(`/projects/${createdProjectId}`)
  await expect(page.getByTestId('pipeline-overview')).toBeVisible()

  // Wait for stages to complete (real backend, real AI calls — long timeout)
  await expect(page.getByTestId('stage-row-brainstorm'))
    .toContainText('completed', { timeout: 60_000 })
  await expect(page.getByTestId('stage-row-research'))
    .toContainText('completed', { timeout: 90_000 })
  // ... draft, review, publish

  await expect(page.getByTestId('stage-row-publish'))
    .toContainText('Published as draft', { timeout: 120_000 })

  // Cleanup — uses Playwright's request fixture so cookies + CSRF are inherited
  await request.delete(`/api/projects/${createdProjectId}`)
  await request.delete(`/api/autopilot-templates/${templateId}`)
})
```

**Run cadence:** locally on demand (`npm run test:e2e`); blocked from CI until explicit green-light (real-AI calls cost money).

### 7.6 Spec 3 test plan

**Vitest + RTL:**
1. `projects-new-channel-picker.test.tsx` — picker renders, recent-first ordering, single-channel auto-skip, deep-link skip, empty-state.
2. `templates-roundtrip.test.tsx` — save template via wizard, mock GET returns it, reload pre-fills.
3. `templates-page.test.tsx` — list, edit, delete, clear-default actions exercise expected API calls.

**Playwright:** the single smoke above.

## 8. Cross-cutting

### 8.1 File inventory

**Created:**
- `apps/app/src/lib/pipeline/hydrateEngineFromConfig.ts` (Spec 1)
- `apps/app/src/components/pipeline/OverviewTimeline.tsx` (Spec 1)
- `apps/app/src/components/pipeline/StageRow.tsx` (Spec 1)
- `apps/app/src/components/pipeline/LiveActivityLog.tsx` (Spec 1)
- `apps/app/src/components/pipeline/ConfirmReturnDialog.tsx` (Spec 2)
- `apps/app/src/lib/pipeline/derivePreview.ts` (Spec 2 — extracted from PreviewEngine.tsx)
- `apps/app/src/app/[locale]/(app)/projects/new/page.tsx` (Spec 3)
- `apps/app/src/components/projects/ChannelPicker.tsx` (Spec 3)
- `apps/app/src/hooks/usePinnedChannels.ts` (Spec 3)
- `apps/app/e2e/autopilot-happy-path.spec.ts` (Spec 3)

**Modified:**
- `packages/shared/src/schemas/autopilotConfig.ts` (Spec 2)
- `packages/shared/src/types/agents.ts` (Spec 2 — review iterations)
- `apps/app/src/lib/pipeline/machine.ts` + `.types.ts` (Spec 2 — events, context)
- `apps/app/src/lib/pipeline/legacy-state-migration.ts` (Spec 2 — defaults for new fields)
- `apps/app/src/components/pipeline/PipelineOrchestrator.tsx` (Spec 1+2 — hidden engine, drill-in branches, ConfirmReturnDialog mount)
- `apps/app/src/components/pipeline/PipelineWizard.tsx` (Spec 2 — assets/preview/publish fields)
- `apps/app/src/components/pipeline/MiniWizardSheet.tsx` (Spec 2)
- `apps/app/src/components/engines/BrainstormEngine.tsx` (Spec 1)
- `apps/app/src/components/engines/ResearchEngine.tsx` (Spec 1 — hydration + auto-approve all cards in overview)
- `apps/app/src/components/engines/DraftEngine.tsx` (Spec 1)
- `apps/app/src/components/engines/ReviewEngine.tsx` (Spec 1 verify + Spec 2 iteration history)
- `apps/app/src/components/engines/AssetsEngine.tsx` (Spec 2)
- `apps/app/src/components/engines/PreviewEngine.tsx` (Spec 2)
- `apps/app/src/components/engines/PublishEngine.tsx` (Spec 2)

**Deleted:**
- `apps/app/src/components/pipeline/OverviewProgressRail.tsx` (Spec 1 — replaced)
- `apps/app/src/components/pipeline/OverviewStageResults.tsx` (Spec 1 — replaced)

### 8.2 Risks & Watchpoints

| # | Risk | Mitigation |
|---|---|---|
| R1 | Hidden engine fires effects but user can't see errors → autopilot silently stuck | Engine errors dispatch `STAGE_ERROR`; OverviewTimeline shows red "Errored" state; LiveActivityLog logs the error. Pause button still works. |
| R2 | Engine local form state edits during drill-in are lost on stage completion | Spec 1 hydrates one-way only. Documented in code comments. Lift to follow-up if needed. |
| R3 | Brainstorm hydrates `mode='reference_guided'` but config has no `referenceUrl` | `autopilotConfigSchema.superRefine` already enforces. Wizard validation catches before SETUP_COMPLETE. |
| R4 | Per-iteration history grows unbounded | `iterations.length ≤ autopilotConfig.review.maxIterations` capped by existing `hasReachedMaxIterationsGuard`. |
| R5 | Playwright real-AI cost per run | Smoke gated to manual / pre-merge. CI runs Vitest hybrid only. |
| R6 | `display:none` engine container blocks focus traps in modals | Drill-in flips wrapper visible BEFORE modals open. Verified by `assets-briefs-only-continue` test. |
| R7 | LocalStorage-based recent channels lost on logout / new browser | Falls back to alphabetical. Cosmetic only. |
| R8 | User expects categories/tags they would have edited in the manual preview UI | Spec 2 surfaces "auto-derived" badge in the publish stage card listing the picked categories/tags so the user can spot them post-hoc. Skip-preview is purely client-side derivation, no extra AI cost. |

## 9. Acceptance criteria

### 9.1 Spec 1 exit gate

- [ ] All Spec 1 Vitest+RTL tests green (happy-path + per-engine hydration).
- [ ] Manual smoke: open a fresh overview-mode project from `/projects/:id` after wizard submit. Brainstorm card transitions through `pending → running → completed` with status text within ~30s. Research, draft, review follow.
- [ ] `OverviewProgressRail.tsx` and `OverviewStageResults.tsx` deleted.
- [ ] `npm run typecheck` + `npm run test` + `npm run lint` + `npm run build` all green.

### 9.2 Spec 2 exit gate

- [ ] All Spec 2 Vitest+RTL tests green (7 gate scenarios + iteration history).
- [ ] Manual smoke: configure each gate combination at least once via wizard; verify the configured behavior happens.
- [ ] `autopilotConfigSchema` parses existing fixtures (no regression).
- [ ] All build / typecheck / lint / test gates green.

### 9.3 Spec 3 exit gate

- [ ] All Spec 3 Vitest+RTL tests green.
- [ ] Playwright `autopilot-happy-path.spec.ts` green against dev DB.
- [ ] `/projects/new` reachable from primary nav.
- [ ] All build / typecheck / lint / test gates green.
- [ ] Branch-wide: zero `--no-verify` commits since `2026-04-26`.

## 10. Dependencies & Sequencing

- Spec 1 unblocks autopilot at all — must merge first as the foundation.
- Spec 2 depends on Spec 1's STAGE_PROGRESS protocol + drill-in pattern; merges next.
- Spec 3 depends on Spec 2's gates being functional (the Playwright smoke exercises them); merges last.
- Single PR for the whole branch when Spec 3 is green.

## 11. References

- `docs/superpowers/plans/2026-04-24-pipeline-xstate-refactor.md` — architectural premise (engines as thin actor-views).
- `docs/superpowers/plans/2026-04-28-pipeline-autopilot-wizard.md` — wizard, machine setup state, abort plumbing.
- `docs/superpowers/specs/2026-04-28-pipeline-autopilot-wizard-design.md` — original spec for the wizard work this completes.
