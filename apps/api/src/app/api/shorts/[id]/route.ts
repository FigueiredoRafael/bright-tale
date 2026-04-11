/**
 * Shorts Draft API - Individual operations
 * GET    /api/shorts/[id]
 * PUT    /api/shorts/[id]
 * DELETE /api/shorts/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import { createSuccessResponse, createErrorResponse } from "@/lib/api/errors";
import { updateShortsSchema } from "@brighttale/shared/schemas/shorts";
import { z } from "zod";
import type { ShortOutput } from "@brighttale/shared/types/agents";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const { data: draft, error } = await sb.from('shorts_drafts').select('*').eq('id', id).maybeSingle();
    if (error) throw error;

    if (!draft) {
      return NextResponse.json(createErrorResponse("Shorts not found", 404), { status: 404 });
    }

    const shorts: ShortOutput[] = JSON.parse(draft.shorts_json);

    return createSuccessResponse({
      shorts: {
        id: draft.id,
        shorts,
        short_count: draft.short_count,
        total_duration: draft.total_duration,
        status: draft.status,
        project_id: draft.project_id,
        idea_id: draft.idea_id,
        created_at: draft.created_at,
        updated_at: draft.updated_at,
      },
    });
  } catch (error) {
    console.error("Failed to get shorts:", error);
    return NextResponse.json(createErrorResponse("Failed to get shorts", 500), { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const body = await request.json();
    const data = updateShortsSchema.parse(body);

    const { data: existing, error: findErr } = await sb.from('shorts_drafts').select('id').eq('id', id).maybeSingle();
    if (findErr) throw findErr;
    if (!existing) {
      return NextResponse.json(createErrorResponse("Shorts not found", 404), { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (data.shorts !== undefined) {
      updateData.shorts_json = JSON.stringify(data.shorts);
      updateData.short_count = data.shorts.length;
    }
    if (data.total_duration !== undefined) updateData.total_duration = data.total_duration;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.project_id !== undefined) updateData.project_id = data.project_id;
    if (data.idea_id !== undefined) updateData.idea_id = data.idea_id;

    const { data: updated, error } = await sb.from('shorts_drafts').update(updateData as any).eq('id', id).select().single();
    if (error) throw error;
    return createSuccessResponse({ shorts: updated });
  } catch (error) {
    console.error("Failed to update shorts:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        createErrorResponse("Validation failed: " + error.issues.map((e) => e.message).join(", "), 400),
        { status: 400 },
      );
    }
    return NextResponse.json(createErrorResponse("Failed to update shorts", 500), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const { data: existing, error: findErr } = await sb.from('shorts_drafts').select('id').eq('id', id).maybeSingle();
    if (findErr) throw findErr;
    if (!existing) {
      return NextResponse.json(createErrorResponse("Shorts not found", 404), { status: 404 });
    }
    const { error } = await sb.from('shorts_drafts').delete().eq('id', id);
    if (error) throw error;
    return createSuccessResponse({ deleted: true });
  } catch (error) {
    console.error("Failed to delete shorts:", error);
    return NextResponse.json(createErrorResponse("Failed to delete shorts", 500), { status: 500 });
  }
}
