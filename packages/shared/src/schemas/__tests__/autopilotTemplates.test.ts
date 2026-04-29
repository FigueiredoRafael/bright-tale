import { describe, it, expect } from 'vitest'
import {
  createAutopilotTemplateSchema,
  updateAutopilotTemplateSchema,
} from '../autopilotTemplates'

const validConfig = {
  defaultProvider: 'recommended',
  brainstorm: { providerOverride: null, mode: 'topic_driven', topic: 'x' },
  research:   { providerOverride: null, depth: 'medium' },
  canonicalCore: { providerOverride: null, personaId: null },
  draft:  { providerOverride: null, format: 'blog', wordCount: 1200 },
  review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 },
  assets: { providerOverride: null, mode: 'briefs_only' },
  preview: { enabled: false },
  publish: { status: 'draft' },
}

describe('createAutopilotTemplateSchema', () => {
  it('accepts a complete payload', () => {
    expect(createAutopilotTemplateSchema.parse({
      name: 'My default', channelId: null, configJson: validConfig, isDefault: true,
    }).isDefault).toBe(true)
  })
  it('rejects empty name', () => {
    expect(() => createAutopilotTemplateSchema.parse({
      name: '', channelId: null, configJson: validConfig, isDefault: false,
    })).toThrow()
  })
})

describe('updateAutopilotTemplateSchema', () => {
  it('accepts a partial payload (just isDefault)', () => {
    expect(updateAutopilotTemplateSchema.parse({ isDefault: true }).isDefault).toBe(true)
  })
})
