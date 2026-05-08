import { describe, it, expect } from 'vitest'
import {
  hydrateBrainstormFromConfig,
  hydrateResearchFromConfig,
  hydrateDraftFromConfig,
  hydrateReviewFromConfig,
} from '../hydrateEngineFromConfig'
import type { AutopilotConfig } from '@brighttale/shared'

const fullConfig: AutopilotConfig = {
  defaultProvider: 'recommended',
  brainstorm: {
    providerOverride: null,
    mode: 'topic_driven',
    topic: 'AI agents in 2026',
    referenceUrl: null,
    niche: 'enterprise',
    tone: 'analytical',
    audience: 'developers',
    goal: 'inform',
    constraints: 'no jargon',
  },
  research: { providerOverride: null, depth: 'medium' },
  canonicalCore: { providerOverride: null, personaId: 'p1' },
  draft: { providerOverride: null, format: 'blog', wordCount: 1500 },
  review: {
    providerOverride: null,
    maxIterations: 5,
    autoApproveThreshold: 90,
    hardFailThreshold: 40,
  },
  assets: { providerOverride: null, mode: 'skip' },
  preview: { enabled: false },
  publish: { status: 'draft' },
}

describe('hydrateBrainstormFromConfig', () => {
  it('returns full state when config is populated', () => {
    expect(hydrateBrainstormFromConfig(fullConfig)).toEqual({
      mode: 'topic_driven',
      topic: 'AI agents in 2026',
      referenceUrl: '',
      niche: 'enterprise',
      tone: 'analytical',
      audience: 'developers',
      goal: 'inform',
      constraints: 'no jargon',
      provider: null,
      model: null,
    })
  })

  it('returns empty object when config is null (legacy)', () => {
    expect(hydrateBrainstormFromConfig(null)).toEqual({})
  })

  it('returns empty object when brainstorm slot is null (completed stage)', () => {
    const cfg = { ...fullConfig, brainstorm: null } as AutopilotConfig
    expect(hydrateBrainstormFromConfig(cfg)).toEqual({})
  })
})

describe('hydrateResearchFromConfig', () => {
  it('returns researchDepth from depth', () => {
    expect(hydrateResearchFromConfig(fullConfig)).toEqual({
      researchDepth: 'medium',
      provider: null,
      model: null,
    })
  })
  it('null config → empty', () => {
    expect(hydrateResearchFromConfig(null)).toEqual({})
  })
})

describe('hydrateDraftFromConfig', () => {
  it('returns draft + canonicalCore fields', () => {
    expect(hydrateDraftFromConfig(fullConfig)).toEqual({
      format: 'blog',
      wordCount: 1500,
      selectedPersonaId: 'p1',
      provider: null,
      model: null,
      canonicalCoreProvider: null,
      canonicalCoreModel: null,
    })
  })
  it('null personaId stays null', () => {
    const cfg = { ...fullConfig, canonicalCore: { providerOverride: null, personaId: null } }
    expect(hydrateDraftFromConfig(cfg as AutopilotConfig)).toEqual({
      format: 'blog',
      wordCount: 1500,
      selectedPersonaId: null,
      provider: null,
      model: null,
      canonicalCoreProvider: null,
      canonicalCoreModel: null,
    })
  })
})

describe('hydrateReviewFromConfig', () => {
  it('passes review thresholds for the engine to render', () => {
    expect(hydrateReviewFromConfig(fullConfig)).toEqual({
      maxIterations: 5,
      autoApproveThreshold: 90,
      hardFailThreshold: 40,
      provider: null,
      model: null,
    })
  })
  it('null config → empty', () => {
    expect(hydrateReviewFromConfig(null)).toEqual({})
  })
})
