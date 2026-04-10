/**
 * GET /api/wordpress/categories
 * Fetch WordPress categories
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchCategoriesQuerySchema } from "@/lib/schemas/wordpress";
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
    const params = validateQueryParams(
      request.nextUrl,
      fetchCategoriesQuerySchema,
    );

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

    // Fetch categories from WordPress
    const response = await fetch(
      `${site_url}/wp-json/wp/v2/categories?per_page=100`,
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
        `Failed to fetch categories: ${errorText || response.statusText}`,
      );
    }

    const categories = await response.json();

    return NextResponse.json(
      createSuccessResponse({
        categories: categories.map(
          (cat: { id: number; name: string; slug: string; count: number }) => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            count: cat.count,
          }),
        ),
        total: categories.length,
      }),
      { status: 200 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
