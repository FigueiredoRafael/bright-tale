/**
 * buildVideoAssetBundle — pure manifest builder (no I/O, no async).
 *
 * Input:  a video content_draft row (draftId + draft_json) + channel stub
 * Output: a VideoAssetBundle manifest ready for the ZIP exporter (#218) and
 *         the AssetsEngine.
 *
 * Filename conventions (deterministic — same input → same output every time):
 *   thumbnail-01.png, thumbnail-02.png, …
 *   broll-ch01-01.png, broll-ch01-02.png, broll-ch02-01.png, …
 *   hook-01.png
 *   title.txt, description.txt, tags.txt, pinned-comment.txt,
 *   lower-thirds.txt, end-screen.txt
 */

import type { VideoAssetBundle, BundleImage, BundleText } from '../schemas/videoAssetBundle'
import type { ThumbnailIdea, LowerThird } from '../types/agents'

// ─── Input types ─────────────────────────────────────────────────────────────

/** Local-only — not re-exported to avoid naming collisions with agents.ts */
interface VideoBundleChapter {
  chapter_number: number
  title: string
  duration: string
  content: string
  b_roll_suggestions: string[]
  key_stat_or_quote: string
  /** AI-generated Imagen prompts for each b-roll shot. Parallel array to b_roll_suggestions. */
  b_roll_prompts?: string[]
  sound_effects?: string
  background_music?: string
}

/** Local-only — not re-exported */
interface VideoBundleHook {
  duration: string
  content: string
  visual_notes: string
  /** AI-generated Imagen prompt for the hook image. */
  image_prompt?: string
}

export interface VideoDraftJson {
  /** Three title options from the AI (legacy shape) */
  title_options?: string[]
  /** v0.3 shape — preferred over title_options */
  video_title?: { primary: string; alternatives?: string[] }
  thumbnail_ideas?: ThumbnailIdea[]
  script?: {
    hook?: VideoBundleHook
    chapters?: VideoBundleChapter[]
  }
  video_description?: string
  /** String array of tags or a comma-separated string */
  tags?: string[] | string
  pinned_comment?: string
  lower_thirds?: LowerThird[]
}

export interface VideoAssetBundleInput {
  draftId: string
  draftJson: VideoDraftJson
  channel: { name: string }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function derivePrimaryTitle(draftJson: VideoDraftJson): string {
  if (draftJson.video_title?.primary) return draftJson.video_title.primary
  if (draftJson.title_options && draftJson.title_options.length > 0) return draftJson.title_options[0]
  return ''
}

function buildThumbnailImages(ideas: ThumbnailIdea[] | undefined): BundleImage[] {
  if (!ideas || ideas.length === 0) return []
  return ideas.map((idea, i) => ({
    kind: 'thumbnail' as const,
    prompt: [idea.concept, idea.text_overlay, idea.emotion].filter(Boolean).join(' · '),
    filename: `thumbnail-${pad2(i + 1)}.png`,
  }))
}

function buildBrollImages(chapters: VideoBundleChapter[] | undefined): BundleImage[] {
  if (!chapters || chapters.length === 0) return []
  const result: BundleImage[] = []
  for (const chapter of chapters) {
    const prompts = chapter.b_roll_prompts ?? []
    if (prompts.length === 0) continue
    prompts.forEach((prompt, i) => {
      result.push({
        kind: 'broll' as const,
        chapterIndex: chapter.chapter_number,
        prompt,
        filename: `broll-ch${pad2(chapter.chapter_number)}-${pad2(i + 1)}.png`,
      })
    })
  }
  return result
}

function buildHookImages(hook: VideoBundleHook | undefined): BundleImage[] {
  if (!hook?.image_prompt) return []
  return [
    {
      kind: 'hook' as const,
      prompt: hook.image_prompt,
      filename: 'hook-01.png',
    },
  ]
}

function buildTextEntries(draftJson: VideoDraftJson): BundleText[] {
  const entries: BundleText[] = []
  const title = derivePrimaryTitle(draftJson)
  if (title) entries.push({ kind: 'title', body: title, filename: 'title.txt' })

  if (draftJson.video_description) {
    entries.push({ kind: 'description', body: draftJson.video_description, filename: 'description.txt' })
  }

  if (draftJson.tags) {
    const tagsBody = Array.isArray(draftJson.tags) ? draftJson.tags.join(', ') : draftJson.tags
    entries.push({ kind: 'tags', body: tagsBody, filename: 'tags.txt' })
  }

  if (draftJson.pinned_comment) {
    entries.push({ kind: 'pinned_comment', body: draftJson.pinned_comment, filename: 'pinned-comment.txt' })
  }

  if (draftJson.lower_thirds && draftJson.lower_thirds.length > 0) {
    const body = draftJson.lower_thirds
      .map(lt => `[${lt.timestamp}] ${lt.line1}${lt.line2 ? ` · ${lt.line2}` : ''} (${lt.duration_seconds}s)`)
      .join('\n')
    entries.push({ kind: 'lower_thirds', body, filename: 'lower-thirds.txt' })
  }

  return entries
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Pure function — no I/O, no side effects.
 * Calling it twice with the same input returns deep-equal manifests.
 */
export function buildVideoAssetBundle(input: VideoAssetBundleInput): VideoAssetBundle {
  const { draftId, draftJson, channel } = input
  const title = derivePrimaryTitle(draftJson)

  const images: BundleImage[] = [
    ...buildThumbnailImages(draftJson.thumbnail_ideas),
    ...buildBrollImages(draftJson.script?.chapters),
    ...buildHookImages(draftJson.script?.hook),
  ]

  const texts: BundleText[] = buildTextEntries(draftJson)

  return {
    meta: {
      draftId,
      title,
      channelName: channel.name,
    },
    images,
    texts,
  }
}
