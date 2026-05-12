/**
 * Pipeline Orchestrator — the single authority over Stage Run lifecycle.
 *
 * Public interface (see CONTEXT.md and ADR-0001/0002/0003):
 *   - requestStageRun(projectId, stage, input, userId) → StageRun
 *   - advanceAfter(stageRunId) → void
 *
 * In Slice 1 the orchestrator writes `stage_runs` rows and decides what to
 * do next, but does NOT enqueue Inngest events — that wiring lands in Slice
 * 3 (#11). Only `brainstorm` is a migrated Stage; others are rejected with
 * STAGE_NOT_MIGRATED until their slices land.
 */
import {
  STAGE_INPUT_SCHEMAS,
  STAGES,
  type Stage,
  type StageRun,
  isStageMigrated,
} from '@brighttale/shared/pipeline/inputs';
import { createServiceClient } from '../supabase/index.js';
import { assertProjectOwner } from '../projects/ownership.js';
import { inngest } from '../../jobs/client.js';

// The `stage_runs` table and the `projects.mode`/`paused`/`autopilot_config`
// columns are introduced by the migration shipping with this slice. Until
// `npm run db:types` regenerates `Database`, we cast around it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

// ─── Errors ─────────────────────────────────────────────────────────────────

export class StageNotMigratedError extends Error {
  code = 'STAGE_NOT_MIGRATED';
  constructor(stage: Stage) {
    super(`Stage '${stage}' is not yet migrated to the Pipeline Orchestrator`);
  }
}

export class StageInputValidationError extends Error {
  code = 'STAGE_INPUT_VALIDATION';
  constructor(stage: Stage, details: string) {
    super(`Invalid input for stage '${stage}': ${details}`);
  }
}

export class PredecessorNotDoneError extends Error {
  code = 'PREDECESSOR_NOT_DONE';
  constructor(stage: Stage, predecessor: Stage) {
    super(`Predecessor stage '${predecessor}' must be completed before requesting '${stage}'`);
  }
}

export class ConcurrentStageRunError extends Error {
  code = 'CONCURRENT_STAGE_RUN';
  constructor(stage: Stage) {
    super(`A non-terminal Stage Run for '${stage}' already exists — abort it before requesting another`);
  }
}

// ─── Pure helpers (Stage graph) ──────────────────────────────────────────────

/** Returns the stage that must complete before `stage` can run, or null if first. */
export function predecessorOf(stage: Stage): Stage | null {
  const idx = STAGES.indexOf(stage);
  return idx <= 0 ? null : STAGES[idx - 1];
}

/** Returns the next stage after `stage`, or null if `stage` is the final. */
export function successorOf(stage: Stage): Stage | null {
  const idx = STAGES.indexOf(stage);
  if (idx < 0 || idx >= STAGES.length - 1) return null;
  return STAGES[idx + 1];
}

/**
 * Whether a `projects.mode` value should trigger auto-advance. Accepts
 * the new canonical `'autopilot'` plus legacy taxonomy values that the
 * Slice 13 backfill maps to autopilot (`'overview'`, `'supervised'`,
 * `null`). Explicit `'manual'` / `'step-by-step'` suppress advance.
 */
export function isAutopilotMode(mode: string | null | undefined): boolean {
  if (mode === 'manual' || mode === 'step-by-step') return false;
  return true;
}

/** Whether a Stage should be skipped per autopilot config. */
export function shouldSkip(
  stage: Stage,
  autopilotConfig: Record<string, Record<string, unknown>> | null | undefined,
): boolean {
  if (!autopilotConfig) return false;
  if (stage === 'review') {
    const maxIterations = autopilotConfig.review?.maxIterations;
    return typeof maxIterations === 'number' && maxIterations === 0;
  }
  if (stage === 'assets') {
    return autopilotConfig.assets?.mode === 'skip';
  }
  return false;
}

// ─── Row mapping ────────────────────────────────────────────────────────────

function rowToStageRun(row: Record<string, unknown>): StageRun {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    stage: row.stage as Stage,
    status: row.status as StageRun['status'],
    awaitingReason: (row.awaiting_reason ?? null) as StageRun['awaitingReason'],
    payloadRef: (row.payload_ref ?? null) as StageRun['payloadRef'],
    attemptNo: row.attempt_no as number,
    inputJson: row.input_json,
    errorMessage: (row.error_message ?? null) as string | null,
    startedAt: (row.started_at ?? null) as string | null,
    finishedAt: (row.finished_at ?? null) as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ─── DB helpers (typed around the not-yet-generated stage_runs table) ────────

async function predecessorIsDone(sb: Sb, projectId: string, predecessor: Stage): Promise<boolean> {
  const { data } = await sb
    .from('stage_runs')
    .select('id')
    .eq('project_id', projectId)
    .eq('stage', predecessor)
    .in('status', ['completed', 'skipped'])
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function findNonTerminal(sb: Sb, projectId: string, stage: Stage): Promise<boolean> {
  const { data } = await sb
    .from('stage_runs')
    .select('id')
    .eq('project_id', projectId)
    .eq('stage', stage)
    .in('status', ['queued', 'running', 'awaiting_user'])
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function latestAttemptNo(sb: Sb, projectId: string, stage: Stage): Promise<number> {
  const { data } = await sb
    .from('stage_runs')
    .select('attempt_no')
    .eq('project_id', projectId)
    .eq('stage', stage)
    .order('attempt_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.attempt_no as number | undefined) ?? 0;
}

async function insertStageRun(sb: Sb, row: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const { data, error } = await sb.from('stage_runs').insert(row).select().single();
  if (error) return null;
  return data as Record<string, unknown>;
}

/**
 * Clear the legacy `projects.abort_requested_at` flag so the next worker
 * doesn't bail on a stale abort signal from a previous attempt. Called
 * by every code path that starts a fresh Stage Run.
 */
async function clearAbortFlag(sb: Sb, projectId: string): Promise<void> {
  await sb.from('projects').update({ abort_requested_at: null }).eq('id', projectId);
}

// ─── Public: requestStageRun ────────────────────────────────────────────────

export async function requestStageRun(
  projectId: string,
  stage: Stage,
  input: unknown,
  userId: string,
): Promise<StageRun> {
  const sb: Sb = createServiceClient();

  // 1. Ownership
  await assertProjectOwner(projectId, userId, sb);

  // 2. Predecessor — universal, independent of whether THIS stage is migrated
  const predecessor = predecessorOf(stage);
  if (predecessor) {
    const done = await predecessorIsDone(sb, projectId, predecessor);
    if (!done) throw new PredecessorNotDoneError(stage, predecessor);
  }

  // 3. Migration check
  if (!isStageMigrated(stage)) throw new StageNotMigratedError(stage);

  // 4. Schema validation
  const parsed = STAGE_INPUT_SCHEMAS[stage].safeParse(input);
  if (!parsed.success) throw new StageInputValidationError(stage, parsed.error.message);

  // 5. Concurrent (UNIQUE) check — one non-terminal Stage Run per (project, stage)
  const conflict = await findNonTerminal(sb, projectId, stage);
  if (conflict) throw new ConcurrentStageRunError(stage);

  // 6. Determine attempt_no (1 if no prior attempt; previous + 1 otherwise)
  const attemptNo = (await latestAttemptNo(sb, projectId, stage)) + 1;

  // 7. Insert. Clear the abort flag first so the new attempt isn't killed
  // by a stale abort_requested_at left over from the prior run.
  await clearAbortFlag(sb, projectId);
  const inserted = await insertStageRun(sb, {
    project_id: projectId,
    stage,
    status: 'queued',
    input_json: parsed.data,
    attempt_no: attemptNo,
  });
  if (!inserted) throw new Error('Failed to insert stage_runs row');

  // 8. Emit pipeline/stage.requested so the matching dispatch function
  // (e.g. brainstorm) can pick it up. The dispatcher is responsible for
  // transitioning the Stage Run to `running` and executing the work.
  await inngest.send({
    name: 'pipeline/stage.requested',
    data: {
      stageRunId: inserted.id as string,
      stage,
      projectId,
    },
  });

  return rowToStageRun(inserted);
}

// ─── Public: resumeProject ──────────────────────────────────────────────────

/**
 * Re-evaluate the pipeline state and (re-)start whichever Stage is next.
 * Idempotent: a no-op when nothing should change. Called when the user
 * toggles a Project from manual → autopilot or unpauses, so the autopilot
 * picks up from wherever the pipeline left off.
 *
 * Walks the Stages in order:
 *   - if any Stage has a non-terminal run already in flight → nothing to do
 *   - the first Stage whose predecessor is `completed`/`skipped` and whose
 *     own latest run is either missing or `failed`/`aborted` is the
 *     resume point — insert a queued run and emit `pipeline/stage.requested`
 *   - if all Stages have `completed`/`skipped` runs → pipeline finished
 */
export async function resumeProject(projectId: string): Promise<void> {
  const sb: Sb = createServiceClient();

  const { data: project } = await sb
    .from('projects')
    .select('id, mode, paused, autopilot_config_json')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return;
  if (!isAutopilotMode(project.mode as string | null | undefined)) return;
  if (project.paused === true) return;

  const { data: allRuns } = await sb
    .from('stage_runs')
    .select('stage, status, attempt_no, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  // Latest run per stage (descending created_at → first hit is newest).
  const latestByStage = new Map<Stage, { status: string; attemptNo: number }>();
  for (const row of (allRuns ?? []) as Array<Record<string, unknown>>) {
    const stage = row.stage as Stage;
    if (latestByStage.has(stage)) continue;
    latestByStage.set(stage, {
      status: row.status as string,
      attemptNo: row.attempt_no as number,
    });
  }

  const autopilotConfig = project.autopilot_config_json as
    | Record<string, Record<string, unknown>>
    | null
    | undefined;

  let predecessor: Stage | null = null;
  for (const stage of STAGES) {
    const latest = latestByStage.get(stage) ?? null;

    // Already in flight here — nothing to do.
    if (
      latest &&
      (latest.status === 'queued' || latest.status === 'running' || latest.status === 'awaiting_user')
    ) {
      return;
    }

    // Predecessor must be done; otherwise we cannot start this stage.
    if (predecessor) {
      const predLatest = latestByStage.get(predecessor);
      if (!predLatest || (predLatest.status !== 'completed' && predLatest.status !== 'skipped')) {
        return; // pipeline stalled before this stage
      }
    }

    if (latest && (latest.status === 'completed' || latest.status === 'skipped')) {
      predecessor = stage;
      continue;
    }

    // Resume point: either no run yet, or last attempt was failed/aborted.
    const attemptNo = latest ? latest.attemptNo + 1 : 1;
    const nextRow: Record<string, unknown> = {
      project_id: projectId,
      stage,
      attempt_no: attemptNo,
    };
    if (stage === 'publish') {
      nextRow.status = 'awaiting_user';
      nextRow.awaiting_reason = 'manual_advance';
    } else {
      nextRow.status = 'queued';
      const stageDefaults = autopilotConfig?.[stage];
      if (stageDefaults) nextRow.input_json = stageDefaults;
    }

    await clearAbortFlag(sb, projectId);
    const inserted = await insertStageRun(sb, nextRow);
    if (inserted?.id && nextRow.status === 'queued') {
      await inngest.send({
        name: 'pipeline/stage.requested',
        data: {
          stageRunId: inserted.id as string,
          stage,
          projectId,
        },
      });
    }
    return;
  }
  // All stages have completed/skipped runs — pipeline is finished.
}

// ─── Public: advanceAfter ───────────────────────────────────────────────────

/**
 * React to a Stage Run reaching a terminal status. Decides whether to enqueue
 * the next Stage Run for the same Project, based on Mode/Paused and the
 * orchestrator's transition rules. No-op if not in autopilot, paused, or if
 * the finished run did not complete successfully.
 *
 * In Slice 1 this only writes the `stage_runs` row for the next Stage; the
 * Inngest enqueue is added in Slice 3 (#11).
 */
export async function advanceAfter(stageRunId: string): Promise<void> {
  const sb: Sb = createServiceClient();

  // 1. Load the finished Stage Run
  const { data: finished } = await sb
    .from('stage_runs')
    .select('id, project_id, stage, status')
    .eq('id', stageRunId)
    .maybeSingle();
  if (!finished) return;

  // 2. Load the Project to read Mode + Paused + autopilotConfig
  const { data: project } = await sb
    .from('projects')
    .select('id, mode, paused, autopilot_config_json')
    .eq('id', finished.project_id as string)
    .maybeSingle();
  if (!project) return;

  // 3. Gate: only autopilot + not paused continues.
  // Legacy mode values ('overview' | 'supervised' | null) map to autopilot;
  // 'step-by-step' | 'manual' suppress auto-advance. Coercion matches the
  // Slice 13 backfill rule so projects predating Slice 12 work transparently.
  if (!isAutopilotMode(project.mode as string | null | undefined)) return;
  if (project.paused === true) return;

  // 4. Only advance on successful terminal
  if (finished.status !== 'completed' && finished.status !== 'skipped') return;

  // 5. Determine next Stage
  const next = successorOf(finished.stage as Stage);
  if (!next) return;

  const projectId = finished.project_id as string;
  const autopilotConfig = project.autopilot_config_json as
    | Record<string, Record<string, unknown>>
    | null
    | undefined;

  // 6. Idempotency guard: if the next Stage already has a run that is either
  // in flight (queued/running/awaiting_user) or has resolved successfully
  // (completed/skipped), do nothing. This prevents duplicate Stage Runs when
  // `pipeline/stage.run.finished` is delivered more than once (Inngest replays
  // outside step.run, manual re-emits, retries, etc.). Only `failed`/`aborted`
  // prior runs are eligible for forward auto-advance — and even those are
  // owned by `resumeProject`, not `advanceAfter`.
  const { data: existingNext } = await sb
    .from('stage_runs')
    .select('id, status')
    .eq('project_id', projectId)
    .eq('stage', next)
    .in('status', ['queued', 'running', 'awaiting_user', 'completed', 'skipped'])
    .limit(1)
    .maybeSingle();
  if (existingNext) return;

  // 7. Skip-check: when autopilotConfig says skip this stage, insert a skipped
  // Stage Run and recurse into the following stage.
  if (shouldSkip(next, autopilotConfig)) {
    const inserted = await insertStageRun(sb, {
      project_id: projectId,
      stage: next,
      status: 'skipped',
      attempt_no: 1,
    });
    if (inserted?.id) await advanceAfter(inserted.id as string);
    return;
  }

  // 8. Insert the next Stage Run. Publish is a hard-coded special case:
  // always awaiting_user(manual_advance) regardless of Mode.
  const nextRow: Record<string, unknown> = {
    project_id: projectId,
    stage: next,
    attempt_no: 1,
  };
  if (next === 'publish') {
    nextRow.status = 'awaiting_user';
    nextRow.awaiting_reason = 'manual_advance';
  } else {
    nextRow.status = 'queued';
    // Carry forward autopilot-config defaults for this stage so the dispatcher
    // has something to work with (e.g. research.level). The dispatcher is free
    // to enrich further (resolving prior-stage winners, etc).
    const stageDefaults = autopilotConfig?.[next];
    if (stageDefaults) nextRow.input_json = stageDefaults;
  }

  await clearAbortFlag(sb, projectId);
  const inserted = await insertStageRun(sb, nextRow);

  // Only `queued` Stage Runs need a dispatcher event. `awaiting_user` (publish)
  // is parked for human confirmation; `skipped` rows are written above and
  // recurse without emitting.
  if (inserted?.id && nextRow.status === 'queued') {
    await inngest.send({
      name: 'pipeline/stage.requested',
      data: {
        stageRunId: inserted.id as string,
        stage: next,
        projectId,
      },
    });
  }
}
