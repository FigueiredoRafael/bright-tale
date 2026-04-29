/**
 * Zod Schemas for AI Provider Configuration
 */

import { z } from "zod";

export const aiProviderSchema = z.enum(["openai", "anthropic", "gemini", "ollama"]);

export const aiProviderSchemaWithAlias = z.union([
  aiProviderSchema,
  z.literal('local').transform(() => 'ollama' as const),
]);

export const createAIConfigSchema = z.object({
  provider: aiProviderSchema,
  api_key: z.string().min(1, "API key is required"),
  is_active: z.boolean().default(false),
  config_json: z.string().optional(),
});

export const updateAIConfigSchema = z.object({
  api_key: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
  config_json: z.string().optional(),
});

export const testAIConfigSchema = z.object({
  provider: aiProviderSchema,
  api_key: z.string().min(1),
  config_json: z.string().optional(),
});

export type AIProvider = z.infer<typeof aiProviderSchema>;
export type AiProvider = AIProvider;
export type CreateAIConfig = z.infer<typeof createAIConfigSchema>;
export type UpdateAIConfig = z.infer<typeof updateAIConfigSchema>;
export type TestAIConfig = z.infer<typeof testAIConfigSchema>;
