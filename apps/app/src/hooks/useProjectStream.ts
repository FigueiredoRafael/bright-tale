/**
 * useProjectStream — browser primitive that mirrors a Project's Stage Run
 * state and live progress messages, used by every Engine view.
 *
 * On mount it seeds `stageRuns` from `GET /api/projects/:id/stages` and then
 * tails the `project:<id>` Realtime channel. Reducer merges each `stage_runs`
 * change by Stage; each `job_events` INSERT becomes the new `liveEvent`.
 *
 * Cleanup on unmount drops the channel via `supabase.removeChannel`.
 */
import { useCallback, useEffect, useId, useReducer, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Stage, StageRun } from '@brighttale/shared/pipeline/inputs';

export interface JobEvent {
  id: string;
  projectId: string | null;
  sessionId: string;
  sessionType: string;
  stage: string;
  message: string;
  metadata: unknown;
  createdAt: string;
}

type StageRunsByStage = Record<Stage, StageRun | null>;

const EMPTY_STAGE_RUNS: StageRunsByStage = {
  brainstorm: null,
  research: null,
  draft: null,
  review: null,
  assets: null,
  preview: null,
  publish: null,
};

interface ReducerState {
  stageRuns: StageRunsByStage;
}

type ReducerAction =
  | { type: 'snapshot'; rows: StageRun[] }
  | { type: 'upsert'; row: StageRun };

function reducer(state: ReducerState, action: ReducerAction): ReducerState {
  if (action.type === 'snapshot') {
    const next: StageRunsByStage = { ...EMPTY_STAGE_RUNS };
    for (const row of action.rows) {
      next[row.stage] = row;
    }
    return { stageRuns: next };
  }
  if (action.type === 'upsert') {
    return {
      stageRuns: { ...state.stageRuns, [action.row.stage]: action.row },
    };
  }
  return state;
}

function rowToStageRun(row: Record<string, unknown>): StageRun {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    stage: row.stage as Stage,
    status: row.status as StageRun['status'],
    awaitingReason: (row.awaiting_reason ?? null) as StageRun['awaitingReason'],
    payloadRef: (row.payload_ref ?? null) as StageRun['payloadRef'],
    attemptNo: row.attempt_no as number,
    inputJson: row.input_json,
    errorMessage: (row.error_message ?? null) as string | null,
    startedAt: (row.started_at ?? null) as string | null,
    finishedAt: (row.finished_at ?? null) as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToJobEvent(row: Record<string, unknown>): JobEvent {
  return {
    id: row.id as string,
    projectId: (row.project_id ?? null) as string | null,
    sessionId: row.session_id as string,
    sessionType: row.session_type as string,
    stage: row.stage as string,
    message: row.message as string,
    metadata: row.metadata,
    createdAt: row.created_at as string,
  };
}

export function useProjectStream(projectId: string): {
  stageRuns: StageRunsByStage;
  liveEvent: JobEvent | null;
  isConnected: boolean;
  refresh: () => Promise<void>;
} {
  const [state, dispatch] = useReducer(reducer, { stageRuns: EMPTY_STAGE_RUNS });
  const [liveEvent, setLiveEvent] = useState<JobEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const cancelledRef = useRef(false);
  // Per-instance suffix so multiple consumers of useProjectStream on the
  // same page don't collide on a single shared Supabase Realtime channel
  // (which throws "cannot add postgres_changes callbacks after subscribe()").
  const instanceId = useId();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/stages`);
      const body = await res.json();
      if (cancelledRef.current) return;
      const rows = (body?.data?.stageRuns ?? []) as StageRun[];
      dispatch({ type: 'snapshot', rows });
    } catch {
      // ignored — caller can retry
    }
  }, [projectId]);

  useEffect(() => {
    cancelledRef.current = false;
    const supabase = createClient();

    // 1. Snapshot
    void refresh();

    // 2. Realtime
    const channel = supabase
      .channel(`project:${projectId}:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stage_runs',
          filter: `project_id=eq.${projectId}`,
        },
        (payload: { new?: Record<string, unknown> }) => {
          if (!payload.new) return;
          dispatch({ type: 'upsert', row: rowToStageRun(payload.new) });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'job_events',
          filter: `project_id=eq.${projectId}`,
        },
        (payload: { new?: Record<string, unknown> }) => {
          if (!payload.new) return;
          setLiveEvent(rowToJobEvent(payload.new));
        },
      )
      .subscribe((status: string) => {
        if (cancelledRef.current) return;
        setIsConnected(status === 'SUBSCRIBED');
      });

    // 3. Fallback polling — runs only when Realtime hasn't reached SUBSCRIBED
    // (e.g. anon session + RLS not delivering rows). Cheap: snapshot call hits
    // the API service_role client and bypasses RLS.
    const pollId = window.setInterval(() => {
      if (cancelledRef.current) return;
      if (!isConnected) void refresh();
    }, 4000);

    return () => {
      cancelledRef.current = true;
      window.clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  }, [projectId, instanceId, refresh, isConnected]);

  return { stageRuns: state.stageRuns, liveEvent, isConnected, refresh };
}
