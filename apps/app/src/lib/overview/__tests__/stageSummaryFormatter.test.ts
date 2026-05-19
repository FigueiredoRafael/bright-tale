/**
 * stageSummaryFormatter tests
 *
 * Each function gets:
 *   - happy-path test (realistic outcomeJson)
 *   - null input test
 *   - empty object test
 *   - malformed / partial input test
 *   - edge-case specific to each formatter
 */

import { describe, it, expect } from 'vitest'
import {
  summarizeBrainstorm,
  summarizeResearch,
  summarizeCanonical,
  summarizeProduction,
  summarizeReview,
  summarizeAssets,
  summarizePreview,
  summarizePublish,
  summarizeStage,
} from '../stageSummaryFormatter'

// ─── summarizeBrainstorm ──────────────────────────────────────────────────────

describe('summarizeBrainstorm', () => {
  it('returns ideaTitle from outcomeJson', () => {
    expect(summarizeBrainstorm({ ideaTitle: 'How to Train Your Dragon' }))
      .toBe('How to Train Your Dragon')
  })

  it('falls back to first idea title when ideaTitle is missing', () => {
    const outcome = {
      ideas: [
        { title: 'Fallback Idea', idea_id: 'i-1' },
      ],
    }
    expect(summarizeBrainstorm(outcome)).toBe('Fallback Idea')
  })

  it('returns fallback string when null', () => {
    expect(summarizeBrainstorm(null)).toBe('No brainstorm data')
  })

  it('returns fallback string on empty object', () => {
    expect(summarizeBrainstorm({})).toBe('No idea selected')
  })

  it('returns fallback string on non-object input', () => {
    expect(summarizeBrainstorm('bad string')).toBe('No brainstorm data')
  })

  it('returns fallback string on empty ideas array', () => {
    expect(summarizeBrainstorm({ ideas: [] })).toBe('No idea selected')
  })

  it('handles malformed ideas (non-objects in array)', () => {
    expect(summarizeBrainstorm({ ideas: [null, 42, 'bad'] })).toBe('No idea selected')
  })
})

// ─── summarizeResearch ────────────────────────────────────────────────────────

describe('summarizeResearch', () => {
  it('returns "N cards approved" for approvedCardsCount', () => {
    expect(summarizeResearch({ approvedCardsCount: 7 })).toBe('7 cards approved')
  })

  it('uses singular "1 card" for count of 1', () => {
    expect(summarizeResearch({ approvedCardsCount: 1 })).toBe('1 card approved')
  })

  it('falls back to sources count when approvedCardsCount missing', () => {
    const outcome = { sources: [{ id: '1' }, { id: '2' }, { id: '3' }] }
    expect(summarizeResearch(outcome)).toBe('3 sources gathered')
  })

  it('returns fallback string when null', () => {
    expect(summarizeResearch(null)).toBe('No research data')
  })

  it('returns fallback string on empty object', () => {
    expect(summarizeResearch({})).toBe('Research complete')
  })

  it('handles zero approvedCardsCount', () => {
    expect(summarizeResearch({ approvedCardsCount: 0 })).toBe('0 cards approved')
  })

  it('returns fallback when non-number approvedCardsCount', () => {
    expect(summarizeResearch({ approvedCardsCount: 'many' })).toBe('Research complete')
  })

  it('handles array input (non-object)', () => {
    expect(summarizeResearch([])).toBe('No research data')
  })
})

// ─── summarizeCanonical ───────────────────────────────────────────────────────

describe('summarizeCanonical', () => {
  it('returns draftTitle when present', () => {
    expect(summarizeCanonical({ draftTitle: 'My Article Title' }))
      .toBe('My Article Title')
  })

  it('returns thesis with claims for CanonicalCore shape', () => {
    const outcome = {
      thesis: 'Sleep is critical',
      argument_chain: [
        { step: 1, claim: 'REM consolidates memory', evidence: '...' },
        { step: 2, claim: 'Deprivation raises cortisol', evidence: '...' },
      ],
    }
    expect(summarizeCanonical(outcome))
      .toBe('Sleep is critical — REM consolidates memory, Deprivation raises cortisol')
  })

  it('returns thesis alone when argument_chain is empty', () => {
    expect(summarizeCanonical({ thesis: 'Just the thesis' }))
      .toBe('Just the thesis')
  })

  it('returns H2 list from BlogOutput outline', () => {
    const outcome = {
      outline: [
        { h2: 'Introduction', key_points: [] },
        { h2: 'Main Points', key_points: [] },
        { h2: 'Conclusion', key_points: [] },
      ],
    }
    expect(summarizeCanonical(outcome)).toBe('Introduction, Main Points, Conclusion')
  })

  it('returns fallback string when null', () => {
    expect(summarizeCanonical(null)).toBe('No canonical data')
  })

  it('returns fallback string on empty object', () => {
    expect(summarizeCanonical({})).toBe('Canonical core complete')
  })

  it('handles malformed argument_chain entries', () => {
    const outcome = { thesis: 'Good thesis', argument_chain: [null, { claim: 'Valid claim' }] }
    expect(summarizeCanonical(outcome)).toBe('Good thesis — Valid claim')
  })
})

// ─── summarizeProduction ──────────────────────────────────────────────────────

describe('summarizeProduction', () => {
  it('returns word count + first 200 chars for draftContent', () => {
    const content = 'word '.repeat(50) // 50 words, 250 chars
    const result = summarizeProduction({ draftContent: content })
    expect(result).toMatch(/^50 words — /)
    expect(result.endsWith('…')).toBe(true)
  })

  it('does not truncate when content <= 200 chars', () => {
    const content = 'Short content here.'
    const result = summarizeProduction({ draftContent: content })
    expect(result).toBe(`3 words — ${content}`)
    expect(result).not.toContain('…')
  })

  it('uses word_count from BlogOutput when full_draft present', () => {
    const result = summarizeProduction({ full_draft: 'Hello world', word_count: 1500 })
    expect(result).toMatch(/^1500 words — /)
  })

  it('returns fallback string when null', () => {
    expect(summarizeProduction(null)).toBe('No production data')
  })

  it('returns fallback string on empty object', () => {
    expect(summarizeProduction({})).toBe('Production complete')
  })

  it('handles draftTitle fallback when no content', () => {
    expect(summarizeProduction({ draftTitle: 'My Draft' })).toBe('My Draft')
  })

  it('handles non-string draftContent', () => {
    expect(summarizeProduction({ draftContent: 42 })).toBe('Production complete')
  })

  it('handles empty string draftContent', () => {
    expect(summarizeProduction({ draftContent: '' })).toBe('Production complete')
  })
})

// ─── summarizeReview ──────────────────────────────────────────────────────────

describe('summarizeReview', () => {
  it('returns score + verdict', () => {
    expect(summarizeReview({ score: 92, verdict: 'approved' }))
      .toBe('Score: 92 — approved')
  })

  it('returns score + qualityTier + verdict when all present', () => {
    expect(summarizeReview({ score: 85, qualityTier: 'good', verdict: 'revision_required' }))
      .toBe('Score: 85 — good — revision_required')
  })

  it('returns only verdict when score is missing', () => {
    expect(summarizeReview({ verdict: 'rejected' })).toBe('rejected')
  })

  it('uses overall_verdict as fallback', () => {
    expect(summarizeReview({ score: 75, overall_verdict: 'revision_required' }))
      .toBe('Score: 75 — revision_required')
  })

  it('returns fallback string when null', () => {
    expect(summarizeReview(null)).toBe('No review data')
  })

  it('returns fallback string on empty object', () => {
    expect(summarizeReview({})).toBe('Review complete')
  })

  it('handles non-finite score (NaN)', () => {
    expect(summarizeReview({ score: NaN, verdict: 'approved' })).toBe('approved')
  })

  it('handles array input (non-object)', () => {
    expect(summarizeReview([1, 2, 3])).toBe('No review data')
  })
})

// ─── summarizeAssets ──────────────────────────────────────────────────────────

describe('summarizeAssets', () => {
  it('returns count + thumbnail URL', () => {
    const result = summarizeAssets({
      assetIds: ['a1', 'a2', 'a3'],
      featuredImageUrl: 'https://cdn.example.com/img.jpg',
    })
    expect(result).toBe('3 images — https://cdn.example.com/img.jpg')
  })

  it('uses singular "1 image" for single asset', () => {
    expect(summarizeAssets({ assetIds: ['a1'], featuredImageUrl: 'https://cdn.example.com/x.jpg' }))
      .toBe('1 image — https://cdn.example.com/x.jpg')
  })

  it('returns skipped message when skipped=true', () => {
    expect(summarizeAssets({ skipped: true })).toBe('Assets skipped')
  })

  it('returns count without URL when no featuredImageUrl', () => {
    expect(summarizeAssets({ assetIds: ['a1', 'a2'] })).toBe('2 images')
  })

  it('returns fallback string when null', () => {
    expect(summarizeAssets(null)).toBe('No assets data')
  })

  it('returns fallback string on empty object', () => {
    expect(summarizeAssets({})).toBe('No assets generated')
  })

  it('handles empty assetIds array', () => {
    expect(summarizeAssets({ assetIds: [] })).toBe('No assets generated')
  })

  it('handles non-array assetIds', () => {
    expect(summarizeAssets({ assetIds: 'not-an-array' })).toBe('No assets generated')
  })
})

// ─── summarizePreview ─────────────────────────────────────────────────────────

describe('summarizePreview', () => {
  it('returns slug as URL path', () => {
    expect(summarizePreview({ seoOverrides: { slug: 'my-great-post', title: 'My Great Post' } }))
      .toBe('/my-great-post')
  })

  it('falls back to title when slug is empty', () => {
    expect(summarizePreview({ seoOverrides: { slug: '', title: 'My Title' } }))
      .toBe('My Title')
  })

  it('returns auto-derived message when autoDerived=true', () => {
    expect(summarizePreview({ autoDerived: true })).toBe('Preview auto-derived')
  })

  it('returns skipped message when skipped=true', () => {
    expect(summarizePreview({ skipped: true })).toBe('Preview auto-derived')
  })

  it('returns "Preview ready" when composedHtml present', () => {
    expect(summarizePreview({ composedHtml: '<html>...</html>' })).toBe('Preview ready')
  })

  it('returns fallback string when null', () => {
    expect(summarizePreview(null)).toBe('No preview data')
  })

  it('returns fallback string on empty object', () => {
    expect(summarizePreview({})).toBe('Preview complete')
  })

  it('handles non-object seoOverrides', () => {
    expect(summarizePreview({ seoOverrides: null })).toBe('Preview complete')
  })
})

// ─── summarizePublish ─────────────────────────────────────────────────────────

describe('summarizePublish', () => {
  it('returns status + published URL', () => {
    expect(summarizePublish({ status: 'publish', publishedUrl: 'https://blog.example.com/my-post' }))
      .toBe('publish: https://blog.example.com/my-post')
  })

  it('uses "published" as default status when status is empty', () => {
    expect(summarizePublish({ publishedUrl: 'https://example.com/post' }))
      .toBe('published: https://example.com/post')
  })

  it('falls back to post ID when publishedUrl is missing', () => {
    expect(summarizePublish({ status: 'draft', wordpressPostId: 42 }))
      .toBe('draft: post #42')
  })

  it('returns status alone when no URL and no ID', () => {
    expect(summarizePublish({ status: 'scheduled' })).toBe('scheduled')
  })

  it('returns fallback string when null', () => {
    expect(summarizePublish(null)).toBe('No publish data')
  })

  it('returns fallback string on empty object (default "published")', () => {
    expect(summarizePublish({})).toBe('published')
  })

  it('handles non-finite wordpressPostId', () => {
    expect(summarizePublish({ wordpressPostId: NaN })).toBe('published')
  })

  it('handles array input', () => {
    expect(summarizePublish([])).toBe('No publish data')
  })
})

// ─── summarizeStage dispatcher ────────────────────────────────────────────────

describe('summarizeStage', () => {
  it('dispatches to the correct formatter', () => {
    expect(summarizeStage('brainstorm', { ideaTitle: 'My Idea' })).toBe('My Idea')
    expect(summarizeStage('research', { approvedCardsCount: 5 })).toBe('5 cards approved')
    expect(summarizeStage('publish', { publishedUrl: 'https://ex.com' }))
      .toBe('published: https://ex.com')
  })

  it('returns graceful fallback for unknown stage', () => {
    expect(summarizeStage('unknown-stage', { foo: 'bar' })).toBe('unknown-stage complete')
  })

  it('does not throw for any null combination', () => {
    const stages = ['brainstorm', 'research', 'canonical', 'production', 'review', 'assets', 'preview', 'publish']
    for (const stage of stages) {
      expect(() => summarizeStage(stage, null)).not.toThrow()
      expect(() => summarizeStage(stage, undefined)).not.toThrow()
      expect(() => summarizeStage(stage, {})).not.toThrow()
    }
  })
})
