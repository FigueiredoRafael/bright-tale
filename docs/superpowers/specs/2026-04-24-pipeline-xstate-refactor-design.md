# Pipeline XState Refactor — Design Spec

**Date:** 2026-04-24
**Status:** Approved
**Branch:** feat/pipeline-orchestrator-refactor

---

## Problem

The `PipelineOrchestrator` component (808 lines) is a state machine disguised as a React component. It handles state management, stage transitions, auto-pilot logic, Supabase persistence, toast notifications, and UI rendering in one file. Engines (1,100–1,450 lines each) are equally fat — they own internal state, manage API calls, handle settings via props, and decide when they're "done."

The result: the pipeline is hard to read, hard to change, and impossible to scale. Adding concurrent project support (multiple projects open simultaneously) is not feasible with the current architecture.

---

## Goal

Refactor the pipeline into a clean separation:

- **XState machine** owns all state and transitions — pure logic, no React
- **PipelineSettingsProvider** loads settings once globally — no prop drilling
- **PipelineOrchestrator** becomes a thin shell (~150 lines) — spawns machine, renders active engine
- **Engines** become thin view layers — read machine state, fire typed events
- **Concurrent projects** supported natively — each project spawns its own machine actor

---

## Architecture

### Overview

```
PipelineSettingsProvider (global, loads once)
└── ProjectPage
    └── PipelineOrchestrator
        ├── useMachine(pipelineMachine, { input: { projectId, settings } })
        └── renders active engine based on machine state

lib/pipeline/          ← zero React, fully testable
├── machine.ts         ← XState machine definition
├── machine.types.ts   ← context, events, stage types
├── guards.ts          ← review loop threshold guards
├── actions.ts         ← Supabase persistence, toasts
└── actors.ts          ← async API invocations per stage
```

### Concurrent Projects

Each project page calls `useMachine(pipelineMachine, { input: { projectId } })`. Three project tabs = three independent machine actors with isolated state. Settings context is a global singleton — loaded once, injected into each machine at spawn time. If an admin updates settings mid-run, it does not affect in-progress pipelines.

**Actor exposure:** the orchestrator scopes a per-project `<PipelineActorProvider>` around its subtree. The provider value is the single `actorRef` returned by `useMachine` for that project, exposed via `usePipelineActor()` (no Map, no project-id lookup). Sibling project pages each render their own provider, so engines on different tabs never see each other's actors. A shared/mutated `Map` keyed by `projectId` is **forbidden** — React would not re-render consumers when the map mutates, and concurrent projects would silently share stale state.

---

## The Machine

### Top-Level States

```
idle → brainstorm → research → draft → review → assets → preview → publish → completed
```

Stage transitions fire from typed `<STAGE>_COMPLETE` events sent by engines.

**Navigation is split into two events** to match the orchestrator's existing semantics:

- `NAVIGATE { toStage }` — jumps to an earlier stage **without clearing any results**. The user can review or regenerate downstream stages on demand. Used for stepper clicks and "Back" buttons that revisit work.
- `REDO_FROM { fromStage }` — clears stage results at indices **strictly after** `fromStage` and parks the machine at `fromStage`'s `idle` substate so the user can regenerate from there. Used when the user explicitly opts into discarding downstream work (modal-confirmed). Original stage's own result is preserved unless the user re-completes it.

Implementations must not collapse these into a single event — `GO_BACK { toStage }` (the original draft's name) was rejected because clearing-the-target was a regression.

### Sub-States (per stage)

Every stage follows a consistent internal pattern:

```
idle → loading → success
              ↘ error   (retriable via RETRY event)
       ↘ paused        (entered via PAUSE; exits via RESUME back to idle)
```

`paused` exists on every stage — `PAUSE` parks the current stage at its `paused` sub-state regardless of which stage is active; `RESUME` returns to that stage's `idle`. The review stage's `paused` is also entered automatically by review guards (score < reject threshold or iteration cap reached). The `publish` stage is auto-paused on entry when `mode === 'auto'` (user must `RESUME` to confirm).

### Review Stage (exception)

The review stage models the iteration loop as machine guards — no imperative if/else:

```
idle → reviewing ──→ score >= approveScore                         → #pipeline.assets
                 ──→ score < rejectThreshold                       → paused
                 ──→ rejectThreshold <= score < approveScore
                       └─ iterationCount < maxIterations           → reproducing
                       └─ iterationCount >= maxIterations          → paused
reproducing (invokes reproduceActor)
           ──→ onDone (auto-pilot)                                 → reviewing
           ──→ onDone (step mode)                                  → idle
           ──→ onError (writes context.lastError, fires toast)     → paused
```

`paused` requires human intervention (`RESUME`) before the machine can resume. `reviewing` entry increments `context.iterationCount` via an `assign` action so the counter belongs to the machine, not the engine. The engine reads the counter but never owns it.

**iterationCount source-of-truth invariant.** The review-loop guards (`hasReachedMaxIterations`) read `context.iterationCount`, **not** `event.result.iterationCount`. The engine MUST NOT forward `iterationCount` on `REVIEW_COMPLETE` — any value present on the event payload is ignored by guards and overwritten by `saveReviewResult` (which stamps the context value onto the saved result). This collapses two sources of truth into one and removes the off-by-one risk if the engine reads a stale snapshot before submitting.

In auto-pilot mode, `reproducing.onDone` re-enters `reviewing` directly (no human click needed); in step mode it drops to `idle` so the user can choose whether to re-run. This branch is expressed as two `onDone` transitions guarded on `context.mode`.

Every `STAGE_ERROR` and every actor `onError` writes a string to `context.lastError` and fires a toast via a named action (`surfaceError`). The `error` substate renders that message; the `RETRY` transition clears it.

### Machine Context

```typescript
interface PipelineMachineContext {
  projectId: string
  channelId: string
  projectTitle: string                 // editable; updated via SET_PROJECT_TITLE
  mode: 'step' | 'auto'                // machine-internal enum
  stageResults: Partial<Record<PipelineStage, StageResult>>
  iterationCount: number               // owned by machine (incremented on reviewing entry)
  lastError: string | null             // cleared on RETRY / next STAGE_COMPLETE
  pipelineSettings: PipelineSettings   // injected at spawn, immutable during run
  creditSettings: CreditSettings       // injected at spawn, immutable during run
}
```

`mode` on the machine is `'step' | 'auto'` (new). The legacy persisted shape used `'step-by-step' | 'auto'` — `mapLegacyPipelineState` handles the conversion at load time (see **State Migration**). Nothing downstream sees the legacy string.

### Event Types

Each stage has its own completion event carrying a narrowly-typed result — no union ambiguity:

```typescript
type PipelineEvent =
  | { type: 'BRAINSTORM_COMPLETE'; result: BrainstormResult }
  | { type: 'RESEARCH_COMPLETE';   result: ResearchResult }
  | { type: 'DRAFT_COMPLETE';      result: DraftResult }
  | { type: 'REVIEW_COMPLETE';     result: ReviewResult }  // guards read result.score; iterationCount on result is IGNORED (machine-owned)
  | { type: 'ASSETS_COMPLETE';     result: AssetsResult }
  | { type: 'PREVIEW_COMPLETE';    result: PreviewResult }
  | { type: 'PUBLISH_COMPLETE';    result: PublishResult }
  | { type: 'STAGE_ERROR';         error: string }
  | { type: 'STAGE_PROGRESS';      stage: PipelineStage; partial: Partial<StageResult> }  // explicit stage tag — never inferred from state.value
  | { type: 'RETRY' }
  | { type: 'TOGGLE_AUTO_PILOT' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'NAVIGATE';          toStage: PipelineStage }           // preserves all results
  | { type: 'REDO_FROM';         fromStage: PipelineStage }         // clears strictly-downstream results
  | { type: 'SET_PROJECT_TITLE'; title: string }                    // invokes updateProjectTitleActor (fromPromise) — onDone updates context, onError fires surfaceError
```

The `PipelineActorRef` type exposed to engines is `ActorRefFrom<typeof pipelineMachine>`. Engines select from the snapshot only — they never mutate context directly.

---

## Settings Layer

### PipelineSettingsProvider

A React Context provider scoped to the **project page subtree** (not the top-level app layout — only the project page needs pipeline settings; wrapping `(app)/layout.tsx` would fetch admin endpoints on every page load including dashboards). Fetches `/api/admin/pipeline-settings` and `/api/admin/credit-settings` once on mount. Exposes settings via `usePipelineSettings()` hook returning `{ pipelineSettings, creditSettings, isLoaded }`.

Settings are injected into each machine actor at spawn time as immutable input — engines never receive settings as props.

**Hydration gate:** the orchestrator must not call `useMachine` until `isLoaded === true`. Spawning with `DEFAULT_*` constants and trusting settings to "update later" is wrong: context is immutable during a run, so a machine spawned pre-load runs on defaults forever. The orchestrator renders a skeleton/spinner while `isLoaded` is false and only instantiates the actor once real settings arrive.

### ResearchEngine Hardcoded Costs

`ResearchEngine` currently has hardcoded level costs (60, 100, 180). These move to `credit_settings` table as three new columns: `cost_research_surface`, `cost_research_medium`, `cost_research_deep`. A new migration adds these columns. `CreditSettings` type and Zod schema gain the corresponding fields.

---

## Engine Redesign

Engines have one responsibility: render UI and fire events.

### What moves OUT of engines

| Concern | Moves to |
|---|---|
| Settings access | Machine context via `useSelector` |
| `onComplete` / `onBack` callbacks | Typed machine events |
| Auto-pilot decisions | Machine guards |
| Supabase persistence | Machine actions |
| Stage completion logic | `<STAGE>_COMPLETE` event |

### What stays in engines

- All UI rendering
- Form state (`react-hook-form` stays local)
- `generate` vs `import` sub-mode (local UI toggle — **not** pipeline state; different concept from machine's `mode: 'step' | 'auto'`). Engines keep a local `useState<'generate' | 'import' | null>` and render the picker themselves when no stage result exists yet. The orchestrator no longer composes a shared picker.
- User interactions
- Loading / error UI per sub-state
- Stage-local data fetches that depend on downstream needs (e.g. `ReviewEngine` re-fetches `/api/content-drafts/:id` to display the current draft; `AssetsEngine`/`PreviewEngine`/`PublishEngine` fetch draft status).

### Engine Pattern

```typescript
function DraftEngine({ projectId }: { projectId: string }) {
  const actor = usePipelineActor(projectId)
  const phase = useSelector(actor, s => s.value.draft)
  const credits = useSelector(actor, s => s.context.creditSettings)
  const stageResult = useSelector(actor, s => s.context.stageResults.draft)

  function handleComplete(result: DraftResult) {
    actor.send({ type: 'DRAFT_COMPLETE', result })
  }

  // pure UI based on phase
}
```

### Estimated Line Count Reduction

| File | Before | After |
|---|---|---|
| `PipelineOrchestrator.tsx` | 808 | ~250 |
| `DraftEngine.tsx` | 1,457 | ~400 |
| `ResearchEngine.tsx` | 1,288 | ~350 |
| `BrainstormEngine.tsx` | 1,143 | ~320 |
| `ReviewEngine.tsx` | 685 | ~250 |
| `AssetsEngine.tsx` | 1,423 | ~400 |

The orchestrator target was relaxed from ~150 to ~250 lines because the inline title editor, stepper wiring, analytics hooks, and draft pre-fetch gating for review/assets/preview/publish (see **Preserved Orchestrator Features**) all live in the shell — replacing them with a thinner shell would delete user-facing features the spec never approved removing.

---

## Preserved Orchestrator Features

The refactor **must not drop** the following current behaviors. These are UI concerns that do not belong in the machine but must remain in the orchestrator shell:

1. **Inline project-title editor** — click title to rename; blur fires `SET_PROJECT_TITLE { title }` to the machine. The machine **invokes** `updateProjectTitleActor` (a `fromPromise` actor that calls `PATCH /api/projects/:id`); on `onDone` it `assign`s `context.projectTitle = title`, on `onError` it fires `surfaceError` with the API error message. Side-effecting persistence lives in the actor, not in a synchronous machine action — keeps actions pure and gives the error path a real surface.
2. **Stepper navigation** — clicking a completed stage in `PipelineStages` fires `NAVIGATE { toStage }` (no clear). Modal-confirmed "Redo from here" fires `REDO_FROM { fromStage }` after the user confirms the discard list.
3. **"Continue to furthest" amber banner** — appears when the user has navigated to an earlier stage than their furthest completed stage.
4. **Auto-pilot runner** — `TOGGLE_AUTO_PILOT` flips `context.mode`; entering any stage with `mode: 'auto'` auto-triggers the engine's generate path (see **Auto-Pilot Orchestration**). `PAUSE` sets a `paused` sub-state at the current stage; `RESUME` clears it. `publish` stage always pauses before publishing, regardless of mode.
5. **Analytics** — `pipeline.stage.navigated`, `pipeline.stage.redone`, `pipeline.mode.changed` events fire from orchestrator `useEffect`s that watch the relevant context slice. Not from inside the machine — keeps machine pure.
6. **Success/error toasts** — `toast.success('Completed {stage}!')` on `*_COMPLETE` and `toast.error(lastError)` on `error` substate entry. Implemented as named machine actions (`toastStageComplete`, `toastError`) so they are unit-testable by mocking `toast`.
7. **Draft pre-fetch gating** — on `NAVIGATE` or transition into `review`/`assets`/`preview`/`publish`, the orchestrator fetches `/api/content-drafts/:id` and shows a "Loading draft..." card until the fetch resolves. Machine does not block on the fetch; the orchestrator gates render only.

### Auto-Pilot Orchestration

Auto-pilot is expressed as a combination of machine context + orchestrator effect:

- The machine's `mode` is the source of truth (`'step' | 'auto'`).
- The orchestrator subscribes to `(state.value, state.context.mode)` and:
  - If `mode === 'auto'` and the current stage is at its `idle` substate and the stage has no result yet → sets a local `engineMode='generate'` so the engine renders in generate mode and auto-starts.
  - If the stage is `review` and mode is `'auto'` and we're in `review.idle` → sends `RESUME` to enter `reviewing`.
  - If the stage is `publish` → always pauses, regardless of mode (user must confirm).
- Engines are mode-agnostic — they do not watch `context.mode`. The orchestrator drives them by toggling the local `engineMode` prop they already understand.

This keeps the machine pure (no imperative kickoff of UI actions) while preserving auto-pilot behavior.

---

## State Migration

The orchestrator currently persists a `PipelineState` shape to `projects.pipeline_state_json`:

```typescript
interface PipelineState {
  mode: 'step-by-step' | 'auto'
  currentStage: PipelineStage
  stageResults: { ... }
  autoConfig: { maxReviewIterations, targetScore, pausedAt? }
}
```

The new machine shape is different: `mode: 'step' | 'auto'`, no `autoConfig` (settings-sourced), and `iterationCount` is a top-level context field. State.value is the machine's source of truth for the current stage — the persisted `currentStage` is only used at hydration to drive a one-shot `NAVIGATE` after spawn, then discarded.

A pure helper `mapLegacyPipelineState(raw: unknown)` handles the translation on the orchestrator's first render:

- Accepts `unknown` (Supabase returns `Record<string, unknown>`).
- Returns `{ mode, initialStageResults, initialIterationCount, initialStage } | null`. `initialStage` is passed back to the orchestrator, which dispatches `NAVIGATE { toStage: initialStage }` once after the machine spawns so the user lands on the same stage they left.
- If the input is already in the new shape (has `stageResults` and `iterationCount`, no `autoConfig`), returns it directly with `initialStage` defaulted to the stage of the furthest completed result (or `'brainstorm'` if none).
- If the input is in the legacy shape, maps:
  - `mode: 'step-by-step'` → `'step'`, `'auto'` → `'auto'`. **Exception:** if `autoConfig.pausedAt` is set on the legacy record, the rehydrated `mode` is forced to `'step'` regardless of the persisted `mode`. Reason: paused state is no longer a context field, and silently resuming auto-pilot on reload would surprise the user. Forcing step mode lands them at the last stage's `idle` substate, where they can manually re-trigger or toggle auto-pilot back on.
  - `autoConfig.pausedAt` is otherwise ignored — pause is expressed as sub-state in the new machine, not as a context field.
  - `stageResults` is passed through (shape unchanged per stage).
  - `review.iterationCount` is lifted to top-level `iterationCount`.
  - `currentStage` is mapped to `initialStage` so the orchestrator can restore the user's position.
- If the input is nullish/empty, returns `null` (orchestrator spawns with defaults, no NAVIGATE fired).
- If the input is a recognizable-but-corrupt legacy record, returns `null` and logs once to Sentry (breadcrumb `pipeline.legacy_state.skipped`) — the user restarts at brainstorm rather than the UI crashing.

A small migration matrix documents every field transformation. Unit tests cover every branch, including the `initialStage` derivation.

---

## File Structure

```
apps/app/src/
├── lib/
│   └── pipeline/
│       ├── machine.ts
│       ├── machine.types.ts
│       ├── guards.ts
│       ├── actions.ts                       (pure context updaters + named machine actions)
│       ├── actors.ts                        (fromPromise actors: reproduceActor, updateProjectTitleActor)
│       └── legacy-state-migration.ts        (mapLegacyPipelineState + tests)
│
├── providers/
│   ├── PipelineSettingsProvider.tsx         (scoped to project page)
│   └── PipelineActorProvider.tsx            (per-project actor context, value = actorRef)
│
├── hooks/
│   └── usePipelineActor.ts                  (reads actorRef from nearest PipelineActorProvider)
│
└── components/
    ├── pipeline/
    │   ├── PipelineOrchestrator.tsx         (~250 lines — preserves title editor, stepper, auto-pilot driver, analytics, draft prefetch)
    │   ├── PipelineStages.tsx               (unchanged)
    │   ├── AutoModeControls.tsx             (prop surface trimmed — reads from machine via selectors)
    │   └── CompletedStageSummary.tsx        (unchanged)
    │
    └── engines/
        ├── types.ts                         (trimmed — no settings fields)
        ├── BrainstormEngine.tsx             (thin view layer, owns local generate/import mode)
        ├── ResearchEngine.tsx               (thin view layer, no hardcoded costs, owns local mode)
        ├── DraftEngine.tsx                  (thin view layer, owns local mode)
        ├── ReviewEngine.tsx                 (thin view layer, no mode picker — always generate)
        ├── AssetsEngine.tsx                 (thin view layer, owns local mode)
        ├── PreviewEngine.tsx                (unchanged)
        └── PublishEngine.tsx                (unchanged)

packages/shared/src/schemas/
└── pipeline-settings.ts                     (add research cost fields)

supabase/migrations/
└── YYYYMMDDHHMMSS_research_costs.sql        (3 new columns on credit_settings)
```

---

## API Changes

No new API routes required. Existing routes unchanged:
- `GET /api/admin/pipeline-settings` — read by provider on mount
- `GET /api/admin/credit-settings` — read by provider on mount
- `PATCH` variants — admin-only, unchanged

The `content-drafts.ts` FORMAT_COSTS duplication (3 locations) gets extracted to a single `calculateDraftCost(type, creditSettings)` helper. No behavior change.

---

## Database Changes

One migration: add three research cost columns to `credit_settings`.

```sql
ALTER TABLE credit_settings
  ADD COLUMN cost_research_surface integer NOT NULL DEFAULT 60,
  ADD COLUMN cost_research_medium   integer NOT NULL DEFAULT 100,
  ADD COLUMN cost_research_deep     integer NOT NULL DEFAULT 180;
```

Defaults preserve current hardcoded behavior.

---

## Testing

`lib/pipeline/` contains zero React — every guard, action, and transition is testable with plain Vitest:

```typescript
it('pauses auto-pilot when score is below reject threshold', () => {
  const actor = createActor(pipelineMachine, { input: mockInput })
  actor.start()
  // reach reviewing first
  actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstorm })
  actor.send({ type: 'RESEARCH_COMPLETE',   result: research })
  actor.send({ type: 'DRAFT_COMPLETE',      result: draft })
  actor.send({ type: 'RESUME' })
  actor.send({ type: 'REVIEW_COMPLETE', result: { score: 30, iterationCount: 1, /* ... */ } })
  expect(actor.getSnapshot().value).toMatchObject({ review: 'paused' })
})
```

Priority test coverage:
- Review loop guards (all 4 paths)
- `NAVIGATE` preserves all stage results; machine value updates
- `REDO_FROM` clears strictly-downstream results; the target stage's own result is preserved
- Settings injected at spawn are immutable during run
- Concurrent actors (two `createActor` calls) don't share state
- `mapLegacyPipelineState` handles: already-new shape, legacy shape, null/empty, corrupt record
- `mapLegacyPipelineState` forces `mode='step'` when legacy `autoConfig.pausedAt` is set, regardless of persisted `mode` (no silent auto-resume on reload)
- `reproducing.onError` writes `context.lastError` and fires `surfaceError`
- Auto-pilot: `reproducing.onDone` re-enters `reviewing` when `mode === 'auto'`, drops to `idle` when `mode === 'step'`
- `updateProjectTitleActor.onDone` updates `context.projectTitle`; `onError` fires `surfaceError` and leaves `projectTitle` unchanged
- `PAUSE` parks any active stage at its `paused` sub-state; `RESUME` returns it to `idle`
- Analytics events (`pipeline.stage.navigated`, `pipeline.stage.redone`, `pipeline.mode.changed`) fire from orchestrator effects — assert via spy on the analytics client during `NAVIGATE`/`REDO_FROM`/`TOGGLE_AUTO_PILOT`

Engine component tests use `@testing-library/react` + `userEvent`:
- Render the engine with a **real** XState actor (`createActor(pipelineMachine, { input })`) — not a mocked `usePipelineActor`.
- Drive the UI with `userEvent.click(...)`, then assert `actor.getSnapshot().context.stageResults.<stage>` reflects the dispatched event payload. This verifies the engine's event wiring end-to-end, not just that it renders.

### Browser smoke

Before declaring the refactor complete, manually verify:
- Open an existing project with a persisted `pipeline_state_json` record — `mapLegacyPipelineState` runs and restores the correct stage.
- Brainstorm → Research → Draft — state persists across hard reload.
- Review with score ≥ 90 → auto-advances to assets.
- Review with score < 40 → pauses, toast shown, `RESUME` re-enters `reviewing`.
- Auto-pilot toggle: watch `reviewing → reproducing → reviewing` loop; confirm `publish` always pauses.
- Concurrent projects: open two project tabs, advance one; the other remains untouched.

---

## Migration Path

The refactor is a breaking change to the pipeline component API. No backwards-compatibility shims — all engine `onComplete`/`onBack` props are removed and replaced with machine events. The migration is done in one branch, not incrementally.

**Order of implementation:**
1. Machine types + schema (`machine.types.ts`, shared schemas, DB migration)
2. Machine definition (`machine.ts`, `guards.ts`, `actions.ts`, `actors.ts`)
3. `mapLegacyPipelineState` helper + unit tests (`legacy-state-migration.ts`) — must land before the orchestrator swap so existing projects load correctly on the first deploy.
4. Settings provider + actor provider + hook (`PipelineSettingsProvider.tsx`, `PipelineActorProvider.tsx`, `usePipelineActor.ts`)
5. Refactored orchestrator (`PipelineOrchestrator.tsx`) — **preserves** title editor, stepper navigation, auto-pilot driver, analytics, draft pre-fetch gating.
6. Engine refactor — one engine at a time, in pipeline order. Tests use real actors + `userEvent`.
7. `content-drafts.ts` FORMAT_COSTS deduplication
8. Wire `PipelineSettingsProvider` + `PipelineActorProvider` into the project page (not `(app)/layout.tsx`).
9. Full regression suite + browser smoke (see **Testing > Browser smoke**).

---

## Standalone Engine Pages

Three ad-hoc pages reuse the engine components outside the pipeline orchestrator:

- `app/[locale]/(app)/channels/[id]/brainstorm/new/page.tsx` — fresh brainstorm session
- `app/[locale]/(app)/channels/[id]/research/new/page.tsx` — fresh research from `?ideaId=`
- `app/(app)/channels/[id]/drafts/new/page.tsx` — fresh draft from `?ideaId=&researchSessionId=`

After the refactor, engines call `usePipelineActor()` and will throw outside `<PipelineActorProvider>`. To keep these pages working without re-introducing the legacy prop surface, a `StandaloneEngineHost` wrapper provides:

1. `<PipelineSettingsProvider>` — same admin settings fetch as the orchestrator path.
2. An ad-hoc `pipelineMachine` actor seeded with URL-derived stage results (e.g. `initialStageResults: { brainstorm: { ideaId, ... } }` for the research page).
3. `<PipelineActorProvider value={actorRef}>` so the wrapped engine resolves its actor.
4. A subscription that fires the page's `onStageComplete` callback when `stageResults[stage]` first appears, then unsubscribes (replaces the old `onComplete` prop).

The host accepts `{ stage, channelId, projectId?, initialStageResults?, onStageComplete }` plus the engine as `children`. Each standalone page becomes ~25 lines: `<StandaloneEngineHost>` wrapping `<EngineX mode="generate" />`. URL→`initialStageResults` seeding lives in the page (page knows what query params it accepts), not the host.

This keeps engines homogeneous (one signature, one provider contract) and avoids a parallel "headless engine" tree. The host is the only place the orchestrator-vs-standalone divergence is encoded.

---

## Out of Scope

- XState actor system (Approach C) — deferred, Approach B is the stepping stone
- Parallel stage execution (assets + preview simultaneously) — future enhancement
- Collaborative editing on shared pipelines — future enhancement
- Production prompt agent config externalization — separate refactor
