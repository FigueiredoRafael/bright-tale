/**
 * Research Sources API Routes
 * POST /api/research/[id]/sources - Add source to research
 */

import { NextRequest } from "next/server";
// TODO-supabase: import { prisma } from "@/lib/prisma";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { addSourceSchema } from "@brighttale/shared/schemas/research";

/**
 * POST /api/research/[id]/sources
 * Add a new source to research
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const data = await validateBody(request, addSourceSchema);

    // Check if research exists
    const research = await prisma.researchArchive.findUnique({
      where: { id },
    });

    if (!research) {
      throw new ApiError(404, "Research not found", "NOT_FOUND");
    }

    const source = await prisma.researchSource.create({
      data: {
        research_id: id,
        url: data.url,
        title: data.title,
        author: data.author,
        date: data.date ? new Date(data.date) : null,
      },
    });

    return createSuccessResponse(source, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
