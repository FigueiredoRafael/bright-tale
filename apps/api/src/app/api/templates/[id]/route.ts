/**
 * Template Detail API Routes
 * GET /api/templates/[id] - Get template details
 * PUT /api/templates/[id] - Update template
 * DELETE /api/templates/[id] - Delete template
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { updateTemplateSchema } from "@brighttale/shared/schemas/templates";

/**
 * GET /api/templates/[id]
 * Get template details by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const { data: template, error } = await sb
      .from('templates')
      .select('*, parent:parent_template_id(id, name, type, config_json), children:templates!parent_template_id(id, name, type, created_at)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;

    if (!template) {
      throw new ApiError(404, "Template not found", "NOT_FOUND");
    }

    // Parse config_json for response
    let parsedConfig;
    try {
      parsedConfig = JSON.parse(template.config_json);
    } catch {
      parsedConfig = template.config_json;
    }

    return createSuccessResponse({
      ...template,
      config_json: template.config_json,
      config: parsedConfig,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/templates/[id]
 * Update template by ID
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const data = await validateBody(request, updateTemplateSchema);

    // Check if template exists
    const { data: existing, error: findErr } = await sb
      .from('templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findErr) throw findErr;

    if (!existing) {
      throw new ApiError(404, "Template not found", "NOT_FOUND");
    }

    // Validate JSON format if config_json is provided
    if (data.config_json) {
      try {
        JSON.parse(data.config_json);
      } catch {
        throw new ApiError(400, "Invalid JSON in config_json", "INVALID_JSON");
      }
    }

    // If parent_template_id is being updated, verify it exists
    if (
      data.parent_template_id !== undefined &&
      data.parent_template_id !== null
    ) {
      if (data.parent_template_id === id) {
        throw new ApiError(400, "Template cannot be its own parent", "SELF_REFERENCE");
      }

      const { data: parentTemplate, error: parentErr } = await sb
        .from('templates')
        .select('id, type')
        .eq('id', data.parent_template_id)
        .maybeSingle();

      if (parentErr) throw parentErr;

      if (!parentTemplate) {
        throw new ApiError(404, "Parent template not found", "PARENT_NOT_FOUND");
      }

      const newType = data.type || existing.type;
      if (parentTemplate.type !== newType) {
        throw new ApiError(400, "Parent template must be of the same type", "TYPE_MISMATCH");
      }

      // Prevent circular inheritance
      const visited = new Set<string>([id]);
      let checkParentId: string | null = data.parent_template_id;

      while (checkParentId) {
        if (visited.has(checkParentId)) {
          throw new ApiError(400, "Circular template inheritance detected", "CIRCULAR_INHERITANCE");
        }
        visited.add(checkParentId);

        const { data: parentCheck } = await sb
          .from('templates')
          .select('parent_template_id')
          .eq('id', checkParentId)
          .maybeSingle() as { data: { parent_template_id: string | null } | null };

        checkParentId = parentCheck?.parent_template_id || null;
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.name) updateData.name = data.name;
    if (data.type) updateData.type = data.type;
    if (data.config_json) updateData.config_json = data.config_json;
    if (data.parent_template_id !== undefined) updateData.parent_template_id = data.parent_template_id;

    const { data: template, error } = await sb
      .from('templates')
      .update(updateData as any)
      .eq('id', id)
      .select('*, parent:parent_template_id(id, name, type)')
      .single();

    if (error) throw error;

    return createSuccessResponse(template);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/templates/[id]
 * Delete template by ID
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;

    // Check if template exists and has children
    const { data: existing, error: findErr } = await sb
      .from('templates')
      .select('id, children:templates!parent_template_id(count)')
      .eq('id', id)
      .maybeSingle();

    if (findErr) throw findErr;

    if (!existing) {
      throw new ApiError(404, "Template not found", "NOT_FOUND");
    }

    // Check if template has children
    const childCount = (existing as any).children?.[0]?.count ?? 0;
    if (childCount > 0) {
      throw new ApiError(
        400,
        `Cannot delete template that has ${childCount} child template(s)`,
        "HAS_CHILDREN",
      );
    }

    const { error } = await sb.from('templates').delete().eq('id', id);
    if (error) throw error;

    return createSuccessResponse({
      success: true,
      message: "Template deleted successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
