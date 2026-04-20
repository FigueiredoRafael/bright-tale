import { z } from 'zod';

// Legacy — kept for backward compat reads
export const channelTypeSchema = z.enum(['text', 'face', 'dark', 'hybrid']);
export type ChannelType = z.infer<typeof channelTypeSchema>;

// NEW: media formats the channel produces (multi-select)
export const mediaTypeSchema = z.enum(['blog', 'video', 'shorts', 'podcast']);
export type MediaType = z.infer<typeof mediaTypeSchema>;

// NEW: video production style (only relevant when 'video' is in media_types)
export const videoStyleSchema = z.enum(['face', 'dark', 'hybrid']);
export type VideoStyle = z.infer<typeof videoStyleSchema>;

export const modelTierSchema = z.enum(['standard', 'premium', 'ultra', 'custom']);
export type ModelTier = z.infer<typeof modelTierSchema>;

/**
 * Lenient URL field used for user-entered channel links (youtube, blog, logo).
 * - Empty/whitespace → undefined
 * - Missing scheme (e.g. "youtube.com/@x") → prepended with `https://`
 */
const lenientUrl = z.preprocess((val) => {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (trimmed === '') return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}, z.string().url().optional());

export const createChannelSchema = z
  .object({
    name: z.string().min(1).max(200),
    niche: z.string().max(100).optional(),
    nicheTags: z.array(z.string()).optional(),
    market: z.string().default('br'),
    region: z.string().default('br'),
    language: z.string().default('pt-BR'),
    mediaTypes: z.array(mediaTypeSchema).min(1).default(['blog']),
    videoStyle: videoStyleSchema.optional(),
    // Legacy — accepted but deprecated
    channelType: channelTypeSchema.optional(),
    isEvergreen: z.boolean().default(true),
    youtubeUrl: lenientUrl,
    blogUrl: lenientUrl,
    logoUrl: lenientUrl.nullable(),
    voiceProvider: z.string().optional(),
    voiceId: z.string().optional(),
    voiceSpeed: z.number().min(0.5).max(2.0).optional(),
    modelTier: modelTierSchema.default('standard'),
    tone: z.string().optional(),
    templateId: z.string().uuid().optional(),
  })
  .refine(
    (data) => !data.mediaTypes.includes('video') || data.videoStyle !== undefined,
    { message: "videoStyle is required when 'video' is in mediaTypes", path: ['videoStyle'] },
  );

export type CreateChannel = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  niche: z.string().max(100).optional(),
  nicheTags: z.array(z.string()).optional(),
  market: z.string().optional(),
  region: z.string().optional(),
  language: z.string().optional(),
  mediaTypes: z.array(mediaTypeSchema).min(1).optional(),
  videoStyle: videoStyleSchema.nullable().optional(),
  channelType: channelTypeSchema.optional(),
  isEvergreen: z.boolean().optional(),
  youtubeUrl: lenientUrl,
  blogUrl: lenientUrl,
  logoUrl: lenientUrl.nullable(),
  voiceProvider: z.string().optional(),
  voiceId: z.string().optional(),
  voiceSpeed: z.number().min(0.5).max(2.0).optional(),
  modelTier: modelTierSchema.optional(),
  tone: z.string().optional(),
  templateId: z.string().uuid().optional(),
});

export type UpdateChannel = z.infer<typeof updateChannelSchema>;

export const listChannelsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type ListChannelsQuery = z.infer<typeof listChannelsQuerySchema>;
