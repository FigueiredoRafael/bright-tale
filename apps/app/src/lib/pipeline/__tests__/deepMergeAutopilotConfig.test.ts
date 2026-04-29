import { describe, it, expect } from 'vitest'
import { deepMergeAutopilotConfig } from '../deepMergeAutopilotConfig'

const base: any = { defaultProvider: 'recommended', brainstorm: { providerOverride: null, mode: 'topic_driven', topic: 'x' }, research: null, canonicalCore: { providerOverride: null, personaId: null }, draft: { providerOverride: null, format: 'blog', wordCount: 1200 }, review: { providerOverride: null, maxIterations: 5, autoApproveThreshold: 90, hardFailThreshold: 40 }, assets: { providerOverride: null, mode: 'briefing' } }

describe('deepMergeAutopilotConfig', () => {
  it('merges shallow patch into matching slot', () => {
    const out = deepMergeAutopilotConfig(base, { draft: { wordCount: 2000 } } as any)
    expect(out.draft.wordCount).toBe(2000)
    expect(out.draft.format).toBe('blog')
  })
  it('preserves null slots — patch never resurrects them', () => {
    const out = deepMergeAutopilotConfig(base, { research: { depth: 'deep' } } as any)
    expect(out.research).toBeNull()
  })
  it('throws if base is null', () => {
    expect(() => deepMergeAutopilotConfig(null as any, {})).toThrow(/non-null base/)
  })
})
