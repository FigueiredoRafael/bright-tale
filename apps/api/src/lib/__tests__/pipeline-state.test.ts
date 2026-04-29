import { describe, it, expect } from 'vitest'
import { derivedFromStageResults, nextStageAfter } from '../pipeline-state'

describe('derivedFromStageResults', () => {
  it('returns null for empty/undefined state', () => {
    expect(derivedFromStageResults(null)).toBeNull()
    expect(derivedFromStageResults({ stageResults: {} })).toBeNull()
  })
  it('returns the furthest completed stage', () => {
    expect(derivedFromStageResults({
      stageResults: { brainstorm: {}, research: {}, draft: {} },
    })).toBe('draft')
  })
})

describe('nextStageAfter', () => {
  it('null → brainstorm (fresh)', () => {
    expect(nextStageAfter(null)).toBe('brainstorm')
  })
  it('research → draft', () => {
    expect(nextStageAfter('research')).toBe('draft')
  })
  it('publish → publish (terminal)', () => {
    expect(nextStageAfter('publish')).toBe('publish')
  })
})
