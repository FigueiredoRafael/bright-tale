/**
 * Stages API Routes
 * POST /api/stages - Create or update a stage
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
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
    const sb = createServiceClient();
    const data = await validateBody(request, createStageSchema);

    // Normalize stage type to canonical name
    const stageType = normalizeStageType(data.stage_type);

    // Verify project exists
    const { data: project, error: projErr } = await sb
      .from('projects')
      .select('id')
      .eq('id', data.project_id)
      .maybeSingle();

    if (projErr) throw projErr;

    if (!project) {
      throw new ApiError(404, "Project not found", "PROJECT_NOT_FOUND");
    }

    // Check if stage already exists for this project and type
    let { data: existingStage, error: stageErr } = await sb
      .from('stages')
      .select('*, revisions(count)')
      .eq('project_id', data.project_id)
      .eq('stage_type', stageType)
      .maybeSingle();

    if (stageErr) throw stageErr;

    // Also check with original stage type if different
    if (!existingStage && stageType !== data.stage_type) {
      const { data: altStage, error: altErr } = await sb
        .from('stages')
        .select('*, revisions(count)')
        .eq('project_id', data.project_id)
        .eq('stage_type', data.stage_type)
        .maybeSingle();

      if (altErr) throw altErr;
      existingStage = altStage;
    }

    if (existingStage) {
      // Create revision for the old version
      const { error: revErr } = await sb.from('revisions').insert({
        stage_id: existingStage.id,
        yaml_artifact: existingStage.yaml_artifact,
        version: existingStage.version,
        created_by: "system",
        change_notes: "Auto-archived before update",
      });
      if (revErr) throw revErr;

      // Update stage with new artifact and increment version
      const { data: updatedStage, error: updateErr } = await sb
        .from('stages')
        .update({
          yaml_artifact: data.yaml_artifact,
          version: existingStage.version + 1,
        })
        .eq('id', existingStage.id)
        .select('*, revisions(count)')
        .single();

      if (updateErr) throw updateErr;

      return createSuccessResponse({
        stage: updatedStage,
        message: "Stage updated successfully",
        previous_version: existingStage.version,
      });
    } else {
      // Create new stage with normalized stage type
      const { data: newStage, error: createErr } = await sb
        .from('stages')
        .insert({
          project_id: data.project_id,
          stage_type: stageType,
          yaml_artifact: data.yaml_artifact,
          version: 1,
        })
        .select('*, revisions(count)')
        .single();

      if (createErr) throw createErr;

      // Update project's current_stage with normalized stage type
      const { error: projUpdateErr } = await sb
        .from('projects')
        .update({ current_stage: stageType })
        .eq('id', data.project_id);

      if (projUpdateErr) throw projUpdateErr;

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
