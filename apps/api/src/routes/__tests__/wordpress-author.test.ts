import { describe, it, expect } from 'vitest'
import { buildWpPostData } from '../wordpress.js'

const BASE_INPUT = {
  title: 'Test Post',
  slug: 'test-post',
  content: '<p>Content</p>',
  excerpt: 'Meta',
  status: 'draft' as const,
}

describe('buildWpPostData', () => {
  it('includes author when authorId is a number', () => {
    const payload = buildWpPostData({ ...BASE_INPUT, authorId: 42 })
    expect(payload.author).toBe(42)
  })

  it('omits author field when authorId is null', () => {
    const payload = buildWpPostData({ ...BASE_INPUT, authorId: null })
    expect('author' in payload).toBe(false)
  })

  it('omits author field when authorId is undefined', () => {
    const payload = buildWpPostData({ ...BASE_INPUT })
    expect('author' in payload).toBe(false)
  })
})
