"use client";

/**
 * <PipelineView> — read-only mirror of a Project's Stage Runs.
 *
 * variant="overview"   renders all 7 stages side-by-side as compact cards.
 * variant="supervised" renders the single Stage's detail view (<StageView/>).
 *
 * Subscribes to Stage Run + job_events changes via useProjectStream.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Ban,
  CheckCircle2,
  Clock,
  Hourglass,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  SkipForward,
  XCircle,
} from 'lucide-react';
import { STAGES, type Stage, type StageRun, type StageRunStatus } from '@brighttale/shared/pipeline/inputs';
import { useProjectStream } from '@/hooks/useProjectStream';
import { cn } from '@/lib/utils';
import { StageView } from './StageView';

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

/**
 * The computed "gate" of a stage in the overview. Combines:
 *   - the Stage Run Status (when one exists)
 *   - whether the predecessor stage has completed (for stages with no run yet)
 *
 * locked   the predecessor hasn't completed yet — card is greyed out
 * ready    no Stage Run yet, but the predecessor is done — user can start it
 * queued | running | awaiting_user | completed | failed | aborted | skipped
 *          mirror StageRunStatus directly
 */
type StageGate =
  | 'locked'
  | 'ready'
  | StageRunStatus;

function computeStageGate(stage: Stage, runs: Record<Stage, StageRun | null>): StageGate {
  const run = runs[stage];
  if (run) return run.status;
  // No run yet — check predecessor.
  const idx = STAGES.indexOf(stage);
  if (idx === 0) return 'ready'; // first stage has no predecessor
  const predecessor = STAGES[idx - 1];
  const predecessorRun = runs[predecessor];
  if (predecessorRun?.status === 'completed' || predecessorRun?.status === 'skipped') {
    return 'ready';
  }
  return 'locked';
}

interface GateMeta {
  Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  iconClass: string;
  cardClass: string;
  /** Optional short label rendered next to the icon when the icon alone
   *  isn't enough to disambiguate (e.g. awaiting_user → reason). */
  label?: string;
  /** Whether the icon should spin. */
  spin?: boolean;
}

const GATE_META: Record<StageGate, GateMeta> = {
  locked: {
    Icon: Lock,
    iconClass: 'text-slate-400',
    cardClass: 'border-dashed opacity-60',
  },
  ready: {
    Icon: Play,
    iconClass: 'text-blue-500',
    cardClass: 'border-blue-300',
  },
  queued: {
    Icon: Clock,
    iconClass: 'text-slate-500',
    cardClass: '',
  },
  running: {
    Icon: Loader2,
    iconClass: 'text-blue-500',
    cardClass: 'border-blue-400',
    spin: true,
  },
  awaiting_user: {
    Icon: Hourglass,
    iconClass: 'text-amber-500',
    cardClass: 'border-amber-300',
    label: 'You',
  },
  completed: {
    Icon: CheckCircle2,
    iconClass: 'text-emerald-500',
    cardClass: 'border-emerald-300',
  },
  failed: {
    Icon: XCircle,
    iconClass: 'text-rose-500',
    cardClass: 'border-rose-300',
  },
  aborted: {
    Icon: Ban,
    iconClass: 'text-zinc-500',
    cardClass: 'border-zinc-300',
  },
  skipped: {
    Icon: SkipForward,
    iconClass: 'text-slate-400',
    cardClass: 'border-dashed',
  },
};

function ResumePipelineButton({
  projectId,
  onResumed,
}: {
  projectId: string;
  onResumed: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function resume(): Promise<void> {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/resume`, { method: 'POST' });
      if (res.ok) await onResumed();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={resume}
      disabled={busy}
      className="ml-auto inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
      data-testid="resume-pipeline"
    >
      <RefreshCw className={cn('h-3 w-3', busy && 'animate-spin')} aria-hidden />
      {busy ? 'Resuming…' : 'Resume pipeline'}
    </button>
  );
}

export function PipelineView({
  projectId,
  variant = 'overview',
  stage,
  onStageClick,
}: PipelineViewProps) {
  const router = useRouter();
  const { stageRuns, liveEvent, isConnected, project, refresh } = useProjectStream(projectId);

  if (variant === 'supervised') {
    if (!stage) {
      return (
        <div className="rounded-md border p-4 text-sm text-muted-foreground">
          Supervised view requires a `stage` prop.
        </div>
      );
    }
    return <StageView projectId={projectId} stage={stage} />;
  }

  function handleClick(s: Stage): void {
    if (onStageClick) onStageClick(s);
    else router.push(`/projects/${projectId}?stage=${s}`);
  }

  // Derive a human header status from the snapshot itself — saying "Idle"
  // while a stage is running is misleading.
  const activeStage = STAGES.find((s) => {
    const status = stageRuns[s]?.status;
    return status === 'queued' || status === 'running' || status === 'awaiting_user';
  });
  const headerText = liveEvent?.message
    ? liveEvent.message
    : activeStage
      ? `${STAGE_LABELS[activeStage]} — ${stageRuns[activeStage]?.status}`
      : isConnected
        ? 'Idle'
        : 'Connecting…';

  // Resume affordance: when autopilot is on, nothing is in flight, and
  // some stage's latest run is aborted/failed, the pipeline is stuck and
  // needs an explicit nudge. POST /resume calls resumeProject server-side.
  const anyInFlight = Boolean(activeStage);
  const hasResumable = STAGES.some((s) => {
    const status = stageRuns[s]?.status;
    return status === 'aborted' || status === 'failed';
  });
  const canResume = project.mode === 'autopilot' && !project.paused && !anyInFlight && hasResumable;

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
        <span className="truncate">{headerText}</span>
        {canResume ? (
          <ResumePipelineButton projectId={projectId} onResumed={refresh} />
        ) : null}
      </div>
      <ol className="flex flex-wrap gap-2">
        {STAGES.map((s) => {
          const run = stageRuns[s];
          const gate = computeStageGate(s, stageRuns);
          const meta = GATE_META[gate];
          const isLocked = gate === 'locked';
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => handleClick(s)}
                disabled={isLocked}
                className={cn(
                  'flex w-32 flex-col items-start gap-1 rounded-md border bg-card p-2 text-left transition',
                  isLocked ? 'cursor-not-allowed' : 'hover:shadow',
                  meta.cardClass,
                )}
                data-testid={`stage-card-${s}`}
                data-stage={s}
                data-status={gate}
                aria-label={`${STAGE_LABELS[s]} — ${gate}`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-medium">{STAGE_LABELS[s]}</span>
                  <meta.Icon
                    className={cn('h-4 w-4 shrink-0', meta.iconClass, meta.spin && 'animate-spin')}
                    aria-hidden
                  />
                </div>
                {meta.label ? (
                  <span className="text-[10px] font-medium text-muted-foreground">{meta.label}</span>
                ) : null}
                {typeof run?.attemptNo === 'number' && run.attemptNo > 1 ? (
                  <span className="text-[10px] text-muted-foreground">Attempt {run.attemptNo}</span>
                ) : null}
                {run?.updatedAt && (gate === 'completed' || gate === 'failed' || gate === 'aborted' || gate === 'skipped') ? (
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(run.updatedAt).toLocaleTimeString()}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
