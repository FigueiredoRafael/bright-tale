/**
 * Projects Fastify Route Plugin
 * Migrated from Next.js App Router route handlers
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { createServiceClient } from '../lib/supabase/index.js';
import { sendError } from '../lib/api/fastify-errors.js';
import { ApiError } from '../lib/api/errors.js';
import { createKey, getKeyByToken, consumeKey } from '../lib/idempotency.js';
import { ENABLE_BULK_LIMITS, MAX_BULK_CREATE } from '../lib/config.js';
import { createProjectsFromDiscovery } from '../lib/queries/discovery.js';
import { assertProjectOwner } from '../lib/projects/ownership.js';
import { buildGraph } from '../lib/pipeline/graph-builder.js';
import type { RunNode } from '../lib/pipeline/graph-builder.js';
import type { Track } from '../lib/pipeline/fan-out-planner.js';
import type { PublishTarget } from '../lib/pipeline/publish-target-resolver.js';
import {
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
  bulkOperationSchema,
  markWinnerSchema,
} from '@brighttale/shared/schemas/projects';
import type { MediaConfig } from '@brighttale/shared/schemas/projects';
import { bulkCreateSchema } from '@brighttale/shared/schemas/discovery';
import type { Json } from '@brighttale/shared/types/database';
import type { Medium } from '@brighttale/shared/pipeline/inputs';
import { isAutopilotMode, resumeProject } from '../lib/pipeline/orchestrator.js';

// ─── Track shape returned from the DB ────────────────────────────────────────
interface TrackRow {
  id: string;
  project_id: string;
  medium: Medium;
  status: 'active' | 'aborted' | 'completed';
  paused: boolean;
  autopilot_config_json: unknown;
  created_at: string;
  updated_at: string;
}

function rowToTrack(row: TrackRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    medium: row.medium,
    status: row.status,
    paused: Boolean(row.paused),
    autopilotConfigJson: row.autopilot_config_json ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Insert one track per medium under projectId.
 * Uses a compensating delete on the project if any track insert fails
 * (Supabase JS client does not expose true transactions).
 *
 * Returns the inserted track objects or throws ApiError.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertTracksForProject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  projectId: string,
  media: Medium[],
  mediaConfig: Record<string, MediaConfig> | undefined,
): Promise<ReturnType<typeof rowToTrack>[]> {
  const tracks: ReturnType<typeof rowToTrack>[] = [];

  for (const medium of media) {
    const config = mediaConfig?.[medium];
    const { data: inserted, error: insertErr } = await sb
      .from('tracks')
      .insert({
        project_id: projectId,
        medium,
        autopilot_config_json: (config?.autopilotConfigJson as Json | undefined) ?? null,
      })
      .select('*')
      .single();

    if (insertErr ?? !inserted) {
      // Compensating rollback: delete the project (cascades to any tracks
      // already inserted since tracks.project_id has ON DELETE CASCADE).
      await sb.from('projects').delete().eq('id', projectId);
      throw new ApiError(500, 'Failed to create track', 'TRACK_INSERT_FAILED');
    }

    tracks.push(rowToTrack(inserted as TrackRow));
  }

  return tracks;
}

export async function projectsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST / — Create new project
   */
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const data = createProjectSchema.parse(request.body);

      // If research_id is provided, verify it exists
      if (data.research_id) {
        const { data: research, error: resErr } = await sb
          .from('research_archives')
          .select('id, projects_count')
          .eq('id', data.research_id)
          .maybeSingle();

        if (resErr) throw resErr;

        if (!research) {
          return reply.status(404).send({
            data: {
              error: {
                message: 'Research not found',
                code: 'RESEARCH_NOT_FOUND',
              },
            },
            error: null,
          });
        }

        // Increment projects_count for the research
        await sb
          .from('research_archives')
          .update({ projects_count: (research.projects_count ?? 0) + 1 })
          .eq('id', data.research_id);
      }

      const { data: project, error } = await sb
        .from('projects')
        .insert({
          title: data.title,
          research_id: data.research_id,
          current_stage: data.current_stage,
          mode: data.mode ?? 'step-by-step',
          status: data.status,
          winner: data.winner,
          user_id: request.userId ?? null,
          channel_id: data.channelId ?? null,
          autopilot_config_json: (data.autopilotConfigJson as Json | undefined) ?? null,
        })
        .select('*, research:research_archives!research_id(id, title, theme), stages(count)')
        .single();

      if (error) throw error;

      // If seed_idea_id is provided, pre-complete the brainstorm stage with the
      // selected idea so the orchestrator jumps straight to research.
      if (data.seed_idea_id && project) {
        const { data: idea } = await sb
          .from('idea_archives')
          .select('id, title, verdict, core_tension, brainstorm_session_id')
          .eq('id', data.seed_idea_id)
          .maybeSingle();

        if (idea) {
          const completedAt = new Date().toISOString();
          await Promise.all([
            sb
              .from('projects')
              .update({
                current_stage: 'research',
                pipeline_state_json: {
                  mode: 'step-by-step',
                  currentStage: 'research',
                  stageResults: {
                    brainstorm: {
                      ideaId: idea.id,
                      ideaTitle: idea.title,
                      ideaVerdict: idea.verdict,
                      ideaCoreTension: idea.core_tension ?? '',
                      brainstormSessionId: idea.brainstorm_session_id ?? undefined,
                      completedAt,
                    },
                  },
                  autoConfig: {
                    maxReviewIterations: 5,
                    targetReviewScore: 90,
                    pauseBeforePublish: true,
                  },
                },
              })
              .eq('id', project.id),
            // Back-ref so the idea detail page can show "Go to Project" and
            // avoid creating duplicate projects from the same idea.
            sb
              .from('idea_archives')
              .update({ project_id: project.id })
              .eq('id', data.seed_idea_id),
          ]);
        }
      }

      // T2.14: Insert one track per medium. Defaults to ['blog'] for backward compat.
      const media: Medium[] = (data.media as Medium[] | undefined) ?? ['blog'];
      const tracks = await insertTracksForProject(sb, project.id, media, data.mediaConfig as Record<string, MediaConfig> | undefined);

      return reply.status(201).send({ data: { ...project, tracks }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET / — List projects with optional filters
   */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const url = new URL(request.url, 'http://localhost');
      const params = listProjectsQuerySchema.parse(Object.fromEntries(url.searchParams));

      const page = params.page || 1;
      const limit = params.limit || 20;
      const sortField = params.sort || 'created_at';
      const sortOrder = params.order || 'desc';

      let countQuery = sb.from('projects').select('*', { count: 'exact', head: true });
      let dataQuery = sb
        .from('projects')
        .select('*, research:research_archives!research_id(id, title, theme), stages(count)');

      // Filter by user_id when present
      if (request.userId) {
        countQuery = countQuery.eq('user_id', request.userId);
        dataQuery = dataQuery.eq('user_id', request.userId);
      }

      if (params.status) {
        countQuery = countQuery.eq('status', params.status);
        dataQuery = dataQuery.eq('status', params.status);
      }

      if (params.current_stage) {
        countQuery = countQuery.eq('current_stage', params.current_stage);
        dataQuery = dataQuery.eq('current_stage', params.current_stage);
      }

      if (params.winner !== undefined) {
        countQuery = countQuery.eq('winner', params.winner);
        dataQuery = dataQuery.eq('winner', params.winner);
      }

      if (params.research_id) {
        countQuery = countQuery.eq('research_id', params.research_id);
        dataQuery = dataQuery.eq('research_id', params.research_id);
      }

      if (params.search) {
        countQuery = countQuery.ilike('title', `%${params.search}%`);
        dataQuery = dataQuery.ilike('title', `%${params.search}%`);
      }

      const [{ count: total, error: countErr }, { data: projects, error: dataErr }] =
        await Promise.all([
          countQuery,
          dataQuery
            .order(sortField, { ascending: sortOrder === 'asc' })
            .range((page - 1) * limit, page * limit - 1),
        ]);

      if (countErr) throw countErr;
      if (dataErr) throw dataErr;

      reply.header('Cache-Control', 'private, max-age=60');
      return reply.send({
        data: {
          projects,
          pagination: {
            page,
            limit,
            total: total ?? 0,
            totalPages: Math.ceil((total ?? 0) / limit),
          },
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id — Get project details
   */
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      const { data: project, error } = await sb
        .from('projects')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!project) {
        throw new ApiError(404, 'Project not found', 'NOT_FOUND');
      }

      return reply.send({ data: project, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PUT /:id — Update project
   */
  fastify.put('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = updateProjectSchema.parse(request.body);

      // Reject legacy nested mode/paused writes — they used to live in
      // pipeline_state_json before Slice 12 promoted them to columns.
      const psj = data.pipelineStateJson as Record<string, unknown> | undefined;
      if (psj && (Object.prototype.hasOwnProperty.call(psj, 'mode') || Object.prototype.hasOwnProperty.call(psj, 'paused'))) {
        throw new ApiError(
          400,
          'Writing mode/paused via pipelineStateJson is deprecated — use the top-level `mode` and `paused` fields instead.',
          'DEPRECATED_FIELD',
        );
      }

      // Check if project exists
      const { data: existing, error: findErr } = await sb
        .from('projects')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Project not found', 'NOT_FOUND');
      }

      // Handle clearing research_id (setting to null)
      if (data.research_id === null && existing.research_id) {
        // Decrement old research count
        const { data: oldRes } = await sb
          .from('research_archives')
          .select('projects_count')
          .eq('id', existing.research_id)
          .maybeSingle();

        if (oldRes) {
          await sb
            .from('research_archives')
            .update({ projects_count: Math.max(0, (oldRes.projects_count ?? 0) - 1) })
            .eq('id', existing.research_id);
        }
      }

      // If research_id is being updated to a new value, verify it exists
      if (data.research_id !== undefined && data.research_id !== null) {
        const { data: research, error: resErr } = await sb
          .from('research_archives')
          .select('id, projects_count')
          .eq('id', data.research_id)
          .maybeSingle();

        if (resErr) throw resErr;

        if (!research) {
          throw new ApiError(404, 'Research not found', 'RESEARCH_NOT_FOUND');
        }

        // Update counts if research is changing
        if (existing.research_id !== data.research_id) {
          // Decrement old research count
          if (existing.research_id) {
            const { data: oldRes } = await sb
              .from('research_archives')
              .select('projects_count')
              .eq('id', existing.research_id)
              .maybeSingle();

            if (oldRes) {
              await sb
                .from('research_archives')
                .update({ projects_count: Math.max(0, (oldRes.projects_count ?? 0) - 1) })
                .eq('id', existing.research_id);
            }
          }

          // Increment new research count
          await sb
            .from('research_archives')
            .update({ projects_count: (research.projects_count ?? 0) + 1 })
            .eq('id', data.research_id);
        }
      }

      // If winner status is being updated to true, increment winners_count
      if (data.winner === true && !existing.winner && existing.research_id) {
        const { data: res } = await sb
          .from('research_archives')
          .select('winners_count')
          .eq('id', existing.research_id)
          .maybeSingle();

        if (res) {
          await sb
            .from('research_archives')
            .update({ winners_count: (res.winners_count ?? 0) + 1 })
            .eq('id', existing.research_id);
        }
      }

      // If winner status is being updated to false, decrement winners_count
      if (data.winner === false && existing.winner && existing.research_id) {
        const { data: res } = await sb
          .from('research_archives')
          .select('winners_count')
          .eq('id', existing.research_id)
          .maybeSingle();

        if (res) {
          await sb
            .from('research_archives')
            .update({ winners_count: Math.max(0, (res.winners_count ?? 0) - 1) })
            .eq('id', existing.research_id);
        }
      }

      const updateData: Record<string, unknown> = {};
      if (data.title) updateData.title = data.title;
      if (data.research_id !== undefined) updateData.research_id = data.research_id;
      if (data.current_stage) updateData.current_stage = data.current_stage;
      if (data.mode !== undefined) updateData.mode = data.mode;
      if (data.paused !== undefined) updateData.paused = data.paused;
      if (data.status) updateData.status = data.status;
      if (data.winner !== undefined) updateData.winner = data.winner;
      if (data.completed_stages !== undefined)
        updateData.completed_stages = data.completed_stages;
      if (data.pipelineStateJson !== undefined)
        updateData.pipeline_state_json = data.pipelineStateJson;
      if (data.channelId !== undefined)
        updateData.channel_id = data.channelId;

      const { data: project, error } = await sb
        .from('projects')
        .update(updateData as any)
        .eq('id', id)
        .select('*, research:research_archives!research_id(id, title, theme), stages(count)')
        .single();

      if (error) throw error;

      // If the update flipped the project into an autopilot-eligible state
      // (mode → autopilot/legacy-autopilot OR paused → false), re-evaluate
      // the pipeline so the orchestrator picks up wherever it left off.
      const becameAutopilot =
        data.mode !== undefined &&
        isAutopilotMode(data.mode as string | null) &&
        !isAutopilotMode(existing.mode as string | null);
      const becameUnpaused =
        data.paused === false && existing.paused === true;
      if (becameAutopilot || becameUnpaused) {
        await resumeProject(id);
      }

      return reply.send({ data: project, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * PATCH /:id — Partial update project (same logic as PUT)
   */
  fastify.patch('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = updateProjectSchema.parse(request.body);

      // Reject legacy nested mode/paused writes — they used to live in
      // pipeline_state_json before Slice 12 promoted them to columns.
      const psj = data.pipelineStateJson as Record<string, unknown> | undefined;
      if (psj && (Object.prototype.hasOwnProperty.call(psj, 'mode') || Object.prototype.hasOwnProperty.call(psj, 'paused'))) {
        throw new ApiError(
          400,
          'Writing mode/paused via pipelineStateJson is deprecated — use the top-level `mode` and `paused` fields instead.',
          'DEPRECATED_FIELD',
        );
      }

      // Check if project exists
      const { data: existing, error: findErr } = await sb
        .from('projects')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Project not found', 'NOT_FOUND');
      }

      // Handle clearing research_id (setting to null)
      if (data.research_id === null && existing.research_id) {
        const { data: oldRes } = await sb
          .from('research_archives')
          .select('projects_count')
          .eq('id', existing.research_id)
          .maybeSingle();

        if (oldRes) {
          await sb
            .from('research_archives')
            .update({ projects_count: Math.max(0, (oldRes.projects_count ?? 0) - 1) })
            .eq('id', existing.research_id);
        }
      }

      // If research_id is being updated to a new value, verify it exists
      if (data.research_id !== undefined && data.research_id !== null) {
        const { data: research, error: resErr } = await sb
          .from('research_archives')
          .select('id, projects_count')
          .eq('id', data.research_id)
          .maybeSingle();

        if (resErr) throw resErr;

        if (!research) {
          throw new ApiError(404, 'Research not found', 'RESEARCH_NOT_FOUND');
        }

        if (existing.research_id !== data.research_id) {
          if (existing.research_id) {
            const { data: oldRes } = await sb
              .from('research_archives')
              .select('projects_count')
              .eq('id', existing.research_id)
              .maybeSingle();

            if (oldRes) {
              await sb
                .from('research_archives')
                .update({ projects_count: Math.max(0, (oldRes.projects_count ?? 0) - 1) })
                .eq('id', existing.research_id);
            }
          }

          await sb
            .from('research_archives')
            .update({ projects_count: (research.projects_count ?? 0) + 1 })
            .eq('id', data.research_id);
        }
      }

      if (data.winner === true && !existing.winner && existing.research_id) {
        const { data: res } = await sb
          .from('research_archives')
          .select('winners_count')
          .eq('id', existing.research_id)
          .maybeSingle();

        if (res) {
          await sb
            .from('research_archives')
            .update({ winners_count: (res.winners_count ?? 0) + 1 })
            .eq('id', existing.research_id);
        }
      }

      if (data.winner === false && existing.winner && existing.research_id) {
        const { data: res } = await sb
          .from('research_archives')
          .select('winners_count')
          .eq('id', existing.research_id)
          .maybeSingle();

        if (res) {
          await sb
            .from('research_archives')
            .update({ winners_count: Math.max(0, (res.winners_count ?? 0) - 1) })
            .eq('id', existing.research_id);
        }
      }

      const updateData: Record<string, unknown> = {};
      if (data.title) updateData.title = data.title;
      if (data.research_id !== undefined) updateData.research_id = data.research_id;
      if (data.current_stage) updateData.current_stage = data.current_stage;
      if (data.mode !== undefined) updateData.mode = data.mode;
      if (data.paused !== undefined) updateData.paused = data.paused;
      if (data.status) updateData.status = data.status;
      if (data.winner !== undefined) updateData.winner = data.winner;
      if (data.completed_stages !== undefined)
        updateData.completed_stages = data.completed_stages;
      if (data.pipelineStateJson !== undefined)
        updateData.pipeline_state_json = data.pipelineStateJson;

      const { data: project, error } = await sb
        .from('projects')
        .update(updateData as any)
        .eq('id', id)
        .select('*, research:research_archives!research_id(id, title, theme), stages(count)')
        .single();

      if (error) throw error;

      // If the update flipped the project into an autopilot-eligible state
      // (mode → autopilot/legacy-autopilot OR paused → false), re-evaluate
      // the pipeline so the orchestrator picks up wherever it left off.
      const becameAutopilot =
        data.mode !== undefined &&
        isAutopilotMode(data.mode as string | null) &&
        !isAutopilotMode(existing.mode as string | null);
      const becameUnpaused =
        data.paused === false && existing.paused === true;
      if (becameAutopilot || becameUnpaused) {
        await resumeProject(id);
      }

      return reply.send({ data: project, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * DELETE /:id — Delete project
   */
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      // Check if project exists
      const { data: existing, error: findErr } = await sb
        .from('projects')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Project not found', 'NOT_FOUND');
      }

      // Decrement research counts
      if (existing.research_id) {
        const { data: res } = await sb
          .from('research_archives')
          .select('projects_count, winners_count')
          .eq('id', existing.research_id)
          .maybeSingle();

        if (res) {
          const updateData: Record<string, number> = {
            projects_count: Math.max(0, (res.projects_count ?? 0) - 1),
          };
          if (existing.winner) {
            updateData.winners_count = Math.max(0, (res.winners_count ?? 0) - 1);
          }

          await sb
            .from('research_archives')
            .update(updateData as any)
            .eq('id', existing.research_id);
        }
      }

      const { error } = await sb.from('projects').delete().eq('id', id);
      if (error) throw error;

      return reply.send({
        data: { success: true, message: 'Project deleted successfully' },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /bulk-create — Bulk create projects from discovery output (idempotent)
   */
  fastify.post('/bulk-create', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = bulkCreateSchema.parse(request.body);

      // If idempotency token provided, check previous result
      if (body.idempotency_token) {
        const existing = await getKeyByToken(body.idempotency_token);
        if (existing && existing.consumed && existing.response) {
          return reply.send({ data: existing.response, error: null });
        }

        // Create token record to reserve it; handle race via unique constraint
        await createKey(body.idempotency_token, { purpose: 'projects:bulk-create' });
      }

      // Enforce optional bulk limits if enabled
      if (ENABLE_BULK_LIMITS && body.selected_ideas.length > MAX_BULK_CREATE) {
        throw new ApiError(
          413,
          `Bulk create exceeds MAX_BULK_CREATE (${MAX_BULK_CREATE})`,
          'BULK_CREATE_LIMIT_EXCEEDED',
        );
      }

      const result = await createProjectsFromDiscovery({
        research: body.research as any,
        ideas: body.selected_ideas,
        defaults: body.defaults ?? {},
        idempotencyToken: body.idempotency_token,
      } as any);

      // Store response in idempotency table if token provided
      if (body.idempotency_token) {
        await consumeKey(body.idempotency_token, result);
      }

      return reply.send({ data: result, error: null });
    } catch (error) {
      // If not implemented, return 501 for now
      if ((error as Error).message === 'createProjectsFromDiscovery not implemented') {
        return reply.status(501).send({
          data: {
            success: false,
            message: 'createProjectsFromDiscovery not implemented',
          },
          error: null,
        });
      }

      return sendError(reply, error);
    }
  });

  /**
   * POST /bulk — Bulk operations on multiple projects
   */
  fastify.post('/bulk', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const data = bulkOperationSchema.parse(request.body);

      // Verify all projects exist
      const { data: projects, error: findErr } = await sb
        .from('projects')
        .select('*')
        .in('id', data.project_ids);

      if (findErr) throw findErr;

      if ((projects ?? []).length !== data.project_ids.length) {
        throw new ApiError(400, 'Some project IDs are invalid', 'INVALID_PROJECT_IDS');
      }

      switch (data.operation) {
        case 'delete': {
          // Decrement research counts before deletion
          for (const project of projects ?? []) {
            if (project.research_id) {
              const { data: res } = await sb
                .from('research_archives')
                .select('projects_count, winners_count')
                .eq('id', project.research_id)
                .maybeSingle();

              if (res) {
                const updateData: Record<string, number> = {
                  projects_count: Math.max(0, (res.projects_count ?? 0) - 1),
                };
                if (project.winner) {
                  updateData.winners_count = Math.max(0, (res.winners_count ?? 0) - 1);
                }

                await sb
                  .from('research_archives')
                  .update(updateData as any)
                  .eq('id', project.research_id);
              }
            }
          }

          const { error: delErr } = await sb
            .from('projects')
            .delete()
            .in('id', data.project_ids);

          if (delErr) throw delErr;

          return reply.send({
            data: {
              success: true,
              operation: data.operation,
              affected: data.project_ids.length,
              message: `Successfully performed delete on ${data.project_ids.length} project(s)`,
            },
            error: null,
          });
        }

        case 'archive':
        case 'activate':
        case 'pause':
        case 'complete': {
          const statusMap: Record<string, string> = {
            archive: 'archived',
            activate: 'active',
            pause: 'paused',
            complete: 'completed',
          };

          const { error: upErr } = await sb
            .from('projects')
            .update({ status: statusMap[data.operation] })
            .in('id', data.project_ids);

          if (upErr) throw upErr;

          return reply.send({
            data: {
              success: true,
              operation: data.operation,
              affected: data.project_ids.length,
              message: `Successfully performed ${data.operation} on ${data.project_ids.length} project(s)`,
            },
            error: null,
          });
        }

        case 'export': {
          const exportData = (projects ?? []).map(p => ({
            id: p.id,
            title: p.title,
            current_stage: p.current_stage,
            status: p.status,
            winner: p.winner,
            created_at: p.created_at,
            research_id: p.research_id,
          }));

          const body = JSON.stringify({ projects: exportData }, null, 2);

          return reply
            .header('Content-Type', 'application/json')
            .header('Content-Disposition', 'attachment; filename=projects-export.json')
            .send(body);
        }

        case 'change_status': {
          if (!data.new_status) {
            throw new ApiError(400, 'new_status is required for change_status', 'MISSING_FIELD');
          }

          const { error: upErr } = await sb
            .from('projects')
            .update({ status: data.new_status })
            .in('id', data.project_ids);

          if (upErr) throw upErr;

          return reply.send({
            data: {
              success: true,
              affected: data.project_ids.length,
              message: `Updated status to ${data.new_status}`,
            },
            error: null,
          });
        }

        default:
          throw new ApiError(400, 'Invalid operation', 'INVALID_OPERATION');
      }
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /:id/winner — Mark project as winner or non-winner
   */
  fastify.post('/:id/winner', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };
      const data = markWinnerSchema.parse(request.body);

      // Check if project exists
      const { data: existing, error: findErr } = await sb
        .from('projects')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (findErr) throw findErr;

      if (!existing) {
        throw new ApiError(404, 'Project not found', 'NOT_FOUND');
      }

      // Only update research winners_count if project has research
      if (existing.research_id) {
        if (data.winner && !existing.winner) {
          const { data: research } = await sb
            .from('research_archives')
            .select('winners_count')
            .eq('id', existing.research_id)
            .single();
          if (research) {
            await sb
              .from('research_archives')
              .update({ winners_count: (research.winners_count ?? 0) + 1 })
              .eq('id', existing.research_id);
          }
        } else if (!data.winner && existing.winner) {
          const { data: research } = await sb
            .from('research_archives')
            .select('winners_count')
            .eq('id', existing.research_id)
            .single();
          if (research) {
            await sb
              .from('research_archives')
              .update({ winners_count: Math.max(0, (research.winners_count ?? 0) - 1) })
              .eq('id', existing.research_id);
          }
        }
      }

      const { data: project, error: updateErr } = await sb
        .from('projects')
        .update({ winner: data.winner })
        .eq('id', id)
        .select('*, research:research_id(id, title, theme, winners_count)')
        .single();

      if (updateErr) throw updateErr;

      return reply.send({
        data: {
          success: true,
          project,
          message: data.winner ? 'Project marked as winner' : 'Project unmarked as winner',
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * POST /from-idea — Create project from a selected idea.
   * Called when user clicks "Next: Research" after brainstorm.
   *
   * Entry-point: startStage = 'research'.
   * Pre-fills pipeline_state_json.stageResults.brainstorm so the wizard and
   * orchestrator know brainstorm is already completed and jump straight to
   * the research stage.
   */
  fastify.post('/from-idea', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const body = request.body as { ideaId?: string; channelId?: string; title?: string };

      if (!body.ideaId) throw new ApiError(400, 'ideaId is required');

      // Fetch idea
      const { data: idea, error: ideaErr } = await sb
        .from('idea_archives')
        .select('id, title, verdict, core_tension, brainstorm_session_id, channel_id, org_id')
        .eq('id', body.ideaId)
        .maybeSingle();
      if (ideaErr) throw ideaErr;
      if (!idea) throw new ApiError(404, 'Idea not found');

      const ideaData = idea as Record<string, unknown>;
      const title = body.title ?? (ideaData.title as string) ?? 'Untitled Project';
      const completedAt = new Date().toISOString();

      // Pre-fill stageResults so the orchestrator and wizard treat brainstorm
      // as already completed and open at the research stage.
      const pipelineStateJson = {
        mode: 'step-by-step',
        currentStage: 'research',
        stageResults: {
          brainstorm: {
            ideaId: body.ideaId,
            ideaTitle: ideaData.title as string ?? title,
            ideaVerdict: (ideaData.verdict as string) ?? 'viable',
            ideaCoreTension: (ideaData.core_tension as string) ?? '',
            brainstormSessionId: (ideaData.brainstorm_session_id as string) ?? undefined,
            completedAt,
          },
        },
        autoConfig: {
          maxReviewIterations: 5,
          targetReviewScore: 90,
          pauseBeforePublish: true,
        },
      };

      // Create project at research stage with brainstorm pre-completed
      const { data: project, error: projErr } = await sb
        .from('projects')
        .insert({
          title,
          channel_id: body.channelId ?? (ideaData.channel_id as string) ?? null,
          status: 'active',
          current_stage: 'research',
          mode: 'step-by-step',
          pipeline_state_json: pipelineStateJson,
          user_id: request.userId,
          org_id: (ideaData.org_id as string) ?? null,
        })
        .select()
        .single();
      if (projErr) throw projErr;

      // Link idea to project
      await sb
        .from('idea_archives')
        .update({ project_id: (project as Record<string, unknown>).id } as never)
        .eq('id', body.ideaId);

      return reply.status(201).send({ data: { project }, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id/pipeline — Full pipeline state for a project.
   * Returns all linked entities in one call.
   */
  fastify.get('/:id/pipeline', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      // Fetch project
      const { data: project, error: projErr } = await sb
        .from('projects')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (projErr) throw projErr;
      if (!project) throw new ApiError(404, 'Project not found');

      // Fetch all linked entities in parallel
      const [ideas, brainstorms, research, drafts] = await Promise.all([
        sb.from('idea_archives').select('*').eq('project_id', id).order('created_at', { ascending: true }),
        sb.from('brainstorm_sessions').select('*').eq('project_id', id).order('created_at', { ascending: true }),
        sb.from('research_sessions').select('*').eq('project_id', id).order('created_at', { ascending: true }),
        sb.from('content_drafts').select('*').eq('project_id', id).order('created_at', { ascending: true }),
      ]);

      return reply.send({
        data: {
          project,
          ideas: ideas.data ?? [],
          brainstormSessions: brainstorms.data ?? [],
          researchSessions: research.data ?? [],
          contentDrafts: drafts.data ?? [],
        },
        error: null,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  /**
   * GET /:id/graph — Full DAG (nodes + edges) for the Graph view (T2.12).
   *
   * Loads all stage_runs, tracks, and publish_targets for the project in
   * parallel, passes them through `buildGraph`, and returns the result in the
   * standard `{ data, error }` envelope.
   *
   * The ETag is derived from the node and edge counts so the client can skip
   * a re-render when the graph shape hasn't changed (lightweight; a
   * content-hash would require serialisation on every request).
   */
  fastify.get('/:id/graph', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const { id } = request.params as { id: string };

      // 1. Ownership guard — must precede any data reads.
      await assertProjectOwner(id, request.userId ?? '', sb);

      // 2. Verify project exists (assertProjectOwner already throws 404, but
      //    we need the row to confirm it's a real project before fetching runs).
      const { data: project, error: projErr } = await sb
        .from('projects')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      if (projErr) throw projErr;
      if (!project) throw new ApiError(404, 'Project not found', 'NOT_FOUND');

      // 3. Load stage_runs and tracks in parallel.
      const [stageRunsResult, tracksResult] = await Promise.all([
        sb
          .from('stage_runs')
          .select('id, stage, status, track_id, publish_target_id, attempt_no')
          .eq('project_id', id)
          .order('created_at', { ascending: true }),
        sb
          .from('tracks')
          .select('id, project_id, medium, status, paused, autopilot_config_json')
          .eq('project_id', id)
          .order('created_at', { ascending: true }),
      ]);

      if (stageRunsResult.error) throw stageRunsResult.error;
      if (tracksResult.error) throw tracksResult.error;

      // 4. Map DB rows to graph-builder input types.
      const stageRuns: RunNode[] = (stageRunsResult.data ?? []).map(
        (r: Record<string, unknown>) => ({
          id: r.id as string,
          stage: r.stage as RunNode['stage'],
          status: r.status as RunNode['status'],
          trackId: (r.track_id as string | null) ?? null,
          publishTargetId: (r.publish_target_id as string | null) ?? null,
          attemptNo: r.attempt_no as number,
        }),
      );

      const tracks: Track[] = (tracksResult.data ?? []).map(
        (r: Record<string, unknown>) => ({
          id: r.id as string,
          projectId: r.project_id as string,
          medium: r.medium as Track['medium'],
          status: r.status as Track['status'],
          paused: Boolean(r.paused),
          autopilotConfigJson: r.autopilot_config_json ?? undefined,
        }),
      );

      // 5. Load publish_targets referenced by stage_runs. The publish_targets
      //    table has no project_id column — it is scoped by channel/org.
      //    We collect the distinct IDs referenced in stage_runs and load only
      //    those rows so the graph-builder can group fan-out edges correctly.
      const publishTargetIds = [
        ...new Set(
          stageRuns
            .map((r) => r.publishTargetId)
            .filter((tid): tid is string => tid !== null),
        ),
      ];

      let publishTargets: PublishTarget[] = [];
      if (publishTargetIds.length > 0) {
        const { data: ptRows, error: ptErr } = await sb
          .from('publish_targets')
          .select('id, channel_id, org_id, type, display_name, config_json, is_active, created_at, updated_at')
          .in('id', publishTargetIds);
        if (ptErr) throw ptErr;
        publishTargets = (ptRows ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          channelId: (r.channel_id as string | null) ?? null,
          orgId: (r.org_id as string | null) ?? null,
          type: r.type as PublishTarget['type'],
          displayName: r.display_name as string,
          configJson: (r.config_json as Record<string, unknown> | null) ?? null,
          isActive: Boolean(r.is_active),
          createdAt: r.created_at as string,
          updatedAt: r.updated_at as string,
        }));
      }

      // 6. Build the DAG.
      const graph = buildGraph({ stageRuns, tracks, publishTargets });

      // 7. ETag — lightweight fingerprint; avoids re-serialisation on no-change.
      const etag = `"${graph.nodes.length}n${graph.edges.length}e"`;
      reply.header('ETag', etag);

      return reply.send({ data: graph, error: null });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
