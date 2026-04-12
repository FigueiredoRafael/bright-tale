import { z } from 'zod';

export const channelTypeSchema = z.enum(['text', 'face', 'dark', 'hybrid']);
export type ChannelType = z.infer<typeof channelTypeSchema>;

export const modelTierSchema = z.enum(['standard', 'premium', 'ultra', 'custom']);
export type ModelTier = z.infer<typeof modelTierSchema>;

export const createChannelSchema = z.object({
  name: z.string().min(1).max(200),
  niche: z.string().max(100).optional(),
  nicheTags: z.array(z.string()).optional(),
  market: z.string().default('br'),
  language: z.string().default('pt-BR'),
  channelType: channelTypeSchema.default('text'),
  isEvergreen: z.boolean().default(true),
  youtubeUrl: z.string().url().optional(),
  blogUrl: z.string().url().optional(),
  voiceProvider: z.string().optional(),
  voiceId: z.string().optional(),
  voiceSpeed: z.number().min(0.5).max(2.0).optional(),
  modelTier: modelTierSchema.default('standard'),
  tone: z.string().optional(),
  templateId: z.string().uuid().optional(),
});

export type CreateChannel = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = createChannelSchema.partial();

export type UpdateChannel = z.infer<typeof updateChannelSchema>;

export const listChannelsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type ListChannelsQuery = z.infer<typeof listChannelsQuerySchema>;
