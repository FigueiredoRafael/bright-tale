'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { EngineHost } from './EngineHost';
import { useProjectStream } from '@/hooks/useProjectStream';
import type { Stage, StageRun, StageRunStatus } from '@brighttale/shared/pipeline/inputs';

// ─── Extended stream result — allAttempts added by T4 stream ─────────────────

interface ProjectStreamResult {
  stageRuns: Record<string, StageRun | null>;
  liveEvent: unknown;
  isConnected: boolean;
  project: { mode: 'autopilot' | 'manual'; paused: boolean };
  refresh: () => Promise<void>;
  allAttempts?: StageRun[];
}

interface Props {
  projectId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SHARED_STAGES = new Set(['brainstorm', 'research', 'canonical']);

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

function deriveLoopType(stage: string, attemptNo: number): string | null {
  if (attemptNo <= 1) return null;
  if (stage === 'research') return 'confidence loop';
  if (stage === 'review' || stage === 'production') return 'revision loop';
  return null;
}

function extractScore(run: StageRun): number | string | null {
  if (!run.outcomeJson || typeof run.outcomeJson !== 'object') return null;
  const outcome = run.outcomeJson as Record<string, unknown>;
  if (typeof outcome.score === 'number') return outcome.score;
  if (typeof outcome.confidence === 'number') return outcome.confidence;
  return null;
}

function buildUrl(
  pathname: string,
  current: URLSearchParams,
  overrides: Record<string, string | undefined>,
): string {
  const next = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      next.delete(k);
    } else {
      next.set(k, v);
    }
  }
  return `${pathname}?${next.toString()}`;
}

// ─── StatusDot — tiny visual indicator inside attempt chips ──────────────────

function statusToSymbol(status: StageRunStatus): string {
  if (status === 'completed') return '✓';
  if (status === 'running') return '⟳';
  if (status === 'failed') return '✗';
  if (status === 'aborted') return '⊘';
  if (status === 'skipped') return '⊘';
  if (status === 'awaiting_user') return '!';
  return '·';
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

interface BreadcrumbProps {
  stage: string;
  trackLabel: string | null;
  attemptNo: number;
}

function Breadcrumb({ stage, trackLabel, attemptNo }: BreadcrumbProps) {
  const loopType = deriveLoopType(stage, attemptNo);
  const segments: Array<{ label: string; highlight?: boolean }> = [];

  if (trackLabel) {
    segments.push({ label: trackLabel });
  } else {
    segments.push({ label: 'Shared' });
  }

  segments.push({ label: STAGE_LABELS[stage] ?? stage });

  if (loopType) {
    segments.push({ label: loopType, highlight: true });
    segments.push({ label: `attempt ${attemptNo}` });
  }

  return (
    <div data-testid="focus-panel-breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground mb-1 flex-wrap">
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground/50">›</span>}
          <span className={seg.highlight ? 'text-amber-400 font-medium' : ''}>
            {seg.label}
          </span>
        </span>
      ))}
    </div>
  );
}

// ─── Attempt tabs ─────────────────────────────────────────────────────────────

interface AttemptTabsProps {
  attempts: StageRun[];
  currentAttemptNo: number;
  onSelect: (attemptNo: number) => void;
}

function AttemptTabs({ attempts, currentAttemptNo, onSelect }: AttemptTabsProps) {
  return (
    <div data-testid="focus-panel-attempt-tabs" className="flex items-center gap-1 flex-wrap">
      {attempts.map((run) => {
        const score = extractScore(run);
        const isActive = run.attemptNo === currentAttemptNo;
        return (
          <button
            key={run.attemptNo}
            data-testid={`attempt-tab-${run.attemptNo}`}
            data-active={String(isActive)}
            data-status={run.status}
            onClick={() => onSelect(run.attemptNo)}
            className={[
              'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs transition-colors',
              isActive
                ? 'border-blue-500 bg-blue-950 text-white shadow-[0_0_0_1px_#60a5fa]'
                : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground',
              run.status === 'completed' ? 'text-green-400 border-green-500/30' : '',
              run.status === 'failed' ? 'text-red-400 border-red-500/30' : '',
              run.status === 'running' ? 'text-blue-400 border-blue-500' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span>#{run.attemptNo}</span>
            {score !== null && <span>· {score}</span>}
            {score === null && run.status !== 'queued' && (
              <span>{statusToSymbol(run.status)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Loop info card ───────────────────────────────────────────────────────────

interface LoopInfoCardProps {
  stage: string;
  currentAttemptNo: number;
  priorAttempts: StageRun[];
}

function LoopInfoCard({ stage, currentAttemptNo, priorAttempts }: LoopInfoCardProps) {
  const loopType = deriveLoopType(stage, currentAttemptNo);
  if (!loopType || priorAttempts.length === 0) return null;

  return (
    <div
      data-testid="loop-info-card"
      className="rounded border border-amber-500/30 bg-amber-500/5 p-3 mb-4"
    >
      <div className="flex items-start gap-2">
        <span className="text-amber-400 mt-0.5 shrink-0">ⓘ</span>
        <div className="text-xs text-muted-foreground">
          <p className="text-amber-300 font-medium mb-1">
            {loopType} · attempt {currentAttemptNo}
          </p>
          <ul className="space-y-1">
            {priorAttempts.map((run) => {
              const score = extractScore(run);
              return (
                <li key={run.attemptNo} className="flex items-center gap-2">
                  <span>attempt {run.attemptNo}</span>
                  <span className="text-muted-foreground/60">{run.status}</span>
                  {score !== null && <span className="text-amber-300">{score}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── FocusPanel ───────────────────────────────────────────────────────────────

export function FocusPanel({ projectId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { stageRuns, allAttempts: rawAllAttempts } = useProjectStream(projectId) as ProjectStreamResult;

  // Read URL state
  const stage = searchParams.get('stage') as Stage | null;
  const trackId = searchParams.get('track') ?? undefined;
  const targetId = searchParams.get('target') ?? undefined;
  const attemptParam = searchParams.get('attempt');
  const attemptNo = attemptParam ? parseInt(attemptParam, 10) : 1;

  // Gather all attempts for the current (stage, track, target) combination
  const allAttempts: StageRun[] = (rawAllAttempts ?? []).filter(
    (r) =>
      r.stage === stage &&
      (r.trackId ?? null) === (trackId ?? null) &&
      (r.publishTargetId ?? null) === (targetId ?? null),
  );

  // If no allAttempts from stream, fall back to the single latest stage run
  const attemptsToShow: StageRun[] =
    allAttempts.length > 0
      ? allAttempts
      : stage && stageRuns[stage]
        ? [stageRuns[stage] as StageRun]
        : [];

  // Prior attempts = all attempts with attemptNo < current
  const priorAttempts = attemptsToShow.filter((r) => r.attemptNo < attemptNo);

  // Track label (for breadcrumb) — in MVP no tracks lookup, just use trackId
  const trackLabel: string | null = trackId ? `Track ${trackId}` : null;

  function handleAttemptSelect(newAttemptNo: number) {
    const url = buildUrl(pathname, searchParams, { attempt: String(newAttemptNo) });
    router.replace(url);
  }

  // Empty state — no stage selected
  if (!stage) {
    return (
      <div data-testid="focus-panel" className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <div data-testid="focus-panel-empty">
          Select a stage from the sidebar to begin.
        </div>
      </div>
    );
  }

  // Determine if the stage is a known shared or track stage
  const isShared = SHARED_STAGES.has(stage);
  void isShared;

  return (
    <div data-testid="focus-panel" className="flex flex-1 flex-col p-6 overflow-y-auto">
      <div data-testid="focus-panel-content" className="flex flex-col flex-1">
        {/* Breadcrumb */}
        <Breadcrumb
          stage={stage}
          trackLabel={trackLabel}
          attemptNo={attemptNo}
        />

        {/* Title + attempt tabs row */}
        <div className="flex items-start justify-between mb-4 gap-4">
          <h2 className="text-xl font-semibold">
            {STAGE_LABELS[stage] ?? stage} Engine
          </h2>
          {attemptsToShow.length > 0 && (
            <AttemptTabs
              attempts={attemptsToShow}
              currentAttemptNo={attemptNo}
              onSelect={handleAttemptSelect}
            />
          )}
        </div>

        {/* Loop info card — only when attempt_no > 1 */}
        {attemptNo > 1 && priorAttempts.length > 0 && (
          <LoopInfoCard
            stage={stage}
            currentAttemptNo={attemptNo}
            priorAttempts={priorAttempts}
          />
        )}

        {/* Engine Host */}
        <div className="flex-1">
          <EngineHost
            projectId={projectId}
            stage={stage}
            trackId={trackId}
            publishTargetId={targetId}
            attemptNo={attemptNo}
          />
        </div>
      </div>
    </div>
  );
}
