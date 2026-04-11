/**
 * Projects API Routes
 * POST /api/projects - Create new project
 * GET /api/projects - List all projects with filters
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import { handleApiError, createSuccessResponse } from "@/lib/api/errors";
import { validateBody, validateQueryParams } from "@/lib/api/validation";
import {
  createProjectSchema,
  listProjectsQuerySchema,
} from "@brighttale/shared/schemas/projects";

/**
 * POST /api/projects
 * Create a new project
 */
export async function POST(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const data = await validateBody(request, createProjectSchema);

    // If research_id is provided, verify it exists
    if (data.research_id) {
      const { data: research, error: resErr } = await sb
        .from('research_archives')
        .select('id, projects_count')
        .eq('id', data.research_id)
        .maybeSingle();

      if (resErr) throw resErr;

      if (!research) {
        return createSuccessResponse(
          {
            error: {
              message: "Research not found",
              code: "RESEARCH_NOT_FOUND",
            },
          },
          404,
        );
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
      })
      .select('*, research:research_archives!research_id(id, title, theme), stages(count)')
      .single();

    if (error) throw error;

    return createSuccessResponse(project, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/projects
 * List all projects with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const url = new URL(request.url);
    const params = validateQueryParams(url, listProjectsQuerySchema);

    const page = params.page || 1;
    const limit = params.limit || 20;
    const sortField = params.sort || "created_at";
    const sortOrder = params.order || "desc";

    let countQuery = sb.from('projects').select('*', { count: 'exact', head: true });
    let dataQuery = sb.from('projects').select('*, research:research_archives!research_id(id, title, theme), stages(count)');

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

    const [{ count: total, error: countErr }, { data: projects, error: dataErr }] = await Promise.all([
      countQuery,
      dataQuery
        .order(sortField, { ascending: sortOrder === "asc" })
        .range((page - 1) * limit, page * limit - 1),
    ]);

    if (countErr) throw countErr;
    if (dataErr) throw dataErr;

    return createSuccessResponse({
      projects,
      pagination: {
        page,
        limit,
        total: total ?? 0,
        totalPages: Math.ceil((total ?? 0) / limit),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
