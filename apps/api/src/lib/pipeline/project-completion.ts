/**
 * project-completion — derives projects.status from track + publish state.
 *
 * Rule: projects.status = 'completed' iff every non-aborted track has a
 * stage_runs row with stage='publish', status='completed', for every active
 * publish_target configured for that project's channel.
 *
 * This pure-TS function mirrors the SQL trigger
 * `public.recompute_project_status(project_id text)` defined in
 * `supabase/migrations/20260516120000_project_completion_derived.sql`.
 * Both implementations must be kept in sync.
 *
 * Guards:
 *   - Zero non-aborted tracks → do NOT flip to 'completed' (vacuous truth guard).
 *   - If a non-aborted track lacks completion AND current status='completed'
 *     → revert to 'running' (handles newly added track case).
 *
 * Seam: called by the Stage Run Writer seam (stage-run-writer.ts) after every
 * publish-stage completion, and by the tracks write-seam after track creation.
 * Never opens content_drafts — honors ADR-0003.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

/**
 * Recompute and persist projects.status for `projectId`.
 *
 * Queries:
 *   1. Load the project (status + channel_id).
 *   2. Load all non-aborted tracks for the project.
 *   3. Load all active publish_targets for the channel.
 *   4. Load all completed publish stage_runs for the project.
 *   5. Check every (track, target) pair has a succeeded run.
 *   6. Write new status if it changed.
 */
export async function recomputeProjectStatus(projectId: string, sb: Sb): Promise<void> {
  // 1. Load project
  const { data: project, error: projectErr } = await sb
    .from('projects')
    .select('id, status, channel_id')
    .eq('id', projectId)
    .maybeSingle();
  if (projectErr || !project) return;

  const channelId = (project as { channel_id?: string | null }).channel_id ?? null;
  const currentStatus = (project as { status?: string }).status ?? 'running';

  // 2. Load all non-aborted tracks
  const { data: tracks, error: tracksErr } = await sb
    .from('tracks')
    .select('id, status')
    .eq('project_id', projectId)
    .neq('status', 'aborted');
  if (tracksErr) return;
  const nonAbortedTracks = (tracks ?? []) as Array<{ id: string; status: string }>;

  // Guard: no active (non-aborted) tracks → never auto-complete
  if (nonAbortedTracks.length === 0) return;

  // 3. Load all active publish_targets for this channel (channel-scoped only)
  //    If the project has no channel, there are no targets → can't complete.
  if (!channelId) return;

  const { data: targets, error: targetsErr } = await sb
    .from('publish_targets')
    .select('id')
    .eq('channel_id', channelId)
    .eq('is_active', true);
  if (targetsErr) return;
  const activeTargets = (targets ?? []) as Array<{ id: string }>;

  // If there are no active targets, the project cannot be considered complete.
  if (activeTargets.length === 0) return;

  // 4. Load all completed publish stage_runs for this project
  const { data: publishRuns, error: runsErr } = await sb
    .from('stage_runs')
    .select('track_id, publish_target_id')
    .eq('project_id', projectId)
    .eq('stage', 'publish')
    .eq('status', 'completed');
  if (runsErr) return;
  const completedRuns = (publishRuns ?? []) as Array<{
    track_id: string | null;
    publish_target_id: string | null;
  }>;

  // Build a Set of "track_id:target_id" pairs that are already published.
  const publishedPairs = new Set<string>(
    completedRuns
      .filter((r) => r.track_id !== null && r.publish_target_id !== null)
      .map((r) => `${r.track_id}:${r.publish_target_id}`),
  );

  // 5. Check every (track, target) pair
  const allComplete = nonAbortedTracks.every((track) =>
    activeTargets.every((target) => publishedPairs.has(`${track.id}:${target.id}`)),
  );

  // 6. Persist new status if changed
  let newStatus: string | null = null;
  if (allComplete && currentStatus !== 'completed') {
    newStatus = 'completed';
  } else if (!allComplete && currentStatus === 'completed') {
    newStatus = 'running';
  }

  if (newStatus !== null) {
    await sb.from('projects').update({ status: newStatus }).eq('id', projectId);
  }
}
