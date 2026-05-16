/**
 * T9.F157 — ProjectSnapshot Zod schema
 *
 * Describes the shape returned by GET /api/projects/:id/stages — the
 * "snapshot" used by useProjectStream and FocusSidebar to render the
 * multi-track pipeline UI.
 *
 * Key design choices:
 *   - stageRuns at the project level is an array (shared stages: brainstorm,
 *     research, canonical — trackId is null)
 *   - stageRuns inside each TrackSnapshot is a Record<string, StageRunSnapshot|null>
 *     (object-keyed by stage name — Finding F2)
 *   - tracks defaults to [] for backward compat with legacy projects that
 *     have no tracks table rows
 */
import { z } from 'zod';
import { MEDIA, STAGES, STAGE_RUN_STATUSES } from '../pipeline/inputs';

// ─── StageRunSnapshot ────────────────────────────────────────────────────────

export const StageRunSnapshotSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  stage: z.enum(STAGES),
  status: z.enum(STAGE_RUN_STATUSES),
  awaitingReason: z.string().nullable(),
  payloadRef: z.unknown().nullable(),
  attemptNo: z.number(),
  inputJson: z.unknown().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  trackId: z.string().nullable().optional(),
  publishTargetId: z.string().nullable().optional(),
  outcomeJson: z.unknown().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type StageRunSnapshot = z.infer<typeof StageRunSnapshotSchema>;

// ─── PublishTargetSnapshotSchema ─────────────────────────────────────────────

export const PublishTargetSnapshotSchema = z.object({
  id: z.string(),
  displayName: z.string(),
});

export type PublishTargetSnapshot = z.infer<typeof PublishTargetSnapshotSchema>;

// ─── Track statuses ──────────────────────────────────────────────────────────

export const TRACK_STATUSES = ['active', 'aborted', 'completed'] as const;
export type TrackStatus = (typeof TRACK_STATUSES)[number];

// ─── TrackSnapshotSchema ──────────────────────────────────────────────────────

/**
 * Per-track stages are the track-scoped stages only:
 * production, review, assets, preview, publish.
 * Each key maps to a StageRunSnapshot or null (not yet started).
 */
export const TrackStageRunsSchema = z.record(
  z.string(),
  StageRunSnapshotSchema.nullable(),
);

export const TrackSnapshotSchema = z.object({
  id: z.string(),
  medium: z.enum(MEDIA),
  status: z.enum(TRACK_STATUSES),
  paused: z.boolean(),
  /** Object-keyed by stage name (production/review/assets/preview/publish) */
  stageRuns: TrackStageRunsSchema.default({}),
  /** One entry per publish target; podcast tracks have 3 (fan-out) */
  publishTargets: z.array(PublishTargetSnapshotSchema).default([]),
});

export type TrackSnapshot = z.infer<typeof TrackSnapshotSchema>;

// ─── ProjectSnapshotSchema ────────────────────────────────────────────────────

export const ProjectMetaSnapshotSchema = z.object({
  mode: z.string(),
  paused: z.boolean(),
});

export const ProjectSnapshotSchema = z.object({
  project: ProjectMetaSnapshotSchema,
  /** Shared (project-level) stage runs — trackId is null on all of these */
  stageRuns: z.array(StageRunSnapshotSchema),
  /** Per-track snapshots; defaults to [] for legacy projects with no tracks */
  tracks: z.array(TrackSnapshotSchema).default([]),
  /** All attempts including retries; optional for backward compat */
  allAttempts: z.array(StageRunSnapshotSchema).optional(),
});

export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;
