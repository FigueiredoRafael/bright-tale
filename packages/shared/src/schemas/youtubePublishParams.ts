/**
 * Zod schema for POST /api/content-drafts/:id/youtube-publish request body.
 *
 * Fields map 1-to-1 to YouTube Data API v3 snippet + status resources.
 * The video file itself arrives as multipart in the route — not in this schema.
 */

import { z } from 'zod';

export const youtubePublishParams = z.object({
  /** ID of the `publish_targets` row that holds the encrypted OAuth token. */
  publishTargetId: z.string().min(1),

  /** YouTube video privacy. */
  visibility: z.enum(['public', 'unlisted', 'private']),

  /** Whether the video is made for kids (COPPA). */
  madeForKids: z.boolean(),

  /** YouTube category ID string (e.g. "22" for People & Blogs). */
  categoryId: z.string().min(1),

  /** BCP-47 language tag (e.g. "en", "pt"). */
  language: z.string().min(1),

  /**
   * Optional: ISO 8601 datetime to schedule the video for.
   * Only used when visibility is 'private' and publishAt is in the future
   * (YouTube scheduled publish). Defaults to immediate.
   */
  scheduleAt: z.string().datetime({ offset: true }).optional(),

  /**
   * Optional overrides for the video snippet fields.
   * When omitted the route reads title/description/tags from the draft_json.
   */
  title: z.string().max(100).optional(),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string()).max(500).optional(),

  /**
   * When true the adapter returns a synthetic success receipt without uploading
   * anything to YouTube. Use for preflight + testing.
   */
  dryRun: z.boolean().optional().default(false),
});

export type YouTubePublishParams = z.infer<typeof youtubePublishParams>;
