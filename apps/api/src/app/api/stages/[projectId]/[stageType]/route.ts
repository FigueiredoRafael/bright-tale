/**
 * Specific Stage API Routes
 * GET /api/stages/[projectId]/[stageType] - Get specific stage with revision history
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validStageTypes, normalizeStageType } from "@brighttale/shared/schemas/stages";

/**
 * GET /api/stages/[projectId]/[stageType]
 * Get a specific stage by project and type, including revision history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; stageType: string }> },
) {
  try {
    const sb = createServiceClient();
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
    const { data: project, error: projErr } = await sb
      .from('projects')
      .select('id, current_stage')
      .eq('id', projectId)
      .maybeSingle();

    if (projErr) throw projErr;

    if (!project) {
      throw new ApiError(404, "Project not found", "PROJECT_NOT_FOUND");
    }

    // Get the stage (try normalized first, then original)
    let { data: stage, error: stageErr } = await sb
      .from('stages')
      .select('*, revisions(*)')
      .eq('project_id', projectId)
      .eq('stage_type', normalizedType)
      .order('created_at', { referencedTable: 'revisions', ascending: false })
      .maybeSingle();

    if (stageErr) throw stageErr;

    // If not found with normalized, try original
    if (!stage && normalizedType !== stageType) {
      const { data: stageAlt, error: stageAltErr } = await sb
        .from('stages')
        .select('*, revisions(*)')
        .eq('project_id', projectId)
        .eq('stage_type', stageType)
        .order('created_at', { referencedTable: 'revisions', ascending: false })
        .maybeSingle();

      if (stageAltErr) throw stageAltErr;
      stage = stageAlt;
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
