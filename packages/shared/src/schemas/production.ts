import { z } from "zod";

/**
 * BC Production Agent Schemas
 * Maps to BC_PRODUCTION_INPUT and BC_PRODUCTION_OUTPUT contracts
 */

// Production Input Schema
export const productionInputSchema = z.object({
  selected_idea: z.object({
    idea_id: z.string().regex(/^BC-IDEA-\d{3}$/),
    title: z.string().min(10),
    core_tension: z.string().min(20),
    target_audience: z.string().min(10),
    primary_keyword: z.string().min(2),
    mrbeast_hook: z.string().min(20),
    monetization: z.object({
      affiliate_angle: z.string().min(10),
    }),
  }),
  production_settings: z.object({
    goal: z.enum(["growth", "engagement", "authority", "monetization"]),
    tone: z.enum(["curious", "authoritative", "casual", "inspirational"]),
    blog_words: z.string().regex(/^\d+-\d+$/), // e.g., "1400-2200"
    video_minutes: z.string().regex(/^\d+-\d+$/), // e.g., "8-10"
    affiliate_policy: z.object({
      include: z.boolean(),
      placement: z.string(), // e.g., "around 60% mark"
    }),
  }),
});

export type ProductionInput = z.infer<typeof productionInputSchema>;

// Production Output Schema
export const productionOutputSchema = z.object({
  blog: z.object({
    title: z.string().min(20).max(200),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    meta_description: z.string().min(100).max(160),
    primary_keyword: z.string().min(2),
    outline: z
      .array(
        z.object({
          h2: z.string().min(10),
          bullets: z.array(z.string()).min(1),
        }),
      )
      .min(3),
    full_draft: z.string().min(1000),
    affiliate_insert: z.object({
      location: z.string(),
      copy: z.string().min(30),
      rationale: z.string().min(20),
    }),
  }),
  video: z.object({
    title_options: z.array(z.string().min(20)).min(3).max(5),
    thumbnail_best_bet: z.object({
      visual: z.string().min(20),
      overlay_text: z.string().min(5).max(50),
    }),
    script: z.object({
      hook_0_10s: z.string().min(50),
      context_0_10_0_45: z.string().min(100),
      teaser_0_45_1_00: z.string().min(50),
      chapters: z
        .array(
          z.object({
            time_range: z.string().regex(/^\d+:\d+-\d+:\d+$/),
            chapter_title: z.string().min(10),
            content: z.string().min(100),
            b_roll: z.array(z.string()).min(1),
            sound_effects: z.string().optional(),
            background_music: z.string().optional(),
          }),
        )
        .min(1),
      affiliate_60_percent: z.object({
        time_range: z.string().regex(/^\d+:\d+-\d+:\d+$/),
        content: z.string().min(50),
        b_roll: z.array(z.string()).min(1),
        sound_effects: z.string().optional(),
        background_music: z.string().optional(),
      }),
      ending_takeaway: z.string().min(50),
      cta: z.string().min(20),
      sound_effects: z.string().optional(),
      background_music: z.string().optional(),
    }),
  }),
  shorts: z
    .array(
      z.object({
        title: z.string().min(10).max(100),
        script: z.string().min(50).max(500),
        shots: z.array(z.string()).min(2).max(5),
        sound_effects: z.string().optional(),
        background_music: z.string().optional(),
      }),
    )
    .min(3)
    .max(5),
  engagement: z.object({
    pinned_comments: z.array(z.string().min(20)).min(3).max(5),
  }),
  visuals: z.object({
    thumbnails: z
      .array(
        z.object({
          visual: z.string().min(20),
          overlay_text: z.string().min(5).max(50),
          background_style: z.string().min(10),
          why_it_works: z.string().min(20),
        }),
      )
      .min(3)
      .max(5),
  }),
});

export type ProductionOutput = z.infer<typeof productionOutputSchema>;

// Helper function to validate Production input
export function validateProductionInput(data: unknown) {
  return productionInputSchema.safeParse(data);
}

// Helper function to validate Production output
export function validateProductionOutput(data: unknown) {
  return productionOutputSchema.safeParse(data);
}
