/**
 * POST /api/assets - Save a new (unsplash/upload) asset
 * GET  /api/assets - List all assets with optional filters
 *   ?projectId=  ?contentType=  ?role=  ?source=  ?page=  ?limit=
 */
import { NextRequest, NextResponse } from "next/server";
import { saveAssetSchema } from "@/lib/schemas/assets";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const contentType = searchParams.get("contentType");
    const role = searchParams.get("role");
    const source = searchParams.get("source");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));

    const where: Record<string, unknown> = {};
    if (projectId) where.project_id = projectId;
    if (contentType) where.content_type = contentType;
    if (role) where.role = role;
    if (source) where.source = source;

    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.asset.count({ where }),
    ]);

    return NextResponse.json({ assets, total, page, limit });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await validateBody(request, saveAssetSchema);

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: body.project_id },
    });

    if (!project) {
      throw new ApiError(404, "Project not found");
    }

    // Create asset
    const asset = await prisma.asset.create({
      data: {
        project_id: body.project_id,
        asset_type: body.asset_type,
        source: body.source,
        source_url: body.source_url,
        alt_text: body.alt_text,
        wordpress_id: body.wordpress_id,
        wordpress_url: body.wordpress_url,
      },
    });

    return NextResponse.json(createSuccessResponse(asset), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
