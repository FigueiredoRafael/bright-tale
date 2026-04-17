import { describe, it, expect } from 'vitest'
import { validateLocalSupabase, parseRefRateLimitMax } from '../env.js'

describe('validateLocalSupabase', () => {
  it('accepts localhost URL', () => {
    expect(() => validateLocalSupabase('http://localhost:54321', false)).not.toThrow()
  })
  it('accepts 127.0.0.1 URL', () => {
    expect(() => validateLocalSupabase('http://127.0.0.1:54321', false)).not.toThrow()
  })
  it('rejects remote URL without --force', () => {
    expect(() => validateLocalSupabase('https://x.supabase.co', false))
      .toThrow(/localhost|--force/)
  })
  it('allows remote URL with --force', () => {
    expect(() => validateLocalSupabase('https://x.supabase.co', true)).not.toThrow()
  })
})

describe('parseRefRateLimitMax', () => {
  it('defaults to 30 when unset', () => {
    expect(parseRefRateLimitMax(undefined)).toBe(30)
  })
  it('parses a numeric string', () => {
    expect(parseRefRateLimitMax('50')).toBe(50)
  })
  it('rejects non-numeric', () => {
    expect(() => parseRefRateLimitMax('abc')).toThrow()
  })
  it('rejects zero or negative', () => {
    expect(() => parseRefRateLimitMax('0')).toThrow()
    expect(() => parseRefRateLimitMax('-1')).toThrow()
  })
})
