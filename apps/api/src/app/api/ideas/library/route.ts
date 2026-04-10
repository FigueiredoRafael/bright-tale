import { NextRequest } from "next/server";
import { validateBody, validateQueryParams } from "@/lib/api/validation";
import { handleApiError, createSuccessResponse } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import {
  listIdeasQuerySchema,
  createIdeaSchema,
  calculateSimilarity,
  type SimilarityWarning,
} from "@/lib/schemas/ideas";

const SIMILARITY_THRESHOLD = 80;

/**
 * GET /api/ideas/library
 * List ideas from the global library with filtering
 */
export async function GET(request: NextRequest) {
  try {
    const query = validateQueryParams(request.nextUrl, listIdeasQuerySchema);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (query.verdict) {
      where.verdict = query.verdict;
    }

    if (query.source_type) {
      where.source_type = query.source_type;
    }

    if (query.is_public !== undefined) {
      where.is_public = query.is_public;
    }

    if (query.tags) {
      const tagArray = query.tags.split(",").map(t => t.trim());
      where.tags = { hasSome: tagArray };
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: "insensitive" } },
        { core_tension: { contains: query.search, mode: "insensitive" } },
        { target_audience: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [ideas, total] = await Promise.all([
      prisma.ideaArchive.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      prisma.ideaArchive.count({ where }),
    ]);

    return createSuccessResponse({
      ideas,
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

/**
 * POST /api/ideas/library
 * Create a new idea in the library with similarity checking
 */
export async function POST(request: NextRequest) {
  try {
    const data = await validateBody(request, createIdeaSchema);

    // Check for similar existing ideas
    const existingIdeas = await prisma.ideaArchive.findMany({
      select: { id: true, title: true, idea_id: true },
    });

    const warnings: SimilarityWarning[] = [];
    for (const existing of existingIdeas) {
      const similarity = calculateSimilarity(data.title, existing.title);
      if (similarity >= SIMILARITY_THRESHOLD) {
        warnings.push({
          type: "similar",
          existing_id: existing.id,
          existing_title: existing.title,
          similarity,
        });
      }
    }

    // Generate idea_id if not provided
    let ideaId = data.idea_id;
    if (!ideaId) {
      const count = await prisma.ideaArchive.count();
      ideaId = `BC-IDEA-${String(count + 1).padStart(3, "0")}`;
    }

    // Check if idea_id already exists
    const existingIdeaId = await prisma.ideaArchive.findUnique({
      where: { idea_id: ideaId },
    });

    if (existingIdeaId) {
      // Generate a new unique ID
      const allIdeas = await prisma.ideaArchive.findMany({
        select: { idea_id: true },
      });
      const maxNum = allIdeas.reduce((max, i) => {
        const match = i.idea_id.match(/BC-IDEA-(\d+)/);
        return match ? Math.max(max, parseInt(match[1])) : max;
      }, 0);
      ideaId = `BC-IDEA-${String(maxNum + 1).padStart(3, "0")}`;
    }

    const idea = await prisma.ideaArchive.create({
      data: {
        idea_id: ideaId,
        title: data.title,
        core_tension: data.core_tension,
        target_audience: data.target_audience,
        verdict: data.verdict,
        discovery_data: data.discovery_data ?? "",
        source_type: data.source_type,
        source_project_id: data.source_project_id,
        tags: data.tags ?? [],
        is_public: data.is_public ?? true,
        markdown_content: data.markdown_content,
      },
    });

    const response: { idea: typeof idea; warnings?: SimilarityWarning[] } = {
      idea,
    };

    if (warnings.length > 0) {
      response.warnings = warnings;
    }

    return createSuccessResponse(response, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
