/**
 * Project Stages API Routes
 * GET /api/stages/[projectId] - Get all stages for a project
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";

/**
 * GET /api/stages/[projectId]
 * Get all stages for a specific project
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const sb = createServiceClient();
    const { projectId } = await params;

    // Verify project exists
    const { data: project, error: projErr } = await sb
      .from('projects')
      .select('id, current_stage')
      .eq('id', projectId)
      .maybeSingle();

    if (projErr) throw projErr;

    if (!project) {
      throw new ApiError(404, "Project not found", "PROJECT_NOT_FOUND");
    }

    // Get all stages for the project
    const { data: stages, error } = await sb
      .from('stages')
      .select('*, revisions(count)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return createSuccessResponse({
      project_id: projectId,
      current_stage: project.current_stage,
      stages,
      stages_count: (stages ?? []).length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
