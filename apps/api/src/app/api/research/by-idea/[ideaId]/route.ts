/**
 * Research by Idea API Route
 * GET /api/research/by-idea/[ideaId] - Find research linked to a specific idea
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, createSuccessResponse } from "@/lib/api/errors";

interface RouteParams {
  params: Promise<{ ideaId: string }>;
}

/**
 * GET /api/research/by-idea/[ideaId]
 * Search for research entries that contain the given idea_id in their research_content
 * Returns matches sorted by most recent first
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { ideaId } = await params;

    if (!ideaId) {
      return new Response(JSON.stringify({ error: "ideaId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Search for research entries where research_content contains the idea_id
    // The idea_id can be stored either as a direct field or within the JSON content
    const research = await prisma.researchArchive.findMany({
      where: {
        OR: [
          // Search in research_content JSON for idea_id field
          {
            research_content: {
              contains: `"idea_id":"${ideaId}"`,
            },
          },
          // Also search with different JSON formatting (spaces after colon)
          {
            research_content: {
              contains: `"idea_id": "${ideaId}"`,
            },
          },
          // Search in title if idea title was used
          {
            title: {
              contains: ideaId,
              mode: "insensitive",
            },
          },
        ],
      },
      orderBy: {
        created_at: "desc",
      },
      include: {
        sources: true,
        _count: {
          select: {
            projects: true,
          },
        },
      },
    });

    return createSuccessResponse({
      idea_id: ideaId,
      count: research.length,
      research,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
