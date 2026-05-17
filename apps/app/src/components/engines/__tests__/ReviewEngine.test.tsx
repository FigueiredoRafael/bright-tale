/**
 * ReviewEngine stageRun binding tests (T3.5)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StandaloneProjectContextProvider } from '@/components/pipeline/ProjectContextProvider'
import { ReviewEngine } from '@/components/engines/ReviewEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'
import { makeReviewDraftRow } from './fixtures/review'
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

vi.mock('@/components/pipeline/PipelineAbortProvider', () => ({
  usePipelineAbort: () => null,
}))

vi.mock('@/hooks/use-auto-pilot-trigger', () => ({
  useAutoPilotTrigger: vi.fn(),
}))

describe('ReviewEngine — stageRun binding (T3.5)', () => {
  const stageRun: StageRun = {
    id: 'sr-review-1',
    projectId: 'proj-1',
    stage: 'review',
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

  beforeEach(() => {
    mockWriteStageRunOutcome.mockClear()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        const u = String(url)
        if (u.includes('/api/agents') || u.includes('/api/agent-prompts')) {
          return { ok: true, json: async () => ({ data: { agents: [] }, error: null }) } as Response
        }
        return { ok: true, json: async () => ({ data: null, error: null }) } as Response
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes outcome via stage-run-writer when stageRun prop is provided and user approves review', async () => {
    const user = userEvent.setup()
    const approvedDraft = makeReviewDraftRow({ verdict: 'approved', score: 92 })

    render(
      <StandaloneProjectContextProvider
        projectId="proj-1"
        channelId="ch-1"
        mode="step-by-step"
        autopilotConfig={null}
        initialStageResults={{
          draft: { draftId: approvedDraft.id, draftTitle: approvedDraft.title, draftContent: '', completedAt: new Date().toISOString() },
        }}
        pipelineSettings={DEFAULT_PIPELINE_SETTINGS}
        creditSettings={DEFAULT_CREDIT_SETTINGS}
      >
        <ReviewEngine draft={approvedDraft} stageRun={stageRun} />
      </StandaloneProjectContextProvider>,
    )

    const approveBtn = await screen.findByRole('button', { name: /next.*assets/i })
    await user.click(approveBtn)

    await waitFor(() => {
      expect(mockWriteStageRunOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          stageRunId: 'sr-review-1',
          outcome: expect.objectContaining({ score: 92 }),
        }),
      )
    })
  })
})
