import { describe, it, expect } from 'vitest'
import { derivePreview } from '../derivePreview'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const FEEDBACK_STANDARD = {
  publication_plan: {
    blog: {
      categories: ['ai', 'automation'],
      tags: ['agents', 'llm'],
      final_seo: {
        title: 'SEO Title',
        slug: 'seo-slug',
        meta_description: 'A great meta description',
      },
      recommended_publish_date: '2026-05-01',
    },
  },
}

const FEEDBACK_BC_WRAPPED = {
  BC_REVIEW_OUTPUT: FEEDBACK_STANDARD,
}

// Flat shape that has fields at root but no publication_plan wrapper — function returns empty
// because extractPublicationPlan requires publication_plan or blog_review nesting.
const FEEDBACK_FLAT = {
  categories: ['flat-cat'],
  tags: ['flat-tag'],
  final_seo: { title: 'Flat Title', slug: 'flat-slug', meta_description: 'Flat meta' },
}

// pub_plan directly at root (no blog nesting)
const FEEDBACK_PUB_AT_ROOT = {
  publication_plan: {
    categories: ['root-cat'],
    tags: ['root-tag'],
    final_seo: { title: 'Root Title', slug: 'root-slug', meta_description: 'Root meta' },
  },
}

const ASSETS_WITH_FEATURED = [
  { id: 'a1', role: 'featured_image', source_url: '/img.jpg', webp_url: null },
  { id: 'a2', role: 'body_section_1', source_url: '/section1.jpg', webp_url: null },
]

const ASSETS_WITH_FEATURED_WEBP = [
  { id: 'a1', role: 'featured_image', source_url: '/img.jpg', webp_url: '/img.webp' },
]

const ASSETS_NO_FEATURED = [
  { id: 'a2', role: 'body_section_1', source_url: '/section1.jpg', webp_url: null },
]

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

describe('derivePreview — categories', () => {
  it('returns categories from standard publication_plan.blog path', () => {
    const result = derivePreview(FEEDBACK_STANDARD, [])
    expect(result.categories).toEqual(['ai', 'automation'])
  })

  it('returns categories when feedback is wrapped in BC_REVIEW_OUTPUT', () => {
    const result = derivePreview(FEEDBACK_BC_WRAPPED, [])
    expect(result.categories).toEqual(['ai', 'automation'])
  })

  it('falls back to pubPlan-level categories when no blog sub-object', () => {
    const result = derivePreview(FEEDBACK_PUB_AT_ROOT, [])
    expect(result.categories).toEqual(['root-cat'])
  })

  it('returns empty array when feedbackJson is null', () => {
    const result = derivePreview(null, [])
    expect(result.categories).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------

describe('derivePreview — tags', () => {
  it('returns tags from standard publication_plan.blog path', () => {
    const result = derivePreview(FEEDBACK_STANDARD, [])
    expect(result.tags).toEqual(['agents', 'llm'])
  })

  it('returns tags when wrapped in BC_REVIEW_OUTPUT', () => {
    const result = derivePreview(FEEDBACK_BC_WRAPPED, [])
    expect(result.tags).toEqual(['agents', 'llm'])
  })

  it('returns empty array when no tags present', () => {
    const result = derivePreview(null, [])
    expect(result.tags).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// seo
// ---------------------------------------------------------------------------

describe('derivePreview — seo', () => {
  it('returns seo fields from final_seo', () => {
    const result = derivePreview(FEEDBACK_STANDARD, [])
    expect(result.seo).toEqual({
      title: 'SEO Title',
      slug: 'seo-slug',
      meta_description: 'A great meta description',
    })
  })

  it('returns empty seo object when feedbackJson is null', () => {
    const result = derivePreview(null, [])
    expect(result.seo).toEqual({})
  })

  it('falls back to pubPlan-level seo when no blog sub-object', () => {
    const result = derivePreview(FEEDBACK_PUB_AT_ROOT, [])
    expect(result.seo).toMatchObject({ title: 'Root Title', slug: 'root-slug' })
  })
})

// ---------------------------------------------------------------------------
// featuredImageUrl
// ---------------------------------------------------------------------------

describe('derivePreview — featuredImageUrl', () => {
  it('returns source_url from asset with role=featured_image', () => {
    const result = derivePreview(null, ASSETS_WITH_FEATURED)
    expect(result.featuredImageUrl).toBe('/img.jpg')
  })

  it('prefers webp_url over source_url when both are present', () => {
    const result = derivePreview(null, ASSETS_WITH_FEATURED_WEBP)
    expect(result.featuredImageUrl).toBe('/img.webp')
  })

  it('returns null when no asset has role=featured_image', () => {
    const result = derivePreview(null, ASSETS_NO_FEATURED)
    expect(result.featuredImageUrl).toBeNull()
  })

  it('returns null when assets array is empty', () => {
    const result = derivePreview(null, [])
    expect(result.featuredImageUrl).toBeNull()
  })

  it('ignores non-featured assets when finding featured image', () => {
    const result = derivePreview(null, ASSETS_WITH_FEATURED)
    expect(result.featuredImageUrl).toBe('/img.jpg')
  })
})

// ---------------------------------------------------------------------------
// publishDate
// ---------------------------------------------------------------------------

describe('derivePreview — publishDate', () => {
  it('returns recommended_publish_date from blog', () => {
    const result = derivePreview(FEEDBACK_STANDARD, [])
    expect(result.publishDate).toBe('2026-05-01')
  })

  it('returns undefined when no publish date present', () => {
    const result = derivePreview(null, [])
    expect(result.publishDate).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Combined shape
// ---------------------------------------------------------------------------

describe('derivePreview — combined output', () => {
  it('returns full DerivedPreview shape with all fields populated', () => {
    const result = derivePreview(FEEDBACK_STANDARD, ASSETS_WITH_FEATURED)
    expect(result).toMatchObject({
      categories: ['ai', 'automation'],
      tags: ['agents', 'llm'],
      seo: { title: 'SEO Title', slug: 'seo-slug', meta_description: 'A great meta description' },
      featuredImageUrl: '/img.jpg',
      publishDate: '2026-05-01',
    })
  })

  it('is pure — calling twice with same args returns identical result', () => {
    const r1 = derivePreview(FEEDBACK_STANDARD, ASSETS_WITH_FEATURED)
    const r2 = derivePreview(FEEDBACK_STANDARD, ASSETS_WITH_FEATURED)
    expect(r1).toEqual(r2)
  })
})
