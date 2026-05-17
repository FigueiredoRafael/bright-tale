/**
 * BrainstormEngine tests — post slice-14.6 (no xstate actor).
 * Uses StandaloneProjectContextProvider.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { StandaloneProjectContextProvider } from '@/components/pipeline/ProjectContextProvider'
import { BrainstormEngine } from '../BrainstormEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types'
import type { AutopilotConfig } from '@brighttale/shared'
import type { StageRun } from '@brighttale/shared/pipeline/inputs'

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

vi.mock('@/hooks/use-pipeline-tracker', () => ({
  usePipelineTracker: () => ({
    trackStarted: vi.fn(),
    trackCompleted: vi.fn(),
    trackFailed: vi.fn(),
    trackAction: vi.fn(),
  }),
}))

vi.mock('@/components/pipeline/PipelineAbortProvider', () => ({
  usePipelineAbort: () => null,
}))

vi.mock('@/hooks/use-auto-pilot-trigger', () => ({
  useAutoPilotTrigger: vi.fn(),
}))

const STUB_IDEAS = [
  { id: 'idea-1', idea_id: 'BC-IDEA-001', title: 'Test Idea', verdict: 'viable', target_audience: 'devs', core_tension: 'tension' },
]
const STUB_SESSION = { id: 'bs-1', input_json: { topic: 'test topic' } }

function mountWithCtx(opts: {
  mode?: 'step-by-step' | 'supervised' | 'overview'
  autopilotConfig?: AutopilotConfig | null
  ideaMode?: 'generate' | 'import'
  onStageComplete?: (stage: string, result: Record<string, unknown>) => void
} = {}) {
  const { mode = 'step-by-step', autopilotConfig = null, ideaMode = 'generate', onStageComplete } = opts
  return render(
    <StandaloneProjectContextProvider
      projectId="proj-1"
      channelId="ch-1"
      mode={mode}
      pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
      creditSettings={DEFAULT_CREDIT_SETTINGS}
      onStageComplete={onStageComplete}
    >
      <BrainstormEngine
        mode={ideaMode}
        initialIdeas={ideaMode === 'generate' ? STUB_IDEAS : undefined}
        initialSession={ideaMode === 'generate' ? STUB_SESSION : undefined}
        preSelectedIdeaId={ideaMode === 'generate' ? 'idea-1' : undefined}
      />
    </StandaloneProjectContextProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/api/ideas/library')) {
        return {
          ok: true,
          json: async () => ({
            data: { ideas: [{ id: 'lib-idea-1', idea_id: 'BC-LIB-001', title: 'Library Idea', verdict: 'viable', target_audience: 'devs', core_tension: 'library tension' }] },
            error: null,
          }),
        } as Response
      }
      if (String(url).includes('/api/agent-prompts')) {
        return { ok: true, json: async () => ({ data: null, error: null }) } as Response
      }
      return { ok: true, json: async () => ({ data: null, error: null }) } as Response
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BrainstormEngine', () => {
  it('signals stage complete and renders confirm button when user confirms idea', async () => {
    const user = userEvent.setup()
    const completedStages: Array<{ stage: string; result: Record<string, unknown> }> = []
    mountWithCtx({
      onStageComplete: (stage, result) => completedStages.push({ stage, result }),
    })

    const confirmBtn = await screen.findByRole('button', { name: /next.*research/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(completedStages.some((e) => e.stage === 'brainstorm' && e.result.ideaId === 'idea-1')).toBe(true)
    })
  })

  it('does not render a Back button on brainstorm (first stage, no navigation back)', () => {
    mountWithCtx()
    expect(screen.queryByRole('button', { name: /^back$/i })).toBeNull()
  })

  it('import mode signals stage complete from ImportPicker selection', async () => {
    const user = userEvent.setup()
    const completedStages: Array<{ stage: string; result: Record<string, unknown> }> = []
    mountWithCtx({ ideaMode: 'import', onStageComplete: (stage, result) => completedStages.push({ stage, result }) })

    const item = await screen.findByText('Library Idea')
    await user.click(item)

    await waitFor(() => {
      expect(completedStages.some((e) => e.stage === 'brainstorm' && e.result.ideaId === 'lib-idea-1')).toBe(true)
    })
  })

  it('hydrates topic + niche from autopilotConfig.brainstorm on mount', () => {
    const autopilotConfig: AutopilotConfig = {
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
      preview: { enabled: false },
      publish: { status: 'draft' },
    }

    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="overview"
        autopilotConfig={autopilotConfig}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
      >
        <BrainstormEngine mode="generate" />
      </StandaloneProjectContextProvider>,
    )

    expect((screen.getByLabelText(/topic/i) as HTMLInputElement).value)
      .toBe('AI agents in 2026')
    expect((screen.getByLabelText(/niche/i) as HTMLInputElement).value)
      .toBe('enterprise')
  })

})

describe('BrainstormEngine — stageRun binding (T3.5)', () => {
  beforeEach(() => {
    mockWriteStageRunOutcome.mockClear()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes('/api/ideas/library')) {
          return {
            ok: true,
            json: async () => ({
              data: { ideas: [] },
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

  it('writes outcome via stage-run-writer when stageRun prop is provided and user confirms idea', async () => {
    const user = userEvent.setup()
    const stageRun = {
      id: 'sr-1',
      projectId: 'proj-1',
      stage: 'brainstorm',
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
    } as StageRun

    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="step-by-step"
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
      >
        <BrainstormEngine
          mode="generate"
          stageRun={stageRun}
          initialIdeas={[{ id: 'idea-1', idea_id: 'BC-IDEA-001', title: 'Test Idea', verdict: 'viable', target_audience: 'devs', core_tension: 'tension' }]}
          initialSession={{ id: 'bs-1', input_json: { topic: 'test topic' } }}
          preSelectedIdeaId="idea-1"
        />
      </StandaloneProjectContextProvider>,
    )

    const confirmBtn = await screen.findByRole('button', { name: /next.*research/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockWriteStageRunOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          stageRunId: 'sr-1',
          outcome: expect.objectContaining({ ideaId: 'idea-1' }),
        }),
      )
    })
  })
})
