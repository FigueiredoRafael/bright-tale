import { describe, it, expect } from 'vitest'
import { derivedFromStageResults, nextStageAfter } from '../pipeline-state'

describe('derivedFromStageResults', () => {
  it('returns null for empty/undefined state', () => {
    expect(derivedFromStageResults(null)).toBeNull()
    expect(derivedFromStageResults({ stageResults: {} })).toBeNull()
  })
  it('returns the furthest completed stage (new schema)', () => {
    expect(derivedFromStageResults({
      stageResults: { brainstorm: {}, research: {}, canonical: {}, production: {} },
    })).toBe('production')
  })
  it('translates legacy draft → production', () => {
    expect(derivedFromStageResults({
      stageResults: { brainstorm: {}, research: {}, draft: {} },
    })).toBe('production')
  })
})

describe('nextStageAfter', () => {
  it('null → brainstorm (fresh)', () => {
    expect(nextStageAfter(null)).toBe('brainstorm')
  })
  it('research → canonical', () => {
    expect(nextStageAfter('research')).toBe('canonical')
  })
  it('canonical → production', () => {
    expect(nextStageAfter('canonical')).toBe('production')
  })
  it('publish → publish (terminal)', () => {
    expect(nextStageAfter('publish')).toBe('publish')
  })
})
