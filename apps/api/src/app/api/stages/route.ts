/**
 * Stages API Routes
 * POST /api/stages - Create or update a stage
 */

import { NextRequest } from "next/server";
// TODO-supabase: import { prisma } from "@/lib/prisma";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { createStageSchema, normalizeStageType } from "@brighttale/shared/schemas/stages";

/**
 * POST /api/stages
 * Create a new stage or update existing one (increments version)
 */
export async function POST(request: NextRequest) {
  try {
    const data = await validateBody(request, createStageSchema);

    // Normalize stage type to canonical name
    const stageType = normalizeStageType(data.stage_type);

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: data.project_id },
    });

    if (!project) {
      throw new ApiError(404, "Project not found", "PROJECT_NOT_FOUND");
    }

    // Check if stage already exists for this project and type (check both normalized and original)
    let existingStage = await prisma.stage.findFirst({
      where: {
        project_id: data.project_id,
        stage_type: stageType,
      },
      include: {
        _count: {
          select: {
            revisions: true,
          },
        },
      },
    });

    // Also check with original stage type if different
    if (!existingStage && stageType !== data.stage_type) {
      existingStage = await prisma.stage.findFirst({
        where: {
          project_id: data.project_id,
          stage_type: data.stage_type,
        },
        include: {
          _count: {
            select: {
              revisions: true,
            },
          },
        },
      });
    }

    if (existingStage) {
      // Create revision for the old version
      await prisma.revision.create({
        data: {
          stage_id: existingStage.id,
          yaml_artifact: existingStage.yaml_artifact,
          version: existingStage.version,
          created_by: "system",
          change_notes: "Auto-archived before update",
        },
      });

      // Update stage with new artifact and increment version
      const updatedStage = await prisma.stage.update({
        where: { id: existingStage.id },
        data: {
          yaml_artifact: data.yaml_artifact,
          version: { increment: 1 },
        },
        include: {
          _count: {
            select: {
              revisions: true,
            },
          },
        },
      });

      return createSuccessResponse({
        stage: updatedStage,
        message: "Stage updated successfully",
        previous_version: existingStage.version,
      });
    } else {
      // Create new stage with normalized stage type
      const newStage = await prisma.stage.create({
        data: {
          project_id: data.project_id,
          stage_type: stageType,
          yaml_artifact: data.yaml_artifact,
          version: 1,
        },
        include: {
          _count: {
            select: {
              revisions: true,
            },
          },
        },
      });

      // Update project's current_stage with normalized stage type
      await prisma.project.update({
        where: { id: data.project_id },
        data: { current_stage: stageType },
      });

      return createSuccessResponse(
        {
          stage: newStage,
          message: "Stage created successfully",
        },
        201,
      );
    }
  } catch (error) {
    return handleApiError(error);
  }
}
