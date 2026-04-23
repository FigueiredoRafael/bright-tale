import { describe, it, expect, vi } from 'vitest'

import { buildPersonaContext, buildPersonaVoice } from '../production-generate.js'
import type { Persona } from '@brighttale/shared/types/agents'

// Inline mapper (avoids shared package import issues in tests)
function mapDbPersonaToPersona(row: any): Persona {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    avatarUrl: row.avatar_url,
    bioShort: row.bio_short,
    bioLong: row.bio_long,
    primaryDomain: row.primary_domain,
    domainLens: row.domain_lens,
    approvedCategories: row.approved_categories,
    writingVoiceJson: row.writing_voice_json,
    eeatSignalsJson: row.eeat_signals_json,
    soulJson: row.soul_json,
    wpAuthorId: row.wp_author_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Test data - persona in DB format (snake_case)
const DB_PERSONA = {
  id: 'uuid-1',
  slug: 'cole-merritt',
  name: 'Cole Merritt',
  avatar_url: null,
  bio_short: 'Building in public.',
  bio_long: 'Long bio.',
  primary_domain: 'B2B entrepreneurship',
  domain_lens: 'Inside the build.',
  approved_categories: ['Entrepreneurship', 'B2B'],
  writing_voice_json: {
    writingStyle: 'Blunt',
    signaturePhrases: ["Here's what actually happened:"],
    characteristicOpinions: ['Hustle culture is a lottery.'],
  },
  eeat_signals_json: {
    analyticalLens: 'Builder lens',
    trustSignals: ['Shows decision process'],
    expertiseClaims: ['Software developer'],
  },
  soul_json: {
    values: ['Ownership'],
    lifePhilosophy: 'Freedom is passive income.',
    strongOpinions: ['Build real things.'],
    petPeeves: ['Performing struggle.'],
    humorStyle: 'Dry',
    recurringJokes: ['My boss is a Stripe notification.'],
    whatExcites: ['First paying customer.'],
    innerTensions: ['Speed vs. focus.'],
    languageGuardrails: ["Never uses 'journey'"],
  },
  wp_author_id: 42,
  is_active: true,
  created_at: '2026-04-23T00:00:00Z',
  updated_at: '2026-04-23T00:00:00Z',
}

describe('buildPersonaContext', () => {
  it('maps persona to ContentCore input subset', () => {
    const persona = mapDbPersonaToPersona(DB_PERSONA)
    const ctx = buildPersonaContext(persona)

    expect(ctx.name).toBe('Cole Merritt')
    expect(ctx.domainLens).toBe('Inside the build.')
    expect(ctx.analyticalLens).toBe('Builder lens')
    expect(ctx.strongOpinions).toContain('Build real things.')
    expect(ctx.approvedCategories).toContain('B2B')
  })
})

describe('buildPersonaVoice', () => {
  it('maps persona to BlogAgent input subset', () => {
    const persona = mapDbPersonaToPersona(DB_PERSONA)
    const voice = buildPersonaVoice(persona)

    expect(voice.name).toBe('Cole Merritt')
    expect(voice.bioShort).toBe('Building in public.')
    expect(voice.writingVoice.writingStyle).toBe('Blunt')
    expect(voice.soul.humorStyle).toBe('Dry')
    expect(voice.soul.languageGuardrails).toContain("Never uses 'journey'")
  })

  it('soul.recurringJokes is included', () => {
    const persona = mapDbPersonaToPersona(DB_PERSONA)
    const voice = buildPersonaVoice(persona)
    expect(voice.soul.recurringJokes).toContain('My boss is a Stripe notification.')
  })
})
