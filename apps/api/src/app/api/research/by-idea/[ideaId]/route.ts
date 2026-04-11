/**
 * Research by Idea API Route
 * GET /api/research/by-idea/[ideaId] - Find research linked to a specific idea
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
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
    const sb = createServiceClient();
    const { ideaId } = await params;

    if (!ideaId) {
      return new Response(JSON.stringify({ error: "ideaId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Search for research entries where research_content contains the idea_id
    // Use multiple OR conditions via Supabase
    const { data: research, error } = await sb
      .from('research_archives')
      .select('*, sources:research_sources(*), projects(count)')
      .or(`research_content.cs."idea_id":"${ideaId}",research_content.cs."idea_id": "${ideaId}",title.ilike.%${ideaId}%`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return createSuccessResponse({
      idea_id: ideaId,
      count: (research ?? []).length,
      research,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
