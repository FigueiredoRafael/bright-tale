/**
 * Research Sources API Routes
 * POST /api/research/[id]/sources - Add source to research
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { addSourceSchema } from "@brighttale/shared/schemas/research";

/**
 * POST /api/research/[id]/sources
 * Add a new source to research
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const data = await validateBody(request, addSourceSchema);

    // Check if research exists
    const { data: research, error: findErr } = await sb
      .from('research_archives')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (findErr) throw findErr;

    if (!research) {
      throw new ApiError(404, "Research not found", "NOT_FOUND");
    }

    const { data: source, error } = await sb
      .from('research_sources')
      .insert({
        research_id: id,
        url: data.url,
        title: data.title,
        author: data.author,
        date: data.date ? new Date(data.date).toISOString() : null,
      })
      .select()
      .single();

    if (error) throw error;

    return createSuccessResponse(source, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
