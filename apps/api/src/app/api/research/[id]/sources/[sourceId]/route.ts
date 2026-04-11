/**
 * Research Source Delete API Route
 * DELETE /api/research/[id]/sources/[sourceId] - Remove source from research
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";

/**
 * DELETE /api/research/[id]/sources/[sourceId]
 * Remove a source from research
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id, sourceId } = await params;

    // Check if source exists and belongs to the research
    const { data: source, error: findErr } = await sb
      .from('research_sources')
      .select('*')
      .eq('id', sourceId)
      .maybeSingle();

    if (findErr) throw findErr;

    if (!source) {
      throw new ApiError(404, "Source not found", "NOT_FOUND");
    }

    if (source.research_id !== id) {
      throw new ApiError(
        400,
        "Source does not belong to this research",
        "INVALID_RESEARCH_ID",
      );
    }

    const { error } = await sb.from('research_sources').delete().eq('id', sourceId);
    if (error) throw error;

    return createSuccessResponse({
      success: true,
      message: "Source deleted successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
