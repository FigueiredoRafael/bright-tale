/**
 * Phase 2.5 pipeline schemas (F2-015).
 * Covers brainstorm_sessions, research_sessions, content_drafts, content_assets.
 */
import { z } from 'zod';

export const brainstormInputModes = ['blind', 'fine_tuned', 'reference_guided'] as const;
export type BrainstormInputMode = (typeof brainstormInputModes)[number];

export const pipelineStatuses = ['pending', 'running', 'completed', 'failed'] as const;
export const researchStatuses = ['pending', 'running', 'completed', 'reviewed', 'failed'] as const;
export const draftStatuses = [
  'draft',
  'in_review',
  'approved',
  'scheduled',
  'published',
  'failed',
] as const;
export const researchLevels = ['surface', 'medium', 'deep'] as const;
export type ResearchLevel = (typeof researchLevels)[number];

export const contentDraftTypes = ['blog', 'video', 'shorts', 'podcast', 'engagement'] as const;
export type ContentDraftType = (typeof contentDraftTypes)[number];

export const reviewVerdicts = ['pending', 'approved', 'revision_required', 'rejected'] as const;
export type ReviewVerdict = (typeof reviewVerdicts)[number];

export const assetRoles = [
  'featured_image',
  'body_section_1',
  'body_section_2',
  'body_section_3',
  'body_section_4',
  'body_section_5',
  'thumbnail',
  'thumbnail_alt',
  'meta_og',
] as const;
export type AssetRole = (typeof assetRoles)[number];

export const assetSourceTypes = ['ai_generated', 'manual_upload', 'unsplash'] as const;
export type AssetSourceType = (typeof assetSourceTypes)[number];

export const assetTypes = ['image', 'thumbnail', 'audio', 'video_clip'] as const;
export type AssetType = (typeof assetTypes)[number];

// ─── Brainstorm Session ────────────────────────────────────────────────────
export const createBrainstormSessionSchema = z.object({
  channelId: z.string().uuid().optional(),
  inputMode: z.enum(brainstormInputModes),
  inputJson: z.record(z.unknown()).default({}),
  modelTier: z.string().default('standard'),
});
export type CreateBrainstormSessionInput = z.infer<typeof createBrainstormSessionSchema>;

// ─── Research Session ──────────────────────────────────────────────────────
export const createResearchSessionSchema = z.object({
  channelId: z.string().uuid().optional(),
  ideaId: z.string().optional(),
  level: z.enum(researchLevels),
  focusTags: z.array(z.string()).default([]),
  inputJson: z.record(z.unknown()).default({}),
  modelTier: z.string().default('standard'),
});
export type CreateResearchSessionInput = z.infer<typeof createResearchSessionSchema>;

export const reviewResearchCardsSchema = z.object({
  approvedCardsJson: z.array(z.record(z.unknown())),
});
export type ReviewResearchCardsInput = z.infer<typeof reviewResearchCardsSchema>;

// ─── Content Draft ─────────────────────────────────────────────────────────
export const createContentDraftSchema = z.object({
  channelId: z.string().uuid().optional(),
  ideaId: z.string().optional(),
  researchSessionId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  type: z.enum(contentDraftTypes),
  title: z.string().optional(),
  canonicalCoreJson: z.record(z.unknown()).optional(),
});
export type CreateContentDraftInput = z.infer<typeof createContentDraftSchema>;

export const updateContentDraftSchema = z.object({
  title: z.string().optional(),
  draftJson: z.record(z.unknown()).optional(),
  reviewFeedbackJson: z.record(z.unknown()).optional(),
  status: z.enum(draftStatuses).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  publishedAt: z.string().datetime().nullable().optional(),
  publishedUrl: z.string().url().nullable().optional(),
});
export type UpdateContentDraftInput = z.infer<typeof updateContentDraftSchema>;

// ─── Blog Production Settings ─────────────────────────────────────────────
export const blogProductionSettingsSchema = z.object({
  wordCountTarget: z.number().min(300).max(5000).optional(),
  writingStyle: z.enum(['formal', 'conversational', 'technical', 'storytelling']).optional(),
  tone: z.enum(['authoritative', 'friendly', 'humorous', 'provocative']).optional(),
  keywords: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});
export type BlogProductionSettings = z.infer<typeof blogProductionSettingsSchema>;

// ─── Brainstorm Advanced Settings ─────────────────────────────────────────
export const temporalMixSchema = z
  .object({
    evergreen: z.number().min(0).max(100),
    seasonal: z.number().min(0).max(100),
    trending: z.number().min(0).max(100),
  })
  .refine((v) => v.evergreen + v.seasonal + v.trending === 100, {
    message: 'Temporal mix must sum to 100',
  });
export type TemporalMix = z.infer<typeof temporalMixSchema>;

export const brainstormAdvancedSchema = z.object({
  temporalMix: temporalMixSchema.optional(),
  constraints: z
    .object({
      avoidTopics: z.array(z.string()).default([]),
      requiredFormats: z.array(z.string()).default([]),
    })
    .optional(),
  ideasRequested: z.number().int().min(1).max(10).default(5),
  performanceContext: z
    .object({
      recentWinners: z.array(z.string()).default([]),
      recentLosers: z.array(z.string()).default([]),
    })
    .optional(),
  goal: z.enum(['growth', 'engagement', 'monetization', 'authority']).optional(),
});
export type BrainstormAdvancedInput = z.infer<typeof brainstormAdvancedSchema>;

// ─── Review ───────────────────────────────────────────────────────────────
export const submitReviewSchema = z.object({
  contentTypesRequested: z.array(z.enum(contentDraftTypes)).optional(),
});
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

export const reviseSchema = z.object({
  draftJson: z.record(z.unknown()),
  notes: z.string().optional(),
});
export type ReviseInput = z.infer<typeof reviseSchema>;

// ─── Publish Draft ────────────────────────────────────────────────────────
export const publishDraftSchema = z.object({
  draftId: z.string().uuid(),
  configId: z.string().uuid().optional(),
  mode: z.enum(['draft', 'publish', 'schedule']),
  scheduledDate: z.string().datetime().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});
export type PublishDraftInput = z.infer<typeof publishDraftSchema>;

// ─── Content Asset ─────────────────────────────────────────────────────────
export const createContentAssetSchema = z.object({
  draftId: z.string().uuid(),
  type: z.enum(assetTypes),
  url: z.string().url(),
  provider: z.string().optional(),
  metaJson: z.record(z.unknown()).default({}),
  creditsUsed: z.number().int().nonnegative().default(0),
  position: z.number().int().optional(),
  role: z.enum(assetRoles).optional(),
  altText: z.string().optional(),
  webpUrl: z.string().url().optional(),
  sourceType: z.enum(assetSourceTypes).default('ai_generated'),
});
export type CreateContentAssetInput = z.infer<typeof createContentAssetSchema>;
