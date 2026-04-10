/**
 * Research Detail API Routes
 * GET /api/research/[id] - Get research details
 * PUT /api/research/[id] - Update research
 * DELETE /api/research/[id] - Delete research
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { updateResearchSchema } from "@/lib/schemas/research";

/**
 * GET /api/research/[id]
 * Get research details by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const research = await prisma.researchArchive.findUnique({
      where: { id },
      include: {
        sources: {
          orderBy: { created_at: "desc" },
        },
        projects: {
          select: {
            id: true,
            title: true,
            status: true,
            winner: true,
            created_at: true,
          },
          orderBy: { created_at: "desc" },
        },
        _count: {
          select: {
            sources: true,
            projects: true,
          },
        },
      },
    });

    if (!research) {
      throw new ApiError(404, "Research not found", "NOT_FOUND");
    }

    return createSuccessResponse(research);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/research/[id]
 * Update research by ID
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const data = await validateBody(request, updateResearchSchema);

    // Check if research exists
    const existing = await prisma.researchArchive.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError(404, "Research not found", "NOT_FOUND");
    }

    const research = await prisma.researchArchive.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.theme && { theme: data.theme }),
        ...(data.research_content && {
          research_content: data.research_content,
        }),
      },
      include: {
        sources: true,
        _count: {
          select: {
            sources: true,
            projects: true,
          },
        },
      },
    });

    return createSuccessResponse(research);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/research/[id]
 * Delete research by ID
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    // Check if research exists
    const existing = await prisma.researchArchive.findUnique({
      where: { id },
      include: {
        _count: {
          select: { projects: true },
        },
      },
    });

    if (!existing) {
      throw new ApiError(404, "Research not found", "NOT_FOUND");
    }

    // Check if research is used by any projects
    if (existing._count.projects > 0) {
      throw new ApiError(
        400,
        `Cannot delete research that is used by ${existing._count.projects} project(s)`,
        "RESEARCH_IN_USE",
      );
    }

    await prisma.researchArchive.delete({
      where: { id },
    });

    return createSuccessResponse({
      success: true,
      message: "Research deleted successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
