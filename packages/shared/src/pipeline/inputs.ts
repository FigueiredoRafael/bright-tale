/**
 * Pipeline domain types and per-Stage input schemas.
 * See CONTEXT.md for definitions of Stage, Stage Run, Stage Run Status, etc.
 *
 * In Slice 1, only `brainstorm` has a real Zod schema. The other Stages map
 * to `z.never()` and the orchestrator rejects them with STAGE_NOT_MIGRATED
 * until their respective slices land.
 */
import { z } from 'zod';

// ─── Stage / Status / AwaitingReason ────────────────────────────────────────

export const STAGES = [
  'brainstorm',
  'research',
  'draft',
  'review',
  'assets',
  'preview',
  'publish',
] as const;
export type Stage = (typeof STAGES)[number];

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

export const AWAITING_REASONS = ['manual_paste', 'manual_advance'] as const;
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
  stage: Stage;
  status: StageRunStatus;
  awaitingReason: AwaitingReason | null;
  payloadRef: PayloadRef | null;
  attemptNo: number;
  inputJson: unknown;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Per-Stage input schemas ────────────────────────────────────────────────
// Only brainstorm has a real schema in Slice 1.

export const brainstormInputSchema = z.object({
  mode: z.enum(['topic_driven', 'reference_guided']),
  topic: z.string().min(1).optional(),
  referenceUrl: z.string().url().optional(),
  niche: z.string().optional(),
  tone: z.string().optional(),
  audience: z.string().optional(),
  goal: z.string().optional(),
  constraints: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type BrainstormInput = z.infer<typeof brainstormInputSchema>;

export const researchInputSchema = z.object({
  // depth of research; required so the dispatcher can size the job
  level: z.enum(['surface', 'medium', 'deep']),
  // optional in autopilot — the dispatcher resolves topic from the prior
  // brainstorm Stage Run's recommendation pick when these are absent
  ideaId: z.string().optional(),
  topic: z.string().min(1).optional(),
  focusTags: z.array(z.string()).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type ResearchInput = z.infer<typeof researchInputSchema>;

export const previewInputSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type PreviewInput = z.infer<typeof previewInputSchema>;

export const publishInputSchema = z.object({
  // optional override target for the WordPress publish (defaults to the channel's configured site)
  destinationId: z.string().optional(),
  status: z.enum(['publish', 'draft', 'pending', 'future']).optional(),
  scheduledAt: z.string().datetime().optional(),
});
export type PublishInput = z.infer<typeof publishInputSchema>;

export const assetsInputSchema = z.object({
  // `skip` is a special value handled by advanceAfter (shouldSkip); when present
  // the orchestrator inserts a `skipped` Stage Run and never invokes the dispatcher
  mode: z.enum(['auto_generate', 'briefs_only', 'manual_upload', 'skip']).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type AssetsInput = z.infer<typeof assetsInputSchema>;

export const reviewInputSchema = z.object({
  // when maxIterations === 0 the orchestrator skips the stage entirely (handled
  // by `shouldSkip` in advanceAfter); positive values run the review job
  maxIterations: z.number().int().min(0).optional(),
  autoApproveThreshold: z.number().min(0).max(100).optional(),
  hardFailThreshold: z.number().min(0).max(100).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export const draftInputSchema = z.object({
  // content format; required so the dispatcher knows which production agent to call
  type: z.enum(['blog', 'video', 'shorts', 'podcast']),
  // optional — dispatcher resolves these from prior stages if absent
  personaId: z.string().optional(),
  ideaId: z.string().optional(),
  researchSessionId: z.string().optional(),
  productionParams: z.record(z.string(), z.unknown()).optional(),
  modelTier: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type DraftInput = z.infer<typeof draftInputSchema>;

/**
 * STAGE_INPUT_SCHEMAS maps every Stage to its Zod schema.
 * Stages not yet migrated map to `z.never()`; the orchestrator detects this
 * and rejects with STAGE_NOT_MIGRATED.
 */
export const STAGE_INPUT_SCHEMAS: Record<Stage, z.ZodTypeAny> = {
  brainstorm: brainstormInputSchema,
  research: researchInputSchema,
  draft: draftInputSchema,
  review: reviewInputSchema,
  assets: assetsInputSchema,
  preview: previewInputSchema,
  publish: publishInputSchema,
};

export function isStageMigrated(stage: Stage): boolean {
  return STAGE_INPUT_SCHEMAS[stage] !== undefined && STAGE_INPUT_SCHEMAS[stage]._def.typeName !== 'ZodNever';
}
