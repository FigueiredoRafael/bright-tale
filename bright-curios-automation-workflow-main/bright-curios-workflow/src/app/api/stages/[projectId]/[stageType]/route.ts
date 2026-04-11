/**
 * Specific Stage API Routes
 * GET /api/stages/[projectId]/[stageType] - Get specific stage with revision history
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validStageTypes, normalizeStageType } from "@/lib/schemas/stages";

/**
 * GET /api/stages/[projectId]/[stageType]
 * Get a specific stage by project and type, including revision history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; stageType: string }> },
) {
  try {
    const { projectId, stageType } = await params;

    // Check if valid stage type
    if (!validStageTypes.includes(stageType as any)) {
      throw new ApiError(
        400,
        `Invalid stage type. Must be one of: ${validStageTypes.join(", ")}`,
        "INVALID_STAGE_TYPE",
      );
    }

    // Normalize stage type for lookup (try both normalized and original)
    const normalizedType = normalizeStageType(stageType);

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new ApiError(404, "Project not found", "PROJECT_NOT_FOUND");
    }

    // Get the stage (try normalized first, then original)
    let stage = await prisma.stage.findFirst({
      where: {
        project_id: projectId,
        stage_type: normalizedType,
      },
      include: {
        revisions: {
          orderBy: { created_at: "desc" },
        },
        _count: {
          select: {
            revisions: true,
          },
        },
      },
    });

    // If not found with normalized, try original
    if (!stage && normalizedType !== stageType) {
      stage = await prisma.stage.findFirst({
        where: {
          project_id: projectId,
          stage_type: stageType,
        },
        include: {
          revisions: {
            orderBy: { created_at: "desc" },
          },
          _count: {
            select: {
              revisions: true,
            },
          },
        },
      });
    }

    if (!stage) {
      throw new ApiError(
        404,
        `Stage '${stageType}' not found for this project`,
        "STAGE_NOT_FOUND",
      );
    }

    return createSuccessResponse({
      stage,
      project_id: projectId,
      is_current_stage: project.current_stage === stageType,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
