---
title: Engines React to Stage Run Status (B-pattern restart progress)
status: ready-for-agent
date: 2026-05-26
owner: Hector
related: docs/prds/review-loop-stagnation-fixes.md
---

# Engines React to Stage Run Status — PRD

## Problem Statement

When a creator restarts a stage via the "Restart step" button in `FocusPanel`, the engine showing the previous output does not enter active/progress mode. The user sees:

- The previous completed run's content still rendered (e.g. the old produced script for video).
- No `GenerationProgressFloat` side panel.
- No spinner, no toast — only the small "Restarting…" label flicker on the button itself.

The same gap exists for any restart path that does NOT go through the engine's own "Generate" button:
- Autopilot orchestrator queues a new `stage_run` for the same stage.
- A revision loop (review → produce) auto-queues a new production `stage_run`.
- Another browser tab triggers a restart on the same project.
- An API client (or future scheduled job) creates a `stage_run` directly.

In every case the engine misses the transition because its "am I working?" state is derived from local React state set inside its own button-click handler — not from the canonical `stage_run` status in the database.

The user perceives autopilot/restart as "nothing happened" until they refresh the page or wait for the run to finish and the engine reloads. For long video productions (1–3 min) the perceived bug window is the entire generation duration.

## Solution

Every engine derives its active/progress state from `latestTargetRun.status` (the most recent `stage_run` for the engine's stage + track), not from local-only state set inside button handlers. When the orchestrator (or any other actor) queues or runs a new `stage_run`, the engine automatically:

1. Clears any stale preview from a prior completed run.
2. Mounts the `GenerationProgressFloat` side panel with the new run's session ID.
3. Subscribes to the appropriate SSE feed for live progress.
4. On completion, reloads payload and returns to "done" state with the new content.

The in-engine "Generate" button continues to work — it POSTs to the same endpoints as before, the resulting `stage_run` flips to `queued`, and the engine reacts the same way it does for any external restart. Net result: button-driven and externally-driven flows share one render path.

A shared `useActiveStageRun(stage, trackId)` hook encapsulates the "is there a new run I should be reacting to?" decision so the 7 affected engines don't each reimplement the correlation logic.

## User Stories

1. As a creator who clicks "Restart step" on the Production stage, I want the previous produced output to disappear immediately and a progress indicator to appear, so that I can see the new generation is running.
2. As a creator running autopilot, when the orchestrator queues a new Production run after a review revision, I want the Production engine to show progress for the new run instead of the stale prior output, so that I can follow what the agent is doing.
3. As a creator with the Production stage open in one tab and triggering a restart from another tab, I want the open tab to react to the new run within a few seconds, so that I don't see stale state when I switch back.
4. As a creator who refreshes the browser mid-generation, I want the engine to reconnect to the in-flight `stage_run` and resume showing progress, so that I don't lose visibility into long-running work.
5. As a creator who clicks the in-engine "Generate" button (the original path), I want the experience to be identical to today — progress float appears, content lands on completion — so that the refactor doesn't regress the happy path.
6. As a creator on a video project where Production fails and I click Restart, I want the failure banner to clear and the new run's progress to take over, so that I'm not staring at a stale error after triggering a recovery.
7. As a creator on the Review stage when the orchestrator loops back into Production after a revision, I want the Review engine to clear its prior iteration view and show progress for the new review pass, so that the iterations picker updates as new passes complete.
8. As a creator on the Assets stage when restart is triggered, I want the prior briefs/images to clear and the assets generation flow to restart from scratch, so that I'm not seeing a confusing mix of old and new asset cards.
9. As a developer adding a new engine, I want to import one hook (`useActiveStageRun`) and get the active-stage-run state correctly correlated to my engine's stage + track, so that I don't reinvent the correlation logic.
10. As a developer, I want a single hook to test in isolation that covers the active-run correlation rules (matches stage + track, distinguishes "current run" from "old completed run", handles null/undefined gracefully), so that I don't have to test the same logic inside 7 engines.
11. As an operator monitoring the autopilot, I want engines and the sidebar status badges to be in sync (both reading from the same `stage_runs` source of truth), so that the UI never shows "Production running" in the sidebar while the engine still shows the previous done state.
12. As a creator who clicks Restart on Publish, I want NO progress side-panel behavior change — Publish is confirm-only, not generative — so that the refactor is scoped to engines that actually generate content.

## Implementation Decisions

### Modules

**1. `useActiveStageRun` hook — new file**
- Location: `apps/app/src/hooks/useActiveStageRun.ts` (new directory if not present).
- Signature:
  ```ts
  function useActiveStageRun(stage: Stage, trackId: string | null): {
    runId: string | null;
    status: StageRunStatus | null;
    startedAt: string | null;
    isActive: boolean;       // true when status === 'queued' || 'running'
    isFresh: boolean;        // true when this runId differs from the last one this hook returned as "completed"
  }
  ```
- Subscribes to the same `useProjectStream(projectId)` source `FocusPanel` already uses — single source of truth.
- Internally tracks "last completed runId returned" via `useRef`. When the live `latestTargetRun` has a different ID and is `queued`/`running`, `isFresh` flips to true. When it transitions back to `completed`/`failed`/`awaiting_user`, the hook updates its internal "last completed" memo.
- Returns null fields when no stage_run exists for the (stage, trackId) tuple.

**2. Optimistic queued state in `FocusPanel` restart handler**
- After the POST `/api/projects/:projectId/stage-runs` returns success and before `refresh()` round-trips, push an optimistic `{ status: 'queued' }` patch into the local stream cache for the affected (stage, trackId).
- Closes the 200–500 ms perceived-stale window between POST success and the next `/stages` poll.
- If the real refresh comes back without the new run (rare race), the optimistic patch is overwritten on next poll.

**3. Engine refactor — 7 engines**
- Affected: `BrainstormEngine`, `ResearchEngine`, `CanonicalEngine`, `ProductionEngine`, `ReviewEngine`, `AssetsEngine`, `PreviewEngine`. **Publish excluded** (confirm-only, no generation).
- Pattern applied to each:
  1. Import + call `useActiveStageRun(stage, trackId)`.
  2. Replace the existing local `activeDraftId`/`activeSince` initiation that only fires inside `handleGenerate` with a `useEffect` that watches `isActive` + `runId`:
     - When `isActive` flips true with a fresh `runId`: clear stale preview state, mount progress float, derive session ID for SSE.
     - When `isActive` flips false (run completed): refetch payload, render new content, unmount float.
  3. The in-engine "Generate" button continues to POST the same endpoints. The button no longer directly sets `activeDraftId` — the resulting `stage_run` row triggers the hook on next stream poll, and the optimistic patch from module 2 closes the latency gap.
- Engines vary in what "session ID for SSE" means (some use draft ID, some use brainstorm session ID, etc). Keep each engine's existing session-ID derivation; only the trigger for entering active mode moves to the hook.

**4. Test coverage**
- Unit test for `useActiveStageRun` covering the correlation matrix (right stage + right track, wrong stage, wrong track, null trackId, fresh vs. stale runId, status transitions).
- Per-engine integration test for the new restart path: render engine with a "done" payload + mock context, simulate `useProjectStream` returning a new `queued` run, assert progress float mounts and prior preview is cleared.

### State machine encoded by the hook

```
                              ┌──────────────────────────────┐
                              │ no stage_run for (stage,trk) │
                              │  → { isActive: false,        │
                              │      isFresh: false,         │
                              │      runId: null }           │
                              └──────────────┬───────────────┘
                                             │ new run inserted
                                             ▼
        ┌──────────────────────────┐  status flips    ┌────────────────────────────┐
        │ queued | running         │ ───────────────► │ completed | failed |       │
        │ isActive: true           │                  │ awaiting_user              │
        │ isFresh: true            │                  │ isActive: false            │
        │ runId: <new>             │                  │ isFresh: false             │
        └────────────┬─────────────┘                  │ runId: <same as last seen> │
                     │                                └──────────────┬─────────────┘
                     │                                               │ a NEW run with
                     │                                               │ a DIFFERENT id
                     │                                               │ flips to queued
                     └───────────────────────────────────────────────┘
```

The hook's internal `lastCompletedRunId` ref is what distinguishes "rendering completed state for the same run I've been watching" from "a new run just kicked off."

### Out-of-the-way wiring

- `trackId` for shared stages (brainstorm, research, canonical) is `null`. The hook handles this by falling back to the project-level latest run for the stage.
- The hook does NOT trigger the GET `/api/content-drafts/:id` refetch itself — engines own their payload fetching. The hook only signals "now is when you should refetch." Refetch logic stays per-engine because each engine fetches a different shape (drafts, sessions, archives, etc).

## Testing Decisions

A good test for this PRD asserts the **render output the user sees** under specific context conditions — not the internals of when `useEffect` re-runs or the order of state setters.

Three test surfaces:

**1. `useActiveStageRun` hook unit tests** (new file: `apps/app/src/hooks/__tests__/useActiveStageRun.test.ts`)
- No matching `stage_run` in context → returns `{ isActive: false, isFresh: false, runId: null }`.
- Matching `queued` run with new ID → `{ isActive: true, isFresh: true }`.
- Matching `running` run with same ID as last seen → `{ isActive: true, isFresh: false }`.
- Status transitions from `running` to `completed` → `isActive` flips false on next render, `runId` persists, future polls of same ID stay `isFresh: false`.
- A second new run inserted after the first completes → `isFresh` flips true again.
- `trackId` mismatch (run exists for a different track) → `isActive: false`.
- Shared stage with `trackId: null` → falls back to project-level latest run for the stage.
- Prior art: nothing identical in the repo today. Closest patterns are the existing context-consuming hooks (search for `useProjectStream` test files); rendered with `renderHook` from `@testing-library/react`.

**2. Per-engine integration tests** (extend each engine's existing `__tests__` file)
- For each of the 7 engines, the same scenario:
  - Render with a "done" payload + mocked context returning a `completed` stage_run for this (stage, track).
  - Assert engine shows the completed preview.
  - Update mock context to return a NEW stage_run with `status: 'queued'`.
  - Re-render. Assert: prior preview is cleared, `GenerationProgressFloat` is in the DOM with the right session ID, the engine no longer renders the "done" content.
- Counter-scenario: in-engine "Generate" button click also triggers active state (preserves the happy path).
- Prior art: `ProductionEngine.test.tsx` (if present) and `AssetsEngine.test.tsx` already mount engines with mocked context — reuse the fixture builders.

**3. `FocusPanel` optimistic-patch test** (extend existing FocusPanel test)
- POST `/api/projects/:id/stage-runs` mock returns success.
- Assert that immediately after the POST resolves (before any `refresh()` poll), the cached `stageRuns[stage]` reflects the new `queued` run.
- Assert the next real `/stages` poll either confirms or overwrites the optimistic state — no permanent divergence.

Out of testing scope (manual verification before flag flip):
- Real cross-tab restart behavior with the dev server running.
- Long-run video production (1–3 min) — manual smoke test on at least one medium.

## Out of Scope

- `PublishEngine` — confirm-only, no generation. No active/progress state to manage.
- Replacing the existing per-engine SSE/payload fetch logic with a generic abstraction. Each engine has different fetch shapes; consolidation is a separate refactor.
- Adding WebSocket or push-based stage_run updates to replace the polling done by `useProjectStream`. The optimistic patch closes the perceived latency gap without a transport change.
- Re-architecting `GenerationProgressFloat` itself. The float already supports both SSE and controlled-mode rendering (see commit `748fe24c`); engines keep their existing wiring choice.
- Backfilling stage_run history visibility for restarts that happened before this PRD ships.
- Cross-engine coordination ("Production is restarting, so cancel the in-flight Review request"). Out of scope — orchestrator handles ordering server-side.

## Further Notes

- Bug origin: `apps/app/src/components/pipeline/FocusPanel.tsx:308-335` (`handleRestartConfirmed`) POSTs to `/api/projects/:id/stage-runs` and calls `refresh()`, but the engine being shown reads its "am I working?" state from local React state set inside its own `handleGenerate`, not from the restart POST. Identified 2026-05-26 from a creator report on a video project — Production restart left the prior preview visible with no progress indication.
- Existing source of truth: `useProjectStream(projectId)` in `apps/app/src/components/pipeline/ProjectContextProvider.tsx`, already consumed by `FocusPanel` (`latestTargetRun`), the sidebar badges, and the iterations picker. Adding engine consumption keeps every UI surface reading from one place.
- `GenerationProgressFloat` was made controlled-mode-capable in commit `748fe24c` (AssetsEngine wiring). That same controlled-mode is what engines will use once the hook signals `isActive: true`, regardless of whether the trigger was a button click or an external restart.
- Tradeoff considered and rejected: signaling engines via a `ctx.notifyStageRestarted(stage)` from `FocusPanel`. Rejected because it only covers the FocusPanel restart path, doesn't survive page refresh, and couples FocusPanel to engine internals. The DB-derived approach in this PRD covers every restart origin (UI, autopilot, revision loop, cross-tab, API client) with one mechanism.
- Estimate: ~3–5 days. Hook + tests is 1 day. Each engine refactor is 0.25–0.5 day depending on complexity (ReviewEngine and AssetsEngine are the largest).
