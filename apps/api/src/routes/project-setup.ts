/**
 * Project Setup & Abort Routes
 *
 * POST   /projects/:id/setup  — Initialize project with autopilot config
 * PATCH  /projects/:id/abort  — Request project abort
 * DELETE /projects/:id/abort  — Cancel abort request
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from '@brighttale/shared/types/database';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { assertProjectOwner } from '../lib/projects/ownership.js';
import { derivedFromStageResults, nextStageAfter } from '../lib/pipeline-state.js';
import { setupProjectSchema } from '@brighttale/shared/schemas/projectSetup';

export async function projectSetupRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /:id/setup — Initialize project with autopilot config
   */
  fastify.post('/:id/setup', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const userId = request.userId ?? '';
      const projectId = (request.params as { id: string }).id;

      // Verify project ownership
      await assertProjectOwner(projectId, userId, sb);

      // Validate request body
      const parsed = setupProjectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          data: null,
          error: {
            code: 'INVALID_BODY',
            message: parsed.error.message,
          },
        });
      }
      const body = parsed.data;

      // Check current pipeline state to ensure startStage is correct
      const { data: project } = await sb
        .from('projects')
        .select('pipeline_state_json')
        .eq('id', projectId)
        .maybeSingle();

      const completed = derivedFromStageResults(project?.pipeline_state_json);
      const expectedStart = nextStageAfter(completed);

      if (body.startStage !== expectedStart) {
        return reply.status(400).send({
          data: null,
          error: {
            code: 'STAGE_MISMATCH',
            message: `Cannot start at ${body.startStage}; project state requires ${expectedStart}`,
          },
        });
      }

      // Build update object
      const update: Database['public']['Tables']['projects']['Update'] = {
        mode: body.mode,
        autopilot_config_json: body.autopilotConfig,
        autopilot_template_id: body.templateId,
      };

      // Fresh setup (no completed stages) → clear pipeline_state_json. Resume → leave it.
      if (completed === null) {
        update.pipeline_state_json = null;
      }

      const { error } = await sb
        .from('projects')
        .update(update)
        .eq('id', projectId);

      if (error) throw error;

      return reply.send({
        data: { ok: true },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PATCH /:id/abort — Request project abort
   */
  fastify.patch('/:id/abort', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const userId = request.userId ?? '';
      const projectId = (request.params as { id: string }).id;

      // Verify project ownership
      await assertProjectOwner(projectId, userId, sb);

      const { error } = await sb
        .from('projects')
        .update({ abort_requested_at: new Date().toISOString() })
        .eq('id', projectId);

      if (error) throw error;

      return reply.send({
        data: { ok: true },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /:id/abort — Cancel abort request
   */
  fastify.delete('/:id/abort', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const userId = request.userId ?? '';
      const projectId = (request.params as { id: string }).id;

      // Verify project ownership
      await assertProjectOwner(projectId, userId, sb);

      const { error } = await sb
        .from('projects')
        .update({ abort_requested_at: null })
        .eq('id', projectId);

      if (error) throw error;

      return reply.send({
        data: { ok: true },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
