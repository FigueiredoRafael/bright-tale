'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FocusSidebar } from './FocusSidebar';
import { FocusPanel } from './FocusPanel';
import { GraphView } from './GraphView';
import { ViewToggle } from './ViewToggle';
import { ProjectContextProvider } from './ProjectContextProvider';
import { useProjectStream } from '@/hooks/useProjectStream';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// ─── PipelineWorkspace ────────────────────────────────────────────────────────
// Layout host that reads ?view= and renders either the Focus layout
// (FocusSidebar + FocusPanel) or the Graph layout (GraphView).
// ViewToggle is always shown in the header.
//
// The project-scope awaiting banner lives here (not inside FocusPanel) so its
// visual scope matches the endpoint it calls: POST /api/projects/:id/resume
// resumes the entire project, not a single track.

interface Props {
  projectId: string;
}

// ─── AwaitingBanner — project-scope resume banner ────────────────────────────

interface AwaitingBannerProps {
  reason: string | null;
  projectId: string;
  onResumed: () => Promise<void>;
}

function AwaitingBanner({ reason, projectId, onResumed }: AwaitingBannerProps) {
  const [loading, setLoading] = useState(false);
  const copy =
    reason === 'provider_quota_exhausted'
      ? 'Provider quota exhausted. Retry when reset.'
      : `Awaiting input: ${reason ?? 'unknown'}`;

  async function handleResume() {
    setLoading(true);
    try {
      await fetch(`/api/projects/${projectId}/resume`, { method: 'POST' });
      await onResumed();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Alert
      data-testid="awaiting-banner"
      data-reason={reason ?? ''}
      className="mx-6 mt-3 mb-0 border-amber-500/40 bg-amber-500/5"
    >
      <AlertTitle className="text-amber-300">Pipeline paused</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <span className="text-amber-200/80">{copy}</span>
        <button
          data-testid="resume-track-btn"
          onClick={() => { void handleResume(); }}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-200 transition-colors hover:border-amber-500/70 hover:bg-amber-500/20 disabled:opacity-50"
        >
          {loading ? 'Resuming…' : 'Resume'}
        </button>
      </AlertDescription>
    </Alert>
  );
}

// ─── PipelineWorkspace ────────────────────────────────────────────────────────

export function PipelineWorkspace({ projectId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isGraph = searchParams.get('view') === 'graph';
  const hasStageParam = searchParams.has('stage');

  const { stageRuns, project, tracks, refresh } = useProjectStream(projectId);

  // Stage that the supervised auto-advance system last drove the URL to. When
  // the URL stage diverges from this ref the user has manually navigated (e.g.
  // clicked a prior stage in the sidebar to inspect it), so we surrender
  // control until they explicitly resume.
  const lastAutoRoutedStageRef = useRef<string | null>(null);

  // Cold-start auto-route: when the user lands on /projects/:id with no
  // ?stage= param (e.g. straight from the wizard), point them at the
  // brainstorm run that POST /api/projects auto-dispatched. Without this
  // the Focus panel renders an empty "Select a stage" placeholder despite
  // having freshly queued work.
  useEffect(() => {
    if (isGraph || hasStageParam) return;
    const brainstorm = stageRuns.brainstorm;
    if (!brainstorm) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set('stage', 'brainstorm');
    next.set('attempt', String(brainstorm.attemptNo ?? 1));
    lastAutoRoutedStageRef.current = 'brainstorm';
    router.replace(`${pathname}?${next.toString()}`);
  }, [isGraph, hasStageParam, stageRuns.brainstorm, pathname, router, searchParams]);

  // Supervised auto-advance: in supervised mode, when the currently-focused
  // stage completes, route the URL to the next stage in the canonical
  // sequence so engines mount continuously without user clicks.
  //
  // Sequence: brainstorm → research → canonical → (first active track's
  // production → review → assets → preview → publish). assets/preview are
  // skipped when their stage run is marked 'skipped' (e.g. wizard config).
  useEffect(() => {
    if (isGraph) return;
    // Accept both the canonical 'supervised' label and the legacy 'autopilot'
    // alias the Slice 13 backfill stamped onto pre-existing projects. Without
    // this, projects created before the supervised/overview/step-by-step split
    // (mode='autopilot') never auto-advance even though the user clicked play.
    if (project.rawMode !== 'supervised' && project.rawMode !== 'autopilot') return;
    if (project.paused) return;
    const currentStage = searchParams.get('stage');
    if (!currentStage) return;

    // User-initiated navigation surrenders auto-advance until they hit a
    // primary action again. We only walk forward when the URL still points at
    // the stage WE last routed to — if it differs the user has clicked back
    // to inspect something and we must not yank them forward.
    if (lastAutoRoutedStageRef.current === null) return;
    if (lastAutoRoutedStageRef.current !== currentStage) {
      lastAutoRoutedStageRef.current = null;
      return;
    }

    const currentTrackId = searchParams.get('track');

    const SHARED_SEQ = ['brainstorm', 'research', 'canonical'] as const;
    const TRACK_SEQ = ['production', 'review', 'assets', 'preview', 'publish'] as const;

    // Resolve the run for the current URL stage
    const sharedIdx = SHARED_SEQ.indexOf(currentStage as (typeof SHARED_SEQ)[number]);
    const trackIdx = TRACK_SEQ.indexOf(currentStage as (typeof TRACK_SEQ)[number]);
    const activeTracks = tracks.filter((t) => t.status === 'active' && !t.paused);
    const focusedTrack = currentTrackId
      ? activeTracks.find((t) => t.id === currentTrackId) ?? null
      : activeTracks[0] ?? null;

    let currentRun: { status: string } | null | undefined = null;
    if (sharedIdx >= 0) {
      currentRun = stageRuns[currentStage as (typeof SHARED_SEQ)[number]];
    } else if (trackIdx >= 0 && focusedTrack) {
      currentRun = focusedTrack.stageRuns?.[currentStage] ?? null;
    }
    if (!currentRun || currentRun.status !== 'completed') return;

    // Compute next stage in canonical sequence
    let nextStage: string | null = null;
    let nextTrackId: string | null = null;
    if (sharedIdx >= 0) {
      if (sharedIdx + 1 < SHARED_SEQ.length) {
        nextStage = SHARED_SEQ[sharedIdx + 1];
      } else if (focusedTrack) {
        nextStage = TRACK_SEQ[0];
        nextTrackId = focusedTrack.id;
      }
    } else if (trackIdx >= 0 && focusedTrack) {
      // Walk forward to the first non-skipped track stage
      for (let i = trackIdx + 1; i < TRACK_SEQ.length; i += 1) {
        const cand = TRACK_SEQ[i];
        const candRun = focusedTrack.stageRuns?.[cand];
        if (candRun?.status === 'skipped') continue;
        nextStage = cand;
        nextTrackId = focusedTrack.id;
        break;
      }
    }
    if (!nextStage) return;

    // Avoid redundant replace if URL already matches
    if (
      searchParams.get('stage') === nextStage &&
      (searchParams.get('track') ?? null) === (nextTrackId ?? null)
    ) return;

    const next = new URLSearchParams(searchParams.toString());
    next.set('stage', nextStage);
    if (nextTrackId) {
      next.set('track', nextTrackId);
    } else {
      next.delete('track');
    }
    next.delete('target');
    lastAutoRoutedStageRef.current = nextStage;
    router.replace(`${pathname}?${next.toString()}`);
  }, [
    isGraph,
    project.rawMode,
    project.paused,
    stageRuns,
    tracks,
    searchParams,
    pathname,
    router,
  ]);

  // Project is awaiting if it is explicitly paused OR if any stage run is
  // awaiting user input. Either condition warrants the project-scope banner.
  const awaitingRun = Object.values(stageRuns).find(
    (r) => r !== null && r.status === 'awaiting_user',
  ) ?? null;
  const isProjectAwaiting = project.paused || awaitingRun !== null;
  const awaitingReason = awaitingRun?.awaitingReason ?? null;

  return (
    <ProjectContextProvider projectId={projectId}>
      <div data-testid="pipeline-workspace" className="flex flex-col h-full min-h-0">
        {/* Header row with toggle */}
        <div className="flex items-center justify-end px-6 py-2 border-b border-border shrink-0">
          <ViewToggle />
        </div>

        {/* Project-scope awaiting banner — renders once regardless of track count */}
        {isProjectAwaiting && (
          <AwaitingBanner
            reason={awaitingReason}
            projectId={projectId}
            onResumed={refresh}
          />
        )}

        {/* Body */}
        {isGraph ? (
          <div className="flex-1 min-h-0 overflow-hidden">
            <GraphView projectId={projectId} />
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Sidebar */}
            <aside className="w-56 shrink-0 border-r border-border overflow-y-auto">
              <FocusSidebar projectId={projectId} />
            </aside>
            {/* Main panel */}
            <main className="flex-1 overflow-y-auto">
              <FocusPanel projectId={projectId} />
            </main>
          </div>
        )}
      </div>
    </ProjectContextProvider>
  );
}
