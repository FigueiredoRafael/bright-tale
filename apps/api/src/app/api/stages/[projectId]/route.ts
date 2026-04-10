/**
 * Project Stages API Routes
 * GET /api/stages/[projectId] - Get all stages for a project
 */

import { NextRequest } from "next/server";
// TODO-supabase: import { prisma } from "@/lib/prisma";
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
    const { projectId } = await params;
    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new ApiError(404, "Project not found", "PROJECT_NOT_FOUND");
    }

    // Get all stages for the project
    const stages = await prisma.stage.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: "asc" },
      include: {
        _count: {
          select: {
            revisions: true,
          },
        },
      },
    });

    return createSuccessResponse({
      project_id: projectId,
      current_stage: project.current_stage,
      stages,
      stages_count: stages.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
