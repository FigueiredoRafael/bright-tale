'use client';

/**
 * Step-by-step URL advance helpers.
 *
 * Supervised mode auto-routes via PipelineWorkspace's effect, which polls
 * `stage_runs` and walks the canonical sequence. Step-by-step mode has no
 * auto-advance: each engine's "Next" / "Done" button is the only signal to
 * move forward. These helpers mimic the same skip-aware walk so the user
 * lands on the next non-skipped stage.
 */

type StageRunStatus = string;
interface TrackStageRuns {
  production?: { status: StageRunStatus } | null;
  review?: { status: StageRunStatus } | null;
  assets?: { status: StageRunStatus } | null;
  preview?: { status: StageRunStatus } | null;
  publish?: { status: StageRunStatus } | null;
}
interface TrackSnapshot {
  id: string;
  status: string;
  paused: boolean;
  stageRuns?: TrackStageRuns;
}
interface StagesResponse {
  data: { tracks?: TrackSnapshot[] } | null;
}

const TRACK_SEQ = ['production', 'review', 'assets', 'preview', 'publish'] as const;
type TrackStage = (typeof TRACK_SEQ)[number];

export async function fetchTracks(projectId: string): Promise<TrackSnapshot[]> {
  try {
    const res = await fetch(`/api/projects/${projectId}/stages`);
    const json = (await res.json()) as StagesResponse;
    return json.data?.tracks ?? [];
  } catch {
    return [];
  }
}

export function firstActiveTrack(tracks: TrackSnapshot[]): TrackSnapshot | null {
  return tracks.find((t) => t.status === 'active' && !t.paused) ?? tracks[0] ?? null;
}

/**
 * Walk TRACK_SEQ forward from `currentStage`, skipping any stage_run that is
 * already terminal-skipped. Returns the next stage to land on, or 'publish'
 * as a safe fallback when nothing else is reachable.
 */
export function nextTrackStage(
  currentStage: TrackStage,
  track: TrackSnapshot | null,
): TrackStage {
  const idx = TRACK_SEQ.indexOf(currentStage);
  for (let i = idx + 1; i < TRACK_SEQ.length; i += 1) {
    const cand = TRACK_SEQ[i];
    const run = track?.stageRuns?.[cand];
    if (run?.status === 'skipped') continue;
    return cand;
  }
  return 'publish';
}

interface PushArgs {
  router: { push: (url: string) => void };
  pathname: string | null;
  searchParams: URLSearchParams | { toString(): string } | null;
  stage: string;
  trackId?: string | null;
}

export function pushStage({ router, pathname, searchParams, stage, trackId }: PushArgs): void {
  if (!pathname?.includes('/projects/')) return;
  const next = new URLSearchParams(searchParams?.toString() ?? '');
  next.set('stage', stage);
  if (trackId) next.set('track', trackId);
  else next.delete('track');
  next.delete('attempt');
  next.delete('target');
  router.push(`${pathname}?${next.toString()}`);
}
