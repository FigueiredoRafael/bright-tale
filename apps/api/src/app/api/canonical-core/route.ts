/**
 * Canonical Core API
 * GET  /api/canonical-core          — List canonical cores (filterable by idea_id, project_id)
 * POST /api/canonical-core          — Create a new canonical core
 */

import { NextRequest, NextResponse } from "next/server";
// TODO-supabase: import { prisma } from "@/lib/prisma";
import { createSuccessResponse, createErrorResponse } from "@/lib/api/errors";
import { z } from "zod";
import { createCanonicalCoreSchema } from "@brighttale/shared/schemas/canonicalCoreApi";

const listQuerySchema = z.object({
  idea_id: z.string().optional(),
  project_id: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.parse(Object.fromEntries(searchParams));
    const { idea_id, project_id, page, limit } = query;

    const where: Record<string, unknown> = {};
    if (idea_id) where.idea_id = idea_id;
    if (project_id) where.project_id = project_id;

    const total = await prisma.canonicalCore.count({ where });
    const cores = await prisma.canonicalCore.findMany({
      where,
      orderBy: { updated_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        idea_id: true,
        project_id: true,
        thesis: true,
        cta_subscribe: true,
        cta_comment_prompt: true,
        created_at: true,
        updated_at: true,
      },
    });

    return createSuccessResponse({
      canonical_cores: cores,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Failed to list canonical cores:", error);
    if (error instanceof z.ZodError) {
      return createErrorResponse("Invalid query parameters: " + error.issues.map(i => i.message).join(", "), 400);
    }
    return createErrorResponse("Failed to list canonical cores", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createCanonicalCoreSchema.parse(body);

    const core = await prisma.canonicalCore.create({
      data: {
        idea_id: data.idea_id,
        project_id: data.project_id,
        thesis: data.thesis,
        argument_chain_json: JSON.stringify(data.argument_chain),
        emotional_arc_json: JSON.stringify(data.emotional_arc),
        key_stats_json: JSON.stringify(data.key_stats),
        key_quotes_json: data.key_quotes ? JSON.stringify(data.key_quotes) : null,
        affiliate_moment_json: data.affiliate_moment
          ? JSON.stringify(data.affiliate_moment)
          : null,
        cta_subscribe: data.cta_subscribe,
        cta_comment_prompt: data.cta_comment_prompt,
      },
    });

    return createSuccessResponse({ canonical_core: core }, 201);
  } catch (error) {
    console.error("Failed to create canonical core:", error);
    if (error instanceof z.ZodError) {
      return createErrorResponse("Validation failed: " + error.issues.map(i => i.message).join(", "), 400);
    }
    return createErrorResponse("Failed to create canonical core", 500);
  }
}
