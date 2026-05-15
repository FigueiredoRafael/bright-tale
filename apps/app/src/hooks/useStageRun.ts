'use client';
import { useEffect, useState } from 'react';
import type { StageRun, Stage } from '@brighttale/shared/pipeline/inputs';

// TODO: This hook fetches GET /api/projects/:projectId/stages?stage=...&trackId=...&publishTargetId=...&attemptNo=...
// If that exact route shape does not yet exist on the server, the hook will gracefully set error state.
// Follow-up route implementation tracked as a future server-side task.

interface UseStageRunOpts {
  projectId: string;
  stage: Stage;
  trackId?: string;
  publishTargetId?: string;
  attemptNo?: number;
}

export function useStageRun(opts: UseStageRunOpts) {
  const [data, setData] = useState<StageRun | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const qs = new URLSearchParams({ stage: opts.stage });
    if (opts.trackId) qs.set('trackId', opts.trackId);
    if (opts.publishTargetId) qs.set('publishTargetId', opts.publishTargetId);
    if (opts.attemptNo !== undefined) qs.set('attemptNo', String(opts.attemptNo));
    fetch(`/api/projects/${opts.projectId}/stages?${qs.toString()}`)
      .then((r) => r.json())
      .then(({ data: responseData, error: responseError }: { data: { run: StageRun } | null; error: { message: string } | null }) => {
        if (!active) return;
        if (responseError) {
          setError(new Error(responseError.message));
        } else {
          setData(responseData?.run ?? null);
        }
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [opts.projectId, opts.stage, opts.trackId, opts.publishTargetId, opts.attemptNo]);

  return { data, isLoading, error };
}
