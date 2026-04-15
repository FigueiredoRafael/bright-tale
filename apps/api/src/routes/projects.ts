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
import {
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
  bulkOperationSchema,
  markWinnerSchema,
} from '@brighttale/shared/schemas/projects';
import { bulkCreateSchema } from '@brighttale/shared/schemas/discovery';

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
          auto_advance: data.auto_advance,
          status: data.status,
          winner: data.winner,
          user_id: request.userId ?? null,
        })
        .select('*, research:research_archives!research_id(id, title, theme), stages(count)')
        .single();

      if (error) throw error;

      return reply.status(201).send({ data: project, error: null });
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
      if (data.auto_advance !== undefined) updateData.auto_advance = data.auto_advance;
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
      if (data.auto_advance !== undefined) updateData.auto_advance = data.auto_advance;
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
   */
  fastify.post('/from-idea', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const sb = createServiceClient();
      const body = request.body as { ideaId?: string; channelId?: string; title?: string };

      if (!body.ideaId) throw new ApiError(400, 'ideaId is required');

      // Fetch idea
      const { data: idea, error: ideaErr } = await sb
        .from('idea_archives')
        .select('*')
        .eq('id', body.ideaId)
        .maybeSingle();
      if (ideaErr) throw ideaErr;
      if (!idea) throw new ApiError(404, 'Idea not found');

      const ideaData = idea as Record<string, unknown>;
      const title = body.title ?? (ideaData.title as string) ?? 'Untitled Project';

      // Create project
      const { data: project, error: projErr } = await sb
        .from('projects')
        .insert({
          title,
          channel_id: body.channelId ?? (ideaData.channel_id as string) ?? null,
          status: 'active',
          current_stage: 'brainstorm',
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
}
