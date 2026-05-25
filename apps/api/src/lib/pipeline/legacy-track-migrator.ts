/**
 * Legacy Track Migrator (T2.1).
 *
 * Lazy, idempotent: called on every project page load via mirror-from-legacy.
 * Ensures a legacy single-medium project has at least one Track row so the
 * multi-track orchestrator can drive it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

 
type Sb = SupabaseClient<any, any, any>;

export type Medium = 'blog' | 'video' | 'shorts' | 'podcast';

export interface Track {
  id: string;
  projectId: string;
  medium: Medium;
  status: 'active' | 'aborted' | 'completed';
  paused: boolean;
  autopilotConfigJson: Record<string, unknown> | null;
}

interface TrackRow {
  id: string;
  project_id: string;
  medium: string;
  status: string;
  paused: boolean;
  autopilot_config_json: Record<string, unknown> | null;
}

function toTrack(row: TrackRow): Track {
  return {
    id: row.id,
    projectId: row.project_id,
    medium: row.medium as Medium,
    status: row.status as Track['status'],
    paused: row.paused,
    autopilotConfigJson: row.autopilot_config_json,
  };
}

export interface SplitResult {
  canonical: { id: string; status: string };
  production: { id: string; status: string };
}

export async function splitDraftStageRuns(
  sb: Sb,
  projectId: string,
): Promise<SplitResult | null> {
  const { data: drafts } = await sb
    .from('stage_runs')
    .select('id, project_id, stage, status, payload_ref, started_at, finished_at, attempt_no')
    .eq('project_id', projectId)
    .eq('stage', 'draft');

  const rows = (drafts ?? []) as Array<{
    id: string;
    payload_ref: { kind?: string; id?: string } | null;
    started_at: string | null;
    finished_at: string | null;
    attempt_no: number;
  }>;
  if (rows.length === 0) return null;

  const { data: existingSplits } = await sb
    .from('stage_runs')
    .select('id, stage')
    .eq('project_id', projectId)
    .in('stage', ['canonical', 'production']);
  const splitStages = new Set(
    ((existingSplits as Array<{ stage: string }> | null) ?? []).map((r) => r.stage),
  );
  if (splitStages.has('canonical') && splitStages.has('production')) return null;

  const draft = rows[0];
  const contentDraftId = draft.payload_ref?.kind === 'content_draft' ? draft.payload_ref.id : null;

  let canonicalCore: unknown = null;
  let draftJson: unknown = null;
  if (contentDraftId) {
    const { data: cd } = await sb
      .from('content_drafts')
      .select('canonical_core_json, draft_json')
      .eq('id', contentDraftId)
      .maybeSingle();
    canonicalCore = (cd as { canonical_core_json?: unknown } | null)?.canonical_core_json ?? null;
    draftJson = (cd as { draft_json?: unknown } | null)?.draft_json ?? null;
  }

  const { data: activeTracks } = await sb
    .from('tracks')
    .select('id, status')
    .eq('project_id', projectId)
    .eq('status', 'active');
  const trackId = (activeTracks as Array<{ id: string }> | null)?.[0]?.id ?? null;

  const canonicalStatus: 'completed' | 'queued' = canonicalCore != null ? 'completed' : 'queued';
  const productionStatus: 'completed' | 'queued' = draftJson != null ? 'completed' : 'queued';

  const now = new Date().toISOString();
  const payloadRef = contentDraftId ? { kind: 'content_draft', id: contentDraftId } : null;

  const { data: canonicalRow } = await sb
    .from('stage_runs')
    .insert({
      project_id: projectId,
      stage: 'canonical',
      status: canonicalStatus,
      payload_ref: payloadRef,
      track_id: null,
      publish_target_id: null,
      attempt_no: 1,
      started_at: canonicalStatus === 'completed' ? draft.started_at ?? now : null,
      finished_at: canonicalStatus === 'completed' ? draft.finished_at ?? now : null,
    })
    .select()
    .single();

  const { data: productionRow } = await sb
    .from('stage_runs')
    .insert({
      project_id: projectId,
      stage: 'production',
      status: productionStatus,
      payload_ref: payloadRef,
      track_id: trackId,
      publish_target_id: null,
      attempt_no: 1,
      started_at: productionStatus === 'completed' ? draft.started_at ?? now : null,
      finished_at: productionStatus === 'completed' ? draft.finished_at ?? now : null,
    })
    .select()
    .single();

  return {
    canonical: { id: (canonicalRow as { id: string }).id, status: canonicalStatus },
    production: { id: (productionRow as { id: string }).id, status: productionStatus },
  };
}

export async function ensureTracksForProject(sb: Sb, projectId: string): Promise<Track> {
  const { data: existing } = await sb
    .from('tracks')
    .select('id, project_id, medium, status, paused, autopilot_config_json')
    .eq('project_id', projectId);

  const rows = (existing ?? []) as TrackRow[];
  let trackRow: TrackRow
  if (rows.length > 0) {
    trackRow = rows[0]
  } else {
    const medium = await deriveMedium(sb, projectId);
    const { data: inserted } = await sb
      .from('tracks')
      .insert({ project_id: projectId, medium, status: 'active', paused: false })
      .select()
      .single();
    trackRow = inserted as TrackRow
  }

  // splitDraftStageRuns must run on every call, not only on track creation.
  // The legacy 'draft' stage_run can be materialized any time a downstream
  // engine signalStageComplete('draft') fires (e.g. CanonicalEngine after the
  // user approves the canonical core). If we skip the split when a track
  // already exists, those late-arriving draft rows never get migrated to
  // separate canonical+production stage_runs and the v2 sidebar stays at
  // status="none" for canonical forever.
  await splitDraftStageRuns(sb, projectId);

  // mirrorFromLegacy writes assets/preview/publish stage_runs without
  // track_id (it has no track context). The sidebar groups stage_runs by
  // (stage, track_id) — rows with track_id=null never match any track and
  // stay invisible. Sweep null-track_id rows onto the active track so they
  // surface as completed/in-progress in the per-track sidebar.
  await backfillTrackScopedStageRuns(sb, projectId, trackRow.id);

  return toTrack(trackRow);
}

const TRACK_SCOPED_STAGES = ['review', 'assets', 'preview', 'publish'] as const;

async function backfillTrackScopedStageRuns(
  sb: Sb,
  projectId: string,
  trackId: string,
): Promise<number> {
  const { data: rows } = await sb
    .from('stage_runs')
    .select('id')
    .eq('project_id', projectId)
    .is('track_id', null)
    .in('stage', TRACK_SCOPED_STAGES as unknown as string[]);
  const targets = (rows ?? []) as Array<{ id: string }>;
  if (targets.length === 0) return 0;
  let updated = 0;
  for (const r of targets) {
    const { error } = await (sb.from('stage_runs') as unknown as {
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: unknown }>;
      };
    })
      .update({ track_id: trackId })
      .eq('id', r.id);
    if (!error) updated += 1;
  }
  return updated;
}

async function deriveMedium(sb: Sb, projectId: string): Promise<Medium> {
  const { data: draft } = await sb
    .from('content_drafts')
    .select('type')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const draftType = (draft as { type?: string } | null)?.type;
  if (isMedium(draftType)) return draftType;

  const { data: project } = await sb
    .from('projects')
    .select('pipeline_state_json')
    .eq('id', projectId)
    .maybeSingle();
  const psj = (project as { pipeline_state_json?: Record<string, unknown> | null } | null)
    ?.pipeline_state_json;
  const psjType = psj && typeof psj === 'object' ? (psj.contentType as string | undefined) : undefined;
  if (isMedium(psjType)) return psjType;

  return 'blog';
}

function isMedium(v: unknown): v is Medium {
  return v === 'blog' || v === 'video' || v === 'shorts' || v === 'podcast';
}
