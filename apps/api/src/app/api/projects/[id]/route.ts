/**
 * Project Detail API Routes
 * GET /api/projects/[id] - Get project details
 * PUT /api/projects/[id] - Update project
 * DELETE /api/projects/[id] - Delete project
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { updateProjectSchema } from "@brighttale/shared/schemas/projects";

/**
 * GET /api/projects/[id]
 * Get project details by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const { data: project, error } = await sb
      .from('projects')
      .select('*, research:research_archives!research_id(*, sources:research_sources(*)), stages(*, revisions(count)), stages(count)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;

    if (!project) {
      throw new ApiError(404, "Project not found", "NOT_FOUND");
    }

    return createSuccessResponse(project);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/projects/[id]
 * Update project by ID
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const data = await validateBody(request, updateProjectSchema);

    // Check if project exists
    const { data: existing, error: findErr } = await sb
      .from('projects')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findErr) throw findErr;

    if (!existing) {
      throw new ApiError(404, "Project not found", "NOT_FOUND");
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
        throw new ApiError(404, "Research not found", "RESEARCH_NOT_FOUND");
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
    if (data.completed_stages !== undefined) updateData.completed_stages = data.completed_stages;

    const { data: project, error } = await sb
      .from('projects')
      .update(updateData as any)
      .eq('id', id)
      .select('*, research:research_archives!research_id(id, title, theme), stages(count)')
      .single();

    if (error) throw error;

    return createSuccessResponse(project);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/projects/[id]
 * Partial update project by ID (same as PUT for compatibility)
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return PUT(request, context);
}

/**
 * DELETE /api/projects/[id]
 * Delete project by ID
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;

    // Check if project exists
    const { data: existing, error: findErr } = await sb
      .from('projects')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findErr) throw findErr;

    if (!existing) {
      throw new ApiError(404, "Project not found", "NOT_FOUND");
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

    return createSuccessResponse({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
