# Autopilot Foundation, Gates & Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Overview-mode autopilot demonstrably run a project through brainstorm → publish without user input on the happy path. Add configurable gates for assets/preview/publish, per-iteration review tracking, and a project-creation flow with channel picker. Verify the templates flow end-to-end.

**Architecture:** Browser-hidden engines in overview mode (`display:none` wrapper); engines hydrate local form state from `actor.context.autopilotConfig` on mount; STAGE_PROGRESS events drive a Live Console UI; new wizard fields (assets 3-mode, preview switch, publish status) gated through `pendingDrillIn` machine context.

**Tech Stack:** XState v5, @xstate/react v5, React 19, Next.js 16 App Router, Vitest 4, @testing-library/react, Playwright (apps/app/e2e), shadcn/ui, react-hook-form + zodResolver, Zod.

**Design spec:** [`../specs/2026-04-29-autopilot-foundation-gates-templates-design.md`](../specs/2026-04-29-autopilot-foundation-gates-templates-design.md) — read before starting.

**Branch:** all work commits to `feat/pipeline-autopilot-wizard-impl`. No feature branches off this. Single PR at the end.

---

## Pre-flight

- [ ] Confirm branch is `feat/pipeline-autopilot-wizard-impl` and clean: `git status` shows nothing staged.
- [ ] Confirm dev DB schema matches: `npm run db:types` produces no diff.
- [ ] Run baseline tests: `npm run test 2>&1 | tee /tmp/baseline-pre-foundation.log`. Save the failure list — these are pre-existing and excluded from acceptance gates:

```bash
grep -E '^( FAIL )' /tmp/baseline-pre-foundation.log | sort -u > docs/superpowers/specs/2026-04-29-test-baseline.txt
```

The acceptance gates compare against this file. If a test in the baseline starts passing, that's fine; only NEW failures fail the gate.

---

## Wave 1 — Spec 1: Autopilot Foundation

**Scope:** Engine hydration from `autopilotConfig`; hidden engine wrapper in overview mode; STAGE_PROGRESS protocol; Live Console UI; happy-path RTL test.

**Exit criteria:**
- All Wave 1 RTL tests green.
- `OverviewProgressRail.tsx` and `OverviewStageResults.tsx` deleted.
- Manual smoke: open a fresh overview-mode project after wizard submit; brainstorm card cycles `pending → running → completed` with status text within ~30s; subsequent stages follow.
- `npm run typecheck` + `npm run test` (vs baseline) + `npm run lint` + `npm run build` all green.

### Task 1.1: `hydrateEngineFromConfig` module + unit tests

**Files:**
- Create: `apps/app/src/lib/pipeline/hydrateEngineFromConfig.ts`
- Create: `apps/app/src/lib/pipeline/__tests__/hydrateEngineFromConfig.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/app/src/lib/pipeline/__tests__/hydrateEngineFromConfig.test.ts
import { describe, it, expect } from 'vitest'
import {
  hydrateBrainstormFromConfig,
  hydrateResearchFromConfig,
  hydrateDraftFromConfig,
  hydrateReviewFromConfig,
} from '../hydrateEngineFromConfig'
import type { AutopilotConfig } from '@brighttale/shared'

const fullConfig: AutopilotConfig = {
  defaultProvider: 'recommended',
  brainstorm: {
    providerOverride: null,
    mode: 'topic_driven',
    topic: 'AI agents in 2026',
    referenceUrl: null,
    niche: 'enterprise',
    tone: 'analytical',
    audience: 'developers',
    goal: 'inform',
    constraints: 'no jargon',
  },
  research: { providerOverride: null, depth: 'medium' },
  canonicalCore: { providerOverride: null, personaId: 'p1' },
  draft: { providerOverride: null, format: 'blog', wordCount: 1500 },
  review: {
    providerOverride: null,
    maxIterations: 5,
    autoApproveThreshold: 90,
    hardFailThreshold: 40,
  },
  assets: { providerOverride: null, mode: 'skip' },
  // preview, publish added in Wave 2 — Wave 1 omits them
} as AutopilotConfig

describe('hydrateBrainstormFromConfig', () => {
  it('returns full state when config is populated', () => {
    expect(hydrateBrainstormFromConfig(fullConfig)).toEqual({
      mode: 'topic_driven',
      topic: 'AI agents in 2026',
      referenceUrl: '',
      niche: 'enterprise',
      tone: 'analytical',
      audience: 'developers',
      goal: 'inform',
      constraints: 'no jargon',
    })
  })

  it('returns empty object when config is null (legacy)', () => {
    expect(hydrateBrainstormFromConfig(null)).toEqual({})
  })

  it('returns empty object when brainstorm slot is null (completed stage)', () => {
    const cfg = { ...fullConfig, brainstorm: null } as AutopilotConfig
    expect(hydrateBrainstormFromConfig(cfg)).toEqual({})
  })
})

describe('hydrateResearchFromConfig', () => {
  it('returns researchDepth from depth', () => {
    expect(hydrateResearchFromConfig(fullConfig)).toEqual({ researchDepth: 'medium' })
  })
  it('null config → empty', () => {
    expect(hydrateResearchFromConfig(null)).toEqual({})
  })
})

describe('hydrateDraftFromConfig', () => {
  it('returns draft + canonicalCore fields', () => {
    expect(hydrateDraftFromConfig(fullConfig)).toEqual({
      format: 'blog',
      wordCount: 1500,
      selectedPersonaId: 'p1',
    })
  })
  it('null personaId stays null', () => {
    const cfg = { ...fullConfig, canonicalCore: { providerOverride: null, personaId: null } }
    expect(hydrateDraftFromConfig(cfg as AutopilotConfig)).toEqual({
      format: 'blog',
      wordCount: 1500,
      selectedPersonaId: null,
    })
  })
})

describe('hydrateReviewFromConfig', () => {
  it('passes review thresholds for the engine to render', () => {
    expect(hydrateReviewFromConfig(fullConfig)).toEqual({
      maxIterations: 5,
      autoApproveThreshold: 90,
      hardFailThreshold: 40,
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/app && npx vitest run src/lib/pipeline/__tests__/hydrateEngineFromConfig.test.ts
```

Expected: FAIL with "Cannot find module" for `../hydrateEngineFromConfig`.

- [ ] **Step 3: Write the module**

```ts
// apps/app/src/lib/pipeline/hydrateEngineFromConfig.ts
import type { AutopilotConfig } from '@brighttale/shared'

export interface BrainstormHydration {
  mode: 'topic_driven' | 'reference_guided'
  topic: string
  referenceUrl: string
  niche: string
  tone: string
  audience: string
  goal: string
  constraints: string
}

export function hydrateBrainstormFromConfig(
  config: AutopilotConfig | null,
): Partial<BrainstormHydration> {
  if (!config?.brainstorm) return {}
  const b = config.brainstorm
  return {
    mode: b.mode,
    topic: b.topic ?? '',
    referenceUrl: b.referenceUrl ?? '',
    niche: b.niche ?? '',
    tone: b.tone ?? '',
    audience: b.audience ?? '',
    goal: b.goal ?? '',
    constraints: b.constraints ?? '',
  }
}

export interface ResearchHydration {
  researchDepth: 'surface' | 'medium' | 'deep'
}

export function hydrateResearchFromConfig(
  config: AutopilotConfig | null,
): Partial<ResearchHydration> {
  if (!config?.research) return {}
  return { researchDepth: config.research.depth }
}

export interface DraftHydration {
  format: 'blog' | 'video' | 'shorts' | 'podcast'
  wordCount: number | null
  selectedPersonaId: string | null
}

export function hydrateDraftFromConfig(
  config: AutopilotConfig | null,
): Partial<DraftHydration> {
  if (!config) return {}
  return {
    format: config.draft.format,
    wordCount: config.draft.wordCount ?? null,
    selectedPersonaId: config.canonicalCore.personaId,
  }
}

export interface ReviewHydration {
  maxIterations: number
  autoApproveThreshold: number
  hardFailThreshold: number
}

export function hydrateReviewFromConfig(
  config: AutopilotConfig | null,
): Partial<ReviewHydration> {
  if (!config) return {}
  return {
    maxIterations: config.review.maxIterations,
    autoApproveThreshold: config.review.autoApproveThreshold,
    hardFailThreshold: config.review.hardFailThreshold,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/app && npx vitest run src/lib/pipeline/__tests__/hydrateEngineFromConfig.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/lib/pipeline/hydrateEngineFromConfig.ts \
        apps/app/src/lib/pipeline/__tests__/hydrateEngineFromConfig.test.ts
git commit -m "feat(pipeline): hydrateEngineFromConfig pure helpers + unit tests"
```

### Task 1.2: BrainstormEngine reads hydration on mount

**Files:**
- Modify: `apps/app/src/components/engines/BrainstormEngine.tsx`
- Modify: `apps/app/src/components/engines/__tests__/BrainstormEngine.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `BrainstormEngine.test.tsx`:

```tsx
// New test in the existing describe('BrainstormEngine', ...) block
it('hydrates topic + niche from autopilotConfig.brainstorm on mount', () => {
  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'proj-1',
      channelId: 'ch-1',
      projectTitle: 'T',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
    },
  }).start()
  actor.send({
    type: 'SETUP_COMPLETE',
    mode: 'overview',
    autopilotConfig: {
      defaultProvider: 'recommended',
      brainstorm: {
        providerOverride: null,
        mode: 'topic_driven',
        topic: 'AI agents in 2026',
        referenceUrl: null,
        niche: 'enterprise',
        tone: '', audience: '', goal: '', constraints: '',
      },
      research: { providerOverride: null, depth: 'medium' },
      canonicalCore: { providerOverride: null, personaId: null },
      draft: { providerOverride: null, format: 'blog', wordCount: 1500 },
      review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 },
      assets: { providerOverride: null, mode: 'skip' },
    } as never,
    templateId: null,
    startStage: 'brainstorm',
  })

  render(
    <PipelineActorProvider value={actor}>
      <BrainstormEngine mode="generate" />
    </PipelineActorProvider>,
  )

  expect((screen.getByLabelText(/topic/i) as HTMLInputElement).value)
    .toBe('AI agents in 2026')
  expect((screen.getByLabelText(/niche/i) as HTMLInputElement).value)
    .toBe('enterprise')
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd apps/app && npx vitest run src/components/engines/__tests__/BrainstormEngine.test.tsx
```

Expected: FAIL — topic input value is empty (no hydration yet).

- [ ] **Step 3: Add hydration to BrainstormEngine**

In `apps/app/src/components/engines/BrainstormEngine.tsx`, add the import:

```tsx
import { hydrateBrainstormFromConfig } from '@/lib/pipeline/hydrateEngineFromConfig'
import { useSelector } from '@xstate/react'
```

Find the existing "Initialize from initial values" `useEffect` (around line 189) and add a new `useEffect` ABOVE it that runs first:

```tsx
// Hydrate from autopilotConfig once on mount. Runs BEFORE the localStorage
// restore so wizard inputs take precedence over stale localStorage state
// for fresh autopilot runs. localStorage restore won't fire for fresh
// autopilot because initialSession is undefined.
const autopilotConfig = useSelector(actor, (s) => s.context.autopilotConfig)
useEffect(() => {
  const hydration = hydrateBrainstormFromConfig(autopilotConfig)
  if (Object.keys(hydration).length === 0) return
  if (hydration.mode !== undefined) setMode(hydration.mode === 'topic_driven' ? 'topic_driven' : 'reference_guided')
  if (hydration.topic !== undefined) setTopic(hydration.topic)
  if (hydration.niche !== undefined) setNiche(hydration.niche)
  if (hydration.tone !== undefined) setTone(hydration.tone)
  if (hydration.audience !== undefined) setAudience(hydration.audience)
  if (hydration.goal !== undefined) setGoal(hydration.goal)
  if (hydration.constraints !== undefined) setConstraints(hydration.constraints)
  if (hydration.referenceUrl !== undefined) setReferenceUrl(hydration.referenceUrl)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

- [ ] **Step 4: Run all BrainstormEngine tests**

```bash
cd apps/app && npx vitest run src/components/engines/__tests__/BrainstormEngine.test.tsx
```

Expected: all tests pass (4 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/engines/BrainstormEngine.tsx \
        apps/app/src/components/engines/__tests__/BrainstormEngine.test.tsx
git commit -m "feat(pipeline): BrainstormEngine hydrates from autopilotConfig"
```

### Task 1.3: ResearchEngine hydration + auto-approve in overview

**Files:**
- Modify: `apps/app/src/components/engines/ResearchEngine.tsx`
- Modify: `apps/app/src/components/engines/__tests__/ResearchEngine.test.tsx` (or create if absent)

- [ ] **Step 1: Find current researchDepth state in `ResearchEngine.tsx`**

```bash
grep -n "researchDepth\|setDepth\|useState.*'medium'" apps/app/src/components/engines/ResearchEngine.tsx | head
```

Note the existing depth state variable name. The hydrator uses `researchDepth` — match the engine's actual variable.

- [ ] **Step 2: Write/extend the test**

If `ResearchEngine.test.tsx` doesn't exist, create it with the same fixture pattern as `BrainstormEngine.test.tsx`. Add:

```tsx
it('hydrates researchDepth from autopilotConfig.research.depth on mount', () => {
  // Build actor with autopilotConfig.research.depth = 'deep'
  // ... (mirror BrainstormEngine pattern)
  render(<PipelineActorProvider value={actor}><ResearchEngine mode="generate" /></PipelineActorProvider>)
  // Use a stable testid you'll add to ResearchEngine: <span data-testid="research-depth">{depth}</span>
  // OR query a select trigger if one exists.
  expect(screen.getByTestId('research-depth')).toHaveTextContent('deep')
})

it('auto-approves all generated cards when mode === "overview"', async () => {
  // Mock /api/research-sessions to return 5 cards.
  // Set actor mode='overview', autopilotConfig populated.
  // Mount ResearchEngine, wait for cards to load.
  // Assert RESEARCH_COMPLETE was dispatched with approvedCardsCount=5 (all of them).
})
```

- [ ] **Step 3: Run test, verify it fails**

- [ ] **Step 4: Add hydration**

In `ResearchEngine.tsx`:

```tsx
import { hydrateResearchFromConfig } from '@/lib/pipeline/hydrateEngineFromConfig'
import { useSelector } from '@xstate/react'

// Inside component, near other state:
const autopilotConfig = useSelector(actor, (s) => s.context.autopilotConfig)
useEffect(() => {
  const h = hydrateResearchFromConfig(autopilotConfig)
  if (h.researchDepth !== undefined) {
    setResearchDepth(h.researchDepth) // adapt name if differs
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

- [ ] **Step 5: Add auto-approve-all in overview mode**

Find the existing `useAutoPilotTrigger` for research and the place where cards are loaded. Add a follow-up effect:

```tsx
const mode = useSelector(actor, (s) => s.context.mode)
const paused = useSelector(actor, (s) => s.context.paused)
const autoApprovedRef = useRef(false)
useEffect(() => {
  if (mode !== 'overview' || paused) return
  if (autoApprovedRef.current) return
  if (!cards || cards.length === 0) return
  // Auto-approve all cards in overview mode (per spec §6.3 / Q1 = a)
  autoApprovedRef.current = true
  const approvedIds = cards.map((c) => c.id)
  void approveAndDispatch(approvedIds) // existing function; verify signature
}, [mode, paused, cards])
```

If `approveAndDispatch` doesn't exist in the engine, find the function that fires `RESEARCH_COMPLETE` after manual approval and call it directly with all card IDs.

- [ ] **Step 6: Run tests, verify they pass**

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/components/engines/ResearchEngine.tsx \
        apps/app/src/components/engines/__tests__/ResearchEngine.test.tsx
git commit -m "feat(pipeline): ResearchEngine hydrates depth + auto-approves all in overview"
```

### Task 1.4: DraftEngine hydration

**Files:**
- Modify: `apps/app/src/components/engines/DraftEngine.tsx`
- Modify: `apps/app/src/components/engines/__tests__/DraftEngine.test.tsx` (or create)

- [ ] **Step 1: Write the failing test**

```tsx
it('hydrates format + wordCount + selectedPersonaId from autopilotConfig on mount', () => {
  // Build actor with autopilotConfig populated:
  //   draft.format = 'video'
  //   draft.wordCount = 800
  //   canonicalCore.personaId = 'p-tech-analyst'
  // Mount DraftEngine inside PipelineActorProvider.
  expect((screen.getByLabelText(/format/i) as HTMLSelectElement).value).toBe('video')
  expect((screen.getByLabelText(/word count/i) as HTMLInputElement).value).toBe('800')
  // The persona Select needs a testid: data-testid="persona-select"
  expect(screen.getByTestId('persona-select')).toHaveTextContent(/Tech Analyst/i)
})
```

- [ ] **Step 2: Run test, verify it fails**

- [ ] **Step 3: Add hydration**

In `DraftEngine.tsx`:

```tsx
import { hydrateDraftFromConfig } from '@/lib/pipeline/hydrateEngineFromConfig'
import { useSelector } from '@xstate/react'

const autopilotConfig = useSelector(actor, (s) => s.context.autopilotConfig)
useEffect(() => {
  const h = hydrateDraftFromConfig(autopilotConfig)
  if (h.format !== undefined) setFormat(h.format)
  if (h.wordCount !== undefined && h.wordCount !== null) setWordCount(h.wordCount)
  if (h.selectedPersonaId !== undefined) setSelectedPersonaId(h.selectedPersonaId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(pipeline): DraftEngine hydrates format/wordCount/personaId from config"
```

### Task 1.5: ReviewEngine guard wiring verification + STAGE_PROGRESS

**Files:**
- Modify: `apps/app/src/components/engines/ReviewEngine.tsx`
- Modify: `apps/app/src/lib/pipeline/__tests__/machine.test.ts` (extend existing test)

- [ ] **Step 1: Verify guard wiring**

```bash
grep -n "hasReachedMaxIterationsGuard\|isApprovedGuard\|isRejectedGuard\|autopilotConfig.review" apps/app/src/lib/pipeline/guards.ts
```

Confirm the three guards read from `context.autopilotConfig.review.{maxIterations, autoApproveThreshold, hardFailThreshold}` — NOT from `pipelineSettings`. If they read from settings, fix:

```ts
// guards.ts
export function isApprovedGuard({ context, event }: { context: PipelineMachineContext; event: any }): boolean {
  const score = (event as { result?: { score?: number } })?.result?.score
  if (typeof score !== 'number') return false
  const threshold = context.autopilotConfig?.review.autoApproveThreshold
    ?? context.pipelineSettings.reviewApproveScore
  return score >= threshold
}
// (similar for isRejectedGuard ↔ hardFailThreshold, hasReachedMaxIterationsGuard ↔ maxIterations)
```

- [ ] **Step 2: Add STAGE_PROGRESS emits in ReviewEngine**

In `ReviewEngine.tsx`, find where review iteration starts. Add:

```tsx
const iterationCount = useSelector(actor, (s) => s.context.iterationCount)
const maxIterations = useSelector(
  actor,
  (s) => s.context.autopilotConfig?.review.maxIterations ?? 5,
)

// When review starts (existing code):
actor.send({
  type: 'STAGE_PROGRESS',
  stage: 'review',
  partial: {
    status: `Iteration ${iterationCount + 1}/${maxIterations}: scoring`,
    current: iterationCount,
    total: maxIterations,
  },
})
```

- [ ] **Step 3: Add a unit test that exercises the guards against autopilotConfig**

Append to `machine.test.ts`:

```ts
it('isApprovedGuard reads autoApproveThreshold from autopilotConfig', () => {
  const ctx = {
    autopilotConfig: {
      ...minimalConfig,
      review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 85, hardFailThreshold: 40 },
    },
    pipelineSettings: { reviewApproveScore: 90 } as any,
  } as PipelineMachineContext
  expect(isApprovedGuard({ context: ctx, event: { type: 'REVIEW_COMPLETE', result: { score: 86 } } })).toBe(true)
  expect(isApprovedGuard({ context: ctx, event: { type: 'REVIEW_COMPLETE', result: { score: 84 } } })).toBe(false)
})
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(pipeline): ReviewEngine STAGE_PROGRESS + guards read autopilotConfig"
```

### Task 1.6: PublishEngine wpStatus from config + STAGE_PROGRESS

**Files:**
- Modify: `apps/app/src/components/engines/PublishEngine.tsx`

For Spec 1, default to `'draft'` regardless of config (Spec 2 wires the real switch). Just add STAGE_PROGRESS for the Live Console.

- [ ] **Step 1: Add STAGE_PROGRESS emits**

```tsx
// On publish start
actor.send({ type: 'STAGE_PROGRESS', stage: 'publish', partial: { status: 'Publishing to WordPress' } })
// On WP success — let *_COMPLETE overwrite
```

- [ ] **Step 2: Verify default behavior unchanged**

Run existing PublishEngine tests:

```bash
cd apps/app && npx vitest run src/components/engines/__tests__/PublishEngine.test.tsx
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(pipeline): PublishEngine emits STAGE_PROGRESS for Live Console"
```

### Task 1.7: Hidden engine wrapper in overview mode

**Files:**
- Modify: `apps/app/src/components/pipeline/PipelineOrchestrator.tsx`
- Modify: `apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.behavior.test.tsx`

- [ ] **Step 1: Update the failing tests for overview branch**

The existing test "renders <PipelineOverview /> AND the current-stage engine when mode='overview'" expects both visible. Change the assertion to: overview is visible, engine DOM is present but `display:none`.

```tsx
it("renders <PipelineOverview /> + current-stage engine hidden in overview mode", () => {
  render(<PipelineOrchestrator projectId="p" channelId="c" projectTitle="Test" initialPipelineState={overviewState()} />)
  expect(screen.getByTestId('pipeline-overview')).toBeVisible()
  const draftEngine = screen.getByTestId('draft-engine')
  expect(draftEngine).toBeInTheDocument()
  // Hidden via display:none on the wrapper
  const wrapper = draftEngine.closest('[data-testid="hidden-engine-wrapper"]')
  expect(wrapper).toHaveStyle({ display: 'none' })
})

it("setShowEngine flips wrapper visible; overview hides", async () => {
  render(<PipelineOrchestrator projectId="p" channelId="c" projectTitle="Test" initialPipelineState={overviewState()} />)
  fireEvent.click(screen.getByTestId('open-draft-engine'))
  await waitFor(() => {
    expect(screen.getByTestId('draft-engine')).toBeVisible()
    expect(screen.queryByTestId('pipeline-overview')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Update the orchestrator render branch**

Replace the current overview render block with:

```tsx
{ctx.mode === 'overview' && !showEngine ? (
  <>
    <PipelineOverview setShowEngine={(stage) => setShowEngine(stage as PipelineStage)} />
    <div data-testid="hidden-engine-wrapper" style={{ display: 'none' }} aria-hidden="true">
      {renderEngine(stageToRender)}
    </div>
  </>
) : (
  <>
    {showEngine && ctx.mode === 'overview' && (
      <Button
        variant="ghost"
        size="sm"
        className="mb-2"
        data-testid="back-to-overview"
        onClick={() => setShowEngine(null)}
      >
        ← Back to overview
      </Button>
    )}
    {renderEngine(stageToRender)}
  </>
)}
```

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(pipeline): hide engine in overview mode; restore on showEngine drill-in"
```

### Task 1.8: Live Console UI — replace OverviewProgressRail/StageResults

**Files:**
- Create: `apps/app/src/components/pipeline/OverviewTimeline.tsx`
- Create: `apps/app/src/components/pipeline/StageRow.tsx`
- Create: `apps/app/src/components/pipeline/LiveActivityLog.tsx`
- Modify: `apps/app/src/components/pipeline/PipelineOverview.tsx` (use new components)
- Delete: `apps/app/src/components/pipeline/OverviewProgressRail.tsx`
- Delete: `apps/app/src/components/pipeline/OverviewStageResults.tsx`
- Modify: `apps/app/src/components/pipeline/__tests__/PipelineOverview.test.tsx` (rewrite against new structure)

- [ ] **Step 1: Write `StageRow` + tests**

```tsx
// apps/app/src/components/pipeline/StageRow.tsx
'use client'
import { Check, CircleDashed, Loader2, Minus } from 'lucide-react'
import type { PipelineStage } from '@/components/engines/types'

export type StageRowState = 'pending' | 'running' | 'completed' | 'skipped'

interface StageRowProps {
  stage: PipelineStage
  label: string
  state: StageRowState
  status?: string
  current?: number
  total?: number
  detail?: string
  summary?: string
  onOpenEngine?: () => void
}

export function StageRow({ stage, label, state, status, current, total, detail, summary, onOpenEngine }: StageRowProps) {
  const Icon = state === 'completed' ? Check
            : state === 'running'   ? Loader2
            : state === 'skipped'   ? Minus
            :                          CircleDashed
  return (
    <div data-testid={`stage-row-${stage}`} className={state === 'running' ? 'border-l-2 border-primary pl-3 py-1.5 animate-pulse' : 'pl-3 py-1.5'}>
      <div className="flex items-center gap-2">
        <Icon className={state === 'running' ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        <span className="font-medium text-sm">{label}</span>
        {state === 'completed' && summary && <span className="text-xs text-muted-foreground">{summary}</span>}
        {onOpenEngine && state === 'completed' && (
          <button onClick={onOpenEngine} className="ml-auto text-xs text-primary hover:underline">Open engine →</button>
        )}
      </div>
      {state === 'running' && status && (
        <p className="ml-6 mt-0.5 text-xs text-muted-foreground">{status}</p>
      )}
      {state === 'running' && typeof current === 'number' && typeof total === 'number' && total > 0 && (
        <div className="ml-6 mt-1 h-1 bg-muted rounded overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${(current / total) * 100}%` }} />
        </div>
      )}
      {detail && <p className="ml-6 mt-0.5 text-[11px] text-muted-foreground italic">{detail}</p>}
    </div>
  )
}
```

Tests:

```tsx
// __tests__/StageRow.test.tsx
it('renders running state with status text + progress bar')
it('renders completed state with summary + Open engine button')
it('renders pending state with circle icon, no extra')
it('renders skipped state with minus icon')
```

- [ ] **Step 2: Write `LiveActivityLog` + tests**

```tsx
// apps/app/src/components/pipeline/LiveActivityLog.tsx
'use client'
import { Card, CardContent } from '@/components/ui/card'

export interface ActivityEntry { timestamp: string; text: string }

export function LiveActivityLog({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) return null
  return (
    <Card data-testid="live-activity-log" className="mt-4">
      <CardContent className="py-3 px-4 space-y-1">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Activity</h4>
        {entries.slice(-5).reverse().map((e, i) => (
          <p key={i} className="text-xs"><span className="text-muted-foreground mr-2">{new Date(e.timestamp).toLocaleTimeString()}</span>{e.text}</p>
        ))}
      </CardContent>
    </Card>
  )
}
```

Tests: render with 0 entries → null; render with 7 entries → shows last 5; entries reversed (newest first).

- [ ] **Step 3: Write `OverviewTimeline` + tests**

```tsx
// apps/app/src/components/pipeline/OverviewTimeline.tsx
'use client'
import { Card, CardContent } from '@/components/ui/card'
import { usePipelineActor } from '@/hooks/usePipelineActor'
import { useSelector } from '@xstate/react'
import { PIPELINE_STAGES } from '@/components/engines/types'
import { StageRow, type StageRowState } from './StageRow'
import type { PipelineStage } from '@/components/engines/types'

export const STAGE_LABEL: Record<PipelineStage, string> = {
  brainstorm: 'Brainstorm', research: 'Research', draft: 'Draft', review: 'Review',
  assets: 'Assets', preview: 'Preview', publish: 'Publish',
}

interface OverviewTimelineProps { setShowEngine: (stage: string) => void }

export function OverviewTimeline({ setShowEngine }: OverviewTimelineProps) {
  const actor = usePipelineActor()
  const { stageResults, autopilotConfig, paused } = useSelector(actor, (s) => s.context)
  const stateValue = useSelector(actor, (s) => s.value)
  const currentStage = (typeof stateValue === 'string' ? stateValue : Object.keys(stateValue)[0]) as PipelineStage

  const reviewSkipped = autopilotConfig?.review.maxIterations === 0
  const assetsSkipped = autopilotConfig?.assets.mode === 'skip'

  function deriveState(stage: PipelineStage): StageRowState {
    const r = stageResults[stage] as { completedAt?: string; skipped?: boolean } | undefined
    if (r?.completedAt) return 'completed'
    if (stage === 'review' && reviewSkipped) return 'skipped'
    if (stage === 'assets' && assetsSkipped) return 'skipped'
    if (stage === currentStage && !paused) return 'running'
    return 'pending'
  }

  function deriveSummary(stage: PipelineStage): string | undefined {
    const r = stageResults[stage] as Record<string, unknown> | undefined
    if (!r?.completedAt) return undefined
    switch (stage) {
      case 'brainstorm': return `${r.ideaTitle} (${r.ideaVerdict})`
      case 'research':   return `${r.approvedCardsCount} cards · ${r.researchLevel} depth`
      case 'draft':      return r.draftTitle as string
      case 'review':     return `Score ${r.score}/100 · ${r.iterationCount} iter`
      case 'assets':     return `${(r.assetIds as unknown[])?.length ?? 0} asset(s)`
      case 'preview':    return `${(r.categories as unknown[])?.length ?? 0} categories`
      case 'publish':    return r.publishedUrl ? `Published → ${r.publishedUrl}` : (r.wordpressPostId ? `Published (post #${r.wordpressPostId})` : 'Published')
      default: return undefined
    }
  }

  return (
    <Card data-testid="pipeline-overview">
      <CardContent className="py-4 px-5 space-y-1">
        <h3 className="text-sm font-semibold mb-2">Pipeline · {Object.keys(stageResults).length}/7 stages</h3>
        {PIPELINE_STAGES.map((stage) => {
          const state = deriveState(stage)
          const r = stageResults[stage] as Record<string, unknown> | undefined
          return (
            <StageRow
              key={stage}
              stage={stage}
              label={STAGE_LABEL[stage]}
              state={state}
              status={state === 'running' ? (r?.status as string | undefined) : undefined}
              current={state === 'running' ? (r?.current as number | undefined) : undefined}
              total={state === 'running' ? (r?.total as number | undefined) : undefined}
              detail={state === 'running' ? (r?.detail as string | undefined) : undefined}
              summary={deriveSummary(stage)}
              onOpenEngine={state === 'completed' ? () => setShowEngine(stage) : undefined}
            />
          )
        })}
      </CardContent>
    </Card>
  )
}
```

Tests:
- render with empty stageResults + machine at brainstorm → brainstorm row is `running`, others pending.
- render with brainstorm completed + stage at research → brainstorm completed (with summary), research running.
- assets.mode='skip' → assets row is skipped.

- [ ] **Step 4: Replace PipelineOverview to use OverviewTimeline + LiveActivityLog**

```tsx
// apps/app/src/components/pipeline/PipelineOverview.tsx — full rewrite
'use client'
import { useEffect, useState, useRef } from 'react'
import { useSelector } from '@xstate/react'
import { usePipelineActor } from '@/hooks/usePipelineActor'
import { OverviewTimeline, STAGE_LABEL } from './OverviewTimeline'
import { LiveActivityLog, type ActivityEntry } from './LiveActivityLog'
import type { PipelineStage } from '@/components/engines/types'

interface PipelineOverviewProps { setShowEngine: (stage: string) => void }

export function PipelineOverview({ setShowEngine }: PipelineOverviewProps) {
  const actor = usePipelineActor()
  const stateValue = useSelector(actor, (s) => s.value)
  const stageResults = useSelector(actor, (s) => s.context.stageResults)
  const lastStageRef = useRef<PipelineStage | null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([])

  const currentStage = (typeof stateValue === 'string' ? stateValue : Object.keys(stateValue)[0]) as PipelineStage

  useEffect(() => {
    if (lastStageRef.current !== null && lastStageRef.current !== currentStage) {
      const completed = lastStageRef.current
      const r = stageResults[completed]
      if (r) {
        setActivity((a) => [...a, {
          timestamp: new Date().toISOString(),
          text: `${STAGE_LABEL[completed]} completed`,
        }])
      }
    }
    lastStageRef.current = currentStage
  }, [currentStage, stageResults])

  return (
    <div className="space-y-2">
      <OverviewTimeline setShowEngine={setShowEngine} />
      <LiveActivityLog entries={activity} />
    </div>
  )
}
```

- [ ] **Step 5: Delete old components**

```bash
git rm apps/app/src/components/pipeline/OverviewProgressRail.tsx \
       apps/app/src/components/pipeline/OverviewStageResults.tsx
```

If `__tests__/OverviewProgressRail.test.tsx` or `OverviewStageResults.test.tsx` exist, delete those too.

- [ ] **Step 6: Update PipelineOverview tests**

Rewrite `apps/app/src/components/pipeline/__tests__/PipelineOverview.test.tsx` to test the new structure (OverviewTimeline + LiveActivityLog wired via PipelineOverview).

- [ ] **Step 7: Run all tests, verify pass**

```bash
cd apps/app && npx vitest run src/components/pipeline/__tests__/
```

- [ ] **Step 8: Commit**

```bash
git add -A apps/app/src/components/pipeline/
git commit -m "feat(pipeline): Live Console (OverviewTimeline + StageRow + LiveActivityLog)"
```

### Task 1.9: Spec 1 happy-path RTL test

**Files:**
- Create: `apps/app/src/components/pipeline/__tests__/autopilot-happy-path.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// apps/app/src/components/pipeline/__tests__/autopilot-happy-path.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PipelineOrchestrator } from '../PipelineOrchestrator'

// Mock fetch with stage-by-stage responses
function setupAutopilotMocks() {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const u = String(url)
    // /api/brainstorm/sessions POST → returns session id
    if (u.includes('/api/brainstorm/sessions') && init?.method === 'POST') {
      return { ok: true, json: async () => ({ data: { sessionId: 'bs-1', status: 'streaming' }, error: null }) }
    }
    // ... add minimal canned responses for every endpoint the engines hit:
    //   /api/brainstorm/sessions/:id/drafts (returns 12 ideas with one verdict='viable')
    //   /api/research-sessions POST + cards GET (returns 5 cards)
    //   /api/content-drafts POST + produce + assets-skipped path
    //   /api/wordpress/publish (returns wpStatus='draft')
    return { ok: true, json: async () => ({ data: null, error: null }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('autopilot happy path', () => {
  beforeEach(() => {
    setupAutopilotMocks()
  })

  it('runs brainstorm → research → draft → review → assets(skip) → preview(skip) → publish without user input', async () => {
    const initialState = {
      mode: 'overview',
      currentStage: 'brainstorm',
      stageResults: {},
      autopilotConfig: {
        defaultProvider: 'recommended',
        brainstorm: { providerOverride: null, mode: 'topic_driven', topic: 'Test', referenceUrl: null, niche: '', tone: '', audience: '', goal: '', constraints: '' },
        research: { providerOverride: null, depth: 'medium' },
        canonicalCore: { providerOverride: null, personaId: null },
        draft: { providerOverride: null, format: 'blog', wordCount: 800 },
        review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 80, hardFailThreshold: 30 },
        assets: { providerOverride: null, mode: 'skip' },
      },
    }

    render(<PipelineOrchestrator projectId="p1" channelId="c1" projectTitle="Test" initialPipelineState={initialState as never} />)

    await waitFor(() => {
      expect(screen.getByTestId('stage-row-brainstorm')).toHaveTextContent(/completed/i)
    }, { timeout: 5000 })
    await waitFor(() => {
      expect(screen.getByTestId('stage-row-research')).toHaveTextContent(/completed/i)
    }, { timeout: 5000 })
    await waitFor(() => {
      expect(screen.getByTestId('stage-row-draft')).toHaveTextContent(/completed/i)
    }, { timeout: 5000 })
    await waitFor(() => {
      expect(screen.getByTestId('stage-row-review')).toHaveTextContent(/completed/i)
    }, { timeout: 5000 })
    await waitFor(() => {
      expect(screen.getByTestId('stage-row-publish')).toHaveTextContent(/completed/i)
    }, { timeout: 10000 })

    expect(screen.getByTestId('live-activity-log')).toHaveTextContent(/Brainstorm completed/)
  })
})
```

- [ ] **Step 2: Run test, verify it fails or passes — adjust mocks until it passes**

The test will reveal which mock responses need to be more accurate. Iterate until green.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/pipeline/__tests__/autopilot-happy-path.test.tsx
git commit -m "test(pipeline): autopilot happy-path RTL test (5-stage flow, all auto)"
```

### Task 1.10: Spec 1 acceptance gate

- [ ] **Step 1: Run typecheck + test + lint + build**

```bash
npm run typecheck && npm run test 2>&1 | tee /tmp/spec1-test.log
diff <(grep -E '^( FAIL )' /tmp/spec1-test.log | sort -u) docs/superpowers/specs/2026-04-29-test-baseline.txt
npm run lint
npm run build
```

Expected: typecheck/test/build green; test diff empty (no new failures vs baseline).

- [ ] **Step 2: Manual smoke**

```bash
npm run dev
```

Walk through:
1. Create a project (any existing path)
2. Submit wizard with `mode='overview'`, topic filled, persona "Auto-select"
3. Watch overview: brainstorm card transitions `pending → running (status text appears) → completed`
4. Research, draft, review, publish follow without intervention
5. LiveActivityLog shows transitions

If any stage hangs, check the engine's hydration + STAGE_PROGRESS emits. Stop, fix, re-run.

- [ ] **Step 3: Tag the Spec 1 milestone**

```bash
git tag -a autopilot-spec-1-foundation -m "Spec 1: foundation green"
```

(Don't push the tag.)

---

## Wave 2 — Spec 2: Gates & Per-Iteration Tracking

**Scope:** Schema additions for assets/preview/publish; new machine events for drill-in flow; ConfirmReturnDialog; per-iteration review history; wizard UI for the new fields.

**Exit criteria:**
- All 8 Wave 2 RTL gate-scenario tests green.
- `autopilotConfigSchema` parses existing fixtures without breakage.
- All build/typecheck/lint/test gates green vs baseline.

### Task 2.1: Schema diff — autopilotConfig + types/agents

**Files:**
- Modify: `packages/shared/src/schemas/autopilotConfig.ts`
- Modify: `packages/shared/src/types/agents.ts`
- Modify: `packages/shared/src/schemas/__tests__/autopilotConfig.test.ts`

- [ ] **Step 1: Write the failing schema test**

Add to `autopilotConfig.test.ts`:

```ts
it('accepts new assets enum: skip / briefs_only / auto_generate', () => {
  const cfg = { ...minimalCanonical, assets: { providerOverride: null, mode: 'briefs_only' } }
  expect(autopilotConfigSchema.parse(cfg)).toMatchObject({ assets: { mode: 'briefs_only' } })
})

it('rejects legacy assets values', () => {
  const cfg = { ...minimalCanonical, assets: { providerOverride: null, mode: 'briefing' } }
  expect(() => autopilotConfigSchema.parse(cfg)).toThrow()
})

it('requires preview slot with enabled boolean', () => {
  const cfg = { ...minimalCanonical, preview: { enabled: false } }
  expect(autopilotConfigSchema.parse(cfg)).toMatchObject({ preview: { enabled: false } })
})

it('requires publish slot with status enum', () => {
  const cfg = { ...minimalCanonical, publish: { status: 'draft' } }
  expect(autopilotConfigSchema.parse(cfg)).toMatchObject({ publish: { status: 'draft' } })
})
```

Update `minimalCanonical` fixture to include `preview: { enabled: false }` and `publish: { status: 'draft' }`.

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run packages/shared/src/schemas/__tests__/autopilotConfig.test.ts
```

- [ ] **Step 3: Update the schema**

```ts
// packages/shared/src/schemas/autopilotConfig.ts
const AssetsSlot = z.object({
  providerOverride: ProviderOrInherit,
  mode: z.enum(['skip', 'briefs_only', 'auto_generate']),
})

const PreviewSlot = z.object({
  enabled: z.boolean(),
})

const PublishSlot = z.object({
  status: z.enum(['draft', 'published']),
})

export const autopilotConfigSchema = z.object({
  defaultProvider: DefaultProvider,
  brainstorm:    BrainstormSlot.nullable(),
  research:      ResearchSlot.nullable(),
  canonicalCore: CanonicalCoreSlot,
  draft:         DraftSlot,
  review:        ReviewSlot,
  assets:        AssetsSlot,
  preview:       PreviewSlot,
  publish:       PublishSlot,
})
```

- [ ] **Step 4: Update ReviewResult in agents.ts**

```ts
// packages/shared/src/types/agents.ts — extend ReviewResult
export interface ReviewIterationSummary {
  iterationNum: number
  score: number
  verdict: 'approved' | 'rejected' | 'needs_revision'
  oneLineSummary: string
  timestamp: string
}

// Inside ReviewResult interface, add:
//   iterations: ReviewIterationSummary[]
//   latestFeedbackJson: ReviewFeedbackJson | null
```

- [ ] **Step 5: Run tests, verify pass**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(schemas): add preview/publish slots; assets enum reshape; review iteration types"
```

### Task 2.2: Legacy migration shim updates

**Files:**
- Modify: `apps/app/src/lib/pipeline/legacy-state-migration.ts`
- Modify: `apps/app/src/lib/pipeline/__tests__/legacy-state-migration.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("maps legacy assets.mode='briefing' → 'briefs_only'", () => {
  const legacy = { ...minimalLegacy, autopilotConfig: { ...legacyConfig, assets: { providerOverride: null, mode: 'briefing' } } }
  const snap = mapLegacyToSnapshot(legacy)
  expect(snap?.context.autopilotConfig?.assets.mode).toBe('briefs_only')
})

it("maps legacy assets.mode='auto' → 'auto_generate'", () => { ... })
it("maps legacy assets.mode='manual' → 'skip'", () => { ... })

it('fills missing preview slot with { enabled: false }', () => {
  const snap = mapLegacyToSnapshot({ ...minimalLegacy, autopilotConfig: { ...legacyConfig /* no preview */ } })
  expect(snap?.context.autopilotConfig?.preview).toEqual({ enabled: false })
})

it('fills missing publish slot with { status: "draft" }', () => { ... })
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Update the migration shim**

```ts
// In legacy-state-migration.ts, after constructing the autopilotConfig:
function migrateAssetsMode(legacy: string | undefined): 'skip' | 'briefs_only' | 'auto_generate' {
  switch (legacy) {
    case 'briefing': return 'briefs_only'
    case 'auto':     return 'auto_generate'
    case 'manual':   return 'skip'
    case 'skip':     return 'skip'
    case 'briefs_only':   return 'briefs_only'
    case 'auto_generate': return 'auto_generate'
    default:         return 'skip'
  }
}

// When building autopilotConfig from legacy:
autopilotConfig: legacy.autopilotConfig ? {
  ...legacy.autopilotConfig,
  assets: {
    providerOverride: legacy.autopilotConfig.assets?.providerOverride ?? null,
    mode: migrateAssetsMode(legacy.autopilotConfig.assets?.mode),
  },
  preview: legacy.autopilotConfig.preview ?? { enabled: false },
  publish: legacy.autopilotConfig.publish ?? { status: 'draft' },
} : null,
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(pipeline): legacy migration maps assets enum + fills preview/publish defaults"
```

### Task 2.3: Machine events + context for drill-in

**Files:**
- Modify: `apps/app/src/lib/pipeline/machine.types.ts`
- Modify: `apps/app/src/lib/pipeline/machine.ts`
- Modify: `apps/app/src/lib/pipeline/__tests__/machine.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it('ASSETS_GATE_TRIGGERED sets pendingDrillIn = "assets"', () => {
  const actor = createActor(pipelineMachine, { input: { ...defaultInput } }).start()
  actor.send({ type: 'SETUP_COMPLETE', mode: 'overview', autopilotConfig: configWithAssetsBriefsOnly, templateId: null, startStage: 'brainstorm' })
  // Force machine to assets state (simulate prior stages complete)
  // ...
  actor.send({ type: 'ASSETS_GATE_TRIGGERED' })
  expect(actor.getSnapshot().context.pendingDrillIn).toBe('assets')
})

it('CONTINUE_AUTOPILOT clears pendingDrillIn and returnPromptOpen', () => { ... })
it('STOP_AUTOPILOT flips mode to step-by-step + clears pendingDrillIn', () => { ... })
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Update machine.types.ts**

```ts
export type PipelineEvent =
  // ... existing ...
  | { type: 'ASSETS_GATE_TRIGGERED' }
  | { type: 'PREVIEW_GATE_TRIGGERED' }
  | { type: 'CONTINUE_AUTOPILOT' }
  | { type: 'STOP_AUTOPILOT' }

export interface PipelineMachineContext {
  // ... existing ...
  pendingDrillIn: 'assets' | 'preview' | null
  returnPromptOpen: boolean
}
```

- [ ] **Step 4: Update machine.ts actions + transitions**

```ts
// Add to actions:
setAssetsDrillIn: assign({ pendingDrillIn: () => 'assets' as const }),
setPreviewDrillIn: assign({ pendingDrillIn: () => 'preview' as const }),
clearDrillIn: assign({ pendingDrillIn: () => null, returnPromptOpen: () => false }),
openReturnPrompt: assign({ returnPromptOpen: () => true }),
flipToStepByStep: assign({
  mode: () => 'step-by-step' as const,
  pendingDrillIn: () => null,
  returnPromptOpen: () => false,
}),

// Add top-level event handlers:
on: {
  // ... existing ...
  ASSETS_GATE_TRIGGERED: { actions: 'setAssetsDrillIn' },
  PREVIEW_GATE_TRIGGERED: { actions: 'setPreviewDrillIn' },
  CONTINUE_AUTOPILOT: { actions: 'clearDrillIn' },
  STOP_AUTOPILOT: { actions: 'flipToStepByStep' },
}

// Initial context:
context: ({ input }) => ({
  // ... existing ...
  pendingDrillIn: null,
  returnPromptOpen: false,
}),
```

After `ASSETS_COMPLETE` and `PREVIEW_COMPLETE`, add a guard-conditional action to open the return prompt:

```ts
// In assets state on event ASSETS_COMPLETE:
ASSETS_COMPLETE: [
  {
    guard: ({ context }) => context.pendingDrillIn === 'assets',
    target: 'preview',
    actions: ['saveAssetsResult', 'openReturnPrompt'],
  },
  { target: 'preview', actions: 'saveAssetsResult' },
],
```

- [ ] **Step 5: Run tests, verify pass**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(pipeline): machine events for drill-in + return-to-overview prompt"
```

### Task 2.4: derivePreview helper extraction

**Files:**
- Create: `apps/app/src/lib/pipeline/derivePreview.ts`
- Create: `apps/app/src/lib/pipeline/__tests__/derivePreview.test.ts`
- Modify: `apps/app/src/components/engines/PreviewEngine.tsx` (use new helper)

- [ ] **Step 1: Locate the derivation logic in PreviewEngine.tsx**

```bash
grep -n "function.*Preview\|categories\|tags\|featured_image\|seo" apps/app/src/components/engines/PreviewEngine.tsx | head -20
```

Identify the function that produces `{ categories, tags, seo, featured_image }` from draft + assets (around line 121 per the spec).

- [ ] **Step 2: Write the unit test**

```ts
// __tests__/derivePreview.test.ts
import { describe, it, expect } from 'vitest'
import { derivePreview } from '../derivePreview'

const draftJson = { categories: ['ai'], tags: ['agents'], publishPlan: { /* ... */ } }
const assets = [{ id: 'a1', role: 'featured_image', url: '/img.jpg' }]

it('returns categories from draft.categories when present', () => {
  expect(derivePreview(draftJson, assets).categories).toEqual(['ai'])
})

it('returns featuredImageUrl from assets with role=featured_image', () => {
  expect(derivePreview(draftJson, assets).featuredImageUrl).toBe('/img.jpg')
})
```

- [ ] **Step 3: Extract the function**

Move the derivation logic out of `PreviewEngine.tsx` into `derivePreview.ts`:

```ts
// apps/app/src/lib/pipeline/derivePreview.ts
export interface DerivedPreview {
  categories: string[]
  tags: string[]
  seo: Record<string, string>
  featuredImageUrl: string | null
  publishDate?: string
}

export function derivePreview(
  draftJson: Record<string, unknown>,
  assets: Array<{ id: string; role?: string; url?: string }>,
): DerivedPreview {
  // (paste extracted logic here, returning DerivedPreview)
}
```

- [ ] **Step 4: PreviewEngine imports derivePreview**

```tsx
import { derivePreview } from '@/lib/pipeline/derivePreview'
// Replace the inline derivation function calls with derivePreview(...)
```

- [ ] **Step 5: Run tests, verify pass**

```bash
cd apps/app && npx vitest run src/lib/pipeline/__tests__/derivePreview.test.ts \
              src/components/engines/__tests__/PreviewEngine.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git commit -am "refactor(pipeline): extract derivePreview helper from PreviewEngine"
```

### Task 2.5: AssetsEngine 3-mode handling

**Files:**
- Modify: `apps/app/src/components/engines/AssetsEngine.tsx`
- Modify: `apps/app/src/components/engines/__tests__/AssetsEngine.test.tsx` (or create)

- [ ] **Step 1: Write the failing tests**

```tsx
it("mode='auto_generate' fires ASSETS_COMPLETE without ASSETS_GATE_TRIGGERED", async () => {
  // mock /api/assets generation success
  // mount AssetsEngine with config.assets.mode='auto_generate' in actor
  // assert actor received ASSETS_COMPLETE, never received ASSETS_GATE_TRIGGERED
})

it("mode='briefs_only' fires ASSETS_GATE_TRIGGERED on mount", async () => {
  // mount with mode='briefs_only'
  // assert ASSETS_GATE_TRIGGERED dispatched
})

it("mode='skip' is handled by machine, AssetsEngine never mounts", () => {
  // verified by orchestrator test, not AssetsEngine itself
})
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Update AssetsEngine**

```tsx
const assetsConfig = useSelector(actor, (s) => s.context.autopilotConfig?.assets)
const overviewMode = useSelector(actor, (s) => s.context.mode === 'overview')

// On mount, decide behavior based on mode:
const initialBehaviorRef = useRef(false)
useEffect(() => {
  if (initialBehaviorRef.current) return
  if (!overviewMode || !assetsConfig) return
  initialBehaviorRef.current = true
  if (assetsConfig.mode === 'briefs_only') {
    actor.send({ type: 'ASSETS_GATE_TRIGGERED' })
  }
  // 'auto_generate' falls through to existing autopilot trigger which fires the engine's
  // generation flow + dispatches ASSETS_COMPLETE on done.
  // 'skip' is handled by machine (action skipAssets on DRAFT_COMPLETE) and engine never mounts.
}, [overviewMode, assetsConfig, actor])
```

For `auto_generate`, ensure the existing `useAutoPilotTrigger` fires `handleGenerate()` automatically. Verify the engine's `canFire()` allows this when mode === 'auto_generate'.

- [ ] **Step 4: Add the machine `skipAssets` action via assets-state entry guard**

Handle the skip on entry to the assets state (cleaner than guarding `DRAFT_COMPLETE` because skip-review may also affect routing):

```ts
assets: {
  initial: 'idle',
  states: {
    idle: {
      always: [
        {
          guard: 'shouldSkipAssets',
          target: '#pipeline.preview',
          actions: 'autoCompleteAssets',
        },
      ],
    },
  },
  // ...
},

// guards.ts:
export function shouldSkipAssets({ context }: { context: PipelineMachineContext }): boolean {
  return context.autopilotConfig?.assets.mode === 'skip'
}

// actions:
autoCompleteAssets: assign({
  stageResults: ({ context }) => ({
    ...context.stageResults,
    assets: { assetIds: [], skipped: true, completedAt: new Date().toISOString() },
  }),
}),
```

- [ ] **Step 5: Run tests, verify pass**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(pipeline): AssetsEngine 3-mode handling + skipAssets machine action"
```

### Task 2.6: PreviewEngine switch handling + auto-derive

**Files:**
- Modify: `apps/app/src/components/engines/PreviewEngine.tsx`
- Modify: `apps/app/src/lib/pipeline/machine.ts`

- [ ] **Step 1: Implement engine-side auto-derive**

The auto-derive lives engine-side (not in a machine action) because the full draft JSON isn't in `stageResults` and we don't want to add a fetch to a machine assign. PreviewEngine on mount checks `preview.enabled` and either:
- `enabled=true`: fires `PREVIEW_GATE_TRIGGERED`, waits for user action
- `enabled=false`: calls `derivePreview` directly with already-loaded draft + assets, fires `PREVIEW_COMPLETE`

```tsx
// PreviewEngine.tsx
const previewEnabled = useSelector(actor, (s) => s.context.autopilotConfig?.preview.enabled)
const overviewMode = useSelector(actor, (s) => s.context.mode === 'overview')

useEffect(() => {
  if (!overviewMode) return
  if (previewEnabled === undefined) return
  if (previewEnabled) {
    actor.send({ type: 'PREVIEW_GATE_TRIGGERED' })
    return
  }
  // Auto-derive path
  const derived = derivePreview(draftJson, assets)
  actor.send({
    type: 'PREVIEW_COMPLETE',
    result: { ...derived, autoDerived: true, completedAt: new Date().toISOString() },
  })
}, [overviewMode, previewEnabled, /* draftJson, assets dependencies */])
```

- [ ] **Step 2: Write the test**

```tsx
it("preview.enabled=false → auto-derives + fires PREVIEW_COMPLETE without drill-in", async () => {
  // ... assert PREVIEW_COMPLETE dispatched, no PREVIEW_GATE_TRIGGERED, autoDerived=true
})

it("preview.enabled=true → fires PREVIEW_GATE_TRIGGERED, no auto-complete", async () => {
  // ...
})
```

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(pipeline): PreviewEngine respects preview.enabled switch (auto-derive when off)"
```

### Task 2.7: PublishEngine reads publish.status

**Files:**
- Modify: `apps/app/src/components/engines/PublishEngine.tsx`
- Modify: `apps/app/src/components/engines/__tests__/PublishEngine.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("publish.status='draft' → POST /api/wordpress/publish body has wpStatus=draft", async () => {
  // ... mock fetch, mount engine in overview, assert body shape
})

it("publish.status='published' → POST body has wpStatus=publish", async () => {
  // ...
})
```

- [ ] **Step 2: Update PublishEngine**

```tsx
const publishStatus = useSelector(actor, (s) => s.context.autopilotConfig?.publish.status ?? 'draft')

// In the publish call:
body: JSON.stringify({
  draftId,
  wpStatus: publishStatus === 'published' ? 'publish' : 'draft',
  // ... existing fields
}),
```

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(pipeline): PublishEngine reads autopilotConfig.publish.status"
```

### Task 2.8: ConfirmReturnDialog component

**Files:**
- Create: `apps/app/src/components/pipeline/ConfirmReturnDialog.tsx`
- Create: `apps/app/src/components/pipeline/__tests__/ConfirmReturnDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('renders when open=true with two action buttons', () => {
  render(<ConfirmReturnDialog open={true} onContinue={vi.fn()} onStop={vi.fn()} />)
  expect(screen.getByRole('button', { name: /continue autopilot/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /finish manually/i })).toBeInTheDocument()
})

it('calls onContinue when continue button clicked', () => {
  const onContinue = vi.fn()
  render(<ConfirmReturnDialog open={true} onContinue={onContinue} onStop={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /continue autopilot/i }))
  expect(onContinue).toHaveBeenCalled()
})

it('calls onStop when finish manually clicked', () => {
  const onStop = vi.fn()
  render(<ConfirmReturnDialog open={true} onContinue={vi.fn()} onStop={onStop} />)
  fireEvent.click(screen.getByRole('button', { name: /finish manually/i }))
  expect(onStop).toHaveBeenCalled()
})
```

- [ ] **Step 2: Write the component**

```tsx
'use client'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

interface Props {
  open: boolean
  onContinue: () => void
  onStop: () => void
}

export function ConfirmReturnDialog({ open, onContinue, onStop }: Props) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Continue autopilot?</AlertDialogTitle>
          <AlertDialogDescription>
            You finished the manual step. Continue running on autopilot, or finish the rest of the pipeline manually?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onStop}>Finish manually</AlertDialogCancel>
          <AlertDialogAction onClick={onContinue}>Continue autopilot →</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(pipeline): ConfirmReturnDialog component"
```

### Task 2.9: Orchestrator drill-in + dialog wiring

**Files:**
- Modify: `apps/app/src/components/pipeline/PipelineOrchestrator.tsx`
- Modify: `apps/app/src/components/pipeline/__tests__/PipelineOrchestrator.behavior.test.tsx`

- [ ] **Step 1: Write the test scenarios**

```tsx
it("pendingDrillIn='assets' triggers setShowEngine('assets')", async () => {
  // initialState with mode=overview + autopilotConfig.assets.mode=briefs_only
  // mount, advance to assets stage
  // dispatch ASSETS_GATE_TRIGGERED via actor (or simulate via engine mock)
  // assert engine for 'assets' is visible
})

it("returnPromptOpen=true opens ConfirmReturnDialog", async () => { ... })
it("clicking 'Continue autopilot →' sends CONTINUE_AUTOPILOT and closes dialog", async () => { ... })
it("clicking 'Finish manually' sends STOP_AUTOPILOT, mode becomes step-by-step", async () => { ... })
```

- [ ] **Step 2: Update orchestrator**

```tsx
const pendingDrillIn = useSelector(actor, (s) => s.context.pendingDrillIn)
const returnPromptOpen = useSelector(actor, (s) => s.context.returnPromptOpen)

// Effect: pendingDrillIn → setShowEngine
useEffect(() => {
  if (pendingDrillIn) setShowEngine(pendingDrillIn as PipelineStage)
}, [pendingDrillIn])

// Render the dialog at root level
<ConfirmReturnDialog
  open={returnPromptOpen}
  onContinue={() => {
    actor.send({ type: 'CONTINUE_AUTOPILOT' })
    setShowEngine(null)
  }}
  onStop={() => {
    actor.send({ type: 'STOP_AUTOPILOT' })
    // showEngine stays set so engine remains visible (now in step-by-step)
  }}
/>
```

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(pipeline): orchestrator drill-in + ConfirmReturnDialog wiring"
```

### Task 2.10: Wizard UI — assets / preview / publish fields

**Files:**
- Modify: `apps/app/src/components/pipeline/PipelineWizard.tsx`
- Modify: `apps/app/src/components/pipeline/MiniWizardSheet.tsx`
- Modify: `apps/app/src/components/pipeline/__tests__/PipelineWizard.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it('renders assets radio with 3 options including auto_generate / briefs_only / skip', () => {
  // mount wizard, assert radio options
})

it('renders preview enabled switch with explainer', () => {
  // mount wizard, assert switch + explainer text
})

it('renders publish status radio with draft (default) + published', () => { ... })

it('submitting wizard with assets.mode=briefs_only writes correct shape into actor', () => { ... })
```

- [ ] **Step 2: Update `AssetsFields()` in PipelineWizard.tsx**

```tsx
function AssetsFields() {
  const { control } = useFormContext<WizardFormValues>()
  return (
    <div>
      <Label>Assets</Label>
      <Controller
        control={control}
        name="autopilotConfig.assets.mode"
        render={({ field }) => (
          <RadioGroup value={field.value} onValueChange={field.onChange} className="mt-1">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="skip" id="assets-skip" />
              <Label htmlFor="assets-skip" className="text-sm font-normal">Skip — go straight to preview (no images)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="auto_generate" id="assets-auto" />
              <Label htmlFor="assets-auto" className="text-sm font-normal">Auto-generate — AI generates images, no manual review</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="briefs_only" id="assets-briefs" />
              <Label htmlFor="assets-briefs" className="text-sm font-normal">Briefs only — AI generates briefs, you finish in the engine</Label>
            </div>
          </RadioGroup>
        )}
      />
    </div>
  )
}
```

- [ ] **Step 3: Add `PreviewFields()` and `PublishFields()`**

```tsx
function PreviewFields() {
  const { control } = useFormContext<WizardFormValues>()
  return (
    <div>
      <Label htmlFor="preview-enabled" className="flex items-center gap-3">
        <Controller
          control={control}
          name="autopilotConfig.preview.enabled"
          render={({ field }) => (
            <Switch id="preview-enabled" checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
        <span className="text-sm">Preview before publish</span>
      </Label>
      <p className="text-xs text-muted-foreground mt-1 ml-12">
        When off, categories and tags are auto-applied from the AI&apos;s analysis.
      </p>
    </div>
  )
}

function PublishFields() {
  const { control } = useFormContext<WizardFormValues>()
  return (
    <div>
      <Label>Publish status</Label>
      <Controller
        control={control}
        name="autopilotConfig.publish.status"
        render={({ field }) => (
          <RadioGroup value={field.value} onValueChange={field.onChange} className="mt-1">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="draft" id="publish-draft" />
              <Label htmlFor="publish-draft" className="text-sm font-normal">Draft — review on WordPress before going live</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="published" id="publish-published" />
              <Label htmlFor="publish-published" className="text-sm font-normal">Published — go live immediately</Label>
            </div>
          </RadioGroup>
        )}
      />
    </div>
  )
}
```

Add to the STAGE_ORDER and rendering map. Update `wizardFormSchema` and `defaultValues` to include the three new fields with defaults `assets.mode='skip'`, `preview.enabled=false`, `publish.status='draft'`.

- [ ] **Step 4: Mirror in MiniWizardSheet.tsx**

Add the same three field groups to the mid-flow sheet so users can change them after starting.

- [ ] **Step 5: Run tests, verify pass**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(pipeline): wizard adds assets-mode/preview-switch/publish-status fields"
```

### Task 2.11: ReviewEngine per-iteration history

**Files:**
- Modify: `apps/app/src/components/engines/ReviewEngine.tsx`
- Modify: `apps/app/src/lib/pipeline/machine.ts` (extend `saveReviewResult`)
- Modify: `apps/app/src/components/engines/__tests__/ReviewEngine.test.tsx`
- Modify: `agents/agent-4-review.md` (verify summary field requirement)

- [ ] **Step 1: Audit agent prompt**

```bash
grep -n "summary\|verdict\|score" agents/agent-4-review.md | head
```

If the agent's BC_REVIEW_OUTPUT contract does not require a top-level `summary` field of ≤120 chars, add it to the YAML schema in the prompt. If unclear, append a clear "ALWAYS include a `summary:` field with a one-sentence (≤120 chars) explanation of the verdict" instruction.

- [ ] **Step 2: Update `saveReviewResult` to append iterations**

```ts
// machine.ts — replace saveReviewResult logic
saveReviewResult: assign(({ context, event }) => {
  const e = event as Extract<PipelineEvent, { type: 'REVIEW_COMPLETE' }>
  const result = e.result as { score: number; verdict: 'approved' | 'rejected' | 'needs_revision'; feedbackJson?: Record<string, unknown> }
  const completedAt = new Date().toISOString()
  const oneLineSummary = (result.feedbackJson?.summary as string | undefined)?.slice(0, 120)
    ?? `Score ${result.score}, ${result.verdict}`
  const prevIterations = (context.stageResults.review?.iterations as ReviewIterationSummary[] | undefined) ?? []
  const newIteration: ReviewIterationSummary = {
    iterationNum: context.iterationCount,
    score: result.score,
    verdict: result.verdict,
    oneLineSummary,
    timestamp: completedAt,
  }
  return {
    stageResults: {
      ...context.stageResults,
      review: {
        score: result.score,
        verdict: result.verdict,
        iterationCount: context.iterationCount,
        iterations: [...prevIterations, newIteration],
        latestFeedbackJson: result.feedbackJson ?? null,
        completedAt,
      },
    },
  }
}),
```

- [ ] **Step 3: Update OverviewTimeline / StageRow to render iteration chips**

In `StageRow.tsx`, when `state === 'running'` and `stage === 'review'`, render iteration chips above the status text:

```tsx
{stage === 'review' && iterations && iterations.length > 0 && (
  <div className="ml-6 mt-1 space-y-0.5">
    {iterations.slice(0, -1).map((it: ReviewIterationSummary) => (
      <p key={it.iterationNum} className="text-[11px] text-muted-foreground">
        Iter {it.iterationNum}: {it.score}/100 · {it.verdict} · &ldquo;{it.oneLineSummary}&rdquo;
      </p>
    ))}
  </div>
)}
```

Pass `iterations` from `OverviewTimeline.tsx` to `StageRow` for the review stage.

- [ ] **Step 4: Write the test**

```tsx
it('review iterations array accumulates across REVIEW_COMPLETE events', () => {
  // dispatch 3 REVIEW_COMPLETE events with scores 60, 78, 92
  // assert stageResults.review.iterations.length === 3
  // assert oneLineSummary populated for each
  // assert latestFeedbackJson is iter-3 feedback
})
```

- [ ] **Step 5: Run tests, verify pass**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(pipeline): per-iteration review history + chip render"
```

### Task 2.12: Wave 2 gate scenario tests

**Files:**
- Create: `apps/app/src/components/pipeline/__tests__/gates/assets-skip.test.tsx`
- Create: `apps/app/src/components/pipeline/__tests__/gates/assets-auto-generate.test.tsx`
- Create: `apps/app/src/components/pipeline/__tests__/gates/assets-briefs-only-continue.test.tsx`
- Create: `apps/app/src/components/pipeline/__tests__/gates/assets-briefs-only-stop.test.tsx`
- Create: `apps/app/src/components/pipeline/__tests__/gates/preview-enabled.test.tsx`
- Create: `apps/app/src/components/pipeline/__tests__/gates/preview-disabled.test.tsx`
- Create: `apps/app/src/components/pipeline/__tests__/gates/publish-status.test.tsx`

- [ ] **Step 1: Write each gate scenario test (one file each)**

Each follows the autopilot-happy-path pattern but with a different config slot. Pseudocode for `assets-skip.test.tsx`:

```tsx
it('mode="skip" transitions draft → preview directly without engine drill-in', async () => {
  const initialState = { mode: 'overview', currentStage: 'draft', stageResults: { /* brainstorm/research/draft completed */ }, autopilotConfig: { ...config, assets: { providerOverride: null, mode: 'skip' } } }
  render(<PipelineOrchestrator ... initialPipelineState={initialState} />)
  await waitFor(() => {
    expect(screen.getByTestId('stage-row-assets')).toHaveTextContent(/skipped/i)
    expect(screen.getByTestId('stage-row-preview')).toHaveTextContent(/running|completed/i)
  })
})
```

`assets-briefs-only-continue.test.tsx`:

```tsx
it('briefs_only → drill-in, ASSETS_COMPLETE, dialog → Continue → returns to overview', async () => {
  // ... mount with mode=briefs_only
  // assert engine becomes visible
  // simulate ASSETS_COMPLETE
  // assert ConfirmReturnDialog opens
  // click Continue
  // assert overview returns and machine advances to preview
})
```

Repeat the pattern for all 7 files.

- [ ] **Step 2: Run all tests, verify pass**

```bash
cd apps/app && npx vitest run src/components/pipeline/__tests__/gates/
```

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/pipeline/__tests__/gates/
git commit -m "test(pipeline): 7 gate-scenario tests for Spec 2 acceptance"
```

### Task 2.13: Spec 2 acceptance gate

- [ ] **Step 1: Run typecheck + test + lint + build**

```bash
npm run typecheck && npm run test 2>&1 | tee /tmp/spec2-test.log
diff <(grep -E '^( FAIL )' /tmp/spec2-test.log | sort -u) docs/superpowers/specs/2026-04-29-test-baseline.txt
npm run lint
npm run build
```

Expected: all green; diff empty.

- [ ] **Step 2: Manual smoke each gate combination at least once**

Walkthrough:
1. Wizard with `assets=skip, preview=off, publish=draft` → Spec 1 happy path (regression check)
2. Wizard with `assets=auto_generate, preview=on, publish=draft` → assets generate hidden; preview drill-in; ConfirmReturnDialog appears
3. Wizard with `assets=briefs_only, preview=off, publish=published` → assets drill-in; ConfirmReturnDialog after; preview auto-derives; publish goes live

- [ ] **Step 3: Tag**

```bash
git tag -a autopilot-spec-2-gates -m "Spec 2: gates green"
```

---

## Wave 3 — Spec 3: Project Creation & Templates Polish

**Scope:** `/projects/new` page with channel picker, templates verification, Playwright happy-path smoke.

**Exit criteria:**
- All Spec 3 RTL tests green.
- Playwright `autopilot-happy-path.spec.ts` green against dev DB.
- All build/typecheck/lint/test gates green.

### Task 3.1: `usePinnedChannels` hook + tests

**Files:**
- Create: `apps/app/src/hooks/usePinnedChannels.ts`
- Create: `apps/app/src/hooks/__tests__/usePinnedChannels.test.ts`

- [ ] **Step 1: Write the failing tests**

```tsx
import { renderHook } from '@testing-library/react'
import { usePinnedChannels } from '../usePinnedChannels'

beforeEach(() => { localStorage.clear() })

it('returns channels sorted alphabetically when no localStorage entries', () => {
  const { result } = renderHook(() => usePinnedChannels([
    { id: 'c1', name: 'Beta' },
    { id: 'c2', name: 'Alpha' },
  ]))
  expect(result.current).toEqual([
    { id: 'c2', name: 'Alpha', recent: false },
    { id: 'c1', name: 'Beta', recent: false },
  ])
})

it('puts up to 3 most-recent channels first', () => {
  localStorage.setItem('lastVisitedChannelAt:c2', '2026-04-29T10:00:00Z')
  localStorage.setItem('lastVisitedChannelAt:c1', '2026-04-29T11:00:00Z')
  const { result } = renderHook(() => usePinnedChannels([
    { id: 'c1', name: 'Beta' }, { id: 'c2', name: 'Alpha' }, { id: 'c3', name: 'Gamma' },
  ]))
  expect(result.current.map((c) => c.id)).toEqual(['c1', 'c2', 'c3'])
  expect(result.current[0].recent).toBe(true)
  expect(result.current[1].recent).toBe(true)
  expect(result.current[2].recent).toBe(false)
})

it('caps recent list at 3 entries', () => {
  // ... seed 5 timestamps, expect top 3 in recent group
})
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Write the hook**

```ts
// apps/app/src/hooks/usePinnedChannels.ts
'use client'
import { useMemo } from 'react'

interface ChannelInput { id: string; name: string }
export interface PinnedChannel extends ChannelInput { recent: boolean }

const RECENT_CAP = 3
const KEY_PREFIX = 'lastVisitedChannelAt:'

export function usePinnedChannels(channels: ChannelInput[]): PinnedChannel[] {
  return useMemo(() => {
    const visits: Map<string, number> = new Map()
    for (const c of channels) {
      const v = typeof window !== 'undefined' ? localStorage.getItem(`${KEY_PREFIX}${c.id}`) : null
      if (v) visits.set(c.id, Date.parse(v))
    }
    const visited = channels.filter((c) => visits.has(c.id))
    visited.sort((a, b) => (visits.get(b.id)! - visits.get(a.id)!))
    const recent = visited.slice(0, RECENT_CAP).map((c) => ({ ...c, recent: true }))
    const recentIds = new Set(recent.map((c) => c.id))
    const rest = channels.filter((c) => !recentIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name))
    return [...recent, ...rest.map((c) => ({ ...c, recent: false }))]
  }, [channels])
}

export function recordChannelVisit(channelId: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`${KEY_PREFIX}${channelId}`, new Date().toISOString())
  }
}
```

- [ ] **Step 4: Wire `recordChannelVisit` into `/channels/[id]/page.tsx`**

```tsx
// apps/app/src/app/[locale]/(app)/channels/[id]/page.tsx (top of component)
useEffect(() => { recordChannelVisit(channelId) }, [channelId])
```

- [ ] **Step 5: Run tests, verify pass**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(channels): usePinnedChannels hook + recent-channel tracking"
```

### Task 3.2: ChannelPicker component + tests

**Files:**
- Create: `apps/app/src/components/projects/ChannelPicker.tsx`
- Create: `apps/app/src/components/projects/__tests__/ChannelPicker.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('renders channels with recent group + divider + alphabetical group', () => {
  const channels = [/* with 2 recent + 3 alphabetical */]
  render(<ChannelPicker channels={channels} onSelect={vi.fn()} />)
  expect(screen.getAllByTestId('channel-option')).toHaveLength(5)
  expect(screen.getByTestId('channel-divider')).toBeInTheDocument()
})

it('clicking a channel option calls onSelect with channel id', () => {
  const onSelect = vi.fn()
  render(<ChannelPicker channels={channels} onSelect={onSelect} />)
  fireEvent.click(screen.getAllByTestId('channel-option')[0])
  expect(onSelect).toHaveBeenCalledWith(channels[0].id)
})

it('renders empty state when no channels exist', () => {
  render(<ChannelPicker channels={[]} onSelect={vi.fn()} />)
  expect(screen.getByText(/create your first channel/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Write the component**

```tsx
'use client'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { usePinnedChannels } from '@/hooks/usePinnedChannels'

interface Props {
  channels: Array<{ id: string; name: string }>
  onSelect: (channelId: string) => void
}

export function ChannelPicker({ channels, onSelect }: Props) {
  const sorted = usePinnedChannels(channels)
  if (channels.length === 0) {
    return (
      <Card><CardContent className="py-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">You don&apos;t have any channels yet.</p>
        <Button asChild><Link href="/channels/new">Create your first channel</Link></Button>
      </CardContent></Card>
    )
  }
  return (
    <div className="space-y-1">
      {sorted.map((c, i) => {
        const showDivider = c.recent === false && i > 0 && sorted[i - 1].recent === true
        return (
          <div key={c.id}>
            {showDivider && <div data-testid="channel-divider" className="my-2 border-t border-muted" />}
            <button
              data-testid="channel-option"
              onClick={() => onSelect(c.id)}
              className="w-full text-left px-3 py-2 rounded hover:bg-muted text-sm flex items-center gap-2"
            >
              <span className={c.recent ? 'text-primary' : ''}>●</span>
              <span>{c.name}</span>
              {c.recent && <span className="ml-auto text-xs text-muted-foreground">recent</span>}
            </button>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(projects): ChannelPicker component"
```

### Task 3.3: `/projects/new` page

**Files:**
- Create: `apps/app/src/app/[locale]/(app)/projects/new/page.tsx`
- Create: `apps/app/src/app/[locale]/(app)/projects/new/__tests__/page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('lists channels and creates project on selection', async () => {
  // mock GET /api/channels returns [c1, c2]
  // mock POST /api/projects returns { id: 'p1' }
  // mock router.push
  render(<NewProjectPage />)
  await waitFor(() => expect(screen.getAllByTestId('channel-option')).toHaveLength(2))
  fireEvent.click(screen.getAllByTestId('channel-option')[0])
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/projects/p1'))
})

it('auto-creates and skips picker when only one channel exists', async () => { ... })
it('respects ?channelId=X deep link', async () => { ... })
```

- [ ] **Step 2: Write the page**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChannelPicker } from '@/components/projects/ChannelPicker'

export default function NewProjectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const deepLinkChannelId = searchParams.get('channelId')
  const [channels, setChannels] = useState<Array<{ id: string; name: string }> | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/channels')
      const json = await res.json()
      setChannels((json?.data?.channels ?? []) as Array<{ id: string; name: string }>)
    })()
  }, [])

  // Auto-create when single channel OR deep link supplied
  useEffect(() => {
    if (creating) return
    if (deepLinkChannelId) { void createProject(deepLinkChannelId) }
    else if (channels !== null && channels.length === 1) { void createProject(channels[0].id) }
  }, [channels, deepLinkChannelId])

  async function createProject(channelId: string) {
    setCreating(true)
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, mode: null }),
    })
    const json = await res.json()
    const id = json?.data?.id
    if (id) router.push(`/projects/${id}`)
    else { /* show error */ setCreating(false) }
  }

  if (channels === null) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="max-w-md mx-auto p-6">
      <Card>
        <CardHeader><CardTitle>Start a new project</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Pick a channel</p>
          <ChannelPicker channels={channels} onSelect={setSelectedId} />
          <Button disabled={!selectedId || creating} onClick={() => selectedId && createProject(selectedId)}>
            {creating ? 'Creating…' : 'Continue →'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(projects): /projects/new page with channel picker"
```

### Task 3.4: Templates page audit

**Files:**
- Read: `apps/app/src/app/[locale]/(app)/channels/[id]/autopilot-templates/page.tsx`

- [ ] **Step 1: Open the page in dev and click through every action**

```bash
npm run dev
```

Visit `/channels/<id>/autopilot-templates`. Verify:
- List view shows existing templates.
- "Set default" / "Clear default" buttons work and the badge moves.
- Edit modal opens, fields are populated, save persists.
- Delete confirmation works and the row disappears.
- Wizard's "Save as template" + reload + dropdown contains the new template.
- Pre-fill includes new Spec-2 fields (`assets.mode`, `preview.enabled`, `publish.status`).

- [ ] **Step 2: Fix any broken behavior**

For each broken action, write a failing test first, then fix, then commit. Use the existing `__tests__/` structure for the templates page.

- [ ] **Step 3: If everything works, no commit needed**

If audit revealed nothing broken, document in `docs/superpowers/specs/2026-04-29-test-baseline.txt` as "templates audit clean — no changes."

### Task 3.5: Wizard "Save as template" verification (Spec 2 fields included)

**Files:**
- Modify: `apps/app/src/components/pipeline/PipelineWizard.tsx` (if pre-fill is missing the new fields)
- Modify: `apps/app/src/components/pipeline/__tests__/PipelineWizard.test.tsx`

- [ ] **Step 1: Write test verifying full round-trip**

```tsx
it('save-as-template + reload pre-fills all fields including Spec 2 additions', async () => {
  // 1. Mount wizard, fill all fields including new ones (assets.mode='briefs_only', preview.enabled=true, publish.status='published')
  // 2. Check "Save as template" + name
  // 3. Submit
  // 4. Assert POST /api/autopilot-templates body includes all fields
  // 5. Mount fresh wizard with templateId pre-selected, mock GET returns the saved template
  // 6. Assert form values match what was saved
})
```

- [ ] **Step 2: Fix wizard pre-fill if missing Spec 2 fields**

Verify the template-load handler pulls all schema fields. If absent, add them.

- [ ] **Step 3: Run, commit**

```bash
git commit -am "test(pipeline): full wizard template roundtrip including Spec 2 fields"
```

### Task 3.6: Playwright happy-path smoke

**Files:**
- Create: `apps/app/e2e/autopilot-happy-path.spec.ts`

- [ ] **Step 1: Confirm Playwright config + auth setup**

```bash
cat apps/app/playwright.config.ts
ls apps/app/e2e/
```

Reuse existing auth fixtures if present; otherwise inline a minimal login block at the top of the test.

- [ ] **Step 2: Write the smoke test**

(See spec §7.5 for the full body — paste it here.)

- [ ] **Step 3: Run locally**

```bash
cd apps/app && npx playwright test e2e/autopilot-happy-path.spec.ts --headed
```

Expected: green within ~3 minutes (real AI calls).

- [ ] **Step 4: Document run cadence**

In `apps/app/playwright.config.ts` (or alongside it), add a note:

```ts
// autopilot-happy-path.spec.ts is gated to manual / pre-merge runs.
// Real Supabase dev DB + real AI providers — costs apply.
// Excluded from default CI suite via `testIgnore`.
```

Add `testIgnore: /autopilot-happy-path/` to the default project in `playwright.config.ts`. To run: `npx playwright test e2e/autopilot-happy-path.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/app/e2e/autopilot-happy-path.spec.ts apps/app/playwright.config.ts
git commit -m "test(e2e): autopilot happy-path Playwright smoke (manual gate)"
```

### Task 3.7: Final acceptance gate

- [ ] **Step 1: Full repo gates**

```bash
npm run typecheck && npm run test 2>&1 | tee /tmp/spec3-test.log
diff <(grep -E '^( FAIL )' /tmp/spec3-test.log | sort -u) docs/superpowers/specs/2026-04-29-test-baseline.txt
npm run lint
npm run build
cd apps/app && npx playwright test e2e/autopilot-happy-path.spec.ts
```

Expected: all green; diff empty; Playwright passes.

- [ ] **Step 2: Branch cleanliness check**

```bash
git log feat/pipeline-autopilot-wizard-impl ^main --grep='no-verify' --oneline
```

Expected: empty.

- [ ] **Step 3: Tag final**

```bash
git tag -a autopilot-foundation-gates-templates-accepted -m "All three specs green"
```

(Don't push the tag without user confirmation.)

- [ ] **Step 4: Update memory**

Add to `docs/superpowers/plans/2026-04-28-pipeline-autopilot-wizard.md` postmortem:

> The original plan did not specify engine→`autopilotConfig` hydration. This omission caused overview mode to never advance during Spec T-9.5 manual smoke. Resolved in the follow-up plan `2026-04-29-autopilot-foundation-gates-templates.md`. Future autopilot-extending plans must include an explicit "wire wizard fields to engine inputs" task.

---

## Risks & Watchpoints

| # | Risk | Mitigation |
|---|---|---|
| R1 | Hidden engine fires effects but user can't see errors | Engine errors → STAGE_ERROR; OverviewTimeline shows red Errored state; LiveActivityLog logs the error. Pause button still works. |
| R2 | Engine local form state edits during drill-in lost on stage completion | Documented in code comments; lift to follow-up if needed. |
| R3 | `useAutoPilotTrigger.canFire()` returns false after hydration | Verified by hydration tests + happy-path test. If a stage is stuck, run `console.log` in the engine's `canFire` to see which input is missing. |
| R4 | Per-iteration history grows unbounded | `iterations.length ≤ maxIterations` capped by guard. |
| R5 | Playwright real-AI cost per run | Smoke gated to manual / pre-merge. CI runs Vitest only. |
| R6 | `display:none` blocks focus traps in modals | Drill-in flips wrapper visible BEFORE modals open. Verified by `assets-briefs-only-continue` test. |
| R7 | LocalStorage recent channels lost on logout / different browser | Falls back to alphabetical. Cosmetic only. |
| R8 | Skip-preview categories surprise the user | "auto-derived" badge in publish stage card lists picked categories. |
| R9 | Wave 1 happy-path test mocks differ from real backend | Wave 3 Playwright smoke is the real-backend safety net. |
| R10 | Engine hydration overrides user-typed input on remount | Hydration runs once per mount only (`[]` deps). User edits during drill-in stick until full unmount. |

## Out of Scope (deferred to follow-ups)

- Persisting engine drill-in edits back to `autopilotConfig`.
- `'scheduled'` publish status.
- Server-side recent-channels tracking.
- Mocked-AI Playwright variant for CI.
- Concurrent-stage execution.
- Server-side autopilot orchestration via Inngest.
