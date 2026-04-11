/**
 * Shorts Library API
 * GET  /api/shorts - List all shorts drafts
 * POST /api/shorts - Create a new shorts draft
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import { createSuccessResponse, createErrorResponse } from "@/lib/api/errors";
import { createShortsSchema, shortsQuerySchema } from "@brighttale/shared/schemas/shorts";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const { searchParams } = new URL(request.url);
    const query = shortsQuerySchema.parse(Object.fromEntries(searchParams));
    const { status, project_id, idea_id, page = 1, limit = 20 } = query;

    let countQuery = sb.from('shorts_drafts').select('*', { count: 'exact', head: true });
    let dataQuery = sb.from('shorts_drafts').select('id, short_count, total_duration, status, project_id, idea_id, created_at, updated_at');

    if (status) { countQuery = countQuery.eq('status', status); dataQuery = dataQuery.eq('status', status); }
    if (project_id) { countQuery = countQuery.eq('project_id', project_id); dataQuery = dataQuery.eq('project_id', project_id); }
    if (idea_id) { countQuery = countQuery.eq('idea_id', idea_id); dataQuery = dataQuery.eq('idea_id', idea_id); }

    const [{ count: total, error: countErr }, { data: shorts, error: dataErr }] = await Promise.all([
      countQuery,
      dataQuery.order('updated_at', { ascending: false }).range((page - 1) * limit, page * limit - 1),
    ]);

    if (countErr) throw countErr;
    if (dataErr) throw dataErr;

    return createSuccessResponse({
      shorts,
      pagination: { page, limit, total: total ?? 0, total_pages: Math.ceil((total ?? 0) / limit) },
    });
  } catch (error) {
    console.error("Failed to list shorts:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(createErrorResponse("Invalid query parameters", 400), { status: 400 });
    }
    return NextResponse.json(createErrorResponse("Failed to list shorts", 500), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const body = await request.json();
    const data = createShortsSchema.parse(body);

    const { data: shorts, error } = await sb.from('shorts_drafts').insert({
      shorts_json: JSON.stringify(data.shorts),
      short_count: data.shorts.length,
      total_duration: data.total_duration,
      status: data.status,
      project_id: data.project_id,
      idea_id: data.idea_id,
    }).select().single();

    if (error) throw error;

    return createSuccessResponse({ shorts }, 201);
  } catch (error) {
    console.error("Failed to create shorts:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        createErrorResponse("Validation failed: " + error.issues.map((e) => e.message).join(", "), 400),
        { status: 400 },
      );
    }
    return NextResponse.json(createErrorResponse("Failed to create shorts", 500), { status: 500 });
  }
}
