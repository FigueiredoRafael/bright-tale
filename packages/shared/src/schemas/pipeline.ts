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

export const contentDraftTypes = ['blog', 'video', 'shorts', 'podcast'] as const;
export type ContentDraftType = (typeof contentDraftTypes)[number];

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

// ─── Content Asset ─────────────────────────────────────────────────────────
export const createContentAssetSchema = z.object({
  draftId: z.string().uuid(),
  type: z.enum(assetTypes),
  url: z.string().url(),
  provider: z.string().optional(),
  metaJson: z.record(z.unknown()).default({}),
  creditsUsed: z.number().int().nonnegative().default(0),
  position: z.number().int().optional(),
});
export type CreateContentAssetInput = z.infer<typeof createContentAssetSchema>;
