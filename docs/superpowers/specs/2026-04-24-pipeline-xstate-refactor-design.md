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

---

## The Machine

### Top-Level States

```
idle → brainstorm → research → draft → review → assets → preview → publish → completed
```

Transitions are triggered by `STAGE_COMPLETE` events fired from engines. Back-navigation is explicit via `GO_BACK` events, which clear downstream stage results.

### Sub-States (per stage)

Every stage follows a consistent internal pattern:

```
idle → loading → success
              ↘ error  (retriable via RETRY event)
```

### Review Stage (exception)

The review stage models the iteration loop as machine guards — no imperative if/else:

```
idle → reviewing ──→ score >= approveScore                         → done
                 ──→ score < rejectThreshold                       → paused
                 ──→ rejectThreshold <= score < approveScore
                       └─ iterationCount < maxIterations           → retry
                       └─ iterationCount >= maxIterations          → paused
```

`paused` requires human intervention before the machine can resume.

### Machine Context

```typescript
interface PipelineMachineContext {
  projectId: string
  mode: 'step' | 'auto'
  stageResults: Partial<Record<PipelineStage, StageResult>>
  iterationCount: number
  pipelineSettings: PipelineSettings   // injected at spawn, immutable during run
  creditSettings: CreditSettings       // injected at spawn, immutable during run
}
```

### Event Types

Each stage has its own completion event carrying a narrowly-typed result — no union ambiguity:

```typescript
type PipelineEvent =
  | { type: 'BRAINSTORM_COMPLETE'; result: BrainstormResult }
  | { type: 'RESEARCH_COMPLETE';   result: ResearchResult }
  | { type: 'DRAFT_COMPLETE';      result: DraftResult }
  | { type: 'REVIEW_COMPLETE';     result: ReviewResult }  // guards read result.score
  | { type: 'ASSETS_COMPLETE';     result: AssetsResult }
  | { type: 'PREVIEW_COMPLETE';    result: PreviewResult }
  | { type: 'PUBLISH_COMPLETE';    result: PublishResult }
  | { type: 'STAGE_ERROR';         error: string }
  | { type: 'RETRY' }
  | { type: 'TOGGLE_AUTO_PILOT' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'GO_BACK'; toStage: PipelineStage }
```

---

## Settings Layer

### PipelineSettingsProvider

A React Context provider placed at the app layout level. Fetches `/api/admin/pipeline-settings` and `/api/admin/credit-settings` once on mount. Exposes settings via `usePipelineSettings()` hook.

Settings are injected into each machine actor at spawn time as immutable input — engines never receive settings as props.

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
| Stage completion logic | `STAGE_COMPLETE` event |

### What stays in engines

- All UI rendering
- Form state (`react-hook-form` stays local)
- User interactions
- Loading / error UI per sub-state

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
| `PipelineOrchestrator.tsx` | 808 | ~150 |
| `DraftEngine.tsx` | 1,457 | ~400 |
| `ResearchEngine.tsx` | 1,288 | ~350 |
| `BrainstormEngine.tsx` | 1,143 | ~320 |
| `ReviewEngine.tsx` | 685 | ~250 |
| `AssetsEngine.tsx` | 1,423 | ~400 |

---

## File Structure

```
apps/app/src/
├── lib/
│   └── pipeline/
│       ├── machine.ts
│       ├── machine.types.ts
│       ├── guards.ts
│       ├── actions.ts
│       └── actors.ts
│
├── providers/
│   └── PipelineSettingsProvider.tsx
│
├── hooks/
│   └── usePipelineActor.ts
│
└── components/
    ├── pipeline/
    │   ├── PipelineOrchestrator.tsx   (~150 lines)
    │   ├── PipelineStages.tsx         (unchanged)
    │   ├── AutoModeControls.tsx       (unchanged)
    │   └── CompletedStageSummary.tsx  (unchanged)
    │
    └── engines/
        ├── types.ts                   (trimmed — no settings fields)
        ├── BrainstormEngine.tsx       (thin view layer)
        ├── ResearchEngine.tsx         (thin view layer, no hardcoded costs)
        ├── DraftEngine.tsx            (thin view layer)
        ├── ReviewEngine.tsx           (thin view layer)
        ├── AssetsEngine.tsx           (thin view layer)
        ├── PreviewEngine.tsx          (unchanged)
        └── PublishEngine.tsx          (unchanged)

packages/shared/src/schemas/
└── pipeline-settings.ts              (add research cost fields)

supabase/migrations/
└── YYYYMMDDHHMMSS_research_costs.sql (3 new columns on credit_settings)
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
  actor.send({ type: 'STAGE_COMPLETE', result: reviewResultWithScore(30) })
  expect(actor.getSnapshot().value).toMatchObject({ review: 'paused' })
})
```

Priority test coverage:
- Review loop guards (all 4 paths)
- `GO_BACK` clears downstream stage results
- Settings injected at spawn are immutable during run
- Concurrent actors don't share state

---

## Migration Path

The refactor is a breaking change to the pipeline component API. No backwards-compatibility shims — all engine `onComplete`/`onBack` props are removed and replaced with machine events. The migration is done in one branch, not incrementally.

**Order of implementation:**
1. Machine types + schema (`machine.types.ts`, shared schemas, DB migration)
2. Machine definition (`machine.ts`, `guards.ts`, `actions.ts`, `actors.ts`)
3. Settings provider + hook (`PipelineSettingsProvider.tsx`, `usePipelineActor.ts`)
4. Thin orchestrator (`PipelineOrchestrator.tsx`)
5. Engine refactor — one engine at a time, in pipeline order
6. `content-drafts.ts` FORMAT_COSTS deduplication
7. Tests

---

## Out of Scope

- XState actor system (Approach C) — deferred, Approach B is the stepping stone
- Parallel stage execution (assets + preview simultaneously) — future enhancement
- Collaborative editing on shared pipelines — future enhancement
- Production prompt agent config externalization — separate refactor
