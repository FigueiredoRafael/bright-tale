/**
 * Podcast Draft API - Individual operations
 * GET    /api/podcasts/[id]
 * PUT    /api/podcasts/[id]
 * DELETE /api/podcasts/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import { createSuccessResponse, createErrorResponse } from "@/lib/api/errors";
import { updatePodcastSchema } from "@brighttale/shared/schemas/podcasts";
import { z } from "zod";
import type { PodcastOutput } from "@brighttale/shared/types/agents";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const { data: draft, error } = await sb.from('podcast_drafts').select('*').eq('id', id).maybeSingle();
    if (error) throw error;

    if (!draft) {
      return NextResponse.json(createErrorResponse("Podcast not found", 404), { status: 404 });
    }

    const podcastOutput: PodcastOutput = {
      episode_title: draft.episode_title,
      episode_description: draft.episode_description,
      intro_hook: draft.intro_hook,
      talking_points: JSON.parse(draft.talking_points_json),
      personal_angle: draft.personal_angle,
      guest_questions: draft.guest_questions,
      outro: draft.outro,
      duration_estimate: draft.duration_estimate ?? "",
    };

    return createSuccessResponse({
      podcast: {
        id: draft.id,
        ...podcastOutput,
        word_count: draft.word_count,
        status: draft.status,
        project_id: draft.project_id,
        idea_id: draft.idea_id,
        created_at: draft.created_at,
        updated_at: draft.updated_at,
      },
    });
  } catch (error) {
    console.error("Failed to get podcast:", error);
    return NextResponse.json(createErrorResponse("Failed to get podcast", 500), { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const body = await request.json();
    const data = updatePodcastSchema.parse(body);

    const { data: existing, error: findErr } = await sb.from('podcast_drafts').select('id').eq('id', id).maybeSingle();
    if (findErr) throw findErr;
    if (!existing) {
      return NextResponse.json(createErrorResponse("Podcast not found", 404), { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (data.episode_title !== undefined) updateData.episode_title = data.episode_title;
    if (data.episode_description !== undefined) updateData.episode_description = data.episode_description;
    if (data.intro_hook !== undefined) updateData.intro_hook = data.intro_hook;
    if (data.talking_points !== undefined) updateData.talking_points_json = JSON.stringify(data.talking_points);
    if (data.personal_angle !== undefined) updateData.personal_angle = data.personal_angle;
    if (data.guest_questions !== undefined) updateData.guest_questions = data.guest_questions;
    if (data.outro !== undefined) updateData.outro = data.outro;
    if (data.duration_estimate !== undefined) updateData.duration_estimate = data.duration_estimate;
    if (data.word_count !== undefined) updateData.word_count = data.word_count;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.project_id !== undefined) updateData.project_id = data.project_id;
    if (data.idea_id !== undefined) updateData.idea_id = data.idea_id;

    const { data: updated, error } = await sb.from('podcast_drafts').update(updateData as any).eq('id', id).select().single();
    if (error) throw error;
    return createSuccessResponse({ podcast: updated });
  } catch (error) {
    console.error("Failed to update podcast:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        createErrorResponse("Validation failed: " + error.issues.map((e) => e.message).join(", "), 400),
        { status: 400 },
      );
    }
    return NextResponse.json(createErrorResponse("Failed to update podcast", 500), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const { data: existing, error: findErr } = await sb.from('podcast_drafts').select('id').eq('id', id).maybeSingle();
    if (findErr) throw findErr;
    if (!existing) {
      return NextResponse.json(createErrorResponse("Podcast not found", 404), { status: 404 });
    }
    const { error } = await sb.from('podcast_drafts').delete().eq('id', id);
    if (error) throw error;
    return createSuccessResponse({ deleted: true });
  } catch (error) {
    console.error("Failed to delete podcast:", error);
    return NextResponse.json(createErrorResponse("Failed to delete podcast", 500), { status: 500 });
  }
}
