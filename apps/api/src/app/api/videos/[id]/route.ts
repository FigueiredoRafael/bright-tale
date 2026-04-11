/**
 * Video Draft API - Individual operations
 * GET    /api/videos/[id] - Get a specific video draft
 * PUT    /api/videos/[id] - Update a video draft
 * DELETE /api/videos/[id] - Delete a video draft
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import { createSuccessResponse, createErrorResponse } from "@/lib/api/errors";
import { updateVideoSchema } from "@brighttale/shared/schemas/videos";
import { z } from "zod";
import type { VideoOutput } from "@brighttale/shared/types/agents";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const sb = createServiceClient();
    const { id } = await params;

    const { data: video, error } = await sb.from('video_drafts').select('*').eq('id', id).maybeSingle();
    if (error) throw error;

    if (!video) {
      return NextResponse.json(createErrorResponse("Video not found", 404), { status: 404 });
    }

    const videoOutput: VideoOutput = {
      title_options: video.title_options,
      thumbnail: video.thumbnail_json ? JSON.parse(video.thumbnail_json) : undefined,
      script: video.script_json ? JSON.parse(video.script_json) : undefined,
      total_duration_estimate: video.total_duration_estimate ?? "",
    };

    return createSuccessResponse({
      video: {
        id: video.id,
        title: video.title,
        ...videoOutput,
        word_count: video.word_count,
        status: video.status,
        project_id: video.project_id,
        idea_id: video.idea_id,
        created_at: video.created_at,
        updated_at: video.updated_at,
      },
    });
  } catch (error) {
    console.error("Failed to get video:", error);
    return NextResponse.json(createErrorResponse("Failed to get video", 500), { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const body = await request.json();
    const data = updateVideoSchema.parse(body);

    const { data: existing, error: findErr } = await sb.from('video_drafts').select('id').eq('id', id).maybeSingle();
    if (findErr) throw findErr;
    if (!existing) {
      return NextResponse.json(createErrorResponse("Video not found", 404), { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.title_options !== undefined) updateData.title_options = data.title_options;
    if (data.thumbnail !== undefined) updateData.thumbnail_json = JSON.stringify(data.thumbnail);
    if (data.script !== undefined) updateData.script_json = JSON.stringify(data.script);
    if (data.total_duration_estimate !== undefined) updateData.total_duration_estimate = data.total_duration_estimate;
    if (data.word_count !== undefined) updateData.word_count = data.word_count;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.project_id !== undefined) updateData.project_id = data.project_id;
    if (data.idea_id !== undefined) updateData.idea_id = data.idea_id;

    const { data: video, error } = await sb.from('video_drafts').update(updateData as any).eq('id', id).select().single();
    if (error) throw error;

    return createSuccessResponse({ video });
  } catch (error) {
    console.error("Failed to update video:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        createErrorResponse("Validation failed: " + error.issues.map((e) => e.message).join(", "), 400),
        { status: 400 },
      );
    }
    return NextResponse.json(createErrorResponse("Failed to update video", 500), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const sb = createServiceClient();
    const { id } = await params;

    const { data: existing, error: findErr } = await sb.from('video_drafts').select('id').eq('id', id).maybeSingle();
    if (findErr) throw findErr;
    if (!existing) {
      return NextResponse.json(createErrorResponse("Video not found", 404), { status: 404 });
    }

    const { error } = await sb.from('video_drafts').delete().eq('id', id);
    if (error) throw error;
    return createSuccessResponse({ deleted: true });
  } catch (error) {
    console.error("Failed to delete video:", error);
    return NextResponse.json(createErrorResponse("Failed to delete video", 500), { status: 500 });
  }
}
