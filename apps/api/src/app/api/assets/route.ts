/**
 * POST /api/assets - Save a new (unsplash/upload) asset
 * GET  /api/assets - List all assets with optional filters
 *   ?projectId=  ?contentType=  ?role=  ?source=  ?page=  ?limit=
 */
import { NextRequest, NextResponse } from "next/server";
import { saveAssetSchema } from "@brighttale/shared/schemas/assets";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { createServiceClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const sb = createServiceClient();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const contentType = searchParams.get("contentType");
    const role = searchParams.get("role");
    const source = searchParams.get("source");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));

    let query = sb.from('assets').select('*', { count: 'exact' });
    if (projectId) query = query.eq('project_id', projectId);
    if (contentType) query = query.eq('content_type', contentType);
    if (role) query = query.eq('role', role);
    if (source) query = query.eq('source', source);

    const { data: assets, count, error } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;

    return NextResponse.json({ assets, total: count ?? 0, page, limit });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const body = await validateBody(request, saveAssetSchema);

    // Verify project exists
    const { data: project, error: projErr } = await sb
      .from('projects')
      .select('id')
      .eq('id', body.project_id)
      .maybeSingle();

    if (projErr) throw projErr;

    if (!project) {
      throw new ApiError(404, "Project not found");
    }

    // Create asset
    const { data: asset, error } = await sb.from('assets').insert({
      project_id: body.project_id,
      asset_type: body.asset_type,
      source: body.source,
      source_url: body.source_url,
      alt_text: body.alt_text,
      wordpress_id: body.wordpress_id,
      wordpress_url: body.wordpress_url,
    }).select().single();

    if (error) throw error;

    return NextResponse.json(createSuccessResponse(asset), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
