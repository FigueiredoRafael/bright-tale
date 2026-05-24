import { describe, it, expect } from 'vitest'
import { videoAssetBundleSchema } from '../videoAssetBundle'

// ─── Valid fixture ────────────────────────────────────────────────────────────

const validBundle = {
  meta: { draftId: 'draft-abc-123', title: 'How AI Works', channelName: 'Tech Insights' },
  images: [
    {
      kind: 'thumbnail' as const,
      prompt: 'A glowing neural network on dark background',
      filename: 'thumbnail-01.png',
    },
    {
      kind: 'broll' as const,
      chapterIndex: 1,
      prompt: 'Data center server room with blinking lights',
      filename: 'broll-ch01-01.png',
    },
    {
      kind: 'hook' as const,
      prompt: 'Person looking at a holographic display',
      filename: 'hook-01.png',
      url: 'https://cdn.example.com/hook-01.png',
    },
  ],
  texts: [
    { kind: 'title' as const, body: 'How AI Works', filename: 'title.txt' },
    { kind: 'description' as const, body: 'A deep dive into AI...', filename: 'description.txt' },
    { kind: 'tags' as const, body: 'AI, machine learning, neural networks', filename: 'tags.txt' },
    { kind: 'pinned_comment' as const, body: 'Pin this comment!', filename: 'pinned-comment.txt' },
    { kind: 'lower_thirds' as const, body: 'Chapter 1: Introduction', filename: 'lower-thirds.txt' },
    { kind: 'end_screen' as const, body: 'Subscribe for more!', filename: 'end-screen.txt' },
  ],
}

// ─── Schema validation tests ──────────────────────────────────────────────────

describe('videoAssetBundleSchema', () => {
  it('accepts a valid, fully-populated bundle', () => {
    const result = videoAssetBundleSchema.safeParse(validBundle)
    expect(result.success).toBe(true)
  })

  it('accepts a bundle with optional fields omitted (no url, no chapterIndex)', () => {
    const minimal = {
      meta: { draftId: 'd1', title: 'T', channelName: 'C' },
      images: [{ kind: 'thumbnail', prompt: 'bright thumbnail', filename: 'thumbnail-01.png' }],
      texts: [{ kind: 'title', body: 'T', filename: 'title.txt' }],
    }
    const result = videoAssetBundleSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  it('rejects an image with an invalid kind', () => {
    const bad = {
      ...validBundle,
      images: [{ ...validBundle.images[0], kind: 'poster' }],
    }
    const result = videoAssetBundleSchema.safeParse(bad)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('images')
    }
  })

  it('rejects a text entry with an invalid kind', () => {
    const bad = {
      ...validBundle,
      texts: [{ kind: 'caption', body: 'some text', filename: 'caption.txt' }],
    }
    const result = videoAssetBundleSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects extra unknown keys at the top level (strict)', () => {
    const bad = { ...validBundle, extraField: 'should-fail' }
    const result = videoAssetBundleSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects a bundle missing required meta.draftId', () => {
    const bad = { ...validBundle, meta: { title: 'T', channelName: 'C' } }
    const result = videoAssetBundleSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })
})
