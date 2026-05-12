"use client";

/**
 * <PipelineView> — read-only mirror of a Project's Stage Runs.
 *
 * variant="overview"  renders all 7 stages side-by-side as compact cards.
 * variant="supervised" renders the single Stage's detail view (uses
 *   <StageView>, which lands with Slice 5 / #13 — until then this variant
 *   falls through to a "not yet implemented" note so the dashboard
 *   navigation can still cross-link).
 *
 * Subscribes to Stage Run + job_events changes via useProjectStream.
 */
import { useRouter } from 'next/navigation';
import { STAGES, type Stage } from '@brighttale/shared/pipeline/inputs';
import { useProjectStream } from '@/hooks/useProjectStream';
import { cn } from '@/lib/utils';

interface PipelineViewProps {
  projectId: string;
  variant?: 'overview' | 'supervised';
  stage?: Stage;
  /** When the user clicks a stage card in overview, where to take them.
   *  Defaults to a same-page query-param switch; callers in dashboard
   *  override to push to `/projects/:id?stage=:stage`. */
  onStageClick?: (stage: Stage) => void;
}

const STAGE_LABELS: Record<Stage, string> = {
  brainstorm: 'Brainstorm',
  research: 'Research',
  draft: 'Draft',
  review: 'Review',
  assets: 'Assets',
  preview: 'Preview',
  publish: 'Publish',
};

const STATUS_BADGE: Record<string, string> = {
  queued: 'bg-slate-200 text-slate-700',
  running: 'bg-blue-200 text-blue-800 animate-pulse',
  awaiting_user: 'bg-amber-200 text-amber-900',
  completed: 'bg-emerald-200 text-emerald-800',
  failed: 'bg-rose-200 text-rose-800',
  aborted: 'bg-zinc-300 text-zinc-700',
  skipped: 'bg-slate-100 text-slate-500',
};

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  awaiting_user: 'Awaiting',
  completed: 'Done',
  failed: 'Failed',
  aborted: 'Aborted',
  skipped: 'Skipped',
};

export function PipelineView({
  projectId,
  variant = 'overview',
  stage,
  onStageClick,
}: PipelineViewProps) {
  const router = useRouter();
  const { stageRuns, liveEvent, isConnected } = useProjectStream(projectId);

  if (variant === 'supervised') {
    // <StageView> arrives with Slice 5 (#13). Until then surface a placeholder
    // so the dashboard can already cross-link without a hard fail.
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        Supervised view for <span className="font-mono">{stage}</span> not yet wired —
        Slice 5 (StageView component) ships this.
      </div>
    );
  }

  function handleClick(s: Stage): void {
    if (onStageClick) onStageClick(s);
    else router.push(`/projects/${projectId}?stage=${s}`);
  }

  return (
    <div className="space-y-2" data-testid="pipeline-view-overview">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            isConnected ? 'bg-emerald-500' : 'bg-slate-300',
          )}
          aria-label={isConnected ? 'Connected to live stream' : 'Disconnected'}
        />
        {liveEvent ? (
          <span className="truncate">{liveEvent.message}</span>
        ) : (
          <span>No live activity</span>
        )}
      </div>
      <ol className="flex flex-wrap gap-2">
        {STAGES.map((s) => {
          const run = stageRuns[s];
          const status = run?.status ?? 'idle';
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => handleClick(s)}
                className="w-32 rounded-md border bg-card p-2 text-left transition hover:shadow"
                data-testid={`stage-card-${s}`}
                data-stage={s}
                data-status={status}
              >
                <div className="text-xs font-medium">{STAGE_LABELS[s]}</div>
                <div
                  className={cn(
                    'mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium',
                    STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-500',
                  )}
                >
                  {STATUS_LABEL[status] ?? '—'}
                </div>
                {typeof run?.attemptNo === 'number' && run.attemptNo > 1 ? (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Attempt {run.attemptNo}
                  </div>
                ) : null}
                {run?.updatedAt ? (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {new Date(run.updatedAt).toLocaleTimeString()}
                  </div>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
