import { describe, it, expect } from 'vitest'
import { aiProviderSchema, aiProviderSchemaWithAlias } from '../ai'

describe('aiProviderSchema', () => {
  it('accepts the four canonical providers', () => {
    for (const p of ['openai', 'anthropic', 'gemini', 'ollama']) {
      expect(aiProviderSchema.parse(p)).toBe(p)
    }
  })
  it("rejects 'local' on strict schema", () => {
    expect(() => aiProviderSchema.parse('local')).toThrow()
  })
})

describe('aiProviderSchemaWithAlias', () => {
  it("accepts 'local' and coerces to 'ollama'", () => {
    expect(aiProviderSchemaWithAlias.parse('local')).toBe('ollama')
  })
  it('passes canonical providers through unchanged', () => {
    expect(aiProviderSchemaWithAlias.parse('openai')).toBe('openai')
  })
})
