/**
 * fan-out-planner — pure decision module for "what runs next?"
 *
 * Inputs: the Stage Run that just reached a terminal state + the project's
 * Tracks, publish_targets, prior runs, and resolved autopilot config.
 * Output: zero or more StageRunSpec entries the caller should persist.
 *
 * Pure: no DB, no I/O, no time. The orchestrator (T2.3) collects the inputs,
 * calls planNext, then hands the specs to stage-run-writer.
 *
 * Transitions encoded here:
 *   brainstorm  → research                      (project)
 *   research    → research          (loop)      when outcome.verdict='low_confidence'
 *               → canonical         (forward)   otherwise
 *   canonical   → production × N                one per active Track
 *   production  → review                        same Track
 *   review      → production        (loop)      when outcome.verdict='revision_required'
 *               → assets            (forward)   otherwise (same Track)
 *   assets      → preview                       same Track
 *   preview     → publish × M                   one per publish_target of Track.medium
 *   publish     → []                            terminal
 *
 * Loop budgets (research.maxIterations, review.maxIterations) are enforced
 * by the respective dispatchers — they park the Stage Run in
 * `awaiting_user` when the budget is spent so the planner never sees a
 * `completed` run with a loop verdict beyond cap.
 */

import type { Medium } from '@brighttale/shared/pipeline/inputs';
import type { Stage, StageRunStatus } from '@brighttale/shared/pipeline/inputs';
import type { AutopilotConfig } from '@brighttale/shared/schemas/autopilotConfig';
import type { PublishTarget } from './publish-target-resolver';

export interface Track {
  id: string;
  projectId: string;
  medium: Medium;
  status: 'active' | 'paused' | 'aborted';
  autopilotConfigJson?: unknown;
}

/** Minimal Stage Run shape the planner needs. */
export interface RunLike {
  id: string;
  stage: Stage;
  status: StageRunStatus;
  trackId: string | null;
  publishTargetId: string | null;
  attemptNo: number;
  outcomeJson?: unknown;
}

export interface PlanInput {
  completedRun: RunLike;
  tracks: Track[];
  publishTargets: PublishTarget[];
  /** All prior stage_runs for the project, including the completedRun. */
  priorRuns: RunLike[];
  /** Resolved (project+track) autopilot config, or null for defaults. */
  autopilotConfig: AutopilotConfig | null;
}

export interface StageRunSpec {
  stage: Stage;
  trackId: string | null;
  publishTargetId: string | null;
  status: 'queued' | 'awaiting_user' | 'skipped';
  awaitingReason?: 'manual_advance' | 'manual_paste';
  inputJson?: unknown;
}

interface LoopVerdict {
  verdict?: string;
}

function readVerdict(outcome: unknown): string | null {
  if (!outcome || typeof outcome !== 'object') return null;
  const v = (outcome as LoopVerdict).verdict;
  return typeof v === 'string' ? v : null;
}

function isShouldSkipAssets(cfg: AutopilotConfig | null): boolean {
  return cfg?.assets?.mode === 'skip';
}

function isShouldSkipReview(cfg: AutopilotConfig | null): boolean {
  return typeof cfg?.review?.maxIterations === 'number' && cfg.review.maxIterations === 0;
}

function nextStageSpec(
  stage: Stage,
  trackId: string | null,
  publishTargetId: string | null,
  autopilotConfig: AutopilotConfig | null,
): StageRunSpec {
  if (stage === 'publish') {
    return {
      stage,
      trackId,
      publishTargetId,
      status: 'awaiting_user',
      awaitingReason: 'manual_advance',
    };
  }
  // Skip-mode handling — Stage is written with status='skipped' so the
  // orchestrator can immediately call planNext on it to keep cascading.
  if (stage === 'assets' && isShouldSkipAssets(autopilotConfig)) {
    return { stage, trackId, publishTargetId, status: 'skipped' };
  }
  if (stage === 'review' && isShouldSkipReview(autopilotConfig)) {
    return { stage, trackId, publishTargetId, status: 'skipped' };
  }
  return { stage, trackId, publishTargetId, status: 'queued' };
}

/**
 * Has a (stage, trackId, publishTargetId) tuple already been written?
 * Counts queued/running/awaiting_user/completed/skipped — anything except
 * failed/aborted. Used to suppress duplicate fan-out on re-delivery.
 */
function alreadyHas(
  priorRuns: RunLike[],
  stage: Stage,
  trackId: string | null,
  publishTargetId: string | null,
): boolean {
  return priorRuns.some(
    (r) =>
      r.stage === stage &&
      (r.trackId ?? null) === trackId &&
      (r.publishTargetId ?? null) === publishTargetId &&
      r.status !== 'failed' &&
      r.status !== 'aborted',
  );
}

export function planNext(input: PlanInput): StageRunSpec[] {
  const { completedRun, tracks, publishTargets, priorRuns, autopilotConfig } = input;

  // Only successful terminals fan out. failed/aborted/awaiting_user/queued/running don't.
  if (completedRun.status !== 'completed' && completedRun.status !== 'skipped') {
    return [];
  }

  switch (completedRun.stage) {
    case 'brainstorm': {
      if (alreadyHas(priorRuns, 'research', null, null)) return [];
      return [nextStageSpec('research', null, null, autopilotConfig)];
    }

    case 'research': {
      // Confidence loop: outcome verdict='low_confidence' → another research run.
      if (readVerdict(completedRun.outcomeJson) === 'low_confidence') {
        return [nextStageSpec('research', null, null, autopilotConfig)];
      }
      if (alreadyHas(priorRuns, 'canonical', null, null)) return [];
      return [nextStageSpec('canonical', null, null, autopilotConfig)];
    }

    case 'canonical': {
      // Fan-out: one Production run per active Track. Aborted/paused excluded.
      const activeTracks = tracks.filter((t) => t.status === 'active');
      const specs: StageRunSpec[] = [];
      for (const track of activeTracks) {
        if (alreadyHas(priorRuns, 'production', track.id, null)) continue;
        specs.push(nextStageSpec('production', track.id, null, autopilotConfig));
      }
      return specs;
    }

    case 'production': {
      const trackId = completedRun.trackId;
      if (!trackId) return [];
      const track = tracks.find((t) => t.id === trackId);
      if (!track || track.status !== 'active') return [];
      if (alreadyHas(priorRuns, 'review', trackId, null)) return [];
      return [nextStageSpec('review', trackId, null, autopilotConfig)];
    }

    case 'review': {
      const trackId = completedRun.trackId;
      if (!trackId) return [];
      const track = tracks.find((t) => t.id === trackId);
      if (!track || track.status !== 'active') return [];

      // Revision loop: verdict='revision_required' → another production run for
      // the same Track. The dispatcher has already enforced the iteration cap.
      if (readVerdict(completedRun.outcomeJson) === 'revision_required') {
        return [nextStageSpec('production', trackId, null, autopilotConfig)];
      }
      if (alreadyHas(priorRuns, 'assets', trackId, null)) return [];
      return [nextStageSpec('assets', trackId, null, autopilotConfig)];
    }

    case 'assets': {
      const trackId = completedRun.trackId;
      if (!trackId) return [];
      const track = tracks.find((t) => t.id === trackId);
      if (!track || track.status !== 'active') return [];
      if (alreadyHas(priorRuns, 'preview', trackId, null)) return [];
      return [nextStageSpec('preview', trackId, null, autopilotConfig)];
    }

    case 'preview': {
      const trackId = completedRun.trackId;
      if (!trackId) return [];
      const track = tracks.find((t) => t.id === trackId);
      if (!track || track.status !== 'active') return [];

      // Fan-out: one Publish run per publish_target whose type is compatible
      // with this Track's medium. The caller (orchestrator) is expected to
      // have already filtered publishTargets via publish-target-resolver, so
      // every entry here is assumed compatible — but the planner stays defensive.
      const specs: StageRunSpec[] = [];
      for (const target of publishTargets) {
        if (!target.isActive) continue;
        if (alreadyHas(priorRuns, 'publish', trackId, target.id)) continue;
        specs.push(nextStageSpec('publish', trackId, target.id, autopilotConfig));
      }
      return specs;
    }

    case 'publish':
      return [];
  }
}
