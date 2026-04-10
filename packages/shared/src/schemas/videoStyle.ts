/**
 * VideoStyleConfig schema and type
 * Defines the production style profile for a channel/project.
 * Injected into Agent 3 (video generation) to produce style-aware scripts.
 */

import { z } from "zod";

export const VIDEO_TEMPLATES = [
  "talking_head_standard",
  "talking_head_dynamic",
  "b_roll_documentary",
  "screen_record_tutorial",
  "hybrid",
] as const;

export type VideoTemplate = (typeof VIDEO_TEMPLATES)[number];

export const videoStyleConfigSchema = z.object({
  /** Production template — determines the overall style of generated video scripts */
  template: z.enum(VIDEO_TEMPLATES),

  /** How frequently cuts occur between shots */
  cut_frequency: z
    .enum(["slow", "moderate", "fast", "variable", "action_based"])
    .default("moderate"),

  /** How much B-roll footage is used relative to presenter footage */
  b_roll_density: z.enum(["low", "medium", "high"]).default("low"),

  /** How much text appears on screen during the video */
  text_overlays: z.enum(["none", "minimal", "moderate", "heavy"]).default("minimal"),

  /** Background music style for the video */
  music_style: z
    .enum(["calm_ambient", "energetic", "cinematic", "background_only", "none"])
    .default("calm_ambient"),

  /** Whether to include presenter tone-of-voice cues in the script */
  presenter_notes: z.boolean().default(false),

  /** Whether every section must include specific B-roll footage descriptions */
  b_roll_required: z.boolean().default(false),

  /** Voiceover narrative style (relevant for b_roll_documentary) */
  voiceover_style: z.enum(["conversational", "narrative", "tutorial"]).optional(),

  /** Whether to include screen annotation cues (relevant for screen_record_tutorial) */
  screen_annotations: z.boolean().optional(),
});

/** Output type — all defaults applied, all base fields present */
export type VideoStyleConfig = z.infer<typeof videoStyleConfigSchema>;

/** Input type — only `template` is required; optional fields may be omitted */
export type VideoStyleConfigInput = z.input<typeof videoStyleConfigSchema>;
