import { NextRequest } from "next/server";
import { validateBody, validateQueryParams } from "@/lib/api/validation";
import { handleApiError, createSuccessResponse } from "@/lib/api/errors";
import { createServiceClient } from '@/lib/supabase';
import {
  listIdeasQuerySchema,
  createIdeaSchema,
  calculateSimilarity,
  type SimilarityWarning,
} from "@brighttale/shared/schemas/ideas";

const SIMILARITY_THRESHOLD = 80;

/**
 * GET /api/ideas/library
 * List ideas from the global library with filtering
 */
export async function GET(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const query = validateQueryParams(request.nextUrl, listIdeasQuerySchema);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    let countQuery = sb.from('idea_archives').select('*', { count: 'exact', head: true });
    let dataQuery = sb.from('idea_archives').select('*');

    if (query.verdict) {
      countQuery = countQuery.eq('verdict', query.verdict);
      dataQuery = dataQuery.eq('verdict', query.verdict);
    }

    if (query.source_type) {
      countQuery = countQuery.eq('source_type', query.source_type);
      dataQuery = dataQuery.eq('source_type', query.source_type);
    }

    if (query.is_public !== undefined) {
      countQuery = countQuery.eq('is_public', query.is_public);
      dataQuery = dataQuery.eq('is_public', query.is_public);
    }

    if (query.tags) {
      const tagArray = query.tags.split(",").map(t => t.trim());
      countQuery = countQuery.overlaps('tags', tagArray);
      dataQuery = dataQuery.overlaps('tags', tagArray);
    }

    if (query.search) {
      const searchFilter = `title.ilike.%${query.search}%,core_tension.ilike.%${query.search}%,target_audience.ilike.%${query.search}%`;
      countQuery = countQuery.or(searchFilter);
      dataQuery = dataQuery.or(searchFilter);
    }

    const [{ count: total, error: countErr }, { data: ideas, error: dataErr }] = await Promise.all([
      countQuery,
      dataQuery
        .order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1),
    ]);

    if (countErr) throw countErr;
    if (dataErr) throw dataErr;

    return createSuccessResponse({
      ideas,
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

/**
 * POST /api/ideas/library
 * Create a new idea in the library with similarity checking
 */
export async function POST(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const data = await validateBody(request, createIdeaSchema);

    // Check for similar existing ideas
    const { data: existingIdeas, error: fetchErr } = await sb
      .from('idea_archives')
      .select('id, title, idea_id');

    if (fetchErr) throw fetchErr;

    const warnings: SimilarityWarning[] = [];
    for (const existing of existingIdeas ?? []) {
      const similarity = calculateSimilarity(data.title, existing.title);
      if (similarity >= SIMILARITY_THRESHOLD) {
        warnings.push({
          type: "similar",
          existing_id: existing.id,
          existing_title: existing.title,
          similarity,
        });
      }
    }

    // Generate idea_id if not provided
    let ideaId = data.idea_id;
    if (!ideaId) {
      const { count, error: countErr } = await sb
        .from('idea_archives')
        .select('*', { count: 'exact', head: true });
      if (countErr) throw countErr;
      ideaId = `BC-IDEA-${String((count ?? 0) + 1).padStart(3, "0")}`;
    }

    // Check if idea_id already exists
    const { data: existingIdeaId } = await sb
      .from('idea_archives')
      .select('id')
      .eq('idea_id', ideaId)
      .maybeSingle();

    if (existingIdeaId) {
      // Generate a new unique ID
      const { data: allIdeas } = await sb
        .from('idea_archives')
        .select('idea_id');

      const maxNum = (allIdeas ?? []).reduce((max: number, i: any) => {
        const match = i.idea_id.match(/BC-IDEA-(\d+)/);
        return match ? Math.max(max, parseInt(match[1])) : max;
      }, 0);
      ideaId = `BC-IDEA-${String(maxNum + 1).padStart(3, "0")}`;
    }

    const { data: idea, error } = await sb.from('idea_archives').insert({
      idea_id: ideaId,
      title: data.title,
      core_tension: data.core_tension,
      target_audience: data.target_audience,
      verdict: data.verdict,
      discovery_data: data.discovery_data ?? "",
      source_type: data.source_type,
      source_project_id: data.source_project_id,
      tags: data.tags ?? [],
      is_public: data.is_public ?? true,
      markdown_content: data.markdown_content,
    }).select().single();

    if (error) throw error;

    const response: { idea: typeof idea; warnings?: SimilarityWarning[] } = {
      idea,
    };

    if (warnings.length > 0) {
      response.warnings = warnings;
    }

    return createSuccessResponse(response, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
