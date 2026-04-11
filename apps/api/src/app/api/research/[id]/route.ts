/**
 * Research Detail API Routes
 * GET /api/research/[id] - Get research details
 * PUT /api/research/[id] - Update research
 * DELETE /api/research/[id] - Delete research
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { updateResearchSchema } from "@brighttale/shared/schemas/research";

/**
 * GET /api/research/[id]
 * Get research details by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const { data: research, error } = await sb
      .from('research_archives')
      .select('*, sources:research_sources(*, count:id), projects(id, title, status, winner, created_at)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;

    if (!research) {
      throw new ApiError(404, "Research not found", "NOT_FOUND");
    }

    return createSuccessResponse(research);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/research/[id]
 * Update research by ID
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const data = await validateBody(request, updateResearchSchema);

    // Check if research exists
    const { data: existing, error: findErr } = await sb
      .from('research_archives')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (findErr) throw findErr;

    if (!existing) {
      throw new ApiError(404, "Research not found", "NOT_FOUND");
    }

    const updateData: Record<string, unknown> = {};
    if (data.title) updateData.title = data.title;
    if (data.theme) updateData.theme = data.theme;
    if (data.research_content) updateData.research_content = data.research_content;

    const { data: research, error } = await sb
      .from('research_archives')
      .update(updateData as any)
      .eq('id', id)
      .select('*, sources:research_sources(*)')
      .single();

    if (error) throw error;

    return createSuccessResponse(research);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/research/[id]
 * Delete research by ID
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;

    // Check if research exists and get project count
    const { data: existing, error: findErr } = await sb
      .from('research_archives')
      .select('id, projects(count)')
      .eq('id', id)
      .maybeSingle();

    if (findErr) throw findErr;

    if (!existing) {
      throw new ApiError(404, "Research not found", "NOT_FOUND");
    }

    // Check if research is used by any projects
    const projectCount = (existing as any).projects?.[0]?.count ?? 0;
    if (projectCount > 0) {
      throw new ApiError(
        400,
        `Cannot delete research that is used by ${projectCount} project(s)`,
        "RESEARCH_IN_USE",
      );
    }

    const { error } = await sb.from('research_archives').delete().eq('id', id);
    if (error) throw error;

    return createSuccessResponse({
      success: true,
      message: "Research deleted successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
