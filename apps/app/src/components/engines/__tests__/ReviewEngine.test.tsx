/**
 * ReviewEngine stage advance tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StandaloneProjectContextProvider } from '@/components/pipeline/ProjectContextProvider'
import { ReviewEngine } from '@/components/engines/ReviewEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'
import { makeReviewDraftRow } from './fixtures/review'

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

describe('ReviewEngine — stage advance', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        const u = String(url)
        if (u.includes('/api/agents') || u.includes('/api/agent-prompts')) {
          return { ok: true, json: async () => ({ data: { agents: [] }, error: null }) } as Response
        }
        if (u.includes('/api/projects/') && u.includes('/stages')) {
          return {
            ok: true,
            json: async () => ({
              data: {
                tracks: [
                  {
                    id: 'track-1',
                    medium: 'blog',
                    status: 'active',
                    paused: false,
                    stageRuns: {
                      production: { status: 'completed' },
                      review: { status: 'completed' },
                      assets: { status: 'queued' },
                      preview: { status: 'queued' },
                      publish: { status: 'queued' },
                    },
                  },
                ],
              },
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

  it('signals stage complete with review outcome when user approves and clicks Next: Assets', async () => {
    const user = userEvent.setup()
    const approvedDraft = makeReviewDraftRow({ verdict: 'approved', score: 92 })
    const completedStages: Array<{ stage: string; result: Record<string, unknown> }> = []

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
        onStageComplete={(stage, result) => completedStages.push({ stage, result })}
      >
        <ReviewEngine draft={approvedDraft} />
      </StandaloneProjectContextProvider>,
    )

    const approveBtn = await screen.findByRole('button', { name: /next.*assets/i })
    await user.click(approveBtn)

    await waitFor(() => {
      expect(
        completedStages.some((e) => e.stage === 'review' && e.result.score === 92),
      ).toBe(true)
    })
  })
})
