import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { StandaloneProjectContextProvider } from '@/components/pipeline/ProjectContextProvider'
import { ResearchEngine } from '../ResearchEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'
import type { AutopilotConfig } from '@brighttale/shared'
import type { StageRun } from '@brighttale/shared/pipeline/inputs'
import { useAutoPilotTrigger } from '@/hooks/use-auto-pilot-trigger'

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/components/pipeline/PipelineAbortProvider', () => ({
  usePipelineAbort: () => null,
}))

// Slice 14.3: useAutoPilotTrigger no longer reads from xstate actor.
// Tests that relied on the actor path now mock the hook to call fire() directly.
vi.mock('@/hooks/use-auto-pilot-trigger', () => ({
  useAutoPilotTrigger: vi.fn(),
}))

// 5 legacy cards returned by the API (sync path: cards in body, no findings)
const STUB_CARDS = [
  { type: 'source', title: 'Source 1', url: 'https://a.com', relevance: 9 },
  { type: 'statistic', title: 'Stat A', claim: 'Stat claim', relevance: 8 },
  { type: 'expert_quote', title: 'Expert X', quote: 'Some quote', author: 'Expert X', relevance: 7 },
  { type: 'source', title: 'Source 2', url: 'https://b.com', relevance: 6 },
  { type: 'counterargument', title: 'Counter 1', claim: 'Counter claim', relevance: 5 },
]

const FULL_AUTOPILOT_CONFIG: AutopilotConfig = {
  defaultProvider: 'recommended',
  brainstorm: {
    providerOverride: null,
    mode: 'topic_driven',
    topic: 'AI agents in 2026',
    referenceUrl: null,
    niche: 'enterprise',
    tone: '',
    audience: '',
    goal: '',
    constraints: '',
  },
  research: { providerOverride: null, depth: 'deep' },
  canonicalCore: { providerOverride: null, personaId: null },
  draft: { providerOverride: null, format: 'blog', wordCount: 1500 },
  review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 },
  assets: { providerOverride: null, mode: 'skip' },
  preview: { enabled: false },
  publish: { status: 'draft' },
}

// Default fetch mock: /api/agents resolves recommended provider,
// /api/research-sessions returns 5 legacy cards (sync path, no findings).
const defaultFetchMock = vi.fn().mockImplementation(async (url: string) => {
  if (String(url).includes('/api/agents')) {
    return {
      ok: true,
      json: async () => ({
        data: { agents: [{ slug: 'research', recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' }] },
        error: null,
      }),
    } as Response
  }
  if (String(url).includes('/api/research-sessions')) {
    // POST /api/research-sessions — return legacy cards only (no findings key)
    return {
      ok: true,
      json: async () => ({
        data: { sessionId: 'sess-1', cards: STUB_CARDS },
        error: null,
      }),
    } as Response
  }
  return { ok: true, json: async () => ({ data: null, error: null }) } as Response
})

beforeEach(() => {
  vi.stubGlobal('fetch', defaultFetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ResearchEngine', () => {
  it('hydrates researchDepth from autopilotConfig.research.depth on mount', () => {
    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="overview"
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
        autopilotConfig={FULL_AUTOPILOT_CONFIG}
      >
        <ResearchEngine mode="generate" />
      </StandaloneProjectContextProvider>,
    )

    // The sr-only span carries the current depth value for testing.
    expect(screen.getByTestId('research-depth')).toHaveTextContent('deep')
  })

  it('defaults to medium depth when no autopilotConfig is provided', () => {
    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="step-by-step"
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
        autopilotConfig={null}
      >
        <ResearchEngine mode="generate" />
      </StandaloneProjectContextProvider>,
    )

    expect(screen.getByTestId('research-depth')).toHaveTextContent('medium')
  })

  it('auto-approves all legacy cards and dispatches RESEARCH_COMPLETE when mode === "overview"', async () => {
    // Slice 14.3: useAutoPilotTrigger no longer reads from xstate actor.
    // We mock it to call fire() in a useEffect so it runs after mount (not during
    // render), avoiding the "Too many re-renders" infinite loop.
    vi.mocked(useAutoPilotTrigger).mockImplementation(({ fire }) => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      React.useEffect(() => { void fire() }, [])
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        const s = String(url)
        if (s.includes('/api/agents')) {
          return {
            ok: true,
            json: async () => ({
              data: { agents: [{ slug: 'research', recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' }] },
              error: null,
            }),
          } as Response
        }
        if (s.includes('/api/research-sessions')) {
          return {
            ok: true,
            json: async () => ({
              data: { sessionId: 'sess-auto', cards: STUB_CARDS },
              error: null,
            }),
          } as Response
        }
        return { ok: true, json: async () => ({ data: null, error: null }) } as Response
      }),
    )

    const completedStages: Array<{ stage: string; result: Record<string, unknown> }> = []

    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="overview"
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
        autopilotConfig={FULL_AUTOPILOT_CONFIG}
        initialStageResults={{
          brainstorm: {
            ideaId: 'idea-1',
            ideaTitle: 'AI agents in 2026',
            ideaVerdict: 'viable',
            ideaCoreTension: 'tension',
            completedAt: new Date().toISOString(),
          },
        }}
        onStageComplete={(stage, result) => completedStages.push({ stage, result })}
      >
        <ResearchEngine mode="generate" />
      </StandaloneProjectContextProvider>,
    )

    // Wait for RESEARCH_COMPLETE to be dispatched with all 5 cards.
    await waitFor(() => {
      expect(completedStages.some((e) => e.stage === 'research' && (e.result as { approvedCardsCount?: number }).approvedCardsCount === STUB_CARDS.length)).toBe(true)
    }, { timeout: 3000 })
  })

  it('does not auto-approve cards when mode === "step-by-step"', async () => {
    const completedStages: Array<{ stage: string; result: Record<string, unknown> }> = []

    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="step-by-step"
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
        autopilotConfig={null}
        onStageComplete={(stage, result) => completedStages.push({ stage, result })}
      >
        <ResearchEngine mode="generate" />
      </StandaloneProjectContextProvider>,
    )

    // No auto-pilot trigger in step-by-step; research stays at idle.
    await new Promise((r) => setTimeout(r, 100))
    expect(completedStages.some((e) => e.stage === 'research')).toBe(false)
  })

})

// ─── T9.F152: attempt history tabs ───────────────────────────────────────────

describe('ResearchEngine — allAttempts tabs (T9.F152)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes('/api/agents')) {
          return {
            ok: true,
            json: async () => ({
              data: { agents: [{ slug: 'research', recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' }] },
              error: null,
            }),
          } as Response
        }
        return { ok: true, json: async () => ({ data: null, error: null }) } as Response
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders one tab per attempt when stageRun.allAttempts has multiple entries', async () => {
    const baseAttempt = {
      id: 'sr-res-1',
      projectId: 'proj-1',
      stage: 'research' as const,
      status: 'failed' as const,
      awaitingReason: null,
      payloadRef: null,
      inputJson: null,
      errorMessage: null,
      startedAt: '2026-05-16T01:00:00Z',
      finishedAt: '2026-05-16T01:10:00Z',
      trackId: null,
      publishTargetId: null,
      createdAt: '2026-05-16T01:00:00Z',
      updatedAt: '2026-05-16T01:10:00Z',
    }
    const stageRunWithAttempts: StageRun = {
      ...baseAttempt,
      id: 'sr-res-3',
      status: 'completed',
      attemptNo: 3,
      outcomeJson: { confidence: 0.84 },
      allAttempts: [
        { ...baseAttempt, id: 'sr-res-1', attemptNo: 1, outcomeJson: { confidence: 0.42 } },
        { ...baseAttempt, id: 'sr-res-2', attemptNo: 2, status: 'failed', outcomeJson: { confidence: 0.62 } },
        { ...baseAttempt, id: 'sr-res-3', attemptNo: 3, status: 'completed', outcomeJson: { confidence: 0.84 } },
      ],
    }

    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="step-by-step"
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
      >
        <ResearchEngine mode="generate" stageRun={stageRunWithAttempts} />
      </StandaloneProjectContextProvider>,
    )

    // Three attempt tabs should be visible
    expect(screen.getByTestId('attempt-tab-1')).toBeInTheDocument()
    expect(screen.getByTestId('attempt-tab-2')).toBeInTheDocument()
    expect(screen.getByTestId('attempt-tab-3')).toBeInTheDocument()
  })

  it('renders no attempt tabs when stageRun.allAttempts is empty or absent', async () => {
    const stageRunNoAttempts: StageRun = {
      id: 'sr-res-1',
      projectId: 'proj-1',
      stage: 'research',
      status: 'completed',
      attemptNo: 1,
      awaitingReason: null,
      payloadRef: null,
      inputJson: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      allAttempts: [],
    }

    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="step-by-step"
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
      >
        <ResearchEngine mode="generate" stageRun={stageRunNoAttempts} />
      </StandaloneProjectContextProvider>,
    )

    expect(screen.queryByTestId('attempt-tab-1')).not.toBeInTheDocument()
  })
})

describe('ResearchEngine — stageRun binding (T3.5)', () => {
  const STUB_CARDS_SHORT = [
    { type: 'source', title: 'Source 1', url: 'https://a.com', relevance: 9 },
    { type: 'statistic', title: 'Stat A', claim: 'Stat claim', relevance: 8 },
  ]

  const stageRun: StageRun = {
    id: 'sr-research-1',
    projectId: 'proj-1',
    stage: 'research',
    status: 'queued',
    attemptNo: 1,
    awaitingReason: null,
    payloadRef: null,
    inputJson: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const FULL_AUTOPILOT_CONFIG_OVERVIEW: AutopilotConfig = {
    defaultProvider: 'recommended',
    brainstorm: {
      providerOverride: null,
      mode: 'topic_driven',
      topic: 'AI agents in 2026',
      referenceUrl: null,
      niche: 'enterprise',
      tone: '',
      audience: '',
      goal: '',
      constraints: '',
    },
    research: { providerOverride: null, depth: 'medium' },
    canonicalCore: { providerOverride: null, personaId: null },
    draft: { providerOverride: null, format: 'blog', wordCount: 1500 },
    review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 },
    assets: { providerOverride: null, mode: 'skip' },
    preview: { enabled: false },
    publish: { status: 'draft' },
  }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        const s = String(url)
        if (s.includes('/api/agents')) {
          return {
            ok: true,
            json: async () => ({
              data: { agents: [{ slug: 'research', recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' }] },
              error: null,
            }),
          } as Response
        }
        if (s.includes('/api/research-sessions')) {
          return {
            ok: true,
            json: async () => ({
              data: { sessionId: 'sess-sr-1', cards: STUB_CARDS_SHORT },
              error: null,
            }),
          } as Response
        }
        return { ok: true, json: async () => ({ data: null, error: null }) } as Response
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('signals stage complete when stageRun prop is provided and research auto-completes', async () => {
    // Slice 14.3: useAutoPilotTrigger no longer reads from xstate actor.
    // We mock it to call fire() in a useEffect so it runs after mount (not during
    // render), avoiding the "Too many re-renders" infinite loop.
    vi.mocked(useAutoPilotTrigger).mockImplementation(({ fire }) => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      React.useEffect(() => { void fire() }, [])
    })

    const completedStages: Array<{ stage: string; result: Record<string, unknown> }> = []
    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="overview"
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
        autopilotConfig={FULL_AUTOPILOT_CONFIG_OVERVIEW}
        initialStageResults={{
          brainstorm: {
            ideaId: 'idea-1',
            ideaTitle: 'AI agents in 2026',
            ideaVerdict: 'viable',
            ideaCoreTension: 'tension',
            completedAt: new Date().toISOString(),
          },
        }}
        onStageComplete={(stage, result) => completedStages.push({ stage, result })}
      >
        <ResearchEngine mode="generate" stageRun={stageRun} />
      </StandaloneProjectContextProvider>,
    )

    await waitFor(() => {
      expect(
        completedStages.some(
          (e) => e.stage === 'research' && typeof e.result.researchSessionId === 'string',
        ),
      ).toBe(true)
    }, { timeout: 3000 })
  })
})
