/**
 * Shorts Draft API schemas for validation
 */

import { z } from "zod";

export const shortItemSchema = z.object({
  short_number: z.number().int().min(1),
  title: z.string().min(3).max(200),
  hook: z.string(),
  script: z.string(),
  duration: z.string(),
  visual_style: z
    .string()
    .transform((val) => {
      // If AI outputted the entire template string "option1|option2", pick first
      const raw = val.includes("|") ? val.split("|")[0] : val;
      const normalized = raw.toLowerCase().replace(/_/g, " ").replace(/-roll/, "-roll").trim();
      if (normalized === "talking head" || normalized === "talking-head") return "talking head";
      if (normalized === "b-roll" || normalized === "b roll" || normalized === "broll") return "b-roll";
      if (normalized === "text overlay" || normalized === "text-overlay") return "text overlay";
      return raw.trim();
    })
    .pipe(z.enum(["talking head", "b-roll", "text overlay"])),
  cta: z.string(),
  sound_effects: z.string().optional(),
  background_music: z.string().optional(),
});

export const createShortsSchema = z.object({
  shorts: z.array(shortItemSchema).min(1).max(10),
  short_count: z.number().int().min(1).default(3),
  total_duration: z.string().optional(),
  status: z.enum(["draft", "review", "approved", "published"]).default("draft"),
  project_id: z.string().cuid().optional(),
  idea_id: z.string().optional(),
});

export type CreateShortsInput = z.infer<typeof createShortsSchema>;

export const updateShortsSchema = createShortsSchema.partial().omit({ status: true }).extend({
  status: z.enum(["draft", "review", "approved", "published"]).optional(),
});

export type UpdateShortsInput = z.infer<typeof updateShortsSchema>;

export const shortsQuerySchema = z.object({
  status: z.enum(["draft", "review", "approved", "published"]).optional(),
  project_id: z.string().optional(),
  idea_id: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
});

export type ShortsQuery = z.infer<typeof shortsQuerySchema>;
