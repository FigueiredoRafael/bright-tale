/**
 * Podcast Library API
 * GET  /api/podcasts - List all podcast drafts
 * POST /api/podcasts - Create a new podcast draft
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSuccessResponse, createErrorResponse } from "@/lib/api/errors";
import { createPodcastSchema, podcastQuerySchema } from "@/lib/schemas/podcasts";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = podcastQuerySchema.parse(Object.fromEntries(searchParams));
    const { status, project_id, idea_id, search, page = 1, limit = 20 } = query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (project_id) where.project_id = project_id;
    if (idea_id) where.idea_id = idea_id;
    if (search) {
      where.OR = [
        { episode_title: { contains: search, mode: "insensitive" } },
      ];
    }

    const total = await prisma.podcastDraft.count({ where });

    const podcasts = await prisma.podcastDraft.findMany({
      where,
      orderBy: { updated_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        episode_title: true,
        episode_description: true,
        duration_estimate: true,
        word_count: true,
        status: true,
        project_id: true,
        idea_id: true,
        created_at: true,
        updated_at: true,
      },
    });

    return createSuccessResponse({
      podcasts,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Failed to list podcasts:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(createErrorResponse("Invalid query parameters", 400), { status: 400 });
    }
    return NextResponse.json(createErrorResponse("Failed to list podcasts", 500), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createPodcastSchema.parse(body);

    // Calculate word count from spoken content
    const wordCount = data.word_count ?? [
      data.intro_hook,
      data.personal_angle,
      data.outro,
      ...data.talking_points.map((tp) => `${tp.point} ${tp.notes}`),
    ]
      .join(" ")
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    const podcast = await prisma.podcastDraft.create({
      data: {
        episode_title: data.episode_title,
        episode_description: data.episode_description,
        intro_hook: data.intro_hook,
        talking_points_json: JSON.stringify(data.talking_points),
        personal_angle: data.personal_angle,
        guest_questions: data.guest_questions,
        outro: data.outro,
        duration_estimate: data.duration_estimate,
        word_count: wordCount,
        status: data.status,
        project_id: data.project_id,
        idea_id: data.idea_id,
      },
    });

    return createSuccessResponse({ podcast }, 201);
  } catch (error) {
    console.error("Failed to create podcast:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        createErrorResponse("Validation failed: " + error.issues.map((e) => e.message).join(", "), 400),
        { status: 400 },
      );
    }
    return NextResponse.json(createErrorResponse("Failed to create podcast", 500), { status: 500 });
  }
}
