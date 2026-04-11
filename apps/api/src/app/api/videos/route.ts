/**
 * Video Library API
 * GET  /api/videos - List all video drafts
 * POST /api/videos - Create a new video draft
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import { createSuccessResponse, createErrorResponse } from "@/lib/api/errors";
import { createVideoSchema, videoQuerySchema } from "@brighttale/shared/schemas/videos";
import { z } from "zod";
import type { VideoOutput } from "@brighttale/shared/types/agents";

export async function GET(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const { searchParams } = new URL(request.url);
    const query = videoQuerySchema.parse(Object.fromEntries(searchParams));

    const { status, project_id, idea_id, search, page = 1, limit = 20 } = query;

    let countQuery = sb.from('video_drafts').select('*', { count: 'exact', head: true });
    let dataQuery = sb.from('video_drafts').select('id, title, title_options, total_duration_estimate, word_count, status, project_id, idea_id, created_at, updated_at');

    if (status) { countQuery = countQuery.eq('status', status); dataQuery = dataQuery.eq('status', status); }
    if (project_id) { countQuery = countQuery.eq('project_id', project_id); dataQuery = dataQuery.eq('project_id', project_id); }
    if (idea_id) { countQuery = countQuery.eq('idea_id', idea_id); dataQuery = dataQuery.eq('idea_id', idea_id); }
    if (search) { countQuery = countQuery.ilike('title', `%${search}%`); dataQuery = dataQuery.ilike('title', `%${search}%`); }

    const [{ count: total, error: countErr }, { data: videos, error: dataErr }] = await Promise.all([
      countQuery,
      dataQuery.order('updated_at', { ascending: false }).range((page - 1) * limit, page * limit - 1),
    ]);

    if (countErr) throw countErr;
    if (dataErr) throw dataErr;

    return createSuccessResponse({
      videos,
      pagination: {
        page,
        limit,
        total: total ?? 0,
        total_pages: Math.ceil((total ?? 0) / limit),
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
    const sb = createServiceClient();
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

    const { data: video, error } = await sb.from('video_drafts').insert({
      title: data.title,
      title_options: data.title_options,
      thumbnail_json: data.thumbnail ? JSON.stringify(data.thumbnail) : null,
      script_json: JSON.stringify(data.script),
      total_duration_estimate: data.total_duration_estimate,
      word_count: wordCount,
      status: data.status,
      project_id: data.project_id,
      idea_id: data.idea_id,
    }).select().single();

    if (error) throw error;

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
