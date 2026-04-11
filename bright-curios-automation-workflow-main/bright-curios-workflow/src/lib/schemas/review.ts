import { z } from "zod";

/**
 * BC Review Agent Schemas
 * Maps to BC_REVIEW_INPUT and BC_REVIEW_OUTPUT contracts
 */

// Review Input Schema
export const reviewInputSchema = z.object({
  stage: z.enum(["blog", "video", "publication"]),
  goals: z.object({
    primary: z.enum(["growth", "engagement", "authority", "monetization"]),
  }),
  asset: z.object({
    type: z.enum(["blog", "video", "shorts"]),
    content: z.string().min(100),
  }),
});

export type ReviewInput = z.infer<typeof reviewInputSchema>;

// Review Output Schema - Blog & Video Stage
export const reviewOutputBlogVideoSchema = z.object({
  stage: z.enum(["blog", "video"]),
  verdict: z.enum(["approved", "revision_required", "rejected"]),
  issues: z.object({
    critical: z.array(z.string()),
    minor: z.array(z.string()),
  }),
  required_changes: z.array(z.string()),
  gate: z.object({
    approved_for_next_stage: z.boolean(),
  }),
});

export type ReviewOutputBlogVideo = z.infer<typeof reviewOutputBlogVideoSchema>;

// Review Output Schema - Publication Stage
export const reviewOutputPublicationSchema = z.object({
  stage: z.literal("publication"),
  publish_plan: z.object({
    blog: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
      seo: z.object({
        title_variant: z.string().min(20).max(200),
        meta_description: z.string().min(100).max(160),
        internal_links: z.array(z.string()).min(1),
      }),
    }),
    youtube: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      title_final: z.string().min(20).max(100),
      description_outline: z.array(z.string()).min(3),
      tags: z.array(z.string().min(2)).min(5).max(15),
      pinned_comment_choice: z.string().min(20),
    }),
    shorts: z.object({
      schedule: z
        .array(
          z.object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            short_number: z.number().min(1).max(5),
          }),
        )
        .min(1)
        .max(5),
    }),
  }),
  packaging_tests: z.array(z.string()).min(1),
  ready_to_publish: z.boolean(),
});

export type ReviewOutputPublication = z.infer<
  typeof reviewOutputPublicationSchema
>;

// Combined Review Output Schema (discriminated union)
export const reviewOutputSchema = z.discriminatedUnion("stage", [
  reviewOutputBlogVideoSchema,
  reviewOutputPublicationSchema,
]);

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

// Helper function to validate Review input
export function validateReviewInput(data: unknown) {
  return reviewInputSchema.safeParse(data);
}

// Helper function to validate Review output (blog/video)
export function validateReviewOutputBlogVideo(data: unknown) {
  return reviewOutputBlogVideoSchema.safeParse(data);
}

// Helper function to validate Review output (publication)
export function validateReviewOutputPublication(data: unknown) {
  return reviewOutputPublicationSchema.safeParse(data);
}

// Helper function to validate any Review output
export function validateReviewOutput(data: unknown) {
  return reviewOutputSchema.safeParse(data);
}
