import { describe, it, expect } from 'vitest'
import { setupProjectSchema, startStageSchema } from '../projectSetup'
import { autopilotConfigPatchSchema } from '../autopilotConfig'

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

  it('rejects an unknown top-level key (BRI-28 strict)', () => {
    const result = setupProjectSchema.safeParse({
      mode: 'step-by-step',
      autopilotConfig: null,
      templateId: null,
      startStage: 'brainstorm',
      foo: 1,
    })
    expect(result.success).toBe(false)
  })
})

describe('autopilotConfigPatchSchema (BRI-28 deepPartial)', () => {
  it('accepts a valid partial subset (only review slot)', () => {
    const result = autopilotConfigPatchSchema.safeParse({
      review: {
        maxIterations: 3,
        autoApproveThreshold: 90,
        hardFailThreshold: 40,
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts an empty object (all slots optional)', () => {
    const result = autopilotConfigPatchSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts a full config shape', () => {
    const full = {
      defaultProvider: 'recommended',
      brainstorm: { providerOverride: null, mode: 'topic_driven', topic: 'AI trends' },
      research: { providerOverride: null, depth: 'medium' },
      canonicalCore: { providerOverride: null, personaId: null },
      draft: { providerOverride: null, format: 'blog', wordCount: 800 },
      review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 },
      assets: { providerOverride: null, mode: 'briefs_only' },
      preview: { enabled: false },
      publish: { status: 'draft' },
    }
    const result = autopilotConfigPatchSchema.safeParse(full)
    expect(result.success).toBe(true)
  })

  it('accepts only a single nested field within a slot', () => {
    const result = autopilotConfigPatchSchema.safeParse({
      review: { maxIterations: 2 },
    })
    expect(result.success).toBe(true)
  })
})
