/**
 * Stages Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import {
  createStageSchema,
  createRevisionSchema,
  normalizeStageType,
  validStageTypes,
} from '@brighttale/shared/schemas/stages';

export async function stagesRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST / — Create a new stage or update existing one (increments version, archives old)
   */
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const data = createStageSchema.parse(request.body);

      // Normalize stage type to canonical name
      const stageType = normalizeStageType(data.stage_type);

      // Verify project exists
      const { data: project, error: projErr } = await sb
        .from('projects')
        .select('id')
        .eq('id', data.project_id)
        .maybeSingle();

      if (projErr) throw projErr;

      if (!project) {
        throw new ApiError(404, 'Project not found', 'PROJECT_NOT_FOUND');
      }

      // Check if stage already exists for this project and type
      let { data: existingStage, error: stageErr } = await sb
        .from('stages')
        .select('*, revisions(count)')
        .eq('project_id', data.project_id)
        .eq('stage_type', stageType)
        .maybeSingle();

      if (stageErr) throw stageErr;

      // Also check with original stage type if different
      if (!existingStage && stageType !== data.stage_type) {
        const { data: altStage, error: altErr } = await sb
          .from('stages')
          .select('*, revisions(count)')
          .eq('project_id', data.project_id)
          .eq('stage_type', data.stage_type)
          .maybeSingle();

        if (altErr) throw altErr;
        existingStage = altStage;
      }

      if (existingStage) {
        // Create revision for the old version
        const { error: revErr } = await sb.from('revisions').insert({
          stage_id: existingStage.id,
          yaml_artifact: existingStage.yaml_artifact,
          version: existingStage.version,
          created_by: 'system',
          change_notes: 'Auto-archived before update',
        });
        if (revErr) throw revErr;

        // Update stage with new artifact and increment version
        const { data: updatedStage, error: updateErr } = await sb
          .from('stages')
          .update({
            yaml_artifact: data.yaml_artifact,
            version: existingStage.version + 1,
          })
          .eq('id', existingStage.id)
          .select('*, revisions(count)')
          .single();

        if (updateErr) throw updateErr;

        return reply.send({
          data: {
            stage: updatedStage,
            message: 'Stage updated successfully',
            previous_version: existingStage.version,
          },
          error: null,
        });
      } else {
        // Create new stage with normalized stage type
        const { data: newStage, error: createErr } = await sb
          .from('stages')
          .insert({
            project_id: data.project_id,
            stage_type: stageType,
            yaml_artifact: data.yaml_artifact,
            version: 1,
          })
          .select('*, revisions(count)')
          .single();

        if (createErr) throw createErr;

        // Update project's current_stage with normalized stage type
        const { error: projUpdateErr } = await sb
          .from('projects')
          .update({ current_stage: stageType })
          .eq('id', data.project_id);

        if (projUpdateErr) throw projUpdateErr;

        return reply.status(201).send({
          data: {
            stage: newStage,
            message: 'Stage created successfully',
          },
          error: null,
        });
      }
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:projectId — Get all stages for a project
   */
  fastify.get('/:projectId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { projectId } = request.params as { projectId: string };

      // Verify project exists
      const { data: project, error: projErr } = await sb
        .from('projects')
        .select('id, current_stage')
        .eq('id', projectId)
        .maybeSingle();

      if (projErr) throw projErr;

      if (!project) {
        throw new ApiError(404, 'Project not found', 'PROJECT_NOT_FOUND');
      }

      // Get all stages for the project
      const { data: stages, error } = await sb
        .from('stages')
        .select('*, revisions(count)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return reply.send({
        data: {
          project_id: projectId,
          current_stage: (project as any).current_stage,
          stages,
          stages_count: (stages ?? []).length,
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:projectId/:stageType — Get a specific stage with revision history
   * Must be registered before /:projectId/:stageType/revisions to avoid conflicts
   */
  fastify.get(
    '/:projectId/:stageType',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const sb = createServiceClient();
        const { projectId, stageType } = request.params as {
          projectId: string;
          stageType: string;
        };

        // Check if valid stage type
        if (!validStageTypes.includes(stageType as any)) {
          throw new ApiError(
            400,
            `Invalid stage type. Must be one of: ${validStageTypes.join(', ')}`,
            'INVALID_STAGE_TYPE',
          );
        }

        // Normalize stage type for lookup
        const normalizedType = normalizeStageType(stageType);

        // Verify project exists
        const { data: project, error: projErr } = await sb
          .from('projects')
          .select('id, current_stage')
          .eq('id', projectId)
          .maybeSingle();

        if (projErr) throw projErr;

        if (!project) {
          throw new ApiError(404, 'Project not found', 'PROJECT_NOT_FOUND');
        }

        // Get the stage (try normalized first, then original)
        let { data: stage, error: stageErr } = await sb
          .from('stages')
          .select('*, revisions(*)')
          .eq('project_id', projectId)
          .eq('stage_type', normalizedType)
          .order('created_at', { referencedTable: 'revisions', ascending: false })
          .maybeSingle();

        if (stageErr) throw stageErr;

        // If not found with normalized, try original
        if (!stage && normalizedType !== stageType) {
          const { data: stageAlt, error: stageAltErr } = await sb
            .from('stages')
            .select('*, revisions(*)')
            .eq('project_id', projectId)
            .eq('stage_type', stageType)
            .order('created_at', { referencedTable: 'revisions', ascending: false })
            .maybeSingle();

          if (stageAltErr) throw stageAltErr;
          stage = stageAlt;
        }

        if (!stage) {
          throw new ApiError(
            404,
            `Stage '${stageType}' not found for this project`,
            'STAGE_NOT_FOUND',
          );
        }

        return reply.send({
          data: {
            stage,
            project_id: projectId,
            is_current_stage: (project as any).current_stage === stageType,
          },
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * PUT /:projectId/:stageType — Update a specific stage (same as POST / for existing stage)
   */
  fastify.put(
    '/:projectId/:stageType',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const sb = createServiceClient();
        const { projectId, stageType } = request.params as {
          projectId: string;
          stageType: string;
        };

        // Validate stage type
        if (!validStageTypes.includes(stageType as any)) {
          throw new ApiError(
            400,
            `Invalid stage type. Must be one of: ${validStageTypes.join(', ')}`,
            'INVALID_STAGE_TYPE',
          );
        }

        const data = createStageSchema.parse({
          ...(request.body as object),
          project_id: projectId,
          stage_type: stageType,
        });

        const normalizedType = normalizeStageType(stageType);

        // Verify project exists
        const { data: project, error: projErr } = await sb
          .from('projects')
          .select('id')
          .eq('id', projectId)
          .maybeSingle();

        if (projErr) throw projErr;

        if (!project) {
          throw new ApiError(404, 'Project not found', 'PROJECT_NOT_FOUND');
        }

        // Get the existing stage
        let { data: existingStage, error: stageErr } = await sb
          .from('stages')
          .select('*, revisions(count)')
          .eq('project_id', projectId)
          .eq('stage_type', normalizedType)
          .maybeSingle();

        if (stageErr) throw stageErr;

        if (!existingStage && normalizedType !== stageType) {
          const { data: altStage, error: altErr } = await sb
            .from('stages')
            .select('*, revisions(count)')
            .eq('project_id', projectId)
            .eq('stage_type', stageType)
            .maybeSingle();

          if (altErr) throw altErr;
          existingStage = altStage;
        }

        if (!existingStage) {
          throw new ApiError(
            404,
            `Stage '${stageType}' not found for this project`,
            'STAGE_NOT_FOUND',
          );
        }

        // Archive old version
        const { error: revErr } = await sb.from('revisions').insert({
          stage_id: existingStage.id,
          yaml_artifact: existingStage.yaml_artifact,
          version: existingStage.version,
          created_by: 'system',
          change_notes: 'Auto-archived before update',
        });
        if (revErr) throw revErr;

        // Update stage
        const { data: updatedStage, error: updateErr } = await sb
          .from('stages')
          .update({
            yaml_artifact: data.yaml_artifact,
            version: existingStage.version + 1,
          })
          .eq('id', existingStage.id)
          .select('*, revisions(count)')
          .single();

        if (updateErr) throw updateErr;

        return reply.send({
          data: {
            stage: updatedStage,
            message: 'Stage updated successfully',
            previous_version: existingStage.version,
          },
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * PATCH /:projectId/:stageType — Same as PUT
   */
  fastify.patch(
    '/:projectId/:stageType',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const sb = createServiceClient();
        const { projectId, stageType } = request.params as {
          projectId: string;
          stageType: string;
        };

        // Validate stage type
        if (!validStageTypes.includes(stageType as any)) {
          throw new ApiError(
            400,
            `Invalid stage type. Must be one of: ${validStageTypes.join(', ')}`,
            'INVALID_STAGE_TYPE',
          );
        }

        const data = createStageSchema.parse({
          ...(request.body as object),
          project_id: projectId,
          stage_type: stageType,
        });

        const normalizedType = normalizeStageType(stageType);

        // Verify project exists
        const { data: project, error: projErr } = await sb
          .from('projects')
          .select('id')
          .eq('id', projectId)
          .maybeSingle();

        if (projErr) throw projErr;

        if (!project) {
          throw new ApiError(404, 'Project not found', 'PROJECT_NOT_FOUND');
        }

        // Get the existing stage
        let { data: existingStage, error: stageErr } = await sb
          .from('stages')
          .select('*, revisions(count)')
          .eq('project_id', projectId)
          .eq('stage_type', normalizedType)
          .maybeSingle();

        if (stageErr) throw stageErr;

        if (!existingStage && normalizedType !== stageType) {
          const { data: altStage, error: altErr } = await sb
            .from('stages')
            .select('*, revisions(count)')
            .eq('project_id', projectId)
            .eq('stage_type', stageType)
            .maybeSingle();

          if (altErr) throw altErr;
          existingStage = altStage;
        }

        if (!existingStage) {
          throw new ApiError(
            404,
            `Stage '${stageType}' not found for this project`,
            'STAGE_NOT_FOUND',
          );
        }

        // Archive old version
        const { error: revErr } = await sb.from('revisions').insert({
          stage_id: existingStage.id,
          yaml_artifact: existingStage.yaml_artifact,
          version: existingStage.version,
          created_by: 'system',
          change_notes: 'Auto-archived before update',
        });
        if (revErr) throw revErr;

        // Update stage
        const { data: updatedStage, error: updateErr } = await sb
          .from('stages')
          .update({
            yaml_artifact: data.yaml_artifact,
            version: existingStage.version + 1,
          })
          .eq('id', existingStage.id)
          .select('*, revisions(count)')
          .single();

        if (updateErr) throw updateErr;

        return reply.send({
          data: {
            stage: updatedStage,
            message: 'Stage updated successfully',
            previous_version: existingStage.version,
          },
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * POST /:projectId/:stageType/revisions — Create a manual revision for a stage
   */
  fastify.post(
    '/:projectId/:stageType/revisions',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const sb = createServiceClient();
        const { projectId, stageType } = request.params as {
          projectId: string;
          stageType: string;
        };
        const data = createRevisionSchema.parse(request.body);

        // Validate stage type
        if (!validStageTypes.includes(stageType as any)) {
          throw new ApiError(
            400,
            `Invalid stage type. Must be one of: ${validStageTypes.join(', ')}`,
            'INVALID_STAGE_TYPE',
          );
        }

        // Verify project exists
        const { data: project, error: projErr } = await sb
          .from('projects')
          .select('id')
          .eq('id', projectId)
          .maybeSingle();

        if (projErr) throw projErr;

        if (!project) {
          throw new ApiError(404, 'Project not found', 'PROJECT_NOT_FOUND');
        }

        // Get the stage
        const { data: stage, error: stageErr } = await sb
          .from('stages')
          .select('*')
          .eq('project_id', projectId)
          .eq('stage_type', stageType)
          .maybeSingle();

        if (stageErr) throw stageErr;

        if (!stage) {
          throw new ApiError(
            404,
            `Stage '${stageType}' not found for this project`,
            'STAGE_NOT_FOUND',
          );
        }

        // Create revision with the current stage content
        const { data: revision, error: revErr } = await sb
          .from('revisions')
          .insert({
            stage_id: (stage as any).id,
            yaml_artifact: data.yaml_artifact,
            version: (stage as any).version,
            created_by: data.created_by,
            change_notes: data.change_notes,
          })
          .select()
          .single();

        if (revErr) throw revErr;

        // Get updated stage with revision count
        const { data: updatedStage, error: updErr } = await sb
          .from('stages')
          .select('*, revisions(count)')
          .eq('id', (stage as any).id)
          .single();

        if (updErr) throw updErr;

        return reply.status(201).send({
          data: {
            revision,
            stage: updatedStage,
            message: 'Revision created successfully',
          },
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  /**
   * GET /:projectId/:stageType/revisions — List all revisions for a stage
   */
  fastify.get(
    '/:projectId/:stageType/revisions',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const sb = createServiceClient();
        const { projectId, stageType } = request.params as {
          projectId: string;
          stageType: string;
        };

        // Validate stage type
        if (!validStageTypes.includes(stageType as any)) {
          throw new ApiError(
            400,
            `Invalid stage type. Must be one of: ${validStageTypes.join(', ')}`,
            'INVALID_STAGE_TYPE',
          );
        }

        // Verify project exists
        const { data: project, error: projErr } = await sb
          .from('projects')
          .select('id')
          .eq('id', projectId)
          .maybeSingle();

        if (projErr) throw projErr;

        if (!project) {
          throw new ApiError(404, 'Project not found', 'PROJECT_NOT_FOUND');
        }

        // Get the stage
        const { data: stage, error: stageErr } = await sb
          .from('stages')
          .select('id')
          .eq('project_id', projectId)
          .eq('stage_type', stageType)
          .maybeSingle();

        if (stageErr) throw stageErr;

        if (!stage) {
          throw new ApiError(
            404,
            `Stage '${stageType}' not found for this project`,
            'STAGE_NOT_FOUND',
          );
        }

        // Get revisions for the stage
        const { data: revisions, error } = await sb
          .from('revisions')
          .select('*')
          .eq('stage_id', (stage as any).id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        return reply.send({
          data: {
            stage_id: (stage as any).id,
            project_id: projectId,
            stage_type: stageType,
            revisions,
            revisions_count: (revisions ?? []).length,
          },
          error: null,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
