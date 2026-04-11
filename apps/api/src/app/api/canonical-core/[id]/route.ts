/**
 * Canonical Core API — single record
 * GET    /api/canonical-core/:id — Fetch a canonical core by id
 * PUT    /api/canonical-core/:id — Update a canonical core
 * DELETE /api/canonical-core/:id — Delete a canonical core
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import { createSuccessResponse, createErrorResponse } from "@/lib/api/errors";
import { z } from "zod";
import { updateCanonicalCoreSchema } from "@brighttale/shared/schemas/canonicalCoreApi";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const { data: core, error } = await sb.from('canonical_core').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!core) return createErrorResponse("Canonical core not found", 404);
    return createSuccessResponse({ canonical_core: core });
  } catch (error) {
    console.error("Failed to fetch canonical core:", error);
    return createErrorResponse("Failed to fetch canonical core", 500);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const body = await request.json();
    const data = updateCanonicalCoreSchema.parse(body);

    const { data: existing, error: findErr } = await sb.from('canonical_core').select('id').eq('id', id).maybeSingle();
    if (findErr) throw findErr;
    if (!existing) return createErrorResponse("Canonical core not found", 404);

    const updateData: Record<string, unknown> = {};
    if (data.project_id !== undefined) updateData.project_id = data.project_id;
    if (data.thesis !== undefined) updateData.thesis = data.thesis;
    if (data.argument_chain !== undefined) updateData.argument_chain_json = JSON.stringify(data.argument_chain);
    if (data.emotional_arc !== undefined) updateData.emotional_arc_json = JSON.stringify(data.emotional_arc);
    if (data.key_stats !== undefined) updateData.key_stats_json = JSON.stringify(data.key_stats);
    if (data.key_quotes !== undefined) updateData.key_quotes_json = JSON.stringify(data.key_quotes);
    if (data.affiliate_moment !== undefined) updateData.affiliate_moment_json = JSON.stringify(data.affiliate_moment);
    if (data.cta_subscribe !== undefined) updateData.cta_subscribe = data.cta_subscribe;
    if (data.cta_comment_prompt !== undefined) updateData.cta_comment_prompt = data.cta_comment_prompt;

    const { data: updated, error } = await sb
      .from('canonical_core')
      .update(updateData as any)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return createSuccessResponse({ canonical_core: updated });
  } catch (error) {
    console.error("Failed to update canonical core:", error);
    if (error instanceof z.ZodError) {
      return createErrorResponse("Validation failed: " + error.issues.map(i => i.message).join(", "), 400);
    }
    return createErrorResponse("Failed to update canonical core", 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const { data: existing, error: findErr } = await sb.from('canonical_core').select('id').eq('id', id).maybeSingle();
    if (findErr) throw findErr;
    if (!existing) return createErrorResponse("Canonical core not found", 404);

    const { error } = await sb.from('canonical_core').delete().eq('id', id);
    if (error) throw error;
    return createSuccessResponse({ deleted: true });
  } catch (error) {
    console.error("Failed to delete canonical core:", error);
    return createErrorResponse("Failed to delete canonical core", 500);
  }
}
