import { describe, it, expect } from 'vitest'
import { getScopedSlots } from '../scopeFilter'

const ALL_SLOTS = [
  { slot: 'featured', sectionTitle: 'Hero' },
  { slot: 'section_1', sectionTitle: 'Intro' },
  { slot: 'section_2', sectionTitle: 'Body' },
  { slot: 'conclusion', sectionTitle: 'End' },
]

describe('getScopedSlots', () => {
  it('returns all slots when scope is "all"', () => {
    expect(getScopedSlots(ALL_SLOTS, 'all')).toHaveLength(4)
  })

  it('returns all slots when scope is undefined', () => {
    expect(getScopedSlots(ALL_SLOTS, undefined)).toHaveLength(4)
  })

  it('returns only the featured slot when scope is "featured_only"', () => {
    const result = getScopedSlots(ALL_SLOTS, 'featured_only')
    expect(result).toHaveLength(1)
    expect(result[0].slot).toBe('featured')
  })

  it('returns featured + conclusion when scope is "featured_and_conclusion"', () => {
    const result = getScopedSlots(ALL_SLOTS, 'featured_and_conclusion')
    expect(result).toHaveLength(2)
    expect(result.map((s) => s.slot)).toEqual(['featured', 'conclusion'])
  })

  it('returns empty when featured_only and no featured slot exists', () => {
    const noFeatured = [{ slot: 'section_1' }, { slot: 'conclusion' }]
    expect(getScopedSlots(noFeatured, 'featured_only')).toHaveLength(0)
  })

  it('returns only conclusion when featured_and_conclusion but no featured slot', () => {
    const noFeatured = [{ slot: 'section_1' }, { slot: 'conclusion' }]
    const result = getScopedSlots(noFeatured, 'featured_and_conclusion')
    expect(result).toHaveLength(1)
    expect(result[0].slot).toBe('conclusion')
  })

  it('preserves all properties of matching slots (generic T)', () => {
    const slots = [
      { slot: 'featured', promptBrief: 'A photo of a mountain', altText: 'Mountain' },
      { slot: 'section_1', promptBrief: 'City skyline', altText: 'City' },
    ]
    const result = getScopedSlots(slots, 'featured_only')
    expect(result[0].promptBrief).toBe('A photo of a mountain')
    expect(result[0].altText).toBe('Mountain')
  })
})
