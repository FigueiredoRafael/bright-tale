/**
 * Builder tests for buildVideoAssetBundle.
 *
 * Table-driven, pure transform — mirrors the pattern in
 * apps/app/src/lib/pipeline/__tests__/stage-results-by-track.test.ts
 *
 * Input is a realistic draft_json + channel stub.
 * Output is a VideoAssetBundle manifest.
 */

import { describe, it, expect } from 'vitest'
import { buildVideoAssetBundle } from '../videoAssetBundle'
import type { VideoAssetBundleInput } from '../videoAssetBundle'
import { videoAssetBundleSchema } from '../../schemas/videoAssetBundle'

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const channel = { name: 'Tech Insights' }

function makeDraftJson(overrides: Partial<VideoAssetBundleInput['draftJson']> = {}): VideoAssetBundleInput['draftJson'] {
  return {
    title_options: ['How AI Works', 'The Truth About AI', 'AI Explained'],
    video_title: { primary: 'How AI Works', alternatives: ['The Truth About AI', 'AI Explained'] },
    thumbnail_ideas: [
      { concept: 'Glowing brain', text_overlay: 'AI EXPLAINED', emotion: 'curiosity', color_palette: 'blue/dark', composition: 'centered' },
      { concept: 'Robot eye', text_overlay: 'THE FUTURE', emotion: 'shock', color_palette: 'red/dark', composition: 'rule-of-thirds' },
    ],
    script: {
      hook: {
        duration: '0:30',
        content: 'What if everything you knew about AI was wrong?',
        visual_notes: 'Close-up of circuit board',
        image_prompt: 'Circuit board with glowing connections, macro photography',
      },
      chapters: [
        {
          chapter_number: 1,
          title: 'The Basics',
          duration: '3:00',
          content: 'AI is...',
          b_roll_suggestions: ['Data center servers', 'Neural network diagram'],
          key_stat_or_quote: '95% accuracy',
          b_roll_prompts: ['Data center server room with blue LED lighting', 'Abstract neural network visualization'],
        },
        {
          chapter_number: 2,
          title: 'The Future',
          duration: '4:00',
          content: 'Tomorrow...',
          b_roll_suggestions: ['Futuristic city'],
          key_stat_or_quote: '2030 projection',
          b_roll_prompts: ['Futuristic city skyline at night with flying vehicles'],
        },
      ],
    },
    video_description: 'A deep dive into how AI actually works and what it means for the future.',
    tags: ['AI', 'machine learning', 'technology'],
    pinned_comment: 'Drop your AI questions below!',
    lower_thirds: [
      { timestamp: '0:45', line1: 'Chapter 1', line2: 'The Basics', duration_seconds: 3 },
    ],
    ...overrides,
  }
}

// ─── Representative input → manifest shape ────────────────────────────────────

describe('buildVideoAssetBundle', () => {
  describe('representative draft_json → expected manifest', () => {
    it('produces the correct count of thumbnail images', () => {
      const input: VideoAssetBundleInput = {
        draftId: 'draft-001',
        draftJson: makeDraftJson(),
        channel,
      }
      const bundle = buildVideoAssetBundle(input)
      const thumbnails = bundle.images.filter(i => i.kind === 'thumbnail')
      expect(thumbnails).toHaveLength(2)
    })

    it('produces deterministic thumbnail filenames (thumbnail-01.png, thumbnail-02.png)', () => {
      const bundle = buildVideoAssetBundle({ draftId: 'draft-001', draftJson: makeDraftJson(), channel })
      const thumbs = bundle.images.filter(i => i.kind === 'thumbnail')
      expect(thumbs[0].filename).toBe('thumbnail-01.png')
      expect(thumbs[1].filename).toBe('thumbnail-02.png')
    })

    it('produces broll entries with per-chapter deterministic filenames', () => {
      const bundle = buildVideoAssetBundle({ draftId: 'draft-001', draftJson: makeDraftJson(), channel })
      const brolls = bundle.images.filter(i => i.kind === 'broll')
      // ch01 has 2 b_roll prompts, ch02 has 1
      expect(brolls).toHaveLength(3)
      expect(brolls[0].filename).toBe('broll-ch01-01.png')
      expect(brolls[1].filename).toBe('broll-ch01-02.png')
      expect(brolls[2].filename).toBe('broll-ch02-01.png')
      expect(brolls[0].chapterIndex).toBe(1)
      expect(brolls[2].chapterIndex).toBe(2)
    })

    it('produces a hook image entry from hook.image_prompt', () => {
      const bundle = buildVideoAssetBundle({ draftId: 'draft-001', draftJson: makeDraftJson(), channel })
      const hooks = bundle.images.filter(i => i.kind === 'hook')
      expect(hooks).toHaveLength(1)
      expect(hooks[0].filename).toBe('hook-01.png')
    })

    it('produces the correct text entries with deterministic filenames', () => {
      const bundle = buildVideoAssetBundle({ draftId: 'draft-001', draftJson: makeDraftJson(), channel })
      const textKinds = bundle.texts.map(t => t.kind)
      expect(textKinds).toContain('title')
      expect(textKinds).toContain('description')
      expect(textKinds).toContain('tags')
      expect(textKinds).toContain('pinned_comment')
      expect(textKinds).toContain('lower_thirds')

      const titleEntry = bundle.texts.find(t => t.kind === 'title')
      expect(titleEntry?.filename).toBe('title.txt')
      expect(titleEntry?.body).toBe('How AI Works')

      const descEntry = bundle.texts.find(t => t.kind === 'description')
      expect(descEntry?.filename).toBe('description.txt')

      const tagsEntry = bundle.texts.find(t => t.kind === 'tags')
      expect(tagsEntry?.filename).toBe('tags.txt')

      const pinnedEntry = bundle.texts.find(t => t.kind === 'pinned_comment')
      expect(pinnedEntry?.filename).toBe('pinned-comment.txt')

      const lowerThirdsEntry = bundle.texts.find(t => t.kind === 'lower_thirds')
      expect(lowerThirdsEntry?.filename).toBe('lower-thirds.txt')
    })

    it('populates meta correctly', () => {
      const bundle = buildVideoAssetBundle({ draftId: 'draft-xyz', draftJson: makeDraftJson(), channel })
      expect(bundle.meta.draftId).toBe('draft-xyz')
      expect(bundle.meta.title).toBe('How AI Works')
      expect(bundle.meta.channelName).toBe('Tech Insights')
    })
  })

  // ─── Edge cases ─────────────────────────────────────────────────────────────

  describe('empty chapter b_roll → no broll entries for that chapter', () => {
    it('omits broll for a chapter with no b_roll_prompts', () => {
      const draftJson = makeDraftJson({
        script: {
          hook: {
            duration: '0:30',
            content: 'Hook...',
            visual_notes: 'Some notes',
          },
          chapters: [
            {
              chapter_number: 1,
              title: 'Chapter 1',
              duration: '3:00',
              content: 'Content...',
              b_roll_suggestions: [],
              key_stat_or_quote: 'stat',
              b_roll_prompts: [], // empty
            },
          ],
        },
      })
      const bundle = buildVideoAssetBundle({ draftId: 'd1', draftJson, channel })
      const brolls = bundle.images.filter(i => i.kind === 'broll')
      expect(brolls).toHaveLength(0)
    })
  })

  describe('missing thumbnail_ideas → no thumbnail entries', () => {
    it('produces no thumbnail images when thumbnail_ideas is absent', () => {
      const draftJson = makeDraftJson({ thumbnail_ideas: undefined })
      const bundle = buildVideoAssetBundle({ draftId: 'd2', draftJson, channel })
      const thumbs = bundle.images.filter(i => i.kind === 'thumbnail')
      expect(thumbs).toHaveLength(0)
    })
  })

  describe('missing title_options → only primary video_title entry', () => {
    it('uses video_title.primary when title_options is absent', () => {
      const draftJson = makeDraftJson({ title_options: undefined })
      const bundle = buildVideoAssetBundle({ draftId: 'd3', draftJson, channel })
      const titleEntry = bundle.texts.find(t => t.kind === 'title')
      expect(titleEntry?.body).toBe('How AI Works') // from video_title.primary
    })

    it('falls back to first title_option when video_title is absent', () => {
      const draftJson = makeDraftJson({ video_title: undefined })
      const bundle = buildVideoAssetBundle({ draftId: 'd4', draftJson, channel })
      const titleEntry = bundle.texts.find(t => t.kind === 'title')
      expect(titleEntry?.body).toBe('How AI Works') // first of title_options
    })
  })

  describe('determinism', () => {
    it('returns deep-equal manifests on repeated calls with the same input', () => {
      const input: VideoAssetBundleInput = { draftId: 'det-test', draftJson: makeDraftJson(), channel }
      const first = buildVideoAssetBundle(input)
      const second = buildVideoAssetBundle(input)
      expect(first).toEqual(second)
    })
  })

  describe('schema validity', () => {
    it('the output passes videoAssetBundleSchema.safeParse', () => {
      const bundle = buildVideoAssetBundle({ draftId: 'schema-check', draftJson: makeDraftJson(), channel })
      const result = videoAssetBundleSchema.safeParse(bundle)
      expect(result.success).toBe(true)
    })
  })
})
