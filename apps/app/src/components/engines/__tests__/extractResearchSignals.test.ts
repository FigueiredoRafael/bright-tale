import { describe, it, expect } from 'vitest'
import { extractResearchSignals } from '../utils/extractResearchSignals'

describe('extractResearchSignals', () => {
  it('extracts all 3 signals when fully populated', () => {
    const findings = {
      seo: {
        primary_keyword: 'FIRE strategy for founders',
        secondary_keywords: [
          { keyword: 'SWR for variable income' },
          { keyword: 'SaaS FIRE math' },
        ],
        search_intent: 'informational',
      },
    }
    const result = extractResearchSignals(findings)
    expect(result.primaryKeyword).toBe('FIRE strategy for founders')
    expect(result.secondaryKeywords).toEqual(['SWR for variable income', 'SaaS FIRE math'])
    expect(result.searchIntent).toBe('informational')
  })

  it('returns empty object when findings is null', () => {
    expect(extractResearchSignals(null)).toEqual({})
  })

  it('returns empty object when seo field is missing', () => {
    expect(extractResearchSignals({ idea_validation: {} })).toEqual({})
  })

  it('handles empty secondary_keywords array', () => {
    const findings = { seo: { primary_keyword: 'test', secondary_keywords: [], search_intent: 'mixed' } }
    const result = extractResearchSignals(findings)
    expect(result.secondaryKeywords).toEqual([])
  })

  it('handles missing secondary_keywords gracefully', () => {
    const findings = { seo: { primary_keyword: 'test' } }
    const result = extractResearchSignals(findings)
    expect(result.secondaryKeywords).toBeUndefined()
  })
})
