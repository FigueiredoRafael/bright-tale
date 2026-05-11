import { describe, it, expect } from 'vitest'
import { createActor } from 'xstate'
import { pipelineMachine } from '../machine'
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '@/components/engines/types'

function startMachineAt(stage: 'research' | 'assets', extras: Record<string, unknown> = {}) {
  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'p',
      channelId: 'c',
      projectTitle: 't',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
      ...extras,
    },
  })
  actor.start()
  actor.send({
    type: 'SETUP_COMPLETE',
    mode: 'step-by-step',
    autopilotConfig: (extras.autopilotConfig as any) ?? null,
    templateId: null,
    startStage: stage,
  })
  return actor
}

describe('research substates', () => {
  it('starts in research.idle', () => {
    const actor = startMachineAt('research')
    expect(actor.getSnapshot().matches({ research: 'idle' })).toBe(true)
  })

  it('transitions idle → generating on RESEARCH_STARTED', () => {
    const actor = startMachineAt('research')
    actor.send({ type: 'RESEARCH_STARTED' })
    expect(actor.getSnapshot().matches({ research: 'generating' })).toBe(true)
  })

  it('RESEARCH_COMPLETE from generating advances to draft', () => {
    const actor = startMachineAt('research')
    actor.send({ type: 'RESEARCH_STARTED' })
    actor.send({
      type: 'RESEARCH_COMPLETE',
      result: { researchSessionId: 's1', approvedCardsCount: 1, researchLevel: 'medium' },
    })
    expect(actor.getSnapshot().matches('draft')).toBe(true)
  })

  it('RESEARCH_GENERATED returns generating → idle (unlocks button before approval)', () => {
    const actor = startMachineAt('research')
    actor.send({ type: 'RESEARCH_STARTED' })
    expect(actor.getSnapshot().matches({ research: 'generating' })).toBe(true)
    actor.send({ type: 'RESEARCH_GENERATED' })
    expect(actor.getSnapshot().matches({ research: 'idle' })).toBe(true)
  })

  it('STAGE_ERROR from generating goes to research.error', () => {
    const actor = startMachineAt('research')
    actor.send({ type: 'RESEARCH_STARTED' })
    actor.send({ type: 'STAGE_ERROR', error: 'boom' })
    expect(actor.getSnapshot().matches({ research: 'error' })).toBe(true)
  })
})

describe('assets substates', () => {
  const minimalAutopilot = {
    review: { maxIterations: 0 },
    assets: { mode: 'auto_generate' },
  }

  it('starts in assets.idle', () => {
    const actor = startMachineAt('assets', { autopilotConfig: minimalAutopilot })
    expect(actor.getSnapshot().matches({ assets: 'idle' })).toBe(true)
  })

  it('idle → generatingBriefs on ASSETS_BRIEFS_STARTED', () => {
    const actor = startMachineAt('assets', { autopilotConfig: minimalAutopilot })
    actor.send({ type: 'ASSETS_BRIEFS_STARTED' })
    expect(actor.getSnapshot().matches({ assets: 'generatingBriefs' })).toBe(true)
  })

  it('generatingBriefs → refining on ASSETS_BRIEFS_COMPLETE', () => {
    const actor = startMachineAt('assets', { autopilotConfig: minimalAutopilot })
    actor.send({ type: 'ASSETS_BRIEFS_STARTED' })
    actor.send({ type: 'ASSETS_BRIEFS_COMPLETE' })
    expect(actor.getSnapshot().matches({ assets: 'refining' })).toBe(true)
  })

  it('refining → generatingImages when mode is auto_generate', () => {
    const actor = startMachineAt('assets', { autopilotConfig: minimalAutopilot })
    actor.send({ type: 'ASSETS_BRIEFS_STARTED' })
    actor.send({ type: 'ASSETS_BRIEFS_COMPLETE' })
    actor.send({ type: 'ASSETS_IMAGES_STARTED' })
    expect(actor.getSnapshot().matches({ assets: 'generatingImages' })).toBe(true)
  })

  it('refining stays put when mode is briefs_only and ASSETS_IMAGES_STARTED fires', () => {
    const briefsOnly = { ...minimalAutopilot, assets: { mode: 'briefs_only' } }
    const actor = startMachineAt('assets', { autopilotConfig: briefsOnly })
    actor.send({ type: 'ASSETS_BRIEFS_STARTED' })
    actor.send({ type: 'ASSETS_BRIEFS_COMPLETE' })
    actor.send({ type: 'ASSETS_IMAGES_STARTED' })
    expect(actor.getSnapshot().matches({ assets: 'refining' })).toBe(true)
  })
})
