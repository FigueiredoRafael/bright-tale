/**
 * GET /api/assets/unsplash/search
 * Search Unsplash for images
 */
import { NextRequest, NextResponse } from "next/server";
import { searchUnsplashQuerySchema } from "@brighttale/shared/schemas/assets";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateQueryParams } from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    const params = validateQueryParams(
      request.nextUrl,
      searchUnsplashQuerySchema,
    );

    const accessKey = process.env.UNSPLASH_ACCESS_KEY;

    if (!accessKey) {
      throw new ApiError(
        500,
        "Unsplash API key not configured. Please set UNSPLASH_ACCESS_KEY environment variable.",
      );
    }

    // Build Unsplash API URL
    const unsplashUrl = new URL("https://api.unsplash.com/search/photos");
    unsplashUrl.searchParams.set("query", params.query);
    unsplashUrl.searchParams.set("page", params.page.toString());
    unsplashUrl.searchParams.set("per_page", params.per_page.toString());
    if (params.orientation) {
      unsplashUrl.searchParams.set("orientation", params.orientation);
    }

    // Fetch from Unsplash
    const response = await fetch(unsplashUrl.toString(), {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(
        response.status,
        `Unsplash API error: ${errorText || response.statusText}`,
      );
    }

    const data = await response.json();

    // Transform Unsplash response to our format
    const results = data.results.map(
      (photo: {
        id: string;
        description: string | null;
        alt_description: string | null;
        urls: {
          raw: string;
          full: string;
          regular: string;
          small: string;
          thumb: string;
        };
        links: {
          html: string;
          download_location: string;
        };
        user: {
          name: string;
          username: string;
          links: {
            html: string;
          };
        };
        width: number;
        height: number;
      }) => ({
        id: photo.id,
        description: photo.description || photo.alt_description || "",
        alt_text: photo.alt_description || photo.description || "",
        urls: {
          raw: photo.urls.raw,
          full: photo.urls.full,
          regular: photo.urls.regular,
          small: photo.urls.small,
          thumb: photo.urls.thumb,
        },
        links: {
          html: photo.links.html,
          download_location: photo.links.download_location,
        },
        user: {
          name: photo.user.name,
          username: photo.user.username,
          profile: photo.user.links.html,
        },
        width: photo.width,
        height: photo.height,
      }),
    );

    return NextResponse.json(
      createSuccessResponse({
        results,
        total: data.total,
        total_pages: data.total_pages,
        page: params.page,
        per_page: params.per_page,
      }),
      { status: 200 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
