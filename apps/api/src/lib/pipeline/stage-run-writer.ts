/**
 * Stage Run Writer — single seam for every write to the `stage_runs` table.
 *
 * Before this module existed, the same `queued → running → completed/failed`
 * transitions were copy-pasted across seven `pipeline-*-dispatch.ts` files,
 * the orchestrator, and the `/projects/:id/stage-runs` HTTP route. Each copy
 * could (and did) drift — different `updated_at` handling, different
 * `error_message` truncation, ad-hoc `inngest.send` placement after terminal
 * transitions. The drift was invisible until a Stage misbehaved.
 *
 * This module centralises:
 *   - Legal transitions (queued→running, running→completed/failed/etc.)
 *   - Standard column writes (`updated_at`, `started_at`, `finished_at`)
 *   - `error_message` truncation (500 chars)
 *   - Automatic `pipeline/stage.run.finished` emission on terminal states so
 *     `pipeline-advance` reacts without each dispatcher remembering.
 *   - Structured logs (stageRunId, projectId, transition) so debugging the
 *     pipeline becomes "tail one stream", not "grep across seven files".
 *
 * Callers SHOULD NOT call `sb.from('stage_runs').update(...)` directly.
 * The cascade-abort in the HTTP route (`stage-runs.ts`) is the one
 * intentional exception — it's a bulk operation explained in `bulkAbort()`.
 */
import { inngest } from '../../jobs/client.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export type StageRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'awaiting_user'
  | 'skipped';

export type AwaitingReason = 'manual_paste' | 'manual_advance' | 'manual_review';

export interface PayloadRef {
  kind: string;
  id: string;
}

const TERMINAL_STATUSES: ReadonlySet<StageRunStatus> = new Set([
  'completed',
  'failed',
  'aborted',
  'skipped',
]);

const ERROR_MESSAGE_MAX_LENGTH = 500;

interface TransitionContext {
  projectId: string;
  /** Stage name — used for logging only. Optional because some callers (cascade) don't have it handy. */
  stage?: string;
}

/**
 * Multi-track dimensions persisted on the Stage Run row.
 *
 * Both are `null` for shared stages (brainstorm/research/canonical) and the
 * pre-Track legacy rows. `trackId` becomes non-null at and after the per-Track
 * fan-out (production/review/assets/preview/publish). `publishTargetId` only
 * becomes non-null on the publish fan-out (one row per active target).
 *
 * The DB-side idempotency key (the `one_non_terminal_per_stage` partial unique
 * index) hashes `(project_id, stage, COALESCE(track_id, '00..0'),
 * COALESCE(publish_target_id, '00..0'))`, so omitting either dimension at
 * insert time is equivalent to writing the sentinel UUID — pre-multi-track
 * call sites keep working unchanged.
 */
export interface MultiTrackDims {
  trackId?: string | null;
  publishTargetId?: string | null;
}

interface BaseOptions extends TransitionContext, MultiTrackDims {
  /**
   * When true, suppress the `pipeline/stage.run.finished` event even if the
   * status is terminal. Used by callers that batch multiple transitions and
   * advance manually afterwards (e.g. orchestrator review-loop hand-off).
   */
  suppressAdvanceEvent?: boolean;
  /**
   * Per-stage opaque outcome blob persisted to `stage_runs.outcome_json`.
   * The orchestrator reads ONLY this field (and the Stage Run status) when
   * deciding what comes next. Each Stage owns the shape:
   *   review  → { verdict: 'approved'|'revision_required'|'rejected', feedbackJson, draftType }
   *   draft   → { revision: boolean, iterationCount?: number }
   *   assets  → { mode: 'auto_generate'|'manual_upload'|'briefs_only' }
   * Other Stages may omit. Replaces the prior leak where the orchestrator
   * had to dereference `payload_ref → content_drafts` to read the verdict.
   */
  outcome?: Record<string, unknown>;
}

/**
 * Apply optional multi-track dimensions to an update patch. We only write the
 * column when the caller supplied it (including explicit `null`) — undefined
 * leaves the existing row value untouched, which matters for the typical case
 * where the dimensions were already set at insert time.
 */
function applyDims(patch: Record<string, unknown>, opts: MultiTrackDims): void {
  if (Object.prototype.hasOwnProperty.call(opts, 'trackId')) {
    patch.track_id = opts.trackId ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(opts, 'publishTargetId')) {
    patch.publish_target_id = opts.publishTargetId ?? null;
  }
}

/**
 * Postgres unique_violation. Surfaced when an insert collides with the
 * `one_non_terminal_per_stage` partial unique index — i.e. another
 * non-terminal Stage Run already owns the same (project, stage, track,
 * publish_target) slot.
 */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Thrown by `insertRun` when the DB partial unique index rejects the row
 * because another non-terminal Stage Run already owns the slot. The
 * orchestrator (and HTTP handlers) catch this to translate into the
 * top-level `CONCURRENT_STAGE_RUN` error envelope without leaking the raw
 * Postgres error code to clients.
 */
export class StageRunUniquenessError extends Error {
  code = 'CONCURRENT_STAGE_RUN';
  constructor(
    public projectId: string,
    public stage: string,
    public trackId: string | null,
    public publishTargetId: string | null,
  ) {
    super(
      `Stage Run slot already taken: project=${projectId} stage=${stage} track=${trackId ?? 'null'} publishTarget=${publishTargetId ?? 'null'}`,
    );
  }
}

/**
 * Structured log line. Plain JSON to stdout so log shippers (Axiom, Pino,
 * Datadog) all pick it up uniformly. Kept terse — one line per transition.
 */
function logTransition(
  level: 'info' | 'warn' | 'error',
  message: string,
  fields: Record<string, unknown>,
): void {
  const line = { msg: message, level, scope: 'stage-run-writer', ...fields };
  if (level === 'error') console.error(JSON.stringify(line));
  else if (level === 'warn') console.warn(JSON.stringify(line));
  else console.info(JSON.stringify(line));
}

/**
 * Emit `pipeline/stage.run.finished` so `pipeline-advance` can react. Best-
 * effort: a failure here logs but does not throw — the row write already
 * succeeded, and Inngest dead-letter / observability will surface lost events.
 */
async function emitFinished(stageRunId: string, ctx: TransitionContext): Promise<void> {
  try {
    await inngest.send({
      name: 'pipeline/stage.run.finished',
      data: { stageRunId, projectId: ctx.projectId },
    });
  } catch (err) {
    logTransition('error', 'failed to emit pipeline/stage.run.finished', {
      stageRunId,
      projectId: ctx.projectId,
      stage: ctx.stage,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Insert a new Stage Run row with the multi-track dimensions baked into the
 * idempotency slot. Replaces the per-call-site `sb.from('stage_runs').insert`
 * scattered across the orchestrator so the partial-unique-index collision is
 * translated into a typed `StageRunUniquenessError` exactly once.
 *
 * Idempotency: the DB `one_non_terminal_per_stage` index uniques over
 * `(project_id, stage, COALESCE(track_id, '00..0'), COALESCE(publish_target_id, '00..0'))`
 * restricted to non-terminal statuses. Two concurrent inserts collapse to one
 * winner; the loser surfaces as `StageRunUniquenessError`.
 */
export async function insertRun(
  sb: Sb,
  opts: {
    projectId: string;
    stage: string;
    attemptNo: number;
    status: StageRunStatus;
    inputJson?: unknown;
    payloadRef?: PayloadRef;
    outcome?: Record<string, unknown>;
  } & MultiTrackDims,
): Promise<Record<string, unknown>> {
  const row: Record<string, unknown> = {
    project_id: opts.projectId,
    stage: opts.stage,
    status: opts.status,
    attempt_no: opts.attemptNo,
  };
  if (opts.inputJson !== undefined) row.input_json = opts.inputJson;
  if (opts.payloadRef) row.payload_ref = opts.payloadRef;
  if (opts.outcome) row.outcome_json = opts.outcome;
  applyDims(row, opts);
  // Always write the dimensions on insert (even as null) so the partial
  // unique index hashes the sentinel UUID — keeps the legacy single-Track
  // call sites colliding against each other exactly like before.
  if (!('track_id' in row)) row.track_id = null;
  if (!('publish_target_id' in row)) row.publish_target_id = null;

  const { data, error } = await sb.from('stage_runs').insert(row).select().single();
  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      logTransition('warn', 'insertRun rejected by uniqueness index', {
        projectId: opts.projectId,
        stage: opts.stage,
        trackId: row.track_id as string | null,
        publishTargetId: row.publish_target_id as string | null,
      });
      throw new StageRunUniquenessError(
        opts.projectId,
        opts.stage,
        (row.track_id as string | null) ?? null,
        (row.publish_target_id as string | null) ?? null,
      );
    }
    logTransition('error', 'insertRun failed', {
      projectId: opts.projectId,
      stage: opts.stage,
      err: error.message,
    });
    throw new Error(`insertRun project=${opts.projectId} stage=${opts.stage}: ${error.message}`);
  }
  logTransition('info', 'stage-run inserted', {
    stageRunId: (data as { id?: string })?.id,
    projectId: opts.projectId,
    stage: opts.stage,
    attemptNo: opts.attemptNo,
    status: opts.status,
    trackId: row.track_id as string | null,
    publishTargetId: row.publish_target_id as string | null,
  });
  return data as Record<string, unknown>;
}

/**
 * queued → running. Non-terminal — no advance event.
 *
 * `payloadRef` is optional: dispatchers that know the payload up front (e.g.
 * the draft-revision path that targets an existing content_draft) record it
 * here so a crash before completion leaves a traceable Stage Run.
 */
export async function markRunning(
  sb: Sb,
  stageRunId: string,
  ctx: TransitionContext & MultiTrackDims & { payloadRef?: PayloadRef },
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: 'running',
    started_at: now,
    updated_at: now,
  };
  if (ctx.payloadRef) patch.payload_ref = ctx.payloadRef;
  applyDims(patch, ctx);
  const { error } = await sb.from('stage_runs').update(patch).eq('id', stageRunId);
  if (error) {
    logTransition('error', 'markRunning failed', { stageRunId, ...ctx, err: error.message });
    throw new Error(`markRunning ${stageRunId}: ${error.message}`);
  }
  logTransition('info', 'stage-run → running', { stageRunId, ...ctx });
}

/** running → completed. Emits advance event unless suppressed. */
export async function markCompleted(
  sb: Sb,
  stageRunId: string,
  opts: BaseOptions & { payloadRef?: PayloadRef },
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: 'completed',
    finished_at: now,
    updated_at: now,
  };
  if (opts.payloadRef) patch.payload_ref = opts.payloadRef;
  if (opts.outcome) patch.outcome_json = opts.outcome;
  applyDims(patch, opts);
  const { error } = await sb.from('stage_runs').update(patch).eq('id', stageRunId);
  if (error) {
    logTransition('error', 'markCompleted failed', {
      stageRunId,
      projectId: opts.projectId,
      stage: opts.stage,
      err: error.message,
    });
    throw new Error(`markCompleted ${stageRunId}: ${error.message}`);
  }
  logTransition('info', 'stage-run → completed', {
    stageRunId,
    projectId: opts.projectId,
    stage: opts.stage,
    hasPayloadRef: !!opts.payloadRef,
  });
  if (!opts.suppressAdvanceEvent) {
    await emitFinished(stageRunId, { projectId: opts.projectId, stage: opts.stage });
  }
}

/** any → failed. Always emits advance event so the orchestrator can decide what to do. */
export async function markFailed(
  sb: Sb,
  stageRunId: string,
  opts: BaseOptions & { errorMessage: string; payloadRef?: PayloadRef },
): Promise<void> {
  const now = new Date().toISOString();
  const truncated = opts.errorMessage.slice(0, ERROR_MESSAGE_MAX_LENGTH);
  const patch: Record<string, unknown> = {
    status: 'failed',
    error_message: truncated,
    finished_at: now,
    updated_at: now,
  };
  if (opts.payloadRef) patch.payload_ref = opts.payloadRef;
  if (opts.outcome) patch.outcome_json = opts.outcome;
  applyDims(patch, opts);
  const { error } = await sb.from('stage_runs').update(patch).eq('id', stageRunId);
  if (error) {
    logTransition('error', 'markFailed write failed (double fault)', {
      stageRunId,
      projectId: opts.projectId,
      stage: opts.stage,
      err: error.message,
    });
    // Don't throw — the original failure is still the load-bearing signal.
    return;
  }
  logTransition('warn', 'stage-run → failed', {
    stageRunId,
    projectId: opts.projectId,
    stage: opts.stage,
    errorMessage: truncated,
  });
  if (!opts.suppressAdvanceEvent) {
    await emitFinished(stageRunId, { projectId: opts.projectId, stage: opts.stage });
  }
}

/**
 * running → awaiting_user. Non-terminal — no advance event. The orchestrator
 * resumes via `resumeProject` when the user clicks Continue / pastes output.
 *
 * `payloadRef` and `markStarted` are optional shortcuts so dispatchers that
 * park in awaiting_user immediately (e.g. assets manual_upload) can record
 * the linked payload and the started_at timestamp in a single call.
 */
export async function markAwaitingUser(
  sb: Sb,
  stageRunId: string,
  opts: BaseOptions & {
    awaitingReason: AwaitingReason;
    payloadRef?: PayloadRef;
    markStarted?: boolean;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: 'awaiting_user',
    awaiting_reason: opts.awaitingReason,
    updated_at: now,
  };
  if (opts.payloadRef) patch.payload_ref = opts.payloadRef;
  if (opts.outcome) patch.outcome_json = opts.outcome;
  if (opts.markStarted) patch.started_at = now;
  applyDims(patch, opts);
  const { error } = await sb.from('stage_runs').update(patch).eq('id', stageRunId);
  if (error) {
    logTransition('error', 'markAwaitingUser failed', {
      stageRunId,
      projectId: opts.projectId,
      stage: opts.stage,
      err: error.message,
    });
    throw new Error(`markAwaitingUser ${stageRunId}: ${error.message}`);
  }
  logTransition('info', 'stage-run → awaiting_user', {
    stageRunId,
    projectId: opts.projectId,
    stage: opts.stage,
    awaitingReason: opts.awaitingReason,
  });
}

/**
 * any → aborted (single row). Terminal. Emits advance event by default so
 * the orchestrator can decide what comes next.
 *
 * `raiseProjectAbort` (default true for callers that explicitly abort a live
 * Stage Run) ALSO sets `projects.abort_requested_at` so any long-running AI
 * worker bails on its next `assertNotAborted` checkpoint. Without this, the
 * Stage Run row reads `aborted` while the LLM keeps spending credits — the
 * exact split-brain that #7 of the architecture review flagged. The
 * orchestrator's `clearAbortFlag` resets it before each fresh insert.
 *
 * Cascade re-runs use `bulkAbort()` instead — it batches the aborts of many
 * rows in one UPDATE and suppresses the event because the caller is
 * immediately about to queue a fresh Stage Run.
 */
export async function markAborted(
  sb: Sb,
  stageRunId: string,
  opts: BaseOptions & { errorMessage?: string; raiseProjectAbort?: boolean },
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: 'aborted',
    finished_at: now,
    updated_at: now,
  };
  if (opts.errorMessage) patch.error_message = opts.errorMessage.slice(0, ERROR_MESSAGE_MAX_LENGTH);
  applyDims(patch, opts);
  const { error } = await sb.from('stage_runs').update(patch).eq('id', stageRunId);
  if (error) {
    logTransition('error', 'markAborted failed', {
      stageRunId,
      projectId: opts.projectId,
      stage: opts.stage,
      err: error.message,
    });
    throw new Error(`markAborted ${stageRunId}: ${error.message}`);
  }
  if (opts.raiseProjectAbort) {
    const { error: projectErr } = await sb
      .from('projects')
      .update({ abort_requested_at: now })
      .eq('id', opts.projectId);
    if (projectErr) {
      logTransition('warn', 'markAborted: raiseProjectAbort write failed', {
        stageRunId,
        projectId: opts.projectId,
        err: projectErr.message,
      });
    }
  }
  logTransition('info', 'stage-run → aborted', {
    stageRunId,
    projectId: opts.projectId,
    stage: opts.stage,
    raiseProjectAbort: !!opts.raiseProjectAbort,
  });
  if (!opts.suppressAdvanceEvent) {
    await emitFinished(stageRunId, { projectId: opts.projectId, stage: opts.stage });
  }
}

/**
 * Project-wide abort: mark every non-terminal Stage Run aborted AND raise
 * the legacy `projects.abort_requested_at` flag.
 *
 * This is the single seam for "the user wants the whole project to stop".
 * Without it, callers had to (a) UPDATE projects, (b) hope workers poll the
 * flag before the next checkpoint — meanwhile the stage_runs rows stayed in
 * `queued`/`running`/`awaiting_user` until eventual GC, lying about the
 * pipeline state in the UI + Realtime stream.
 *
 * No per-row advance event is emitted — a project-level abort is terminal
 * for the pipeline.
 */
export async function abortProject(
  sb: Sb,
  projectId: string,
  errorMessage = 'Project aborted by user',
): Promise<void> {
  const now = new Date().toISOString();
  // 1. Mark every non-terminal Stage Run aborted in one UPDATE.
  const { error: runsErr } = await sb
    .from('stage_runs')
    .update({
      status: 'aborted',
      error_message: errorMessage.slice(0, ERROR_MESSAGE_MAX_LENGTH),
      finished_at: now,
      updated_at: now,
    })
    .eq('project_id', projectId)
    .in('status', ['queued', 'running', 'awaiting_user']);
  if (runsErr) {
    logTransition('error', 'abortProject: stage_runs update failed', {
      projectId,
      err: runsErr.message,
    });
    throw new Error(`abortProject project=${projectId}: ${runsErr.message}`);
  }
  // 2. Raise the legacy project-wide flag so long-running workers bail on
  // their next assertNotAborted checkpoint.
  const { error: projErr } = await sb
    .from('projects')
    .update({ abort_requested_at: now })
    .eq('id', projectId);
  if (projErr) {
    logTransition('error', 'abortProject: projects update failed', {
      projectId,
      err: projErr.message,
    });
    throw new Error(`abortProject project=${projectId}: ${projErr.message}`);
  }
  logTransition('info', 'project aborted (all stage-runs aborted, legacy flag raised)', {
    projectId,
    reason: errorMessage,
  });
}

/**
 * Bulk abort every non-terminal-or-successful Stage Run for a project across
 * a set of stages. Used by the cascade re-run path in the HTTP route.
 *
 * No per-row advance event is emitted — the caller (HTTP route) creates a
 * fresh Stage Run immediately after, which fires its own `pipeline/stage.requested`.
 *
 * Status filter mirrors the orchestrator's idempotency guard: only
 * `queued/running/awaiting_user/completed/skipped` are "still owning the slot"
 * and need to be invalidated. `failed`/`aborted` rows are already free for
 * re-attempt and are left alone.
 */
export async function bulkAbort(
  sb: Sb,
  projectId: string,
  stages: ReadonlyArray<string>,
  errorMessage: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await sb
    .from('stage_runs')
    .update({
      status: 'aborted',
      error_message: errorMessage.slice(0, ERROR_MESSAGE_MAX_LENGTH),
      finished_at: now,
      updated_at: now,
    })
    .eq('project_id', projectId)
    .in('stage', stages)
    .in('status', ['queued', 'running', 'awaiting_user', 'completed', 'skipped']);
  if (error) {
    logTransition('error', 'bulkAbort failed', {
      projectId,
      stages: stages as unknown as string[],
      err: error.message,
    });
    throw new Error(`bulkAbort project=${projectId}: ${error.message}`);
  }
  logTransition('info', 'stage-runs bulk-aborted (cascade)', {
    projectId,
    stages: stages as unknown as string[],
    reason: errorMessage,
  });
}

/** Exported for tests + the rare caller that needs the predicate. */
export function isTerminal(status: StageRunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
