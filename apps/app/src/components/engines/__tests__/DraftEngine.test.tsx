import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { DraftEngine } from '../DraftEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'
import type { AutopilotConfig } from '@brighttale/shared'

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

const STUB_PERSONA = {
  id: 'p-tech-analyst',
  name: 'Tech Analyst',
  slug: 'tech-analyst',
  primaryDomain: 'Technology',
  domainLens: 'enterprise-tech',
  approvedCategories: ['Technology'],
  approvedTags: ['AI', 'enterprise'],
  wpAuthorId: null,
  writingVoiceJson: { signaturePhrases: ['data drives decisions'] },
  soulJson: { humorStyle: 'dry', strongOpinions: ['AI is overrated'] },
}

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
  canonicalCore: { providerOverride: null, personaId: 'p-tech-analyst' },
  draft: { providerOverride: null, format: 'video', wordCount: 800 },
  review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 },
  assets: { providerOverride: null, mode: 'skip' },
  preview: { enabled: false },
  publish: { status: 'draft' },
}

const defaultFetchMock = vi.fn().mockImplementation(async (url: string) => {
  if (String(url).includes('/api/personas')) {
    return {
      ok: true,
      json: async () => ({
        data: [STUB_PERSONA],
        error: null,
      }),
    } as Response
  }
  if (String(url).includes('/api/agents')) {
    return {
      ok: true,
      json: async () => ({
        data: { agents: [{ slug: 'content-core', recommended_provider: 'gemini', recommended_model: 'gemini-2.5-flash' }] },
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

describe('DraftEngine', () => {
  it('hydrates format + wordCount + selectedPersonaId from autopilotConfig on mount', () => {
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
      startStage: 'draft',
    })

    render(
      <PipelineActorProvider value={actor}>
        <DraftEngine mode="generate" />
      </PipelineActorProvider>,
    )

    // sr-only spans carry the current state values for test queries.
    expect(screen.getByTestId('draft-type')).toHaveTextContent('video')
    expect(screen.getByTestId('draft-word-count')).toHaveTextContent('800')
    expect(screen.getByTestId('persona-select')).toHaveTextContent('p-tech-analyst')
  })

  it('defaults to blog format and no selectedPersonaId when no autopilotConfig is provided', () => {
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
      startStage: 'draft',
    })

    render(
      <PipelineActorProvider value={actor}>
        <DraftEngine mode="generate" />
      </PipelineActorProvider>,
    )

    expect(screen.getByTestId('draft-type')).toHaveTextContent('blog')
    expect(screen.getByTestId('persona-select')).toBeEmptyDOMElement()
  })

  it('machine accepts STAGE_PROGRESS with status=Building outline for draft stage', () => {
    // This test verifies the machine wiring for the STAGE_PROGRESS dispatch that
    // handleGenerateCore fires at its entry point. Full UI interaction is skipped
    // because the Generate Core button requires a research session + persona loaded
    // (async prerequisites). We test the actor contract directly.
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
      startStage: 'draft',
    })

    // STAGE_PROGRESS for draft with { status } merges into stageResults.draft
    actor.send({ type: 'STAGE_PROGRESS', stage: 'draft', partial: { status: 'Building outline' } })

    // The status field is merged — stageResults.draft should have it
    const draftPartial = actor.getSnapshot().context.stageResults.draft as { status?: string } | undefined
    expect(draftPartial?.status).toBe('Building outline')
  })
})
