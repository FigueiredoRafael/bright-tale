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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  research: { id: string; status?: string | null; created_at: string; completed_at?: string | null } | null;
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
  awaiting_reason: 'manual_paste' | 'manual_advance' | null;
  payload_ref: { kind: string; id: string } | null;
  attempt_no: number;
  started_at: string | null;
  finished_at: string | null;
}

export interface MirrorOutcome {
  kind: 'applied' | 'noop';
  mirrored: number;
  reason?: string;
}

export async function mirrorFromLegacy(sb: Sb, projectId: string): Promise<MirrorOutcome> {
  const { data: projectRow } = await sb
    .from('projects')
    .select('id, current_stage, mode, paused, pipeline_state_json')
    .eq('id', projectId)
    .maybeSingle();
  if (!projectRow) return { kind: 'noop', mirrored: 0, reason: 'project not found' };

  const psj = projectRow.pipeline_state_json as Record<string, unknown> | null | undefined;
  if (!psj || typeof psj !== 'object') {
    return { kind: 'noop', mirrored: 0, reason: 'pipeline_state_json is empty' };
  }

  const stageResults = (psj.stageResults ?? {}) as Record<string, unknown>;
  const completedStages = STAGES.filter((s) => !!stageResults[s]);
  if (completedStages.length === 0) {
    return { kind: 'noop', mirrored: 0, reason: 'no completed stages in pipeline_state_json' };
  }

  const payloads = await loadPayloadIndex(sb, projectId);
  const desired: StageRunInsert[] = [];

  // Highest-index completed stage. Anything BEFORE this index that the legacy
  // never persisted gets a `skipped` mirror row — otherwise the v2 rail would
  // show downstream stages as Done while gating stages read "Queued",
  // which is impossible in the strictly-linear orchestrator and confuses
  // the user.
  const rightmostCompletedIdx = Math.max(
    ...completedStages.map((s) => STAGES.indexOf(s)),
  );

  for (let i = 0; i <= rightmostCompletedIdx; i++) {
    const stage = STAGES[i];
    const wasCompleted = !!stageResults[stage];

    if (wasCompleted) {
      const payloadRef = resolvePayloadRef(stage, payloads);
      if (!payloadRef) continue;
      const ts = resolveTimestamps(stage, payloads);
      desired.push({
        project_id: projectId,
        stage,
        status: 'completed',
        awaiting_reason: null,
        payload_ref: payloadRef,
        attempt_no: 1,
        started_at: ts.startedAt,
        finished_at: ts.finishedAt,
      });
      continue;
    }

    // Gap-filler: legacy never tracked this stage but a downstream stage IS
    // completed, so logically this one was bypassed. Mark `skipped` with no
    // payload so the v2 view renders it as a terminal-skipped tile rather
    // than the default-Queued fallback.
    desired.push({
      project_id: projectId,
      stage,
      status: 'skipped',
      awaiting_reason: null,
      payload_ref: null,
      attempt_no: 1,
      started_at: null,
      finished_at: null,
    });
  }

  if (desired.length === 0) {
    return { kind: 'noop', mirrored: 0, reason: 'no derivable Stage Runs (payload rows missing?)' };
  }

  const mirrored = await upsertStageRuns(sb, projectId, desired);

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
      .select('id, status, created_at, completed_at')
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
      finishedAt: payloads.research.completed_at ?? payloads.research.created_at,
    };
  }
  if (payloads.draft) {
    return { startedAt: payloads.draft.created_at, finishedAt: payloads.draft.updated_at };
  }
  return { startedAt: null, finishedAt: null };
}

/**
 * Idempotent: a stage already in a terminal state on the DB is left untouched
 * so we never clobber a real dispatcher write. Otherwise we INSERT (new row)
 * or UPDATE (row exists but is queued/running) to the plan's terminal shape.
 */
async function upsertStageRuns(
  sb: Sb,
  projectId: string,
  desired: StageRunInsert[],
): Promise<number> {
  const { data: existingRows } = await sb
    .from('stage_runs')
    .select('id, stage, status')
    .eq('project_id', projectId);
  const existing = new Map<string, { id: string; status: string }>(
    (existingRows ?? []).map((r: Record<string, unknown>) => [
      r.stage as string,
      { id: r.id as string, status: r.status as string },
    ]),
  );

  let mirrored = 0;
  const now = new Date().toISOString();
  for (const sr of desired) {
    const found = existing.get(sr.stage);
    if (found && TERMINAL_STATUSES.includes(found.status)) {
      continue;
    }
    if (!found) {
      const { error } = await sb.from('stage_runs').insert({
        ...sr,
        created_at: now,
        updated_at: now,
      });
      if (!error) mirrored += 1;
      continue;
    }
    const { error } = await (sb.from('stage_runs') as unknown as {
      update: (row: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> };
    })
      .update({
        status: sr.status,
        awaiting_reason: sr.awaiting_reason,
        payload_ref: sr.payload_ref,
        started_at: sr.started_at,
        finished_at: sr.finished_at,
        updated_at: now,
      })
      .eq('id', found.id);
    if (!error) mirrored += 1;
  }
  return mirrored;
}
