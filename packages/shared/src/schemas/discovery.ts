import { z } from "zod";

/**
 * BC Discovery Agent Schemas
 * Maps to BC_DISCOVERY_INPUT and BC_DISCOVERY_OUTPUT contracts
 */

// Discovery Input Schema
export const discoveryInputSchema = z.object({
  performance_review: z.object({
    winners: z.array(z.string()),
    losers: z.array(z.string()),
  }),
  theme: z.object({
    primary: z.string(),
    subthemes: z.array(z.string()),
  }),
  goal: z.enum(["growth", "engagement", "authority", "monetization"]),
  temporal_mix: z.object({
    evergreen: z.number().min(0).max(100),
    seasonal: z.number().min(0).max(100),
    trending: z.number().min(0).max(100),
  }),
  constraints: z.object({
    avoid: z.array(z.string()),
    formats: z.array(z.enum(["blog", "video", "shorts", "podcast"])),
  }),
  output: z.object({
    ideas_requested: z.number().min(1).max(20),
  }),
});

export type DiscoveryInput = z.infer<typeof discoveryInputSchema>;

// Discovery Output Schema
export const discoveryOutputSchema = z.object({
  ideas: z
    .array(
      z.object({
        idea_id: z.string().regex(/^BC-IDEA-\d{3}$/),
        title: z.string().min(10).max(200),
        core_tension: z.string().min(20),
        target_audience: z.string().min(10),
        search_intent: z.enum([
          "informational",
          "investigational",
          "commercial",
          "mixed",
        ]),
        primary_keyword: z.object({
          keyword: z.string().min(2),
          difficulty: z.enum(["low", "medium", "high"]),
          basis: z.string().min(10),
        }),
        mrbeast_hook: z.string().min(20),
        monetization: z.object({
          affiliate_angle: z.string().min(10),
        }),
        why_it_wins: z.string().min(30),
        repurpose_map: z.object({
          blog: z.string().min(10),
          video: z.string().min(10),
          shorts: z.array(z.string().min(10)).min(1).max(5),
          podcast: z.string().min(10),
        }),
        risk_flags: z.array(z.string()).min(0),
        verdict: z.enum(["viable", "weak", "experimental"]),
      }),
    )
    .min(1),
  pick_recommendation: z.object({
    best_choice: z.string().regex(/^BC-IDEA-\d{3}$/),
    why: z.string().min(30),
  }),
});

export type DiscoveryOutput = z.infer<typeof discoveryOutputSchema>;

// Helper function to validate Discovery input
export function validateDiscoveryInput(data: unknown) {
  return discoveryInputSchema.safeParse(data);
}

// Helper function to validate Discovery output
export function validateDiscoveryOutput(data: unknown) {
  return discoveryOutputSchema.safeParse(data);
}

// Bulk create schema: research (discovery output), selected ideas (by idea_id), defaults, and optional idempotency token
export const bulkCreateSchema = z.object({
  research: discoveryOutputSchema,
  selected_ideas: z.array(z.string().regex(/^BC-IDEA-\d{3}$/)).min(1),
  defaults: z.object({
    goal: z
      .enum(["growth", "engagement", "authority", "monetization"])
      .optional(),
    tone: z.string().optional(),
    blog_words: z.number().optional(),
    video_minutes: z.number().optional(),
    affiliate_policy: z.string().optional(),
  }),
  idempotency_token: z.string().optional(),
});

export type BulkCreateInput = z.infer<typeof bulkCreateSchema>;
