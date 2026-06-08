/**
 * Runtime bridge from the legacy xstate orchestrator into `stage_runs`.
 *
 * The legacy pipeline persists its progress in `projects.pipeline_state_json`
 * (xstate context). The v2 supervised view reads only from `stage_runs`. So a
 * project that advances in legacy is invisible to v2.
 *
 * This module derives what `stage_runs` *should* exist for the project at this
 * moment from `pipeline_state_json` + payload index, then upserts them —
 * non-destructive: any row already in a terminal state is left alone.
 *
 * NOTE — the algorithm here mirrors the offline backfill planner at
 * `scripts/lib/backfill-stage-runs-plan.ts`. We don't import it across the
 * workspace boundary because tsx/esm doesn't resolve files outside the API
 * package the same way vitest does. Keep the two in sync if either changes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AwaitingReason } from './stage-run-writer.js';

 
type Sb = SupabaseClient<any, any, any>;

type Stage =
  | 'brainstorm'
  | 'research'
  | 'draft'
  | 'review'
  | 'assets'
  | 'preview'
  | 'publish';

const STAGES: readonly Stage[] = [
  'brainstorm',
  'research',
  'draft',
  'review',
  'assets',
  'preview',
  'publish',
];

const TERMINAL_STATUSES: ReadonlyArray<string> = [
  'completed',
  'failed',
  'aborted',
  'skipped',
];

interface PayloadIndex {
  brainstorm: { id: string; session_id: string | null; created_at: string } | null;
  research: { id: string; created_at: string; updated_at?: string | null } | null;
  draft: {
    id: string;
    status?: string | null;
    created_at: string;
    updated_at: string;
    published_url?: string | null;
  } | null;
}

interface StageRunInsert {
  project_id: string;
  stage: Stage;
  status: 'queued' | 'running' | 'awaiting_user' | 'completed' | 'skipped';
  awaiting_reason: AwaitingReason | null;
  payload_ref: { kind: string; id: string } | null;
  attempt_no: number;
  started_at: string | null;
  finished_at: string | null;
  outcome_json: Record<string, unknown> | null;
  /** Per-track scope. Null for shared stages (brainstorm, research, canonical)
   *  or for legacy single-track mirror calls without an explicit trackId. */
  track_id: string | null;
}

export interface MirrorOutcome {
  kind: 'applied' | 'noop';
  mirrored: number;
  reason?: string;
}

/** Stages that live under a Track in the v2 sidebar. When mirrorFromLegacy is
 *  called with a trackId, only these stages get scoped to that track — shared
 *  stages (brainstorm, research, canonical) always live at the project level. */
const PER_TRACK_STAGES: ReadonlySet<Stage> = new Set([
  'draft',
  'review',
  'assets',
  'preview',
  'publish',
]);

export async function mirrorFromLegacy(
  sb: Sb,
  projectId: string,
  opts?: { trackId?: string | null; stage?: string | null },
): Promise<MirrorOutcome> {
  const trackId = opts?.trackId ?? null;
  // When a specific stage is supplied (per-track engine signal), restrict the
  // mirror to JUST that stage. Without this, the loop walks every entry in
  // pipeline_state_json.stageResults — which is project-wide and last-wins —
  // and inserts blog's review/assets/preview/publish results into the video
  // track with the WRONG outcome_json (the user-reported bug: video Review/
  // Assets/Preview/Publish showing as ✓ before they were ever run).
  //
  // The mirror only knows the 7 legacy stages (brainstorm…publish). The newer
  // 'production' / 'canonical' stages are handled by other writers; when the
  // caller passes one of those, the per-track loop simply produces no match
  // and the mirror no-ops on those stages.
  const targetStage = ((): Stage | null => {
    const s = opts?.stage;
    if (!s) return null;
    return (STAGES as readonly string[]).includes(s) ? (s as Stage) : null;
  })();
  // Caller named a stage outside the mirror's 7-stage vocabulary
  // ('production' / 'canonical') — that signal is owned by another writer
  // (production-produce / canonical-dispatch), so the mirror should not run
  // at all. Otherwise the loop would happily fall through and mirror every
  // OTHER stage in stageResults, defeating the surgical scoping.
  if (opts?.stage && !targetStage) {
    return { kind: 'noop', mirrored: 0, reason: 'stage owned by another writer' };
  }
  const { data: projectRow } = await sb
    .from('projects')
    .select('id, current_stage, mode, paused, pipeline_state_json')
    .eq('id', projectId)
    .maybeSingle();
  if (!projectRow) return { kind: 'noop', mirrored: 0, reason: 'project not found' };

  const psj = (projectRow.pipeline_state_json as Record<string, unknown> | null | undefined) ?? {};
  const stageResults = (psj.stageResults ?? {}) as Record<string, unknown>;
  const completedStages = STAGES.filter((s) => !!stageResults[s]);

  const payloads = await loadPayloadIndex(sb, projectId);

  // Existing rows are the second input to the planner — pipeline_state_json
  // may be sparse (some completed stages tracked outside the orchestrator,
  // e.g. channel-level draft pages), so we also look at what `stage_runs`
  // itself already says is terminal.
  //
  // Order by `created_at desc` so the bucketing's "latest" handle reflects
  // the row the v2 stages endpoint shows (it dedupes to latest-per-stage).
  // If the latest is non-terminal we must update it even when an older
  // terminal row exists.
  //
  // Per-track scope: when trackId is supplied we only consider rows from THAT
  // track (plus shared stages with track_id=null). Without this, a sibling
  // track's terminal review row would shadow this track's nothing-yet state
  // and the mirror would skip the insert we actually need.
  let existingRowsQuery = sb
    .from('stage_runs')
    .select('id, stage, status, track_id, outcome_json, created_at, finished_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (trackId) {
    // PostgREST: rows where track_id matches OR is null (shared stages).
    existingRowsQuery = existingRowsQuery.or(`track_id.eq.${trackId},track_id.is.null`);
  }
  const { data: existingRows } = await existingRowsQuery;
  const existingByStage = bucketExistingRows(existingRows ?? [], trackId);

  const desired: StageRunInsert[] = [];

  const completedIndexes = completedStages.map((s) => STAGES.indexOf(s));
  const terminalDbIndexes: number[] = [];
  for (let i = 0; i < STAGES.length; i++) {
    if (existingByStage.get(STAGES[i])?.latest?.isTerminal) terminalDbIndexes.push(i);
  }
  const rightmostIdx = Math.max(
    -1,
    ...completedIndexes,
    ...terminalDbIndexes,
  );

  if (rightmostIdx < 0) {
    return { kind: 'noop', mirrored: 0, reason: 'no progress to mirror' };
  }

  for (let i = 0; i <= rightmostIdx; i++) {
    const stage = STAGES[i];
    // Surgical per-stage mirror: when the caller named a specific stage AND
    // a trackId, skip every other slot. The flat stageResults dict is
    // project-wide, so without this filter we'd mirror sibling tracks'
    // completions into this track (the original user-reported bug).
    // Legacy single-track callers (no trackId) keep the multi-stage loop.
    if (trackId && targetStage && stage !== targetStage) continue;
    const wasCompleted = !!stageResults[stage];
    const latest = existingByStage.get(stage)?.latest;

    // Enrichment-only path: latest row is already terminal but missing
    // outcome_json. The legacy approve flow (research, canonical, etc.)
    // marks stage_runs.status='completed' inline but never seeds
    // outcome_json — only pipeline_state_json.stageResults gets the rich
    // result. Downstream engines gate on stage_runs.outcome_json via
    // deriveStageResults, so without enrichment the next stage's
    // prerequisite check fails (e.g. CanonicalEngine sees research=null
    // and keeps generate disabled). When the legacy stageResults has
    // a payload for this stage, copy it onto the terminal row so the
    // v2 view sees the same result.
    if (latest?.isTerminal) {
      const legacyResult = stageResults[stage] as Record<string, unknown> | undefined;
      if (legacyResult && Object.keys(legacyResult).length > 0) {
        // For brainstorm the user-facing engine writes the authoritative
        // pick via signalStageComplete (regenerate + new idea selection),
        // so always overwrite the dispatcher's seeded outcome.
        // For research the dispatcher also writes outcome_json, so we only
        // overwrite when the legacy result is strictly NEWER than the
        // stage_run's finished_at — i.e. the user just clicked Continue
        // after handleRegenerate. A bare page-load with stale legacy state
        // must NOT clobber a fresh dispatcher write (e.g. after Restart step).
        let shouldOverwrite = stage === 'brainstorm';
        if (stage === 'research' && !shouldOverwrite) {
          const legacyCompletedAt =
            typeof legacyResult?.completedAt === 'string' ? legacyResult.completedAt : null;
          const stageFinishedAt = latest.finishedAt;
          if (legacyCompletedAt && stageFinishedAt && legacyCompletedAt > stageFinishedAt) {
            shouldOverwrite = true;
          }
        }
        if (shouldOverwrite || !latest.hasOutcome) {
          const { error } = await (sb.from('stage_runs') as unknown as {
            update: (row: Record<string, unknown>) => {
              eq: (col: string, val: string) => Promise<{ error: unknown }>;
            };
          })
            .update({ outcome_json: legacyResult, updated_at: new Date().toISOString() })
            .eq('id', latest.id);
          if (error) {
            console.warn(
              `[mirror] sync outcome_json for ${latest.id} (stage=${stage}) failed:`,
              error,
            );
          }
        }
      }
      continue;
    }

    if (wasCompleted) {
      // Per-track call: shared stages (brainstorm, research, canonical) are
      // owned by the no-track mirror path — skip them so we don't redundantly
      // re-check rows that aren't part of this track's slot.
      if (trackId && !PER_TRACK_STAGES.has(stage)) continue;
      const payloadRef = resolvePayloadRef(stage, payloads);
      if (!payloadRef) continue;
      const ts = resolveTimestamps(stage, payloads);
      const legacyResult = stageResults[stage] as Record<string, unknown> | undefined;
      desired.push({
        project_id: projectId,
        stage,
        status: 'completed',
        awaiting_reason: null,
        payload_ref: payloadRef,
        attempt_no: 1,
        started_at: ts.startedAt,
        finished_at: ts.finishedAt,
        outcome_json: legacyResult ?? null,
        track_id: PER_TRACK_STAGES.has(stage) ? trackId : null,
      });
      continue;
    }

    // Gap-filler: neither pipeline_state_json nor a real dispatcher tracked
    // this stage, but something downstream IS terminal — by linear-order
    // invariant this stage was effectively skipped. Mark it so the v2 view
    // renders it as a terminal-skipped tile rather than the default-Queued
    // fallback or a stale `queued` row from a stalled dispatch attempt.
    //
    // Per-track call: only gap-fill per-track stages — we'd corrupt the
    // shared brainstorm/research view if we wrote 'skipped' rows for them.
    if (trackId && !PER_TRACK_STAGES.has(stage)) continue;
    desired.push({
      project_id: projectId,
      stage,
      status: 'skipped',
      awaiting_reason: null,
      payload_ref: null,
      attempt_no: 1,
      started_at: null,
      finished_at: null,
      outcome_json: null,
      track_id: PER_TRACK_STAGES.has(stage) ? trackId : null,
    });
  }

  if (desired.length === 0) {
    return { kind: 'noop', mirrored: 0, reason: 'nothing new to mirror' };
  }

  const mirrored = await upsertStageRuns(sb, desired, existingByStage, projectId);

  if (mirrored > 0) {
    await (sb.from('projects') as unknown as {
      update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
    })
      .update({ migrated_to_stage_runs_at: new Date().toISOString() })
      .eq('id', projectId);
  }

  return { kind: 'applied', mirrored };
}

async function loadPayloadIndex(sb: Sb, projectId: string): Promise<PayloadIndex> {
  const [brainstorm, research, draft] = await Promise.all([
    sb
      .from('brainstorm_drafts')
      .select('id, session_id, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from('research_sessions')
      // `completed_at` does not exist on this table — Supabase rejects the
      // whole select with a 400, which used to silently set payloads.research
      // to null and prevent mirror from creating the research stage_run.
      // Use `updated_at` instead; mirror only needs a representative finish
      // timestamp and updated_at is what the legacy completion path stamps.
      .select('id, created_at, updated_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from('content_drafts')
      .select('id, status, created_at, updated_at, published_url')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    brainstorm: (brainstorm.data as PayloadIndex['brainstorm']) ?? null,
    research: (research.data as PayloadIndex['research']) ?? null,
    draft: (draft.data as PayloadIndex['draft']) ?? null,
  };
}

function resolvePayloadRef(stage: Stage, payloads: PayloadIndex): { kind: string; id: string } | null {
  switch (stage) {
    case 'brainstorm':
      return payloads.brainstorm?.id
        ? { kind: 'brainstorm_draft', id: payloads.brainstorm.id }
        : null;
    case 'research':
      return payloads.research?.id
        ? { kind: 'research_session', id: payloads.research.id }
        : null;
    case 'draft':
    case 'review':
    case 'assets':
    case 'preview':
    case 'publish':
      return payloads.draft?.id ? { kind: 'content_draft', id: payloads.draft.id } : null;
    default:
      return null;
  }
}

function resolveTimestamps(
  stage: Stage,
  payloads: PayloadIndex,
): { startedAt: string | null; finishedAt: string | null } {
  if (stage === 'brainstorm' && payloads.brainstorm) {
    return { startedAt: payloads.brainstorm.created_at, finishedAt: payloads.brainstorm.created_at };
  }
  if (stage === 'research' && payloads.research) {
    return {
      startedAt: payloads.research.created_at,
      finishedAt:
        (payloads.research as { updated_at?: string | null }).updated_at ??
        payloads.research.created_at,
    };
  }
  if (payloads.draft) {
    return { startedAt: payloads.draft.created_at, finishedAt: payloads.draft.updated_at };
  }
  return { startedAt: null, finishedAt: null };
}

type StageBucket = {
  /** Most-recent row per stage, regardless of status — the row the v2 view shows. */
  latest?: { id: string; status: string; isTerminal: boolean; hasOutcome: boolean; finishedAt: string | null };
  /** Most-recent non-terminal row, if any (DB guarantees ≤1). */
  nonTerminal?: { id: string };
};

/** `rows` MUST be ordered by created_at desc so the first one we see per stage is the latest.
 *  When `trackId` is provided, per-track stage rows are bucketed only when their
 *  `track_id` matches; shared-stage rows (track_id=null) are always bucketed. */
function bucketExistingRows(
  rows: unknown[],
  trackId: string | null,
): Map<string, StageBucket> {
  const byStage = new Map<string, StageBucket>();
  for (const r of rows as Record<string, unknown>[]) {
    const stage = r.stage as string;
    const rowTrackId = (r.track_id as string | null | undefined) ?? null;
    // Filter out sibling-track rows for per-track stages — a video-track call
    // must not see the blog-track's terminal review row, otherwise the mirror
    // assumes "already done" and skips its insert.
    if (trackId && PER_TRACK_STAGES.has(stage as Stage)) {
      if (rowTrackId !== trackId) continue;
    }
    const status = r.status as string;
    const id = r.id as string;
    const isTerminal = TERMINAL_STATUSES.includes(status);
    const outcome = r.outcome_json as Record<string, unknown> | null | undefined;
    const hasOutcome = outcome !== null && outcome !== undefined && Object.keys(outcome).length > 0;
    const finishedAt = typeof r.finished_at === 'string' ? (r.finished_at as string) : null;
    const bucket = byStage.get(stage) ?? {};
    if (!bucket.latest) {
      bucket.latest = { id, status, isTerminal, hasOutcome, finishedAt };
    }
    if (!isTerminal && !bucket.nonTerminal) {
      bucket.nonTerminal = { id };
    }
    byStage.set(stage, bucket);
  }
  return byStage;
}

/**
 * Idempotent. Per (project, stage) we may already have:
 *   • a terminal row (real dispatcher already wrote — leave alone, skip mirror)
 *   • a non-terminal row (queued/running/awaiting_user from a stale dispatch
 *     attempt — UPDATE it to the mirror's terminal shape so the v2 rail stops
 *     showing it as "Queued")
 *   • nothing → INSERT fresh.
 *
 * The DB has `one_non_terminal_per_stage` unique partial index, so at most one
 * non-terminal row exists per stage; updating it terminal is safe.
 */
async function upsertStageRuns(
  sb: Sb,
  desired: StageRunInsert[],
  byStage: Map<string, StageBucket>,
  projectId: string,
): Promise<number> {
  let mirrored = 0;
  const now = new Date().toISOString();
  for (const sr of desired) {
    const bucket = byStage.get(sr.stage);

    // The latest row is already terminal — view is correct, do nothing.
    if (bucket?.latest?.isTerminal) continue;

    // Defense against cross-process concurrent mirrors: re-check the latest
    // row right before INSERT/UPDATE. The bucket snapshot at function-start
    // can be stale by 10s/100s of ms if another process raced in and
    // inserted. Without this, both processes' buckets see "nothing terminal"
    // and both insert, producing duplicate completed rows (the exact bug
    // observed on 2026-05-14 for project 50cd4595).
    //
    // Per-track scope: the re-check must filter by track_id too, otherwise a
    // sibling track's terminal row blocks this track's insert.
    let freshQuery = sb
      .from('stage_runs')
      .select('id, status')
      .eq('project_id', projectId)
      .eq('stage', sr.stage);
    if (sr.track_id === null) {
      freshQuery = freshQuery.is('track_id', null);
    } else {
      freshQuery = freshQuery.eq('track_id', sr.track_id);
    }
    const { data: fresh } = await freshQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fresh && TERMINAL_STATUSES.includes((fresh as { status: string }).status)) {
      continue;
    }

    if (bucket?.nonTerminal) {
      const { error } = await (sb.from('stage_runs') as unknown as {
        update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> };
      })
        .update({
          status: sr.status,
          awaiting_reason: sr.awaiting_reason,
          payload_ref: sr.payload_ref,
          started_at: sr.started_at,
          finished_at: sr.finished_at,
          ...(sr.outcome_json !== null ? { outcome_json: sr.outcome_json } : {}),
          updated_at: now,
        })
        .eq('id', bucket.nonTerminal.id);
      if (error) {
        console.warn(
          `[mirror] update stage_runs ${bucket.nonTerminal.id} (stage=${sr.stage} → ${sr.status}) failed:`,
          error,
        );
      } else {
        mirrored += 1;
      }
      continue;
    }

    const { error } = await sb.from('stage_runs').insert({
      ...sr,
      created_at: now,
      updated_at: now,
    });
    if (error) {
      console.warn(`[mirror] insert stage_runs (stage=${sr.stage} → ${sr.status}) failed:`, error);
    } else {
      mirrored += 1;
    }
  }
  return mirrored;
}
