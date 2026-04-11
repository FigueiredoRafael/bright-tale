/**
 * WordPress Config single-resource CRUD API
 *
 * GET    /api/wordpress/config/[id] — Get config (password masked)
 * PUT    /api/wordpress/config/[id] — Update config (password re-encrypted if changed)
 * DELETE /api/wordpress/config/[id] — Delete config
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";

const updateConfigSchema = z.object({
  site_url: z.string().url("Invalid WordPress site URL").optional(),
  username: z.string().min(1, "Username is required").optional(),
  password: z.string().min(1, "Password is required").optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const config = await prisma.wordPressConfig.findUnique({ where: { id } });

    if (!config) {
      throw new ApiError(404, "WordPress config not found", "NOT_FOUND");
    }

    return createSuccessResponse({
      id: config.id,
      site_url: config.site_url,
      username: config.username,
      created_at: config.created_at,
      updated_at: config.updated_at,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await validateBody(request, updateConfigSchema);

    const existing = await prisma.wordPressConfig.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "WordPress config not found", "NOT_FOUND");
    }

    // Encrypt new password if provided
    const updateData: Record<string, string> = {};
    if (body.site_url) updateData.site_url = body.site_url;
    if (body.username) updateData.username = body.username;
    if (body.password) {
      if (!process.env.ENCRYPTION_SECRET) {
        return NextResponse.json(
          {
            error: "Server configuration error",
            message:
              "ENCRYPTION_SECRET environment variable is not set. Please configure it in your .env file.",
          },
          { status: 500 },
        );
      }
      updateData.password = encrypt(body.password);
    }

    const updated = await prisma.wordPressConfig.update({
      where: { id },
      data: updateData,
    });

    console.log("WordPress config updated:", id);

    return createSuccessResponse({
      id: updated.id,
      site_url: updated.site_url,
      username: updated.username,
      updated_at: updated.updated_at,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const existing = await prisma.wordPressConfig.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "WordPress config not found", "NOT_FOUND");
    }

    await prisma.wordPressConfig.delete({ where: { id } });

    console.log("WordPress config deleted:", id);

    return createSuccessResponse({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
