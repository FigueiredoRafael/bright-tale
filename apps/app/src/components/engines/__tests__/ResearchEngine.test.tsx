import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { ResearchEngine } from '../ResearchEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'
import type { AutopilotConfig } from '@brighttale/shared'
import type { StageRun } from '@brighttale/shared/pipeline/inputs'
import { useAutoPilotTrigger } from '@/hooks/use-auto-pilot-trigger'

const mockWriteStageRunOutcome = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/api/stageRuns', () => ({
  get writeStageRunOutcome() {
    return mockWriteStageRunOutcome
  },
}))

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
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
    // Mount with a fresh actor (no brainstorm seed needed for hydration test)
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
      autopilotConfig: FULL_AUTOPILOT_CONFIG,
      templateId: null,
      startStage: 'research',
    })

    render(
      <PipelineActorProvider value={actor}>
        <ResearchEngine mode="generate" />
      </PipelineActorProvider>,
    )

    // The sr-only span carries the current depth value for testing.
    expect(screen.getByTestId('research-depth')).toHaveTextContent('deep')
  })

  it('defaults to medium depth when no autopilotConfig is provided', () => {
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
      mode: 'step-by-step',
      autopilotConfig: null,
      templateId: null,
      startStage: 'research',
    })

    render(
      <PipelineActorProvider value={actor}>
        <ResearchEngine mode="generate" />
      </PipelineActorProvider>,
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

    const actor = createActor(pipelineMachine, {
      input: {
        projectId: 'proj-1',
        channelId: 'ch-1',
        projectTitle: 'T',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
        initialStageResults: {
          brainstorm: {
            ideaId: 'idea-1',
            ideaTitle: 'AI agents in 2026',
            ideaVerdict: 'viable',
            ideaCoreTension: 'tension',
            completedAt: new Date().toISOString(),
          },
        },
      },
    }).start()

    actor.send({
      type: 'SETUP_COMPLETE',
      mode: 'overview',
      autopilotConfig: FULL_AUTOPILOT_CONFIG,
      templateId: null,
      startStage: 'research',
    })

    render(
      <PipelineActorProvider value={actor}>
        <ResearchEngine mode="generate" />
      </PipelineActorProvider>,
    )

    // Wait for RESEARCH_COMPLETE to be dispatched with all 5 cards.
    await waitFor(() => {
      const snap = actor.getSnapshot()
      expect(snap.context.stageResults.research).toBeDefined()
      expect(snap.context.stageResults.research?.approvedCardsCount).toBe(STUB_CARDS.length)
    }, { timeout: 3000 })
  })

  it('does not auto-approve cards when mode === "step-by-step"', async () => {
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
      mode: 'step-by-step',
      autopilotConfig: null,
      templateId: null,
      startStage: 'research',
    })

    render(
      <PipelineActorProvider value={actor}>
        <ResearchEngine mode="generate" />
      </PipelineActorProvider>,
    )

    // No auto-pilot trigger in step-by-step; research stays at idle.
    await new Promise((r) => setTimeout(r, 100))
    expect(actor.getSnapshot().context.stageResults.research).toBeUndefined()
  })

  it('machine accepts STAGE_PROGRESS with status=Researching topic for research stage', () => {
    // Verifies the actor wiring for the STAGE_PROGRESS dispatch that handleRun fires.
    // Full UI click is skipped because clicking "Research" triggers EventSource (SSE)
    // which is not available in jsdom. We test the machine contract directly.
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
      mode: 'step-by-step',
      autopilotConfig: null,
      templateId: null,
      startStage: 'research',
    })

    actor.send({ type: 'STAGE_PROGRESS', stage: 'research', partial: { status: 'Researching topic' } })

    const partial = actor.getSnapshot().context.stageResults.research as { status?: string } | undefined
    expect(partial?.status).toBe('Researching topic')
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
      mode: 'step-by-step',
      autopilotConfig: null,
      templateId: null,
      startStage: 'research',
    })

    render(
      <PipelineActorProvider value={actor}>
        <ResearchEngine mode="generate" stageRun={stageRunWithAttempts} />
      </PipelineActorProvider>,
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
      mode: 'step-by-step',
      autopilotConfig: null,
      templateId: null,
      startStage: 'research',
    })

    render(
      <PipelineActorProvider value={actor}>
        <ResearchEngine mode="generate" stageRun={stageRunNoAttempts} />
      </PipelineActorProvider>,
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
    mockWriteStageRunOutcome.mockClear()
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

  it('writes outcome via stage-run-writer when stageRun prop is provided and research auto-completes', async () => {
    // Slice 14.3: useAutoPilotTrigger no longer reads from xstate actor.
    // We mock it to call fire() in a useEffect so it runs after mount (not during
    // render), avoiding the "Too many re-renders" infinite loop.
    vi.mocked(useAutoPilotTrigger).mockImplementation(({ fire }) => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      React.useEffect(() => { void fire() }, [])
    })

    const actor = createActor(pipelineMachine, {
      input: {
        projectId: 'proj-1',
        channelId: 'ch-1',
        projectTitle: 'T',
        pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
        creditSettings: DEFAULT_CREDIT_SETTINGS,
        initialStageResults: {
          brainstorm: {
            ideaId: 'idea-1',
            ideaTitle: 'AI agents in 2026',
            ideaVerdict: 'viable',
            ideaCoreTension: 'tension',
            completedAt: new Date().toISOString(),
          },
        },
      },
    }).start()

    actor.send({
      type: 'SETUP_COMPLETE',
      mode: 'overview',
      autopilotConfig: FULL_AUTOPILOT_CONFIG_OVERVIEW,
      templateId: null,
      startStage: 'research',
    })

    render(
      <PipelineActorProvider value={actor}>
        <ResearchEngine mode="generate" stageRun={stageRun} />
      </PipelineActorProvider>,
    )

    await waitFor(() => {
      expect(mockWriteStageRunOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          stageRunId: 'sr-research-1',
          outcome: expect.objectContaining({ researchSessionId: expect.any(String) }),
        }),
      )
    }, { timeout: 3000 })
  })
})
