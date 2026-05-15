/**
 * T2.11 — abort cascade for a single Track.
 *
 * Aborting a Track flips any in-flight `stage_runs` for that `(project_id,
 * track_id)` pair to `status='aborted'`. Already-terminal runs
 * (`completed/failed/aborted/skipped`) are left alone — only the
 * orchestrator's "owning the slot" statuses need to be invalidated.
 *
 * Direct update is intentional here (mirrors the cascade exception in
 * `stage-run-writer.bulkAbort`): the orchestrator does not need a
 * per-row advance event for a user-requested abort. The Track row update
 * itself happens in the HTTP route — this helper only deals with the
 * stage_runs cascade.
 */
import { createServiceClient } from '../supabase/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

const IN_FLIGHT_STATUSES = ['queued', 'running', 'awaiting_user'] as const;
const ABORT_REASON = 'Track aborted by user';

export async function abortTrack(
  projectId: string,
  trackId: string,
): Promise<void> {
  const sb: Sb = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await sb
    .from('stage_runs')
    .update({
      status: 'aborted',
      error_message: ABORT_REASON,
      finished_at: now,
      updated_at: now,
    })
    .eq('project_id', projectId)
    .eq('track_id', trackId)
    .in('status', IN_FLIGHT_STATUSES);
  if (error) {
    throw new Error(
      `abortTrack project=${projectId} track=${trackId}: ${error.message}`,
    );
  }
}
