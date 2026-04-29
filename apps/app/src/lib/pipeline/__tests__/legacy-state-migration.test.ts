import { describe, it, expect, vi } from 'vitest'
import { createActor } from 'xstate'
import { mapLegacyPipelineState, mapLegacyToSnapshot } from '../legacy-state-migration'
import { pipelineMachine } from '../machine'

describe('normalizeMode (tri-mode)', () => {
  it("'auto' → 'supervised'", () => {
    const snap = mapLegacyToSnapshot({ mode: 'auto', stageResults: { brainstorm: {} } })
    expect((snap as any)?.context.mode).toBe('supervised')
  })

  it("'step' → null (fresh setup)", () => {
    const snap = mapLegacyToSnapshot({ mode: 'step', stageResults: {} })
    expect((snap as any)?.context.mode).toBeNull()
  })

  it("'step-by-step' is preserved", () => {
    const snap = mapLegacyToSnapshot({
      mode: 'step-by-step',
      stageResults: { brainstorm: {} },
    })
    expect((snap as any)?.context.mode).toBe('step-by-step')
  })

  it("'overview' is preserved", () => {
    const snap = mapLegacyToSnapshot({ mode: 'overview', stageResults: { brainstorm: {} } })
    expect((snap as any)?.context.mode).toBe('overview')
  })
})

describe('mapLegacyToSnapshot', () => {
  it('returns null for empty/null input (fresh project → input path)', () => {
    expect(mapLegacyToSnapshot(null)).toBeNull()
    expect(mapLegacyToSnapshot({})).toBeNull()
  })

  it('builds an active snapshot at the saved stage that boots a real actor', () => {
    const snap = mapLegacyToSnapshot({
      mode: 'auto',
      currentStage: 'draft',
      stageResults: {
        brainstorm: {
          ideaId: 'i',
          ideaTitle: 't',
          ideaVerdict: 'v',
          ideaCoreTension: 'c',
          completedAt: '2026-01-01',
        },
        research: {
          researchSessionId: 'r',
          approvedCardsCount: 2,
          researchLevel: 'medium',
          completedAt: '2026-01-01',
        },
      },
    })
    expect(snap).not.toBeNull()

    // Boot a real actor with the snapshot
    const actor = createActor(pipelineMachine, { snapshot: snap! } as any)
    actor.start()
    const state = actor.getSnapshot()

    // Verify the state tree and context
    // state.value is { draft: 'idle' } because draft is a compound state
    expect(state.value).toEqual({ draft: 'idle' })
    expect((state as any).context.mode).toBe('supervised')
    expect((state as any).context.autopilotConfig).toBeNull()
    expect((state as any).context.templateId).toBeNull()
    expect((state as any).context.stageResults.brainstorm).toBeDefined()
    expect((state as any).context.stageResults.research).toBeDefined()
    actor.stop()
  })

  it('hydrated actor accepts subsequent events (proves snapshot is well-formed)', () => {
    const snap = mapLegacyToSnapshot({
      mode: 'auto',
      currentStage: 'draft',
      stageResults: {
        brainstorm: {
          ideaId: 'i',
          ideaTitle: 't',
          ideaVerdict: 'v',
          ideaCoreTension: 'c',
          completedAt: '2026-01-01',
        },
      },
    })
    if (!snap) throw new Error('snap is null')

    const actor = createActor(pipelineMachine, { snapshot: snap } as any)
    actor.start()

    // Send an event and verify state transition
    actor.send({ type: 'STAGE_ERROR', error: 'test error' })
    const state = actor.getSnapshot()
    expect(state.value).toEqual({ draft: 'error' })
    actor.stop()
  })

  it('includes projectId, channelId, projectTitle from input', () => {
    const snap = mapLegacyToSnapshot({
      projectId: 'proj-123',
      channelId: 'chan-456',
      projectTitle: 'My Project',
      mode: 'step-by-step',
      stageResults: { brainstorm: {} },
    })
    expect((snap as any)?.context.projectId).toBe('proj-123')
    expect((snap as any)?.context.channelId).toBe('chan-456')
    expect((snap as any)?.context.projectTitle).toBe('My Project')
  })
})

describe('mapLegacyPipelineState', () => {
  it('returns null for null/empty input', () => {
    expect(mapLegacyPipelineState(null)).toBeNull()
    expect(mapLegacyPipelineState({})).toBeNull()
    expect(mapLegacyPipelineState(undefined)).toBeNull()
  })

  it('maps legacy step-by-step mode to step-by-step', () => {
    const out = mapLegacyPipelineState({
      mode: 'step-by-step',
      currentStage: 'draft',
      stageResults: {
        brainstorm: {
          ideaId: 'i1',
          ideaTitle: 'x',
          ideaVerdict: 'v',
          ideaCoreTension: 't',
          completedAt: '2026-01-01',
        },
      },
      autoConfig: { maxReviewIterations: 5, targetScore: 90 },
    })
    expect(out?.mode).toBe('step-by-step')
    expect(out?.initialStageResults?.brainstorm?.ideaId).toBe('i1')
  })

  it('maps legacy auto mode to supervised', () => {
    const out = mapLegacyPipelineState({
      mode: 'auto',
      currentStage: 'review',
      stageResults: {},
      autoConfig: { maxReviewIterations: 5, targetScore: 90 },
    })
    expect(out?.mode).toBe('supervised')
  })

  it('lifts review.iterationCount to top-level initialIterationCount', () => {
    const out = mapLegacyPipelineState({
      mode: 'step-by-step',
      currentStage: 'review',
      stageResults: {
        review: {
          score: 70,
          iterationCount: 3,
          verdict: 'needs_revision',
          feedbackJson: {},
          completedAt: '2026-01-01',
        },
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
        brainstorm: {
          ideaId: 'i',
          ideaTitle: 't',
          ideaVerdict: 'v',
          ideaCoreTension: 'c',
          completedAt: '2026-01-01',
        },
        research: {
          researchSessionId: 'r',
          approvedCardsCount: 2,
          researchLevel: 'medium',
          completedAt: '2026-01-01',
        },
      },
      autoConfig: {},
    })
    expect(out?.initialStage).toBe('draft')
  })

  it('derives initialStage from furthest completed result when currentStage is missing (new shape)', () => {
    const out = mapLegacyPipelineState({
      mode: 'step-by-step',
      iterationCount: 0,
      stageResults: {
        brainstorm: {
          ideaId: 'i',
          ideaTitle: 't',
          ideaVerdict: 'v',
          ideaCoreTension: 'c',
          completedAt: 'x',
        },
        research: {
          researchSessionId: 'r',
          approvedCardsCount: 2,
          researchLevel: 'medium',
          completedAt: 'x',
        },
      },
    })
    // furthest completed is research, so the next stage to work on is draft
    expect(out?.initialStage).toBe('draft')
  })

  it('defaults initialStage to brainstorm when no results exist', () => {
    const out = mapLegacyPipelineState({
      mode: 'step-by-step',
      iterationCount: 0,
      stageResults: {},
    })
    expect(out?.initialStage).toBe('brainstorm')
  })

  it('passes through already-new-shape input (idempotent)', () => {
    const input = {
      mode: 'step-by-step',
      stageResults: {
        brainstorm: {
          ideaId: 'i',
          ideaTitle: 't',
          ideaVerdict: 'v',
          ideaCoreTension: 'c',
          completedAt: 'x',
        },
      },
      iterationCount: 0,
    }
    const out = mapLegacyPipelineState(input)
    expect(out?.mode).toBe('step-by-step')
    expect(out?.initialStageResults?.brainstorm?.ideaId).toBe('i')
    expect(out?.initialIterationCount).toBe(0)
    expect(out?.initialStage).toBe('research')
  })

  it('returns null and logs once for corrupt records (not throws)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Legacy-shaped but with wrong types — stageResults is an array, not an object.
    expect(mapLegacyPipelineState({ mode: 'auto', stageResults: [], autoConfig: {} }))
      .toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('pipeline.legacy_state.skipped'))
    warn.mockRestore()
  })
})
