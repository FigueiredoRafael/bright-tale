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

  fastify.get<{ Params: { projectId: string } }>(
    '/:projectId/stages',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const { projectId } = request.params;
        const sb: Sb = createServiceClient();

        const { data, error } = await sb
          .from('stage_runs')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });
        if (error) throw error;

        // De-dupe: latest Stage Run per Stage by created_at (already sorted desc).
        const seen = new Set<string>();
        const latest: StageRun[] = [];
        for (const row of (data ?? []) as Record<string, unknown>[]) {
          const stage = row.stage as string;
          if (seen.has(stage)) continue;
          seen.add(stage);
          latest.push(rowToStageRun(row));
        }

        return reply.send({ data: { stageRuns: latest }, error: null });
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );
}
