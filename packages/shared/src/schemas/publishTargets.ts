/**
 * Publish-target type definitions.
 *
 * Mirrors the `publish_targets.type` DB CHECK constraint from
 * migration `20260514100000_add_tracks_and_publish_targets.sql`.
 */
import { z } from 'zod';

export const PUBLISH_TARGET_TYPES = [
  'wordpress',
  'youtube',
  'spotify',
  'apple_podcasts',
  'rss',
] as const;

export type PublishTargetType = (typeof PUBLISH_TARGET_TYPES)[number];

export const publishTargetSchema = z.object({
  id: z.string(),
  channelId: z.string().nullable(),
  type: z.enum(PUBLISH_TARGET_TYPES),
  configJson: z.record(z.unknown()).nullable(),
  displayName: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type PublishTarget = z.infer<typeof publishTargetSchema>;
