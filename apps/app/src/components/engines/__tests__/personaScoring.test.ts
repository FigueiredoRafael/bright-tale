import { describe, it, expect } from 'vitest'
import { scorePersonaForContent, rankPersonas } from '../utils/personaScoring'
import type { Persona } from '@brighttale/shared/types/agents'

function makePersona(overrides: Partial<Persona>): Persona {
  return {
    id: 'id',
    slug: 'test',
    name: 'Test',
    avatarUrl: null,
    bioShort: '',
    bioLong: '',
    primaryDomain: '',
    domainLens: '',
    approvedCategories: [],
    writingVoiceJson: { writingStyle: '', signaturePhrases: [], characteristicOpinions: [] },
    eeatSignalsJson: { analyticalLens: '', trustSignals: [], expertiseClaims: [] },
    soulJson: { values: [], lifePhilosophy: '', strongOpinions: [], petPeeves: [], humorStyle: '', recurringJokes: [], whatExcites: [], innerTensions: [], languageGuardrails: [] },
    wpAuthorId: null,
    archetypeSlug: null,
    avatarParamsJson: null,
    isActive: true,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

const COLE = makePersona({
  slug: 'cole-merritt',
  name: 'Cole Merritt',
  approvedCategories: ['Entrepreneurship', 'Startups', 'B2B', 'AI Tools', 'Founder Decisions', 'Product Validation'],
  primaryDomain: 'Zero-to-one entrepreneurship B2B validation AI tools',
  domainLens: 'Writing from inside the build',
})

const ALEX = makePersona({
  slug: 'alex-strand',
  name: 'Alex Strand',
  approvedCategories: ['Financial Independence', 'FIRE', 'Opportunity Cost', 'Startup Economics', 'SaaS', 'Index Investing'],
  primaryDomain: 'FIRE math opportunity cost startup economics',
  domainLens: 'Freedom is a math problem',
})

const CASEY = makePersona({
  slug: 'casey-park',
  name: 'Casey Park',
  approvedCategories: ['Micro-SaaS', 'Indie Hacking', 'Entrepreneurship', 'Portfolio Income', 'FIRE', 'Product Strategy'],
  primaryDomain: 'Micro-SaaS indie hacker portfolio income',
  domainLens: 'Portfolio of boring durable products',
})

describe('scorePersonaForContent', () => {
  it('returns 0 when all signals are empty', () => {
    const score = scorePersonaForContent(ALEX, {}, undefined)
    expect(score).toBe(0)
  })

  it('scores FIRE content higher for Alex', () => {
    const context = { ideaTitle: 'FIRE number for SaaS founders', researchPrimaryKeyword: 'FIRE strategy' }
    expect(scorePersonaForContent(ALEX, context, undefined)).toBeGreaterThan(
      scorePersonaForContent(COLE, context, undefined)
    )
  })

  it('scores micro-SaaS content higher for Casey', () => {
    const context = { ideaTitle: 'micro-SaaS portfolio indie hacker strategy' }
    expect(scorePersonaForContent(CASEY, context, undefined)).toBeGreaterThan(
      scorePersonaForContent(ALEX, context, undefined)
    )
  })

  it('scores B2B validation content higher for Cole', () => {
    const context = { ideaTitle: 'B2B validation before building product', ideaCoreTension: 'build vs validate' }
    expect(scorePersonaForContent(COLE, context, undefined)).toBeGreaterThan(
      scorePersonaForContent(ALEX, context, undefined)
    )
  })

  it('uses idea monetization signals in scoring', () => {
    const context = {}
    const idea = { affiliateAngle: 'FIRE retirement tools', productCategories: ['index investing platforms'] }
    expect(scorePersonaForContent(ALEX, context, idea)).toBeGreaterThan(0)
  })
})

describe('rankPersonas', () => {
  const personas = [COLE, ALEX, CASEY]

  it('returns all personas in ranked order', () => {
    const context = { ideaTitle: 'FIRE number for SaaS founders' }
    const ranked = rankPersonas(personas, context, undefined)
    expect(ranked).toHaveLength(3)
    expect(ranked[0].persona.slug).toBe('alex-strand')
  })

  it('marks top scorer as recommended when score > 0', () => {
    const context = { ideaTitle: 'FIRE number for SaaS founders' }
    const ranked = rankPersonas(personas, context, undefined)
    expect(ranked[0].isRecommended).toBe(true)
    expect(ranked[1].isRecommended).toBe(false)
  })

  it('no badge shown when all scores are 0', () => {
    const ranked = rankPersonas(personas, {}, undefined)
    expect(ranked.every((r) => !r.isRecommended)).toBe(true)
  })

  it('is deterministic on tie — first in input order wins', () => {
    // All personas score the same with empty context
    const ranked1 = rankPersonas([COLE, ALEX], {}, undefined)
    const ranked2 = rankPersonas([ALEX, COLE], {}, undefined)
    // First in original array wins the tie
    expect(ranked1[0].persona.slug).toBe('cole-merritt')
    expect(ranked2[0].persona.slug).toBe('alex-strand')
  })
})
