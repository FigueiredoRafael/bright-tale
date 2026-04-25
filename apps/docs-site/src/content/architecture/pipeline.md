# Pipeline Orchestrator (v3 — XState Actor Model)

The project pipeline orchestrates a 6-stage content workflow (**Brainstorm → Research → Draft → Review → Assets → Publish**) using **XState actors** for state management and React components for the view layer.

## Architecture overview

```
┌────────────────────────────────────────────────────────┐
│           Project Pipeline Page                         │
│  (apps/app/src/app/.../projects/[id]/page.tsx)        │
└──────────────────────┬─────────────────────────────────┘
                       │
       ┌───────────────┴────────────────┐
       ▼                                ▼
┌──────────────────────┐     ┌──────────────────────┐
│ PipelineSettings     │     │  PipelineActorProvider
│ Provider (scoped to  │     │  (per-project XState │
│ project page)        │     │  machine + context)  │
└──────────────────────┘     └──────────────────────┘
       │                                │
  Fetches admin settings          Spawns actor &
  (credit_settings,              publishes commands
  pipeline_settings)

                       ▼
       ┌───────────────────────────┐
       │  XState pipelineMachine   │
       │  (src/lib/pipeline/)      │
       └────────────┬──────────────┘
                    │
        Accepts typed events:
        NAVIGATE, REDO_FROM,
        TOGGLE_AUTO_PILOT, etc.
                    │
                    ▼
    ┌───────────────────────────────────┐
    │   Orchestrator + Engine Components  │
    │   (thin view layer: useMachine)    │
    │   - BrainstormEngine               │
    │   - ResearchEngine                 │
    │   - DraftEngine                    │
    │   - ReviewEngine                   │
    │   - AssetsEngine                   │
    │   - PublishEngine                  │
    └───────────────────────────────────┘
```

## State Machine (Core)

The **pipelineMachine** (in `apps/app/src/lib/pipeline/machine.ts`) defines:

### States
- **brainstorm.idle** — waiting for brainstorm ideas
- **brainstorm.generating** — fetching AI ideas
- **research.idle** — research cards ready
- **draft.idle** — draft ready
- **reviewing** — AI review in progress (iterated per `reviewMaxIterations`)
- **reproducing** → **reviewing** — auto-pilot loop continuation
- **assets.idle** — assets ready
- **publish.idle** — awaiting manual publish confirmation
- **publish.published** — final state

### Key Events
- **NAVIGATE(stage, replace)** — jump to a stage, **preserving all upstream results**
- **REDO_FROM(stage)** — confirmation modal, then **clear strictly downstream results** and re-enter the target stage
- **TOGGLE_AUTO_PILOT** — switch between step-by-step and auto-pilot modes
- **SUBMIT_BRAINSTORM(selected)** — advance with selected idea
- **APPROVE_RESEARCH** — advance with research cards
- **SUBMIT_DRAFT** — advance with canonical core + produced draft
- **APPROVE_REVIEW(score)** — if score ≥ 90, auto-advances; if < 40, pauses with toast + **RESUME** re-enters reviewing
- **PUBLISH_COMPLETE** — final submission (always manual, even in auto-pilot)

### Iteration & Review Loop
- `iterationCount` owned by machine context (not persisted per stage)
- After review score < 90, auto-pilot enters `reproducing` state and loops back to `reviewing`
- When `iterationCount >= reviewMaxIterations`, pauses at `reviewing` with "Max iterations reached" toast

## Context & Persistence

Machine context includes:
- `brainstormResult`, `researchResult`, `draftResult`, `reviewResult`, `assetsResult` — accumulated stage outputs
- `reviewIterationCount` — counts review cycles; reset on SUBMIT_DRAFT
- `mode: 'step-by-step' | 'auto-pilot'` — user or AI driven
- `error` — last error message (if any)

Persisted to `projects.pipeline_state_json` after every state change. **Legacy migration** via `mapLegacyPipelineState()` maps old shape (`mode`, `autoConfig`, `currentStage`) to new XState context.

## Settings Provider

**PipelineSettingsProvider** (in `apps/app/src/providers/PipelineSettingsProvider.tsx`):
- Fetches `/api/admin/pipeline-settings` + `/api/admin/credit-settings` on mount
- Provides `creditSettings` + `pipelineSettings` via context
- **Scoped to project page only** (not the app layout) to avoid fetching on every navigation

## Engines (View Layer)

Each engine is a thin view component that:
- Calls `useMachine()` to get current state + send events
- Renders UI for its stage
- Accepts optional `mode?` and `draft?` props (no settings/context props — they read from the machine)
- **Zero React imports in `lib/pipeline/`** — machine is pure logic

Example: **BrainstormEngine** reads `state.matches('brainstorm.*')` and renders ideation UI; on "Confirm," sends `SUBMIT_BRAINSTORM(idea)`.

## Cost Calculation

Three new `cost_research_*` columns in `credit_settings` table:
- `cost_research_surface` — shallow research
- `cost_research_medium` — standard research
- `cost_research_deep` — deep research with sources

Helper `calculateDraftCost(type, creditSettings)` in `apps/api/src/lib/calculate-draft-cost.ts` replaces 3 inline `FORMAT_COSTS` lookups in `content-drafts.ts` route.

## Navigation vs Redo

- **NAVIGATE(stage)** — User clicks completed stage in stepper → all downstream results preserved, state jumps to target
- **REDO_FROM(stage)** — User clicks "Redo from here" affordance → confirmation modal → strictly downstream results cleared, target stage's own result preserved, state enters target with fresh form

Example: `draft` stage has `{brainstormResult, researchResult, draftResult}`. REDO_FROM('draft') clears `reviewResult`, `assetsResult`, `publishResult` but keeps `draftResult` intact.

## Auto-pilot

Auto-pilot mode (`mode: 'auto-pilot'`) is a machine-side `mode` flag + an orchestrator-side effect:

1. User toggles `TOGGLE_AUTO_PILOT` → machine updates `mode`
2. When state reaches a boundary (e.g., `draft.idle`), orchestrator checks `if (mode === 'auto-pilot')` and automatically sends the next event (e.g., `APPROVE_REVIEW`)
3. **Exception:** `publish` state **never** auto-publishes — always pauses at `publish.idle` awaiting manual `PUBLISH_COMPLETE`

## Concurrent Project Isolation

Each project has its own **PipelineActorProvider** that spawns a dedicated XState actor:

```tsx
<PipelineActorProvider projectId="proj-123">
  <ProjectContent />
</PipelineActorProvider>
```

Two tabs/windows with different `projectId` values maintain separate machine instances via a `Map<projectId, actorRef>`. No shared state leaks.

## Key Files

- **State machine:** `apps/app/src/lib/pipeline/machine.ts` (typed events, states, actions, guards)
- **Actors:** `apps/app/src/lib/pipeline/actors.ts` (spawning, selecting)
- **Actions:** `apps/app/src/lib/pipeline/actions.ts` (context mutations)
- **Orchestrator:** `apps/app/src/components/pipeline/PipelineOrchestrator.tsx` (~465 lines, stepper, engine routing, auto-pilot effect)
- **Engines:** `apps/app/src/components/engines/` (BrainstormEngine, ResearchEngine, DraftEngine, ReviewEngine, AssetsEngine, PublishEngine)
- **Providers:** `apps/app/src/providers/{PipelineSettingsProvider,PipelineActorProvider}.tsx`
- **Cost helper:** `apps/api/src/lib/calculate-draft-cost.ts`
- **Credit settings:** `apps/api/src/lib/credit-settings.ts`, routes in `apps/api/src/routes/admin-credit-settings.ts`
