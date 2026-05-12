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
import { STAGES, type Stage, type StageRun } from '@brighttale/shared/pipeline/inputs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

const createStageRunBodySchema = z.object({
  stage: z.enum(STAGES),
  input: z.unknown(),
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
        const stageRun = await requestStageRun(projectId, body.stage, body.input, userId);

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

        const now = new Date().toISOString();
        await (sb.from('stage_runs') as unknown as {
          update: (row: Record<string, unknown>) => {
            eq: (col: string, val: string) => Promise<unknown>;
          };
        })
          .update({
            status: 'aborted',
            finished_at: now,
            updated_at: now,
          })
          .eq('id', stageRunId);

        await inngest.send({
          name: 'pipeline/stage.run.finished',
          data: { stageRunId, projectId },
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
              .select('id, title, position')
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
                })),
            };
          } else {
            payload = {
              kind: ref.kind,
              ideas: [{ id: ref.id, title: (winner?.title as string) ?? '(unknown idea)', isWinner: true }],
            };
          }
        } else if (ref.kind === 'research_session') {
          const { data: rs } = await sb
            .from('research_sessions')
            .select('id, cards_json, level')
            .eq('id', ref.id)
            .maybeSingle();
          const cards = (rs?.cards_json ?? {}) as Record<string, unknown>;
          const cardCount =
            (['sources', 'statistics', 'expert_quotes', 'counterarguments'] as const).reduce(
              (n, k) => n + (Array.isArray(cards[k]) ? (cards[k] as unknown[]).length : 0),
              0,
            );
          payload = { kind: ref.kind, cardCount, level: rs?.level ?? null };
        } else if (ref.kind === 'content_draft') {
          const { data: draft } = await sb
            .from('content_drafts')
            .select('id, title, type, status, published_url')
            .eq('id', ref.id)
            .maybeSingle();
          payload = {
            kind: ref.kind,
            title: (draft?.title as string) ?? '(untitled)',
            type: (draft?.type as string) ?? null,
            status: (draft?.status as string) ?? null,
            publishedUrl: (draft?.published_url as string) ?? null,
          };
        } else if (ref.kind === 'publish_record') {
          payload = {
            kind: ref.kind,
            publishedUrl: (ref.published_url as string) ?? null,
            wpPostId: ref.id,
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
