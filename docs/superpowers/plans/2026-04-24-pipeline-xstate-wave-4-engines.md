# Wave 4 — Engine Peel-Off (Sequential, Pipeline Order)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** [`2026-04-24-pipeline-xstate-refactor.md`](./2026-04-24-pipeline-xstate-refactor.md)
**Design spec:** [`../specs/2026-04-24-pipeline-xstate-refactor-design.md`](../specs/2026-04-24-pipeline-xstate-refactor-design.md)
**Depends on:** Wave 3 (orchestrator + bridge in place)

**Scope:** Refactor each engine into a thin view layer that reads from the actor via `useSelector` and fires typed events via `actor.send`. Strip the orchestrator's `bridge('<stage>')` for that engine in the same commit. By the end of this wave, the bridge helper is fully deleted and the orchestrator drops to its ~250-line target.

**Branch:** `feat/pipeline-orchestrator-refactor`

---

## Pre-flight

- [ ] Wave 3 merged + browser smoke green
- [ ] Read parent plan section "Engine Refactor Pattern (applies to Tasks 10–14)" ~line 2672
- [ ] Read parent plan tasks 10–14 in full
- [ ] Confirm bridge helper is in place and working in `PipelineOrchestrator.tsx`

---

## ⚠ STRICT EXECUTION ORDER — DO NOT REORDER

Tasks 9.5 → 10 → 11 → 12 → 13 → 14 must run **sequentially**:

1. **Task 9.5:** `StandaloneEngineHost` helper (must land before any engine task — once Brainstorm/Research/Draft engines refactor, the standalone pages that consume them break unless wrapped by this helper).
2. **Task 10:** BrainstormEngine (parent ~line 2810) — also updates `channels/[id]/brainstorm/new/page.tsx`.
3. **Task 11:** ResearchEngine (parent ~line 2964) — removes hardcoded research costs; also updates `channels/[id]/research/new/page.tsx`.
4. **Task 12:** DraftEngine (parent ~line 3101) — also updates `channels/[id]/drafts/new/page.tsx`.
5. **Task 13:** ReviewEngine (parent ~line 3246) — no standalone page (review only runs inside the orchestrator).
6. **Task 14:** AssetsEngine (parent ~line 3400) — no standalone page.

**Why sequential:** the bridge passes legacy props to every un-refactored engine. If a later engine is refactored before an earlier one, the bridge's TypeScript surface for the in-between engines is wrong and tsc breaks for the whole branch.

**Each engine task is one atomic commit.** Do not commit a partially-refactored engine.

PreviewEngine and PublishEngine are **out of scope** — already thin, kept on bridge until separate refactor PR.

---

## Per-engine workflow (apply Engine Refactor Pattern)

For every engine task:

1. **Failing test first** — write a real-actor test using `createActor(pipelineMachine, { input })` + `userEvent`. Mocking `usePipelineActor` is forbidden. Test asserts `actor.getSnapshot().context.stageResults.<stage>` reflects the dispatched event.
2. **Refactor engine** to read context via `useSelector` and fire events via `actor.send`. Drop `BaseEngineProps`. Keep all internal form state, API calls, local UI state.
3. **Local generate/import toggle** — engines retain a `mode?: 'generate' | 'import'` prop driven by the orchestrator. Engines stay mode-agnostic — they do **not** watch `context.mode`.
4. **Defensive `if (!draft)` guard** — for engines with the `draft` prop (Review, Assets, Preview, Publish in scope here are Review + Assets). Even though the orchestrator gates render on draft hydration, a missing draft must not crash the engine. Render a fallback card.
5. **Strip the bridge for this engine** — in `PipelineOrchestrator.tsx`, delete the `{...bridge('<stage>')}` spread from this engine's JSX. Keep only `mode` (and `draft` where applicable).
6. **Verify tsc + tests + browser smoke green for the full branch**, not just this engine.
7. **Single atomic commit** per engine.

---

## Wave-specific guardrails

### What moves OUT of every engine

| Concern | Moves to |
|---|---|
| Settings access | `useSelector(actor, s => s.context.creditSettings)` etc. |
| `onComplete` / `onBack` callbacks | `actor.send({ type: '<STAGE>_COMPLETE', result })` / `NAVIGATE` |
| Auto-pilot decisions | Machine guards (already in Wave 1) |
| Supabase persistence | Machine actions / orchestrator subscribe (already in Wave 3) |
| Local `iterationCount` (ReviewEngine specifically) | Machine context — increment on `reviewing` entry |

### What stays in engines

- All UI rendering
- Form state (`react-hook-form`)
- API calls / data fetches
- Loading / error UI per sub-state
- `generate | import` UI variant — driven by `mode` prop, not by `context.mode`

### Test pattern (mandatory)

```typescript
const actor = createActor(pipelineMachine, { input: { ... } }).start()
render(
  <PipelineActorProvider value={actor}>
    <SomeEngine mode="generate" />
  </PipelineActorProvider>
)
await userEvent.click(screen.getByRole('button', { name: /confirm/i }))
expect(actor.getSnapshot().context.stageResults.<stage>).toMatchObject({ ... })
```

### ResearchEngine — additional work (Task 11)

Removes hardcoded `[60, 100, 180]` level costs. Reads `cost_research_surface | medium | deep` from `useSelector(actor, s => s.context.creditSettings)`. Verify the migration from Wave 0 is applied; otherwise `creditSettings` will be missing the fields.

### ReviewEngine — additional work (Task 13)

Remove **all** local iteration-count tracking. The machine owns `iterationCount` (incremented on `reviewing` entry). Engine reads via `useSelector` but never writes.

---

## Tasks

### Engine Refactor Pattern (applies to all engines below)

All five engine refactors share the same test + implementation pattern. Read this once before starting Task 10.

> **⚠ STRICT ORDER — DO NOT REORDER**
>
> Tasks 10 → 11 → 12 → 13 → 14 must run **sequentially in pipeline order** (Brainstorm → Research → Draft → Review → Assets). Do not parallelize. Do not skip ahead.
>
> **Why:** Task 9 introduces a `bridge(...)` helper in `PipelineOrchestrator.tsx` that passes both old (`onComplete`, `onBack`, `context`) and new props to every engine, so each commit stays tsc-green while engines refactor one at a time. Each engine task's final step is **strip the bridge for that one engine** — meaning the bridge keeps shrinking but is never partially typed for an engine that has already cut over. If a later engine is refactored before an earlier one, the bridge's TypeScript surface for the in-between engines is wrong and tsc fails for the whole branch.
>
> **What this means for you:**
> - Finish Task 10 (BrainstormEngine) and merge/commit before starting Task 11.
> - Each engine task is a **single atomic commit** — do not commit a partially-refactored engine.
> - If a task takes longer than expected, do not start the next engine in a parallel branch. Land them one at a time, in order.
> - By the end of Task 14, the bridge helper, `buildLegacyContext`, and all `onComplete`/`onBack`/`context` props are deleted; the orchestrator drops to ~250 lines.


#### New engine signature

Every refactored engine accepts **only UI props** — everything else (projectId, channelId, settings, upstream stage results) comes from the actor:

```typescript
interface EngineProps {
  mode?: 'generate' | 'import'           // optional; only engines with import support
  draft?: Record<string, unknown> | null // only engines that consume the fetched draft (review/assets/preview/publish)
}
```

Inside the engine:

```typescript
const actor = usePipelineActor()
const projectId     = useSelector(actor, (s) => s.context.projectId)
const channelId     = useSelector(actor, (s) => s.context.channelId)
const creditSettings = useSelector(actor, (s) => s.context.creditSettings)
const upstream      = useSelector(actor, (s) => s.context.stageResults.brainstorm) // example

function complete(result: BrainstormResult) {
  actor.send({ type: 'BRAINSTORM_COMPLETE', result })
}
function progress(partial: Partial<BrainstormResult>) {
  actor.send({ type: 'STAGE_PROGRESS', stage: 'brainstorm', partial })
}
function goBack() {
  actor.send({ type: 'NAVIGATE', toStage: 'brainstorm' /* or previous */ })
}
```

Replace every call site:

| Old | New |
|---|---|
| `onComplete(result)` | `actor.send({ type: '<STAGE>_COMPLETE', result })` |
| `onStageProgress(partial)` | `actor.send({ type: 'STAGE_PROGRESS', stage: '<stage>', partial })` |
| `onBack()` / `onBack(targetStage)` | `actor.send({ type: 'NAVIGATE', toStage: targetStage ?? previousStage })` |
| `context.<field>` prop | `useSelector(actor, s => s.context.stageResults.<stage>?.<field>)` |
| `channelId` prop | `useSelector(actor, s => s.context.channelId)` |
| `creditSettings` prop | `useSelector(actor, s => s.context.creditSettings)` |

**Remove** the `BaseEngineProps` extension entirely. Keep all internal form state, API calls, local UI state. Only the interface to the orchestrator changes.

#### `draft` prop invariant (review / assets / preview / publish only)

Engines that take the optional `draft` prop (review, assets, preview, publish) **assume `draft` is non-null when rendered**. The invariant is enforced upstream: the orchestrator's draft-prefetch gate (Task 9 Step 3, around line 2312) renders a `Loading draft…` card instead of the engine until `/api/content-drafts/:id` resolves. So in practice, by the time the engine mounts with one of these stages active, `draft` is hydrated.

**However, do not silently dereference** `draft` without a guard — if the invariant is ever violated (orchestrator refactor, standalone page reuse, test harness bypass), a null deref will crash the stage. Every engine that consumes `draft` should start its render with an explicit guard:

```tsx
export function ReviewEngine({ draft }: { draft: Record<string, unknown> | null }) {
  const actor = usePipelineActor()
  // Invariant: orchestrator gates render on draftData !== null. If this branch
  // hits in production, the gate has regressed — fail loudly rather than crash.
  if (!draft) {
    return (
      <Card><CardContent>
        <p className="text-sm text-destructive">Draft not loaded. Please refresh.</p>
      </CardContent></Card>
    )
  }
  // ... rest of engine
}
```

Add this guard to `ReviewEngine`, `AssetsEngine`, `PreviewEngine`, and `PublishEngine` as part of their refactor. The JSDoc on each engine's `draft` prop should state: "Non-null invariant — orchestrator gates render until draft is hydrated. Guard in the engine is defensive, not normal flow."

#### Orchestrator bridge removal (per-engine)

Task 9 passes a **bridge** of old + new props to every engine so the build stays green while engines refactor one at a time. Every engine task below includes an extra step:

> **Strip the bridge:** in `PipelineOrchestrator.tsx`, delete the `onComplete`, `onBack`, and the `{...bridge('<stage>')}` spread from this engine's JSX. Keep only `mode` (and `draft` where applicable).

By the end of Task 14, all `bridge(...)` calls and the `buildLegacyContext` helper are gone. The orchestrator line count drops back toward the ~250 target.

#### Test pattern (real actor + userEvent)

No more mocking `usePipelineActor` with a fake `getSnapshot`. Use a real actor and the real provider:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { BrainstormEngine } from '../BrainstormEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'

function mountWithActor(overrides: Partial<React.ComponentProps<typeof BrainstormEngine>> = {}) {
  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'proj-1', channelId: 'ch-1', projectTitle: 'T',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS, creditSettings: DEFAULT_CREDIT_SETTINGS,
    },
  }).start()
  render(
    <PipelineActorProvider value={actor}>
      <BrainstormEngine mode="generate" {...overrides} />
    </PipelineActorProvider>
  )
  return actor
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: async () => ({ data: { /* stage-appropriate stub */ }, error: null }),
  }))
})

describe('BrainstormEngine', () => {
  it('dispatches BRAINSTORM_COMPLETE with the idea when user confirms selection', async () => {
    const actor = mountWithActor()
    // ...drive the UI with userEvent to reach the "confirm idea" button...
    // await user.click(screen.getByRole('button', { name: /use this idea/i }))
    // Assert via the machine itself:
    // expect(actor.getSnapshot().context.stageResults.brainstorm?.ideaId).toBe('idea-1')
    // expect(actor.getSnapshot().value).toMatchObject({ research: 'idle' })
  })

  it('dispatches NAVIGATE toStage=brainstorm when Back is clicked from research', async () => {
    // Start the actor past brainstorm, then mount research engine — skip for brainstorm
  })
})
```

The test drives the real actor via the real event API and asserts on the real machine snapshot. If the engine wires up `complete()` correctly, the snapshot moves forward; if it doesn't, the snapshot stays put. That is real regression coverage.

Each engine's task specifies only the engine-specific assertions and any additional stubs needed (e.g. ResearchEngine stubs `costResearchMedium` in `creditSettings`; DraftEngine stubs multiple `/api/...` endpoints).

---

### Task 9.5: StandaloneEngineHost — Provider Wrapper for Ad-Hoc Engine Pages

**Files:**
- Create: `apps/app/src/components/engines/StandaloneEngineHost.tsx`
- Create: `apps/app/src/components/engines/__tests__/StandaloneEngineHost.test.tsx`

**Why this exists:** the three pages under `channels/[id]/{brainstorm,research,drafts}/new/page.tsx` reuse engine components outside the orchestrator. After Tasks 10–12, those engines call `usePipelineActor()` and will throw without a `<PipelineActorProvider>`. `StandaloneEngineHost` wraps a single engine in `<PipelineSettingsProvider>` + an ad-hoc machine actor + `<PipelineActorProvider>` and surfaces stage completion through an `onStageComplete` callback. See design-spec "Standalone Engine Pages".

This task lands **before Task 10** so each engine task can swap its standalone page in the same commit it strips the bridge.

- [ ] **Step 1: Failing test**

Create `apps/app/src/components/engines/__tests__/StandaloneEngineHost.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { StandaloneEngineHost } from '../StandaloneEngineHost'
import { usePipelineActor } from '@/hooks/usePipelineActor'

vi.mock('@/providers/PipelineSettingsProvider', () => ({
  PipelineSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePipelineSettings: () => ({
    pipelineSettings: { reviewRejectThreshold: 40, reviewApproveScore: 90, reviewMaxIterations: 5, defaultProviders: {} },
    creditSettings: { costBlog: 200, costVideo: 200, costShorts: 100, costPodcast: 150, costCanonicalCore: 80, costReview: 20, costResearchSurface: 60, costResearchMedium: 100, costResearchDeep: 180 },
    isLoaded: true,
  }),
}))

function FakeEngine() {
  const actor = usePipelineActor()
  // Simulate engine completing brainstorm.
  React.useEffect(() => {
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: { ideaId: 'idea-1', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c' } })
  }, [actor])
  return <span data-testid="fake">ok</span>
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ data: null, error: null }) }))
})

describe('StandaloneEngineHost', () => {
  it('renders children inside an actor provider and fires onStageComplete when the stage result appears', async () => {
    const onStageComplete = vi.fn()
    render(
      <StandaloneEngineHost stage="brainstorm" channelId="ch-1" onStageComplete={onStageComplete}>
        <FakeEngine />
      </StandaloneEngineHost>,
    )
    expect(screen.getByTestId('fake')).toBeTruthy()
    await waitFor(() => expect(onStageComplete).toHaveBeenCalledTimes(1))
    expect(onStageComplete).toHaveBeenCalledWith('brainstorm', expect.objectContaining({ ideaId: 'idea-1' }))
  })

  it('navigates the machine to the requested stage when stage !== brainstorm', async () => {
    let captured: ReturnType<typeof usePipelineActor> | null = null
    function Capture() {
      captured = usePipelineActor()
      return null
    }
    render(
      <StandaloneEngineHost
        stage="research"
        channelId="ch-1"
        initialStageResults={{ brainstorm: { ideaId: 'idea-1', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c', completedAt: '2026-01-01' } }}
        onStageComplete={() => {}}
      >
        <Capture />
      </StandaloneEngineHost>,
    )
    await waitFor(() => {
      expect(captured?.getSnapshot().value).toMatchObject({ research: 'idle' })
    })
  })

  it('only fires onStageComplete once even if the actor emits further snapshots', async () => {
    const onStageComplete = vi.fn()
    render(
      <StandaloneEngineHost stage="brainstorm" channelId="ch-1" onStageComplete={onStageComplete}>
        <FakeEngine />
      </StandaloneEngineHost>,
    )
    await waitFor(() => expect(onStageComplete).toHaveBeenCalledTimes(1))
    // Simulate any later snapshot tick — the host must have unsubscribed.
    await new Promise((r) => setTimeout(r, 20))
    expect(onStageComplete).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx vitest run apps/app/src/components/engines/__tests__/StandaloneEngineHost.test.tsx
```

Expected: `FAIL — Cannot find module '../StandaloneEngineHost'`

- [ ] **Step 3: Implement the host**

Create `apps/app/src/components/engines/StandaloneEngineHost.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { useMachine } from '@xstate/react'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import {
  PipelineSettingsProvider,
  usePipelineSettings,
} from '@/providers/PipelineSettingsProvider'
import type { PipelineStage, StageResultMap } from '@/lib/pipeline/machine.types'

interface StandaloneEngineHostProps {
  stage: PipelineStage
  channelId: string
  projectId?: string
  initialStageResults?: StageResultMap
  onStageComplete: (stage: PipelineStage, result: Record<string, unknown>) => void
  children: React.ReactNode
}

export function StandaloneEngineHost(props: StandaloneEngineHostProps) {
  return (
    <PipelineSettingsProvider>
      <HostInner {...props} />
    </PipelineSettingsProvider>
  )
}

function HostInner({
  stage,
  channelId,
  projectId,
  initialStageResults,
  onStageComplete,
  children,
}: StandaloneEngineHostProps) {
  const { pipelineSettings, creditSettings, isLoaded } = usePipelineSettings()
  if (!isLoaded) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        </CardContent>
      </Card>
    )
  }
  return (
    <ActorScope
      stage={stage}
      channelId={channelId}
      projectId={projectId}
      initialStageResults={initialStageResults}
      pipelineSettings={pipelineSettings}
      creditSettings={creditSettings}
      onStageComplete={onStageComplete}
    >
      {children}
    </ActorScope>
  )
}

function ActorScope({
  stage,
  channelId,
  projectId,
  initialStageResults,
  pipelineSettings,
  creditSettings,
  onStageComplete,
  children,
}: StandaloneEngineHostProps & {
  pipelineSettings: ReturnType<typeof usePipelineSettings>['pipelineSettings']
  creditSettings: ReturnType<typeof usePipelineSettings>['creditSettings']
}) {
  const [, , actorRef] = useMachine(pipelineMachine, {
    input: {
      projectId: projectId ?? `standalone-${stage}`,
      channelId,
      projectTitle: '',
      pipelineSettings,
      creditSettings,
      initialStageResults,
    },
  })

  // Park the actor at the requested stage once after spawn. Brainstorm is the
  // machine default, so no NAVIGATE needed.
  const navigatedRef = useRef(false)
  useEffect(() => {
    if (navigatedRef.current) return
    navigatedRef.current = true
    if (stage !== 'brainstorm') {
      actorRef.send({ type: 'NAVIGATE', toStage: stage })
    }
  }, [stage, actorRef])

  // Fire onStageComplete the first time the requested stage's result lands in
  // context, then unsubscribe. Standalone pages route on this signal — the
  // engine never sees a callback prop.
  const firedRef = useRef(false)
  useEffect(() => {
    const sub = actorRef.subscribe((snap) => {
      if (firedRef.current) return
      const result = snap.context.stageResults[stage]
      if (result) {
        firedRef.current = true
        onStageComplete(stage, result as Record<string, unknown>)
      }
    })
    return () => sub.unsubscribe()
  }, [actorRef, stage, onStageComplete])

  return <PipelineActorProvider value={actorRef}>{children}</PipelineActorProvider>
}
```

- [ ] **Step 4: Run — confirm pass**

```bash
npx vitest run apps/app/src/components/engines/__tests__/StandaloneEngineHost.test.tsx
```

Expected: `PASS (3)`.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/engines/StandaloneEngineHost.tsx \
        apps/app/src/components/engines/__tests__/StandaloneEngineHost.test.tsx
git commit -m "feat(pipeline): add StandaloneEngineHost wrapper for ad-hoc engine pages"
```

#### Standalone-page invariants

- The host **only** owns the actor scope. URL → `initialStageResults` seeding lives in each page (each page knows its own query-param contract; the host is page-agnostic).
- `onStageComplete` fires **once** — the host unsubscribes after the first match. If the page needs to react to subsequent state changes, it should consume `usePipelineActor()` directly inside its children.
- The ad-hoc actor is **not persisted** — `pipeline_state_json` PATCH lives in the orchestrator, not here. Standalone pages are throwaway sessions; navigation away discards the actor.
- Settings and admin endpoints are fetched on every standalone-page mount. Acceptable: these pages are entered intentionally, not rendered behind every nav.

---

### Task 10: BrainstormEngine — Real-Actor Tests → Thin Layer

**Files:**
- Create: `apps/app/src/components/engines/__tests__/BrainstormEngine.test.tsx`
- Modify: `apps/app/src/components/engines/BrainstormEngine.tsx`

- [ ] **Step 1: Write engine test using the real-actor pattern**

Create `apps/app/src/components/engines/__tests__/BrainstormEngine.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { BrainstormEngine } from '../BrainstormEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'

function mountWithActor(mode: 'generate' | 'import' = 'generate') {
  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'proj-1',
      channelId: 'ch-1',
      projectTitle: 'T',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
    },
  }).start()
  const utils = render(
    <PipelineActorProvider value={actor}>
      <BrainstormEngine mode={mode} />
    </PipelineActorProvider>
  )
  return { actor, ...utils }
}

beforeEach(() => {
  // Brainstorm generate flow calls /api/brainstorm-sessions and
  // /api/idea-archives; import flow hits /api/idea-archives/list.
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/api/brainstorm-sessions')) {
      return { json: async () => ({ data: { sessionId: 'bs-1', ideas: [
        { id: 'idea-1', title: 'Generated Idea', verdict: 'viable', coreTension: 'tension' },
      ] }, error: null }) } as Response
    }
    if (url.includes('/api/idea-archives')) {
      return { json: async () => ({ data: [
        { id: 'idea-import-1', title: 'Imported Idea', verdict: 'viable', coreTension: 'tension' },
      ], error: null }) } as Response
    }
    return { json: async () => ({ data: null, error: null }) } as Response
  }))
})

describe('BrainstormEngine', () => {
  it('dispatches BRAINSTORM_COMPLETE and advances to research when user confirms idea', async () => {
    const user = userEvent.setup()
    const { actor } = mountWithActor('generate')

    // TODO: confirm the exact name/text of the confirm button in BrainstormEngine;
    // replace with the stable accessible name when wiring this test.
    const confirmBtn = await screen.findByRole('button', { name: /use this idea|select idea|confirm/i })
    await user.click(confirmBtn)

    expect(actor.getSnapshot().context.stageResults.brainstorm?.ideaId).toBeTruthy()
    expect(actor.getSnapshot().value).toMatchObject({ research: 'idle' })
  })

  it('fires STAGE_PROGRESS on in-progress edits without advancing the machine', async () => {
    const user = userEvent.setup()
    const { actor } = mountWithActor('generate')

    // TODO: target the actual idea-title text input by role/name.
    const titleInput = await screen.findByRole('textbox', { name: /title/i })
    await user.type(titleInput, 'Partial')

    expect(actor.getSnapshot().value).toMatchObject({ brainstorm: 'idle' })
    // STAGE_PROGRESS merge keeps the engine's partial in context.
    expect(actor.getSnapshot().context.stageResults.brainstorm ?? {}).not.toHaveProperty('ideaId')
  })

  it('does not dispatch NAVIGATE from the first stage (no back affordance)', () => {
    const { actor } = mountWithActor('generate')
    // Back button should not be rendered on brainstorm (first stage).
    expect(screen.queryByRole('button', { name: /back/i })).toBeNull()
    expect(actor.getSnapshot().value).toMatchObject({ brainstorm: 'idle' })
  })

  it('import mode uses library API and still dispatches BRAINSTORM_COMPLETE', async () => {
    const user = userEvent.setup()
    const { actor } = mountWithActor('import')
    // TODO: confirm the import-mode UI; click the imported idea row then confirm.
    const importCandidate = await screen.findByText('Imported Idea')
    await user.click(importCandidate)
    const confirmBtn = await screen.findByRole('button', { name: /use this idea|import|confirm/i })
    await user.click(confirmBtn)
    expect(actor.getSnapshot().context.stageResults.brainstorm?.ideaId).toBe('idea-import-1')
    expect(actor.getSnapshot().value).toMatchObject({ research: 'idle' })
  })
})
```

> **TODO markers** above flag selectors the refactorer must verify against the current `BrainstormEngine.tsx` UI (accessible names may differ). The machine-snapshot assertions are the regression signal — the UI walk is just the driver.

- [ ] **Step 2: Run — confirm failure**

```bash
npx vitest run apps/app/src/components/engines/__tests__/BrainstormEngine.test.tsx
```

- [ ] **Step 3: Refactor BrainstormEngine per the pattern**

- Remove `BaseEngineProps` extension, `onComplete`, `onBack`, `onStageProgress`, `channelId`, `context` props.
- New signature: `BrainstormEngine({ mode = 'generate' }: { mode?: 'generate' | 'import' })`.
- Read `projectId`, `channelId`, `context.stageResults.brainstorm` via `useSelector`.
- Replace call sites per the mapping table. `STAGE_PROGRESS` events must include `stage: 'brainstorm'`.

- [ ] **Step 4: Strip the bridge from PipelineOrchestrator**

In `apps/app/src/components/pipeline/PipelineOrchestrator.tsx`, replace the `case 'brainstorm':` block in `renderEngine()` with just:

```tsx
case 'brainstorm':
  return <BrainstormEngine mode={mode} />
```

Delete the `onComplete`, `onBack` (none for first stage), and `{...bridge('brainstorm')}` spread.

- [ ] **Step 5: Update the standalone brainstorm page**

`apps/app/src/app/[locale]/(app)/channels/[id]/brainstorm/new/page.tsx` and `apps/app/src/app/(app)/channels/[id]/brainstorm/new/page.tsx` (if both exist — verify with `ls`) currently pass `channelId`/`context`/`onComplete` directly to `BrainstormEngine`. After this task those props are gone. Wrap with `StandaloneEngineHost`:

```tsx
'use client';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { PipelineStages } from '@/components/pipeline/PipelineStages';
import { BrainstormEngine } from '@/components/engines/BrainstormEngine';
import { StandaloneEngineHost } from '@/components/engines/StandaloneEngineHost';
import type { BrainstormResult } from '@/components/engines/types';

export default function BrainstormNewPage() {
  const { id: channelId } = useParams<{ id: string }>();
  const router = useRouter();
  return (
    <div>
      <PipelineStages currentStep="brainstorm" channelId={channelId} />
      <div className="p-6 max-w-4xl mx-auto">
        <StandaloneEngineHost
          stage="brainstorm"
          channelId={channelId}
          onStageComplete={(_stage, result) => {
            const r = result as BrainstormResult;
            if (r.brainstormSessionId) {
              router.push(`/channels/${channelId}/brainstorm/${r.brainstormSessionId}`);
            }
          }}
        >
          <BrainstormEngine mode="generate" />
        </StandaloneEngineHost>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run — confirm pass**

```bash
npx vitest run apps/app/src/components/engines/__tests__/BrainstormEngine.test.tsx
npx vitest run apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.behavior.test.tsx
npm run typecheck
```

The standalone page has no dedicated test; `npm run typecheck` is the regression gate.

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/components/engines/BrainstormEngine.tsx \
        apps/app/src/components/engines/__tests__/BrainstormEngine.test.tsx \
        apps/app/src/components/pipeline/PipelineOrchestrator.tsx \
        apps/app/src/app/
git commit -m "refactor(engines): BrainstormEngine reads from pipeline actor; standalone page wrapped in StandaloneEngineHost"
```

---

### Task 11: ResearchEngine — Real-Actor Tests → Thin Layer (Removes Hardcoded Costs)

**Files:**
- Create: `apps/app/src/components/engines/__tests__/ResearchEngine.test.tsx`
- Modify: `apps/app/src/components/engines/ResearchEngine.tsx`

Apply the **Engine Refactor Pattern**. Engine-specific details:

- Existing `LEVELS` array uses hardcoded `{ surface: 60, medium: 100, deep: 180 }`. Replace with values from `creditSettings.costResearchSurface/Medium/Deep` read via `useSelector`.
- Back navigation targets `brainstorm`: `send({ type: 'NAVIGATE', toStage: 'brainstorm' })`.
- On approval, fire `RESEARCH_COMPLETE` with `{ researchSessionId, approvedCardsCount, researchLevel, primaryKeyword?, secondaryKeywords?, searchIntent? }`.

- [ ] **Step 1: Write the test**

Create `apps/app/src/components/engines/__tests__/ResearchEngine.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { ResearchEngine } from '../ResearchEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'

const brainstormResult = {
  ideaId: 'idea-1', ideaTitle: 'Test', ideaVerdict: 'viable', ideaCoreTension: 'tension',
}

function mountPastBrainstorm(creditOverrides: Partial<typeof DEFAULT_CREDIT_SETTINGS> = {}) {
  const creditSettings = { ...DEFAULT_CREDIT_SETTINGS, ...creditOverrides }
  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'proj-1', channelId: 'ch-1', projectTitle: 'T',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS, creditSettings,
    },
  }).start()
  actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })

  render(
    <PipelineActorProvider value={actor}>
      <ResearchEngine mode="generate" />
    </PipelineActorProvider>
  )
  return actor
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/api/research-sessions')) {
      return { json: async () => ({ data: { sessionId: 'rs-1', approvedCardsCount: 4 }, error: null }) } as Response
    }
    return { json: async () => ({ data: null, error: null }) } as Response
  }))
})

describe('ResearchEngine', () => {
  it('renders level costs from creditSettings (not hardcoded constants)', () => {
    mountPastBrainstorm({ costResearchMedium: 120 })
    // Stable accessible match: button whose name contains both the level label
    // and the per-credit cost.
    expect(screen.getByRole('button', { name: /medium.*120/i })).toBeTruthy()
    // The old hardcoded 100 must NOT appear for medium.
    expect(screen.queryByRole('button', { name: /medium.*\b100\b/i })).toBeNull()
  })

  it('dispatches RESEARCH_COMPLETE and advances to draft when user approves research', async () => {
    const user = userEvent.setup()
    const actor = mountPastBrainstorm()

    // TODO: select the level, fill keyword inputs as required, then approve.
    // The exact UI flow (level picker → generate → approve) needs confirmation.
    await user.click(screen.getByRole('button', { name: /medium/i }))
    const generateBtn = await screen.findByRole('button', { name: /generate|start research/i })
    await user.click(generateBtn)
    const approveBtn = await screen.findByRole('button', { name: /approve|use these cards|confirm/i })
    await user.click(approveBtn)

    expect(actor.getSnapshot().context.stageResults.research?.researchSessionId).toBe('rs-1')
    expect(actor.getSnapshot().value).toMatchObject({ draft: 'idle' })
  })

  it('NAVIGATE back targets brainstorm', async () => {
    const user = userEvent.setup()
    const actor = mountPastBrainstorm()
    const backBtn = await screen.findByRole('button', { name: /back/i })
    await user.click(backBtn)
    expect(actor.getSnapshot().value).toMatchObject({ brainstorm: 'idle' })
    // Upstream result must NOT be cleared by NAVIGATE.
    expect(actor.getSnapshot().context.stageResults.brainstorm).toBeDefined()
  })
})
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx vitest run apps/app/src/components/engines/__tests__/ResearchEngine.test.tsx
```

- [ ] **Step 3: Refactor ResearchEngine per the pattern**

- Remove `BaseEngineProps` and the hardcoded `LEVELS` constant.
- Compute `LEVELS` inside the component from `creditSettings`.
- Replace all `onComplete(result)` with `actor.send({ type: 'RESEARCH_COMPLETE', result })`.
- Replace `onBack` handler with `actor.send({ type: 'NAVIGATE', toStage: 'brainstorm' })`.
- Any `STAGE_PROGRESS` dispatches must include `stage: 'research'`.

- [ ] **Step 4: Strip the bridge from PipelineOrchestrator**

In `PipelineOrchestrator.tsx`, collapse the `case 'research':` block to:

```tsx
case 'research':
  return <ResearchEngine mode={mode} />
```

- [ ] **Step 5: Update the standalone research page**

`channels/[id]/research/new/page.tsx` takes `?ideaId=&projectId=` and forwards them via the legacy `context` prop. After refactor, seed the actor's `initialStageResults.brainstorm` from the URL — the engine reads the upstream idea via `useSelector(actor, s => s.context.stageResults.brainstorm)`. The page only knows the idea ID; the rest of the brainstorm fields are unused by ResearchEngine in `mode="generate"`, so a thin stub is enough:

```tsx
'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { PipelineStages } from '@/components/pipeline/PipelineStages';
import { ResearchEngine } from '@/components/engines/ResearchEngine';
import { StandaloneEngineHost } from '@/components/engines/StandaloneEngineHost';
import type { ResearchResult } from '@/components/engines/types';

export default function NewResearchPage() {
  const { id: channelId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ideaId = searchParams.get('ideaId') ?? undefined;
  const projectId = searchParams.get('projectId') ?? undefined;

  // Seed brainstorm so ResearchEngine selectors find an upstream ideaId.
  // ResearchEngine in generate mode only consumes ideaId from this stub —
  // the rest of the brainstorm fields are placeholders to satisfy the type.
  const initialStageResults = ideaId
    ? {
        brainstorm: {
          ideaId,
          ideaTitle: '',
          ideaVerdict: '',
          ideaCoreTension: '',
          completedAt: new Date(0).toISOString(),
        },
      }
    : undefined;

  return (
    <div>
      <PipelineStages currentStep="research" channelId={channelId} projectId={projectId} />
      <div className="p-6 max-w-4xl mx-auto">
        <StandaloneEngineHost
          stage="research"
          channelId={channelId}
          projectId={projectId}
          initialStageResults={initialStageResults}
          onStageComplete={(_stage, result) => {
            const r = result as ResearchResult;
            const params = new URLSearchParams();
            if (r.researchSessionId) params.set('researchSessionId', r.researchSessionId);
            if (ideaId) params.set('ideaId', ideaId);
            if (projectId) params.set('projectId', projectId);
            router.push(`/channels/${channelId}/drafts/new?${params.toString()}`);
          }}
        >
          <ResearchEngine mode="generate" />
        </StandaloneEngineHost>
      </div>
    </div>
  );
}
```

If the refactored ResearchEngine reads more brainstorm fields than `ideaId`, expand the stub (or fetch the idea record before mounting). Verify by running the page in the browser and confirming generate flow works.

- [ ] **Step 6: Run — confirm pass**

```bash
npx vitest run apps/app/src/components/engines/__tests__/ResearchEngine.test.tsx \
                apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.behavior.test.tsx
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/components/engines/ResearchEngine.tsx \
        apps/app/src/components/engines/__tests__/ResearchEngine.test.tsx \
        apps/app/src/components/pipeline/PipelineOrchestrator.tsx \
        apps/app/src/app/
git commit -m "refactor(engines): ResearchEngine reads actor context; research costs configurable; standalone page wrapped"
```

---

### Task 12: DraftEngine — Real-Actor Tests → Thin Layer

**Files:**
- Create: `apps/app/src/components/engines/__tests__/DraftEngine.test.tsx`
- Modify: `apps/app/src/components/engines/DraftEngine.tsx`

Apply the **Engine Refactor Pattern**. Engine-specific details:

- `TYPES` array (blog/video/shorts/podcast with costs) is computed from `creditSettings` read via `useSelector`.
- `brainstormResult` (upstream idea) read via `useSelector(actor, s => s.context.stageResults.brainstorm)`; used to auto-populate the draft title.
- Back navigation targets `research`.
- On successful draft creation, fires `DRAFT_COMPLETE` with `{ draftId, draftTitle, draftContent, personaId?, personaName?, personaSlug?, personaWpAuthorId? }`.

- [ ] **Step 1: Write the test**

Create `apps/app/src/components/engines/__tests__/DraftEngine.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { DraftEngine } from '../DraftEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'

const brainstormResult = {
  ideaId: 'idea-1', ideaTitle: 'Seed Title', ideaVerdict: 'viable', ideaCoreTension: 'tension',
}
const researchResult = {
  researchSessionId: 'rs-1', approvedCardsCount: 4, researchLevel: 'medium',
}

function mountPastResearch(creditOverrides: Partial<typeof DEFAULT_CREDIT_SETTINGS> = {}) {
  const creditSettings = { ...DEFAULT_CREDIT_SETTINGS, ...creditOverrides }
  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'proj-1', channelId: 'ch-1', projectTitle: 'T',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS, creditSettings,
    },
  }).start()
  actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
  actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })

  render(
    <PipelineActorProvider value={actor}>
      <DraftEngine mode="generate" />
    </PipelineActorProvider>
  )
  return actor
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/api/content-drafts')) {
      return { json: async () => ({ data: { id: 'd-1', title: 'Generated', content: 'body' }, error: null }) } as Response
    }
    if (url.includes('/api/canonical-cores')) {
      return { json: async () => ({ data: { id: 'cc-1', content: 'core' }, error: null }) } as Response
    }
    return { json: async () => ({ data: null, error: null }) } as Response
  }))
})

describe('DraftEngine', () => {
  it('renders format costs from creditSettings (no hardcoded FORMAT_COSTS)', () => {
    mountPastResearch({ costBlog: 250 })
    expect(screen.getByRole('button', { name: /blog.*250/i })).toBeTruthy()
  })

  it('auto-populates title from upstream brainstorm ideaTitle', () => {
    mountPastResearch()
    // TODO: adjust to the actual title input (textbox role, name "title").
    const titleInput = screen.getByRole('textbox', { name: /title/i }) as HTMLInputElement
    expect(titleInput.value).toContain('Seed Title')
  })

  it('dispatches DRAFT_COMPLETE and advances to review', async () => {
    const user = userEvent.setup()
    const actor = mountPastResearch()

    // TODO: full flow — pick format → generate canonical core → produce draft → confirm.
    await user.click(screen.getByRole('button', { name: /blog/i }))
    const generateBtn = await screen.findByRole('button', { name: /generate draft|produce|create/i })
    await user.click(generateBtn)
    const confirmBtn = await screen.findByRole('button', { name: /use this draft|accept|continue/i })
    await user.click(confirmBtn)

    expect(actor.getSnapshot().context.stageResults.draft?.draftId).toBe('d-1')
    expect(actor.getSnapshot().value).toMatchObject({ review: 'idle' })
  })

  it('NAVIGATE back targets research', async () => {
    const user = userEvent.setup()
    const actor = mountPastResearch()
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(actor.getSnapshot().value).toMatchObject({ research: 'idle' })
    expect(actor.getSnapshot().context.stageResults.research).toBeDefined()
  })
})
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx vitest run apps/app/src/components/engines/__tests__/DraftEngine.test.tsx
```

- [ ] **Step 3: Refactor DraftEngine per the pattern**

- Remove `BaseEngineProps`, `creditSettings` prop, `initialDraft` prop.
- Compute `TYPES` inside the component from `creditSettings`.
- Replace `onComplete` → `actor.send({ type: 'DRAFT_COMPLETE', result })`.
- Replace `context.ideaTitle` → `brainstormResult?.ideaTitle`.
- Any `STAGE_PROGRESS` dispatches must include `stage: 'draft'`.

- [ ] **Step 4: Strip the bridge from PipelineOrchestrator**

In `PipelineOrchestrator.tsx`, collapse the `case 'draft':` block to:

```tsx
case 'draft':
  return <DraftEngine mode={mode} />
```

- [ ] **Step 5: Update the standalone draft page**

`channels/[id]/drafts/new/page.tsx` takes `?ideaId=&researchSessionId=&projectId=`. Seed both upstream stages so DraftEngine selectors resolve:

```tsx
'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { PipelineStages } from '@/components/pipeline/PipelineStages';
import { DraftEngine } from '@/components/engines/DraftEngine';
import { StandaloneEngineHost } from '@/components/engines/StandaloneEngineHost';
import type { DraftResult } from '@/components/engines/types';

export default function NewDraftPage() {
  const { id: channelId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ideaId = searchParams.get('ideaId') ?? undefined;
  const researchSessionId = searchParams.get('researchSessionId') ?? undefined;
  const projectId = searchParams.get('projectId') ?? undefined;

  const initialStageResults = {
    ...(ideaId && {
      brainstorm: {
        ideaId, ideaTitle: '', ideaVerdict: '', ideaCoreTension: '',
        completedAt: new Date(0).toISOString(),
      },
    }),
    ...(researchSessionId && {
      research: {
        researchSessionId, approvedCardsCount: 0, researchLevel: 'medium',
        completedAt: new Date(0).toISOString(),
      },
    }),
  };

  return (
    <div>
      <PipelineStages
        currentStep="draft"
        channelId={channelId}
        researchSessionId={researchSessionId}
        projectId={projectId}
      />
      <div className="p-6 max-w-3xl mx-auto">
        <StandaloneEngineHost
          stage="draft"
          channelId={channelId}
          projectId={projectId}
          initialStageResults={Object.keys(initialStageResults).length ? initialStageResults : undefined}
          onStageComplete={(_stage, result) => {
            const r = result as DraftResult;
            router.push(`/channels/${channelId}/drafts/${r.draftId}`);
          }}
        >
          <DraftEngine mode="generate" />
        </StandaloneEngineHost>
      </div>
    </div>
  );
}
```

If DraftEngine reads `brainstormResult.ideaTitle` for title autopop (per Task 12 test "auto-populates title from upstream brainstorm ideaTitle"), the empty stub will produce a blank pre-fill on the standalone page — acceptable, since the standalone flow is meant for ad-hoc drafts where the user types the title. If product wants the real title, the page must fetch the idea record before rendering. Document this trade-off and move on.

- [ ] **Step 6: Run — confirm pass**

```bash
npx vitest run apps/app/src/components/engines/__tests__/DraftEngine.test.tsx \
                apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.behavior.test.tsx
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/components/engines/DraftEngine.tsx \
        apps/app/src/components/engines/__tests__/DraftEngine.test.tsx \
        apps/app/src/components/pipeline/PipelineOrchestrator.tsx \
        apps/app/src/app/
git commit -m "refactor(engines): DraftEngine reads actor context; format costs from credit settings; standalone page wrapped"
```

---

### Task 13: ReviewEngine — Real-Actor Tests → Thin Layer

**Files:**
- Create: `apps/app/src/components/engines/__tests__/ReviewEngine.test.tsx`
- Modify: `apps/app/src/components/engines/ReviewEngine.tsx`

Apply the **Engine Refactor Pattern**. Engine-specific details:

- Keeps its `draft: Record<string, unknown> | null` prop (the orchestrator already fetched it — don't duplicate the fetch).
- Back navigation targets `draft`.
- On review finish, fires `REVIEW_COMPLETE` with `{ score, verdict, feedbackJson, iterationCount, qualityTier? }` where `iterationCount` is read from `context.iterationCount` (machine-owned).
- Review always renders in generate mode — no import support.

- [ ] **Step 1: Write the test**

Create `apps/app/src/components/engines/__tests__/ReviewEngine.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { ReviewEngine } from '../ReviewEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'

const brainstormResult = { ideaId: 'i-1', ideaTitle: 'T', ideaVerdict: 'viable', ideaCoreTension: 'x' }
const researchResult  = { researchSessionId: 'rs-1', approvedCardsCount: 4, researchLevel: 'medium' }
const draftResult     = { draftId: 'd-1', draftTitle: 'D', draftContent: 'c' }
const draft = { id: 'd-1', title: 'D', content: 'c', status: 'in_review' }

function mountInReviewing(mode: 'auto' | 'step' = 'step') {
  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'proj-1', channelId: 'ch-1', projectTitle: 'T',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS, creditSettings: DEFAULT_CREDIT_SETTINGS, mode,
    },
  }).start()
  actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
  actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
  actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
  actor.send({ type: 'RESUME' })

  render(
    <PipelineActorProvider value={actor}>
      <ReviewEngine draft={draft} />
    </PipelineActorProvider>
  )
  return actor
}

async function submitReview(score: number) {
  const user = userEvent.setup()
  // TODO: the actual ReviewEngine UI — verify how the reviewer's verdict is captured
  // (custom fetch stub may need to return { score, verdict, feedbackJson } on POST).
  vi.mocked(fetch as any).mockImplementationOnce(async () => ({
    json: async () => ({ data: { score, verdict: score >= 90 ? 'approved' : score < 40 ? 'rejected' : 'needs_revision', feedbackJson: {} }, error: null }),
  }))
  await user.click(await screen.findByRole('button', { name: /run review|start review|review now/i }))
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: async () => ({ data: {}, error: null }),
  }))
})

describe('ReviewEngine', () => {
  it('approved (score >= 90) advances to assets', async () => {
    const actor = mountInReviewing()
    await submitReview(92)
    expect(actor.getSnapshot().value).toMatchObject({ assets: 'idle' })
    expect(actor.getSnapshot().context.stageResults.review?.score).toBe(92)
  })

  it('rejected (score < 40) pauses the review stage', async () => {
    const actor = mountInReviewing()
    await submitReview(25)
    expect(actor.getSnapshot().value).toMatchObject({ review: 'paused' })
  })

  it('mid-score enters reproducing; auto-pilot re-enters reviewing on success', async () => {
    const actor = mountInReviewing('auto')
    await submitReview(70)
    // reproducing actor completes (stubbed fetch resolves); auto re-enters reviewing.
    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toMatchObject({ review: 'reviewing' })
    })
  })

  it('includes machine-owned iterationCount in REVIEW_COMPLETE (not a local counter)', async () => {
    const actor = mountInReviewing()
    // iterationCount bumps on entering reviewing.
    expect(actor.getSnapshot().context.iterationCount).toBe(1)
    await submitReview(92)
    expect(actor.getSnapshot().context.stageResults.review?.iterationCount).toBe(1)
  })

  it('NAVIGATE back targets draft', async () => {
    const user = userEvent.setup()
    const actor = mountInReviewing()
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(actor.getSnapshot().value).toMatchObject({ draft: 'idle' })
    expect(actor.getSnapshot().context.stageResults.draft).toBeDefined()
  })
})
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx vitest run apps/app/src/components/engines/__tests__/ReviewEngine.test.tsx
```

- [ ] **Step 3: Refactor ReviewEngine per the pattern**

- Remove `ReviewEngineProps` `onComplete`, `onBack`, `onDraftUpdated`, `pipelineSettings`.
- New signature: `ReviewEngine({ draft }: { draft: Record<string, unknown> | null })`.
- Read `pipelineSettings` from actor via selector.
- Replace `onComplete` → `actor.send({ type: 'REVIEW_COMPLETE', result })`. **Do NOT include `iterationCount` on the result.** The machine owns it (incremented on `reviewing` entry); guards read from `context.iterationCount`; `saveReviewResult` stamps the context value onto the saved record. Engine never forwards. See design-spec "iterationCount source-of-truth invariant".
- Engine MAY read `context.iterationCount` via `useSelector` for display purposes (e.g. "Iteration 3 of 5") but never writes it.
- Any `STAGE_PROGRESS` dispatches must include `stage: 'review'`.
- Keep the draft prop — the orchestrator fetches it.

- [ ] **Step 4: Strip the bridge from PipelineOrchestrator**

In `PipelineOrchestrator.tsx`, collapse the `case 'review':` block to:

```tsx
case 'review':
  return <ReviewEngine draft={draftData} />
```

The orchestrator no longer needs to stamp `iterationCount` onto the result — the machine reads it from context directly when advancing.

- [ ] **Step 5: Run — confirm pass**

```bash
npx vitest run apps/app/src/components/engines/__tests__/ReviewEngine.test.tsx \
                apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.behavior.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/components/engines/ReviewEngine.tsx \
        apps/app/src/components/engines/__tests__/ReviewEngine.test.tsx \
        apps/app/src/components/pipeline/PipelineOrchestrator.tsx
git commit -m "refactor(engines): ReviewEngine reads actor context; iterationCount owned by machine"
```

---

### Task 14: AssetsEngine — Real-Actor Tests → Thin Layer

**Files:**
- Create: `apps/app/src/components/engines/__tests__/AssetsEngine.test.tsx`
- Modify: `apps/app/src/components/engines/AssetsEngine.tsx`

Apply the **Engine Refactor Pattern**. Engine-specific details:

- Keeps a `draft` prop (same contract as ReviewEngine) — the orchestrator already fetched it; the engine reads `draft.status` from the prop, not from the actor.
- `draftId` is read from `stageResults.draft?.draftId` via selector for API calls.
- Supports import mode via the `mode` prop (gallery import of existing assets).
- Back navigation targets `review`.
- On completion, fires `ASSETS_COMPLETE` with `{ assetIds, featuredImageUrl? }`.

- [ ] **Step 1: Write the test**

Create `apps/app/src/components/engines/__tests__/AssetsEngine.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { AssetsEngine } from '../AssetsEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'

const brainstormResult = { ideaId: 'i-1', ideaTitle: 'T', ideaVerdict: 'viable', ideaCoreTension: 'x' }
const researchResult  = { researchSessionId: 'rs-1', approvedCardsCount: 4, researchLevel: 'medium' }
const draftResult     = { draftId: 'd-1', draftTitle: 'D', draftContent: 'c' }
const reviewResult    = { score: 95, verdict: 'approved', feedbackJson: {}, iterationCount: 1 }
const draft = { id: 'd-1', title: 'D', content: 'c', status: 'approved' }

function mountPastReview(mode: 'generate' | 'import' = 'generate') {
  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'proj-1', channelId: 'ch-1', projectTitle: 'T',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS, creditSettings: DEFAULT_CREDIT_SETTINGS,
    },
  }).start()
  actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
  actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
  actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
  actor.send({ type: 'RESUME' })
  actor.send({ type: 'REVIEW_COMPLETE', result: reviewResult })

  render(
    <PipelineActorProvider value={actor}>
      <AssetsEngine mode={mode} draft={draft} />
    </PipelineActorProvider>
  )
  return actor
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/api/assets')) {
      return { json: async () => ({ data: { assetIds: ['a-1'], featuredImageUrl: 'https://x/img.png' }, error: null }) } as Response
    }
    return { json: async () => ({ data: null, error: null }) } as Response
  }))
})

describe('AssetsEngine', () => {
  it('reads draftId from the actor and uses it for API calls', async () => {
    const user = userEvent.setup()
    mountPastReview()
    await user.click(await screen.findByRole('button', { name: /generate|create images|make assets/i }))
    const calls = vi.mocked(fetch as any).mock.calls.map((c: any[]) => String(c[0]))
    expect(calls.some((u: string) => u.includes('d-1'))).toBe(true)
  })

  it('dispatches ASSETS_COMPLETE and advances to preview', async () => {
    const user = userEvent.setup()
    const actor = mountPastReview()
    await user.click(await screen.findByRole('button', { name: /generate|create images|make assets/i }))
    const confirmBtn = await screen.findByRole('button', { name: /use these assets|continue|confirm/i })
    await user.click(confirmBtn)

    expect(actor.getSnapshot().context.stageResults.assets?.featuredImageUrl).toBe('https://x/img.png')
    expect(actor.getSnapshot().value).toMatchObject({ preview: 'idle' })
  })

  it('import mode loads existing assets from library', async () => {
    const user = userEvent.setup()
    const actor = mountPastReview('import')
    // TODO: confirm the import picker UI — this stub-flow picks one existing asset.
    const confirmBtn = await screen.findByRole('button', { name: /import selected|use these assets|confirm/i })
    await user.click(confirmBtn)
    expect(actor.getSnapshot().value).toMatchObject({ preview: 'idle' })
  })

  it('NAVIGATE back targets review and preserves review result', async () => {
    const user = userEvent.setup()
    const actor = mountPastReview()
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(actor.getSnapshot().value).toMatchObject({ review: 'idle' })
    expect(actor.getSnapshot().context.stageResults.review).toBeDefined()
  })
})
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx vitest run apps/app/src/components/engines/__tests__/AssetsEngine.test.tsx
```

- [ ] **Step 3: Refactor AssetsEngine per the pattern**

- Remove `BaseEngineProps`, `draftId`, `draftStatus` explicit props.
- New signature: `AssetsEngine({ mode = 'generate', draft }: { mode?: 'generate' | 'import'; draft: Record<string, unknown> | null })`.
- Read `draftId` from actor via selector.
- Replace `onComplete` → `actor.send({ type: 'ASSETS_COMPLETE', result })`.
- Any `STAGE_PROGRESS` dispatches must include `stage: 'assets'`.

- [ ] **Step 4: Strip the bridge from PipelineOrchestrator (final strip for refactored engines)**

In `PipelineOrchestrator.tsx`:
- Collapse the `case 'assets':` block to `return <AssetsEngine mode={mode} draft={draftData} />`.

**Preview/Publish scope decision (binding):** the design spec (§File Structure lines 315–316) marks `PreviewEngine` and `PublishEngine` as `(unchanged)`. Keep them on the legacy prop surface — they still consume `onComplete` / `onBack` / `context` / `channelId`. This means the orchestrator bridge for these two engines is NOT stripped in this task. Concretely:

- Keep `case 'preview':` and `case 'publish':` on the bridge (`{...bridge('preview')}` / `{...bridge('publish')}` + `context={buildLegacyContext(ctx)}`).
- Keep `buildLegacyContext` in the orchestrator. Rename the function comment to note it now only serves Preview/Publish and is part of the "preserved legacy surface" — not dead code.
- Keep the `bridge<S>` helper. Narrow its generic so only `'preview' | 'publish'` are accepted, to prevent accidental reuse on refactored engines:

  ```tsx
  type LegacyStage = 'preview' | 'publish'
  function bridge<S extends LegacyStage>(stage: S) { /* same body */ }
  ```

- Add a TODO block at the top of `PipelineOrchestrator.tsx`:

  ```tsx
  // TODO(pipeline-refactor-v2): PreviewEngine and PublishEngine still consume
  // the legacy onComplete/context/channelId prop surface. The `buildLegacyContext`
  // helper and `bridge<LegacyStage>` function below exist solely for them.
  // When those engines are refactored (out of scope for this PR, see spec
  // §Out of Scope), delete this block, `buildLegacyContext`, and the `bridge`
  // helper, and simplify the preview/publish cases to `<PreviewEngine draft={draftData} />`
  // and `<PublishEngine draft={draftData} />`.
  ```

If a later PR refactors Preview/Publish, that PR is responsible for deleting `buildLegacyContext`, `bridge`, and this TODO block. **Do not delete them in this PR.**

- [ ] **Step 5: Run the full pipeline + engine suite to confirm no bridge leftover**

```bash
npx vitest run apps/app/src/components/engines/__tests__/AssetsEngine.test.tsx \
                apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.behavior.test.tsx \
                apps/app/src/lib/pipeline/__tests__/
```

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/components/engines/AssetsEngine.tsx \
        apps/app/src/components/engines/__tests__/AssetsEngine.test.tsx \
        apps/app/src/components/pipeline/PipelineOrchestrator.tsx
git commit -m "refactor(engines): AssetsEngine reads actor context; orchestrator bridge removed"
```

---

## Exit criteria (per engine — verify after each)

- [ ] `npm run typecheck` clean for the entire branch
- [ ] `npm run test --workspace=@brighttale/app -- <Engine>Engine` green
- [ ] No `import` of `BaseEngineProps` remains in this engine
- [ ] No `onComplete`/`onBack`/`context` props in this engine's signature
- [ ] Bridge spread for this engine deleted in `PipelineOrchestrator.tsx`
- [ ] Browser smoke for this stage works end-to-end
- [ ] Single atomic commit per engine, lands cleanly through `.husky/pre-commit`

## Wave-final exit criteria

- [ ] `bridge(...)` helper and `buildLegacyContext` are deleted from the codebase (except for the Preview/Publish narrowing from Task 14 Step 4)
- [ ] `PipelineOrchestrator.tsx` line count is at or near ~250
- [ ] All 5 refactored engines render correctly in browser, full pipeline path runs
- [ ] PreviewEngine + PublishEngine still work (they're on default values from machine context — no change)
- [ ] All three standalone pages (`channels/[id]/brainstorm/new`, `channels/[id]/research/new`, `channels/[id]/drafts/new`) load and run their generate flow end-to-end via `StandaloneEngineHost`. Browser-smoke each at least once before declaring the wave complete.

---

## Risks

| Risk | Mitigation |
|---|---|
| Refactoring engines out of order → tsc breaks | Numbered sequence above is mandatory. Do not parallelize. |
| Local `engineMode` state in engine drifts from orchestrator's `mode` prop | Engine's local UI toggle (e.g., `useState<'generate' | 'import' | null>`) must default from `mode` prop and not auto-mutate. |
| ReviewEngine retains stale `iterationCount` after refactor | Grep the engine for any `useState.*iteration` and remove. Test verifies the count comes from `context`. |
| Engine tests pass with stubbed `fetch` but real API contract drifts | Wave 5 browser smoke catches; consider one Playwright-style integration test per engine if budget allows. |
| Stripping a bridge spread before the engine is fully refactored | Bridge strip is the **last** step of each task, after engine refactor + tests pass. |
| `draft` null guard regresses silently | Test: render engine with `draft={null}` and assert fallback is shown. Add to every Review/Assets test suite. |
| Standalone page seeds `initialStageResults` with the wrong shape and the engine selector returns `undefined` | StandaloneEngineHost test covers seed → context flow. Each engine task's Step 5 includes a manual browser-smoke of the matching standalone page. |
| Refactored engine reads more upstream context fields than the standalone page stubs (e.g. DraftEngine wants `ideaTitle`) | Documented in each Step 5: empty stubs leave the field blank — acceptable for ad-hoc flows. If product needs the real value, the page must fetch the upstream record before mounting (out of scope for this wave). |

---

## Deploy

**Per-engine commits are independently shippable** because each commit keeps the branch tsc-green. Recommended: ship the entire wave as one PR (or ship after each engine if release cadence permits).

**Pre-deploy smoke (after wave complete):**
- Run all 6 design-spec smoke items (concurrent projects, hard reload, score≥90 auto-advance, score<40 paused, auto-pilot loop, publish always pauses)

---

## Out of scope for this wave

- PreviewEngine + PublishEngine (separate refactor PR — already thin)
- FORMAT_COSTS dedup (Wave 5)
- Provider wiring into project page (Wave 5)
- Docs sync (Wave 5)
