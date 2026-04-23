import { describe, it, expect } from 'vitest'
import { compileConstraints } from '../personas'

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
