/**
 * GET /api/wordpress/tags
 * Fetch WordPress tags
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchTagsQuerySchema } from "@/lib/schemas/wordpress";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateQueryParams } from "@/lib/api/validation";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

export async function GET(request: NextRequest) {
  try {
    const params = validateQueryParams(request.nextUrl, fetchTagsQuerySchema);

    // Get WordPress credentials
    let site_url: string;
    let username: string;
    let password: string;

    if (params.config_id) {
      // Use stored config
      const config = await prisma.wordPressConfig.findUnique({
        where: { id: params.config_id },
      });

      if (!config) {
        throw new ApiError(404, "WordPress config not found");
      }

      site_url = config.site_url;
      username = config.username;
      password = decrypt(config.password);
    } else if (params.site_url && params.username && params.password) {
      // Use provided credentials
      site_url = params.site_url;
      username = params.username;
      password = params.password;
    } else {
      throw new ApiError(
        400,
        "Either config_id or site_url/username/password must be provided",
      );
    }

    // Create Basic Auth header
    const auth = Buffer.from(`${username}:${password}`).toString("base64");

    // Fetch tags from WordPress
    const response = await fetch(
      `${site_url}/wp-json/wp/v2/tags?per_page=100`,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(
        response.status,
        `Failed to fetch tags: ${errorText || response.statusText}`,
      );
    }

    const tags = await response.json();

    return NextResponse.json(
      createSuccessResponse({
        tags: tags.map(
          (tag: { id: number; name: string; slug: string; count: number }) => ({
            id: tag.id,
            name: tag.name,
            slug: tag.slug,
            count: tag.count,
          }),
        ),
        total: tags.length,
      }),
      { status: 200 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
