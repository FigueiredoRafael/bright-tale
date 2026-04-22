import { z } from 'zod';

export const qualityTierSchema = z.enum([
  'excellent',
  'good',
  'needs_revision',
  'reject',
  'not_requested',
]);

export type QualityTier = z.infer<typeof qualityTierSchema>;

export const rubricChecksSchema = z.object({
  critical_issues: z.array(z.string()),
  minor_issues: z.array(z.string()),
  strengths: z.array(z.string()),
});

export type RubricChecks = z.infer<typeof rubricChecksSchema>;

const contentReviewShape = {
  verdict: z.string().optional(),
  quality_tier: qualityTierSchema.optional(),
  rubric_checks: rubricChecksSchema.optional(),
  strengths: z.array(z.string()).optional(),
  issues: z.unknown().optional(),
  notes: z.string().optional(),
};

export const reviewOutputSchema = z.object({
  idea_id: z.string(),
  overall_verdict: z.enum(['approved', 'revision_required', 'rejected']),
  overall_notes: z.string(),
  blog_review: z.object(contentReviewShape).optional(),
  video_review: z.object(contentReviewShape).optional(),
  shorts_review: z.object(contentReviewShape).optional(),
  podcast_review: z.object(contentReviewShape).optional(),
  engagement_review: z.object(contentReviewShape).optional(),
  ready_to_publish: z.boolean(),
});

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

export function validateReviewOutput(data: unknown) {
  return reviewOutputSchema.safeParse(data);
}
