/**
 * Shorts Library API
 * GET  /api/shorts - List all shorts drafts
 * POST /api/shorts - Create a new shorts draft
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSuccessResponse, createErrorResponse } from "@/lib/api/errors";
import { createShortsSchema, shortsQuerySchema } from "@/lib/schemas/shorts";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = shortsQuerySchema.parse(Object.fromEntries(searchParams));
    const { status, project_id, idea_id, page = 1, limit = 20 } = query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (project_id) where.project_id = project_id;
    if (idea_id) where.idea_id = idea_id;

    const total = await prisma.shortsDraft.count({ where });

    const shorts = await prisma.shortsDraft.findMany({
      where,
      orderBy: { updated_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        short_count: true,
        total_duration: true,
        status: true,
        project_id: true,
        idea_id: true,
        created_at: true,
        updated_at: true,
      },
    });

    return createSuccessResponse({
      shorts,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Failed to list shorts:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(createErrorResponse("Invalid query parameters", 400), { status: 400 });
    }
    return NextResponse.json(createErrorResponse("Failed to list shorts", 500), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createShortsSchema.parse(body);

    const shorts = await prisma.shortsDraft.create({
      data: {
        shorts_json: JSON.stringify(data.shorts),
        short_count: data.shorts.length,
        total_duration: data.total_duration,
        status: data.status,
        project_id: data.project_id,
        idea_id: data.idea_id,
      },
    });

    return createSuccessResponse({ shorts }, 201);
  } catch (error) {
    console.error("Failed to create shorts:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        createErrorResponse("Validation failed: " + error.issues.map((e) => e.message).join(", "), 400),
        { status: 400 },
      );
    }
    return NextResponse.json(createErrorResponse("Failed to create shorts", 500), { status: 500 });
  }
}
