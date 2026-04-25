# Wave 5 — Cleanup + Acceptance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** [`2026-04-24-pipeline-xstate-refactor.md`](./2026-04-24-pipeline-xstate-refactor.md)
**Design spec:** [`../specs/2026-04-24-pipeline-xstate-refactor-design.md`](../specs/2026-04-24-pipeline-xstate-refactor-design.md)
**Depends on:** Wave 4 (all engines refactored, bridge gone)

**Scope:** Final cleanup — extract `calculateDraftCost` helper to dedupe FORMAT_COSTS across `content-drafts.ts`, wire `PipelineSettingsProvider` + `PipelineActorProvider` into the project page, sync docs, and run the full smoke checklist.

**Branch:** `feat/pipeline-orchestrator-refactor`

---

## Pre-flight

- [ ] Wave 4 merged; bridge helper fully deleted
- [ ] Read parent plan tasks 15, 16, 17
- [ ] Confirm orchestrator line count ≈250
- [ ] Confirm `npm run test` and `npm run typecheck` green across all workspaces

---

## Tasks

### Task 15: FORMAT_COSTS Deduplication in content-drafts.ts

**Files:**
- Create: `apps/api/src/lib/__tests__/calculate-draft-cost.test.ts`
- Create: `apps/api/src/lib/calculate-draft-cost.ts`
- Modify: `apps/api/src/routes/content-drafts.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/lib/__tests__/calculate-draft-cost.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calculateDraftCost } from '../calculate-draft-cost'

const settings = {
  costBlog: 200, costVideo: 150, costShorts: 75, costPodcast: 130,
  costCanonicalCore: 80, costReview: 20,
  costResearchSurface: 60, costResearchMedium: 100, costResearchDeep: 180,
}

describe('calculateDraftCost', () => {
  it('returns correct cost for blog', () => expect(calculateDraftCost('blog', settings)).toBe(200))
  it('returns correct cost for video', () => expect(calculateDraftCost('video', settings)).toBe(150))
  it('returns correct cost for shorts', () => expect(calculateDraftCost('shorts', settings)).toBe(75))
  it('returns correct cost for podcast', () => expect(calculateDraftCost('podcast', settings)).toBe(130))
  it('falls back to costBlog for unknown types', () => expect(calculateDraftCost('unknown', settings)).toBe(200))
})
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx vitest run apps/api/src/lib/__tests__/calculate-draft-cost.test.ts
```

Expected: `FAIL — Cannot find module '../calculate-draft-cost'`

- [ ] **Step 3: Implement helper**

Create `apps/api/src/lib/calculate-draft-cost.ts`:

```typescript
interface CreditSettings {
  costBlog: number
  costVideo: number
  costShorts: number
  costPodcast: number
  [key: string]: number
}

const FORMAT_TO_FIELD: Record<string, keyof CreditSettings> = {
  blog:    'costBlog',
  video:   'costVideo',
  shorts:  'costShorts',
  podcast: 'costPodcast',
}

export function calculateDraftCost(type: string, settings: CreditSettings): number {
  const field = FORMAT_TO_FIELD[type]
  return field ? (settings[field] as number) : settings.costBlog
}
```

- [ ] **Step 4: Run — confirm pass**

```bash
npx vitest run apps/api/src/lib/__tests__/calculate-draft-cost.test.ts
```

Expected: `PASS (5)`

- [ ] **Step 5: Replace 3 duplicate FORMAT_COSTS blocks in content-drafts.ts**

In `apps/api/src/routes/content-drafts.ts`, add import at top:

```typescript
import { calculateDraftCost } from '../lib/calculate-draft-cost.js'
```

Find the three locations (approx lines 491, 952, 2270) where FORMAT_COSTS is computed inline. Each looks like:

```typescript
const FORMAT_COSTS: Record<string, number> = {
  blog: creditSettings.costBlog,
  video: creditSettings.costVideo,
  shorts: creditSettings.costShorts,
  podcast: creditSettings.costPodcast,
}
const draftCost = FORMAT_COSTS[type] ?? 200
```

Replace each with:

```typescript
const draftCost = calculateDraftCost(type, creditSettings)
```

- [ ] **Step 6: Run existing API tests to confirm no regression**

```bash
npx vitest run apps/api/src/
```

Expected: all existing tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/calculate-draft-cost.ts \
        apps/api/src/lib/__tests__/calculate-draft-cost.test.ts \
        apps/api/src/routes/content-drafts.ts
git commit -m "refactor(api): extract calculateDraftCost helper, remove 3 duplicate FORMAT_COSTS blocks"
```

---

### Task 16: Wire PipelineSettingsProvider into the Project Page + Final Checks

**Files:**
- Modify: `apps/app/src/app/[locale]/(app)/projects/[id]/page.tsx` (or nearest project-scoped wrapper)
- Run: full test suite + typecheck + browser smoke

**Scope decision:** wrap only the project page — **not** the `(app)/layout.tsx`. The provider fetches `/api/admin/pipeline-settings` and `/api/admin/credit-settings`; mounting it at the `(app)` layout triggers those calls on every page under the group (`/projects`, `/blogs`, `/images`, `/assets`, `/podcasts`, `/ideas`, `/channels`, etc.), most of which never use the pipeline. The project page is the only consumer.

- [ ] **Step 1: Wrap the project page content**

Open `apps/app/src/app/[locale]/(app)/projects/[id]/page.tsx`. Wrap the `PipelineOrchestrator` render with `<PipelineSettingsProvider>`:

```tsx
import { PipelineSettingsProvider } from '@/providers/PipelineSettingsProvider'

// inside the page component, where PipelineOrchestrator is rendered:
return (
  <PipelineSettingsProvider>
    <PipelineOrchestrator
      projectId={project.id}
      channelId={project.channel_id}
      projectTitle={project.title}
      initialPipelineState={project.pipeline_state_json as Record<string, unknown>}
    />
  </PipelineSettingsProvider>
)
```

If the project page is a Server Component, lift only the `<PipelineOrchestrator>` subtree into a client wrapper file and move the provider there — the provider uses `useEffect` and must be client-side.

- [ ] **Step 2: Run the full test suite**

```bash
npm run test:app
```

Expected: all pipeline tests pass. Pre-existing failures unrelated to this refactor are acceptable but must be noted.

- [ ] **Step 3: Run typecheck + build**

```bash
npm run typecheck
npm run build
```

Fix any type errors before proceeding. Any pre-existing dependency/token issues that surface during `npm run build` are out of scope for this branch.

- [ ] **Step 4: Browser smoke**

Follow the **Browser smoke** checklist in the design spec. Each item below must be verified manually before declaring the refactor complete:

- **Legacy state hydration** — Open a project that has a `pipeline_state_json` row with the *old* shape (`mode: 'step-by-step'`, `autoConfig`, `currentStage: 'draft'`). Confirm the UI lands on the draft stage with brainstorm + research summaries intact. Check DevTools Network: no error toast, no console warning about unrecognized state.
- **Full pipeline happy path** — Brainstorm → Research → Draft → Review (approve path with score ≥ 90 auto-advances to assets), then reject path with score < 40 (pauses with toast, `RESUME` re-enters reviewing), then iteration-exhaustion path (iterations hit `reviewMaxIterations` → pauses).
- **Auto-pilot publish gate** — Toggle auto-pilot on after draft. Watch it run through review/assets/preview automatically. Confirm it **stops** at publish: no auto-send of `PUBLISH_COMPLETE`, `PublishEngine` renders with its manual confirmation UI, the machine sits at `publish.idle`.
- **Concurrent project isolation** — Open the app in two browser tabs side-by-side (or two windows). Open Project A in tab 1, Project B in tab 2. In tab 1, advance through brainstorm → research → draft. Switch to tab 2 — its pipeline state must be unchanged (still at whatever stage Project B was left at). Then in tab 2, send a `TOGGLE_AUTO_PILOT` — confirm tab 1's auto-pilot toggle does **not** flip. This verifies that the per-project `<PipelineActorProvider>` correctly scopes each actor and that no shared-Map leak exists.
- **Navigation vs redo** — Click a completed earlier stage in the stepper. Confirm downstream stage results are preserved (no clear). Click the "Redo from here" affordance. Confirm the modal lists the stages that will be discarded. Click cancel — nothing changes. Click confirm — strictly-downstream results are cleared, the target stage's own result is preserved.
- **Persistence after reload** — Advance to draft, hard-reload the page. Confirm the user lands on draft with all upstream results intact.

- [ ] **Step 5: Final commit**

```bash
git add apps/app/src/app/
git commit -m "feat(app): wire PipelineSettingsProvider into the project page"
```

---

### Task 17: Documentation Sync

**Files:**
- Modify: `apps/docs-site/**/pipeline*` (and any linked feature pages)
- Modify: `docs/SPEC.md` (if it describes pipeline orchestration)
- Check: `.claude/docs-config.yaml` for routed sections

Per `.claude/rules/docs-update-on-code-change.md`, code changes that affect documented behavior require a doc update. The pipeline refactor changes: orchestrator architecture, engine contracts (props → machine events), the `credit_settings` schema (three new columns), and the persisted `pipeline_state_json` shape.

- [ ] **Step 1: List changed files and look up documentation routes**

```bash
git diff --name-only main...HEAD | head -50
```

Cross-reference against `.claude/docs-config.yaml`:
- `apps/api/src/routes/admin-credit-settings.ts` → API reference (credit settings shape)
- `supabase/migrations/20260424120000_research_costs.sql` → Database schema docs
- `packages/shared/src/schemas/pipeline-settings.ts` → API reference (request/response shapes)
- `apps/app/src/components/pipeline/PipelineOrchestrator.tsx` → Pipeline feature doc (architecture section: XState actor model, concurrent projects, settings provider, legacy state migration)
- `apps/app/src/components/engines/*` → Engine docs (thin view layer pattern, `usePipelineActor` hook, typed events)

- [ ] **Step 2: Update documentation pages**

Update the pipeline-orchestration feature page (docs-site) to describe:
- Machine-driven state management replacing the 808-line component
- `NAVIGATE` (preserves results) vs `REDO_FROM` (modal-confirmed discard)
- Per-project `PipelineActorProvider` for concurrent-project isolation
- `PipelineSettingsProvider` scoped to the project page
- Legacy `pipeline_state_json` migration via `mapLegacyPipelineState`
- Auto-pilot as machine `mode` + orchestrator effect (not machine-side kickoff)

Update the credit-settings DB schema doc to add the three `cost_research_*` columns.

- [ ] **Step 3: Commit**

```bash
git add docs/ apps/docs-site/
git commit -m "docs: sync pipeline refactor (XState actor model, legacy migration, research costs)"
```

---

## Wave-specific guardrails

### FORMAT_COSTS dedup (Task 15)

Helper signature:
```typescript
export function calculateDraftCost(
  type: DraftFormatType,
  creditSettings: CreditSettings
): number
```

Replace inline cost lookups in `content-drafts.ts` (3 locations). Add unit test with all format types × representative `creditSettings`. No new API surface — internal refactor only.

### Provider wiring (Task 16)

Wire at the **project page** (e.g., `apps/app/src/app/[locale]/(app)/projects/[id]/page.tsx`), not at the app layout. Wrapping the layout would fetch admin endpoints on every navigation including dashboards.

```tsx
<PipelineSettingsProvider>
  <ProjectPageContents />  {/* PipelineOrchestrator inside spawns its own ActorProvider */}
</PipelineSettingsProvider>
```

### Docs sync (Task 17)

Per `.claude/rules/docs-update-on-code-change.md`:

| Changed Path | Update |
|---|---|
| `apps/api/src/routes/content-drafts.ts` | API reference (cost calculation note) |
| `supabase/migrations/*` | Database schema docs (research cost columns) |
| `packages/shared/src/schemas/*` | API reference (CreditSettings shape) |
| `apps/app/src/components/pipeline/*`, `apps/app/src/components/engines/*` | Component docs (actor-based architecture) |
| `apps/app/src/lib/pipeline/*` | New page or section: "Pipeline State Machine" |

---

## Exit criteria — final acceptance for the entire refactor

### Code health
- [ ] `npm run test` green across all workspaces
- [ ] `npm run typecheck` green
- [ ] `npm run lint` green
- [ ] `npm run build` green
- [ ] No `--no-verify` in any commit on this branch
- [ ] No pre-existing test failures regressed (baseline pre-existing failures pre-Wave-0 and confirm parity now)

### Architecture
- [ ] `lib/pipeline/` has zero React imports
- [ ] `PipelineActorProvider` value is `actorRef` (no Map)
- [ ] `PipelineSettingsProvider` wired to project page only (not layout)
- [ ] Orchestrator ~250 lines; bridge helper deleted
- [ ] Engines accept only `mode?` and `draft?` (no settings/context props)

### Browser smoke (design spec lines 387–393, all 6 must pass)
- [ ] Open an existing project with persisted `pipeline_state_json` — `mapLegacyPipelineState` runs and restores the correct stage
- [ ] Brainstorm → Research → Draft — state persists across hard reload
- [ ] Review with score ≥ 90 → auto-advances to assets
- [ ] Review with score < 40 → pauses, toast shown, `RESUME` re-enters `reviewing`
- [ ] Auto-pilot toggle: watch `reviewing → reproducing → reviewing` loop; confirm `publish` always pauses
- [ ] Concurrent projects: open two project tabs, advance one; the other remains untouched

### Docs
- [ ] Sections per routing table updated
- [ ] No "missing docs" deferred items left untracked

---

## Risks

| Risk | Mitigation |
|---|---|
| FORMAT_COSTS dedup changes a cost value silently | Helper preserves current values exactly; unit test matrix covers every format. |
| Provider mounted in wrong place (layout vs page) | Code review checklist + the test from Wave 2 verifying single mount per project. |
| Docs drift not caught | Run `.claude/rules/docs-update-on-code-change.md` checklist explicitly per changed path. |
| Pre-existing test failures masquerade as regressions | Baseline failure list captured pre-Wave-0; compare now. |

---

## Deploy

**Final release:** ship Wave 5 as the closer PR for the refactor. After merge:
- Run `npm run db:push:prod` for the research costs migration (only if not already shipped via Wave 0).
- Tag the release with a changelog entry (parent plan refers to `/changelog` skill if available).
- Announce: "PipelineOrchestrator now actor-based; concurrent projects supported; research costs configurable from admin panel."

---

## Out of scope (separate PRs, per parent plan)

- PreviewEngine + PublishEngine refactor
- Production prompt agent config externalization
- Admin settings navigation wiring
- XState Stately visualizer integration
- Parallel stage execution (assets + preview simultaneously)
- Collaborative editing on shared pipelines
