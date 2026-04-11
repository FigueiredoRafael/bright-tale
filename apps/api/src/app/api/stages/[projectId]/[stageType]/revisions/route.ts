/**
 * Stage Revisions API Routes
 * POST /api/stages/[projectId]/[stageType]/revisions - Create a manual revision
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
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
    const sb = createServiceClient();
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
    const { data: project, error: projErr } = await sb
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle();

    if (projErr) throw projErr;

    if (!project) {
      throw new ApiError(404, "Project not found", "PROJECT_NOT_FOUND");
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
        "STAGE_NOT_FOUND",
      );
    }

    // Create revision with the current stage content
    const { data: revision, error: revErr } = await sb
      .from('revisions')
      .insert({
        stage_id: stage.id,
        yaml_artifact: data.yaml_artifact,
        version: stage.version,
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
      .eq('id', stage.id)
      .single();

    if (updErr) throw updErr;

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
