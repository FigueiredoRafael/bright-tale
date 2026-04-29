import { describe, it, expect } from 'vitest'
import { autopilotConfigSchema } from '../autopilotConfig'

const minimalCanonical = {
  defaultProvider: 'recommended',
  brainstorm: { providerOverride: null, mode: 'topic_driven', topic: 'AI agents' },
  research:   { providerOverride: null, depth: 'medium' },
  canonicalCore: { providerOverride: null, personaId: null },
  draft:  { providerOverride: null, format: 'blog', wordCount: 1200 },
  review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 },
  assets: { providerOverride: null, mode: 'briefs_only' },
  preview: { enabled: false },
  publish: { status: 'draft' },
}

describe('autopilotConfigSchema', () => {
  it('parses a minimal valid config', () => {
    expect(autopilotConfigSchema.parse(minimalCanonical)).toMatchObject(minimalCanonical)
  })

  it("requires topic in brainstorm.topic_driven mode", () => {
    const bad = { ...minimalCanonical, brainstorm: { ...minimalCanonical.brainstorm, topic: undefined } }
    expect(() => autopilotConfigSchema.parse(bad)).toThrow(/topic/i)
  })

  it("requires referenceUrl in brainstorm.reference_guided mode", () => {
    const bad = {
      ...minimalCanonical,
      brainstorm: { providerOverride: null, mode: 'reference_guided', referenceUrl: '' },
    }
    expect(() => autopilotConfigSchema.parse(bad)).toThrow(/url/i)
  })

  it("requires wordCount when format = 'blog'", () => {
    const bad = { ...minimalCanonical, draft: { providerOverride: null, format: 'blog' } }
    expect(() => autopilotConfigSchema.parse(bad)).toThrow(/word count/i)
  })

  it('rejects review.hardFail >= autoApprove (infinite loop)', () => {
    const bad = { ...minimalCanonical, review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 80, hardFailThreshold: 80 } }
    expect(() => autopilotConfigSchema.parse(bad)).toThrow(/lower than/i)
  })

  it('allows brainstorm/research to be null (project from research/blog entry)', () => {
    const ok = { ...minimalCanonical, brainstorm: null, research: null }
    expect(autopilotConfigSchema.parse(ok)).toMatchObject(ok)
  })

  it('allows review.maxIterations = 0 (skip review)', () => {
    const ok = { ...minimalCanonical, review: { providerOverride: null, maxIterations: 0, autoApproveThreshold: 90, hardFailThreshold: 40 } }
    expect(autopilotConfigSchema.parse(ok).review.maxIterations).toBe(0)
  })

  it('accepts new assets enum: skip / briefs_only / auto_generate', () => {
    const cfg = { ...minimalCanonical, assets: { providerOverride: null, mode: 'briefs_only' } }
    expect(autopilotConfigSchema.parse(cfg)).toMatchObject({ assets: { mode: 'briefs_only' } })
  })

  it('rejects legacy assets values', () => {
    const cfg = { ...minimalCanonical, assets: { providerOverride: null, mode: 'briefing' } }
    expect(() => autopilotConfigSchema.parse(cfg)).toThrow()
  })

  it('requires preview slot with enabled boolean', () => {
    const cfg = { ...minimalCanonical, preview: { enabled: false } }
    expect(autopilotConfigSchema.parse(cfg)).toMatchObject({ preview: { enabled: false } })
  })

  it('requires publish slot with status enum', () => {
    const cfg = { ...minimalCanonical, publish: { status: 'draft' } }
    expect(autopilotConfigSchema.parse(cfg)).toMatchObject({ publish: { status: 'draft' } })
  })
})
