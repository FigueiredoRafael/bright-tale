'use client';

/**
 * OverviewProgressView — watch-only panel rendered inside FocusPanel when
 * project.mode === 'overview'. Engines do NOT mount in this branch.
 *
 * Data source: `useProjectStream` (already mounted upstream) — no props
 * beyond `projectId`. All stage data is consumed from the stream result.
 *
 * Required testids (asserted by the M3 e2e suite):
 *   overview-progress-view
 *   overview-stepper
 *   overview-stage-{stage}  (× 8)   data-status="queued|running|completed|skipped|failed"
 *   overview-current-stage
 *   overview-current-stage-name
 *   overview-current-stage-elapsed
 *   overview-live-log
 *   overview-live-event      (rolling last 5, auto-scroll-bottom)
 *   overview-last-output     data-stage="{prevStage}"
 *   overview-actions
 *   overview-pause-btn
 *   overview-abort-btn
 *   overview-done-banner     (only when all expected stages completed|skipped)
 *   overview-view-draft-link
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectStream, type JobEvent } from '@/hooks/useProjectStream';
import type { StageRun, StageRunStatus } from '@brighttale/shared/pipeline/inputs';
import { summarizeStage, summarizeStageRich } from '@/lib/overview/stageSummaryFormatter';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

// ─── Constants ─────────────────────────────────────────────────────────────────

// Canonical 8-stage sequence (matches the pipeline STAGES constant in shared).
// 'draft' is the legacy alias — we render it via canonical/production in the
// modern pipeline; the stream may also emit 'draft' for legacy rows.
const OVERVIEW_STAGES = [
  'brainstorm',
  'research',
  'canonical',
  'production',
  'review',
  'assets',
  'preview',
  'publish',
] as const;

type OverviewStageName = (typeof OVERVIEW_STAGES)[number];

const STAGE_LABELS: Record<string, string> = {
  brainstorm: 'Brainstorm',
  research: 'Research',
  canonical: 'Canonical',
  production: 'Production',
  review: 'Review',
  assets: 'Assets',
  preview: 'Preview',
  publish: 'Publish',
};

/** Statuses considered "done" for the completion banner */
const DONE_STATUSES = new Set<StageRunStatus>(['completed', 'skipped']);

/** Max live-log entries to keep */
const MAX_LOG_ENTRIES = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(startedAt: string | null): string {
  if (!startedAt) return '—';
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins}m ${secs}s`;
}

function statusToStyle(status: StageRunStatus | 'queued'): string {
  switch (status) {
    case 'completed': return 'text-green-400 border-green-500/40 bg-green-500/5';
    case 'running':   return 'text-blue-400 border-blue-500/60 bg-blue-500/5 animate-pulse';
    case 'failed':    return 'text-red-400 border-red-500/40 bg-red-500/5';
    case 'aborted':   return 'text-red-400/70 border-red-500/30';
    case 'skipped':   return 'text-muted-foreground/50 border-border/40';
    case 'awaiting_user': return 'text-amber-400 border-amber-500/40 bg-amber-500/5';
    case 'queued':    return 'text-muted-foreground/40 border-border/30';
    default:          return 'text-muted-foreground/40 border-border/30';
  }
}

function statusToSymbol(status: StageRunStatus | 'queued'): string {
  switch (status) {
    case 'completed': return '✓';
    case 'running':   return '⟳';
    case 'failed':    return '✗';
    case 'aborted':   return '⊘';
    case 'skipped':   return '⊘';
    case 'awaiting_user': return '!';
    case 'queued':    return '·';
    default:          return '·';
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StageStepProps {
  stage: string;
  run: StageRun | null;
  active: boolean;
  onSelect?: () => void;
}

function StageStep({ stage, run, active, onSelect }: StageStepProps) {
  const status: StageRunStatus | 'queued' = run?.status ?? 'queued';
  const isClickable = onSelect !== undefined;
  const baseClass = `flex items-center gap-2 rounded border px-3 py-2 text-xs font-medium transition-colors ${statusToStyle(status)}`;
  const activeRing = active ? ' ring-2 ring-blue-500/60' : '';
  const cursorClass = isClickable ? ' cursor-pointer hover:bg-foreground/5' : '';
  const className = `${baseClass}${activeRing}${cursorClass}`;
  const content = (
    <>
      <span className="font-mono w-4 text-center">{statusToSymbol(status)}</span>
      <span>{STAGE_LABELS[stage] ?? stage}</span>
    </>
  );
  if (isClickable) {
    return (
      <button
        type="button"
        data-testid={`overview-stage-${stage}`}
        data-status={status}
        data-active={active ? 'true' : 'false'}
        onClick={onSelect}
        className={`${className} text-left`}
      >
        {content}
      </button>
    );
  }
  return (
    <div
      data-testid={`overview-stage-${stage}`}
      data-status={status}
      data-active={active ? 'true' : 'false'}
      className={className}
    >
      {content}
    </div>
  );
}

interface CurrentStageCardProps {
  stage: string;
  run: StageRun;
  elapsed: string;
}

function CurrentStageCard({ stage, run, elapsed }: CurrentStageCardProps) {
  void run;
  return (
    <div data-testid="overview-current-stage" className="rounded border border-blue-500/40 bg-blue-500/5 p-4">
      <div className="flex items-center justify-between">
        <span data-testid="overview-current-stage-name" className="text-sm font-medium text-blue-300">
          Running: {STAGE_LABELS[stage] ?? stage}
        </span>
        <span data-testid="overview-current-stage-elapsed" className="text-xs text-muted-foreground font-mono">
          {elapsed}
        </span>
      </div>
    </div>
  );
}

interface LiveLogProps {
  events: JobEvent[];
}

function LiveLog({ events }: LiveLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
    <div
      data-testid="overview-live-log"
      className="rounded border border-border/40 bg-background/40 p-3 max-h-36 overflow-y-auto font-mono text-xs space-y-1"
    >
      {events.length === 0 ? (
        <span className="text-muted-foreground/50">Waiting for events…</span>
      ) : (
        events.map((evt) => (
          <div
            key={evt.id}
            data-testid="overview-live-event"
            className="text-muted-foreground leading-relaxed"
          >
            <span className="text-muted-foreground/50 mr-2">
              {new Date(evt.createdAt).toLocaleTimeString()}
            </span>
            {evt.message}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ─── OverviewProgressView ──────────────────────────────────────────────────────

interface Props {
  projectId: string;
}

export function OverviewProgressView({ projectId }: Props) {
  const { stageRuns, liveEvent, project, refresh } = useProjectStream(projectId);
  const [logEntries, setLogEntries] = useState<JobEvent[]>([]);
  const [elapsed, setElapsed] = useState<string>('—');
  const [abortDialogOpen, setAbortDialogOpen] = useState(false);
  const [actionPending, setActionPending] = useState<'pause' | 'abort' | null>(null);
  // Tab-style focused stage: only the active stage's rich summary is shown.
  // Auto-advances to the most-recently-completed stage as the pipeline runs.
  // Users can click any completed stepper item to flip back to that output.
  const [selectedStage, setSelectedStage] = useState<OverviewStageName | null>(null);
  const [userPinnedStage, setUserPinnedStage] = useState<boolean>(false);

  // Track live-log (rolling last 5)
  useEffect(() => {
    if (!liveEvent) return;
    setLogEntries((prev) => {
      const next = [...prev, liveEvent];
      return next.slice(-MAX_LOG_ENTRIES);
    });
  }, [liveEvent]);

  // Derive current running stage
  const runningEntry = OVERVIEW_STAGES.map((s) => stageRuns[s]).find(
    (r) => r?.status === 'running',
  ) ?? null;
  const runningStage = runningEntry?.stage ?? null;

  // Tick elapsed timer ~1Hz
  useEffect(() => {
    if (!runningEntry?.startedAt) {
      setElapsed('—');
      return;
    }
    const update = () => setElapsed(formatElapsed(runningEntry.startedAt));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [runningEntry?.startedAt]);

  // Determine the most-recently-completed stage for "last output"
  const lastCompletedEntry = [...OVERVIEW_STAGES]
    .reverse()
    .map((s) => stageRuns[s])
    .find((r) => r !== null && r.status === 'completed') ?? null;

  // Auto-advance selectedStage to newest completed stage unless the user has
  // explicitly clicked a different one. Picks the latest-by-sequence completed
  // stage so visualization tracks pipeline progression.
  const newestCompletedStage = OVERVIEW_STAGES.reduce<OverviewStageName | null>(
    (acc, s) => (stageRuns[s]?.status === 'completed' ? s : acc),
    null,
  );
  useEffect(() => {
    if (!newestCompletedStage) return;
    if (userPinnedStage && selectedStage !== null) return;
    if (newestCompletedStage !== selectedStage) {
      setSelectedStage(newestCompletedStage);
    }
  }, [newestCompletedStage, selectedStage, userPinnedStage]);

  const handleSelectStage = useCallback((stage: OverviewStageName) => {
    setSelectedStage(stage);
    // Pin only if user picked something other than the newest. Picking the
    // newest is equivalent to "follow live progression" — keep auto-advance on.
    setUserPinnedStage(stage !== newestCompletedStage);
  }, [newestCompletedStage]);

  const activeStageRun = selectedStage ? stageRuns[selectedStage] : null;
  const activeRichSummary =
    selectedStage && activeStageRun && activeStageRun.status === 'completed'
      ? summarizeStageRich(selectedStage, activeStageRun.outcomeJson)
      : null;

  // Done banner: all expected stages are completed or skipped.
  // Skip stages that the project config disables (assets/preview) are already
  // marked skipped by the orchestrator, so we only check non-null runs.
  const allStageDone = OVERVIEW_STAGES.every((s) => {
    const run = stageRuns[s];
    return run !== null && DONE_STATUSES.has(run.status);
  });
  const publishRun = stageRuns.publish;
  const isDone = allStageDone || (publishRun !== null && publishRun?.status === 'completed');

  // Pause / Resume
  const handlePauseResume = useCallback(async () => {
    setActionPending('pause');
    try {
      const nextPaused = !project.paused;
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: nextPaused }),
      });
      await refresh();
    } finally {
      setActionPending(null);
    }
  }, [project.paused, projectId, refresh]);

  // Abort
  const handleAbortConfirmed = useCallback(async () => {
    setActionPending('abort');
    try {
      // Abort = mark project status + paused so orchestrator stops
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'aborted', paused: true }),
      });
      await refresh();
    } finally {
      setActionPending(null);
      setAbortDialogOpen(false);
    }
  }, [projectId, refresh]);

  const pauseLabel = project.paused ? 'Resume' : 'Pause';
  const isPausePending = actionPending === 'pause';
  const isAbortPending = actionPending === 'abort';

  return (
    <div
      data-testid="overview-progress-view"
      className="flex flex-col gap-4 p-6 flex-1 overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Overview</h2>
        {project.paused && (
          <span className="text-xs text-amber-400 border border-amber-500/30 rounded px-2 py-0.5">
            Paused
          </span>
        )}
      </div>

      {/* Stepper — clickable when a stage is completed; doubles as a tab strip */}
      <div data-testid="overview-stepper" className="flex flex-col gap-1.5">
        {OVERVIEW_STAGES.map((stage) => {
          const run = stageRuns[stage] ?? null;
          const isCompleted = run?.status === 'completed';
          return (
            <StageStep
              key={stage}
              stage={stage}
              run={run}
              active={selectedStage === stage}
              onSelect={isCompleted ? () => handleSelectStage(stage) : undefined}
            />
          );
        })}
      </div>

      {/* Current running stage */}
      {runningStage && runningEntry && (
        <CurrentStageCard
          stage={runningStage}
          run={runningEntry}
          elapsed={elapsed}
        />
      )}

      {/* Live log */}
      <LiveLog events={logEntries} />

      {/* Last output (legacy single-card slot, kept for backwards compat) */}
      {lastCompletedEntry && (
        <div
          data-testid="overview-last-output"
          data-stage={lastCompletedEntry.stage}
          className="rounded border border-border/40 bg-background/40 p-3 text-xs text-muted-foreground"
        >
          <span className="font-medium text-foreground mr-2">
            {STAGE_LABELS[lastCompletedEntry.stage] ?? lastCompletedEntry.stage}:
          </span>
          {summarizeStage(
            lastCompletedEntry.stage,
            lastCompletedEntry.outcomeJson,
          )}
        </div>
      )}

      {/* Focused stage panel — tab-style: one stage's rich summary at a time.
          Auto-advances to the newest completed stage; click any stepper item
          above to flip back to that output. */}
      {selectedStage && activeRichSummary && (
        <div
          data-testid="overview-stage-summary-active"
          data-stage={selectedStage}
          className="rounded border border-border/60 bg-background/60 p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span
              data-testid="overview-stage-summary-active-title"
              className="text-sm font-semibold text-foreground"
            >
              {STAGE_LABELS[selectedStage] ?? activeRichSummary.title}
            </span>
            <span className="text-xs text-muted-foreground">
              Stage output
            </span>
          </div>
          <ul
            data-testid={`overview-stage-summary-${selectedStage}`}
            className="text-sm text-muted-foreground space-y-1"
          >
            {activeRichSummary.lines.map((line, i) => (
              <li
                key={i}
                data-testid={`overview-stage-summary-${selectedStage}-line`}
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div data-testid="overview-actions" className="flex items-center gap-2">
        <Button
          data-testid="overview-pause-btn"
          variant="outline"
          size="sm"
          disabled={isPausePending || isAbortPending}
          onClick={() => { void handlePauseResume(); }}
        >
          {isPausePending ? 'Working…' : pauseLabel}
        </Button>
        <Button
          data-testid="overview-abort-btn"
          variant="outline"
          size="sm"
          className="border-red-500/30 text-red-400 hover:border-red-500/60 hover:text-red-300"
          disabled={isPausePending || isAbortPending}
          onClick={() => setAbortDialogOpen(true)}
        >
          {isAbortPending ? 'Aborting…' : 'Abort'}
        </Button>
      </div>

      {/* Done banner */}
      {isDone && (
        <div
          data-testid="overview-done-banner"
          className="rounded border border-green-500/40 bg-green-500/5 p-4 flex items-center justify-between"
        >
          <span className="text-sm font-medium text-green-300">
            Pipeline complete
          </span>
          <a
            data-testid="overview-view-draft-link"
            href={`/projects/${projectId}?stage=publish`}
            className="text-xs text-green-400 underline underline-offset-2 hover:text-green-300"
          >
            View draft →
          </a>
        </div>
      )}

      {/* Abort confirm dialog */}
      <AlertDialog open={abortDialogOpen} onOpenChange={setAbortDialogOpen}>
        <AlertDialogContent data-testid="overview-abort-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Abort pipeline?</AlertDialogTitle>
            <AlertDialogDescription>
              This stops all running stages immediately. You will need to restart
              the pipeline from the beginning to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAbortPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="overview-abort-confirm"
              disabled={isAbortPending}
              onClick={(e) => {
                e.preventDefault();
                void handleAbortConfirmed();
              }}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isAbortPending ? 'Aborting…' : 'Abort pipeline'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
