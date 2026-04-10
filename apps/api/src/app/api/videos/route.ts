/**
 * Video Library API
 * GET  /api/videos - List all video drafts
 * POST /api/videos - Create a new video draft
 */

import { NextRequest, NextResponse } from "next/server";
// TODO-supabase: import { prisma } from "@/lib/prisma";
import { createSuccessResponse, createErrorResponse } from "@/lib/api/errors";
import { createVideoSchema, videoQuerySchema } from "@brighttale/shared/schemas/videos";
import { z } from "zod";
import type { VideoOutput } from "@brighttale/shared/types/agents";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = videoQuerySchema.parse(Object.fromEntries(searchParams));

    const { status, project_id, idea_id, search, page = 1, limit = 20 } = query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (project_id) where.project_id = project_id;
    if (idea_id) where.idea_id = idea_id;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
      ];
    }

    const total = await prisma.videoDraft.count({ where });

    const videos = await prisma.videoDraft.findMany({
      where,
      orderBy: { updated_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        title_options: true,
        total_duration_estimate: true,
        word_count: true,
        status: true,
        project_id: true,
        idea_id: true,
        created_at: true,
        updated_at: true,
      },
    });

    return createSuccessResponse({
      videos,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to list videos:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        createErrorResponse("Invalid query parameters", 400),
        { status: 400 },
      );
    }
    return NextResponse.json(createErrorResponse("Failed to list videos", 500), {
      status: 500,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createVideoSchema.parse(body);

    // Build video output for storage
    const videoOutput: VideoOutput = {
      title_options: data.title_options,
      thumbnail: data.thumbnail,
      script: data.script,
      total_duration_estimate: data.total_duration_estimate,
    };

    // Calculate spoken word count from script sections
    const wordCount = data.word_count ?? calculateVideoWordCount(videoOutput);

    const video = await prisma.videoDraft.create({
      data: {
        title: data.title,
        title_options: data.title_options,
        thumbnail_json: data.thumbnail ? JSON.stringify(data.thumbnail) : null,
        script_json: JSON.stringify(data.script),
        total_duration_estimate: data.total_duration_estimate,
        word_count: wordCount,
        status: data.status,
        project_id: data.project_id,
        idea_id: data.idea_id,
      },
    });

    return createSuccessResponse({ video }, 201);
  } catch (error) {
    console.error("Failed to create video:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        createErrorResponse(
          "Validation failed: " + error.issues.map((e) => e.message).join(", "),
          400,
        ),
        { status: 400 },
      );
    }
    return NextResponse.json(
      createErrorResponse("Failed to create video", 500),
      { status: 500 },
    );
  }
}

function calculateVideoWordCount(video: VideoOutput): number {
  if (!video.script) return 0;
  const { hook, problem, teaser, chapters, affiliate_segment, outro } = video.script;
  const sections = [
    hook?.content,
    problem?.content,
    teaser?.content,
    ...(chapters?.map((c) => c.content) ?? []),
    affiliate_segment?.script,
    outro?.recap,
    outro?.cta,
  ].filter(Boolean);
  return sections
    .join(" ")
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}
