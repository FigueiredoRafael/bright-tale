import { z } from "zod";

export const generateImageRequestSchema = z.object({
  prompt: z.string().min(10, "Prompt must be at least 10 characters").max(500),
  project_id: z.string().optional(),
  content_type: z.enum(["blog", "video", "shorts", "podcast"]).optional(),
  content_id: z.string().optional(),
  role: z.string().optional(), // "featured" | "section_1" | "thumbnail_option_1" | "chapter_1"
  numImages: z.number().int().min(1).max(4).default(1),
  aspectRatio: z.enum(["16:9", "1:1", "9:16", "4:3"]).default("16:9"),
  outputMimeType: z.enum(["image/jpeg", "image/png"]).default("image/jpeg"),
});

export const imageGeneratorConfigSchema = z.object({
  provider: z.enum(["gemini"]),
  api_key: z.string().min(1, "API key is required"),
  model: z.enum([
    "gemini-2.5-flash-image",
    "imagen-3.0-generate-002",
  ]),
  is_active: z.boolean().default(false),
  config_json: z.string().optional(), // JSON string for advanced config
});

export const updateImageGeneratorConfigSchema = imageGeneratorConfigSchema.partial().extend({
  is_active: z.boolean().optional(),
});

const outlineItemSchema = z.object({
  h2: z.string(),
  key_points: z.array(z.string()).optional(),
});

const chapterItemSchema = z.object({
  title: z.string(),
});

const thumbnailHintSchema = z.object({
  visual_concept: z.string().optional(),
  emotion: z.string().optional(),
});

const agentSectionPromptSchema = z.object({
  heading: z.string(),
  prompt: z.string(),
});

const agentChapterPromptSchema = z.object({
  chapter_title: z.string(),
  prompt: z.string(),
});

const agentImagePromptsSchema = z.object({
  featured: z.string().optional(),
  sections: z.array(agentSectionPromptSchema).optional(),
  thumbnail_option_1: z.string().optional(),
  thumbnail_option_2: z.string().optional(),
  chapters: z.array(agentChapterPromptSchema).optional(),
});

export const suggestPromptsRequestSchema = z.object({
  content_type: z.enum(["blog", "video", "shorts", "podcast", "standalone"]),
  title: z.string().optional(),
  role: z.string(), // "featured" | "section_1" | "thumbnail_option_1" | "chapter_1"
  outline: z.array(outlineItemSchema).optional(),
  chapters: z.array(chapterItemSchema).optional(),
  thumbnail: thumbnailHintSchema.optional(),
  agent_image_prompts: agentImagePromptsSchema.optional(),
});

export type GenerateImageRequest = z.infer<typeof generateImageRequestSchema>;
export type ImageGeneratorConfig = z.infer<typeof imageGeneratorConfigSchema>;
export type SuggestPromptsRequest = z.infer<typeof suggestPromptsRequestSchema>;
