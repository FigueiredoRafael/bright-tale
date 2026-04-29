import { describe, it, expect, vi } from 'vitest'
import { mapLegacyPipelineState } from '../legacy-state-migration'

describe('mapLegacyPipelineState', () => {
  it('returns null for null/empty input', () => {
    expect(mapLegacyPipelineState(null)).toBeNull()
    expect(mapLegacyPipelineState({})).toBeNull()
    expect(mapLegacyPipelineState(undefined)).toBeNull()
  })

  it('maps legacy step-by-step mode to step', () => {
    const out = mapLegacyPipelineState({
      mode: 'step-by-step',
      currentStage: 'draft',
      stageResults: { brainstorm: { ideaId: 'i1', ideaTitle: 'x', ideaVerdict: 'v', ideaCoreTension: 't', completedAt: '2026-01-01' } },
      autoConfig: { maxReviewIterations: 5, targetScore: 90 },
    })
    expect(out?.mode).toBe('step')
    expect(out?.initialStageResults?.brainstorm?.ideaId).toBe('i1')
  })

  it('maps legacy auto mode to auto', () => {
    const out = mapLegacyPipelineState({
      mode: 'auto',
      currentStage: 'review',
      stageResults: {},
      autoConfig: { maxReviewIterations: 5, targetScore: 90 },
    })
    expect(out?.mode).toBe('auto')
  })

  it('lifts review.iterationCount to top-level initialIterationCount', () => {
    const out = mapLegacyPipelineState({
      mode: 'step-by-step',
      currentStage: 'review',
      stageResults: {
        review: { score: 70, iterationCount: 3, verdict: 'needs_revision', feedbackJson: {}, completedAt: '2026-01-01' },
      },
      autoConfig: {},
    })
    expect(out?.initialIterationCount).toBe(3)
  })

  it('maps legacy currentStage to initialStage', () => {
    const out = mapLegacyPipelineState({
      mode: 'step-by-step',
      currentStage: 'draft',
      stageResults: {
        brainstorm: { ideaId: 'i', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c', completedAt: '2026-01-01' },
        research:   { researchSessionId: 'r', approvedCardsCount: 2, researchLevel: 'medium', completedAt: '2026-01-01' },
      },
      autoConfig: {},
    })
    expect(out?.initialStage).toBe('draft')
  })

  it('derives initialStage from furthest completed result when currentStage is missing (new shape)', () => {
    const out = mapLegacyPipelineState({
      mode: 'step',
      iterationCount: 0,
      stageResults: {
        brainstorm: { ideaId: 'i', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c', completedAt: 'x' },
        research:   { researchSessionId: 'r', approvedCardsCount: 2, researchLevel: 'medium', completedAt: 'x' },
      },
    })
    // furthest completed is research, so the next stage to work on is draft
    expect(out?.initialStage).toBe('draft')
  })

  it('defaults initialStage to brainstorm when no results exist', () => {
    const out = mapLegacyPipelineState({ mode: 'step', iterationCount: 0, stageResults: {} })
    expect(out?.initialStage).toBe('brainstorm')
  })

  it('passes through already-new-shape input (idempotent)', () => {
    const input = {
      mode: 'step',
      stageResults: { brainstorm: { ideaId: 'i', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c', completedAt: 'x' } },
      iterationCount: 0,
    }
    const out = mapLegacyPipelineState(input)
    expect(out?.mode).toBe('step')
    expect(out?.initialStageResults?.brainstorm?.ideaId).toBe('i')
    expect(out?.initialIterationCount).toBe(0)
    expect(out?.initialStage).toBe('research')
  })

  it('returns null and logs once for corrupt records (not throws)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Legacy-shaped but with wrong types — stageResults is an array, not an object.
    expect(mapLegacyPipelineState({ mode: 'auto', stageResults: [], autoConfig: {} })).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('pipeline.legacy_state.skipped'))
    warn.mockRestore()
  })
})
