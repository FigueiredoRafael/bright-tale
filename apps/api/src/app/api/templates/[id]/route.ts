/**
 * Template Detail API Routes
 * GET /api/templates/[id] - Get template details
 * PUT /api/templates/[id] - Update template
 * DELETE /api/templates/[id] - Delete template
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { updateTemplateSchema } from "@/lib/schemas/templates";

/**
 * GET /api/templates/[id]
 * Get template details by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const template = await prisma.template.findUnique({
      where: { id },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            type: true,
            config_json: true,
          },
        },
        children: {
          select: {
            id: true,
            name: true,
            type: true,
            created_at: true,
          },
        },
        _count: {
          select: {
            children: true,
          },
        },
      },
    });

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
    const { id } = await params;
    const data = await validateBody(request, updateTemplateSchema);

    // Check if template exists
    const existing = await prisma.template.findUnique({
      where: { id },
    });

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
      // Prevent self-reference
      if (data.parent_template_id === id) {
        throw new ApiError(
          400,
          "Template cannot be its own parent",
          "SELF_REFERENCE",
        );
      }

      const parentTemplate = await prisma.template.findUnique({
        where: { id: data.parent_template_id },
      });

      if (!parentTemplate) {
        throw new ApiError(
          404,
          "Parent template not found",
          "PARENT_NOT_FOUND",
        );
      }

      // Ensure parent template is same type (if type is not being changed)
      const newType = data.type || existing.type;
      if (parentTemplate.type !== newType) {
        throw new ApiError(
          400,
          "Parent template must be of the same type",
          "TYPE_MISMATCH",
        );
      }

      // Prevent circular inheritance
      const visited = new Set<string>([id]);
      let checkParentId: string | null = data.parent_template_id;

      while (checkParentId) {
        if (visited.has(checkParentId)) {
          throw new ApiError(
            400,
            "Circular template inheritance detected",
            "CIRCULAR_INHERITANCE",
          );
        }
        visited.add(checkParentId);

        const parentCheck: { parent_template_id: string | null } | null =
          await prisma.template.findUnique({
            where: { id: checkParentId },
            select: { parent_template_id: true },
          });

        checkParentId = parentCheck?.parent_template_id || null;
      }
    }

    const template = await prisma.template.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.type && { type: data.type }),
        ...(data.config_json && { config_json: data.config_json }),
        ...(data.parent_template_id !== undefined && {
          parent_template_id: data.parent_template_id,
        }),
      },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        _count: {
          select: {
            children: true,
          },
        },
      },
    });

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
    const { id } = await params;
    // Check if template exists
    const existing = await prisma.template.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            children: true,
          },
        },
      },
    });

    if (!existing) {
      throw new ApiError(404, "Template not found", "NOT_FOUND");
    }

    // Check if template has children
    if (existing._count.children > 0) {
      throw new ApiError(
        400,
        `Cannot delete template that has ${existing._count.children} child template(s)`,
        "HAS_CHILDREN",
      );
    }

    await prisma.template.delete({
      where: { id },
    });

    return createSuccessResponse({
      success: true,
      message: "Template deleted successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
