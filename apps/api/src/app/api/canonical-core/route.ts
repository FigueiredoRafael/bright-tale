/**
 * Canonical Core API
 * GET  /api/canonical-core          — List canonical cores (filterable by idea_id, project_id)
 * POST /api/canonical-core          — Create a new canonical core
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import { createSuccessResponse, createErrorResponse } from "@/lib/api/errors";
import { z } from "zod";
import { createCanonicalCoreSchema } from "@brighttale/shared/schemas/canonicalCoreApi";

const listQuerySchema = z.object({
  idea_id: z.string().optional(),
  project_id: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export async function GET(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.parse(Object.fromEntries(searchParams));
    const { idea_id, project_id, page, limit } = query;

    let countQuery = sb.from('canonical_core').select('*', { count: 'exact', head: true });
    let dataQuery = sb.from('canonical_core').select('id, idea_id, project_id, thesis, cta_subscribe, cta_comment_prompt, created_at, updated_at');

    if (idea_id) { countQuery = countQuery.eq('idea_id', idea_id); dataQuery = dataQuery.eq('idea_id', idea_id); }
    if (project_id) { countQuery = countQuery.eq('project_id', project_id); dataQuery = dataQuery.eq('project_id', project_id); }

    const [{ count: total, error: countErr }, { data: cores, error: dataErr }] = await Promise.all([
      countQuery,
      dataQuery.order('updated_at', { ascending: false }).range((page - 1) * limit, page * limit - 1),
    ]);

    if (countErr) throw countErr;
    if (dataErr) throw dataErr;

    return createSuccessResponse({
      canonical_cores: cores,
      pagination: { page, limit, total: total ?? 0, total_pages: Math.ceil((total ?? 0) / limit) },
    });
  } catch (error) {
    console.error("Failed to list canonical cores:", error);
    if (error instanceof z.ZodError) {
      return createErrorResponse("Invalid query parameters: " + error.issues.map(i => i.message).join(", "), 400);
    }
    return createErrorResponse("Failed to list canonical cores", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const body = await request.json();
    const data = createCanonicalCoreSchema.parse(body);

    const { data: core, error } = await sb.from('canonical_core').insert({
      idea_id: data.idea_id,
      project_id: data.project_id,
      thesis: data.thesis,
      argument_chain_json: JSON.stringify(data.argument_chain),
      emotional_arc_json: JSON.stringify(data.emotional_arc),
      key_stats_json: JSON.stringify(data.key_stats),
      key_quotes_json: data.key_quotes ? JSON.stringify(data.key_quotes) : null,
      affiliate_moment_json: data.affiliate_moment
        ? JSON.stringify(data.affiliate_moment)
        : null,
      cta_subscribe: data.cta_subscribe,
      cta_comment_prompt: data.cta_comment_prompt,
    }).select().single();

    if (error) throw error;

    return createSuccessResponse({ canonical_core: core }, 201);
  } catch (error) {
    console.error("Failed to create canonical core:", error);
    if (error instanceof z.ZodError) {
      return createErrorResponse("Validation failed: " + error.issues.map(i => i.message).join(", "), 400);
    }
    return createErrorResponse("Failed to create canonical core", 500);
  }
}
