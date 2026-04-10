/**
 * Projects API Routes
 * POST /api/projects - Create new project
 * GET /api/projects - List all projects with filters
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, createSuccessResponse } from "@/lib/api/errors";
import { validateBody, validateQueryParams } from "@/lib/api/validation";
import {
  createProjectSchema,
  listProjectsQuerySchema,
} from "@/lib/schemas/projects";

/**
 * POST /api/projects
 * Create a new project
 */
export async function POST(request: NextRequest) {
  try {
    const data = await validateBody(request, createProjectSchema);

    // If research_id is provided, verify it exists
    if (data.research_id) {
      const research = await prisma.researchArchive.findUnique({
        where: { id: data.research_id },
      });

      if (!research) {
        return createSuccessResponse(
          {
            error: {
              message: "Research not found",
              code: "RESEARCH_NOT_FOUND",
            },
          },
          404,
        );
      }

      // Increment projects_count for the research
      await prisma.researchArchive.update({
        where: { id: data.research_id },
        data: { projects_count: { increment: 1 } },
      });
    }

    const project = await prisma.project.create({
      data: {
        title: data.title,
        research_id: data.research_id,
        current_stage: data.current_stage,
        auto_advance: data.auto_advance,
        status: data.status,
        winner: data.winner,
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

    return createSuccessResponse(project, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/projects
 * List all projects with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const params = validateQueryParams(url, listProjectsQuerySchema);

    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: {
      status?: string;
      current_stage?: string;
      winner?: boolean;
      research_id?: string;
      title?: { contains: string; mode: "insensitive" };
    } = {};

    if (params.status) {
      where.status = params.status;
    }

    if (params.current_stage) {
      where.current_stage = params.current_stage;
    }

    if (params.winner !== undefined) {
      where.winner = params.winner;
    }

    if (params.research_id) {
      where.research_id = params.research_id;
    }

    if (params.search) {
      where.title = {
        contains: params.search,
        mode: "insensitive",
      };
    }

    // Build orderBy clause
    const orderBy: Record<string, "asc" | "desc"> = {};
    orderBy[params.sort || "created_at"] = params.order || "desc";

    // Execute query with pagination
    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        orderBy,
        skip,
        take: limit,
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
      }),
      prisma.project.count({ where }),
    ]);

    return createSuccessResponse({
      projects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
