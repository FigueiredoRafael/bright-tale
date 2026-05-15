/**
 * ReviewEngine per-iteration history tests (Task 2.11)
 *
 * These tests verify that saveReviewResult appends to the iterations array
 * on each REVIEW_COMPLETE event, rather than overwriting the previous result.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createActor } from 'xstate'
import React from 'react'
import { pipelineMachine } from '@/lib/pipeline/machine'
import { PipelineActorProvider } from '@/providers/PipelineActorProvider'
import { ReviewEngine } from '@/components/engines/ReviewEngine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'
import { makeReviewDraftRow } from './fixtures/review'
import type { PipelineMachineInput } from '@/lib/pipeline/machine.types'
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

const input: PipelineMachineInput = {
  projectId: 'proj-review-test',
  channelId: 'ch-1',
  projectTitle: 'Review History Test',
  pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
  creditSettings: DEFAULT_CREDIT_SETTINGS,
}

const brainstormResult = {
  ideaId: 'idea-1', ideaTitle: 'Test Idea', ideaVerdict: 'viable', ideaCoreTension: 'tension',
}
const researchResult = {
  researchSessionId: 'rs-1', approvedCardsCount: 5, researchLevel: 'medium',
}
const draftResult = {
  draftId: 'd-1', draftTitle: 'Draft', draftContent: 'content',
}

function reachReviewIdle() {
  const actor = createActor(pipelineMachine, { input })
  actor.start()
  actor.send({ type: 'SETUP_COMPLETE', mode: 'step-by-step', autopilotConfig: null, templateId: null, startStage: 'brainstorm' })
  actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
  actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
  actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
  // Enter reviewing sub-state
  actor.send({ type: 'RESUME' })
  return actor
}

describe('review iterations array accumulates across REVIEW_COMPLETE events', () => {
  beforeEach(() => {
    // Stub fetch for reproduce calls during needs_revision path
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {}, error: null }),
    }))
  })

  it('first REVIEW_COMPLETE creates iterations array with one entry', () => {
    const actor = reachReviewIdle()
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 60, verdict: 'needs_revision', feedbackJson: { summary: 'Intro too weak, needs stronger hook.' }, iterationCount: 1 },
    })
    const review = actor.getSnapshot().context.stageResults.review
    expect(review?.iterations).toHaveLength(1)
    expect(review?.iterations?.[0].score).toBe(60)
    expect(review?.iterations?.[0].verdict).toBe('needs_revision')
    expect(review?.iterations?.[0].oneLineSummary).toBe('Intro too weak, needs stronger hook.')
    expect(review?.iterations?.[0].iterationNum).toBe(1)
    expect(review?.latestFeedbackJson).toEqual({ summary: 'Intro too weak, needs stronger hook.' })
  })

  it('second REVIEW_COMPLETE appends a second entry, preserving the first', async () => {
    const actor = reachReviewIdle()
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 60, verdict: 'needs_revision', feedbackJson: { summary: 'Intro too weak.' }, iterationCount: 1 },
    })
    // After needs_revision, machine starts reproducing — wait for it then resume
    await vi.waitFor(() => {
      const v = actor.getSnapshot().value
      return typeof v === 'object' && 'review' in v
    })
    // Re-enter reviewing for second iteration
    actor.send({ type: 'RESUME' })
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 78, verdict: 'needs_revision', feedbackJson: { summary: 'SEO meta too short.' }, iterationCount: 2 },
    })
    const review = actor.getSnapshot().context.stageResults.review
    expect(review?.iterations).toHaveLength(2)
    expect(review?.iterations?.[0].score).toBe(60)
    expect(review?.iterations?.[1].score).toBe(78)
    expect(review?.iterations?.[1].oneLineSummary).toBe('SEO meta too short.')
    expect(review?.latestFeedbackJson).toEqual({ summary: 'SEO meta too short.' })
  })

  it('final REVIEW_COMPLETE with score >= 90 appends the approved iteration', async () => {
    const actor = reachReviewIdle()
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 60, verdict: 'needs_revision', feedbackJson: { summary: 'Iter 1 issues.' }, iterationCount: 1 },
    })
    await vi.waitFor(() => {
      const v = actor.getSnapshot().value
      return typeof v === 'object' && 'review' in v
    })
    actor.send({ type: 'RESUME' })
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 78, verdict: 'needs_revision', feedbackJson: { summary: 'Iter 2 issues.' }, iterationCount: 2 },
    })
    await vi.waitFor(() => {
      const v = actor.getSnapshot().value
      return typeof v === 'object' && 'review' in v
    })
    actor.send({ type: 'RESUME' })
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 92, verdict: 'approved', feedbackJson: { summary: 'All issues resolved, publish ready.' }, iterationCount: 3 },
    })
    // Machine transitions to assets on approval
    expect(actor.getSnapshot().value).toMatchObject({ assets: 'idle' })
    const review = actor.getSnapshot().context.stageResults.review
    expect(review?.iterations).toHaveLength(3)
    expect(review?.iterations?.[0].score).toBe(60)
    expect(review?.iterations?.[1].score).toBe(78)
    expect(review?.iterations?.[2].score).toBe(92)
    expect(review?.iterations?.[2].verdict).toBe('approved')
    expect(review?.latestFeedbackJson).toEqual({ summary: 'All issues resolved, publish ready.' })
  })

  it('oneLineSummary falls back to "Score N, verdict" when feedbackJson.summary absent', () => {
    const actor = reachReviewIdle()
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 55, verdict: 'needs_revision', feedbackJson: {}, iterationCount: 1 },
    })
    const review = actor.getSnapshot().context.stageResults.review
    expect(review?.iterations?.[0].oneLineSummary).toBe('Score 55, needs_revision')
  })

  it('oneLineSummary is capped at 120 characters', () => {
    const longSummary = 'A'.repeat(200)
    const actor = reachReviewIdle()
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 70, verdict: 'needs_revision', feedbackJson: { summary: longSummary }, iterationCount: 1 },
    })
    const review = actor.getSnapshot().context.stageResults.review
    expect(review?.iterations?.[0].oneLineSummary).toHaveLength(120)
  })
})

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
      startStage: 'review',
    })
    actor.send({
      type: 'STAGE_PROGRESS',
      stage: 'draft',
      partial: { draftId: approvedDraft.id, draftTitle: approvedDraft.title },
    })

    render(
      <PipelineActorProvider value={actor}>
        <ReviewEngine draft={approvedDraft} stageRun={stageRun} />
      </PipelineActorProvider>,
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
