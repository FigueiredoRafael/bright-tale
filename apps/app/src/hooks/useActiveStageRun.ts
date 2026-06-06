/**
 * useActiveStageRun — derives whether there is an active (queued or running)
 * stage_run for a given (stage, trackId) tuple, based on the live stream from
 * useProjectStream. Shared by every engine so the correlation logic lives once.
 *
 * Refs #242
 */
import { useRef } from 'react';
import { useProjectStream } from '@/hooks/useProjectStream';
import type { Stage, StageRun, StageRunStatus } from '@brighttale/shared/pipeline/inputs';

const ACTIVE_STATUSES = new Set<StageRunStatus>(['queued', 'running']);

export interface ActiveStageRunResult {
  /** The id of the current stage_run for this (stage, trackId), or null if none. */
  runId: string | null;
  /** The status of the current stage_run, or null if none. */
  status: StageRunStatus | null;
  /** startedAt timestamp from the stage_run, or null. */
  startedAt: string | null;
  /**
   * True when status is 'queued' or 'running'.
   * False when terminal (completed/failed/aborted/skipped) or no run exists.
   */
  isActive: boolean;
  /**
   * True when the current runId is one the hook has NOT yet seen as active
   * in a prior render cycle. Distinguishes "a brand-new run just kicked off"
   * from "still rendering the run I've been watching from the start."
   *
   * Implemented via mutable refs updated during render — the canonical React
   * pattern for tracking "previous values" in derived-state hooks. The
   * react-hooks/refs lint rule is suppressed because this hook is a pure
   * derived-state function (no DOM, no external system) and ref
   * reads/writes here are the algorithm itself, not a side effect.
   */
  isFresh: boolean;
}

/**
 * Reads stage_run state for a specific (stage, trackId) from the project
 * stream and returns a normalized active-run descriptor.
 *
 * @param projectId  The project being watched.
 * @param stage      The pipeline stage (brainstorm, research, …).
 * @param trackId    The track ID for per-track stages. Pass null for shared
 *                   stages (brainstorm, research, canonical) to fall back to
 *                   the project-level latest run for the stage.
 */
export function useActiveStageRun(
  projectId: string,
  stage: Stage,
  trackId: string | null,
): ActiveStageRunResult {
  const { stageRuns, tracks } = useProjectStream(projectId);

  // Tracks the last runId this hook instance returned as active (queued/running).
  // Updated during render to implement "previous value" tracking.
  const lastActiveRunIdRef = useRef<string | null>(null);

  // Last runId that reached a terminal state. Allows isFresh to flip back to
  // true when a NEW runId appears after the prior one completed.
  const lastCompletedRunIdRef = useRef<string | null>(null);

  // Per-track stages (production, review, assets, preview, publish) must be
  // resolved against the tracks snapshot because the flat `stageRuns` slot is
  // last-write-wins per stage — on multi-track projects, another track's row
  // collapses on top of this track's. Shared stages (brainstorm, research,
  // canonical) keep using the flat slot since they only have trackId=null.
  let run: StageRun | null = null;
  if (trackId !== null) {
    const track = tracks.find((t) => t.id === trackId);
    run = (track?.stageRuns?.[stage] as StageRun | null | undefined) ?? null;
  } else {
    run = stageRuns[stage] ?? null;
  }

  const isMatch = (() => {
    if (!run) return false;
    if (trackId === null) {
      // Shared stage: accept whatever the stream has for this stage.
      return true;
    }
    // Per-track stage: the run must belong to this specific track. Defensive
    // even though the tracks lookup above already filtered by track id.
    return (run.trackId ?? null) === trackId;
  })();

  if (!isMatch || !run) {
    return {
      runId: null,
      status: null,
      startedAt: null,
      isActive: false,
      isFresh: false,
    };
  }

  const isActive = ACTIVE_STATUSES.has(run.status);

  if (isActive) {
    // "Previous value" tracking: read ref values before mutating them.
    const prevActiveId = lastActiveRunIdRef.current;
    const prevCompletedId = lastCompletedRunIdRef.current;

    // isFresh is true only if we haven't seen this specific runId as active
    // before, AND haven't seen it as completed (edge-case guard for hot-reload).
    // eslint-disable-next-line react-hooks/refs -- previous-value tracking: this is a pure derived-state hook; refs are the algorithm, not a side effect
    const isFresh = run.id !== prevActiveId && run.id !== prevCompletedId;

    // Record that we've now seen this run as active — subsequent renders of
    // the same running run get isFresh=false.
    // eslint-disable-next-line react-hooks/refs -- previous-value tracking: writing ref during render to capture the value just returned
    lastActiveRunIdRef.current = run.id;

    return {
      runId: run.id,
      status: run.status,
      startedAt: run.startedAt,
      isActive: true,
      isFresh,
    };
  }

  // Terminal / awaiting_user: record as last completed so a subsequent new run
  // with a different ID correctly flips isFresh=true.
  if (run.id !== lastCompletedRunIdRef.current) {
    lastCompletedRunIdRef.current = run.id;
  }

  return {
    runId: run.id,
    status: run.status,
    startedAt: run.startedAt,
    isActive: false,
    isFresh: false,
  };
}
