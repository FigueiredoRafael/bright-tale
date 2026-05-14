import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { ResearchEngine } from '../ResearchEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'
import type { AutopilotConfig } from '@brighttale/shared'

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
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
  assets: { providerOverride: null, mode: 'skip', imageScope: 'all' as const },
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
    // Mock: POST /api/research-sessions returns 5 cards (legacy sync path, no findings key).
    // The useAutoPilotTrigger fires handleRun because mode=overview, topic is seeded,
    // and recommended provider resolves. handleRun sets cards (no findings), then
    // the cards auto-approve effect dispatches RESEARCH_COMPLETE with approvedCardsCount=5.
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
