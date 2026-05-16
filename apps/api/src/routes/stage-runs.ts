/**
 * Stage Run intake + snapshot endpoints (Slice 2 / GitHub #10).
 *
 *   POST /projects/:projectId/stage-runs   — create a Stage Run via the
 *     Pipeline Orchestrator. The browser uses this in manual mode; the
 *     orchestrator uses it internally when advancing in autopilot.
 *
 *   GET  /projects/:projectId/stages       — snapshot of the latest Stage
 *     Run per Stage. Powers the `useProjectStream` hook before its Realtime
 *     subscription catches up (Slice 4).
 *
 * This file is a thin HTTP adapter — all real logic (predecessor checks,
 * UNIQUE concurrency, schema dispatch) lives in `lib/pipeline/orchestrator.ts`.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { assertProjectOwner } from '../lib/projects/ownership.js';
import { inngest } from '../jobs/client.js';
import {
  requestStageRun,
  resumeProject,
  StageNotMigratedError,
  StageInputValidationError,
  PredecessorNotDoneError,
  ConcurrentStageRunError,
} from '../lib/pipeline/orchestrator.js';
import { bulkAbort, markAborted } from '../lib/pipeline/stage-run-writer.js';
import { mirrorFromLegacy } from '../lib/pipeline/mirror-from-legacy.js';
import { ensureTracksForProject } from '../lib/pipeline/legacy-track-migrator.js';
import { STAGES, type Stage, type StageRun } from '@brighttale/shared/pipeline/inputs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

/**
 * Per-project in-flight mirror promises. Coalesces concurrent
 * `mirror-from-legacy` calls (e.g. page-load + orchestrator PATCH firing
 * within ms) so they share one execution + result instead of racing two
 * reads-then-inserts that produce duplicate completed rows.
 *
 * Survives only within a single Node process — sufficient for dev and any
 * single-instance deploy. Horizontal scale would need a Postgres advisory
 * lock instead.
 */
const mirrorInFlight = new Map<string, Promise<unknown>>();

const createStageRunBodySchema = z.object({
  stage: z.enum(STAGES),
  input: z.unknown(),
  /**
   * When true, mark the latest run of the requested stage AND every stage
   * after it as `aborted` before creating the new attempt. The advance
   * cascade then naturally rebuilds the downstream Stage Runs because the
   * idempotency guard only treats {queued,running,awaiting_user,completed,skipped}
   * as "still owns the slot" — aborted/failed are free to be re-attempted.
   */
  cascade: z.boolean().optional(),
  /**
   * T9.F156 — per-publisher retry. When provided (publish stage only), the
   * orchestrator scopes the concurrency check and attempt_no increment to
   * this specific publish target. Other targets' runs are untouched.
   * The DB partial unique index `one_non_terminal_per_stage` on
   * (project_id, stage, COALESCE(track_id,'00..0'), COALESCE(publish_target_id,'00..0'))
   * enforces per-target isolation at the DB level.
   */
  publish_target_id: z.string().optional(),
  /**
   * Multi-track dimension. Forwarded to the orchestrator so the Stage Run row
   * is scoped to the correct Track. Optional — omitting it targets the shared
   * (null) track slot, matching legacy single-track projects.
   */
  track_id: z.string().optional(),
});

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
    outcomeJson: row.outcome_json,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Map orchestrator domain errors to HTTP envelope responses.
 * Lets `sendError` handle anything else (Zod, ApiError, Supabase).
 */
function translateOrchestratorError(err: unknown): ApiError | null {
  if (err instanceof StageNotMigratedError) return new ApiError(400, err.message, 'STAGE_NOT_MIGRATED');
  if (err instanceof StageInputValidationError)
    return new ApiError(400, err.message, 'STAGE_INPUT_VALIDATION');
  if (err instanceof PredecessorNotDoneError) return new ApiError(409, err.message, 'PREDECESSOR_NOT_DONE');
  if (err instanceof ConcurrentStageRunError) return new ApiError(409, err.message, 'CONCURRENT_STAGE_RUN');
  return null;
}

export async function stageRunsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { projectId: string } }>(
    '/:projectId/stage-runs',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const { projectId } = request.params;
        const userId = (request as unknown as { userId?: string }).userId;
        if (!userId) throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');

        const body = createStageRunBodySchema.parse(request.body);

        if (body.cascade) {
          // Cascade re-run: supersede the requested stage's runs and every
          // stage downstream of it. Marking them aborted makes the
          // idempotency guard in advanceAfter skip them — the chain
          // rebuilds as each upstream stage completes. All write semantics
          // (status filter, error_message truncation, timestamps) live in
          // bulkAbort so this route stays a thin HTTP adapter.
          const sb: Sb = createServiceClient();
          await assertProjectOwner(projectId, userId, sb);

          const fromIdx = STAGES.indexOf(body.stage);
          const affected = STAGES.slice(fromIdx);
          try {
            await bulkAbort(
              sb,
              projectId,
              affected,
              `Superseded by cascade re-run from '${body.stage}'`,
            );
          } catch (err) {
            request.log.error({ err, projectId, fromStage: body.stage }, 'cascade abort failed');
            throw new ApiError(500, 'Failed to supersede downstream Stage Runs', 'CASCADE_FAILED');
          }
        }

        // Build optional multi-track dims. Only include when the client supplied
        // at least one dimension so backward-compat callers (no dims) still call
        // requestStageRun with exactly 4 args — matching the existing contract.
        const hasDims = body.publish_target_id !== undefined || body.track_id !== undefined;
        const dims = hasDims
          ? {
              publishTargetId: body.publish_target_id ?? null,
              trackId: body.track_id ?? null,
            }
          : undefined;

        const stageRun = dims
          ? await requestStageRun(projectId, body.stage, body.input, userId, dims)
          : await requestStageRun(projectId, body.stage, body.input, userId);

        return reply.status(201).send({ data: { stageRun }, error: null });
      } catch (err) {
        const translated = translateOrchestratorError(err);
        return sendError(reply, translated ?? err);
      }
    },
  );

  /**
   * POST /:projectId/stage-runs/:stageRunId/continue
   *
   * Flips an `awaiting_user` Stage Run into `queued` and emits
   * `pipeline/stage.requested` so the matching dispatcher picks it up.
   * Currently only Publish creates `awaiting_user(manual_advance)` rows
   * (per ADR-0004), but the endpoint is stage-agnostic so future
   * manual_paste flows can use it too.
   */
  fastify.post<{ Params: { projectId: string; stageRunId: string } }>(
    '/:projectId/stage-runs/:stageRunId/continue',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const { projectId, stageRunId } = request.params;
        const userId = (request as unknown as { userId?: string }).userId;
        if (!userId) throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');

        const sb = createServiceClient();
        await assertProjectOwner(projectId, userId, sb);

        const { data: stageRun } = await (sb.from('stage_runs') as unknown as {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
            };
          };
        })
          .select('id, project_id, stage, status, awaiting_reason')
          .eq('id', stageRunId)
          .maybeSingle();
        if (!stageRun) throw new ApiError(404, 'Stage Run not found', 'NOT_FOUND');
        if (stageRun.project_id !== projectId) {
          throw new ApiError(404, 'Stage Run does not belong to this project', 'NOT_FOUND');
        }
        if (stageRun.status !== 'awaiting_user') {
          throw new ApiError(
            409,
            `Stage Run is not awaiting_user (status=${stageRun.status})`,
            'INVALID_STATUS',
          );
        }

        const now = new Date().toISOString();
        await (sb.from('stage_runs') as unknown as {
          update: (row: Record<string, unknown>) => {
            eq: (col: string, val: string) => Promise<unknown>;
          };
        })
          .update({ status: 'queued', awaiting_reason: null, updated_at: now })
          .eq('id', stageRunId);

        await inngest.send({
          name: 'pipeline/stage.requested',
          data: {
            stageRunId,
            stage: stageRun.stage as Stage,
            projectId,
          },
        });

        return reply.send({
          data: { stageRunId, status: 'queued', stage: stageRun.stage },
          error: null,
        });
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  /**
   * POST /:projectId/resume
   *
   * Re-evaluates the pipeline and (re)starts the next pending Stage. Used by
   * the "Resume pipeline" UI affordance after an abort/failure when the user
   * wants autopilot to pick up again. Idempotent — a no-op when there is
   * nothing to resume.
   */
  fastify.post<{ Params: { projectId: string } }>(
    '/:projectId/resume',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const { projectId } = request.params;
        const userId = (request as unknown as { userId?: string }).userId;
        if (!userId) throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');

        const sb = createServiceClient();
        await assertProjectOwner(projectId, userId, sb);

        await resumeProject(projectId);
        return reply.send({ data: { ok: true }, error: null });
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  /**
   * PATCH /:projectId/stage-runs/:stageRunId
   *
   * Currently the only supported action is `abort`, which transitions a
   * non-terminal Stage Run to `aborted`. The dispatcher is responsible for
   * actually stopping any underlying work (jobs poll `stage_runs.status`).
   */
  fastify.patch<{ Params: { projectId: string; stageRunId: string } }>(
    '/:projectId/stage-runs/:stageRunId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const { projectId, stageRunId } = request.params;
        const userId = (request as unknown as { userId?: string }).userId;
        if (!userId) throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');

        const body = z.object({ action: z.literal('abort') }).parse(request.body);

        const sb = createServiceClient();
        await assertProjectOwner(projectId, userId, sb);

        const { data: stageRun } = await (sb.from('stage_runs') as unknown as {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
            };
          };
        })
          .select('id, project_id, stage, status')
          .eq('id', stageRunId)
          .maybeSingle();
        if (!stageRun) throw new ApiError(404, 'Stage Run not found', 'NOT_FOUND');
        if (stageRun.project_id !== projectId) {
          throw new ApiError(404, 'Stage Run does not belong to this project', 'NOT_FOUND');
        }
        const terminal = ['completed', 'failed', 'aborted', 'skipped'];
        if (terminal.includes(stageRun.status as string)) {
          throw new ApiError(
            409,
            `Stage Run is already terminal (status=${stageRun.status})`,
            'INVALID_STATUS',
          );
        }

        // Single seam: writer flips the row aborted, raises the legacy
        // `projects.abort_requested_at` flag, and emits the advance event.
        await markAborted(sb, stageRunId, {
          projectId,
          stage: stageRun.stage as string,
          raiseProjectAbort: true,
        });
        // Silence body unused-var lint
        void body;

        return reply.send({
          data: { stageRunId, status: 'aborted' },
          error: null,
        });
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  /**
   * POST /:projectId/stage-runs/mirror-from-legacy
   *
   * Bridge from the legacy xstate orchestrator → `stage_runs`. The legacy
   * `<PipelineOrchestrator />` persists progress in
   * `projects.pipeline_state_json`; the v2 supervised view reads only from
   * `stage_runs`. This endpoint upserts the missing `stage_runs` rows so the
   * two views stay coherent.
   *
   * Idempotent: rows already in a terminal state are left untouched (we never
   * clobber a real dispatcher write). The legacy orchestrator calls this on
   * every persist; cheap when there is nothing to mirror.
   */
  fastify.post<{ Params: { projectId: string } }>(
    '/:projectId/stage-runs/mirror-from-legacy',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const { projectId } = request.params;
        const userId = (request as unknown as { userId?: string }).userId;
        if (!userId) throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');

        const sb: Sb = createServiceClient();
        await assertProjectOwner(projectId, userId, sb);

        // T2.1: lazy multi-track migration. Idempotent — no-op once a Track
        // exists for the project. Must run before the legacy mirror so the
        // resulting canonical/production rows respect the new track_id FK.
        await ensureTracksForProject(sb, projectId);

        // Coalesce concurrent calls for the same project — see
        // `mirrorInFlight` comment above.
        const existing = mirrorInFlight.get(projectId);
        const promise = existing ?? mirrorFromLegacy(sb, projectId).finally(() => {
          mirrorInFlight.delete(projectId);
        });
        if (!existing) mirrorInFlight.set(projectId, promise);
        const outcome = await promise;
        return reply.send({ data: outcome, error: null });
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  /**
   * POST /:projectId/stage-runs/:stageRunId/manual-output
   *
   * For Stage Runs parked in `awaiting_user(manual_paste)` — the user
   * pastes the LLM output produced externally. The handler delegates to
   * the existing legacy `/api/brainstorm/sessions/:id/manual-output`
   * route (resolved via `payload_ref.id`), then transitions the Stage
   * Run to completed and emits `pipeline/stage.run.finished`.
   *
   * Stages other than brainstorm currently return 400 — they can join
   * as their dispatchers learn the manual-paste protocol.
   */
  fastify.post<{ Params: { projectId: string; stageRunId: string } }>(
    '/:projectId/stage-runs/:stageRunId/manual-output',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const { projectId, stageRunId } = request.params;
        const userId = (request as unknown as { userId?: string }).userId;
        if (!userId) throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');

        const body = z.object({ output: z.string().min(1) }).parse(request.body);

        const sb = createServiceClient();
        await assertProjectOwner(projectId, userId, sb);

        const { data: stageRun } = await (sb.from('stage_runs') as unknown as {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
            };
          };
        })
          .select('id, project_id, stage, status, awaiting_reason, payload_ref')
          .eq('id', stageRunId)
          .maybeSingle();
        if (!stageRun) throw new ApiError(404, 'Stage Run not found', 'NOT_FOUND');
        if (stageRun.project_id !== projectId) {
          throw new ApiError(404, 'Stage Run does not belong to this project', 'NOT_FOUND');
        }
        if (
          stageRun.status !== 'awaiting_user' ||
          stageRun.awaiting_reason !== 'manual_paste'
        ) {
          throw new ApiError(
            409,
            `Stage Run is not awaiting manual_paste (status=${stageRun.status}, awaiting_reason=${stageRun.awaiting_reason})`,
            'INVALID_STATUS',
          );
        }
        if (stageRun.stage !== 'brainstorm') {
          throw new ApiError(
            400,
            `manual-output is only wired for brainstorm at this slice (stage=${stageRun.stage})`,
            'STAGE_NOT_SUPPORTED',
          );
        }
        const ref = stageRun.payload_ref as { kind?: string; id?: string } | null;
        if (!ref || ref.kind !== 'brainstorm_session' || !ref.id) {
          throw new ApiError(
            500,
            'Stage Run has no brainstorm_session payload_ref to forward manual output to',
            'MISSING_PAYLOAD_REF',
          );
        }

        // Forward to the existing legacy endpoint. Internal authentication.
        const apiBase = process.env.API_URL ?? 'http://localhost:3001';
        const internalKey = process.env.INTERNAL_API_KEY;
        if (!internalKey) throw new ApiError(500, 'INTERNAL_API_KEY not set', 'CONFIG');

        const forwardRes = await fetch(`${apiBase}/brainstorm/sessions/${ref.id}/manual-output`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-key': internalKey,
            'x-user-id': userId,
          },
          body: JSON.stringify({ output: body.output }),
        });
        const forwardBody = (await forwardRes.json().catch(() => ({}))) as {
          data?: { draftIds?: string[] };
          error?: { message?: string; code?: string };
        };
        if (!forwardRes.ok || forwardBody?.error) {
          throw new ApiError(
            forwardRes.status || 502,
            forwardBody?.error?.message ?? 'Legacy manual-output failed',
            forwardBody?.error?.code ?? 'UPSTREAM_ERROR',
          );
        }

        const firstDraftId = forwardBody?.data?.draftIds?.[0] ?? null;
        const now = new Date().toISOString();
        await (sb.from('stage_runs') as unknown as {
          update: (row: Record<string, unknown>) => {
            eq: (col: string, val: string) => Promise<unknown>;
          };
        })
          .update({
            status: 'completed',
            awaiting_reason: null,
            payload_ref: firstDraftId
              ? { kind: 'brainstorm_draft', id: firstDraftId }
              : (stageRun.payload_ref ?? null),
            finished_at: now,
            updated_at: now,
          })
          .eq('id', stageRunId);

        await inngest.send({
          name: 'pipeline/stage.run.finished',
          data: { stageRunId, projectId },
        });

        return reply.send({
          data: { stageRunId, status: 'completed' },
          error: null,
        });
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  fastify.get<{ Params: { projectId: string } }>(
    '/:projectId/stages',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const { projectId } = request.params;
        const sb: Sb = createServiceClient();

        const [stageRunsRes, projectRes] = await Promise.all([
          sb
            .from('stage_runs')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false }),
          sb
            .from('projects')
            .select('mode, paused')
            .eq('id', projectId)
            .maybeSingle(),
        ]);
        if (stageRunsRes.error) throw stageRunsRes.error;

        // De-dupe: latest Stage Run per Stage by created_at (already sorted desc).
        const seen = new Set<string>();
        const latest: StageRun[] = [];
        for (const row of (stageRunsRes.data ?? []) as Record<string, unknown>[]) {
          const stage = row.stage as string;
          if (seen.has(stage)) continue;
          seen.add(stage);
          latest.push(rowToStageRun(row));
        }

        const projectRow = projectRes.data as { mode?: string | null; paused?: boolean | null } | null;
        return reply.send({
          data: {
            stageRuns: latest,
            project: {
              mode: projectRow?.mode ?? null,
              paused: Boolean(projectRow?.paused ?? false),
            },
          },
          error: null,
        });
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  /**
   * GET /:projectId/stage-runs/:stageRunId/payload
   *
   * Resolves the Stage Run's `payload_ref` to a normalized summary the UI can
   * render in the TerminalPanel. The body shape depends on `payload_ref.kind`.
   *
   *   brainstorm_draft  → { kind, ideas: [{id, title, isWinner}] }
   *   research_session  → { kind, cardCount }
   *   content_draft     → { kind, title, type, status }
   *   publish_record    → { kind, publishedUrl }
   *   <unknown>         → { kind, raw }
   */
  fastify.get<{ Params: { projectId: string; stageRunId: string } }>(
    '/:projectId/stage-runs/:stageRunId/payload',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const { projectId, stageRunId } = request.params;
        const userId = (request as unknown as { userId?: string }).userId;
        if (!userId) throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');

        const sb: Sb = createServiceClient();
        await assertProjectOwner(projectId, userId, sb);

        const { data: stageRun } = await sb
          .from('stage_runs')
          .select('id, project_id, stage, status, payload_ref')
          .eq('id', stageRunId)
          .maybeSingle();
        if (!stageRun) throw new ApiError(404, 'Stage Run not found', 'NOT_FOUND');
        if (stageRun.project_id !== projectId) {
          throw new ApiError(404, 'Stage Run does not belong to this project', 'NOT_FOUND');
        }

        const ref = stageRun.payload_ref as { kind?: string; id?: string; published_url?: string } | null;
        if (!ref?.kind || !ref.id) {
          return reply.send({ data: { payload: null }, error: null });
        }

        // Resolve channel id for engine deep-links. Falls back to null if the
        // project pre-dates Wave 1 backfill or the channel was deleted.
        const { data: projectRow } = await sb
          .from('projects')
          .select('channel_id')
          .eq('id', projectId)
          .maybeSingle();
        const channelId = (projectRow?.channel_id as string | null | undefined) ?? null;

        let payload: Record<string, unknown> = { kind: ref.kind };

        if (ref.kind === 'brainstorm_draft') {
          const { data: winner } = await sb
            .from('brainstorm_drafts')
            .select('id, title, session_id')
            .eq('id', ref.id)
            .maybeSingle();
          if (winner?.session_id) {
            const { data: siblings } = await sb
              .from('brainstorm_drafts')
              .select('id, title, verdict, core_tension, target_audience, discovery_data, position')
              .eq('session_id', winner.session_id)
              .order('position', { ascending: true });
            const winnerId = winner.id as string;
            payload = {
              kind: ref.kind,
              ideas:
                (siblings ?? []).map((s: Record<string, unknown>) => ({
                  id: s.id as string,
                  title: (s.title as string) ?? '(no title)',
                  isWinner: s.id === winnerId,
                  verdict: (s.verdict as string | null) ?? null,
                  coreTension: (s.core_tension as string | null) ?? null,
                  targetAudience: (s.target_audience as string | null) ?? null,
                  discoveryData: (s.discovery_data as string | null) ?? null,
                })),
              engineUrl: channelId
                ? `/channels/${channelId}/brainstorm/${winner.session_id}`
                : null,
            };
          } else {
            payload = {
              kind: ref.kind,
              ideas: [
                {
                  id: ref.id,
                  title: (winner?.title as string) ?? '(unknown idea)',
                  isWinner: true,
                  verdict: null,
                  coreTension: null,
                  targetAudience: null,
                  discoveryData: null,
                },
              ],
              engineUrl: null,
            };
          }
        } else if (ref.kind === 'research_session') {
          const { data: rs } = await sb
            .from('research_sessions')
            .select('id, cards_json, approved_cards_json, level')
            .eq('id', ref.id)
            .maybeSingle();
          const cards = (rs?.approved_cards_json ?? rs?.cards_json ?? {}) as Record<string, unknown>;
          const counts: Record<string, number> = {};
          let total = 0;
          for (const k of ['sources', 'statistics', 'expert_quotes', 'counterarguments'] as const) {
            const n = Array.isArray(cards[k]) ? (cards[k] as unknown[]).length : 0;
            counts[k] = n;
            total += n;
          }
          const sources = Array.isArray(cards.sources)
            ? (cards.sources as Array<Record<string, unknown>>).slice(0, 3).map((s) => ({
                title: (s.title as string) ?? (s.url as string) ?? '(no title)',
                url: (s.url as string) ?? null,
              }))
            : [];
          // Surface the validation + warning signals the agent emits so the
          // user can see *quality* of the research, not just card counts.
          const ideaValidation =
            cards.idea_validation && typeof cards.idea_validation === 'object'
              ? (cards.idea_validation as Record<string, unknown>)
              : null;
          const refinedAngle =
            cards.refined_angle && typeof cards.refined_angle === 'object'
              ? (cards.refined_angle as Record<string, unknown>)
              : null;
          const knowledgeGaps = Array.isArray(cards.knowledge_gaps)
            ? (cards.knowledge_gaps as unknown[]).filter((g) => typeof g === 'string').length
            : 0;
          payload = {
            kind: ref.kind,
            cardCount: total,
            counts,
            level: rs?.level ?? null,
            sources,
            confidenceScore: (ideaValidation?.confidence_score as number) ?? null,
            evidenceStrength: (ideaValidation?.evidence_strength as string) ?? null,
            coreClaimVerified: (ideaValidation?.core_claim_verified as boolean) ?? null,
            validationNotes: (ideaValidation?.validation_notes as string) ?? null,
            contentWarning: (cards.content_warning as string) ?? null,
            researchSummary: (cards.research_summary as string) ?? null,
            knowledgeGaps,
            refinedAngle: refinedAngle
              ? {
                  shouldPivot: (refinedAngle.should_pivot as boolean) ?? null,
                  recommendation: (refinedAngle.recommendation as string) ?? null,
                  updatedTitle: (refinedAngle.updated_title as string) ?? null,
                }
              : null,
            engineUrl: channelId ? `/channels/${channelId}/research/${ref.id}` : null,
          };
        } else if (ref.kind === 'content_draft') {
          const { data: draft } = await sb
            .from('content_drafts')
            .select(
              'id, title, type, status, published_url, draft_json, review_verdict, review_score, iteration_count, review_feedback_json',
            )
            .eq('id', ref.id)
            .maybeSingle();
          const draftJson = (draft?.draft_json ?? null) as Record<string, unknown> | null;
          // The produce agent saves the section breakdown under `outline`
          // (each item `{ h2, key_points, word_count_target }`). Older drafts
          // produced via the legacy pipeline used `sections` with
          // `{ section_title, ... }`. Accept either.
          const rawSections = Array.isArray(draftJson?.outline)
            ? (draftJson.outline as unknown[])
            : Array.isArray(draftJson?.sections)
              ? (draftJson.sections as unknown[])
              : [];
          const sections = rawSections.slice(0, 6).map((entry) => {
            const s = entry as Record<string, unknown>;
            return {
              title:
                (s.h2 as string) ?? (s.section_title as string) ?? (s.title as string) ?? '',
              wordCountTarget: (s.word_count_target as number) ?? null,
            };
          });
          const sectionCount = rawSections.length;
          const assetBriefs = (draftJson?.asset_briefs ?? null) as Record<string, unknown> | null;
          const assetSlots = assetBriefs && Array.isArray(assetBriefs.slots)
            ? (assetBriefs.slots as unknown[]).length
            : 0;
          // Surface the structured review feedback so the v2 supervisado can
          // render critical issues, strengths, etc. — not just verdict+score.
          // Agent-4 returns a layered shape:
          //   { overall_verdict, overall_notes,
          //     <type>_review: { strengths, issues, rubric_checks: [{ critical_issues, minor_issues, strengths }, ...] },
          //     ... other type-scoped reviews }
          // We aggregate across the three levels so the UI gets a flat list.
          const rfj = (draft?.review_feedback_json ?? null) as
            | Record<string, unknown>
            | null;
          const typeKey = `${(draft?.type as string) ?? 'blog'}_review`;
          const formatReview =
            rfj && typeof rfj[typeKey] === 'object' && !Array.isArray(rfj[typeKey])
              ? (rfj[typeKey] as Record<string, unknown>)
              : null;
          // rubric_checks can come as a single dict ({critical_issues,...}) or
          // a list of such dicts; accept either.
          const rubricChecks: Array<Record<string, unknown>> = Array.isArray(formatReview?.rubric_checks)
            ? (formatReview.rubric_checks as Array<Record<string, unknown>>)
            : formatReview?.rubric_checks && typeof formatReview.rubric_checks === 'object'
              ? [formatReview.rubric_checks as Record<string, unknown>]
              : [];
          const collect = (key: 'critical_issues' | 'minor_issues' | 'strengths'): string[] => {
            const out: string[] = [];
            const push = (raw: unknown) => {
              if (!Array.isArray(raw)) return;
              for (const v of raw) {
                if (typeof v === 'string') out.push(v);
                else if (v && typeof v === 'object') {
                  const r = v as Record<string, unknown>;
                  if (typeof r.text === 'string') out.push(r.text);
                  else if (typeof r.issue === 'string') out.push(r.issue);
                  else out.push(JSON.stringify(v));
                }
              }
            };
            push(rfj?.[key]);
            push(formatReview?.[key]);
            for (const rc of rubricChecks) push(rc?.[key]);
            return Array.from(new Set(out));
          };
          const reviewFeedback = rfj
            ? {
                overallVerdict:
                  (rfj.overall_verdict as string) ??
                  (rfj.verdict as string) ??
                  null,
                overallNotes:
                  (rfj.overall_notes as string) ??
                  (formatReview?.notes as string) ??
                  null,
                criticalIssues: collect('critical_issues').slice(0, 5),
                minorIssues: collect('minor_issues').slice(0, 5),
                strengths: collect('strengths').slice(0, 5),
                suggestedRevisions:
                  (rfj.suggested_revisions as string) ??
                  (formatReview?.suggested_revisions as string) ??
                  null,
              }
            : null;
          payload = {
            kind: ref.kind,
            // `content_drafts.title` is set by the pipeline-draft-dispatch
            // insert only when the user provided one upfront; autopilot
            // leaves it null and the produce agent writes the generated
            // title into draft_json.title instead.
            title:
              (draft?.title as string) ??
              (draftJson?.title as string) ??
              '(untitled)',
            type: (draft?.type as string) ?? null,
            status: (draft?.status as string) ?? null,
            publishedUrl: (draft?.published_url as string) ?? null,
            sectionCount,
            sections,
            reviewVerdict: (draft?.review_verdict as string) ?? null,
            reviewScore: (draft?.review_score as number) ?? null,
            iterationCount: (draft?.iteration_count as number) ?? null,
            assetSlots,
            reviewFeedback,
            engineUrl: channelId ? `/channels/${channelId}/drafts/${ref.id}` : null,
          };
        } else if (ref.kind === 'publish_record') {
          payload = {
            kind: ref.kind,
            publishedUrl: (ref.published_url as string) ?? null,
            wpPostId: ref.id,
            engineUrl: (ref.published_url as string) ?? null,
          };
        } else {
          payload = { kind: ref.kind, raw: ref };
        }

        return reply.send({ data: { payload }, error: null });
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );
}
