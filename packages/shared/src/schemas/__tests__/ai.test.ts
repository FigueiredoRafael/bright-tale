import { describe, it, expect } from 'vitest'
import { aiProviderSchema } from '../ai'

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
