import { NextRequest } from "next/server";
import { validateBody } from "@/lib/api/validation";
import {
  handleApiError,
  createSuccessResponse,
  createErrorResponse,
} from "@/lib/api/errors";
import { createServiceClient } from '@/lib/supabase';
import { updateIdeaSchema } from "@brighttale/shared/schemas/ideas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/ideas/library/[id]
 * Get a single idea by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sb = createServiceClient();
    const { id } = await params;

    const { data: idea, error } = await sb.from('idea_archives').select('*').eq('id', id).maybeSingle();
    if (error) throw error;

    if (!idea) {
      return createErrorResponse("Idea not found", 404);
    }

    return createSuccessResponse({ idea });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/ideas/library/[id]
 * Update an existing idea
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const data = await validateBody(request, updateIdeaSchema);

    const { data: existing, error: findErr } = await sb.from('idea_archives').select('id').eq('id', id).maybeSingle();
    if (findErr) throw findErr;

    if (!existing) {
      return createErrorResponse("Idea not found", 404);
    }

    const updateData: Record<string, unknown> = {};
    if (data.title) updateData.title = data.title;
    if (data.core_tension) updateData.core_tension = data.core_tension;
    if (data.target_audience) updateData.target_audience = data.target_audience;
    if (data.verdict) updateData.verdict = data.verdict;
    if (data.discovery_data !== undefined) updateData.discovery_data = data.discovery_data;
    if (data.tags) updateData.tags = data.tags;
    if (data.is_public !== undefined) updateData.is_public = data.is_public;
    if (data.markdown_content !== undefined) updateData.markdown_content = data.markdown_content;

    const { data: idea, error } = await sb.from('idea_archives').update(updateData as any).eq('id', id).select().single();
    if (error) throw error;

    return createSuccessResponse({ idea });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/ideas/library/[id]
 * Delete an idea from the library
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sb = createServiceClient();
    const { id } = await params;

    const { data: existing, error: findErr } = await sb.from('idea_archives').select('id').eq('id', id).maybeSingle();
    if (findErr) throw findErr;

    if (!existing) {
      return createErrorResponse("Idea not found", 404);
    }

    const { error } = await sb.from('idea_archives').delete().eq('id', id);
    if (error) throw error;

    return createSuccessResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
