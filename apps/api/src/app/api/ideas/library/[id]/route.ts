import { NextRequest } from "next/server";
import { validateBody } from "@/lib/api/validation";
import {
  handleApiError,
  createSuccessResponse,
  createErrorResponse,
} from "@/lib/api/errors";
// TODO-supabase: import { prisma } from "@/lib/prisma";
import { updateIdeaSchema } from "@brighttale/shared/schemas/ideas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/ideas/library/[id]
 * Get a single idea by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const idea = await prisma.ideaArchive.findUnique({
      where: { id },
    });

    if (!idea) {
      return createErrorResponse("Idea not found", 404);
    }

    return createSuccessResponse({ idea });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/ideas/library/[id]
 * Update an existing idea
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const data = await validateBody(request, updateIdeaSchema);

    // Check if idea exists
    const existing = await prisma.ideaArchive.findUnique({
      where: { id },
    });

    if (!existing) {
      return createErrorResponse("Idea not found", 404);
    }

    const idea = await prisma.ideaArchive.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.core_tension && { core_tension: data.core_tension }),
        ...(data.target_audience && { target_audience: data.target_audience }),
        ...(data.verdict && { verdict: data.verdict }),
        ...(data.discovery_data !== undefined && {
          discovery_data: data.discovery_data,
        }),
        ...(data.tags && { tags: data.tags }),
        ...(data.is_public !== undefined && { is_public: data.is_public }),
        ...(data.markdown_content !== undefined && {
          markdown_content: data.markdown_content,
        }),
      },
    });

    return createSuccessResponse({ idea });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/ideas/library/[id]
 * Delete an idea from the library
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check if idea exists
    const existing = await prisma.ideaArchive.findUnique({
      where: { id },
    });

    if (!existing) {
      return createErrorResponse("Idea not found", 404);
    }

    await prisma.ideaArchive.delete({
      where: { id },
    });

    return createSuccessResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
