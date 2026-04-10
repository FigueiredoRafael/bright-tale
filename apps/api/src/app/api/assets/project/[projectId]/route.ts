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
// TODO-supabase: import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new ApiError(404, "Project not found");
    }

    // Get all assets for the project
    const assets = await prisma.asset.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json(
      createSuccessResponse({
        assets,
        count: assets.length,
      }),
      { status: 200 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
