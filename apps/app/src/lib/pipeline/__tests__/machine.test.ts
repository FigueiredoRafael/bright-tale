import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createActor } from 'xstate'
import { pipelineMachine } from '../machine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'
import type { PipelineMachineInput } from '../machine.types'
import type { AutopilotConfig } from '@brighttale/shared'

const input: PipelineMachineInput = {
  projectId: 'proj-1',
  channelId: 'ch-1',
  projectTitle: 'Test Project',
  pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
  creditSettings: DEFAULT_CREDIT_SETTINGS,
}

const brainstormResult = {
  ideaId: 'idea-1', ideaTitle: 'Test', ideaVerdict: 'viable', ideaCoreTension: 'tension',
}
const researchResult = {
  researchSessionId: 'rs-1', approvedCardsCount: 5, researchLevel: 'medium',
}
const draftResult = {
  draftId: 'd-1', draftTitle: 'Draft', draftContent: 'content',
}

function startActor(overrides?: Partial<PipelineMachineInput>, autoSetup = true) {
  const actor = createActor(pipelineMachine, { input: { ...input, ...overrides } })
  actor.start()
  // Automatically transition from setup to brainstorm for tests unless autoSetup is false
  if (autoSetup) {
    const mode = overrides?.mode ?? 'step-by-step'
    actor.send({ type: 'SETUP_COMPLETE', mode, autopilotConfig: null, templateId: null, startStage: 'brainstorm' })
  }
  return actor
}

describe('initial state', () => {
  it('starts in setup when no input.mode is provided', () => {
    const actor = startActor({}, false)
    expect(actor.getSnapshot().value).toBe('setup')
  })

  it('seeds context from input', () => {
    const actor = startActor({}, false)
    const ctx = actor.getSnapshot().context
    expect(ctx.projectId).toBe('proj-1')
    expect(ctx.iterationCount).toBe(0)
    expect(ctx.mode).toBeNull()
  })
})

describe('stage transitions', () => {
  it('transitions brainstorm → research on BRAINSTORM_COMPLETE', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    expect(actor.getSnapshot().value).toMatchObject({ research: 'idle' })
  })

  it('saves brainstorm result to context', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    expect(actor.getSnapshot().context.stageResults.brainstorm?.ideaId).toBe('idea-1')
  })

  it('transitions research → draft on RESEARCH_COMPLETE', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    expect(actor.getSnapshot().value).toMatchObject({ draft: 'idle' })
  })

  it('transitions draft → review on DRAFT_COMPLETE', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    expect(actor.getSnapshot().value).toMatchObject({ review: 'idle' })
  })
})

describe('review loop', () => {
  function reachReview() {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    actor.send({ type: 'RESUME' }) // enter reviewing sub-state
    return actor
  }

  it('transitions to assets when score >= approveScore (90)', () => {
    const actor = reachReview()
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 92, verdict: 'approved', feedbackJson: {}, iterationCount: 1 },
    })
    expect(actor.getSnapshot().value).toMatchObject({ assets: 'idle' })
  })

  it('pauses when score < rejectThreshold (40)', () => {
    const actor = reachReview()
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 30, verdict: 'rejected', feedbackJson: {}, iterationCount: 1 },
    })
    expect(actor.getSnapshot().value).toMatchObject({ review: 'paused' })
  })

  it('pauses when context.iterationCount >= maxIterations (5)', () => {
    const actor = startActor({ initialIterationCount: 4 })
    expect(actor.getSnapshot().context.iterationCount).toBe(4)
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    actor.send({ type: 'RESUME' })
    expect(actor.getSnapshot().context.iterationCount).toBe(5)
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 75, verdict: 'needs_revision', feedbackJson: {}, iterationCount: 0 },
    })
    expect(actor.getSnapshot().value).toMatchObject({ review: 'paused' })
    expect(actor.getSnapshot().context.stageResults.review?.iterationCount).toBe(5)
  })
})

describe('NAVIGATE (no clear)', () => {
  it('jumps to earlier stage without clearing any results', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'NAVIGATE', toStage: 'brainstorm' })
    const ctx = actor.getSnapshot().context
    expect(ctx.stageResults.brainstorm).toBeDefined()
    expect(ctx.stageResults.research).toBeDefined()
    expect(actor.getSnapshot().value).toMatchObject({ brainstorm: 'idle' })
  })
})

describe('REDO_FROM (clear strictly-downstream)', () => {
  it('clears stages strictly after fromStage; preserves fromStage result', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    actor.send({ type: 'REDO_FROM', fromStage: 'research' })
    const ctx = actor.getSnapshot().context
    expect(ctx.stageResults.brainstorm).toBeDefined()
    expect(ctx.stageResults.research).toBeDefined()
    expect(ctx.stageResults.draft).toBeUndefined()
    expect(actor.getSnapshot().value).toMatchObject({ research: 'idle' })
  })
})

describe('iterationCount ownership', () => {
  it('increments iterationCount on entering reviewing substate', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    expect(actor.getSnapshot().context.iterationCount).toBe(0)
    actor.send({ type: 'RESUME' })
    expect(actor.getSnapshot().context.iterationCount).toBe(1)
  })

  it('resets iterationCount to 0 on REDO_FROM fromStage=draft', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    actor.send({ type: 'RESUME' })
    actor.send({ type: 'REDO_FROM', fromStage: 'draft' })
    expect(actor.getSnapshot().context.iterationCount).toBe(0)
  })
})

describe('lastError surfacing', () => {
  it('sets lastError on STAGE_ERROR', () => {
    const actor = startActor()
    actor.send({ type: 'STAGE_ERROR', error: 'Brainstorm API down' })
    expect(actor.getSnapshot().context.lastError).toBe('Brainstorm API down')
  })

  it('clears lastError on RETRY', () => {
    const actor = startActor()
    actor.send({ type: 'STAGE_ERROR', error: 'boom' })
    actor.send({ type: 'RETRY' })
    expect(actor.getSnapshot().context.lastError).toBeNull()
  })
})

describe('concurrent actors', () => {
  it('two actors with different projectIds do not share state', () => {
    const a1 = startActor({ projectId: 'proj-A' })
    const a2 = startActor({ projectId: 'proj-B' })
    a1.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    expect(a1.getSnapshot().value).toMatchObject({ research: 'idle' })
    expect(a2.getSnapshot().value).toMatchObject({ brainstorm: 'idle' })
  })
})

describe('STAGE_PROGRESS merging', () => {
  it('merges partial into the named stage without advancing', () => {
    const actor = startActor()
    actor.send({ type: 'STAGE_PROGRESS', stage: 'brainstorm', partial: { ideaTitle: 'Draft Title' } })
    expect(actor.getSnapshot().value).toMatchObject({ brainstorm: 'idle' })
    expect((actor.getSnapshot().context.stageResults as Record<string, unknown>).brainstorm).toMatchObject({
      ideaTitle: 'Draft Title',
    })
  })

  it('ignores STAGE_PROGRESS with an unknown stage', () => {
    const actor = startActor()
    actor.send({ type: 'STAGE_PROGRESS', stage: 'not-a-stage' as never, partial: { x: 1 } })
    expect(actor.getSnapshot().context.stageResults).toEqual({})
  })
})

describe('re-completing a stage does NOT clear downstream', () => {
  it('keeps downstream results when an earlier stage is re-completed', () => {
    const actor = startActor()
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    actor.send({ type: 'NAVIGATE', toStage: 'brainstorm' })
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: { ...brainstormResult, ideaTitle: 'Updated' } })
    const ctx = actor.getSnapshot().context
    expect(ctx.stageResults.brainstorm?.ideaTitle).toBe('Updated')
    expect(ctx.stageResults.research).toBeDefined()
    expect(ctx.stageResults.draft).toBeDefined()
  })
})

describe('auto-pilot vs step mode after reproduce', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {}, error: null }),
    }))
  })

  function reachReproducing(mode: 'supervised' | 'step-by-step') {
    const actor = startActor({ mode })
    actor.send({ type: 'SETUP_COMPLETE', mode, autopilotConfig: null, templateId: null, startStage: 'brainstorm' })
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    actor.send({ type: 'RESUME' })
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 70, verdict: 'needs_revision', feedbackJson: {}, iterationCount: 1 },
    })
    return actor
  }

  it('auto mode: reproducing.onDone re-enters reviewing directly', async () => {
    const actor = reachReproducing('supervised')
    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toMatchObject({ review: 'reviewing' })
    })
  })

  it('step mode: reproducing.onDone drops to idle (waits for user RESUME)', async () => {
    const actor = reachReproducing('step-by-step')
    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toMatchObject({ review: 'idle' })
    })
  })

  it('reproducing.onError routes to paused and writes lastError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null, error: { message: 'Reproduce failed' } }),
    }))
    const actor = startActor({ mode: 'supervised' })
    actor.send({ type: 'SETUP_COMPLETE', mode: 'supervised', autopilotConfig: null, templateId: null, startStage: 'brainstorm' })
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    actor.send({ type: 'RESUME' })
    actor.send({
      type: 'REVIEW_COMPLETE',
      result: { score: 70, verdict: 'needs_revision', feedbackJson: {}, iterationCount: 1 },
    })
    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toMatchObject({ review: 'paused' })
      expect(actor.getSnapshot().context.lastError).toBe('Reproduce failed')
    })
  })
})

describe('setup state and SETUP_COMPLETE', () => {
  const baseAutopilotConfig: AutopilotConfig = {
    defaultProvider: 'recommended',
    brainstorm: {
      providerOverride: null,
      mode: 'topic_driven',
      topic: 'AI',
      referenceUrl: null,
      niche: undefined,
      tone: undefined,
      audience: undefined,
      goal: undefined,
      constraints: undefined,
    },
    research: { providerOverride: null, depth: 'medium' },
    canonicalCore: { providerOverride: null, personaId: null },
    draft: { providerOverride: null, format: 'blog', wordCount: 1000 },
    review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 },
    assets: { providerOverride: null, mode: 'auto' },
  }

  it('SETUP_COMPLETE with startStage=draft transitions to draft', () => {
    const actor = startActor({}, false)
    actor.send({
      type: 'SETUP_COMPLETE',
      mode: 'supervised',
      autopilotConfig: baseAutopilotConfig,
      templateId: null,
      startStage: 'draft',
    })
    expect(actor.getSnapshot().value).toMatchObject({ draft: 'idle' })
    expect(actor.getSnapshot().context.mode).toBe('supervised')
    expect(actor.getSnapshot().context.autopilotConfig).toEqual(baseAutopilotConfig)
  })

  it('GO_AUTOPILOT updates mode + config without changing stage', () => {
    const actor = startActor({}, false)
    actor.send({ type: 'SETUP_COMPLETE', mode: 'step-by-step', autopilotConfig: null, templateId: null, startStage: 'draft' })
    expect(actor.getSnapshot().value).toMatchObject({ draft: 'idle' })
    actor.send({ type: 'GO_AUTOPILOT', mode: 'overview', autopilotConfig: baseAutopilotConfig })
    expect(actor.getSnapshot().value).toMatchObject({ draft: 'idle' })
    expect(actor.getSnapshot().context.mode).toBe('overview')
    expect(actor.getSnapshot().context.autopilotConfig).toEqual(baseAutopilotConfig)
  })

  it('RESET_TO_SETUP returns to setup and wipes results AND mode/config/templateId', () => {
    const actor = startActor({}, false)
    actor.send({ type: 'SETUP_COMPLETE', mode: 'supervised', autopilotConfig: baseAutopilotConfig, templateId: 'tpl-1', startStage: 'brainstorm' })
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    expect(actor.getSnapshot().value).toMatchObject({ research: 'idle' })
    actor.send({ type: 'RESET_TO_SETUP' })
    const ctx = actor.getSnapshot().context
    expect(actor.getSnapshot().value).toBe('setup')
    expect(ctx.stageResults).toEqual({})
    expect(ctx.iterationCount).toBe(0)
    expect(ctx.mode).toBeNull()
    expect(ctx.autopilotConfig).toBeNull()
    expect(ctx.templateId).toBeNull()
    expect(ctx.paused).toBe(false)
  })

  it('DRAFT_COMPLETE with maxIterations=0 routes to assets (skip review)', () => {
    const skipReviewConfig: AutopilotConfig = {
      ...baseAutopilotConfig,
      review: { ...baseAutopilotConfig.review, maxIterations: 0 },
    }
    const actor = startActor({}, false)
    actor.send({ type: 'SETUP_COMPLETE', mode: 'supervised', autopilotConfig: skipReviewConfig, templateId: null, startStage: 'brainstorm' })
    actor.send({ type: 'BRAINSTORM_COMPLETE', result: brainstormResult })
    actor.send({ type: 'RESEARCH_COMPLETE', result: researchResult })
    actor.send({ type: 'DRAFT_COMPLETE', result: draftResult })
    expect(actor.getSnapshot().value).toMatchObject({ assets: 'idle' })
  })
})
