/**
 * Research Source Delete API Route
 * DELETE /api/research/[id]/sources/[sourceId] - Remove source from research
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
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
    const { id, sourceId } = await params;
    // Check if source exists and belongs to the research
    const source = await prisma.researchSource.findUnique({
      where: { id: sourceId },
    });

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

    await prisma.researchSource.delete({
      where: { id: sourceId },
    });

    return createSuccessResponse({
      success: true,
      message: "Source deleted successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
