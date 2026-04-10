/**
 * Research API Routes
 * POST /api/research - Create new research
 * GET /api/research - List all research with filters
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, createSuccessResponse } from "@/lib/api/errors";
import { validateBody, validateQueryParams } from "@/lib/api/validation";
import {
  createResearchSchema,
  listResearchQuerySchema,
} from "@/lib/schemas/research";

/**
 * POST /api/research
 * Create a new research entry
 */
export async function POST(request: NextRequest) {
  try {
    const data = await validateBody(request, createResearchSchema);

    // If idea_id is provided, embed it in the research_content JSON
    let researchContent = data.research_content;
    if (data.idea_id) {
      try {
        const parsed = JSON.parse(data.research_content);
        parsed.idea_id = data.idea_id;
        researchContent = JSON.stringify(parsed);
      } catch {
        // If research_content isn't valid JSON, wrap it
        researchContent = JSON.stringify({
          idea_id: data.idea_id,
          content: data.research_content,
        });
      }
    }

    const research = await prisma.researchArchive.create({
      data: {
        title: data.title,
        theme: data.theme,
        research_content: researchContent,
      },
      include: {
        sources: true,
      },
    });

    return createSuccessResponse(research, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/research
 * List all research with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const params = validateQueryParams(url, listResearchQuerySchema);

    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: {
      theme?: { contains: string; mode: "insensitive" };
      OR?: Array<{
        title?: { contains: string; mode: "insensitive" };
        research_content?: { contains: string; mode: "insensitive" };
      }>;
    } = {};

    if (params.theme) {
      where.theme = {
        contains: params.theme,
        mode: "insensitive",
      };
    }

    if (params.search) {
      where.OR = [
        {
          title: {
            contains: params.search,
            mode: "insensitive",
          },
        },
        {
          research_content: {
            contains: params.search,
            mode: "insensitive",
          },
        },
      ];
    }

    // Build orderBy clause
    const orderBy: Record<string, "asc" | "desc"> = {};
    orderBy[params.sort || "created_at"] = params.order || "desc";

    // Execute query with pagination
    const [research, total] = await Promise.all([
      prisma.researchArchive.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          sources: true,
          _count: {
            select: {
              projects: true,
              sources: true,
            },
          },
        },
      }),
      prisma.researchArchive.count({ where }),
    ]);

    return createSuccessResponse({
      data: research,
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
