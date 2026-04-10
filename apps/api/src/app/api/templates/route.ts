/**
 * Templates API Routes
 * POST /api/templates - Create new template
 * GET /api/templates - List all templates with filters
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody, validateQueryParams } from "@/lib/api/validation";
import {
  createTemplateSchema,
  listTemplatesQuerySchema,
} from "@/lib/schemas/templates";

/**
 * POST /api/templates
 * Create a new template
 */
export async function POST(request: NextRequest) {
  try {
    const data = await validateBody(request, createTemplateSchema);

    // Validate JSON format
    try {
      JSON.parse(data.config_json);
    } catch {
      throw new ApiError(400, "Invalid JSON in config_json", "INVALID_JSON");
    }

    // If parent_template_id is provided, verify it exists
    if (data.parent_template_id) {
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

      // Ensure parent template is same type
      if (parentTemplate.type !== data.type) {
        throw new ApiError(
          400,
          "Parent template must be of the same type",
          "TYPE_MISMATCH",
        );
      }
    }

    const template = await prisma.template.create({
      data: {
        name: data.name,
        type: data.type,
        config_json: data.config_json,
        parent_template_id: data.parent_template_id,
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
    const url = new URL(request.url);
    const params = validateQueryParams(url, listTemplatesQuerySchema);

    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: {
      type?: string;
      parent_template_id?: string;
      name?: { contains: string; mode: "insensitive" };
    } = {};

    if (params.type) {
      where.type = params.type;
    }

    if (params.parent_template_id) {
      where.parent_template_id = params.parent_template_id;
    }

    if (params.search) {
      where.name = {
        contains: params.search,
        mode: "insensitive",
      };
    }

    // Build orderBy clause
    const orderBy: Record<string, "asc" | "desc"> = {};
    orderBy[params.sort || "created_at"] = params.order || "desc";

    // Execute query with pagination
    const [templates, total] = await Promise.all([
      prisma.template.findMany({
        where,
        orderBy,
        skip,
        take: limit,
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
      }),
      prisma.template.count({ where }),
    ]);

    return createSuccessResponse({
      data: templates,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
