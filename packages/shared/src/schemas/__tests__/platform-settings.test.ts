import { describe, it, expect } from 'vitest'
import { updatePlatformSettingsSchema, platformSettingsResponseSchema } from '../pipeline-settings'

describe('platformSettingsResponseSchema', () => {
  it('requires costResearchSurface, costResearchMedium, costResearchDeep', () => {
    const result = platformSettingsResponseSchema.safeParse({
      costBlog: 200, costVideo: 200, costShorts: 100,
      costPodcast: 150, costCanonicalCore: 80, costReview: 20,
      // missing research fields
    })
    expect(result.success).toBe(false)
  })

  it('accepts all required fields including research costs', () => {
    const result = platformSettingsResponseSchema.safeParse({
      costBlog: 200, costVideo: 200, costShorts: 100,
      costPodcast: 150, costCanonicalCore: 80, costReview: 20,
      costResearchSurface: 60, costResearchMedium: 100, costResearchDeep: 180,
    })
    expect(result.success).toBe(true)
  })
})

describe('updatePlatformSettingsSchema', () => {
  it('accepts partial update with only research fields', () => {
    const result = updatePlatformSettingsSchema.safeParse({ costResearchDeep: 200 })
    expect(result.success).toBe(true)
    expect(result.data?.costResearchDeep).toBe(200)
  })

  it('accepts a valid cost patch', () => {
    const result = updatePlatformSettingsSchema.safeParse({ costBlog: 300 })
    expect(result.success).toBe(true)
    expect(result.data?.costBlog).toBe(300)
  })

  it('rejects a negative cost', () => {
    const result = updatePlatformSettingsSchema.safeParse({ costBlog: -10 })
    expect(result.success).toBe(false)
  })
})
