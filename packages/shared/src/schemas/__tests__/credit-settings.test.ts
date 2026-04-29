import { describe, it, expect } from 'vitest'
import { updateCreditSettingsSchema, creditSettingsResponseSchema } from '../pipeline-settings'

describe('creditSettingsResponseSchema', () => {
  it('requires costResearchSurface, costResearchMedium, costResearchDeep', () => {
    const result = creditSettingsResponseSchema.safeParse({
      costBlog: 200, costVideo: 200, costShorts: 100,
      costPodcast: 150, costCanonicalCore: 80, costReview: 20,
      // missing research fields
    })
    expect(result.success).toBe(false)
  })

  it('accepts all required fields including research costs', () => {
    const result = creditSettingsResponseSchema.safeParse({
      costBlog: 200, costVideo: 200, costShorts: 100,
      costPodcast: 150, costCanonicalCore: 80, costReview: 20,
      costResearchSurface: 60, costResearchMedium: 100, costResearchDeep: 180,
    })
    expect(result.success).toBe(true)
  })
})

describe('updateCreditSettingsSchema', () => {
  it('accepts partial update with only research fields', () => {
    const result = updateCreditSettingsSchema.safeParse({ costResearchDeep: 200 })
    expect(result.success).toBe(true)
    expect(result.data?.costResearchDeep).toBe(200)
  })
})
