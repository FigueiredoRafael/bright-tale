/**
 * Templates API Routes
 * POST /api/templates - Create new template
 * GET /api/templates - List all templates with filters
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody, validateQueryParams } from "@/lib/api/validation";
import {
  createTemplateSchema,
  listTemplatesQuerySchema,
} from "@brighttale/shared/schemas/templates";

/**
 * POST /api/templates
 * Create a new template
 */
export async function POST(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const data = await validateBody(request, createTemplateSchema);

    // Validate JSON format
    try {
      JSON.parse(data.config_json);
    } catch {
      throw new ApiError(400, "Invalid JSON in config_json", "INVALID_JSON");
    }

    // If parent_template_id is provided, verify it exists
    if (data.parent_template_id) {
      const { data: parentTemplate, error: parentErr } = await sb
        .from('templates')
        .select('id, type')
        .eq('id', data.parent_template_id)
        .maybeSingle();

      if (parentErr) throw parentErr;

      if (!parentTemplate) {
        throw new ApiError(404, "Parent template not found", "PARENT_NOT_FOUND");
      }

      if (parentTemplate.type !== data.type) {
        throw new ApiError(400, "Parent template must be of the same type", "TYPE_MISMATCH");
      }
    }

    const { data: template, error } = await sb
      .from('templates')
      .insert({
        name: data.name,
        type: data.type,
        config_json: data.config_json,
        parent_template_id: data.parent_template_id,
      })
      .select('*, parent:parent_template_id(id, name, type)')
      .single();

    if (error) throw error;

    return createSuccessResponse(template, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/templates
 * List all templates with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const url = new URL(request.url);
    const params = validateQueryParams(url, listTemplatesQuerySchema);

    const page = params.page || 1;
    const limit = params.limit || 20;
    const sortField = params.sort || "created_at";
    const sortOrder = params.order || "desc";

    let countQuery = sb.from('templates').select('*', { count: 'exact', head: true });
    let dataQuery = sb.from('templates').select('*, parent:parent_template_id(id, name, type), children:templates!parent_template_id(count)');

    if (params.type) {
      countQuery = countQuery.eq('type', params.type);
      dataQuery = dataQuery.eq('type', params.type);
    }

    if (params.parent_template_id) {
      countQuery = countQuery.eq('parent_template_id', params.parent_template_id);
      dataQuery = dataQuery.eq('parent_template_id', params.parent_template_id);
    }

    if (params.search) {
      countQuery = countQuery.ilike('name', `%${params.search}%`);
      dataQuery = dataQuery.ilike('name', `%${params.search}%`);
    }

    const [{ count: total, error: countErr }, { data: templates, error: dataErr }] = await Promise.all([
      countQuery,
      dataQuery
        .order(sortField, { ascending: sortOrder === "asc" })
        .range((page - 1) * limit, page * limit - 1),
    ]);

    if (countErr) throw countErr;
    if (dataErr) throw dataErr;

    return createSuccessResponse({
      data: templates,
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
