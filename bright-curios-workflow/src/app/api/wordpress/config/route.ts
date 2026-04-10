/**
 * WordPress Config CRUD API
 *
 * POST /api/wordpress/config — Create new WordPress config (password encrypted)
 * GET  /api/wordpress/config — List all configs (passwords masked)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { handleApiError, createSuccessResponse } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";

const createConfigSchema = z.object({
  site_url: z.string().url("Invalid WordPress site URL"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await validateBody(request, createConfigSchema);
    // Check if encryption is available
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
    // Encrypt password before storing
    const encryptedPassword = encrypt(body.password);

    const config = await prisma.wordPressConfig.create({
      data: {
        site_url: body.site_url,
        username: body.username,
        password: encryptedPassword,
      },
    });

    console.log("WordPress config created:", config.id);

    return createSuccessResponse(
      {
        id: config.id,
        site_url: config.site_url,
        username: config.username,
        created_at: config.created_at,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  try {
    const configs = await prisma.wordPressConfig.findMany({
      orderBy: { created_at: "desc" },
    });

    // Mask passwords in response
    const maskedConfigs = configs.map(c => ({
      id: c.id,
      site_url: c.site_url,
      username: c.username,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));

    return createSuccessResponse(maskedConfigs);
  } catch (error) {
    return handleApiError(error);
  }
}
