/**
 * Project Detail API Routes
 * GET /api/projects/[id] - Get project details
 * PUT /api/projects/[id] - Update project
 * DELETE /api/projects/[id] - Delete project
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { updateProjectSchema } from "@/lib/schemas/projects";

/**
 * GET /api/projects/[id]
 * Get project details by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        research: {
          include: {
            sources: true,
          },
        },
        stages: {
          orderBy: { created_at: "desc" },
          include: {
            _count: {
              select: {
                revisions: true,
              },
            },
          },
        },
        _count: {
          select: {
            stages: true,
          },
        },
      },
    });

    if (!project) {
      throw new ApiError(404, "Project not found", "NOT_FOUND");
    }

    return createSuccessResponse(project);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/projects/[id]
 * Update project by ID
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const data = await validateBody(request, updateProjectSchema);

    // Check if project exists
    const existing = await prisma.project.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError(404, "Project not found", "NOT_FOUND");
    }

    // Handle clearing research_id (setting to null)
    if (data.research_id === null && existing.research_id) {
      // Decrement old research count
      await prisma.researchArchive
        .update({
          where: { id: existing.research_id },
          data: { projects_count: { decrement: 1 } },
        })
        .catch(() => {
          // Ignore error if research no longer exists (orphaned reference)
        });
    }

    // If research_id is being updated to a new value, verify it exists
    if (data.research_id !== undefined && data.research_id !== null) {
      const research = await prisma.researchArchive.findUnique({
        where: { id: data.research_id },
      });

      if (!research) {
        throw new ApiError(404, "Research not found", "RESEARCH_NOT_FOUND");
      }

      // Update counts if research is changing
      if (existing.research_id !== data.research_id) {
        // Decrement old research count
        if (existing.research_id) {
          await prisma.researchArchive
            .update({
              where: { id: existing.research_id },
              data: { projects_count: { decrement: 1 } },
            })
            .catch(() => {
              // Ignore error if research no longer exists
            });
        }

        // Increment new research count
        await prisma.researchArchive.update({
          where: { id: data.research_id },
          data: { projects_count: { increment: 1 } },
        });
      }
    }

    // If winner status is being updated to true, increment winners_count
    if (data.winner === true && !existing.winner && existing.research_id) {
      await prisma.researchArchive.update({
        where: { id: existing.research_id },
        data: { winners_count: { increment: 1 } },
      });
    }

    // If winner status is being updated to false, decrement winners_count
    if (data.winner === false && existing.winner && existing.research_id) {
      await prisma.researchArchive.update({
        where: { id: existing.research_id },
        data: { winners_count: { decrement: 1 } },
      });
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.research_id !== undefined && {
          research_id: data.research_id,
        }),
        ...(data.current_stage && { current_stage: data.current_stage }),
        ...(data.auto_advance !== undefined && {
          auto_advance: data.auto_advance,
        }),
        ...(data.status && { status: data.status }),
        ...(data.winner !== undefined && { winner: data.winner }),
        ...(data.completed_stages !== undefined && {
          completed_stages: data.completed_stages,
        }),
      },
      include: {
        research: {
          select: {
            id: true,
            title: true,
            theme: true,
          },
        },
        _count: {
          select: {
            stages: true,
          },
        },
      },
    });

    return createSuccessResponse(project);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/projects/[id]
 * Partial update project by ID (same as PUT for compatibility)
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return PUT(request, context);
}

/**
 * DELETE /api/projects/[id]
 * Delete project by ID
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    // Check if project exists
    const existing = await prisma.project.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError(404, "Project not found", "NOT_FOUND");
    }

    // Decrement research counts
    if (existing.research_id) {
      const updates: {
        projects_count: { decrement: number };
        winners_count?: { decrement: number };
      } = {
        projects_count: { decrement: 1 },
      };
      if (existing.winner) {
        updates.winners_count = { decrement: 1 };
      }

      await prisma.researchArchive
        .update({
          where: { id: existing.research_id },
          data: updates,
        })
        .catch(() => {
          // Ignore error if research no longer exists
        });
    }

    await prisma.project.delete({
      where: { id },
    });

    return createSuccessResponse({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
