import { describe, it, expect } from 'vitest'
import { calculateDraftCost } from '../calculate-draft-cost'
import type { CreditSettingsRecord } from '../credit-settings'

const settings: CreditSettingsRecord = {
  costBlog: 200, costVideo: 150, costShorts: 75, costPodcast: 130,
  costCanonicalCore: 80, costReview: 20,
}

describe('calculateDraftCost', () => {
  it('returns correct cost for blog', () => expect(calculateDraftCost('blog', settings)).toBe(200))
  it('returns correct cost for video', () => expect(calculateDraftCost('video', settings)).toBe(150))
  it('returns correct cost for shorts', () => expect(calculateDraftCost('shorts', settings)).toBe(75))
  it('returns correct cost for podcast', () => expect(calculateDraftCost('podcast', settings)).toBe(130))
  it('falls back to costBlog for unknown types', () => expect(calculateDraftCost('unknown', settings)).toBe(200))
})
