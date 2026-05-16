'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { CheckCircle, Circle, Loader2, XCircle, AlertCircle, MinusCircle, SkipForward, Pause, Play, OctagonX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { useProjectStream } from '@/hooks/useProjectStream';
import type { StageRun, StageRunStatus } from '@brighttale/shared/pipeline/inputs';
import { AddMediumDialog } from './AddMediumDialog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublishTarget {
  id: string;
  displayName: string;
}

interface Track {
  id: string;
  medium: 'blog' | 'video' | 'shorts' | 'podcast';
  status: 'active' | 'aborted' | 'completed';
  paused: boolean;
  stageRuns?: Record<string, StageRun | null>;
  publishTargets?: PublishTarget[];
}

// Extend the useProjectStream return type with tracks (added in T4 stream)
interface ProjectStreamResult {
  stageRuns: Record<string, StageRun | null>;
  liveEvent: unknown;
  isConnected: boolean;
  project: { mode: 'autopilot' | 'manual'; paused: boolean };
  refresh: () => Promise<void>;
  tracks?: Track[];
}

interface Props {
  projectId: string;
  channelId?: string;
}

// ─── Status icon ─────────────────────────────────────────────────────────────

function StatusIcon({ status, testId }: { status: StageRunStatus | null; testId: string }) {
  const props = { size: 14, 'data-testid': testId, 'data-status': status ?? 'none' };
  if (status === 'completed') return <CheckCircle {...props} className="text-green-500 shrink-0" />;
  if (status === 'running') return <Loader2 {...props} className="text-blue-500 shrink-0 animate-spin" />;
  if (status === 'failed') return <XCircle {...props} className="text-red-500 shrink-0" />;
  if (status === 'aborted') return <XCircle {...props} className="text-muted-foreground shrink-0" />;
  if (status === 'awaiting_user') return <AlertCircle {...props} className="text-yellow-500 shrink-0" />;
  if (status === 'skipped') return <SkipForward {...props} className="text-muted-foreground shrink-0" />;
  if (status === 'queued') return <MinusCircle {...props} className="text-muted-foreground shrink-0" />;
  return <Circle {...props} className="text-muted-foreground shrink-0" />;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUrl(
  pathname: string,
  current: URLSearchParams,
  overrides: Record<string, string | undefined>,
): string {
  const next = new URLSearchParams(current.toString());
  // Clear target/track if not in overrides
  if (!('track' in overrides)) next.delete('track');
  if (!('target' in overrides)) next.delete('target');
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      next.delete(k);
    } else {
      next.set(k, v);
    }
  }
  return `${pathname}?${next.toString()}`;
}

function isActive(
  searchParams: URLSearchParams,
  stage: string,
  trackId?: string,
  targetId?: string,
): boolean {
  if (searchParams.get('stage') !== stage) return false;
  if (trackId !== undefined && searchParams.get('track') !== trackId) return false;
  if (targetId !== undefined && searchParams.get('target') !== targetId) return false;
  return true;
}

// ─── Shared zone item ─────────────────────────────────────────────────────────

interface SharedItemProps {
  stage: string;
  label: string;
  stageRun: StageRun | null;
  onClick: () => void;
  active: boolean;
}

function SharedItem({ stage, label, stageRun, onClick, active }: SharedItemProps) {
  const status = stageRun?.status ?? null;
  const attemptNo = stageRun?.attemptNo ?? 1;
  const awaitingReason = stageRun?.awaitingReason ?? null;

  return (
    <button
      data-testid={`sidebar-item-${stage}`}
      data-active={active}
      onClick={onClick}
      className={[
        'flex w-full items-center gap-2 px-3 py-1.5 rounded-md text-sm text-left',
        'hover:bg-accent transition-colors',
        active ? 'bg-accent font-medium' : '',
      ].join(' ')}
    >
      <StatusIcon status={status as StageRunStatus | null} testId={`sidebar-status-${stage}`} />
      <span className="flex-1 truncate">{label}</span>
      {attemptNo > 1 && (
        <Badge
          data-testid={`sidebar-attempt-${stage}`}
          variant="secondary"
          className="text-xs px-1 py-0 h-4"
        >
          {attemptNo}
        </Badge>
      )}
      {awaitingReason !== null && (
        <Badge
          data-testid={`sidebar-awaiting-${stage}`}
          variant="outline"
          className="text-xs px-1 py-0 h-4"
        >
          {awaitingReason === 'manual_paste' ? 'paste' : 'advance'}
        </Badge>
      )}
    </button>
  );
}

// ─── Track section ────────────────────────────────────────────────────────────

const TRACK_STAGES = ['production', 'review', 'assets', 'preview', 'publish'] as const;
type TrackStage = (typeof TRACK_STAGES)[number];

const TRACK_STAGE_LABELS: Record<TrackStage, string> = {
  production: 'Production',
  review: 'Review',
  assets: 'Assets',
  preview: 'Preview',
  publish: 'Publish',
};

const MEDIUM_LABELS: Record<string, string> = {
  blog: 'Blog',
  video: 'Video',
  shorts: 'Shorts',
  podcast: 'Podcast',
};

interface TrackCostEntry {
  trackId: string;
  medium: string;
  totalCost: number;
}

interface TrackSectionProps {
  track: Track;
  searchParams: URLSearchParams;
  onSelect: (stage: string, trackId: string, targetId?: string) => void;
  /** Optional — called after the optimistic PATCH resolves; triggers a stream refresh. */
  onPauseToggle?: (trackId: string, paused: boolean) => Promise<void>;
  onAbort?: (trackId: string) => Promise<void>;
  projectId?: string;
  /** Per-track credit spend, fetched asynchronously by FocusSidebar. */
  costByTrack?: Record<string, number>;
}

function TrackSection({ track, searchParams, onSelect, onPauseToggle, onAbort, projectId, costByTrack }: TrackSectionProps) {
  const [abortDialogOpen, setAbortDialogOpen] = useState(false);

  async function handlePauseToggle(e: React.MouseEvent) {
    e.stopPropagation();
    const newPaused = !track.paused;
    if (onPauseToggle) {
      await onPauseToggle(track.id, newPaused);
      return;
    }
    // Fallback: fire PATCH directly (used when no callback is provided)
    if (!projectId) return;
    await fetch(`/api/projects/${projectId}/tracks/${track.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused: newPaused }),
    });
  }

  async function handleAbortConfirm() {
    setAbortDialogOpen(false);
    if (onAbort) {
      await onAbort(track.id);
      return;
    }
    // Fallback: fire PATCH directly
    if (!projectId) return;
    await fetch(`/api/projects/${projectId}/tracks/${track.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'aborted' }),
    });
  }

  const trackCost = costByTrack?.[track.id] ?? 0;
  const isAborted = track.status === 'aborted';
  const isCompleted = track.status === 'completed';

  // Abort button is visible when any stage_run is running or awaiting_user
  const hasActiveStageRun = Object.values(track.stageRuns ?? {}).some(
    (sr) => sr?.status === 'running' || sr?.status === 'awaiting_user',
  );
  const showAbortButton = !isAborted && !isCompleted && hasActiveStageRun;

  return (
    <>
    <div
      data-testid={`sidebar-section-${track.id}`}
      data-status={isAborted ? 'aborted' : undefined}
      className={['mt-2', track.paused ? 'opacity-60' : '', isAborted ? 'opacity-50' : ''].filter(Boolean).join(' ')}
    >
      <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        <span className="flex-1">{MEDIUM_LABELS[track.medium] ?? track.medium}</span>
        {trackCost > 0 && (
          <Badge
            data-testid={`sidebar-track-cost-${track.id}`}
            variant="secondary"
            className="text-xs px-1 py-0 h-4 font-normal"
          >
            {trackCost} cr
          </Badge>
        )}
        {isAborted && (
          <Badge
            data-testid={`sidebar-track-aborted-badge-${track.id}`}
            variant="secondary"
            className="text-xs px-1 py-0 h-4"
          >
            Aborted
          </Badge>
        )}
        {track.paused && !isAborted && (
          <Badge
            data-testid={`sidebar-track-paused-badge-${track.id}`}
            variant="secondary"
            className="text-xs px-1 py-0 h-4"
          >
            Paused
          </Badge>
        )}
        {!isAborted && (
          <Button
            data-testid={`sidebar-track-pause-${track.id}`}
            variant="ghost"
            size="icon"
            aria-pressed={track.paused}
            aria-label={`${track.paused ? 'Resume' : 'Pause'} ${MEDIUM_LABELS[track.medium] ?? track.medium} track`}
            className="h-4 w-4 shrink-0"
            onClick={handlePauseToggle}
          >
            {track.paused ? <Play size={10} /> : <Pause size={10} />}
          </Button>
        )}
        {showAbortButton && (
          <Button
            data-testid={`track-abort-btn-${track.id}`}
            variant="ghost"
            size="icon"
            aria-label={`Abort ${MEDIUM_LABELS[track.medium] ?? track.medium} track`}
            className="h-4 w-4 shrink-0 text-destructive hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); setAbortDialogOpen(true); }}
          >
            <OctagonX size={10} />
          </Button>
        )}
      </div>
      {TRACK_STAGES.map((stage) => {
        const stageRun = track.stageRuns?.[stage] ?? null;
        const status = stageRun?.status ?? null;
        const attemptNo = stageRun?.attemptNo ?? 1;
        const awaitingReason = stageRun?.awaitingReason ?? null;
        const active = isActive(searchParams, stage, track.id, undefined);

        return (
          <div key={stage}>
            <button
              data-testid={`sidebar-item-${track.id}-${stage}`}
              data-active={active}
              onClick={() => onSelect(stage, track.id)}
              className={[
                'flex w-full items-center gap-2 pl-6 pr-3 py-1.5 rounded-md text-sm text-left',
                'hover:bg-accent transition-colors',
                active ? 'bg-accent font-medium' : '',
              ].join(' ')}
            >
              <StatusIcon
                status={status as StageRunStatus | null}
                testId={`sidebar-status-${track.id}-${stage}`}
              />
              <span className="flex-1 truncate">{TRACK_STAGE_LABELS[stage]}</span>
              {attemptNo > 1 && (
                <Badge
                  data-testid={`sidebar-attempt-${track.id}-${stage}`}
                  variant="secondary"
                  className="text-xs px-1 py-0 h-4"
                >
                  {attemptNo}
                </Badge>
              )}
              {awaitingReason !== null && (
                <Badge
                  data-testid={`sidebar-awaiting-${track.id}-${stage}`}
                  variant="outline"
                  className="text-xs px-1 py-0 h-4"
                >
                  {awaitingReason === 'manual_paste' ? 'paste' : 'advance'}
                </Badge>
              )}
            </button>

            {/* Publish targets as sub-items under the Publish stage */}
            {stage === 'publish' && (track.publishTargets ?? []).length > 0 && (
              <div>
                {(track.publishTargets ?? []).map((pt) => {
                  const ptActive = isActive(searchParams, 'publish', track.id, pt.id);
                  return (
                    <button
                      key={pt.id}
                      data-testid={`sidebar-item-${track.id}-publish-target-${pt.id}`}
                      data-active={ptActive}
                      onClick={() => onSelect('publish', track.id, pt.id)}
                      className={[
                        'flex w-full items-center gap-2 pl-10 pr-3 py-1 rounded-md text-xs text-left',
                        'hover:bg-accent transition-colors',
                        ptActive ? 'bg-accent font-medium' : 'text-muted-foreground',
                      ].join(' ')}
                    >
                      <Circle size={10} className="shrink-0" />
                      <span className="flex-1 truncate">{pt.displayName}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>

    {/* ── Abort confirmation dialog ─────────────────────────────────────── */}
    <AlertDialog open={abortDialogOpen} onOpenChange={setAbortDialogOpen}>
      <AlertDialogContent data-testid="track-abort-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Abort track?</AlertDialogTitle>
          <AlertDialogDescription>
            Cancels in-flight stage runs for the {MEDIUM_LABELS[track.medium] ?? track.medium} track. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="track-abort-cancel-btn">Cancel</AlertDialogCancel>
          <AlertDialogAction
            data-testid="track-abort-confirm-btn"
            onClick={() => { void handleAbortConfirm(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Abort track
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ─── FocusSidebar ─────────────────────────────────────────────────────────────

const SHARED_STAGES: Array<{ stage: string; label: string }> = [
  { stage: 'brainstorm', label: 'Brainstorm' },
  { stage: 'research', label: 'Research' },
  { stage: 'canonical', label: 'Canonical' },
];

export function FocusSidebar({ projectId, channelId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [costByTrack, setCostByTrack] = useState<Record<string, number>>({});

  const { stageRuns, tracks: rawTracks, liveEvent, refresh } = useProjectStream(projectId) as ProjectStreamResult;

  // Show all tracks — aborted ones are styled differently (opacity-50, "Aborted" badge)
  const tracks: Track[] = rawTracks ?? [];

  const canonicalCompleted = stageRuns['canonical']?.status === 'completed';

  // Fetch per-track cost on mount and whenever a liveEvent arrives
  const prevLiveEvent = useRef<unknown>(undefined);
  useEffect(() => {
    if (liveEvent === prevLiveEvent.current) return;
    prevLiveEvent.current = liveEvent;

    void (async () => {
      try {
        const res = await fetch(`/api/credits/usage/by-track?projectId=${projectId}`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          data: { byTrack: TrackCostEntry[] } | null;
          error: unknown;
        };
        if (json.error !== null || json.data === null) return;
        const map: Record<string, number> = {};
        for (const entry of json.data.byTrack) {
          map[entry.trackId] = entry.totalCost;
        }
        setCostByTrack(map);
      } catch {
        // Network error — silently ignore; badge simply won't update
      }
    })();
  }, [projectId, liveEvent]);

  function handleSharedSelect(stage: string) {
    const url = buildUrl(pathname, searchParams, { stage });
    router.replace(url);
  }

  function handleTrackSelect(stage: string, trackId: string, targetId?: string) {
    const overrides: Record<string, string | undefined> = { stage, track: trackId };
    if (targetId !== undefined) overrides.target = targetId;
    const url = buildUrl(pathname, searchParams, overrides);
    router.replace(url);
  }

  async function handlePauseToggle(trackId: string, paused: boolean) {
    // Optimistic: fire PATCH then refresh stream
    try {
      const res = await fetch(`/api/projects/${projectId}/tracks/${trackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused }),
      });
      if (!res.ok) {
        // Rollback via refresh — server state is authoritative
        await refresh();
        return;
      }
    } catch {
      await refresh();
      return;
    }
    await refresh();
  }

  async function handleAbortTrack(trackId: string) {
    try {
      await fetch(`/api/projects/${projectId}/tracks/${trackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'aborted' }),
      });
    } catch {
      // Network error — refresh to get authoritative state
    }
    await refresh();
  }

  return (
    <>
    <nav className="flex flex-col gap-1 py-2 select-none" aria-label="Pipeline navigation">
      {/* ── Shared zone ─────────────────────────────────────────────────── */}
      <div data-testid="sidebar-section-shared">
        <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Shared
        </div>
        {SHARED_STAGES.map(({ stage, label }) => {
          const stageRun = stageRuns[stage] ?? null;
          const active = isActive(searchParams, stage, undefined, undefined) &&
            !searchParams.get('track');
          return (
            <SharedItem
              key={stage}
              stage={stage}
              label={label}
              stageRun={stageRun}
              onClick={() => handleSharedSelect(stage)}
              active={active}
            />
          );
        })}
      </div>

      {/* ── Per-Track sections ───────────────────────────────────────────── */}
      {tracks.map((track) => (
        <TrackSection
          key={track.id}
          track={track}
          searchParams={searchParams}
          onSelect={handleTrackSelect}
          onPauseToggle={handlePauseToggle}
          onAbort={handleAbortTrack}
          projectId={projectId}
          costByTrack={costByTrack}
        />
      ))}

      {/* ── Add Medium button (gated on Canonical completion) ───────────── */}
      {canonicalCompleted && (
        <div className="mt-3 px-3">
          <Button
            data-testid="sidebar-add-medium"
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => setDialogOpen(true)}
          >
            + Add medium
          </Button>
        </div>
      )}
    </nav>
    <AddMediumDialog
      open={dialogOpen}
      projectId={projectId}
      channelId={channelId ?? ''}
      existingMedia={tracks.filter((t) => t.status !== 'aborted').map((t) => t.medium)}
      onClose={() => setDialogOpen(false)}
      onTrackAdded={() => { void refresh(); }}
    />
  </>
  );
}
