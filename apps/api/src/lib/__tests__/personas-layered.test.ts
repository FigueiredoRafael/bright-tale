import { describe, it, expect, vi } from 'vitest'
import { compileConstraints, buildLayeredPersonaContext } from '../personas'
import type { Persona } from '@brighttale/shared/types/agents'

describe('compileConstraints', () => {
  it('returns guardrail rules when no overlay', () => {
    const result = compileConstraints(['rule A', 'rule B'], null)
    expect(result).toEqual(['rule A', 'rule B'])
  })

  it('appends overlay constraints after guardrail rules', () => {
    const overlay = { constraints: ['overlay C'], behavioralAdditions: ['addition D'] }
    const result = compileConstraints(['rule A'], overlay)
    expect(result).toEqual(['rule A', 'overlay C', 'addition D'])
  })

  it('returns empty array when no guardrails and no overlay', () => {
    const result = compileConstraints([], null)
    expect(result).toEqual([])
  })

  it('handles overlay with empty arrays', () => {
    const overlay = { constraints: [], behavioralAdditions: [] }
    const result = compileConstraints(['rule A'], overlay)
    expect(result).toEqual(['rule A'])
  })
})

const basePersona: Persona = {
  id: 'p1',
  slug: 'test-persona',
  name: 'Test Persona',
  avatarUrl: null,
  bioShort: 'Short bio',
  bioLong: 'Long bio',
  primaryDomain: 'Tech',
  domainLens: 'Analytical',
  approvedCategories: ['tech', 'ai'],
  writingVoiceJson: {
    writingStyle: 'Direct',
    signaturePhrases: ['phrase one'],
    characteristicOpinions: ['opinion one'],
  },
  eeatSignalsJson: {
    analyticalLens: 'Data-driven',
    trustSignals: ['signal one'],
    expertiseClaims: ['claim one'],
  },
  soulJson: {
    values: ['honesty'],
    lifePhilosophy: 'Keep it simple',
    strongOpinions: ['opinion A'],
    petPeeves: ['fluff'],
    humorStyle: 'Dry',
    recurringJokes: [],
    whatExcites: ['new tech'],
    innerTensions: [],
    languageGuardrails: ['no jargon'],
  },
  wpAuthorId: null,
  archetypeSlug: null,
  avatarParamsJson: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function makeMockSb(guardrailRules: string[], overlayData: unknown) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: overlayData })),
          })),
          order: vi.fn(async () => ({
            data: guardrailRules.map(r => ({ rule_text: r })),
          })),
        })),
        order: vi.fn(async () => ({
          data: guardrailRules.map(r => ({ rule_text: r })),
        })),
      })),
    })),
  } as unknown
}

describe('buildLayeredPersonaContext', () => {
  it('returns context, voice, and empty constraints when no guardrails and no archetype', async () => {
    const sb = makeMockSb([], null)
    const result = await buildLayeredPersonaContext(basePersona, sb as any)
    expect(result.context.name).toBe('Test Persona')
    expect(result.voice.bioShort).toBe('Short bio')
    expect(result.constraints).toEqual([])
  })

  it('includes guardrail rules in constraints', async () => {
    const sb = makeMockSb(['no profanity', 'cite sources'], null)
    const result = await buildLayeredPersonaContext(basePersona, sb as any)
    expect(result.constraints).toContain('no profanity')
    expect(result.constraints).toContain('cite sources')
  })

  it('does not fetch overlay when persona has no archetypeSlug', async () => {
    const sb = makeMockSb([], null)
    const fromSpy = vi.spyOn(sb as any, 'from')
    await buildLayeredPersonaContext(basePersona, sb as any)
    const archetypeCalls = (fromSpy.mock.calls as string[][]).filter(([t]) => t === 'persona_archetypes')
    expect(archetypeCalls).toHaveLength(0)
  })
})
