/**
 * Shorts module schema
 * Zod schema for the shorts format agent's output — an array of ShortOutput.
 */

import { z } from "zod";

export const shortItemSchema = z.object({
  short_number: z.number().int().min(1),
  title: z.string().min(1),
  hook: z.string().min(1),
  script: z.string().min(1),
  duration: z.string().min(1),
  visual_style: z
    .string()
    .transform((val) => {
      const raw = val.includes("|") ? val.split("|")[0] : val;
      const normalized = raw.toLowerCase().replace(/_/g, " ").trim();
      if (normalized === "talking head" || normalized === "talking-head") return "talking head";
      if (normalized === "b-roll" || normalized === "b roll" || normalized === "broll") return "b-roll";
      if (normalized === "text overlay" || normalized === "text-overlay") return "text overlay";
      return raw.trim();
    })
    .pipe(z.enum(["talking head", "b-roll", "text overlay"])),
  cta: z.string(),
  sound_effects: z.string().optional(),
  background_music: z.string().optional(),
  content_warning: z.string().optional(),
});

/** The shorts output is an array of short items */
export const shortsOutputSchema = z.array(shortItemSchema).min(1);

export type ShortItem = z.infer<typeof shortItemSchema>;
export type ShortsModuleOutput = z.infer<typeof shortsOutputSchema>;
