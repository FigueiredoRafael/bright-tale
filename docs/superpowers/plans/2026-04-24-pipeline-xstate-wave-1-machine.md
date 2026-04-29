# Wave 1 — Pure Machine (Zero React)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** [`2026-04-24-pipeline-xstate-refactor.md`](./2026-04-24-pipeline-xstate-refactor.md)
**Design spec:** [`../specs/2026-04-24-pipeline-xstate-refactor-design.md`](../specs/2026-04-24-pipeline-xstate-refactor-design.md)
**Depends on:** Wave 0 (foundation must be merged)

**Scope:** Build the entire pipeline state machine as a self-contained library under `apps/app/src/lib/pipeline/` — types, guards, actions, actors, machine definition. **Zero React imports.** Fully unit-testable with plain Vitest.

**Branch:** `feat/pipeline-orchestrator-refactor`

---

## Pre-flight

- [ ] Wave 0 merged (XState installed; DB migration applied)
- [ ] `nvm use` resolves to Node 20
- [ ] Read parent plan section "The Machine" + design spec section "The Machine" + "Review Stage (exception)"
- [ ] Read parent plan tasks 3–7 in full before splitting work

---

## Tasks

### Task 3: Machine Types

**Files:**
- Create: `apps/app/src/lib/pipeline/machine.types.ts`

- [ ] **Step 1: Create machine.types.ts**

```typescript
import type { PipelineSettings, CreditSettings } from '@/components/engines/types'
import type {
  PipelineStage,
  BrainstormResult,
  ResearchResult,
  DraftResult,
  ReviewResult,
  AssetsResult,
  PreviewResult,
  PublishResult,
} from '@/components/engines/types'

export type { PipelineStage }

export type StageResultMap = {
  brainstorm?: BrainstormResult & { completedAt: string }
  research?:   ResearchResult   & { completedAt: string }
  draft?:      DraftResult      & { completedAt: string }
  review?:     ReviewResult     & { completedAt: string }
  assets?:     AssetsResult     & { completedAt: string }
  preview?:    PreviewResult    & { completedAt: string }
  publish?:    PublishResult    & { completedAt: string }
}

export interface PipelineMachineContext {
  projectId: string
  channelId: string
  projectTitle: string
  mode: 'step' | 'auto'
  stageResults: StageResultMap
  iterationCount: number
  lastError: string | null
  pipelineSettings: PipelineSettings
  creditSettings: CreditSettings
}

export interface PipelineMachineInput {
  projectId: string
  channelId: string
  projectTitle: string
  mode?: 'step' | 'auto'
  pipelineSettings: PipelineSettings
  creditSettings: CreditSettings
  initialStageResults?: StageResultMap
  initialIterationCount?: number
}

export type PipelineEvent =
  | { type: 'BRAINSTORM_COMPLETE'; result: BrainstormResult }
  | { type: 'RESEARCH_COMPLETE';   result: ResearchResult }
  | { type: 'DRAFT_COMPLETE';      result: DraftResult }
  | { type: 'REVIEW_COMPLETE';     result: ReviewResult }
  | { type: 'ASSETS_COMPLETE';     result: AssetsResult }
  | { type: 'PREVIEW_COMPLETE';    result: PreviewResult }
  | { type: 'PUBLISH_COMPLETE';    result: PublishResult }
  | { type: 'STAGE_ERROR';         error: string }
  | { type: 'STAGE_PROGRESS';      stage: PipelineStage; partial: Record<string, unknown> }
  | { type: 'RETRY' }
  | { type: 'TOGGLE_AUTO_PILOT' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'NAVIGATE';            toStage: PipelineStage }
  | { type: 'REDO_FROM';           fromStage: PipelineStage }
  | { type: 'SET_PROJECT_TITLE';   title: string }
```

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/lib/pipeline/machine.types.ts
git commit -m "feat(pipeline): add XState machine type definitions"
```

---

### Task 4: Guards (Red → Green → Refactor)

**Files:**
- Create: `apps/app/src/lib/pipeline/__tests__/guards.test.ts`
- Create: `apps/app/src/lib/pipeline/guards.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/app/src/lib/pipeline/__tests__/guards.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isApprovedGuard, isRejectedGuard, hasReachedMaxIterationsGuard } from '../guards'
import { DEFAULT_PIPELINE_SETTINGS } from '@/components/engines/types'
import type { PipelineMachineContext, PipelineEvent } from '../machine.types'
import { DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'

const baseContext: PipelineMachineContext = {
  projectId: 'proj-1',
  channelId: 'ch-1',
  mode: 'auto',
  stageResults: {},
  iterationCount: 0,
  pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
  creditSettings: DEFAULT_CREDIT_SETTINGS,
}

function reviewEvent(score: number, iterationCount = 1): Extract<PipelineEvent, { type: 'REVIEW_COMPLETE' }> {
  return {
    type: 'REVIEW_COMPLETE',
    result: { score, iterationCount, verdict: 'needs_revision', feedbackJson: {}, qualityTier: 'needs_revision' },
  }
}

describe('isApprovedGuard', () => {
  it('returns true when score equals approveScore (90)', () => {
    expect(isApprovedGuard({ context: baseContext, event: reviewEvent(90) })).toBe(true)
  })

  it('returns true when score exceeds approveScore', () => {
    expect(isApprovedGuard({ context: baseContext, event: reviewEvent(95) })).toBe(true)
  })

  it('returns false when score is below approveScore', () => {
    expect(isApprovedGuard({ context: baseContext, event: reviewEvent(89) })).toBe(false)
  })
})

describe('isRejectedGuard', () => {
  it('returns true when score is below rejectThreshold (40)', () => {
    expect(isRejectedGuard({ context: baseContext, event: reviewEvent(39) })).toBe(true)
  })

  it('returns false when score equals rejectThreshold', () => {
    expect(isRejectedGuard({ context: baseContext, event: reviewEvent(40) })).toBe(false)
  })

  it('returns false when score is above rejectThreshold', () => {
    expect(isRejectedGuard({ context: baseContext, event: reviewEvent(75) })).toBe(false)
  })
})

describe('hasReachedMaxIterationsGuard', () => {
  // Reads from context.iterationCount, NOT event.result.iterationCount.
  // The machine owns the counter (incremented on `reviewing` entry); engines never forward it.
  it('returns true when context.iterationCount equals maxIterations (5)', () => {
    expect(hasReachedMaxIterationsGuard({ context: { ...baseContext, iterationCount: 5 } })).toBe(true)
  })

  it('returns true when context.iterationCount exceeds maxIterations', () => {
    expect(hasReachedMaxIterationsGuard({ context: { ...baseContext, iterationCount: 6 } })).toBe(true)
  })

  it('returns false when context.iterationCount is below maxIterations', () => {
    expect(hasReachedMaxIterationsGuard({ context: { ...baseContext, iterationCount: 4 } })).toBe(false)
  })

  it('ignores any iterationCount on the event payload', () => {
    // Engine sends a stale value; guard must use context only.
    expect(hasReachedMaxIterationsGuard({ context: { ...baseContext, iterationCount: 5 }, event: reviewEvent(75, 0) })).toBe(true)
    expect(hasReachedMaxIterationsGuard({ context: { ...baseContext, iterationCount: 0 }, event: reviewEvent(75, 99) })).toBe(false)
  })
})
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/guards.test.ts
```

Expected: `FAIL — Cannot find module '../guards'`

- [ ] **Step 3: Implement guards.ts**

Create `apps/app/src/lib/pipeline/guards.ts`:

```typescript
import type { PipelineMachineContext, PipelineEvent } from './machine.types'

type ReviewCompleteEvent = Extract<PipelineEvent, { type: 'REVIEW_COMPLETE' }>
type GuardArgs = { context: PipelineMachineContext; event: ReviewCompleteEvent }

export function isApprovedGuard({ context, event }: GuardArgs): boolean {
  return event.result.score >= context.pipelineSettings.reviewApproveScore
}

export function isRejectedGuard({ context, event }: GuardArgs): boolean {
  return event.result.score < context.pipelineSettings.reviewRejectThreshold
}

/**
 * Reads `context.iterationCount` (machine-owned, incremented on `reviewing` entry).
 * Any `iterationCount` on the event payload is ignored — see design spec
 * "iterationCount source-of-truth invariant". The `event` arg is accepted for
 * signature symmetry with sibling guards and for XState's call shape.
 */
export function hasReachedMaxIterationsGuard({ context }: { context: PipelineMachineContext; event?: ReviewCompleteEvent }): boolean {
  return context.iterationCount >= context.pipelineSettings.reviewMaxIterations
}
```

- [ ] **Step 4: Run — confirm all 10 pass**

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/guards.test.ts
```

Expected: `PASS (10)` — three approve, three reject, three max-iterations (context-driven), plus the "ignores event payload" assertion.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/lib/pipeline/guards.ts apps/app/src/lib/pipeline/__tests__/guards.test.ts
git commit -m "feat(pipeline): add review loop guards with unit tests"
```

---

### Task 5: Machine Actions (Red → Green → Refactor)

**Files:**
- Create: `apps/app/src/lib/pipeline/__tests__/actions.test.ts`
- Create: `apps/app/src/lib/pipeline/actions.ts`

This task ships **pure** context helpers only — named machine actions that have side effects (`persistPipelineState`, `toastStageComplete`, `surfaceError`, `updateProjectTitleAction`, `trackAnalytics`) are declared inline in `machine.ts` during Task 7 so they can close over injected dependencies (toast, fetch, analytics) in tests.

- [ ] **Step 1: Write failing tests**

Create `apps/app/src/lib/pipeline/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  mergeStageResult,
  clearStrictlyAfter,
  incrementIterationCount,
  resetIterationCount,
  setLastError,
  clearLastError,
} from '../actions'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'
import type { PipelineMachineContext } from '../machine.types'

const baseContext: PipelineMachineContext = {
  projectId: 'proj-1',
  channelId: 'ch-1',
  projectTitle: 'Test',
  mode: 'step',
  stageResults: {},
  iterationCount: 0,
  lastError: null,
  pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
  creditSettings: DEFAULT_CREDIT_SETTINGS,
}

const brainstormResult = {
  ideaId: 'idea-1', ideaTitle: 'Test Idea',
  ideaVerdict: 'viable', ideaCoreTension: 'tension',
}

describe('mergeStageResult', () => {
  it('adds result to stageResults with completedAt timestamp', () => {
    const next = mergeStageResult(baseContext, 'brainstorm', brainstormResult)
    expect(next.stageResults.brainstorm?.ideaId).toBe('idea-1')
    expect(next.stageResults.brainstorm?.completedAt).toBeTruthy()
  })

  it('does not mutate the original context', () => {
    mergeStageResult(baseContext, 'brainstorm', brainstormResult)
    expect(baseContext.stageResults.brainstorm).toBeUndefined()
  })
})

describe('clearStrictlyAfter', () => {
  const ctx: PipelineMachineContext = {
    ...baseContext,
    stageResults: {
      brainstorm: { ...brainstormResult, completedAt: '2026-01-01T00:00:00Z' },
      research: { researchSessionId: 'rs-1', approvedCardsCount: 5, researchLevel: 'medium', completedAt: '2026-01-01T00:00:00Z' },
      draft: { draftId: 'd-1', draftTitle: 'Draft', draftContent: 'content', completedAt: '2026-01-01T00:00:00Z' },
    },
  }

  it('preserves the named stage and earlier stages; removes strictly-later stages', () => {
    const next = clearStrictlyAfter(ctx, 'research')
    expect(next.stageResults.brainstorm).toBeDefined()
    expect(next.stageResults.research).toBeDefined()      // preserved!
    expect(next.stageResults.draft).toBeUndefined()
  })

  it('is a no-op when the named stage is the last stage', () => {
    const ctxFull = { ...ctx, stageResults: { ...ctx.stageResults, publish: { wordpressPostId: 1, publishedUrl: 'x', completedAt: 'x' } as any } }
    const next = clearStrictlyAfter(ctxFull, 'publish')
    expect(Object.keys(next.stageResults)).toHaveLength(Object.keys(ctxFull.stageResults).length)
  })
})

describe('incrementIterationCount / resetIterationCount', () => {
  it('increments iterationCount by 1', () => {
    const next = incrementIterationCount({ ...baseContext, iterationCount: 2 })
    expect(next.iterationCount).toBe(3)
  })

  it('resets iterationCount to 0', () => {
    const next = resetIterationCount({ ...baseContext, iterationCount: 4 })
    expect(next.iterationCount).toBe(0)
  })
})

describe('setLastError / clearLastError', () => {
  it('sets lastError', () => {
    expect(setLastError(baseContext, 'boom').lastError).toBe('boom')
  })

  it('clears lastError', () => {
    expect(clearLastError({ ...baseContext, lastError: 'x' }).lastError).toBeNull()
  })
})
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/actions.test.ts
```

Expected: `FAIL — Cannot find module '../actions'`

- [ ] **Step 3: Implement actions.ts**

Create `apps/app/src/lib/pipeline/actions.ts`:

```typescript
import { PIPELINE_STAGES } from '@/components/engines/types'
import type { PipelineMachineContext, PipelineStage, StageResultMap } from './machine.types'

type AnyResult = Record<string, unknown>

export function mergeStageResult(
  context: PipelineMachineContext,
  stage: PipelineStage,
  result: AnyResult,
): PipelineMachineContext {
  return {
    ...context,
    stageResults: {
      ...context.stageResults,
      [stage]: { ...result, completedAt: new Date().toISOString() },
    },
  }
}

/**
 * Removes stage results at indices STRICTLY AFTER `fromStage`.
 * The named stage's own result is preserved.
 *
 * Used by REDO_FROM (user re-runs from a given stage; keeps that stage's
 * existing result so they can see what they're replacing) and by
 * *_COMPLETE actions (clear stale downstream when a user re-completes
 * an earlier stage).
 */
export function clearStrictlyAfter(
  context: PipelineMachineContext,
  fromStage: PipelineStage,
): PipelineMachineContext {
  const fromIndex = PIPELINE_STAGES.indexOf(fromStage)
  if (fromIndex === -1) return context
  const newResults: StageResultMap = { ...context.stageResults }
  PIPELINE_STAGES.slice(fromIndex + 1).forEach((s) => {
    delete newResults[s]
  })
  return { ...context, stageResults: newResults }
}

export function incrementIterationCount(context: PipelineMachineContext): PipelineMachineContext {
  return { ...context, iterationCount: context.iterationCount + 1 }
}

export function resetIterationCount(context: PipelineMachineContext): PipelineMachineContext {
  return { ...context, iterationCount: 0 }
}

export function setLastError(context: PipelineMachineContext, error: string): PipelineMachineContext {
  return { ...context, lastError: error }
}

export function clearLastError(context: PipelineMachineContext): PipelineMachineContext {
  return { ...context, lastError: null }
}
```

- [ ] **Step 4: Run — confirm all pass**

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/actions.test.ts
```

Expected: `PASS (9)`

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/lib/pipeline/actions.ts apps/app/src/lib/pipeline/__tests__/actions.test.ts
git commit -m "feat(pipeline): add pure action helpers with unit tests"
```

---

### Task 6: Reproduce Actor

**Files:**
- Create: `apps/app/src/lib/pipeline/__tests__/actors.test.ts`
- Create: `apps/app/src/lib/pipeline/actors.ts`

- [ ] **Step 1: Write failing test**

Create `apps/app/src/lib/pipeline/__tests__/actors.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createActor } from 'xstate'
import { reproduceActor } from '../actors'

describe('reproduceActor', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves when API returns no error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ data: {}, error: null }),
    }))

    const actor = createActor(reproduceActor, {
      input: { draftId: 'd-1', feedbackJson: { issues: ['clarity'] } },
    })
    actor.start()

    await new Promise<void>((resolve, reject) => {
      actor.subscribe((snap) => {
        if (snap.status === 'done') resolve()
        if (snap.status === 'error') reject(snap.error)
      })
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/content-drafts/d-1/reproduce',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('throws when API returns error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ data: null, error: { message: 'Reproduce failed' } }),
    }))

    const actor = createActor(reproduceActor, {
      input: { draftId: 'd-1', feedbackJson: {} },
    })
    actor.start()

    const error = await new Promise<unknown>((resolve) => {
      actor.subscribe((snap) => {
        if (snap.status === 'error') resolve(snap.error)
      })
    })

    expect((error as Error).message).toBe('Reproduce failed')
  })
})
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/actors.test.ts
```

Expected: `FAIL — Cannot find module '../actors'`

- [ ] **Step 3: Implement actors.ts**

Create `apps/app/src/lib/pipeline/actors.ts`:

```typescript
import { fromPromise } from 'xstate'

export const reproduceActor = fromPromise(async ({
  input,
}: {
  input: { draftId: string; feedbackJson: Record<string, unknown> }
}) => {
  const res = await fetch(`/api/content-drafts/${input.draftId}/reproduce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedbackJson: input.feedbackJson }),
  })
  const { error } = await res.json()
  if (error) throw new Error(error.message)
})
```

- [ ] **Step 4: Run — confirm pass**

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/actors.test.ts
```

Expected: `PASS (2)`

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/lib/pipeline/actors.ts apps/app/src/lib/pipeline/__tests__/actors.test.ts
git commit -m "feat(pipeline): add reproduceActor with unit tests"
```

---

### Task 7: Pipeline Machine Definition (Integration Tests)

**Files:**
- Create: `apps/app/src/lib/pipeline/__tests__/machine.test.ts`
- Create: `apps/app/src/lib/pipeline/machine.ts`

- [ ] **Step 1: Write failing integration tests**

Create `apps/app/src/lib/pipeline/__tests__/machine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createActor } from 'xstate'
import { pipelineMachine } from '../machine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'
import type { PipelineMachineInput } from '../machine.types'

const input: PipelineMachineInput = {
  projectId: 'proj-1',
  channelId: 'ch-1',
  projectTitle: 'Test Project',
  pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
  creditSettings: DEFAULT_CREDIT_SETTINGS,
}

const brainstormResult = {
  ideaId: 'idea-1', ideaTitle: 'Test', ideaVerdict: 'viable', ideaCoreTension: 'tension',
}
const researchResult = {
  researchSessionId: 'rs-1', approvedCardsCount: 5, researchLevel: 'medium',
}
const draftResult = {
  draftId: 'd-1', draftTitle: 'Draft', draftContent: 'content',
}

function startActor(overrides?: Partial<PipelineMachineInput>) {
  const actor = createActor(pipelineMachine, { input: { ...input, ...overrides } })
  actor.start()
  return actor
}

describe('initial state', () => {
  it('starts in brainstorm.idle', () => {
    const actor = startActor()
    expect(actor.getSnapshot().value).toMatchObject({ brainstorm: 'idle' })
  })

  it('seeds context from input', () => {
    const actor = startActor()
    const ctx = actor.getSnapshot().context
    expect(ctx.projectId).toBe('proj-1')
    expect(ctx.iterationCount).toBe(0)
    expect(ctx.mode).toBe('step')
  })
})

describe('stage transitions', () => {
  it('transitions brainstorm → research on BRAINSTORM_COMPLETE', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    expect(actor.getSnapshot().value).toMatchObject({ research: 'idle' })
  })

  it('saves brainstorm result to context', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    expect(actor.getSnapshot().context.stageResults.brainstorm?.ideaId).toBe('idea-1')
  })

  it('transitions research → draft on RESEARCH_COMPLETE', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    expect(actor.getSnapshot().value).toMatchObject({ draft: 'idle' })
  })

  it('transitions draft → review on DRAFT_COMPLETE', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    expect(actor.getSnapshot().value).toMatchObject({ review: 'idle' })
  })
})

describe('review loop', () => {
  function reachReview() {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    actor.send({ type: 'RESUME' }) // enter reviewing sub-state
    return actor
  }

  it('transitions to assets when score >= approveScore (90)', () => {
    const actor = reachReview()
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 92, verdict: 'approved', feedbackJson: {}, iterationCount: 1 },
    })
    expect(actor.getSnapshot().value).toMatchObject({ assets: 'idle' })
  })

  it('pauses when score < rejectThreshold (40)', () => {
    const actor = reachReview()
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 30, verdict: 'rejected', feedbackJson: {}, iterationCount: 1 },
    })
    expect(actor.getSnapshot().value).toMatchObject({ review: 'paused' })
  })

  it('pauses when context.iterationCount >= maxIterations (5)', () => {
    // Seed context.iterationCount to 4. RESUME enters reviewing → entry action
    // increments to 5. REVIEW_COMPLETE then trips hasReachedMaxIterations from
    // context, regardless of any iterationCount the engine passes on the event.
    const actor = createActor(pipelineMachine, { input: { ...input, initialIterationCount: 4 } })
    actor.start()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    actor.send({ type: 'RESUME' })
    expect(actor.getSnapshot().context.iterationCount).toBe(5)
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 75, verdict: 'needs_revision', feedbackJson: {}, iterationCount: 0 /* ignored */ },
    })
    expect(actor.getSnapshot().value).toMatchObject({ review: 'paused' })
    // Saved result reflects the machine-owned counter, not the event payload.
    expect(actor.getSnapshot().context.stageResults.review?.iterationCount).toBe(5)
  })
})

describe('NAVIGATE (no clear)', () => {
  it('jumps to earlier stage without clearing any results', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'NAVIGATE', toStage: 'brainstorm' })
    const ctx = actor.getSnapshot().context
    expect(ctx.stageResults.brainstorm).toBeDefined()
    expect(ctx.stageResults.research).toBeDefined()
    expect(actor.getSnapshot().value).toMatchObject({ brainstorm: 'idle' })
  })
})

describe('REDO_FROM (clear strictly-downstream)', () => {
  it('clears stages strictly after fromStage; preserves fromStage result', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    actor.send({ type: 'REDO_FROM', fromStage: 'research' })
    const ctx = actor.getSnapshot().context
    expect(ctx.stageResults.brainstorm).toBeDefined()
    expect(ctx.stageResults.research).toBeDefined()     // preserved
    expect(ctx.stageResults.draft).toBeUndefined()      // cleared
    expect(actor.getSnapshot().value).toMatchObject({ research: 'idle' })
  })
})

describe('iterationCount ownership', () => {
  it('increments iterationCount on entering reviewing substate', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    expect(actor.getSnapshot().context.iterationCount).toBe(0)
    actor.send({ type: 'RESUME' })
    expect(actor.getSnapshot().context.iterationCount).toBe(1)
  })

  it('does not reset iterationCount on REDO_FROM fromStage=review', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    actor.send({ type: 'RESUME' }) // iteration 1
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 75, verdict: 'needs_revision', feedbackJson: {}, iterationCount: 1 },
    })
    expect(actor.getSnapshot().context.iterationCount).toBeGreaterThanOrEqual(1)
  })

  it('resets iterationCount to 0 on REDO_FROM fromStage=draft', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    actor.send({ type: 'RESUME' })
    actor.send({ type: 'REDO_FROM', fromStage: 'draft' })
    expect(actor.getSnapshot().context.iterationCount).toBe(0)
  })
})

describe('lastError surfacing', () => {
  it('sets lastError on STAGE_ERROR', () => {
    const actor = startActor()
    actor.send({ type: 'STAGE_ERROR', error: 'Brainstorm API down' })
    expect(actor.getSnapshot().context.lastError).toBe('Brainstorm API down')
  })

  it('clears lastError on RETRY', () => {
    const actor = startActor()
    actor.send({ type: 'STAGE_ERROR', error: 'boom' })
    actor.send({ type: 'RETRY' })
    expect(actor.getSnapshot().context.lastError).toBeNull()
  })
})

describe('concurrent actors', () => {
  it('two actors with different projectIds do not share state', () => {
    const a1 = startActor({ projectId: 'proj-A' })
    const a2 = startActor({ projectId: 'proj-B' })
    a1.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    expect(a1.getSnapshot().value).toMatchObject({ research: 'idle' })
    expect(a2.getSnapshot().value).toMatchObject({ brainstorm: 'idle' })
  })
})

describe('STAGE_PROGRESS merging', () => {
  it('merges partial into the named stage without advancing', () => {
    const actor = startActor()
    actor.send({ type: 'STAGE_PROGRESS', stage: 'brainstorm', partial: { ideaTitle: 'Draft Title' } })
    expect(actor.getSnapshot().value).toMatchObject({ brainstorm: 'idle' })
    expect((actor.getSnapshot().context.stageResults as any).brainstorm).toMatchObject({
      ideaTitle: 'Draft Title',
    })
  })

  it('ignores STAGE_PROGRESS with an unknown stage', () => {
    const actor = startActor()
    actor.send({ type: 'STAGE_PROGRESS', stage: 'not-a-stage' as any, partial: { x: 1 } })
    expect(actor.getSnapshot().context.stageResults).toEqual({})
  })
})

describe('re-completing a stage does NOT clear downstream', () => {
  it('keeps downstream results when an earlier stage is re-completed', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    actor.send({ type: 'NAVIGATE', toStage: 'brainstorm' })
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: { ...brainstormResult, ideaTitle: 'Updated' } })
    const ctx = actor.getSnapshot().context
    expect(ctx.stageResults.brainstorm?.ideaTitle).toBe('Updated')
    expect(ctx.stageResults.research).toBeDefined()
    expect(ctx.stageResults.draft).toBeDefined()
  })
})

describe('auto-pilot vs step mode after reproduce', () => {
  function reachReproducing(mode: 'auto' | 'step') {
    // REVIEW_COMPLETE with 40 <= score < 90 and iterationCount < 5 routes to reproducing.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ data: {}, error: null }),
    }))
    const actor = startActor({ mode })
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    actor.send({ type: 'RESUME' })
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 70, verdict: 'needs_revision', feedbackJson: {}, iterationCount: 1 },
    })
    return actor
  }

  it('auto mode: reproducing.onDone re-enters reviewing directly', async () => {
    const actor = reachReproducing('auto')
    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toMatchObject({ review: 'reviewing' })
    })
  })

  it('step mode: reproducing.onDone drops to idle (waits for user RESUME)', async () => {
    const actor = reachReproducing('step')
    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toMatchObject({ review: 'idle' })
    })
  })

  it('reproducing.onError routes to paused and writes lastError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ data: null, error: { message: 'Reproduce failed' } }),
    }))
    const actor = startActor({ mode: 'auto' })
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    actor.send({ type: 'RESUME' })
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 70, verdict: 'needs_revision', feedbackJson: {}, iterationCount: 1 },
    })
    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toMatchObject({ review: 'paused' })
      expect(actor.getSnapshot().context.lastError).toBe('Reproduce failed')
    })
  })
})
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/machine.test.ts
```

Expected: `FAIL — Cannot find module '../machine'`

- [ ] **Step 3: Implement machine.ts**

Create `apps/app/src/lib/pipeline/machine.ts`:

```typescript
import { setup, assign } from 'xstate'
import {
  PIPELINE_STAGES,
  DEFAULT_PIPELINE_SETTINGS,
  DEFAULT_CREDIT_SETTINGS,
} from '@/components/engines/types'
import { isApprovedGuard, isRejectedGuard, hasReachedMaxIterationsGuard } from './guards'
import { reproduceActor } from './actors'
import type {
  PipelineMachineContext,
  PipelineMachineInput,
  PipelineEvent,
  PipelineStage,
  StageResultMap,
} from './machine.types'

const saveStageResult = (stage: PipelineStage) =>
  assign(({ context, event }: { context: PipelineMachineContext; event: PipelineEvent }) => {
    const completedAt = new Date().toISOString()
    const eventWithResult = event as Extract<PipelineEvent, { result: unknown }>
    const baseResult = eventWithResult.result as Record<string, unknown>
    // For the review stage, force iterationCount to the machine-owned value.
    // The engine MAY pass any iterationCount (or omit it); the saved result is
    // always stamped from context. See design-spec "iterationCount source-of-truth
    // invariant" — guards and the saved record must agree on a single counter.
    const stageResult =
      stage === 'review'
        ? { ...baseResult, iterationCount: context.iterationCount, completedAt }
        : { ...baseResult, completedAt }
    const stageResults: StageResultMap = {
      ...context.stageResults,
      [stage]: stageResult,
    }
    // NOTE: we do NOT clear strictly-downstream results here. Re-completing
    // a stage after NAVIGATE-ing back must not silently discard downstream
    // work. Clearing is the sole responsibility of REDO_FROM, which is
    // modal-confirmed in the orchestrator.
    return { stageResults, lastError: null }
  })

const clearStrictlyAfterEvent = assign({
  stageResults: ({ context, event }) => {
    const e = event as Extract<PipelineEvent, { type: 'REDO_FROM' }>
    const fromIndex = PIPELINE_STAGES.indexOf(e.fromStage)
    if (fromIndex === -1) return context.stageResults
    const next: StageResultMap = { ...context.stageResults }
    PIPELINE_STAGES.slice(fromIndex + 1).forEach((s) => {
      delete next[s]
    })
    return next
  },
  iterationCount: ({ context, event }) => {
    const e = event as Extract<PipelineEvent, { type: 'REDO_FROM' }>
    // Returning to any stage before review resets the review iteration counter.
    const reviewIdx = PIPELINE_STAGES.indexOf('review')
    return PIPELINE_STAGES.indexOf(e.fromStage) < reviewIdx ? 0 : context.iterationCount
  },
})

export const pipelineMachine = setup({
  types: {
    context: {} as PipelineMachineContext,
    events: {} as PipelineEvent,
    input: {} as PipelineMachineInput,
  },
  guards: {
    isApproved: isApprovedGuard,
    isRejected: isRejectedGuard,
    hasReachedMaxIterations: hasReachedMaxIterationsGuard,
    isAutoMode:  ({ context }) => context.mode === 'auto',
    isStepMode:  ({ context }) => context.mode === 'step',
  },
  actors: { reproduceActor },
  actions: {
    saveBrainstormResult: saveStageResult('brainstorm'),
    saveResearchResult:   saveStageResult('research'),
    saveDraftResult:      saveStageResult('draft'),
    saveReviewResult:     saveStageResult('review'),
    saveAssetsResult:     saveStageResult('assets'),
    savePreviewResult:    saveStageResult('preview'),
    savePublishResult:    saveStageResult('publish'),
    mergeStageProgress: assign({
      stageResults: ({ context, event }) => {
        const e = event as Extract<PipelineEvent, { type: 'STAGE_PROGRESS' }>
        // The event carries the target stage explicitly — no reliance on
        // self.getSnapshot() (which is stale/undefined during transitions in
        // XState v5). The sender (engine) knows its own stage.
        if (!PIPELINE_STAGES.includes(e.stage)) return context.stageResults
        const existing = (context.stageResults[e.stage] ?? {}) as Record<string, unknown>
        return {
          ...context.stageResults,
          [e.stage]: { ...existing, ...e.partial },
        }
      },
    }),
    clearStrictlyAfter: clearStrictlyAfterEvent,
    toggleMode: assign({
      mode: ({ context }) => (context.mode === 'auto' ? 'step' : 'auto'),
    }),
    setMode: assign({
      mode: ({ event }) => (event as any).mode ?? 'step',
    }),
    setProjectTitle: assign({
      projectTitle: ({ event }) => {
        const e = event as Extract<PipelineEvent, { type: 'SET_PROJECT_TITLE' }>
        return e.title
      },
    }),
    incrementIteration: assign({
      iterationCount: ({ context }) => context.iterationCount + 1,
    }),
    recordError: assign({
      lastError: ({ event }) => {
        const e = event as Extract<PipelineEvent, { type: 'STAGE_ERROR' }>
        return e.error
      },
    }),
    clearError: assign({ lastError: () => null }),
    /**
     * Writes the rejection reason of an invoked `fromPromise` actor into
     * `context.lastError`. XState v5 emits actor failures as internal events of
     * shape `{ type: 'xstate.error.actor.<invokeId>', error: unknown }` — these
     * are distinct from user-dispatched `STAGE_ERROR` events, so they need a
     * separate handler. The payload under `event.error` is whatever the promise
     * rejected with: an `Error` instance, a string, or arbitrary value. This
     * action normalizes all three into a string suitable for UI display.
     *
     * Side effects (toast notifications) are NOT fired here — the machine stays
     * pure. The orchestrator subscribes to `context.lastError` changes and calls
     * `toast.error(lastError)` in a `useEffect`. See spec §Preserved Orchestrator
     * Features item 6 and design-spec line 244 ("machine stays pure").
     */
    recordActorError: assign({
      lastError: ({ event }) => {
        const err = (event as any)?.error
        if (err instanceof Error) return err.message
        if (typeof err === 'string') return err
        return 'Unknown error'
      },
    }),
  },
}).createMachine({
  id: 'pipeline',
  context: ({ input }) => ({
    projectId: input.projectId,
    channelId: input.channelId,
    projectTitle: input.projectTitle,
    mode: input.mode ?? 'step',
    stageResults: input.initialStageResults ?? {},
    iterationCount: input.initialIterationCount ?? 0,
    lastError: null,
    pipelineSettings: input.pipelineSettings ?? DEFAULT_PIPELINE_SETTINGS,
    creditSettings: input.creditSettings ?? DEFAULT_CREDIT_SETTINGS,
  }),
  initial: 'brainstorm',
  on: {
    TOGGLE_AUTO_PILOT: { actions: 'toggleMode' },
    SET_PROJECT_TITLE: { actions: 'setProjectTitle' },
    STAGE_PROGRESS:    { actions: 'mergeStageProgress' },
    NAVIGATE: [
      { guard: ({ event }) => event.toStage === 'brainstorm', target: '.brainstorm' },
      { guard: ({ event }) => event.toStage === 'research',   target: '.research'   },
      { guard: ({ event }) => event.toStage === 'draft',      target: '.draft'      },
      { guard: ({ event }) => event.toStage === 'review',     target: '.review'     },
      { guard: ({ event }) => event.toStage === 'assets',     target: '.assets'     },
      { guard: ({ event }) => event.toStage === 'preview',    target: '.preview'    },
      { guard: ({ event }) => event.toStage === 'publish',    target: '.publish'    },
    ],
    REDO_FROM: [
      { guard: ({ event }) => event.fromStage === 'brainstorm', target: '.brainstorm', actions: 'clearStrictlyAfter' },
      { guard: ({ event }) => event.fromStage === 'research',   target: '.research',   actions: 'clearStrictlyAfter' },
      { guard: ({ event }) => event.fromStage === 'draft',      target: '.draft',      actions: 'clearStrictlyAfter' },
      { guard: ({ event }) => event.fromStage === 'review',     target: '.review',     actions: 'clearStrictlyAfter' },
      { guard: ({ event }) => event.fromStage === 'assets',     target: '.assets',     actions: 'clearStrictlyAfter' },
      { guard: ({ event }) => event.fromStage === 'preview',    target: '.preview',    actions: 'clearStrictlyAfter' },
    ],
  },
  states: {
    brainstorm: {
      initial: 'idle',
      states: {
        idle:  {},
        error: { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
      on: {
        BRAINSTORM_COMPLETE: { target: 'research', actions: 'saveBrainstormResult' },
        STAGE_ERROR:         { target: '.error',   actions: 'recordError' },
      },
    },
    research: {
      initial: 'idle',
      states: {
        idle:  {},
        error: { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
      on: {
        RESEARCH_COMPLETE: { target: 'draft',   actions: 'saveResearchResult' },
        STAGE_ERROR:       { target: '.error', actions: 'recordError' },
      },
    },
    draft: {
      initial: 'idle',
      states: {
        idle:  {},
        error: { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
      on: {
        DRAFT_COMPLETE: { target: 'review',  actions: 'saveDraftResult' },
        STAGE_ERROR:    { target: '.error',  actions: 'recordError' },
      },
    },
    review: {
      initial: 'idle',
      states: {
        idle:      { on: { RESUME: { target: 'reviewing' } } },
        reviewing: {
          entry: 'incrementIteration',
          on: {
            REVIEW_COMPLETE: [
              { guard: 'isApproved',              target: '#pipeline.assets', actions: 'saveReviewResult' },
              { guard: 'isRejected',              target: 'paused',           actions: 'saveReviewResult' },
              { guard: 'hasReachedMaxIterations', target: 'paused',           actions: 'saveReviewResult' },
              { target: 'reproducing', actions: 'saveReviewResult' },
            ],
            STAGE_ERROR: { target: 'error', actions: 'recordError' },
          },
        },
        reproducing: {
          invoke: {
            src: 'reproduceActor',
            input: ({ context }) => ({
              draftId:      context.stageResults.draft?.draftId ?? '',
              feedbackJson: context.stageResults.review?.feedbackJson ?? {},
            }),
            onDone: [
              { guard: 'isAutoMode', target: 'reviewing' }, // auto-pilot re-enters reviewing directly
              { target: 'idle' },                             // step mode waits for user RESUME
            ],
            onError: { target: 'paused', actions: 'recordActorError' },
          },
        },
        paused: { on: { RESUME: { target: 'reviewing' } } },
        done:   {},
        error:  { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
    },
    assets: {
      initial: 'idle',
      states: {
        idle:  {},
        error: { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
      on: {
        ASSETS_COMPLETE: { target: 'preview', actions: 'saveAssetsResult' },
        STAGE_ERROR:     { target: '.error',  actions: 'recordError' },
      },
    },
    preview: {
      initial: 'idle',
      states: {
        idle:  {},
        error: { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
      on: {
        PREVIEW_COMPLETE: { target: 'publish', actions: 'savePreviewResult' },
        STAGE_ERROR:      { target: '.error',  actions: 'recordError' },
      },
    },
    publish: {
      initial: 'idle',
      states: {
        idle:  {},
        done:  { type: 'final' },
        error: { on: { RETRY: { target: 'idle', actions: 'clearError' } } },
      },
      on: {
        PUBLISH_COMPLETE: { target: '.done',  actions: 'savePublishResult' },
        STAGE_ERROR:      { target: '.error', actions: 'recordError' },
      },
    },
  },
})
```

**Why `isApproved` targets `#pipeline.assets` not just `assets`:** the transition happens from inside `review.reviewing` substate — relative targets resolve within `review`. `#pipeline.assets` escapes to the top-level `assets` state. Tests verify this with `toMatchObject({ assets: 'idle' })`.

**Why `saveStageResult(stage)` is a factory:** collapses 7 nearly-identical `saveXResult` actions into one. Each stage's save writes the new result and clears `lastError` — nothing else. Downstream results are preserved; only `REDO_FROM` (modal-confirmed in the orchestrator) clears strictly-downstream state. This diverges from the old orchestrator's `handleStageComplete`, which clobbered downstream on re-completion — that behavior was a silent data-loss foot-gun and is removed here.

**Why `reproducing.onError` uses `recordActorError` (not `recordError`):** actor errors arrive as XState's internal `xstate.error.actor.*` events, not as `STAGE_ERROR`. The error payload is under `event.error`, not `event.error` string. `recordActorError` normalizes both Error instances and strings.

**Why `publish` has no machine-level pause substate:** the spec (design-spec line 228) mandates "publish always pauses before publishing, regardless of mode." This plan enforces the pause at the **orchestrator** level — the auto-pilot `useEffect` (see Task 9 Step 3, around line 2296) early-returns when `currentStage === 'publish'` so the engine's generate path is never auto-triggered. The machine itself treats `publish.idle` like any other idle substate: it stays there until the engine dispatches `PUBLISH_COMPLETE`, which the orchestrator only lets happen after an explicit user confirmation.

This is deliberately a "machine pure, orchestrator enforces" split — adding a `publish.paused` substate and a `RESUME`-gated transition would duplicate the orchestrator's user-confirmation modal inside the machine. If a future consumer ever runs the machine headlessly (no orchestrator), publish-pause enforcement must be re-added on that consumer. Document this invariant in the machine file header and in `PipelineOrchestrator.tsx` next to the auto-pilot effect.

- [ ] **Step 4: Run integration tests — confirm pass**

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/machine.test.ts
```

Expected: `PASS (11+)`

- [ ] **Step 5: Run all pipeline tests together**

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/lib/pipeline/machine.ts apps/app/src/lib/pipeline/__tests__/machine.test.ts
git commit -m "feat(pipeline): implement XState pipeline machine with integration tests"
```

---

---

## Wave-specific guardrails

### Test discipline (TDD: failing test first)

Each task ships with a co-located `__tests__/<file>.test.ts`. Pattern:
1. Write failing test
2. Implement
3. Verify green
4. Commit

### Required test coverage (from design spec lines 371–379)

- [ ] All 4 review-loop guard paths: approve, reject below threshold, between thresholds + iterations OK, between thresholds + max reached
- [ ] `NAVIGATE { toStage }` preserves all stage results
- [ ] `REDO_FROM { fromStage }` clears strictly-downstream results; target stage's own result preserved
- [ ] Settings injected at spawn are immutable for the machine's lifetime
- [ ] Two `createActor(...)` instances do not share state (concurrent isolation)
- [ ] `reproducing.onError` writes `context.lastError` and fires `surfaceError` toast
- [ ] Auto-pilot: `reproducing.onDone` re-enters `reviewing` when `mode === 'auto'`; drops to `idle` when `mode === 'step'`
- [ ] `STAGE_PROGRESS` merges partial result into current stage without advancing
- [ ] `iterationCount` increments on `reviewing` entry (machine-owned, not engine)
- [ ] Publish stage never auto-advances regardless of `mode` (orchestrator-enforced; verify machine has no auto-transition)

### What this wave **must not** introduce

- Any `import React` / `from '@xstate/react'`
- Any reference to `usePipelineActor`, providers, or DOM
- Any side-effect that runs at module import time (machine definition is pure)
- Any persistence to Supabase (orchestrator owns persistence; machine is pure)

### Parallelization

Tasks 4 and 5 can run in parallel after Task 3 lands. Task 6 in parallel with 4–5. Task 7 must wait for all of them.

---

## Exit criteria

- [ ] `npm run test --workspace=@brighttale/app -- pipeline` runs all five suites green
- [ ] `npm run typecheck` clean
- [ ] `lib/pipeline/` directory contains exactly: `machine.ts`, `machine.types.ts`, `guards.ts`, `actions.ts`, `actors.ts`, `__tests__/`
- [ ] Zero React imports in `lib/pipeline/` (grep `from 'react'` returns nothing)
- [ ] All commits land cleanly through `.husky/pre-commit`

---

## Risks

| Risk | Mitigation |
|---|---|
| Guard tests pass on the wrong path (e.g., `score === approveScore` exactly) | Add edge-case tests at each threshold boundary: `score === approveScore`, `score === rejectThreshold`, `iterationCount === maxIterations`. |
| `reproduceActor` mocked away in integration tests, hiding errors | Stub `fetch` globally in test setup, not the actor; assert the actor produces a typed result. |
| Stage union types diverge from existing `engines/types.ts` | Import existing `BrainstormResult`, `ResearchResult`, etc. — do not redefine. |
| Action fires toast at module import time | All toast actions must be `assign({ type: '...', params: ({ context }) => ... })` — never invoked synchronously at definition. |

---

## Deploy

**Shippable to main standalone?** Yes — `lib/pipeline/` has no consumers yet. Merging Wave 1 alone is a safe checkpoint.

**Recommended:** merge to staging after Wave 1 to validate CI runs the new test suites.

---

## Out of scope for this wave

- Settings provider, actor provider, hook (Wave 2)
- Legacy migration helper (Wave 2)
- Orchestrator (Wave 3)
- Engines (Wave 4)
- FORMAT_COSTS dedup (Wave 5)
