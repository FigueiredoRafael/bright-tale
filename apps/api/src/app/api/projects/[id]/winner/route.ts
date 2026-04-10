/**
 * Project Winner API Route
 * PUT /api/projects/[id]/winner - Mark project as winner/non-winner
 */

import { NextRequest } from "next/server";
// TODO-supabase: import { prisma } from "@/lib/prisma";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { markWinnerSchema } from "@brighttale/shared/schemas/projects";

/**
 * PUT /api/projects/[id]/winner
 * Mark project as winner or non-winner
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const data = await validateBody(request, markWinnerSchema);

    // Check if project exists
    const existing = await prisma.project.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError(404, "Project not found", "NOT_FOUND");
    }

    // Only update research winners_count if project has research
    if (existing.research_id) {
      // If marking as winner and wasn't before, increment
      if (data.winner && !existing.winner) {
        await prisma.researchArchive.update({
          where: { id: existing.research_id },
          data: { winners_count: { increment: 1 } },
        });
      }
      // If unmarking as winner and was before, decrement
      else if (!data.winner && existing.winner) {
        await prisma.researchArchive.update({
          where: { id: existing.research_id },
          data: { winners_count: { decrement: 1 } },
        });
      }
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        winner: data.winner,
      },
      include: {
        research: {
          select: {
            id: true,
            title: true,
            theme: true,
            winners_count: true,
          },
        },
      },
    });

    return createSuccessResponse({
      success: true,
      project,
      message: data.winner
        ? "Project marked as winner"
        : "Project unmarked as winner",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
