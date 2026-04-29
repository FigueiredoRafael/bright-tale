import { describe, it, expect } from 'vitest'
import { isApprovedGuard, isRejectedGuard, hasReachedMaxIterationsGuard } from '../guards'
import { DEFAULT_PIPELINE_SETTINGS } from '@/components/engines/types'
import type { PipelineMachineContext, PipelineEvent } from '../machine.types'
import { DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'

const baseContext: PipelineMachineContext = {
  projectId: 'proj-1',
  channelId: 'ch-1',
  projectTitle: 'Test',
  mode: 'supervised',
  autopilotConfig: null,
  templateId: null,
  stageResults: {},
  iterationCount: 0,
  lastError: null,
  pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
  creditSettings: DEFAULT_CREDIT_SETTINGS,
  paused: false,
  pauseReason: null,
  pendingDrillIn: null,
  returnPromptOpen: false,
}

function reviewEvent(score: number, iterationCount = 1): Extract<PipelineEvent, { type: 'REVIEW_COMPLETE' }> {
  return {
    type: 'REVIEW_COMPLETE',
    result: { score, iterationCount, verdict: 'needs_revision', feedbackJson: {}, qualityTier: 'needs_revision' },
  }
}

describe('isApprovedGuard', () => {
  it('returns true when score equals approveScore (90)', () => {
    expect(isApprovedGuard({ context: baseContext, event: reviewEvent(90) })).toBe(true)
  })

  it('returns true when score exceeds approveScore', () => {
    expect(isApprovedGuard({ context: baseContext, event: reviewEvent(95) })).toBe(true)
  })

  it('returns false when score is below approveScore', () => {
    expect(isApprovedGuard({ context: baseContext, event: reviewEvent(89) })).toBe(false)
  })
})

describe('isRejectedGuard', () => {
  it('returns true when score is below rejectThreshold (40)', () => {
    expect(isRejectedGuard({ context: baseContext, event: reviewEvent(39) })).toBe(true)
  })

  it('returns false when score equals rejectThreshold', () => {
    expect(isRejectedGuard({ context: baseContext, event: reviewEvent(40) })).toBe(false)
  })

  it('returns false when score is above rejectThreshold', () => {
    expect(isRejectedGuard({ context: baseContext, event: reviewEvent(75) })).toBe(false)
  })
})

describe('hasReachedMaxIterationsGuard', () => {
  // Reads from context.iterationCount, NOT event.result.iterationCount.
  // The machine owns the counter (incremented on `reviewing` entry); engines never forward it.
  it('returns true when context.iterationCount equals maxIterations (5)', () => {
    expect(hasReachedMaxIterationsGuard({ context: { ...baseContext, iterationCount: 5 } })).toBe(true)
  })

  it('returns true when context.iterationCount exceeds maxIterations', () => {
    expect(hasReachedMaxIterationsGuard({ context: { ...baseContext, iterationCount: 6 } })).toBe(true)
  })

  it('returns false when context.iterationCount is below maxIterations', () => {
    expect(hasReachedMaxIterationsGuard({ context: { ...baseContext, iterationCount: 4 } })).toBe(false)
  })

  it('ignores any iterationCount on the event payload', () => {
    // Engine sends a stale value; guard must use context only.
    expect(hasReachedMaxIterationsGuard({ context: { ...baseContext, iterationCount: 5 }, event: reviewEvent(75, 0) })).toBe(true)
    expect(hasReachedMaxIterationsGuard({ context: { ...baseContext, iterationCount: 0 }, event: reviewEvent(75, 99) })).toBe(false)
  })
})
