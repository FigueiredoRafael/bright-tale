/**
 * Research API Routes
 * POST /api/research - Create new research
 * GET /api/research - List all research with filters
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import { handleApiError, createSuccessResponse } from "@/lib/api/errors";
import { validateBody, validateQueryParams } from "@/lib/api/validation";
import {
  createResearchSchema,
  listResearchQuerySchema,
} from "@brighttale/shared/schemas/research";

/**
 * POST /api/research
 * Create a new research entry
 */
export async function POST(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const data = await validateBody(request, createResearchSchema);

    // If idea_id is provided, embed it in the research_content JSON
    let researchContent = data.research_content;
    if (data.idea_id) {
      try {
        const parsed = JSON.parse(data.research_content);
        parsed.idea_id = data.idea_id;
        researchContent = JSON.stringify(parsed);
      } catch {
        researchContent = JSON.stringify({
          idea_id: data.idea_id,
          content: data.research_content,
        });
      }
    }

    const { data: research, error } = await sb
      .from('research_archives')
      .insert({
        title: data.title,
        theme: data.theme,
        research_content: researchContent,
      })
      .select('*, sources:research_sources(*)')
      .single();

    if (error) throw error;

    return createSuccessResponse(research, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/research
 * List all research with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const url = new URL(request.url);
    const params = validateQueryParams(url, listResearchQuerySchema);

    const page = params.page || 1;
    const limit = params.limit || 20;
    const sortField = params.sort || "created_at";
    const sortOrder = params.order || "desc";

    let countQuery = sb.from('research_archives').select('*', { count: 'exact', head: true });
    let dataQuery = sb.from('research_archives').select('*, sources:research_sources(*), projects(count)');

    if (params.theme) {
      countQuery = countQuery.ilike('theme', `%${params.theme}%`);
      dataQuery = dataQuery.ilike('theme', `%${params.theme}%`);
    }

    if (params.search) {
      const searchFilter = `title.ilike.%${params.search}%,research_content.ilike.%${params.search}%`;
      countQuery = countQuery.or(searchFilter);
      dataQuery = dataQuery.or(searchFilter);
    }

    const [{ count: total, error: countErr }, { data: research, error: dataErr }] = await Promise.all([
      countQuery,
      dataQuery
        .order(sortField, { ascending: sortOrder === "asc" })
        .range((page - 1) * limit, page * limit - 1),
    ]);

    if (countErr) throw countErr;
    if (dataErr) throw dataErr;

    return createSuccessResponse({
      data: research,
      pagination: {
        page,
        limit,
        total: total ?? 0,
        totalPages: Math.ceil((total ?? 0) / limit),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
