import { describe, it, expect } from 'vitest'
import { setupProjectSchema, startStageSchema } from '../projectSetup'

describe('startStageSchema', () => {
  it('accepts the 8 pipeline stages', () => {
    for (const s of ['brainstorm','research','canonical','production','review','assets','preview','publish']) {
      expect(startStageSchema.parse(s)).toBe(s)
    }
  })

  it('rejects the legacy draft stage', () => {
    expect(() => startStageSchema.parse('draft')).toThrow()
  })
})

describe('setupProjectSchema', () => {
  it("requires autopilotConfig when mode != 'step-by-step'", () => {
    expect(() => setupProjectSchema.parse({
      mode: 'supervised', autopilotConfig: null, templateId: null, startStage: 'brainstorm',
    })).toThrow(/autopilotConfig required/i)
  })
  it("allows null autopilotConfig when mode = 'step-by-step'", () => {
    expect(setupProjectSchema.parse({
      mode: 'step-by-step', autopilotConfig: null, templateId: null, startStage: 'brainstorm',
    }).mode).toBe('step-by-step')
  })
})
