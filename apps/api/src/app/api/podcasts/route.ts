/**
 * Podcast Library API
 * GET  /api/podcasts - List all podcast drafts
 * POST /api/podcasts - Create a new podcast draft
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import { createSuccessResponse, createErrorResponse } from "@/lib/api/errors";
import { createPodcastSchema, podcastQuerySchema } from "@brighttale/shared/schemas/podcasts";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const { searchParams } = new URL(request.url);
    const query = podcastQuerySchema.parse(Object.fromEntries(searchParams));
    const { status, project_id, idea_id, search, page = 1, limit = 20 } = query;

    let countQuery = sb.from('podcast_drafts').select('*', { count: 'exact', head: true });
    let dataQuery = sb.from('podcast_drafts').select('id, episode_title, episode_description, duration_estimate, word_count, status, project_id, idea_id, created_at, updated_at');

    if (status) { countQuery = countQuery.eq('status', status); dataQuery = dataQuery.eq('status', status); }
    if (project_id) { countQuery = countQuery.eq('project_id', project_id); dataQuery = dataQuery.eq('project_id', project_id); }
    if (idea_id) { countQuery = countQuery.eq('idea_id', idea_id); dataQuery = dataQuery.eq('idea_id', idea_id); }
    if (search) { countQuery = countQuery.ilike('episode_title', `%${search}%`); dataQuery = dataQuery.ilike('episode_title', `%${search}%`); }

    const [{ count: total, error: countErr }, { data: podcasts, error: dataErr }] = await Promise.all([
      countQuery,
      dataQuery.order('updated_at', { ascending: false }).range((page - 1) * limit, page * limit - 1),
    ]);

    if (countErr) throw countErr;
    if (dataErr) throw dataErr;

    return createSuccessResponse({
      podcasts,
      pagination: { page, limit, total: total ?? 0, total_pages: Math.ceil((total ?? 0) / limit) },
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
    const sb = createServiceClient();
    const body = await request.json();
    const data = createPodcastSchema.parse(body);

    const wordCount = data.word_count ?? [
      data.intro_hook,
      data.personal_angle,
      data.outro,
      ...data.talking_points.map((tp) => `${tp.point} ${tp.notes}`),
    ]
      .join(" ")
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    const { data: podcast, error } = await sb.from('podcast_drafts').insert({
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
    }).select().single();

    if (error) throw error;

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
