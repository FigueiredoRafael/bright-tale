# Wave 3 — Orchestrator Swap (Bridge Mode)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** [`2026-04-24-pipeline-xstate-refactor.md`](./2026-04-24-pipeline-xstate-refactor.md)
**Design spec:** [`../specs/2026-04-24-pipeline-xstate-refactor-design.md`](../specs/2026-04-24-pipeline-xstate-refactor-design.md)
**Depends on:** Wave 2 (providers + legacy migration must exist)

**Scope:** Refactor `PipelineOrchestrator.tsx` to use `useMachine(pipelineMachine, ...)`. Engines stay unchanged for now — a `bridge(...)` helper passes both old (`onComplete`, `onBack`, `context`) and new props to every engine so the build stays tsc-green. After this wave: working pipeline on machine, fat engines unchanged.

**Branch:** `feat/pipeline-orchestrator-refactor`

---

## Pre-flight

- [ ] Wave 2 merged
- [ ] Read parent plan Task 9 in full (~line 1908)
- [ ] Read design spec section "Preserved Orchestrator Features" — every item must remain
- [ ] Confirm hydration gate test from Wave 2 runs (provider returns `isLoaded: false` until both endpoints resolve)

---

## Tasks

### Task 9: Refactored PipelineOrchestrator (Preserves All Features)

**Files:**
- Create: `apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.behavior.test.tsx`
- Modify: `apps/app/src/components/pipeline/PipelineOrchestrator.tsx`

**Feature-preservation checklist — the refactored orchestrator MUST retain:**

- [x] Inline project-title editor (click title to edit, blur saves via `PATCH /api/projects/:id`)
- [x] Stepper click → `NAVIGATE` (no clear); "Continue to furthest" amber banner
- [x] Generate/Import mode picker before stages that support import (`brainstorm`, `research`, `draft`, `assets`); auto-skip on `review`, `preview`, `publish`
- [x] Auto-pilot driver: toggles `context.mode`, auto-starts next engine in generate mode, auto-sends `RESUME` to enter `reviewing`, always pauses before `publish`
- [x] Analytics: `pipeline.stage.navigated`, `pipeline.stage.redone`, `pipeline.mode.changed`
- [x] Success/error toasts (`Completed {stage}!`, `toast.error(lastError)` when `lastError` changes)
- [x] Draft pre-fetch gating for `review`/`assets`/`preview`/`publish` (shows `Loading draft…` card until `/api/content-drafts/:id` resolves)
- [x] Persistence: fires after every `*_COMPLETE` and after `NAVIGATE`/`REDO_FROM`/`TOGGLE_AUTO_PILOT`/`SET_PROJECT_TITLE` — **not on every transition**. Debounced to coalesce rapid writes.
- [x] Hydration gate: renders a skeleton until `isLoaded === true`, then spawns the machine exactly once with `mapLegacyPipelineState(initialPipelineState)` applied.
- [x] Stage restoration: after spawn, dispatches `NAVIGATE { toStage: initialStage }` once (guarded by a ref) so users land where they left off. Skipped when `initialStage === 'brainstorm'` because that's the machine's default.

Orchestrator target is **~250–330 lines**, not ~150 — feature set matches the current 808-line file. The spec's ~250 budget is a soft aim; the bridge-prop layer below adds a dozen lines that go away as engines refactor in Tasks 10–14.

#### Engine bridge pattern (critical for bisectable builds)

Tasks 10–14 refactor engines one at a time. If the orchestrator in Task 9 passes only the new props (`mode`), every commit from 9 through 13 will fail `tsc` because the still-old engines require `onComplete`/`onBack`/`channelId`/`context`/etc. To keep every commit green, **Task 9's orchestrator passes BOTH old and new props** — a temporary bridge. Each subsequent engine task strips the bridge props from its own call site as it refactors. By Task 14 the bridge is fully gone.

Bridge shape per engine:

```tsx
<BrainstormEngine
  mode={mode}
  // ---- bridge (removed in Task 10) ----
  channelId={channelId}
  context={buildLegacyContext(ctx)}
  onComplete={(r) => actor.send({ type: 'BRAINSTORM_COMPLETE', result: r })}
  onBack={() => {/* first stage — no-op or undefined */}}
  onStageProgress={(partial) => actor.send({ type: 'STAGE_PROGRESS', stage: 'brainstorm', partial })}
/>
```

`buildLegacyContext` is a small adapter in the orchestrator that projects `ctx.stageResults` into the old `PipelineContext` shape the engines currently expect. Delete it once Task 14 is complete.

- [ ] **Step 1: Write a behavior test that covers the preserved features**

Create `apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.behavior.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Settings provider returns loaded=true so useMachine spawns.
vi.mock('@/providers/PipelineSettingsProvider', () => ({
  usePipelineSettings: () => ({
    pipelineSettings: { reviewRejectThreshold: 40, reviewApproveScore: 90, reviewMaxIterations: 5, defaultProviders: {} },
    creditSettings: { costBlog: 200, costVideo: 200, costShorts: 100, costPodcast: 150, costCanonicalCore: 80, costReview: 20, costResearchSurface: 60, costResearchMedium: 100, costResearchDeep: 180 },
    isLoaded: true,
  }),
  PipelineSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Stub analytics + toast + fetch.
vi.mock('@/hooks/use-analytics', () => ({ useAnalytics: () => ({ track: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: async () => ({ data: { id: 'd-1', status: 'approved' }, error: null }),
  }))
  vi.stubGlobal('confirm', vi.fn(() => true))
})

import { PipelineOrchestrator } from '../PipelineOrchestrator'

describe('PipelineOrchestrator', () => {
  it('renders a skeleton while settings are loading', async () => {
    const { usePipelineSettings } = await import('@/providers/PipelineSettingsProvider') as any
    ;(usePipelineSettings as any).mockReturnValueOnce({
      pipelineSettings: undefined, creditSettings: undefined, isLoaded: false,
    })
    render(<PipelineOrchestrator projectId="p" channelId="c" projectTitle="Test" />)
    expect(screen.getByTestId('pipeline-loading')).toBeTruthy()
  })

  it('renders the title and allows editing it', async () => {
    const user = userEvent.setup()
    render(<PipelineOrchestrator projectId="p" channelId="c" projectTitle="Old Title" />)
    await user.click(screen.getByText('Old Title'))
    const input = await screen.findByDisplayValue('Old Title')
    await user.clear(input)
    await user.type(input, 'New Title{Enter}')
    await waitFor(() => expect(screen.getByText('New Title')).toBeTruthy())
  })

  it('migrates legacy pipeline_state_json shape on mount', () => {
    render(
      <PipelineOrchestrator
        projectId="p"
        channelId="c"
        projectTitle="Test"
        initialPipelineState={{
          mode: 'step-by-step',
          currentStage: 'draft',
          stageResults: {
            brainstorm: { ideaId: 'i', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c', completedAt: '2026-01-01' },
            research:   { researchSessionId: 'r', approvedCardsCount: 3, researchLevel: 'medium', completedAt: '2026-01-01' },
          },
          autoConfig: { maxReviewIterations: 5, targetScore: 90 },
        }}
      />
    )
    // Brainstorm + research have completed; draft engine should be visible.
    // (Any stable landmark that proves draft stage rendered is fine.)
    expect(document.body.textContent).toContain('Draft')
  })

  it('fires NAVIGATE (no clear) when user clicks an earlier stage in the stepper', async () => {
    // Walk through brainstorm → research via the real machine, then click stepper.
    // Assert stageResults are preserved after clicking back to brainstorm.
    // (Full end-to-end with user-event + real actor.)
  })

  it('fires REDO_FROM only after the AlertDialog is confirmed', async () => {
    // User clicks a "Redo" affordance. AlertDialog appears listing stages to be discarded.
    // Assert: before clicking confirm, stageResults still contains downstream.
    // After clicking confirm, strictly-downstream results are dropped; target stage's result is preserved.
    // After clicking cancel, nothing is dropped.
  })

  it('auto-pilot: entering a stage with no result sets engineMode=generate', async () => {
    // Mount past brainstorm in auto mode. Assert the ModePicker is NOT rendered
    // (orchestrator auto-selected "generate"). Engine's generate UI appears.
  })

  it('auto-pilot: review.idle auto-fires RESUME and enters reviewing', async () => {
    // Mount with stageResults through draft + mode=auto. Spy actor.send.
    // Wait for state.value === { review: 'reviewing' } within one microtask.
  })

  it('auto-pilot: publish ALWAYS pauses regardless of mode', async () => {
    // Mount with stageResults through preview + mode=auto.
    // Assert: state.value stays at { publish: 'idle' } (or 'paused'); no auto-start.
    // PublishEngine is rendered but engineMode is NOT auto-set.
  })

  it('skips initial persistence PATCH during hydration-restore', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ json: async () => ({ data: {}, error: null }) })
    vi.stubGlobal('fetch', fetchSpy)
    render(
      <PipelineOrchestrator
        projectId="p" channelId="c" projectTitle="t"
        initialPipelineState={{
          mode: 'step-by-step', currentStage: 'draft',
          stageResults: { brainstorm: { ideaId: 'i', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c', completedAt: 'x' } },
          autoConfig: {},
        }}
      />,
    )
    // The only PATCH acceptable in the first tick is the /api/content-drafts fetch, not a
    // /api/projects/:id PATCH. Assert no PATCH to the project route during hydration.
    const projectPatchCalls = fetchSpy.mock.calls.filter(
      ([url, init]: any[]) => String(url).includes('/api/projects/') && init?.method === 'PATCH',
    )
    expect(projectPatchCalls.length).toBe(0)
  })
})
```

The last two tests are the most valuable — they exercise the new `NAVIGATE` / `REDO_FROM` split. Implement them after the orchestrator is written, as they rely on the real machine running in the test.

- [ ] **Step 2: Run — confirm failure**

```bash
npx vitest run apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.behavior.test.tsx
```

Expected: tests fail because the orchestrator doesn't yet expose the new behavior.

- [ ] **Step 3: Rewrite PipelineOrchestrator**

Replace `apps/app/src/components/pipeline/PipelineOrchestrator.tsx` with:

```tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMachine } from '@xstate/react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, Sparkles, Copy } from 'lucide-react'
import { useAnalytics } from '@/hooks/use-analytics'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { usePipelineSettings } from '@/providers/PipelineSettingsProvider'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { mapLegacyPipelineState } from '@/lib/pipeline/legacy-state-migration'
import { PipelineStages, type PipelineStep } from './PipelineStages'
import { AutoModeControls } from './AutoModeControls'
import { CompletedStageSummary } from './CompletedStageSummary'
import { BrainstormEngine } from '@/components/engines/BrainstormEngine'
import { ResearchEngine } from '@/components/engines/ResearchEngine'
import { DraftEngine } from '@/components/engines/DraftEngine'
import { ReviewEngine } from '@/components/engines/ReviewEngine'
import { AssetsEngine } from '@/components/engines/AssetsEngine'
import { PreviewEngine } from '@/components/engines/PreviewEngine'
import { PublishEngine } from '@/components/engines/PublishEngine'
import { PIPELINE_STAGES } from '@/components/engines/types'
import type { PipelineStage, PipelineSettings, CreditSettings } from '@/components/engines/types'

interface Props {
  projectId: string
  channelId: string
  projectTitle: string
  initialPipelineState?: Record<string, unknown>
}

const IMPORTABLE_STAGES: PipelineStage[] = ['brainstorm', 'research', 'draft', 'assets']

export function PipelineOrchestrator({
  projectId,
  channelId,
  projectTitle: initialProjectTitle,
  initialPipelineState,
}: Props) {
  const { pipelineSettings, creditSettings, isLoaded } = usePipelineSettings()

  if (!isLoaded) {
    return (
      <Card>
        <CardContent className="py-8" data-testid="pipeline-loading">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading pipeline settings…
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <OrchestratorInner
      projectId={projectId}
      channelId={channelId}
      projectTitle={initialProjectTitle}
      initialPipelineState={initialPipelineState}
      pipelineSettings={pipelineSettings}
      creditSettings={creditSettings}
    />
  )
}

interface InnerProps extends Props {
  pipelineSettings: PipelineSettings
  creditSettings: CreditSettings
}

function OrchestratorInner({
  projectId,
  channelId,
  projectTitle,
  initialPipelineState,
  pipelineSettings,
  creditSettings,
}: InnerProps) {
  const legacy = useMemo(() => mapLegacyPipelineState(initialPipelineState), [initialPipelineState])
  const { track } = useAnalytics()

  const [state, send, actorRef] = useMachine(pipelineMachine, {
    input: {
      projectId,
      channelId,
      projectTitle,
      pipelineSettings,
      creditSettings,
      mode: legacy?.mode,
      initialStageResults: legacy?.initialStageResults,
      initialIterationCount: legacy?.initialIterationCount,
    },
    // Dev-only inspector for debugging concurrent actors. Set up with whatever
    // Stately viz / logger you prefer; a console tap is a sensible default.
    inspect: process.env.NODE_ENV === 'development'
      ? (ev) => {
          if (ev.type === '@xstate.event') {
            // eslint-disable-next-line no-console
            console.debug('[pipeline]', (ev as any).event?.type, (ev as any).event)
          }
        }
      : undefined,
  })

  // Restore the user's position on first mount. Guarded by a ref so the
  // NAVIGATE fires exactly once, even if React re-renders before the machine
  // settles. `restoredRef` also gates persistence so the first hydration
  // render doesn't PATCH the backend with what we just loaded.
  const didRestoreRef = useRef(false)
  const restoredRef = useRef(false)
  useEffect(() => {
    if (didRestoreRef.current) return
    didRestoreRef.current = true
    if (legacy?.initialStage && legacy.initialStage !== 'brainstorm') {
      send({ type: 'NAVIGATE', toStage: legacy.initialStage })
    }
    // Defer persistence by one tick so NAVIGATE settles before the first save.
    queueMicrotask(() => { restoredRef.current = true })
  }, [legacy?.initialStage, send])

  const ctx = state.context
  const stateValue = state.value
  const currentStage = (
    typeof stateValue === 'string' ? stateValue : Object.keys(stateValue)[0]
  ) as PipelineStage
  const subState =
    typeof stateValue === 'string'
      ? 'idle'
      : ((stateValue as Record<string, string>)[currentStage] ?? 'idle')

  // Persistence: PATCH on meaningful changes, debounced to coalesce rapid updates.
  // Skipped until `restoredRef.current` is true so the initial NAVIGATE-restore
  // doesn't fire a redundant PATCH.
  const lastPersistedRef = useRef<string>('')
  useEffect(() => {
    if (!restoredRef.current) return
    const snapshot = JSON.stringify({
      mode: ctx.mode,
      stageResults: ctx.stageResults,
      iterationCount: ctx.iterationCount,
      currentStage,
    })
    if (snapshot === lastPersistedRef.current) return
    const t = setTimeout(() => {
      lastPersistedRef.current = snapshot
      void fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipelineStateJson: {
            mode: ctx.mode,
            stageResults: ctx.stageResults,
            iterationCount: ctx.iterationCount,
            currentStage,
          },
        }),
      }).catch(() => {
        toast.error('Failed to persist pipeline state')
      })
    }, 150)
    return () => clearTimeout(t)
  }, [ctx.mode, ctx.stageResults, ctx.iterationCount, currentStage, projectId])

  // Surface lastError as a toast.
  useEffect(() => {
    if (ctx.lastError) toast.error(ctx.lastError)
  }, [ctx.lastError])

  // Title editor
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(ctx.projectTitle)
  // Keep titleDraft in sync if projectTitle changes externally (e.g. after a
  // background refresh) while the user isn't actively editing.
  useEffect(() => {
    if (!editingTitle) setTitleDraft(ctx.projectTitle)
  }, [ctx.projectTitle, editingTitle])
  async function saveTitle(newTitle: string) {
    send({ type: 'SET_PROJECT_TITLE', title: newTitle })
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      })
    } catch {
      // title is cosmetic; ignore
    }
  }

  // Engine mode (generate vs import)
  const [engineMode, setEngineMode] = useState<'generate' | 'import' | null>(null)

  // Auto-pilot driver
  //
  // INVARIANT: publish-pause is enforced HERE, not in the machine. The machine
  // has no `publish.paused` substate — it treats `publish.idle` like any other
  // idle substate. The early-return below is the only thing preventing auto-pilot
  // from firing the engine's generate path on publish. If this effect is ever
  // refactored, the publish guard MUST remain. If a future consumer drives the
  // machine without this orchestrator, that consumer must re-implement the gate.
  // See Task 7's "Why publish has no machine-level pause substate" note.
  useEffect(() => {
    if (ctx.mode !== 'auto') return
    // Publish always requires manual confirmation.
    if (currentStage === 'publish') return
    // Review.idle → fire RESUME so reviewing begins.
    if (currentStage === 'review' && subState === 'idle') {
      send({ type: 'RESUME' })
      return
    }
    // Any other stage in idle with no result → kick off generate mode.
    if (subState === 'idle' && !ctx.stageResults[currentStage]) {
      setEngineMode('generate')
    }
  }, [ctx.mode, currentStage, subState, ctx.stageResults, send])

  // Draft pre-fetch gating (review/assets/preview/publish).
  // Reset to null on stage change so the previous stage's draft doesn't leak
  // through during navigation, then refetch.
  const [draftData, setDraftData] = useState<Record<string, unknown> | null>(null)
  useEffect(() => {
    const draftId = ctx.stageResults.draft?.draftId
    const needsDraft = ['review', 'assets', 'preview', 'publish'].includes(currentStage) && !!draftId
    setDraftData(null)
    if (!needsDraft) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/content-drafts/${draftId}`)
        const { data, error } = await res.json()
        if (cancelled) return
        if (error) toast.error(error.message ?? 'Failed to load draft')
        if (data) setDraftData(data)
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load draft')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentStage, ctx.stageResults.draft?.draftId])

  // Navigation handlers
  function handleNavigate(toStage: PipelineStage) {
    track('pipeline.stage.navigated', { projectId, channelId, from: currentStage, to: toStage })
    send({ type: 'NAVIGATE', toStage })
    setEngineMode(null)
  }

  // Redo confirmation via AlertDialog (replaces native window.confirm).
  const [pendingRedo, setPendingRedo] = useState<{
    fromStage: PipelineStage
    discarded: PipelineStage[]
  } | null>(null)

  function handleRedoFrom(fromStage: PipelineStage) {
    const fromIndex = PIPELINE_STAGES.indexOf(fromStage)
    const discarded = PIPELINE_STAGES.slice(fromIndex + 1).filter((s) => ctx.stageResults[s])
    if (discarded.length === 0) {
      send({ type: 'REDO_FROM', fromStage })
      setEngineMode(null)
      return
    }
    setPendingRedo({ fromStage, discarded })
  }

  function confirmRedo() {
    if (!pendingRedo) return
    track('pipeline.stage.redone', {
      projectId,
      channelId,
      fromStage: pendingRedo.fromStage,
      discardedStages: pendingRedo.discarded,
    })
    send({ type: 'REDO_FROM', fromStage: pendingRedo.fromStage })
    setEngineMode(null)
    setPendingRedo(null)
  }

  // Mode toggle
  function handleToggleMode() {
    track('pipeline.mode.changed', { projectId, channelId, from: ctx.mode, to: ctx.mode === 'auto' ? 'step' : 'auto' })
    send({ type: 'TOGGLE_AUTO_PILOT' })
  }

  // Stepper mapping
  function pipelineStep(): PipelineStep {
    return currentStage === 'publish' ? 'published' : currentStage
  }

  // Engine render. Engines read their own data from the actor; we just pick which one.
  function renderEngine() {
    const needsDraftPrefetch = ['review', 'assets', 'preview', 'publish'].includes(currentStage)
    if (needsDraftPrefetch && ctx.stageResults.draft?.draftId && !draftData) {
      return (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading draft…
            </div>
          </CardContent>
        </Card>
      )
    }

    // Mode picker for importable stages (only in step mode, only when no result yet).
    const canImport = IMPORTABLE_STAGES.includes(currentStage)
    if (ctx.mode === 'step' && canImport && !engineMode && !ctx.stageResults[currentStage]) {
      return <ModePicker onPick={setEngineMode} stage={currentStage} />
    }

    const mode: 'generate' | 'import' = engineMode ?? 'generate'

    // BRIDGE (temporary, removed progressively in Tasks 10–14): each engine
    // still expects the old prop surface until its refactor task lands. We
    // pass BOTH the new (mode/draft) and old (onComplete/onBack/channelId/
    // context/onStageProgress) props so the build stays green at every commit.
    // Each engine task below strips the bridge line for its engine.
    const legacyContext = buildLegacyContext(ctx)
    const bridge = <S extends PipelineStage>(stage: S) => ({
      channelId,
      context: legacyContext,
      onStageProgress: (partial: Record<string, unknown>) =>
        actorRef.send({ type: 'STAGE_PROGRESS', stage, partial }),
    })

    switch (currentStage) {
      case 'brainstorm':
        return (
          <BrainstormEngine
            mode={mode}
            {...bridge('brainstorm')}
            onComplete={(r: any) => actorRef.send({ type: 'BRAINSTORM_COMPLETE', result: r })}
          />
        )
      case 'research':
        return (
          <ResearchEngine
            mode={mode}
            {...bridge('research')}
            onComplete={(r: any) => actorRef.send({ type: 'RESEARCH_COMPLETE', result: r })}
            onBack={() => handleNavigate('brainstorm')}
          />
        )
      case 'draft':
        return (
          <DraftEngine
            mode={mode}
            {...bridge('draft')}
            onComplete={(r: any) => actorRef.send({ type: 'DRAFT_COMPLETE', result: r })}
            onBack={() => handleNavigate('research')}
          />
        )
      case 'review':
        return (
          <ReviewEngine
            draft={draftData}
            {...bridge('review')}
            // Do NOT inject iterationCount — guards read from context, and
            // saveReviewResult stamps context.iterationCount onto the saved
            // record. See design-spec "iterationCount source-of-truth invariant".
            onComplete={(r: any) => actorRef.send({ type: 'REVIEW_COMPLETE', result: r })}
            onBack={() => handleNavigate('draft')}
          />
        )
      case 'assets':
        return (
          <AssetsEngine
            mode={mode}
            draft={draftData}
            {...bridge('assets')}
            onComplete={(r: any) => actorRef.send({ type: 'ASSETS_COMPLETE', result: r })}
            onBack={() => handleNavigate('review')}
          />
        )
      case 'preview':
        return (
          <PreviewEngine
            draft={draftData}
            {...bridge('preview')}
            onComplete={(r: any) => actorRef.send({ type: 'PREVIEW_COMPLETE', result: r })}
            onBack={() => handleNavigate('assets')}
          />
        )
      case 'publish':
        return (
          <PublishEngine
            draft={draftData}
            {...bridge('publish')}
            onComplete={(r: any) => actorRef.send({ type: 'PUBLISH_COMPLETE', result: r })}
            onBack={() => handleNavigate('preview')}
          />
        )
      default:
        return null
    }
  }

  // Projects new-shape context onto the legacy PipelineContext interface the
  // current engines still consume (pre-refactor). Deleted when Task 14 lands.
  function buildLegacyContext(c: typeof ctx): Record<string, unknown> {
    return {
      projectId: c.projectId,
      channelId: c.channelId,
      ideaId:         c.stageResults.brainstorm?.ideaId,
      ideaTitle:      c.stageResults.brainstorm?.ideaTitle,
      researchSessionId: c.stageResults.research?.researchSessionId,
      researchLevel: c.stageResults.research?.researchLevel,
      draftId:    c.stageResults.draft?.draftId,
      draftTitle: c.stageResults.draft?.draftTitle,
      creditSettings: c.creditSettings,
      pipelineSettings: c.pipelineSettings,
    }
  }

  return (
    <PipelineActorProvider value={actorRef}>
      <div className="space-y-6">
        {/* Title */}
        <div>
          {editingTitle ? (
            <input
              autoFocus
              className="text-2xl font-bold bg-transparent border-b-2 border-primary outline-none w-full"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                setEditingTitle(false)
                if (titleDraft.trim() && titleDraft !== ctx.projectTitle) void saveTitle(titleDraft.trim())
                else setTitleDraft(ctx.projectTitle)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') { setTitleDraft(ctx.projectTitle); setEditingTitle(false) }
              }}
            />
          ) : (
            <h2
              className="text-2xl font-bold cursor-pointer hover:text-primary/80 transition-colors"
              title="Click to edit"
              onClick={() => { setTitleDraft(ctx.projectTitle); setEditingTitle(true) }}
            >
              {ctx.projectTitle}
            </h2>
          )}
          <p className="text-sm text-muted-foreground mt-1">
            Project ID: <code className="text-xs bg-muted px-2 py-1 rounded">{projectId}</code>
          </p>
        </div>

        <AutoModeControls
          mode={ctx.mode}
          isPaused={subState === 'paused'}
          onToggle={handleToggleMode}
          onPause={() => send({ type: 'PAUSE' })}
          onResume={() => send({ type: 'RESUME' })}
        />

        <Separator />

        <PipelineStages
          currentStep={pipelineStep()}
          channelId={channelId}
          draftId={ctx.stageResults.draft?.draftId}
          projectId={projectId}
          projectTitle={ctx.projectTitle}
          ideaTitle={ctx.stageResults.brainstorm?.ideaTitle}
          brainstormSessionId={ctx.stageResults.brainstorm?.brainstormSessionId}
          researchSessionId={ctx.stageResults.research?.researchSessionId}
          onStepClick={(step) => {
            const stage: PipelineStage = step === 'published' ? 'publish' : (step as PipelineStage)
            if (stage !== currentStage && ctx.stageResults[stage]) handleNavigate(stage)
          }}
        />

        <div className="space-y-2">
          {PIPELINE_STAGES.map((stage) => (
            <CompletedStageSummary
              key={stage}
              stage={stage}
              stageResults={ctx.stageResults}
              currentStage={currentStage}
              onNavigate={handleNavigate}
              onRedoFrom={handleRedoFrom}
            />
          ))}
        </div>

        <Separator />

        {renderEngine()}

        <AlertDialog open={!!pendingRedo} onOpenChange={(o) => !o && setPendingRedo(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Redo from "{pendingRedo?.fromStage}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This will discard the following completed stages:{' '}
                <strong>{pendingRedo?.discarded.join(', ')}</strong>. The
                "{pendingRedo?.fromStage}" result itself is preserved until you
                re-complete it. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmRedo}>Discard and redo</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PipelineActorProvider>
  )
}

function ModePicker({ onPick, stage }: { onPick: (m: 'generate' | 'import') => void; stage: PipelineStage }) {
  return (
    <Card className="border-blue-500/20 bg-blue-500/5">
      <CardContent className="py-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Mode for {stage}</p>
          <p className="text-xs text-muted-foreground">Generate fresh or import from library?</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onPick('generate')}>
            <Sparkles className="h-4 w-4 mr-1" /> Generate Fresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => onPick('import')}>
            <Copy className="h-4 w-4 mr-1" /> Import Existing
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

Key differences from the old orchestrator:
- `handleStageComplete` is gone — the machine's `saveXResult` actions own stage completion and downstream clearing.
- `handleNavigate` fires `NAVIGATE { toStage }` (preserves results).
- `handleRedoFrom` fires `REDO_FROM { fromStage }` via an AlertDialog confirmation (no `window.confirm`); cancel is a no-op.
- Auto-pilot is an effect that reads `ctx.mode` + `state.value` and steers the engine.
- Title editing updates machine context + PATCHes the backend.
- Persistence is debounced, gated on `restoredRef` so hydration doesn't write-back, and only runs when observable fields change.
- `useMachine` has an `inspect` callback in dev builds to trace events across concurrent actors.
- Engines are called with a **bridge** of old + new props; each engine task below strips its own bridge line as the refactor lands, so every commit typechecks.

`AutoModeControls` and `CompletedStageSummary` need small prop-surface updates:
- `AutoModeControls`: accepts `{ mode, isPaused, onToggle, onPause, onResume }` instead of a `pipelineState`.
- `CompletedStageSummary`: accepts an `onRedoFrom?: (stage: PipelineStage) => void` in addition to `onNavigate` so the Redo affordance dispatches the right event.

- [ ] **Step 4: Run behavior tests — confirm pass**

```bash
npx vitest run apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.behavior.test.tsx
```

- [ ] **Step 5: Update sibling components**

Update `AutoModeControls.tsx` and `CompletedStageSummary.tsx` prop surfaces. Keep the existing UI shells — only swap the props they consume.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/components/pipeline/
git commit -m "refactor(pipeline): orchestrator uses XState machine while preserving title editor, mode picker, auto-pilot, analytics, draft prefetch"
```

---

## Wave-specific guardrails

### Bridge pattern — what makes it work

Every engine in this wave receives **both** old + new props:

```tsx
<BrainstormEngine
  mode={engineMode}
  // bridge: legacy props, will be removed in Wave 4 per-engine
  {...bridge('brainstorm')}
/>
```

The `bridge(stage)` helper synthesizes `onComplete`, `onBack`, `context`, etc. from machine selectors + sends. Engines compile unchanged this wave. Wave 4 strips the bridge engine-by-engine.

### Hydration gate — must not regress

```tsx
if (!isLoaded) return <PipelineSkeleton />
const [state, send, actorRef] = useMachine(pipelineMachine, { input: { ... } })
```

Spawning with `DEFAULT_*` and "updating later" is **wrong**. Context is immutable for the machine's lifetime.

### Target line count

Spec target was ~150; relaxed to ~250 because the shell still owns title editor, stepper, analytics hooks, draft pre-fetch. Plan target: ~250–330 lines including the bridge. Bridge gone by end of Wave 4 → drops back toward ~250.

### Persistence subscription — implementation note

Use `actor.subscribe(...)` and a debounce (e.g. `lodash.debounce` or a custom `useRef`-based debouncer with 250ms window). **Do not** persist on every snapshot tick. Persist after `*_COMPLETE`, `NAVIGATE`, `REDO_FROM`, `TOGGLE_AUTO_PILOT`, `SET_PROJECT_TITLE`. Skip persistence for transient sub-states (`loading`, `reviewing`).

---

## Exit criteria

- [ ] `npm run typecheck` clean
- [ ] `npm run test --workspace=@brighttale/app -- PipelineOrchestrator` green
- [ ] All 7 preserved features verified in browser smoke against the dev environment
- [ ] Hard reload restores correct stage from `pipeline_state_json` (verified with a real legacy record)
- [ ] Two project tabs open simultaneously — advancing one does not affect the other
- [ ] Auto-pilot loop visible: `reviewing → reproducing → reviewing` (mocked or real)
- [ ] Publish stage shows pause regardless of `mode === 'auto'`
- [ ] No engine code changed in this wave (verify diff is scoped to `PipelineOrchestrator.tsx` + bridge support files)
- [ ] Single commit lands cleanly through `.husky/pre-commit`

---

## Risks

| Risk | Mitigation |
|---|---|
| Bridge spread accidentally drops a prop an engine depends on | Add a tsc check: bridge return type must extend `BaseEngineProps` until Wave 4 strips per-engine. |
| Persistence races with rapid `NAVIGATE` clicks | Debounce window covers fast clicks; verify with a Playwright-style test if available. |
| `mapLegacyPipelineState` returns null for valid records due to schema mismatch | Snapshot a real production `pipeline_state_json` (sanitized) into the test fixtures during Wave 2 and reuse here. |
| Orchestrator subscribes to settings changes mid-run | Settings are read-only in the machine; orchestrator must NOT pass updated settings via context — they are spawn-time-only. |
| Auto-pilot effect runs in a render loop | Effect dependencies are `[state.value, state.context.mode]`; never `[state]` (changes every transition). |

---

## Deploy

**Bundle with Wave 2.** Do not split. If Wave 3 lands without Wave 2, existing projects reset to `brainstorm`.

**Pre-deploy smoke:**
- Open an existing project with a real `pipeline_state_json` — confirm user lands on the same stage they left.
- Hard reload mid-stage — confirm state restores.
- Open two project tabs — advance one, confirm the other is untouched.

---

## Out of scope for this wave

- Engine refactors (Wave 4)
- FORMAT_COSTS dedup (Wave 5)
- Wiring providers into the project page (Wave 5, Task 16)
