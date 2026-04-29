import { describe, it, expect } from 'vitest'
import { resolveStageProvider } from '../resolveProvider.js'
import type { AutopilotConfig } from '@brighttale/shared'

const cfg: AutopilotConfig = {
  defaultProvider: 'recommended',
  brainstorm: { providerOverride: null, mode: 'topic_driven', topic: 'x' },
  research:   { providerOverride: 'anthropic', depth: 'medium' },
  canonicalCore: { providerOverride: null, personaId: null },
  draft:  { providerOverride: null, format: 'blog', wordCount: 1200 },
  review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 },
  assets: { providerOverride: null, mode: 'briefing' },
} as AutopilotConfig

const admin = {
  defaultProviders: {
    brainstorm: 'gemini',
    research: 'gemini',
    canonicalCore: 'openai',
    draft: 'anthropic',
    review: 'gemini',
    assets: 'gemini',
  },
}

describe('resolveStageProvider', () => {
  it('per-stage override wins over admin default', () => {
    expect(resolveStageProvider('research', cfg, admin)).toBe('anthropic')
  })

  it("falls back to admin default when defaultProvider = 'recommended'", () => {
    expect(resolveStageProvider('brainstorm', cfg, admin)).toBe('gemini')
  })

  it('uses project default when not "recommended" and no override', () => {
    const c = { ...cfg, defaultProvider: 'openai' } as AutopilotConfig
    expect(resolveStageProvider('brainstorm', c, admin)).toBe('openai')
  })

  it('uses project default for canonicalCore when override null and not recommended', () => {
    const c = { ...cfg, defaultProvider: 'anthropic' } as AutopilotConfig
    expect(resolveStageProvider('canonicalCore', c, admin)).toBe('anthropic')
  })

  it('admin default for assets when recommended + no override', () => {
    expect(resolveStageProvider('assets', cfg, admin)).toBe('gemini')
  })
})
