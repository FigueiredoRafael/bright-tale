# Pipeline XState Refactor — Implementation Plan

**Status:** approved · **Branch:** `feat/pipeline-orchestrator-refactor` · **Last updated:** 2026-04-25

> **For agentic workers:** the detailed step-by-step tasks live in the six wave files listed below. **Do not execute this file directly.** Pick the wave you are running and follow that file's `## Tasks` section under skill `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`.

**Design spec:** [`../specs/2026-04-24-pipeline-xstate-refactor-design.md`](../specs/2026-04-24-pipeline-xstate-refactor-design.md) — read this first for architecture rationale, machine model, and invariants.

---

## Goal

Replace the 808-line `PipelineOrchestrator` React component with an XState v5 actor-based architecture that supports concurrent projects and enforces pipeline transitions as explicit, testable state-machine logic — **without losing any user-facing behavior** (title editor, stepper navigation, auto-pilot, analytics, draft pre-fetch, generate/import picker).

## Architecture

Each project page scopes its own `pipelineMachine` actor via `useMachine` and exposes it through a per-project `<PipelineActorProvider>` (value = single `ActorRef`, **no shared Map**). A `PipelineSettingsProvider` at the project-page level fetches admin settings once and the orchestrator spawns its machine only after settings are loaded (hydration gate). Engines become thin view layers that read state via `useSelector` and fire typed events to the actor; they keep their own local `generate | import` UI toggle.

## Tech Stack

XState v5, @xstate/react v5, Vitest (existing), React 19, Next.js 16 App Router.

---

## Pre-commit hook

Pre-commit hook (typecheck + lint-staged) is operational on this branch — commits run through `.husky/pre-commit` cleanly against the project's Node 20. Do **not** pass `--no-verify` to any commit in this plan; let the hook gate broken types and ESLint regressions before they hit CI.

If a commit ever needs to bypass the hook, fix the underlying hook/signing issue first instead of bypassing.

---

## Execution Manifest — Run These Wave Files in Order

Six waves, each a self-contained execution file. Open the wave file, satisfy its pre-flight, run its tasks, satisfy its exit criteria, then move to the next.

| Wave | File | Tasks (in parent's old numbering) | Scope | Depends on |
|---|---|---|---|---|
| 0 | [`2026-04-24-pipeline-xstate-wave-0-foundation.md`](./2026-04-24-pipeline-xstate-wave-0-foundation.md) | 1, 2 | install XState; DB migration for research costs | — |
| 1 | [`2026-04-24-pipeline-xstate-wave-1-machine.md`](./2026-04-24-pipeline-xstate-wave-1-machine.md) | 3, 4, 5, 6, 7 | pure machine: types, guards, actions, actors, definition + integration tests | Wave 0 |
| 2 | [`2026-04-24-pipeline-xstate-wave-2-providers.md`](./2026-04-24-pipeline-xstate-wave-2-providers.md) | 8, 8.5 | settings provider, actor provider, hook, legacy `pipeline_state_json` migration helper | Wave 1 |
| 3 | [`2026-04-24-pipeline-xstate-wave-3-orchestrator.md`](./2026-04-24-pipeline-xstate-wave-3-orchestrator.md) | 9 | orchestrator swap with engine bridge (preserves all features) | Wave 2 |
| 4 | [`2026-04-24-pipeline-xstate-wave-4-engines.md`](./2026-04-24-pipeline-xstate-wave-4-engines.md) | 9.5, 10, 11, 12, 13, 14 | StandaloneEngineHost helper + sequential engine peel-off (Brainstorm → Research → Draft → Review → Assets); each engine task also updates its standalone `channels/[id]/.../new/page.tsx` | Wave 3 |
| 5 | [`2026-04-24-pipeline-xstate-wave-5-cleanup.md`](./2026-04-24-pipeline-xstate-wave-5-cleanup.md) | 15, 16, 17 | FORMAT_COSTS dedup; provider wiring at project page; docs sync; final acceptance | Wave 4 |

---

## ⚠ Deployment Coupling — Read Before Merging

**Wave 2 (legacy `pipeline_state_json` migration helper) MUST merge and deploy together with or before Wave 3 (orchestrator swap).**

If Wave 3 ships to production without Wave 2, every existing project with a persisted `pipeline_state_json` record will silently reset to `brainstorm` on first load, because the new machine context shape is incompatible with the legacy `autoConfig` / `mode: 'step-by-step'` format.

Rules:
- Do **not** split Waves 2 and 3 across PRs unless both land in the same release.
- During a rebase conflict, resolve in favor of Wave 2 landing first.
- Pre-deploy smoke: load an existing project that has `pipeline_state_json` set — confirm the user lands on the same stage they left (not brainstorm).

---

## ⚠ Wave 4 Engine Order — Strict Sequential Execution

Tasks 9.5 → 10 → 11 → 12 → 13 → 14 must run **sequentially**. Task 9.5 (StandaloneEngineHost) lands first — without it, Tasks 10/11/12 break the three `channels/[id]/{brainstorm,research,drafts}/new/page.tsx` standalone pages because their engines now require `<PipelineActorProvider>` to resolve `usePipelineActor()`. Tasks 10–14 then run in pipeline order (Brainstorm → Research → Draft → Review → Assets). Do not parallelize. Do not skip ahead.

Why: Wave 3 introduces a `bridge(...)` helper in `PipelineOrchestrator.tsx` that passes both old (`onComplete`, `onBack`, `context`) and new props to every engine, so each commit stays tsc-green while engines refactor one at a time. Each engine task's final step is **strip the bridge for that one engine** — meaning the bridge keeps shrinking but is never partially typed for an engine that has already cut over. If a later engine is refactored before an earlier one, the bridge's TypeScript surface for the in-between engines is wrong and tsc fails for the whole branch.

By the end of Wave 4 the bridge helper, `buildLegacyContext`, and all `onComplete`/`onBack`/`context` props are deleted; the orchestrator drops to ~250 lines.

---

## Final Acceptance (Wave 5 exit gate)

Once Wave 5 lands, the entire refactor is complete when all six items in the design spec's **Browser smoke** checklist pass:

- Legacy state hydration restores the correct stage from a real `pipeline_state_json` snapshot
- Full pipeline happy path: brainstorm → research → draft → review (≥90 auto-advances; <40 pauses + toast; iteration-exhaustion pauses)
- Auto-pilot publish gate: machine sits at `publish.idle` regardless of `mode === 'auto'`
- Concurrent projects: two tabs advance independently
- Navigation vs redo: stepper click preserves results; "Redo from here" modal clears strictly-downstream
- Persistence after hard reload: stage + iterationCount + stage results all restore

Code-health gates: `npm run test` green across all workspaces, `npm run typecheck` green, `npm run lint` green, `npm run build` green, no `--no-verify` in any commit on this branch.

---

## Out of Scope (Separate PRs)

- PreviewEngine and PublishEngine refactor (already thin — kept on bridge until separate refactor PR)
- Production prompt agent config externalization
- Admin settings navigation wiring
- XState Stately visualizer integration
- Parallel stage execution (assets + preview simultaneously) — future enhancement
- Collaborative editing on shared pipelines — future enhancement
