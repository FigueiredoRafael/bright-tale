# Wave 2 — Hydration Layer (Providers + Legacy Migration)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** [`2026-04-24-pipeline-xstate-refactor.md`](./2026-04-24-pipeline-xstate-refactor.md)
**Design spec:** [`../specs/2026-04-24-pipeline-xstate-refactor-design.md`](../specs/2026-04-24-pipeline-xstate-refactor-design.md)
**Depends on:** Wave 1 (machine + types must exist)

**Scope:** Build the React glue layer — settings provider, per-project actor provider, hook, and the legacy `pipeline_state_json` migration helper. **Still no orchestrator changes** — providers are not yet wired into the project page.

**Branch:** `feat/pipeline-orchestrator-refactor`

---

## Pre-flight

- [ ] Wave 1 merged (machine + tests green)
- [ ] Read parent plan tasks 8 + 8.5 in full
- [ ] Read design spec sections "Settings Layer" + "State Migration"
- [ ] Confirm `apps/admin` (or wherever `/api/admin/pipeline-settings` is implemented) returns the new `cost_research_*` fields end-to-end

---

## Tasks

### Task 8: PipelineSettingsProvider + PipelineActorProvider + usePipelineActor Hook

**Files:**
- Create: `apps/app/src/providers/PipelineSettingsProvider.tsx`
- Create: `apps/app/src/providers/PipelineActorProvider.tsx`
- Create: `apps/app/src/hooks/usePipelineActor.ts`
- Create: `apps/app/src/lib/pipeline/__tests__/settings-provider.test.tsx`

The actor is exposed through a per-project `<PipelineActorProvider value={actorRef}>`. The hook `usePipelineActor()` reads the nearest provider — no `projectId` argument, no Map. Two project tabs each mount their own provider, so engines never cross-reference actors.

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

- [ ] **Step 5: Implement PipelineActorProvider + usePipelineActor**

Create `apps/app/src/providers/PipelineActorProvider.tsx`:

```tsx
'use client'

import { createContext } from 'react'
import type { ActorRefFrom } from 'xstate'
import type { pipelineMachine } from '@/lib/pipeline/machine'

export type PipelineActorRef = ActorRefFrom<typeof pipelineMachine>

/**
 * Per-project actor context.
 * Value is a single ActorRef (not a Map). Each <PipelineActorProvider> scopes
 * its own subtree, so sibling project pages get isolated actors.
 */
export const PipelineActorContext = createContext<PipelineActorRef | null>(null)

export function PipelineActorProvider({
  value,
  children,
}: {
  value: PipelineActorRef
  children: React.ReactNode
}) {
  return (
    <PipelineActorContext.Provider value={value}>
      {children}
    </PipelineActorContext.Provider>
  )
}
```

Create `apps/app/src/hooks/usePipelineActor.ts`:

```typescript
import { useContext } from 'react'
import { PipelineActorContext, type PipelineActorRef } from '@/providers/PipelineActorProvider'

export function usePipelineActor(): PipelineActorRef {
  const actor = useContext(PipelineActorContext)
  if (!actor) {
    throw new Error(
      'usePipelineActor must be used inside <PipelineActorProvider>. Are you rendering an engine outside the pipeline orchestrator?',
    )
  }
  return actor
}
```

- [ ] **Step 6: Write failing test for actor provider isolation**

Create `apps/app/src/lib/pipeline/__tests__/actor-provider.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '../machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { usePipelineActor } from '@/hooks/usePipelineActor'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'

function ProjectIdProbe({ testId }: { testId: string }) {
  const actor = usePipelineActor()
  return <span data-testid={testId}>{actor.getSnapshot().context.projectId}</span>
}

describe('PipelineActorProvider', () => {
  it('isolates actors between sibling providers', () => {
    const a = createActor(pipelineMachine, {
      input: {
        projectId: 'proj-A', channelId: 'ch', projectTitle: 't',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS, creditSettings: DEFAULT_CREDIT_SETTINGS,
      },
    }).start()
    const b = createActor(pipelineMachine, {
      input: {
        projectId: 'proj-B', channelId: 'ch', projectTitle: 't',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS, creditSettings: DEFAULT_CREDIT_SETTINGS,
      },
    }).start()

    render(
      <>
        <PipelineActorProvider value={a}><ProjectIdProbe testId="a" /></PipelineActorProvider>
        <PipelineActorProvider value={b}><ProjectIdProbe testId="b" /></PipelineActorProvider>
      </>
    )

    expect(screen.getByTestId('a').textContent).toBe('proj-A')
    expect(screen.getByTestId('b').textContent).toBe('proj-B')
  })

  it('throws a helpful error when used outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<ProjectIdProbe testId="x" />)).toThrow(/must be used inside/)
    spy.mockRestore()
  })
})
```

- [ ] **Step 7: Run — confirm pass**

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/actor-provider.test.tsx
```

Expected: `PASS (2)`

- [ ] **Step 8: Commit**

```bash
git add apps/app/src/providers/PipelineSettingsProvider.tsx \
        apps/app/src/providers/PipelineActorProvider.tsx \
        apps/app/src/hooks/usePipelineActor.ts \
        apps/app/src/lib/pipeline/__tests__/settings-provider.test.tsx \
        apps/app/src/lib/pipeline/__tests__/actor-provider.test.tsx
git commit -m "feat(pipeline): add PipelineSettingsProvider, PipelineActorProvider, usePipelineActor"
```

### Task 8.5: Legacy `pipeline_state_json` Migration Helper

**Files:**
- Create: `apps/app/src/lib/pipeline/__tests__/legacy-state-migration.test.ts`
- Create: `apps/app/src/lib/pipeline/legacy-state-migration.ts`

The orchestrator currently persists a `PipelineState` shape: `{ mode: 'step-by-step' | 'auto', currentStage, stageResults, autoConfig }`. The new machine input is `{ mode: 'step' | 'auto', initialStageResults, initialIterationCount, pipelineSettings, creditSettings, ... }`. Without a migration helper, every existing project would silently reset to `brainstorm.idle` on first load of the new orchestrator — the old shape fails to match and the orchestrator's `as any` casts would swallow the failure.

The machine always starts at `brainstorm.initial='idle'`; restoring the user's position relies on the orchestrator firing `NAVIGATE { toStage: initialStage }` once after `useMachine` returns. The helper therefore also returns `initialStage`.

- [ ] **Step 1: Write failing tests**

Create `apps/app/src/lib/pipeline/__tests__/legacy-state-migration.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { mapLegacyPipelineState } from '../legacy-state-migration'

describe('mapLegacyPipelineState', () => {
  it('returns null for null/empty input', () => {
    expect(mapLegacyPipelineState(null)).toBeNull()
    expect(mapLegacyPipelineState({})).toBeNull()
    expect(mapLegacyPipelineState(undefined)).toBeNull()
  })

  it('maps legacy step-by-step mode to step', () => {
    const out = mapLegacyPipelineState({
      mode: 'step-by-step',
      currentStage: 'draft',
      stageResults: { brainstorm: { ideaId: 'i1', ideaTitle: 'x', ideaVerdict: 'v', ideaCoreTension: 't', completedAt: '2026-01-01' } },
      autoConfig: { maxReviewIterations: 5, targetScore: 90 },
    })
    expect(out?.mode).toBe('step')
    expect(out?.initialStageResults?.brainstorm?.ideaId).toBe('i1')
  })

  it('maps legacy auto mode to auto', () => {
    const out = mapLegacyPipelineState({
      mode: 'auto',
      currentStage: 'review',
      stageResults: {},
      autoConfig: { maxReviewIterations: 5, targetScore: 90 },
    })
    expect(out?.mode).toBe('auto')
  })

  it('lifts review.iterationCount to top-level initialIterationCount', () => {
    const out = mapLegacyPipelineState({
      mode: 'step-by-step',
      currentStage: 'review',
      stageResults: {
        review: { score: 70, iterationCount: 3, verdict: 'needs_revision', feedbackJson: {}, completedAt: '2026-01-01' },
      },
      autoConfig: {},
    })
    expect(out?.initialIterationCount).toBe(3)
  })

  it('maps legacy currentStage to initialStage', () => {
    const out = mapLegacyPipelineState({
      mode: 'step-by-step',
      currentStage: 'draft',
      stageResults: {
        brainstorm: { ideaId: 'i', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c', completedAt: '2026-01-01' },
        research:   { researchSessionId: 'r', approvedCardsCount: 2, researchLevel: 'medium', completedAt: '2026-01-01' },
      },
      autoConfig: {},
    })
    expect(out?.initialStage).toBe('draft')
  })

  it('derives initialStage from furthest completed result when currentStage is missing (new shape)', () => {
    const out = mapLegacyPipelineState({
      mode: 'step',
      iterationCount: 0,
      stageResults: {
        brainstorm: { ideaId: 'i', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c', completedAt: 'x' },
        research:   { researchSessionId: 'r', approvedCardsCount: 2, researchLevel: 'medium', completedAt: 'x' },
      },
    })
    // furthest completed is research, so the next stage to work on is draft
    expect(out?.initialStage).toBe('draft')
  })

  it('defaults initialStage to brainstorm when no results exist', () => {
    const out = mapLegacyPipelineState({ mode: 'step', iterationCount: 0, stageResults: {} })
    expect(out?.initialStage).toBe('brainstorm')
  })

  it('passes through already-new-shape input (idempotent)', () => {
    const input = {
      mode: 'step',
      stageResults: { brainstorm: { ideaId: 'i', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c', completedAt: 'x' } },
      iterationCount: 0,
    }
    const out = mapLegacyPipelineState(input)
    expect(out?.mode).toBe('step')
    expect(out?.initialStageResults?.brainstorm?.ideaId).toBe('i')
    expect(out?.initialIterationCount).toBe(0)
    expect(out?.initialStage).toBe('research')
  })

  it('returns null and logs once for corrupt records (not throws)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Legacy-shaped but with wrong types — stageResults is an array, not an object.
    expect(mapLegacyPipelineState({ mode: 'auto', stageResults: [], autoConfig: {} })).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('pipeline.legacy_state.skipped'))
    warn.mockRestore()
  })
})
```

- [ ] **Step 2: Run — confirm failure**

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/legacy-state-migration.test.ts
```

Expected: `FAIL — Cannot find module '../legacy-state-migration'`

- [ ] **Step 3: Implement the helper**

Create `apps/app/src/lib/pipeline/legacy-state-migration.ts`:

```typescript
import { PIPELINE_STAGES } from '@/components/engines/types'
import type { PipelineMachineInput, PipelineStage, StageResultMap } from './machine.types'

type LegacyMode = 'step-by-step' | 'auto'
type NewMode = 'step' | 'auto'

interface LegacyShape {
  mode?: LegacyMode | NewMode | string
  currentStage?: string
  stageResults?: Record<string, unknown>
  autoConfig?: Record<string, unknown>
  iterationCount?: number
}

export interface MigratedPipelineInput
  extends Pick<PipelineMachineInput, 'mode' | 'initialStageResults' | 'initialIterationCount'> {
  /**
   * Stage the orchestrator should NAVIGATE to after spawning the machine.
   * Derived from legacy `currentStage` when present; otherwise from the
   * furthest completed stage (next un-done stage); otherwise `'brainstorm'`.
   */
  initialStage: PipelineStage
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function normalizeMode(mode: unknown): NewMode {
  if (mode === 'auto') return 'auto'
  return 'step' // 'step-by-step', 'step', unknown → step
}

function isPipelineStage(s: unknown): s is PipelineStage {
  return typeof s === 'string' && (PIPELINE_STAGES as readonly string[]).includes(s)
}

function deriveInitialStage(currentStage: unknown, results: StageResultMap): PipelineStage {
  if (isPipelineStage(currentStage)) return currentStage
  // Find the furthest completed stage; the user should land on the NEXT stage.
  for (let i = PIPELINE_STAGES.length - 1; i >= 0; i--) {
    if (results[PIPELINE_STAGES[i]]) {
      return PIPELINE_STAGES[Math.min(i + 1, PIPELINE_STAGES.length - 1)]
    }
  }
  return 'brainstorm'
}

function looksLegacy(x: LegacyShape): boolean {
  return x.currentStage !== undefined || x.autoConfig !== undefined || x.mode === 'step-by-step'
}

export function mapLegacyPipelineState(raw: unknown): MigratedPipelineInput | null {
  if (!raw || !isPlainObject(raw) || Object.keys(raw).length === 0) return null

  const input = raw as LegacyShape

  // stageResults must be an object if present
  if (input.stageResults !== undefined && !isPlainObject(input.stageResults)) {
    console.warn('pipeline.legacy_state.skipped: stageResults is not an object')
    return null
  }

  const mode = normalizeMode(input.mode)
  const stageResults = (input.stageResults ?? {}) as StageResultMap

  const iterationFromReview =
    (input.stageResults?.review as Record<string, unknown> | undefined)?.iterationCount
  const initialIterationCount =
    typeof input.iterationCount === 'number'
      ? input.iterationCount
      : typeof iterationFromReview === 'number'
        ? iterationFromReview
        : 0

  const initialStage = deriveInitialStage(input.currentStage, stageResults)

  if (looksLegacy(input)) {
    if (typeof window !== 'undefined' && (window as any).Sentry?.addBreadcrumb) {
      ;(window as any).Sentry.addBreadcrumb({
        category: 'pipeline.legacy_state',
        level: 'info',
        message: 'Migrated legacy pipeline_state_json shape',
      })
    }
  }

  return {
    mode,
    initialStageResults: stageResults,
    initialIterationCount,
    initialStage,
  }
}
```

- [ ] **Step 4: Run — confirm pass**

```bash
npx vitest run apps/app/src/lib/pipeline/__tests__/legacy-state-migration.test.ts
```

Expected: `PASS (9)`

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/lib/pipeline/legacy-state-migration.ts \
        apps/app/src/lib/pipeline/__tests__/legacy-state-migration.test.ts
git commit -m "feat(pipeline): add mapLegacyPipelineState helper for pipeline_state_json migration"
```

---

## Wave-specific guardrails

### Provider invariants (from design spec)

- `PipelineActorProvider` value is `actorRef`, **not a Map**. A shared/mutated Map would not trigger React re-renders on consumers — concurrent projects would silently share stale state.
- `PipelineSettingsProvider` is **scoped to the project page subtree**, not `(app)/layout.tsx`. Wrapping the layout would fetch admin endpoints on every page load including dashboards.
- `usePipelineSettings()` returns `isLoaded: boolean`. Orchestrator **must** gate `useMachine` on `isLoaded === true`. Spawning with `DEFAULT_*` and trusting "settings update later" is wrong — context is immutable for the machine's lifetime.

### Legacy migration coupling — READ THIS

> **⚠ DEPLOYMENT COUPLING — Wave 2 must merge with or before Wave 3.**
>
> If Wave 3 (orchestrator) ships without Wave 2's `mapLegacyPipelineState`, every existing project with a persisted `pipeline_state_json` silently resets to `brainstorm` because the new context shape is incompatible with the legacy `autoConfig` / `mode: 'step-by-step'` format.
>
> Recommended: merge Waves 2 + 3 in the same release.

### Test patterns

- Provider tests use `@testing-library/react` with mocked `fetch` for admin endpoints
- Actor provider tests verify `usePipelineActor()` throws outside the provider, returns `actorRef` inside
- Legacy migration tests are pure-function unit tests — no DOM, no React

### Parallelization

Tasks 8 and 8.5 are independent. Run in parallel.

---

## Exit criteria

- [ ] `npm run test --workspace=@brighttale/app -- providers hooks legacy-state-migration` all green
- [ ] `npm run typecheck` clean
- [ ] `usePipelineActor()` throws a useful error when called outside `PipelineActorProvider`
- [ ] `mapLegacyPipelineState` returns `null` (not throws) for any malformed input — verified by fuzzing 50+ random JSON shapes in a property-style test
- [ ] All commits land cleanly through `.husky/pre-commit`

---

## Risks

| Risk | Mitigation |
|---|---|
| `PipelineActorProvider` accidentally implemented with `Map<projectId, actorRef>` | Add a unit test that verifies the provider's `value` type is `ActorRefFrom<typeof pipelineMachine>`, not a Map. |
| Settings fetched twice (provider mounts twice in StrictMode) | Use `useEffect` with proper cleanup; document StrictMode-safe pattern. |
| `mapLegacyPipelineState` accepts any `unknown` and crashes downstream on access | Helper must validate with type guards before reading; corrupt input returns `null` + breadcrumb, never throws. |
| `initialStage` derivation falls back to `'brainstorm'` when downstream stages have results | Walk stages in pipeline order; pick the highest with a non-null result, or `'brainstorm'` as last resort. |

---

## Deploy

**Shippable to main standalone?** Technically yes — providers and helper have no consumers in Wave 2. **But recommended to bundle Waves 2 + 3** to satisfy the deployment coupling rule.

**Pre-deploy smoke (Wave 2 alone):**
- Mount `PipelineSettingsProvider` in a Storybook-style test page (or any unused route) and verify both admin endpoints fire once.
- Run `mapLegacyPipelineState` against a real `pipeline_state_json` snapshot from production (sanitized) — confirm it returns `initialStage` matching the user's last position.

---

## Out of scope for this wave

- Wiring providers into the project page (Wave 5, Task 16)
- Orchestrator using `useMachine` (Wave 3)
- Any engine changes (Wave 4)
