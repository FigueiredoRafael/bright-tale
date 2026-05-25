import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StandaloneProjectContextProvider } from '@/components/pipeline/ProjectContextProvider'
import { DraftEngine } from '../DraftEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'
import type { AutopilotConfig } from '@brighttale/shared'

vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/components/pipeline/PipelineAbortProvider', () => ({
  usePipelineAbort: () => null,
}))

vi.mock('@/hooks/use-auto-pilot-trigger', () => ({
  useAutoPilotTrigger: vi.fn(),
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
  assets: { providerOverride: null, mode: 'skip', imageScope: 'all' as const },
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
    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="overview"
        autopilotConfig={FULL_AUTOPILOT_CONFIG}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
      >
        <DraftEngine mode="generate" />
      </StandaloneProjectContextProvider>,
    )

    // sr-only spans carry the current state values for test queries.
    expect(screen.getByTestId('draft-type')).toHaveTextContent('video')
    expect(screen.getByTestId('draft-word-count')).toHaveTextContent('800')
    expect(screen.getByTestId('persona-select')).toHaveTextContent('p-tech-analyst')
  })

  it('defaults to blog format and no selectedPersonaId when no autopilotConfig is provided', () => {
    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="step-by-step"
        autopilotConfig={null}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
      >
        <DraftEngine mode="generate" />
      </StandaloneProjectContextProvider>,
    )

    expect(screen.getByTestId('draft-type')).toHaveTextContent('blog')
    expect(screen.getByTestId('persona-select')).toBeEmptyDOMElement()
  })

})
