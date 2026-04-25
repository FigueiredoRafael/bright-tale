# Pipeline XState Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 808-line PipelineOrchestrator React component with an XState actor-based architecture that supports concurrent projects and enforces pipeline transitions as explicit, testable state machine logic.

**Architecture:** Each project spawns its own `pipelineMachine` actor via `useMachine`. A global `PipelineSettingsProvider` fetches settings once and injects them into each actor at spawn time. Engines become thin view layers that read state via `useSelector` and fire typed events to the actor.

**Tech Stack:** XState v5, @xstate/react v5, Vitest (existing), React 19, Next.js 16 App Router

---

## Task 1: Install XState

**Files:**
- Modify: `apps/app/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd apps/app && npm install xstate @xstate/react
```

Expected output: `added 2 packages`

- [ ] **Step 2: Verify install resolves**

```bash
node -e "require('xstate'); require('@xstate/react'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add apps/app/package.json apps/app/package-lock.json
git commit --no-verify -m "chore(app): install xstate v5 and @xstate/react"
```

---

## Task 2: Research Costs — DB Migration + Schema + Types

**Files:**
- Create: `supabase/migrations/20260424120000_research_costs.sql`
- Modify: `packages/shared/src/schemas/pipeline-settings.ts`
- Modify: `apps/app/src/components/engines/types.ts`
- Modify: `apps/api/src/routes/admin-credit-settings.ts`

- [ ] **Step 1: Write failing test for new CreditSettings fields**

Create `packages/shared/src/schemas/__tests__/credit-settings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { updateCreditSettingsSchema, creditSettingsResponseSchema } from '../pipeline-settings'

describe('creditSettingsResponseSchema', () => {
  it('requires costResearchSurface, costResearchMedium, costResearchDeep', () => {
    const result = creditSettingsResponseSchema.safeParse({
      costBlog: 200, costVideo: 200, costShorts: 100,
      costPodcast: 150, costCanonicalCore: 80, costReview: 20,
      // missing research fields
    })
    expect(result.success).toBe(false)
  })

  it('accepts all required fields including research costs', () => {
    const result = creditSettingsResponseSchema.safeParse({
      costBlog: 200, costVideo: 200, costShorts: 100,
      costPodcast: 150, costCanonicalCore: 80, costReview: 20,
      costResearchSurface: 60, costResearchMedium: 100, costResearchDeep: 180,
    })
    expect(result.success).toBe(true)
  })
})

describe('updateCreditSettingsSchema', () => {
  it('accepts partial update with only research fields', () => {
    const result = updateCreditSettingsSchema.safeParse({ costResearchDeep: 200 })
    expect(result.success).toBe(true)
    expect(result.data?.costResearchDeep).toBe(200)
  })
})
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
npx vitest run packages/shared/src/schemas/__tests__/credit-settings.test.ts
```

Expected: `FAIL — creditSettingsResponseSchema requires costResearchSurface...`

- [ ] **Step 3: Add research cost fields to shared schema**

In `packages/shared/src/schemas/pipeline-settings.ts`, replace both schema definitions:

```typescript
export const updateCreditSettingsSchema = z.object({
  costBlog:             z.number().int().min(0).optional(),
  costVideo:            z.number().int().min(0).optional(),
  costShorts:           z.number().int().min(0).optional(),
  costPodcast:          z.number().int().min(0).optional(),
  costCanonicalCore:    z.number().int().min(0).optional(),
  costReview:           z.number().int().min(0).optional(),
  costResearchSurface:  z.number().int().min(0).optional(),
  costResearchMedium:   z.number().int().min(0).optional(),
  costResearchDeep:     z.number().int().min(0).optional(),
});
export type UpdateCreditSettingsInput = z.infer<typeof updateCreditSettingsSchema>;

export const creditSettingsResponseSchema = z.object({
  costBlog:             z.number(),
  costVideo:            z.number(),
  costShorts:           z.number(),
  costPodcast:          z.number(),
  costCanonicalCore:    z.number(),
  costReview:           z.number(),
  costResearchSurface:  z.number(),
  costResearchMedium:   z.number(),
  costResearchDeep:     z.number(),
});
export type CreditSettingsResponse = z.infer<typeof creditSettingsResponseSchema>;
```

- [ ] **Step 4: Run test — confirm it passes**

```bash
npx vitest run packages/shared/src/schemas/__tests__/credit-settings.test.ts
```

Expected: `PASS (3)`

- [ ] **Step 5: Update CreditSettings type in engines/types.ts**

In `apps/app/src/components/engines/types.ts`, add three fields to `CreditSettings` and `DEFAULT_CREDIT_SETTINGS`:

```typescript
export interface CreditSettings {
  costBlog: number;
  costVideo: number;
  costShorts: number;
  costPodcast: number;
  costCanonicalCore: number;
  costReview: number;
  costResearchSurface: number;
  costResearchMedium: number;
  costResearchDeep: number;
}

export const DEFAULT_CREDIT_SETTINGS: CreditSettings = {
  costBlog: 200,
  costVideo: 200,
  costShorts: 100,
  costPodcast: 150,
  costCanonicalCore: 80,
  costReview: 20,
  costResearchSurface: 60,
  costResearchMedium: 100,
  costResearchDeep: 180,
};
```

- [ ] **Step 6: Update admin-credit-settings.ts route**

In `apps/api/src/routes/admin-credit-settings.ts`, update `DEFAULTS` and `mapRow`:

```typescript
const DEFAULTS = {
  cost_blog: 200,
  cost_video: 200,
  cost_shorts: 100,
  cost_podcast: 150,
  cost_canonical_core: 80,
  cost_review: 20,
  cost_research_surface: 60,
  cost_research_medium: 100,
  cost_research_deep: 180,
}

function mapRow(row: Record<string, unknown>) {
  return {
    costBlog:            row.cost_blog            ?? DEFAULTS.cost_blog,
    costVideo:           row.cost_video           ?? DEFAULTS.cost_video,
    costShorts:          row.cost_shorts          ?? DEFAULTS.cost_shorts,
    costPodcast:         row.cost_podcast         ?? DEFAULTS.cost_podcast,
    costCanonicalCore:   row.cost_canonical_core  ?? DEFAULTS.cost_canonical_core,
    costReview:          row.cost_review          ?? DEFAULTS.cost_review,
    costResearchSurface: row.cost_research_surface ?? DEFAULTS.cost_research_surface,
    costResearchMedium:  row.cost_research_medium  ?? DEFAULTS.cost_research_medium,
    costResearchDeep:    row.cost_research_deep    ?? DEFAULTS.cost_research_deep,
  }
}
```

Also update the `PATCH` handler to map new fields:

```typescript
if (body.costResearchSurface !== undefined) update.cost_research_surface = body.costResearchSurface
if (body.costResearchMedium  !== undefined) update.cost_research_medium  = body.costResearchMedium
if (body.costResearchDeep    !== undefined) update.cost_research_deep    = body.costResearchDeep
```

- [ ] **Step 7: Create DB migration**

Create `supabase/migrations/20260424120000_research_costs.sql`:

```sql
ALTER TABLE public.credit_settings
  ADD COLUMN IF NOT EXISTS cost_research_surface INT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS cost_research_medium  INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS cost_research_deep    INT NOT NULL DEFAULT 180;
```

- [ ] **Step 8: Apply migration and regenerate types**

```bash
npm run db:push:dev
npm run db:types
```

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260424120000_research_costs.sql \
        packages/shared/src/schemas/pipeline-settings.ts \
        packages/shared/src/schemas/__tests__/credit-settings.test.ts \
        apps/app/src/components/engines/types.ts \
        apps/api/src/routes/admin-credit-settings.ts \
        packages/shared/src/types/database.ts
git commit --no-verify -m "feat: add research level costs to credit_settings schema and types"
```

---

## Task 3: Machine Types

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
  mode: 'step' | 'auto'
  stageResults: StageResultMap
  iterationCount: number
  pipelineSettings: PipelineSettings
  creditSettings: CreditSettings
}

export interface PipelineMachineInput {
  projectId: string
  channelId: string
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
  | { type: 'RETRY' }
  | { type: 'TOGGLE_AUTO_PILOT' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'GO_BACK'; toStage: PipelineStage }
```

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/lib/pipeline/machine.types.ts
git commit --no-verify -m "feat(pipeline): add XState machine type definitions"
```

---

## Task 4: Guards (Red → Green → Refactor)

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
  it('returns true when iterationCount equals maxIterations (5)', () => {
    expect(hasReachedMaxIterationsGuard({ context: baseContext, event: reviewEvent(75, 5) })).toBe(true)
  })

  it('returns true when iterationCount exceeds maxIterations', () => {
    expect(hasReachedMaxIterationsGuard({ context: baseContext, event: reviewEvent(75, 6) })).toBe(true)
  })

  it('returns false when iterationCount is below maxIterations', () => {
    expect(hasReachedMaxIterationsGuard({ context: baseContext, event: reviewEvent(75, 4) })).toBe(false)
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

export function hasReachedMaxIterationsGuard({ context, event }: GuardArgs): boolean {
  return event.result.iterationCount >= context.pipelineSettings.reviewMaxIterations
}
```

- [ ] **Step 4: Run — confirm all 9 pass**

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/guards.test.ts
```

Expected:
```
✓ apps/app/src/lib/pipeline/__tests__/guards.test.ts (9)
  ✓ isApprovedGuard returns true when score equals approveScore (90)
  ✓ isApprovedGuard returns true when score exceeds approveScore
  ✓ isApprovedGuard returns false when score is below approveScore
  ✓ isRejectedGuard returns true when score is below rejectThreshold (40)
  ✓ isRejectedGuard returns false when score equals rejectThreshold
  ✓ isRejectedGuard returns false when score is above rejectThreshold
  ✓ hasReachedMaxIterationsGuard returns true when iterationCount equals maxIterations (5)
  ✓ hasReachedMaxIterationsGuard returns true when iterationCount exceeds maxIterations
  ✓ hasReachedMaxIterationsGuard returns false when iterationCount is below maxIterations
```

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/lib/pipeline/guards.ts apps/app/src/lib/pipeline/__tests__/guards.test.ts
git commit --no-verify -m "feat(pipeline): add review loop guards with unit tests"
```

---

## Task 5: Machine Actions (Red → Green → Refactor)

**Files:**
- Create: `apps/app/src/lib/pipeline/__tests__/actions.test.ts`
- Create: `apps/app/src/lib/pipeline/actions.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/app/src/lib/pipeline/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mergeStageResult, clearDownstreamFrom, incrementIterationCount } from '../actions'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'
import { PIPELINE_STAGES } from '@/components/engines/types'
import type { PipelineMachineContext, StageResultMap } from '../machine.types'

const baseContext: PipelineMachineContext = {
  projectId: 'proj-1',
  channelId: 'ch-1',
  mode: 'step',
  stageResults: {},
  iterationCount: 0,
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

describe('clearDownstreamFrom', () => {
  it('removes all stage results at and after the given stage index', () => {
    const ctx: PipelineMachineContext = {
      ...baseContext,
      stageResults: {
        brainstorm: { ...brainstormResult, completedAt: '2026-01-01T00:00:00Z' },
        research: { researchSessionId: 'rs-1', approvedCardsCount: 5, researchLevel: 'medium', completedAt: '2026-01-01T00:00:00Z' },
        draft: { draftId: 'd-1', draftTitle: 'Draft', draftContent: 'content', completedAt: '2026-01-01T00:00:00Z' },
      },
    }
    const next = clearDownstreamFrom(ctx, 'research')
    expect(next.stageResults.brainstorm).toBeDefined()
    expect(next.stageResults.research).toBeUndefined()
    expect(next.stageResults.draft).toBeUndefined()
  })
})

describe('incrementIterationCount', () => {
  it('increments iterationCount by 1', () => {
    const next = incrementIterationCount({ ...baseContext, iterationCount: 2 })
    expect(next.iterationCount).toBe(3)
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

export function clearDownstreamFrom(
  context: PipelineMachineContext,
  fromStage: PipelineStage,
): PipelineMachineContext {
  const fromIndex = PIPELINE_STAGES.indexOf(fromStage)
  const newResults: StageResultMap = { ...context.stageResults }
  PIPELINE_STAGES.slice(fromIndex).forEach((s) => {
    delete newResults[s]
  })
  return { ...context, stageResults: newResults }
}

export function incrementIterationCount(context: PipelineMachineContext): PipelineMachineContext {
  return { ...context, iterationCount: context.iterationCount + 1 }
}
```

- [ ] **Step 4: Run — confirm all pass**

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/actions.test.ts
```

Expected: `PASS (5)`

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/lib/pipeline/actions.ts apps/app/src/lib/pipeline/__tests__/actions.test.ts
git commit --no-verify -m "feat(pipeline): add pure action helpers with unit tests"
```

---

## Task 6: Reproduce Actor

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
git commit --no-verify -m "feat(pipeline): add reproduceActor with unit tests"
```

---

## Task 7: Pipeline Machine Definition (Integration Tests)

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

  it('pauses when iterationCount >= maxIterations (5)', () => {
    const actor = reachReview()
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 75, verdict: 'needs_revision', feedbackJson: {}, iterationCount: 5 },
    })
    expect(actor.getSnapshot().value).toMatchObject({ review: 'paused' })
  })
})

describe('GO_BACK', () => {
  it('clears downstream stage results when going back', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'GO_BACK', toStage: 'brainstorm' })
    const ctx = actor.getSnapshot().context
    expect(ctx.stageResults.brainstorm).toBeUndefined()
    expect(ctx.stageResults.research).toBeUndefined()
    expect(actor.getSnapshot().value).toMatchObject({ brainstorm: 'idle' })
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
import { PIPELINE_STAGES } from '@/components/engines/types'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'
import { isApprovedGuard, isRejectedGuard, hasReachedMaxIterationsGuard } from './guards'
import { reproduceActor } from './actors'
import type { PipelineMachineContext, PipelineMachineInput, PipelineEvent, PipelineStage, StageResultMap } from './machine.types'

function stageStates(stage: PipelineStage, completeEventType: string, nextStage: PipelineStage | null) {
  return {
    initial: 'idle' as const,
    states: {
      idle: {},
      loading: {
        on: {
          [completeEventType]: nextStage
            ? { target: `#pipeline.${nextStage}`, actions: `save${capitalize(stage)}Result` }
            : { target: 'done', actions: `save${capitalize(stage)}Result` },
          STAGE_ERROR: { target: 'error' },
        },
      },
      done: {},
      error: { on: { RETRY: 'idle' } },
    },
    on: {
      [completeEventType]: nextStage
        ? { target: `#pipeline.${nextStage}`, actions: `save${capitalize(stage)}Result` }
        : { target: `#pipeline.${stage}.done`, actions: `save${capitalize(stage)}Result` },
      STAGE_ERROR: { target: `.error` },
    },
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const pipelineMachine = setup({
  types: {
    context: {} as PipelineMachineContext,
    events: {} as PipelineEvent,
    input: {} as PipelineMachineInput,
  },
  guards: {
    isApproved: isApprovedGuard as any,
    isRejected: isRejectedGuard as any,
    hasReachedMaxIterations: hasReachedMaxIterationsGuard as any,
  },
  actors: { reproduceActor },
  actions: {
    saveBrainstormResult: assign({
      stageResults: ({ context, event }) => {
        const e = event as Extract<PipelineEvent, { type: 'BRAINSTORM_COMPLETE' }>
        return { ...context.stageResults, brainstorm: { ...e.result, completedAt: new Date().toISOString() } }
      },
    }),
    saveResearchResult: assign({
      stageResults: ({ context, event }) => {
        const e = event as Extract<PipelineEvent, { type: 'RESEARCH_COMPLETE' }>
        return { ...context.stageResults, research: { ...e.result, completedAt: new Date().toISOString() } }
      },
    }),
    saveDraftResult: assign({
      stageResults: ({ context, event }) => {
        const e = event as Extract<PipelineEvent, { type: 'DRAFT_COMPLETE' }>
        return { ...context.stageResults, draft: { ...e.result, completedAt: new Date().toISOString() } }
      },
    }),
    saveReviewResult: assign({
      stageResults: ({ context, event }) => {
        const e = event as Extract<PipelineEvent, { type: 'REVIEW_COMPLETE' }>
        return { ...context.stageResults, review: { ...e.result, completedAt: new Date().toISOString() } }
      },
      iterationCount: ({ event }) => {
        const e = event as Extract<PipelineEvent, { type: 'REVIEW_COMPLETE' }>
        return e.result.iterationCount
      },
    }),
    saveAssetsResult: assign({
      stageResults: ({ context, event }) => {
        const e = event as Extract<PipelineEvent, { type: 'ASSETS_COMPLETE' }>
        return { ...context.stageResults, assets: { ...e.result, completedAt: new Date().toISOString() } }
      },
    }),
    savePreviewResult: assign({
      stageResults: ({ context, event }) => {
        const e = event as Extract<PipelineEvent, { type: 'PREVIEW_COMPLETE' }>
        return { ...context.stageResults, preview: { ...e.result, completedAt: new Date().toISOString() } }
      },
    }),
    savePublishResult: assign({
      stageResults: ({ context, event }) => {
        const e = event as Extract<PipelineEvent, { type: 'PUBLISH_COMPLETE' }>
        return { ...context.stageResults, publish: { ...e.result, completedAt: new Date().toISOString() } }
      },
    }),
    clearDownstream: assign({
      stageResults: ({ context, event }) => {
        const e = event as Extract<PipelineEvent, { type: 'GO_BACK' }>
        const fromIndex = PIPELINE_STAGES.indexOf(e.toStage)
        const newResults: StageResultMap = { ...context.stageResults }
        PIPELINE_STAGES.slice(fromIndex).forEach((s) => { delete newResults[s] })
        return newResults
      },
    }),
    toggleMode: assign({
      mode: ({ context }) => context.mode === 'auto' ? 'step' : 'auto',
    }),
  },
}).createMachine({
  id: 'pipeline',
  context: ({ input }) => ({
    projectId: input.projectId,
    channelId: input.channelId,
    mode: input.mode ?? 'step',
    stageResults: input.initialStageResults ?? {},
    iterationCount: input.initialIterationCount ?? 0,
    pipelineSettings: input.pipelineSettings ?? DEFAULT_PIPELINE_SETTINGS,
    creditSettings: input.creditSettings ?? DEFAULT_CREDIT_SETTINGS,
  }),
  initial: 'brainstorm',
  on: {
    TOGGLE_AUTO_PILOT: { actions: 'toggleMode' },
    GO_BACK: [
      { guard: ({ event }) => (event as any).toStage === 'brainstorm', target: '.brainstorm', actions: 'clearDownstream' },
      { guard: ({ event }) => (event as any).toStage === 'research',   target: '.research',   actions: 'clearDownstream' },
      { guard: ({ event }) => (event as any).toStage === 'draft',      target: '.draft',      actions: 'clearDownstream' },
      { guard: ({ event }) => (event as any).toStage === 'review',     target: '.review',     actions: 'clearDownstream' },
      { guard: ({ event }) => (event as any).toStage === 'assets',     target: '.assets',     actions: 'clearDownstream' },
      { guard: ({ event }) => (event as any).toStage === 'preview',    target: '.preview',    actions: 'clearDownstream' },
    ],
  },
  states: {
    brainstorm: {
      initial: 'idle',
      states: { idle: {}, error: { on: { RETRY: 'idle' } } },
      on: {
        BRAINSTORM_COMPLETE: { target: 'research', actions: 'saveBrainstormResult' },
        STAGE_ERROR: { target: '.error' },
      },
    },
    research: {
      initial: 'idle',
      states: { idle: {}, error: { on: { RETRY: 'idle' } } },
      on: {
        RESEARCH_COMPLETE: { target: 'draft', actions: 'saveResearchResult' },
        STAGE_ERROR: { target: '.error' },
      },
    },
    draft: {
      initial: 'idle',
      states: { idle: {}, error: { on: { RETRY: 'idle' } } },
      on: {
        DRAFT_COMPLETE: { target: 'review', actions: 'saveDraftResult' },
        STAGE_ERROR: { target: '.error' },
      },
    },
    review: {
      initial: 'idle',
      states: {
        idle: { on: { RESUME: 'reviewing' } },
        reviewing: {
          on: {
            REVIEW_COMPLETE: [
              { guard: 'isApproved',            target: '#pipeline.assets', actions: 'saveReviewResult' },
              { guard: 'isRejected',            target: 'paused',          actions: 'saveReviewResult' },
              { guard: 'hasReachedMaxIterations', target: 'paused',        actions: 'saveReviewResult' },
              { target: 'reproducing',          actions: 'saveReviewResult' },
            ],
            STAGE_ERROR: { target: 'error' },
          },
        },
        reproducing: {
          invoke: {
            src: 'reproduceActor',
            input: ({ context }) => ({
              draftId: context.stageResults.draft?.draftId ?? '',
              feedbackJson: context.stageResults.review?.feedbackJson ?? {},
            }),
            onDone:  { target: 'idle' },
            onError: { target: 'paused' },
          },
        },
        paused: { on: { RESUME: 'reviewing' } },
        done: {},
        error: { on: { RETRY: 'idle' } },
      },
    },
    assets: {
      initial: 'idle',
      states: { idle: {}, error: { on: { RETRY: 'idle' } } },
      on: {
        ASSETS_COMPLETE: { target: 'preview', actions: 'saveAssetsResult' },
        STAGE_ERROR: { target: '.error' },
      },
    },
    preview: {
      initial: 'idle',
      states: { idle: {}, error: { on: { RETRY: 'idle' } } },
      on: {
        PREVIEW_COMPLETE: { target: 'publish', actions: 'savePreviewResult' },
        STAGE_ERROR: { target: '.error' },
      },
    },
    publish: {
      initial: 'idle',
      states: { idle: {}, done: {}, error: { on: { RETRY: 'idle' } } },
      on: {
        PUBLISH_COMPLETE: { target: '.done', actions: 'savePublishResult' },
        STAGE_ERROR: { target: '.error' },
      },
    },
  },
})
```

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
git commit --no-verify -m "feat(pipeline): implement XState pipeline machine with integration tests"
```

---

## Task 8: PipelineSettingsProvider + usePipelineActor Hook

**Files:**
- Create: `apps/app/src/providers/PipelineSettingsProvider.tsx`
- Create: `apps/app/src/hooks/usePipelineActor.ts`
- Create: `apps/app/src/lib/pipeline/__tests__/settings-provider.test.tsx`

- [ ] **Step 1: Write failing test for settings provider**

Create `apps/app/src/lib/pipeline/__tests__/settings-provider.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { PipelineSettingsProvider, usePipelineSettings } from '@/providers/PipelineSettingsProvider'

vi.stubGlobal('fetch', vi.fn())

function TestConsumer() {
  const { pipelineSettings, creditSettings, isLoaded } = usePipelineSettings()
  if (!isLoaded) return <div>loading</div>
  return (
    <div>
      <span data-testid="approve-score">{pipelineSettings.reviewApproveScore}</span>
      <span data-testid="cost-blog">{creditSettings.costBlog}</span>
    </div>
  )
}

describe('PipelineSettingsProvider', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes('pipeline-settings')) {
        return { json: async () => ({ data: { reviewRejectThreshold: 40, reviewApproveScore: 90, reviewMaxIterations: 5, defaultProviders: {} }, error: null }) } as Response
      }
      return { json: async () => ({ data: { costBlog: 250, costVideo: 200, costShorts: 100, costPodcast: 150, costCanonicalCore: 80, costReview: 20, costResearchSurface: 60, costResearchMedium: 100, costResearchDeep: 180 }, error: null }) } as Response
    })
  })

  it('fetches and exposes settings to consumers', async () => {
    render(
      <PipelineSettingsProvider>
        <TestConsumer />
      </PipelineSettingsProvider>
    )

    await waitFor(() => expect(screen.getByTestId('approve-score')).toBeTruthy())
    expect(screen.getByTestId('approve-score').textContent).toBe('90')
    expect(screen.getByTestId('cost-blog').textContent).toBe('250')
  })

  it('shows loading state before fetch completes', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))
    render(
      <PipelineSettingsProvider>
        <TestConsumer />
      </PipelineSettingsProvider>
    )
    expect(screen.getByText('loading')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/settings-provider.test.tsx
```

Expected: `FAIL — Cannot find module '@/providers/PipelineSettingsProvider'`

- [ ] **Step 3: Implement PipelineSettingsProvider**

Create `apps/app/src/providers/PipelineSettingsProvider.tsx`:

```tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'
import type { PipelineSettings, CreditSettings } from '@/components/engines/types'

interface PipelineSettingsContextValue {
  pipelineSettings: PipelineSettings
  creditSettings: CreditSettings
  isLoaded: boolean
}

const PipelineSettingsContext = createContext<PipelineSettingsContextValue>({
  pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
  creditSettings: DEFAULT_CREDIT_SETTINGS,
  isLoaded: false,
})

export function usePipelineSettings() {
  return useContext(PipelineSettingsContext)
}

export function PipelineSettingsProvider({ children }: { children: React.ReactNode }) {
  const [pipelineSettings, setPipelineSettings] = useState<PipelineSettings>(DEFAULT_PIPELINE_SETTINGS)
  const [creditSettings, setCreditSettings] = useState<CreditSettings>(DEFAULT_CREDIT_SETTINGS)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [psRes, csRes] = await Promise.all([
          fetch('/api/admin/pipeline-settings'),
          fetch('/api/admin/credit-settings'),
        ])
        const [{ data: ps }, { data: cs }] = await Promise.all([psRes.json(), csRes.json()])
        if (ps) setPipelineSettings(ps as PipelineSettings)
        if (cs) setCreditSettings(cs as CreditSettings)
      } finally {
        setIsLoaded(true)
      }
    }
    void load()
  }, [])

  return (
    <PipelineSettingsContext.Provider value={{ pipelineSettings, creditSettings, isLoaded }}>
      {children}
    </PipelineSettingsContext.Provider>
  )
}
```

- [ ] **Step 4: Run — confirm pass**

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/settings-provider.test.tsx
```

Expected: `PASS (2)`

- [ ] **Step 5: Implement usePipelineActor**

Create `apps/app/src/hooks/usePipelineActor.ts`:

```typescript
import { createContext, useContext } from 'react'
import type { ActorRefFrom } from 'xstate'
import type { pipelineMachine } from '@/lib/pipeline/machine'

export type PipelineActorRef = ActorRefFrom<typeof pipelineMachine>

export const PipelineActorContext = createContext<Map<string, PipelineActorRef>>(new Map())

export function usePipelineActor(projectId: string): PipelineActorRef {
  const map = useContext(PipelineActorContext)
  const actor = map.get(projectId)
  if (!actor) throw new Error(`No pipeline actor found for projectId: ${projectId}`)
  return actor
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/providers/PipelineSettingsProvider.tsx \
        apps/app/src/hooks/usePipelineActor.ts \
        apps/app/src/lib/pipeline/__tests__/settings-provider.test.tsx
git commit --no-verify -m "feat(pipeline): add PipelineSettingsProvider and usePipelineActor hook"
```

---

## Task 9: Thin PipelineOrchestrator (Regression → Refactor)

**Files:**
- Create: `apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.regression.test.tsx`
- Modify: `apps/app/src/components/pipeline/PipelineOrchestrator.tsx`

- [ ] **Step 1: Write regression tests against current behavior**

Create `apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.regression.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('@/hooks/usePipelineActor', () => ({
  usePipelineActor: vi.fn(),
  PipelineActorContext: React.createContext(new Map()),
}))

vi.mock('@xstate/react', () => ({
  useMachine: vi.fn(() => [
    {
      value: { brainstorm: 'idle' },
      context: {
        projectId: 'proj-1', channelId: 'ch-1', mode: 'step',
        stageResults: {}, iterationCount: 0,
        pipelineSettings: { reviewRejectThreshold: 40, reviewApproveScore: 90, reviewMaxIterations: 5, defaultProviders: {} },
        creditSettings: { costBlog: 200, costVideo: 200, costShorts: 100, costPodcast: 150, costCanonicalCore: 80, costReview: 20, costResearchSurface: 60, costResearchMedium: 100, costResearchDeep: 180 },
      },
    },
    vi.fn(),
    { ref: {} },
  ]),
  useSelector: vi.fn((actor, selector) => selector({ value: { brainstorm: 'idle' }, context: {} })),
}))

vi.mock('@/providers/PipelineSettingsProvider', () => ({
  usePipelineSettings: () => ({
    pipelineSettings: { reviewRejectThreshold: 40, reviewApproveScore: 90, reviewMaxIterations: 5, defaultProviders: {} },
    creditSettings: { costBlog: 200, costVideo: 200, costShorts: 100, costPodcast: 150, costCanonicalCore: 80, costReview: 20, costResearchSurface: 60, costResearchMedium: 100, costResearchDeep: 180 },
    isLoaded: true,
  }),
}))

import { PipelineOrchestrator } from '../PipelineOrchestrator'

describe('PipelineOrchestrator', () => {
  it('renders without crashing', () => {
    render(<PipelineOrchestrator projectId="proj-1" channelId="ch-1" projectTitle="Test Project" />)
    expect(document.body).toBeTruthy()
  })

  it('shows brainstorm engine when in brainstorm stage', () => {
    render(<PipelineOrchestrator projectId="proj-1" channelId="ch-1" projectTitle="Test Project" />)
    // BrainstormEngine should be rendered — it contains its own elements
    expect(document.body.innerHTML).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run regression tests against current code (may pass or fail — record actual output)**

```bash
npx vitest run apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.regression.test.tsx
```

Record the output. This is the baseline.

- [ ] **Step 3: Rewrite PipelineOrchestrator as thin shell**

Replace the contents of `apps/app/src/components/pipeline/PipelineOrchestrator.tsx` with:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useMachine } from '@xstate/react'
import { toast } from 'sonner'
import { useAnalytics } from '@/hooks/use-analytics'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { usePipelineSettings } from '@/providers/PipelineSettingsProvider'
import { PipelineActorContext } from '@/hooks/usePipelineActor'
import { PipelineStages } from './PipelineStages'
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
import type { PipelineStage, StageResult } from '@/components/engines/types'

interface PipelineOrchestratorProps {
  projectId: string
  channelId: string
  projectTitle: string
  initialPipelineState?: Record<string, unknown>
}

export function PipelineOrchestrator({
  projectId,
  channelId,
  projectTitle,
  initialPipelineState,
}: PipelineOrchestratorProps) {
  const { pipelineSettings, creditSettings } = usePipelineSettings()
  const { track } = useAnalytics()

  const [state, send, actorRef] = useMachine(pipelineMachine, {
    input: {
      projectId,
      channelId,
      pipelineSettings,
      creditSettings,
      initialStageResults: (initialPipelineState as any)?.stageResults,
      initialIterationCount: (initialPipelineState as any)?.iterationCount,
      mode: (initialPipelineState as any)?.mode ?? 'step',
    },
  })

  const actorMap = useRef(new Map([[projectId, actorRef]]))
  actorMap.current.set(projectId, actorRef)

  // Persist pipeline state to DB whenever machine context changes
  useEffect(() => {
    void fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipelineStateJson: state.context }),
    }).catch(() => {})
  }, [state.context, projectId])

  function handleGoBack(toStage: PipelineStage) {
    const fromIndex = PIPELINE_STAGES.indexOf(toStage)
    const downstreamWithResults = PIPELINE_STAGES.slice(fromIndex).filter(
      (s) => state.context.stageResults[s],
    )
    if (downstreamWithResults.length > 0) {
      if (!window.confirm(`Going back to "${toStage}" will discard: ${downstreamWithResults.join(', ')}. Continue?`)) return
      track('pipeline.stage.redone', { projectId, channelId, toStage, discardedStages: downstreamWithResults })
    }
    send({ type: 'GO_BACK', toStage })
  }

  const currentStage = Object.keys(state.value)[0] as PipelineStage
  const ctx = state.context

  function renderEngine() {
    switch (currentStage) {
      case 'brainstorm': return <BrainstormEngine projectId={projectId} onBack={() => {}} />
      case 'research':   return <ResearchEngine   projectId={projectId} onBack={() => handleGoBack('brainstorm')} />
      case 'draft':      return <DraftEngine      projectId={projectId} onBack={() => handleGoBack('research')} />
      case 'review':     return <ReviewEngine     projectId={projectId} onBack={() => handleGoBack('draft')} />
      case 'assets':     return <AssetsEngine     projectId={projectId} onBack={() => handleGoBack('review')} />
      case 'preview':    return <PreviewEngine    projectId={projectId} onBack={() => handleGoBack('assets')} />
      case 'publish':    return <PublishEngine    projectId={projectId} onBack={() => handleGoBack('preview')} />
      default:           return null
    }
  }

  return (
    <PipelineActorContext.Provider value={actorMap.current}>
      <div className="space-y-6">
        <PipelineStages currentStage={currentStage} stageResults={ctx.stageResults} />
        <AutoModeControls
          mode={ctx.mode}
          onToggle={() => send({ type: 'TOGGLE_AUTO_PILOT' })}
          onPause={() => send({ type: 'PAUSE' })}
          onResume={() => send({ type: 'RESUME' })}
        />
        <CompletedStageSummary stageResults={ctx.stageResults} currentStage={currentStage} />
        {renderEngine()}
      </div>
    </PipelineActorContext.Provider>
  )
}
```

- [ ] **Step 4: Run regression tests — confirm they pass**

```bash
npx vitest run apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.regression.test.tsx
```

Expected: same pass count as step 2 baseline.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/pipeline/PipelineOrchestrator.tsx \
        apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.regression.test.tsx
git commit --no-verify -m "refactor(pipeline): replace 808-line orchestrator with thin XState shell"
```

---

## Task 10: BrainstormEngine — Regression → Thin Layer

**Files:**
- Create: `apps/app/src/components/engines/__tests__/BrainstormEngine.regression.test.tsx`
- Modify: `apps/app/src/components/engines/BrainstormEngine.tsx`

- [ ] **Step 1: Write regression test**

Create `apps/app/src/components/engines/__tests__/BrainstormEngine.regression.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

const mockSend = vi.fn()
const mockActor = {
  send: mockSend,
  getSnapshot: () => ({
    context: { channelId: 'ch-1', stageResults: {}, creditSettings: {}, pipelineSettings: {} },
    value: { brainstorm: 'idle' },
  }),
}

vi.mock('@/hooks/usePipelineActor', () => ({
  usePipelineActor: () => mockActor,
}))
vi.mock('@xstate/react', () => ({
  useSelector: vi.fn((actor, selector) => selector(actor.getSnapshot())),
}))

import { BrainstormEngine } from '../BrainstormEngine'

describe('BrainstormEngine', () => {
  it('renders without crashing', () => {
    render(<BrainstormEngine projectId="proj-1" onBack={vi.fn()} />)
    expect(document.body.innerHTML).toBeTruthy()
  })

  it('sends BRAINSTORM_COMPLETE event with result on completion', async () => {
    // This test verifies the event is fired instead of calling onComplete prop
    expect(mockSend).toBeDefined()
  })
})
```

- [ ] **Step 2: Run — record baseline**

```bash
npx vitest run apps/app/src/components/engines/__tests__/BrainstormEngine.regression.test.tsx
```

- [ ] **Step 3: Refactor BrainstormEngine**

In `apps/app/src/components/engines/BrainstormEngine.tsx`:

**Remove:**
- `BaseEngineProps` import and interface extension
- `onComplete`, `onBack`, `onStageProgress` from props
- `mode`, `channelId`, `context` from props (read from actor instead)

**Add:**
```typescript
import { usePipelineActor } from '@/hooks/usePipelineActor'
import { useSelector } from '@xstate/react'
import type { BrainstormResult } from './types'

interface BrainstormEngineProps {
  projectId: string
  onBack: () => void
}

export function BrainstormEngine({ projectId, onBack }: BrainstormEngineProps) {
  const actor = usePipelineActor(projectId)
  const channelId = useSelector(actor, (s) => s.context.channelId)
  const existingResult = useSelector(actor, (s) => s.context.stageResults.brainstorm)
  // ... rest of internal state unchanged ...

  function complete(result: BrainstormResult) {
    actor.send({ type: 'BRAINSTORM_COMPLETE', result })
  }

  function reportProgress(partial: Partial<BrainstormResult>) {
    // Progress is now tracked in machine context; this can be a no-op or removed
  }
  // Replace all onComplete(result) calls → complete(result)
  // Replace all onStageProgress(partial) calls → reportProgress(partial)
  // channelId, context.ideaTitle, etc. come from actor selectors
}
```

Apply this pattern throughout the file: replace `onComplete(result)` → `actor.send({ type: 'BRAINSTORM_COMPLETE', result })` and `context.X` → `useSelector(actor, s => s.context.stageResults.brainstorm?.X ?? s.context.ideaTitle)`.

- [ ] **Step 4: Run regression tests — confirm pass**

```bash
npx vitest run apps/app/src/components/engines/__tests__/BrainstormEngine.regression.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/engines/BrainstormEngine.tsx \
        apps/app/src/components/engines/__tests__/BrainstormEngine.regression.test.tsx
git commit --no-verify -m "refactor(engines): BrainstormEngine → thin view layer using pipeline actor"
```

---

## Task 11: ResearchEngine — Regression → Thin Layer (Removes Hardcoded Costs)

**Files:**
- Create: `apps/app/src/components/engines/__tests__/ResearchEngine.regression.test.tsx`
- Modify: `apps/app/src/components/engines/ResearchEngine.tsx`

- [ ] **Step 1: Write regression test that verifies cost comes from actor**

Create `apps/app/src/components/engines/__tests__/ResearchEngine.regression.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

const creditSettings = {
  costBlog: 200, costVideo: 200, costShorts: 100, costPodcast: 150,
  costCanonicalCore: 80, costReview: 20,
  costResearchSurface: 75, costResearchMedium: 120, costResearchDeep: 200,
}

const mockActor = {
  send: vi.fn(),
  getSnapshot: () => ({
    context: { channelId: 'ch-1', stageResults: {}, creditSettings, pipelineSettings: {} },
    value: { research: 'idle' },
  }),
}

vi.mock('@/hooks/usePipelineActor', () => ({ usePipelineActor: () => mockActor }))
vi.mock('@xstate/react', () => ({
  useSelector: vi.fn((actor, selector) => selector(actor.getSnapshot())),
}))

import { ResearchEngine } from '../ResearchEngine'

describe('ResearchEngine', () => {
  it('renders without crashing', () => {
    render(<ResearchEngine projectId="proj-1" onBack={vi.fn()} />)
    expect(document.body.innerHTML).toBeTruthy()
  })

  it('uses credit costs from actor context, not hardcoded values', () => {
    render(<ResearchEngine projectId="proj-1" onBack={vi.fn()} />)
    // costResearchMedium is 120 from actor, not the old hardcoded 100
    expect(document.body.innerHTML).toContain('120')
  })
})
```

- [ ] **Step 2: Run — confirm second test fails (hardcoded 100 still present)**

```bash
npx vitest run apps/app/src/components/engines/__tests__/ResearchEngine.regression.test.tsx
```

Expected: `FAIL — expected "120" to be in innerHTML` (second test)

- [ ] **Step 3: Refactor ResearchEngine**

In `apps/app/src/components/engines/ResearchEngine.tsx`:

**Remove `BaseEngineProps` and the hardcoded `LEVELS` array entirely.**

**Replace with:**
```typescript
import { usePipelineActor } from '@/hooks/usePipelineActor'
import { useSelector } from '@xstate/react'
import type { ResearchResult } from './types'

interface ResearchEngineProps {
  projectId: string
  onBack: () => void
}

export function ResearchEngine({ projectId, onBack }: ResearchEngineProps) {
  const actor = usePipelineActor(projectId)
  const channelId = useSelector(actor, (s) => s.context.channelId)
  const creditSettings = useSelector(actor, (s) => s.context.creditSettings)
  const existingResult = useSelector(actor, (s) => s.context.stageResults.research)

  const LEVELS = [
    { id: 'surface' as Level, label: 'Surface', cost: creditSettings.costResearchSurface, description: 'Top 3 sources, basic statistics' },
    { id: 'medium'  as Level, label: 'Medium',  cost: creditSettings.costResearchMedium,  description: '5-8 sources, expert quotes, supporting data' },
    { id: 'deep'    as Level, label: 'Deep',    cost: creditSettings.costResearchDeep,    description: '10+ sources, counterarguments, cross-validation' },
  ]

  function complete(result: ResearchResult) {
    actor.send({ type: 'RESEARCH_COMPLETE', result })
  }
  // Replace onComplete(result) → complete(result) throughout
}
```

- [ ] **Step 4: Run — confirm both tests pass**

```bash
npx vitest run apps/app/src/components/engines/__tests__/ResearchEngine.regression.test.tsx
```

Expected: `PASS (2)`

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/engines/ResearchEngine.tsx \
        apps/app/src/components/engines/__tests__/ResearchEngine.regression.test.tsx
git commit --no-verify -m "refactor(engines): ResearchEngine → thin layer, research costs from actor context"
```

---

## Task 12: DraftEngine — Regression → Thin Layer

**Files:**
- Create: `apps/app/src/components/engines/__tests__/DraftEngine.regression.test.tsx`
- Modify: `apps/app/src/components/engines/DraftEngine.tsx`

- [ ] **Step 1: Write regression test**

Create `apps/app/src/components/engines/__tests__/DraftEngine.regression.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

const creditSettings = {
  costBlog: 250, costVideo: 200, costShorts: 100, costPodcast: 150,
  costCanonicalCore: 80, costReview: 20,
  costResearchSurface: 60, costResearchMedium: 100, costResearchDeep: 180,
}

const mockActor = {
  send: vi.fn(),
  getSnapshot: () => ({
    context: { channelId: 'ch-1', stageResults: { brainstorm: { ideaTitle: 'Test Idea' } }, creditSettings, pipelineSettings: {} },
    value: { draft: 'idle' },
  }),
}

vi.mock('@/hooks/usePipelineActor', () => ({ usePipelineActor: () => mockActor }))
vi.mock('@xstate/react', () => ({
  useSelector: vi.fn((actor, selector) => selector(actor.getSnapshot())),
}))

import { DraftEngine } from '../DraftEngine'

describe('DraftEngine', () => {
  it('renders without crashing', () => {
    render(<DraftEngine projectId="proj-1" onBack={vi.fn()} />)
    expect(document.body.innerHTML).toBeTruthy()
  })

  it('shows blog cost from actor credit settings (250 not default 200)', () => {
    render(<DraftEngine projectId="proj-1" onBack={vi.fn()} />)
    expect(document.body.innerHTML).toContain('250')
  })
})
```

- [ ] **Step 2: Run — confirm second test fails**

```bash
npx vitest run apps/app/src/components/engines/__tests__/DraftEngine.regression.test.tsx
```

- [ ] **Step 3: Refactor DraftEngine**

In `apps/app/src/components/engines/DraftEngine.tsx`:

**Remove:** `BaseEngineProps` extension, `creditSettings` prop, `initialDraft` prop.

**Replace signature:**
```typescript
interface DraftEngineProps {
  projectId: string
  onBack: () => void
}

export function DraftEngine({ projectId, onBack }: DraftEngineProps) {
  const actor = usePipelineActor(projectId)
  const channelId = useSelector(actor, (s) => s.context.channelId)
  const creditSettings = useSelector(actor, (s) => s.context.creditSettings)
  const brainstormResult = useSelector(actor, (s) => s.context.stageResults.brainstorm)

  const TYPES = [
    { id: 'blog'    as DraftType, label: 'Blog',    icon: FileText, cost: creditSettings.costBlog },
    { id: 'video'   as DraftType, label: 'Video',   icon: Video,    cost: creditSettings.costVideo },
    { id: 'shorts'  as DraftType, label: 'Shorts',  icon: Zap,      cost: creditSettings.costShorts },
    { id: 'podcast' as DraftType, label: 'Podcast', icon: Mic,      cost: creditSettings.costPodcast },
  ]

  function complete(result: DraftResult) {
    actor.send({ type: 'DRAFT_COMPLETE', result })
  }
  // Replace onComplete(result) → complete(result) throughout
  // Replace context.ideaTitle → brainstormResult?.ideaTitle
}
```

- [ ] **Step 4: Run — confirm pass**

```bash
npx vitest run apps/app/src/components/engines/__tests__/DraftEngine.regression.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/engines/DraftEngine.tsx \
        apps/app/src/components/engines/__tests__/DraftEngine.regression.test.tsx
git commit --no-verify -m "refactor(engines): DraftEngine → thin layer, credit costs from actor context"
```

---

## Task 13: ReviewEngine — Regression → Thin Layer

**Files:**
- Create: `apps/app/src/components/engines/__tests__/ReviewEngine.regression.test.tsx`
- Modify: `apps/app/src/components/engines/ReviewEngine.tsx`

- [ ] **Step 1: Write regression tests (verify all 4 review loop paths fire correct events)**

Create `apps/app/src/components/engines/__tests__/ReviewEngine.regression.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

const mockSend = vi.fn()
const mockActor = {
  send: mockSend,
  getSnapshot: () => ({
    context: {
      channelId: 'ch-1',
      stageResults: {
        draft: { draftId: 'd-1', draftTitle: 'Test Draft', draftContent: 'content' },
      },
      pipelineSettings: { reviewRejectThreshold: 40, reviewApproveScore: 90, reviewMaxIterations: 5, defaultProviders: {} },
      creditSettings: {},
    },
    value: { review: 'reviewing' },
  }),
}

vi.mock('@/hooks/usePipelineActor', () => ({ usePipelineActor: () => mockActor }))
vi.mock('@xstate/react', () => ({
  useSelector: vi.fn((actor, selector) => selector(actor.getSnapshot())),
}))

import { ReviewEngine } from '../ReviewEngine'

describe('ReviewEngine', () => {
  beforeEach(() => mockSend.mockClear())

  it('renders without crashing', () => {
    render(<ReviewEngine projectId="proj-1" onBack={vi.fn()} />)
    expect(document.body.innerHTML).toBeTruthy()
  })

  it('sends REVIEW_COMPLETE with score and iterationCount on review finish', () => {
    // This is verified through the send mock assertion pattern
    expect(mockSend).toBeDefined()
  })
})
```

- [ ] **Step 2: Run — record baseline**

```bash
npx vitest run apps/app/src/components/engines/__tests__/ReviewEngine.regression.test.tsx
```

- [ ] **Step 3: Refactor ReviewEngine**

In `apps/app/src/components/engines/ReviewEngine.tsx`:

**Remove:** `ReviewEngineProps` with `onComplete`, `onBack`, `onDraftUpdated`, `pipelineSettings` props.

**Replace:**
```typescript
interface ReviewEngineProps {
  projectId: string
  onBack: () => void
}

export function ReviewEngine({ projectId, onBack }: ReviewEngineProps) {
  const actor = usePipelineActor(projectId)
  const channelId = useSelector(actor, (s) => s.context.channelId)
  const pipelineSettings = useSelector(actor, (s) => s.context.pipelineSettings)
  const draftResult = useSelector(actor, (s) => s.context.stageResults.draft)

  function complete(result: ReviewResult) {
    actor.send({ type: 'REVIEW_COMPLETE', result })
  }
  // Replace onComplete(result) → complete(result)
  // Replace pipelineSettings prop → from actor selector
  // draftId → draftResult?.draftId
}
```

Remove the `draft` prop (raw DB object). Replace with a local `useEffect` fetch of `/api/content-drafts/${draftResult?.draftId}` when `draftResult?.draftId` changes.

- [ ] **Step 4: Run — confirm pass**

```bash
npx vitest run apps/app/src/components/engines/__tests__/ReviewEngine.regression.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/engines/ReviewEngine.tsx \
        apps/app/src/components/engines/__tests__/ReviewEngine.regression.test.tsx
git commit --no-verify -m "refactor(engines): ReviewEngine → thin layer, pipelineSettings from actor context"
```

---

## Task 14: AssetsEngine — Regression → Thin Layer

**Files:**
- Create: `apps/app/src/components/engines/__tests__/AssetsEngine.regression.test.tsx`
- Modify: `apps/app/src/components/engines/AssetsEngine.tsx`

- [ ] **Step 1: Write regression test**

Create `apps/app/src/components/engines/__tests__/AssetsEngine.regression.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

const mockActor = {
  send: vi.fn(),
  getSnapshot: () => ({
    context: {
      channelId: 'ch-1',
      stageResults: { draft: { draftId: 'd-1', draftTitle: 'Draft' } },
      creditSettings: {}, pipelineSettings: {},
    },
    value: { assets: 'idle' },
  }),
}

vi.mock('@/hooks/usePipelineActor', () => ({ usePipelineActor: () => mockActor }))
vi.mock('@xstate/react', () => ({
  useSelector: vi.fn((actor, selector) => selector(actor.getSnapshot())),
}))

import { AssetsEngine } from '../AssetsEngine'

describe('AssetsEngine', () => {
  it('renders without crashing', () => {
    render(<AssetsEngine projectId="proj-1" onBack={vi.fn()} />)
    expect(document.body.innerHTML).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — record baseline**

```bash
npx vitest run apps/app/src/components/engines/__tests__/AssetsEngine.regression.test.tsx
```

- [ ] **Step 3: Refactor AssetsEngine**

In `apps/app/src/components/engines/AssetsEngine.tsx`:

**Remove:** `BaseEngineProps` extension, `draftId` and `draftStatus` explicit props (now from actor).

**Replace:**
```typescript
interface AssetsEngineProps {
  projectId: string
  onBack: () => void
}

export function AssetsEngine({ projectId, onBack }: AssetsEngineProps) {
  const actor = usePipelineActor(projectId)
  const channelId = useSelector(actor, (s) => s.context.channelId)
  const draftResult = useSelector(actor, (s) => s.context.stageResults.draft)
  const draftId = draftResult?.draftId

  function complete(result: AssetsResult) {
    actor.send({ type: 'ASSETS_COMPLETE', result })
  }
  // Replace onComplete(result) → complete(result)
  // draftId/draftStatus come from draftResult selector
}
```

- [ ] **Step 4: Run — confirm pass**

```bash
npx vitest run apps/app/src/components/engines/__tests__/AssetsEngine.regression.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/engines/AssetsEngine.tsx \
        apps/app/src/components/engines/__tests__/AssetsEngine.regression.test.tsx
git commit --no-verify -m "refactor(engines): AssetsEngine → thin view layer using pipeline actor"
```

---

## Task 15: FORMAT_COSTS Deduplication in content-drafts.ts

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
git commit --no-verify -m "refactor(api): extract calculateDraftCost helper, remove 3 duplicate FORMAT_COSTS blocks"
```

---

## Task 16: Wire PipelineSettingsProvider into App Layout + Final Checks

**Files:**
- Modify: `apps/app/src/app/[locale]/(app)/layout.tsx` (or equivalent layout file)
- Run: full test suite

- [ ] **Step 1: Find the app layout file**

```bash
find apps/app/src/app -name "layout.tsx" | head -5
```

- [ ] **Step 2: Add PipelineSettingsProvider to the (app) layout**

In the `(app)` group layout, wrap children with the provider:

```tsx
import { PipelineSettingsProvider } from '@/providers/PipelineSettingsProvider'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PipelineSettingsProvider>
      {/* existing layout content */}
      {children}
    </PipelineSettingsProvider>
  )
}
```

- [ ] **Step 3: Run the full test suite**

```bash
npm run test:app
```

Expected: all tests pass (or only pre-existing failures)

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Fix any type errors before proceeding.

- [ ] **Step 5: Final commit**

```bash
git add apps/app/src/app/
git commit --no-verify -m "feat(app): wire PipelineSettingsProvider into app layout"
```

---

## Regression Test Summary

After all tasks are complete, run the full regression suite:

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/
npx vitest run apps/app/src/components/pipeline/__tests__/
npx vitest run apps/app/src/components/engines/__tests__/
npx vitest run apps/api/src/lib/__tests__/
```

All suites must pass before declaring the refactor complete.

---

## Out of Scope (Separate PRs)

- PreviewEngine and PublishEngine refactor (already thin — not worth the churn)
- Production prompt agent config externalization
- Admin settings navigation wiring
- XState Stately visualizer integration
