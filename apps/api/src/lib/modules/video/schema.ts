/**
 * Video module schema
 * Zod schema for VideoOutput — the video format agent's output contract.
 */

import { z } from "zod";

const videoScriptSectionSchema = z.object({
  duration: z.string().min(1),
  content: z.string().min(1),
  visual_notes: z.string().optional().default(""),
  sound_effects: z.string().optional(),
  background_music: z.string().optional(),
});

const chapterSchema = z.object({
  chapter_number: z.number().int().min(1),
  title: z.string().min(1),
  duration: z.string().min(1),
  content: z.string().min(1),
  b_roll_suggestions: z.array(z.string()).default([]),
  key_stat_or_quote: z.string().optional().default(""),
  sound_effects: z.string().optional(),
  background_music: z.string().optional(),
});

const affiliateSegmentSchema = z.object({
  timestamp: z.string(),
  script: z.string(),
  transition_in: z.string().optional().default(""),
  transition_out: z.string().optional().default(""),
  visual_notes: z.string().optional().default(""),
  sound_effects: z.string().optional(),
  background_music: z.string().optional(),
});

const outroSchema = z.object({
  duration: z.string(),
  recap: z.string(),
  cta: z.string(),
  end_screen_prompt: z.string(),
  sound_effects: z.string().optional(),
  background_music: z.string().optional(),
});

const videoScriptSchema = z.object({
  hook: videoScriptSectionSchema,
  problem: videoScriptSectionSchema,
  teaser: videoScriptSectionSchema,
  chapters: z.array(chapterSchema).min(1),
  affiliate_segment: affiliateSegmentSchema.optional(),
  outro: outroSchema.optional(),
});

const thumbnailSchema = z.object({
  visual_concept: z.string(),
  text_overlay: z.string(),
  emotion: z
    .string()
    .transform((v) => v.toLowerCase())
    .pipe(z.enum(["curiosity", "shock", "intrigue"])),
  why_it_works: z.string(),
});

const videoChapterImagePromptSchema = z.object({
  chapter_title: z.string(),
  prompt: z.string(),
});

const videoImagePromptsSchema = z.object({
  thumbnail_option_1: z.string(),
  thumbnail_option_2: z.string(),
  chapters: z.array(videoChapterImagePromptSchema).default([]),
});

export const videoOutputSchema = z.object({
  title_options: z.array(z.string().min(1)).min(1),
  thumbnail: thumbnailSchema.optional(),
  script: videoScriptSchema,
  total_duration_estimate: z.string().optional().default("TBD"),
  image_prompts: videoImagePromptsSchema.optional(),
  content_warning: z.string().optional(),
});

export type VideoModuleOutput = z.infer<typeof videoOutputSchema>;
