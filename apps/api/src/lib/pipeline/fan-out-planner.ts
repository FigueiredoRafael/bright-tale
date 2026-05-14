/**
 * T1.11 — fan-out-planner
 *
 * Pure function: planNext(input) → StageRunSpec[]
 *
 * Encodes every enqueue decision the orchestrator makes after a stage_run
 * completes. No DB calls. No async. All fan-out edges, loops, and skip
 * insertions live here.
 *
 * Pipeline transitions:
 *   brainstorm (completed)  → research (shared, attempt 1)
 *   research   (completed)  → canonical (shared)           [if confidence >= threshold]
 *   research   (completed)  → research  (attempt+1)        [if confidence < threshold && attemptNo < maxIterations]
 *   canonical  (completed)  → production × active non-paused Tracks (parallel fan-out)
 *   production (completed)  → review    (one per Track)
 *   review     (completed)  → production (attempt+1)       [if score < minScore && attemptNo < maxIterations]
 *   review     (completed)  → assets                       [if score >= minScore]
 *   assets     (completed)  → preview
 *   assets     (skipped)    → preview
 *   preview    (completed)  → publish × active publish_targets compatible with Track.medium
 *
 *   When autopilotConfig.assets.mode === 'skip', instead of waiting for an
 *   Assets stage_run to complete, planNext inserts a skipped Assets row and
 *   fans out to Preview immediately.
 *
 * Invariants:
 *   - Aborted Tracks are excluded from all fan-outs.
 *   - Already-terminal (completed|failed|aborted|skipped) stage_runs for the
 *     same (stage, trackId, publishTargetId) are not re-enqueued.
 *   - Shared stages (brainstorm, research, canonical) always have trackId=null.
 *   - Per-Track stages (production, review, assets, preview) carry the Track's id.
 *   - Per-publish-target stages (publish) carry both trackId + publishTargetId.
 */

import {
  TERMINAL_STATUSES,
  type Stage,
  type StageRun,
  type StageRunStatus,
} from '@brighttale/shared/pipeline/inputs.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export type Medium = 'blog' | 'video' | 'shorts' | 'podcast';

export type PublishTargetType =
  | 'wordpress'
  | 'youtube'
  | 'spotify'
  | 'apple_podcasts'
  | 'rss';

/** Static mapping from medium → compatible publish_target types. */
export const MEDIUM_TO_TARGET_TYPES: Record<Medium, PublishTargetType[]> = {
  blog: ['wordpress', 'rss'],
  video: ['youtube'],
  shorts: ['youtube'],
  podcast: ['spotify', 'apple_podcasts', 'rss', 'youtube'],
};

export interface Track {
  id: string;
  projectId: string;
  medium: Medium;
  /** 'active' | 'aborted' | 'completed' */
  status: string;
  paused: boolean;
  /** Per-Track override of project-level autopilot config (sparse partial). */
  autopilotConfigJson: Partial<AutopilotConfig> | null;
}

export interface PublishTarget {
  id: string;
  channelId: string | null;
  orgId: string | null;
  type: PublishTargetType;
  displayName: string;
  isActive: boolean;
}

/**
 * Subset of AutopilotConfig fields consumed by the planner.
 * The planner does NOT need provider/model overrides — those are for the
 * dispatcher. It only needs the loop-control and skip-mode fields.
 */
export interface AutopilotConfig {
  research?: {
    /** Minimum confidence score (0–100) to advance to Canonical. Default 70. */
    confidenceThreshold?: number;
    /** Max Research attempts before hard-advancing to Canonical. Default 3. */
    maxIterations?: number;
  } | null;
  review?: {
    /** Score (0–100) required to pass Review without revision. Default 90. */
    autoApproveThreshold?: number;
    /** Max Production→Review iteration count. Default 5. */
    maxIterations?: number;
  } | null;
  assets?: {
    /** 'skip' → insert a skipped Assets row and proceed to Preview. */
    mode?: 'skip' | 'briefs_only' | 'auto_generate';
  } | null;
  preview?: {
    enabled?: boolean;
  } | null;
}

export interface Project {
  id: string;
  autopilotConfigJson: AutopilotConfig | null;
}

/**
 * A stage_run to be created/enqueued by the orchestrator.
 * `status` is always 'queued' unless inserting a synthetic skipped row.
 */
export interface StageRunSpec {
  stage: Stage;
  trackId: string | null;
  publishTargetId: string | null;
  inputJson?: unknown;
  attemptNo: number;
  /** Only set for synthetic skip insertions (Assets skip mode). */
  status?: StageRunStatus;
}

export interface PlanNextInput {
  completedRun: StageRun;
  project: Project;
  tracks: Track[];
  publishTargets: PublishTarget[];
  priorRuns: StageRun[];
  autopilotConfig: AutopilotConfig;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIDENCE_THRESHOLD = 70;
const DEFAULT_RESEARCH_MAX_ITERATIONS = 3;
const DEFAULT_REVIEW_MIN_SCORE = 90;
const DEFAULT_REVIEW_MAX_ITERATIONS = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isTerminal(status: StageRunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Returns true when there is already a non-aborted, non-failed terminal or
 * in-progress stage_run for the given (stage, trackId, publishTargetId)
 * combination among the priorRuns. This prevents double-enqueuing.
 */
function alreadyEnqueued(
  priorRuns: StageRun[],
  stage: Stage,
  trackId: string | null,
  publishTargetId: string | null,
): boolean {
  return priorRuns.some(
    (r) =>
      r.stage === stage &&
      r.trackId === trackId &&
      r.publishTargetId === publishTargetId &&
      r.status !== 'aborted' &&
      r.status !== 'failed',
  );
}

/**
 * Returns true when a specific (stage, trackId, attemptNo) combination is
 * already terminal among priorRuns.
 *
 * Exported for use by the orchestrator when it needs to know if an attempt
 * already has a settled outcome.
 */
export function attemptIsTerminal(
  priorRuns: StageRun[],
  stage: Stage,
  trackId: string | null,
  attemptNo: number,
): boolean {
  return priorRuns.some(
    (r) =>
      r.stage === stage &&
      r.trackId === trackId &&
      r.attemptNo === attemptNo &&
      isTerminal(r.status),
  );
}

/** Active (non-aborted) Tracks that are not paused. */
function activeTracks(tracks: Track[]): Track[] {
  return tracks.filter((t) => t.status === 'active' && !t.paused);
}

/** Publish targets that are active AND compatible with the given medium. */
function targetsByMedium(
  publishTargets: PublishTarget[],
  medium: Medium,
): PublishTarget[] {
  const compatible = MEDIUM_TO_TARGET_TYPES[medium];
  return publishTargets.filter(
    (pt) => pt.isActive && compatible.includes(pt.type),
  );
}

/**
 * Resolve the confidence score from a research stage_run's outcomeJson.
 * The BC_RESEARCH_OUTPUT contract puts it at
 * `outcome.idea_validation.confidence_score` (0–100 scale per agents.ts).
 */
function extractConfidenceScore(run: StageRun): number | null {
  if (!run.outcomeJson || typeof run.outcomeJson !== 'object') return null;
  const outcome = run.outcomeJson as Record<string, unknown>;
  const validation = outcome['idea_validation'];
  if (!validation || typeof validation !== 'object') return null;
  const score = (validation as Record<string, unknown>)['confidence_score'];
  if (typeof score === 'number') return score;
  return null;
}

/**
 * Resolve the review score from a review stage_run's outcomeJson.
 * The BC_REVIEW_OUTPUT contract puts it at `outcome.overall_score` (0–100).
 */
function extractReviewScore(run: StageRun): number | null {
  if (!run.outcomeJson || typeof run.outcomeJson !== 'object') return null;
  const outcome = run.outcomeJson as Record<string, unknown>;
  const score = outcome['overall_score'];
  if (typeof score === 'number') return score;
  return null;
}

// ─── Core planner ─────────────────────────────────────────────────────────────

/**
 * Returns the list of StageRunSpecs to enqueue after `completedRun` settles.
 *
 * Only handles `completed` and `skipped` completedRun statuses because:
 *   - `failed` / `awaiting_user` / `aborted` are handled by the orchestrator.
 *   - `queued` / `running` are not "done" yet.
 *
 * All rules are pure: no I/O, no randomness, no shared state.
 */
export function planNext({
  completedRun,
  project: _project,
  tracks,
  publishTargets,
  priorRuns,
  autopilotConfig,
}: PlanNextInput): StageRunSpec[] {
  // Only plan after terminal-and-non-failed runs (completed or skipped).
  if (
    completedRun.status !== 'completed' &&
    completedRun.status !== 'skipped'
  ) {
    return [];
  }

  const stage = completedRun.stage as Stage;

  switch (stage) {
    // ── brainstorm ─────────────────────────────────────────────────────────
    case 'brainstorm': {
      if (alreadyEnqueued(priorRuns, 'research', null, null)) return [];
      return [
        {
          stage: 'research',
          trackId: null,
          publishTargetId: null,
          attemptNo: 1,
        },
      ];
    }

    // ── research ───────────────────────────────────────────────────────────
    case 'research': {
      const researchCfg = autopilotConfig.research;
      const confidenceThreshold =
        researchCfg?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
      const maxIterations =
        researchCfg?.maxIterations ?? DEFAULT_RESEARCH_MAX_ITERATIONS;

      const confidence = extractConfidenceScore(completedRun);
      const currentAttempt = completedRun.attemptNo;

      // If confidence meets the threshold (or unknown — advance by default),
      // proceed to canonical.
      const meetsThreshold =
        confidence === null || confidence >= confidenceThreshold;

      if (meetsThreshold) {
        if (alreadyEnqueued(priorRuns, 'canonical', null, null)) return [];
        return [
          {
            stage: 'canonical',
            trackId: null,
            publishTargetId: null,
            attemptNo: 1,
          },
        ];
      }

      // Confidence is below threshold; loop if budget remains.
      const nextAttempt = currentAttempt + 1;
      if (currentAttempt >= maxIterations) {
        // Budget exhausted — hard-advance to canonical.
        if (alreadyEnqueued(priorRuns, 'canonical', null, null)) return [];
        return [
          {
            stage: 'canonical',
            trackId: null,
            publishTargetId: null,
            attemptNo: 1,
          },
        ];
      }

      // Guard: if this next attempt is already enqueued/running, skip.
      if (
        priorRuns.some(
          (r) =>
            r.stage === 'research' &&
            r.trackId === null &&
            r.attemptNo === nextAttempt &&
            r.status !== 'aborted' &&
            r.status !== 'failed',
        )
      ) {
        return [];
      }

      return [
        {
          stage: 'research',
          trackId: null,
          publishTargetId: null,
          attemptNo: nextAttempt,
        },
      ];
    }

    // ── canonical ──────────────────────────────────────────────────────────
    case 'canonical': {
      // Fan out to all active non-paused Tracks.
      const eligible = activeTracks(tracks);
      const specs: StageRunSpec[] = [];
      for (const track of eligible) {
        if (alreadyEnqueued(priorRuns, 'production', track.id, null)) continue;
        specs.push({
          stage: 'production',
          trackId: track.id,
          publishTargetId: null,
          attemptNo: 1,
        });
      }
      return specs;
    }

    // ── production ─────────────────────────────────────────────────────────
    case 'production': {
      const trackId = completedRun.trackId;
      if (!trackId) return []; // shared production run — shouldn't happen

      // Check the Track is still active (not aborted mid-flight).
      const track = tracks.find((t) => t.id === trackId);
      if (!track || track.status === 'aborted') return [];

      if (alreadyEnqueued(priorRuns, 'review', trackId, null)) return [];
      return [
        {
          stage: 'review',
          trackId,
          publishTargetId: null,
          attemptNo: completedRun.attemptNo, // review attempt mirrors production attempt
        },
      ];
    }

    // ── review ─────────────────────────────────────────────────────────────
    case 'review': {
      const trackId = completedRun.trackId;
      if (!trackId) return [];

      const track = tracks.find((t) => t.id === trackId);
      if (!track || track.status === 'aborted') return [];

      // Resolve the per-Track autopilot override (if any) merged with project.
      const trackCfg = track.autopilotConfigJson?.review;
      const projectReviewCfg = autopilotConfig.review;
      const minScore =
        trackCfg?.autoApproveThreshold ??
        projectReviewCfg?.autoApproveThreshold ??
        DEFAULT_REVIEW_MIN_SCORE;
      const maxIterations =
        trackCfg?.maxIterations ??
        projectReviewCfg?.maxIterations ??
        DEFAULT_REVIEW_MAX_ITERATIONS;

      const score = extractReviewScore(completedRun);
      // Unknown score: treat as not passing to be safe (revision_required).
      const passes = score !== null && score >= minScore;

      if (passes) {
        // Advance to assets (or skip assets).
        return planAssetsSpec(
          trackId,
          autopilotConfig,
          track,
          priorRuns,
        );
      }

      // Revision loop: spawn next Production attempt.
      const nextAttempt = completedRun.attemptNo + 1;
      if (completedRun.attemptNo >= maxIterations) {
        // Max iterations reached — hard-advance to assets.
        return planAssetsSpec(
          trackId,
          autopilotConfig,
          track,
          priorRuns,
        );
      }

      // Guard: if this Production attempt already exists, skip.
      if (
        priorRuns.some(
          (r) =>
            r.stage === 'production' &&
            r.trackId === trackId &&
            r.attemptNo === nextAttempt &&
            r.status !== 'aborted' &&
            r.status !== 'failed',
        )
      ) {
        return [];
      }

      return [
        {
          stage: 'production',
          trackId,
          publishTargetId: null,
          attemptNo: nextAttempt,
        },
      ];
    }

    // ── assets ─────────────────────────────────────────────────────────────
    case 'assets': {
      const trackId = completedRun.trackId;
      if (!trackId) return [];

      const track = tracks.find((t) => t.id === trackId);
      if (!track || track.status === 'aborted') return [];

      // Preview follows assets (completed or skipped).
      if (alreadyEnqueued(priorRuns, 'preview', trackId, null)) return [];
      return [
        {
          stage: 'preview',
          trackId,
          publishTargetId: null,
          attemptNo: 1,
        },
      ];
    }

    // ── preview ────────────────────────────────────────────────────────────
    case 'preview': {
      const trackId = completedRun.trackId;
      if (!trackId) return [];

      const track = tracks.find((t) => t.id === trackId);
      if (!track || track.status === 'aborted') return [];

      // Fan out to all compatible, active publish_targets.
      const compatible = targetsByMedium(publishTargets, track.medium);
      const specs: StageRunSpec[] = [];
      for (const pt of compatible) {
        if (alreadyEnqueued(priorRuns, 'publish', trackId, pt.id)) continue;
        specs.push({
          stage: 'publish',
          trackId,
          publishTargetId: pt.id,
          attemptNo: 1,
        });
      }
      return specs;
    }

    // ── publish ────────────────────────────────────────────────────────────
    case 'publish': {
      // Terminal. Nothing follows Publish.
      return [];
    }

    // ── legacy draft (should not reach planner in new flow) ───────────────
    default: {
      return [];
    }
  }
}

// ─── Internal helper ──────────────────────────────────────────────────────────

/**
 * Decides what to enqueue after Review passes (or max-iterations hit):
 * either a real Assets stage_run or, when assets.mode === 'skip', a synthetic
 * skipped row + immediately the Preview spec.
 */
function planAssetsSpec(
  trackId: string,
  autopilotConfig: AutopilotConfig,
  track: Track,
  priorRuns: StageRun[],
): StageRunSpec[] {
  const assetsMode = autopilotConfig.assets?.mode;

  if (assetsMode === 'skip') {
    // Insert a synthetic skipped Assets row so the stage appears in history.
    const specs: StageRunSpec[] = [];

    if (!alreadyEnqueued(priorRuns, 'assets', trackId, null)) {
      specs.push({
        stage: 'assets',
        trackId,
        publishTargetId: null,
        attemptNo: 1,
        status: 'skipped',
      });
    }

    // Also immediately enqueue Preview (assets is skipped, not awaited).
    if (!alreadyEnqueued(priorRuns, 'preview', trackId, null)) {
      specs.push({
        stage: 'preview',
        trackId,
        publishTargetId: null,
        attemptNo: 1,
      });
    }

    return specs;
  }

  // Real assets run.
  if (alreadyEnqueued(priorRuns, 'assets', trackId, null)) return [];
  return [
    {
      stage: 'assets',
      trackId,
      publishTargetId: null,
      attemptNo: 1,
    },
  ];
}
