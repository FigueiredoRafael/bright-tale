/**
 * Video Draft API schemas for validation
 */

import { z } from "zod";

export const videoScriptSectionSchema = z.object({
  duration: z.string(),
  content: z.string(),
  visual_notes: z.string(),
  sound_effects: z.string().optional(),
  background_music: z.string().optional(),
});
export type VideoScriptSection = z.infer<typeof videoScriptSectionSchema>;

export const videoChapterSchema = z.object({
  chapter_number: z.number(),
  title: z.string(),
  duration: z.string(),
  content: z.string(),
  b_roll_suggestions: z.array(z.string()),
  key_stat_or_quote: z.string(),
  sound_effects: z.string().optional(),
  background_music: z.string().optional(),
});
export type VideoChapter = z.infer<typeof videoChapterSchema>;

export const videoScriptSchema = z.object({
  hook: videoScriptSectionSchema,
  problem: videoScriptSectionSchema,
  teaser: videoScriptSectionSchema,
  chapters: z.array(videoChapterSchema),
  affiliate_segment: z.object({
    timestamp: z.string(),
    script: z.string(),
    transition_in: z.string(),
    transition_out: z.string(),
    visual_notes: z.string(),
    sound_effects: z.string().optional(),
    background_music: z.string().optional(),
  }).optional(),
  outro: z.object({
    duration: z.string(),
    recap: z.string(),
    cta: z.string(),
    end_screen_prompt: z.string(),
    sound_effects: z.string().optional(),
    background_music: z.string().optional(),
  }).optional(),
});
export type VideoScript = z.infer<typeof videoScriptSchema>;

const thumbnailSchema = z.object({
  visual_concept: z.string(),
  text_overlay: z.string(),
  emotion: z
    .string()
    .transform((val) => {
      // If AI outputted the entire template string "option1|option2", pick first
      const raw = val.includes("|") ? val.split("|")[0] : val;
      return raw.toLowerCase().trim();
    })
    .pipe(z.enum(["curiosity", "shock", "intrigue"])),
  why_it_works: z.string(),
});

export const createVideoSchema = z.object({
  title: z.string().min(3).max(300),
  title_options: z.array(z.string()).min(1),
  thumbnail: thumbnailSchema.optional(),
  script: videoScriptSchema,
  total_duration_estimate: z.string(),
  word_count: z.number().int().min(0).optional(),
  status: z.enum(["draft", "review", "approved", "published"]).default("draft"),
  project_id: z.string().cuid().optional(),
  idea_id: z.string().optional(),
});

export type CreateVideoInput = z.infer<typeof createVideoSchema>;

export const updateVideoSchema = z.object({
  title: z.string().min(3).max(300).optional(),
  title_options: z.array(z.string()).min(1).optional(),
  thumbnail: thumbnailSchema.optional(),
  script: videoScriptSchema.optional(),
  total_duration_estimate: z.string().optional(),
  word_count: z.number().int().min(0).optional(),
  status: z.enum(["draft", "review", "approved", "published"]).optional(),
  project_id: z.string().cuid().optional(),
  idea_id: z.string().optional(),
});

export type UpdateVideoInput = z.infer<typeof updateVideoSchema>;

export const videoQuerySchema = z.object({
  status: z.enum(["draft", "review", "approved", "published"]).optional(),
  project_id: z.string().optional(),
  idea_id: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
});

export type VideoQuery = z.infer<typeof videoQuerySchema>;
