/**
 * VideoAssetBundle — Zod schema for the video asset manifest DTO.
 *
 * Sealed shape (issue #216). Consumed by:
 *   - AssetsEngine (generates / displays assets)
 *   - ZIP exporter (#218)
 *   - API endpoint that persists the bundle
 *
 * Strict at top level (rejects extra keys) to catch stale callers.
 */

import { z } from 'zod'

const imageKindSchema = z.enum(['thumbnail', 'broll', 'hook'])
const textKindSchema = z.enum([
  'title',
  'description',
  'tags',
  'pinned_comment',
  'lower_thirds',
  'end_screen',
])

const bundleImageSchema = z.object({
  kind: imageKindSchema,
  /** Only present for broll entries; indicates which chapter this belongs to (1-based). */
  chapterIndex: z.number().int().positive().optional(),
  /** Pre-signed or CDN URL of the generated image (absent until the image is actually generated). */
  url: z.string().url().optional(),
  /** AI image-generation prompt. */
  prompt: z.string().min(1),
  /** Deterministic filename: thumbnail-01.png, broll-ch01-01.png, hook-01.png */
  filename: z.string().min(1),
})

const bundleTextSchema = z.object({
  kind: textKindSchema,
  body: z.string(),
  /** Deterministic filename: title.txt, description.txt, tags.txt, etc. */
  filename: z.string().min(1),
})

export const videoAssetBundleSchema = z
  .object({
    meta: z.object({
      draftId: z.string().min(1),
      title: z.string().min(1),
      channelName: z.string().min(1),
    }),
    images: z.array(bundleImageSchema),
    texts: z.array(bundleTextSchema),
  })
  .strict()

export type BundleImage = z.infer<typeof bundleImageSchema>
export type BundleText = z.infer<typeof bundleTextSchema>
export type VideoAssetBundle = z.infer<typeof videoAssetBundleSchema>
