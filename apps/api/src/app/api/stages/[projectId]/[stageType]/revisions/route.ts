/**
 * Stage Revisions API Routes
 * POST /api/stages/[projectId]/[stageType]/revisions - Create a manual revision
 */

import { NextRequest } from "next/server";
// TODO-supabase: import { prisma } from "@/lib/prisma";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { createRevisionSchema } from "@brighttale/shared/schemas/stages";

/**
 * POST /api/stages/[projectId]/[stageType]/revisions
 * Create a manual revision for a stage
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; stageType: string }> },
) {
  try {
    const { projectId, stageType } = await params;
    const data = await validateBody(request, createRevisionSchema);

    // Validate stage_type
    const validStageTypes = ["discovery", "production", "review"];
    if (!validStageTypes.includes(stageType)) {
      throw new ApiError(
        400,
        `Invalid stage type. Must be one of: ${validStageTypes.join(", ")}`,
        "INVALID_STAGE_TYPE",
      );
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new ApiError(404, "Project not found", "PROJECT_NOT_FOUND");
    }

    // Get the stage
    const stage = await prisma.stage.findFirst({
      where: {
        project_id: projectId,
        stage_type: stageType,
      },
    });

    if (!stage) {
      throw new ApiError(
        404,
        `Stage '${stageType}' not found for this project`,
        "STAGE_NOT_FOUND",
      );
    }

    // Create revision with the current stage content
    const revision = await prisma.revision.create({
      data: {
        stage_id: stage.id,
        yaml_artifact: data.yaml_artifact,
        version: stage.version,
        created_by: data.created_by,
        change_notes: data.change_notes,
      },
    });

    // Get updated stage with revision count
    const updatedStage = await prisma.stage.findUnique({
      where: { id: stage.id },
      include: {
        _count: {
          select: {
            revisions: true,
          },
        },
      },
    });

    return createSuccessResponse(
      {
        revision,
        stage: updatedStage,
        message: "Revision created successfully",
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
