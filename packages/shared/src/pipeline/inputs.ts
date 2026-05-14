/**
 * Pipeline domain types and per-Stage input schemas.
 *
 * T1.6: STAGES tuple extended from 7 → 8 stages.
 * draft → split into canonical (shared project-level) + production (per-Track).
 * Legacy 'draft' stage rows remain valid until the data backfill migration runs.
 */
import { z } from 'zod';

// ─── Stage / Status / AwaitingReason ────────────────────────────────────────

/**
 * Canonical STAGES tuple (8 stages).
 * 'draft' is intentionally absent — it is a legacy DB value only.
 * Legacy code that reads 'draft' from DB must branch on it separately.
 */
export const STAGES = [
  'brainstorm',
  'research',
  'canonical',
  'production',
  'review',
  'assets',
  'preview',
  'publish',
] as const;
export type Stage = (typeof STAGES)[number];

/**
 * Legacy stage values still present in DB until data backfill (T-backfill).
 * Code that reads stage_runs rows must accept these too.
 */
export type LegacyStage = 'draft';

/** Union of current + legacy stages for DB reads. */
export type AnyStage = Stage | LegacyStage;

export const STAGE_RUN_STATUSES = [
  'queued',
  'running',
  'awaiting_user',
  'completed',
  'failed',
  'aborted',
  'skipped',
] as const;
export type StageRunStatus = (typeof STAGE_RUN_STATUSES)[number];

export const AWAITING_REASONS = [
  'manual_paste',
  'manual_advance',
  'manual_review',
] as const;
export type AwaitingReason = (typeof AWAITING_REASONS)[number];

export const TERMINAL_STATUSES: ReadonlySet<StageRunStatus> = new Set([
  'completed',
  'failed',
  'aborted',
  'skipped',
]);

export function isTerminalStatus(status: StageRunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// ─── Payload Ref ─────────────────────────────────────────────────────────────

export const PAYLOAD_KINDS = [
  'brainstorm_draft',
  'brainstorm_session',
  'research_session',
  'canonical_core_session',
  'content_draft',
  'review_session',
  'assets_session',
  'preview_record',
  'publish_record',
] as const;
export type PayloadKind = (typeof PAYLOAD_KINDS)[number];

export interface PayloadRef {
  kind: PayloadKind;
  id: string;
}

// ─── Stage Run record (matches the stage_runs table) ────────────────────────

export interface StageRun {
  id: string;
  projectId: string;
  trackId: string | null;
  publishTargetId: string | null;
  stage: AnyStage;
  status: StageRunStatus;
  awaitingReason: AwaitingReason | null;
  payloadRef: PayloadRef | null;
  attemptNo: number;
  inputJson: unknown;
  outcomeJson?: unknown;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Stage Labels ─────────────────────────────────────────────────────────────

export const STAGE_LABELS: Record<AnyStage, string> = {
  brainstorm: 'Idea',
  research: 'Research',
  canonical: 'Canonical',
  production: 'Production',
  review: 'Review',
  assets: 'Assets',
  preview: 'Preview',
  publish: 'Publish',
  // legacy
  draft: 'Draft (legacy)',
};

// ─── Per-Stage input schemas ─────────────────────────────────────────────────

// ─── Per-stage Zod schemas (pipeline-scoped names to avoid clashes) ──────────

export const stageBrainstormInputSchema = z.object({
  mode: z.enum(['topic_driven', 'reference_guided']),
  topic: z.string().min(1).optional(),
  referenceIdeaId: z.string().uuid().optional(),
  channelId: z.string().uuid().optional(),
  modelTier: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type StageBrainstormInput = z.infer<typeof stageBrainstormInputSchema>;

export const stageResearchInputSchema = z.object({
  level: z.enum(['surface', 'medium', 'deep']).optional(),
  focusTags: z.array(z.string()).optional(),
  channelId: z.string().uuid().optional(),
  ideaId: z.string().optional(),
  modelTier: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type StageResearchInput = z.infer<typeof stageResearchInputSchema>;

export const stageCanonicalInputSchema = z.object({
  // optional — dispatcher resolves from prior stages if absent
  ideaId: z.string().optional(),
  researchSessionId: z.string().optional(),
  personaId: z.string().optional(),
  modelTier: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type StageCanonicalInput = z.infer<typeof stageCanonicalInputSchema>;

export const stageProductionInputSchema = z.object({
  // content format; required so the dispatcher knows which agent to call
  type: z.enum(['blog', 'video', 'shorts', 'podcast']),
  trackId: z.string().uuid().optional(),
  // optional — dispatcher resolves from canonical stage if absent
  canonicalCoreJson: z.record(z.string(), z.unknown()).optional(),
  personaId: z.string().optional(),
  productionParams: z.record(z.string(), z.unknown()).optional(),
  modelTier: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type StageProductionInput = z.infer<typeof stageProductionInputSchema>;

export const stageReviewInputSchema = z.object({
  maxIterations: z.number().int().min(0).optional(),
  autoApproveThreshold: z.number().min(0).max(100).optional(),
  hardFailThreshold: z.number().min(0).max(100).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type StageReviewInput = z.infer<typeof stageReviewInputSchema>;

export const stageAssetsInputSchema = z.object({
  mode: z.enum(['auto_generate', 'briefs_only', 'manual_upload', 'skip']).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type StageAssetsInput = z.infer<typeof stageAssetsInputSchema>;

export const stagePreviewInputSchema = z.object({
  // no required inputs — all resolved from prior stages
  publishTargetId: z.string().uuid().optional(),
});
export type StagePreviewInput = z.infer<typeof stagePreviewInputSchema>;

export const stagePublishInputSchema = z.object({
  destinationId: z.string().optional(),
  publishTargetId: z.string().uuid().optional(),
  status: z.enum(['publish', 'draft', 'pending', 'future']).optional(),
  scheduledAt: z.string().datetime().optional(),
});
export type StagePublishInput = z.infer<typeof stagePublishInputSchema>;

/**
 * Legacy stageDraftInputSchema — kept for backward compatibility with legacy
 * stage_runs that still have stage='draft'. Removed after data backfill.
 */
export const stageDraftInputSchema = z.object({
  type: z.enum(['blog', 'video', 'shorts', 'podcast']),
  personaId: z.string().optional(),
  ideaId: z.string().optional(),
  researchSessionId: z.string().optional(),
  productionParams: z.record(z.string(), z.unknown()).optional(),
  modelTier: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type StageDraftInput = z.infer<typeof stageDraftInputSchema>;

/**
 * STAGE_INPUT_SCHEMAS maps every current Stage to its Zod schema.
 * Legacy 'draft' is handled separately by the legacy dispatcher.
 */
export const STAGE_INPUT_SCHEMAS: Record<Stage, z.ZodTypeAny> = {
  brainstorm: stageBrainstormInputSchema,
  research: stageResearchInputSchema,
  canonical: stageCanonicalInputSchema,
  production: stageProductionInputSchema,
  review: stageReviewInputSchema,
  assets: stageAssetsInputSchema,
  preview: stagePreviewInputSchema,
  publish: stagePublishInputSchema,
};

export function isStageMigrated(stage: Stage): boolean {
  const schema = STAGE_INPUT_SCHEMAS[stage];
  return schema !== undefined && schema._def.typeName !== 'ZodNever';
}
