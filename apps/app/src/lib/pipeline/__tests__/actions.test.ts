import { describe, it, expect } from 'vitest'
import {
  mergeStageResult,
  clearStrictlyAfter,
  incrementIterationCount,
  resetIterationCount,
  setLastError,
  clearLastError,
} from '../actions'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'
import type { PipelineMachineContext } from '../machine.types'

const baseContext: PipelineMachineContext = {
  projectId: 'proj-1',
  channelId: 'ch-1',
  projectTitle: 'Test',
  mode: 'step-by-step',
  autopilotConfig: null,
  templateId: null,
  stageResults: {},
  iterationCount: 0,
  lastError: null,
  pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
  creditSettings: DEFAULT_CREDIT_SETTINGS,
  paused: false,
  pauseReason: null,
}

const brainstormResult = {
  ideaId: 'idea-1', ideaTitle: 'Test Idea',
  ideaVerdict: 'viable', ideaCoreTension: 'tension',
}

describe('mergeStageResult', () => {
  it('adds result to stageResults with completedAt timestamp', () => {
    const next = mergeStageResult(baseContext, 'brainstorm', brainstormResult)
    expect(next.stageResults.brainstorm?.ideaId).toBe('idea-1')
    expect(next.stageResults.brainstorm?.completedAt).toBeTruthy()
  })

  it('does not mutate the original context', () => {
    mergeStageResult(baseContext, 'brainstorm', brainstormResult)
    expect(baseContext.stageResults.brainstorm).toBeUndefined()
  })
})

describe('clearStrictlyAfter', () => {
  const ctx: PipelineMachineContext = {
    ...baseContext,
    stageResults: {
      brainstorm: { ...brainstormResult, completedAt: '2026-01-01T00:00:00Z' },
      research: { researchSessionId: 'rs-1', approvedCardsCount: 5, researchLevel: 'medium', completedAt: '2026-01-01T00:00:00Z' },
      draft: { draftId: 'd-1', draftTitle: 'Draft', draftContent: 'content', completedAt: '2026-01-01T00:00:00Z' },
    },
  }

  it('preserves the named stage and earlier stages; removes strictly-later stages', () => {
    const next = clearStrictlyAfter(ctx, 'research')
    expect(next.stageResults.brainstorm).toBeDefined()
    expect(next.stageResults.research).toBeDefined()      // preserved!
    expect(next.stageResults.draft).toBeUndefined()
  })

  it('is a no-op when the named stage is the last stage', () => {
    const ctxFull = { ...ctx, stageResults: { ...ctx.stageResults, publish: { wordpressPostId: 1, publishedUrl: 'x', completedAt: 'x' } as any } }
    const next = clearStrictlyAfter(ctxFull, 'publish')
    expect(Object.keys(next.stageResults)).toHaveLength(Object.keys(ctxFull.stageResults).length)
  })
})

describe('incrementIterationCount / resetIterationCount', () => {
  it('increments iterationCount by 1', () => {
    const next = incrementIterationCount({ ...baseContext, iterationCount: 2 })
    expect(next.iterationCount).toBe(3)
  })

  it('resets iterationCount to 0', () => {
    const next = resetIterationCount({ ...baseContext, iterationCount: 4 })
    expect(next.iterationCount).toBe(0)
  })
})

describe('setLastError / clearLastError', () => {
  it('sets lastError', () => {
    expect(setLastError(baseContext, 'boom').lastError).toBe('boom')
  })

  it('clears lastError', () => {
    expect(clearLastError({ ...baseContext, lastError: 'x' }).lastError).toBeNull()
  })
})
