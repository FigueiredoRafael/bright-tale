import { z } from 'zod';

export const updatePipelineSettingsSchema = z.object({
  reviewRejectThreshold: z.number().int().min(0).max(100).optional(),
  reviewApproveScore:    z.number().int().min(0).max(100).optional(),
  reviewMaxIterations:   z.number().int().min(1).max(20).optional(),
  defaultProviders: z.object({
    brainstorm:    z.string().optional(),
    research:      z.string().optional(),
    canonicalCore: z.string().optional(),
    draft:         z.string().optional(),
    review:        z.string().optional(),
    assets:        z.string().optional(),
  }).optional(),
  defaultModels: z.record(z.string()).optional(),
});
export type UpdatePipelineSettingsInput = z.infer<typeof updatePipelineSettingsSchema>;

export const pipelineSettingsResponseSchema = z.object({
  reviewRejectThreshold: z.number(),
  reviewApproveScore:    z.number(),
  reviewMaxIterations:   z.number(),
  defaultProviders:      z.record(z.string()),
  defaultModels:         z.record(z.string()).default({}),
});
export type PipelineSettingsResponse = z.infer<typeof pipelineSettingsResponseSchema>;

export const updateCreditSettingsSchema = z.object({
  costBlog:             z.number().int().min(0).optional(),
  costVideo:            z.number().int().min(0).optional(),
  costShorts:           z.number().int().min(0).optional(),
  costPodcast:          z.number().int().min(0).optional(),
  costCanonicalCore:    z.number().int().min(0).optional(),
  costReview:           z.number().int().min(0).optional(),
  costResearchSurface:  z.number().int().min(0).optional(),
  costResearchMedium:   z.number().int().min(0).optional(),
  costResearchDeep:     z.number().int().min(0).optional(),
});
export type UpdateCreditSettingsInput = z.infer<typeof updateCreditSettingsSchema>;

export const creditSettingsResponseSchema = z.object({
  costBlog:             z.number(),
  costVideo:            z.number(),
  costShorts:           z.number(),
  costPodcast:          z.number(),
  costCanonicalCore:    z.number(),
  costReview:           z.number(),
  costResearchSurface:  z.number(),
  costResearchMedium:   z.number(),
  costResearchDeep:     z.number(),
});
export type CreditSettingsResponse = z.infer<typeof creditSettingsResponseSchema>;
