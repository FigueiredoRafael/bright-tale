/**
 * GET /api/assets/project/[projectId]
 * Get all assets for a project
 */
import { NextRequest, NextResponse } from "next/server";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { createServiceClient } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const sb = createServiceClient();
    const { projectId } = await params;

    // Verify project exists
    const { data: project, error: projErr } = await sb
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle();

    if (projErr) throw projErr;

    if (!project) {
      throw new ApiError(404, "Project not found");
    }

    // Get all assets for the project
    const { data: assets, error } = await sb
      .from('assets')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(
      createSuccessResponse({
        assets,
        count: (assets ?? []).length,
      }),
      { status: 200 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
