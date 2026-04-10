/**
 * POST /api/wordpress/test
 * Test WordPress connection with detailed diagnostics
 */
import { NextRequest, NextResponse } from "next/server";
import { testWordPressConnectionSchema } from "@/lib/schemas/wordpress";
import { handleApiError, createSuccessResponse } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";

export async function POST(request: NextRequest) {
  console.log("=== WordPress test endpoint called ===");

  try {
    const body = await validateBody(request, testWordPressConnectionSchema);
    console.log("Request validated successfully, body:", body);

    // If no credentials provided, just return a simple success for testing
    if (!body.site_url) {
      console.log("No site_url provided, returning simple success");
      return NextResponse.json({
        success: true,
        message: "WordPress test endpoint is reachable",
        timestamp: new Date().toISOString(),
      });
    }

    // Normalize URL (remove trailing slash)
    const siteUrl = body.site_url.replace(/\/$/, "");
    console.log("Testing WordPress site:", siteUrl);

    // Create Basic Auth header
    const auth = Buffer.from(`${body.username}:${body.password}`).toString(
      "base64",
    );

    // Test 1: Check site accessibility and get site info
    let siteResponse;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      siteResponse = await fetch(`${siteUrl}/wp-json`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      if (fetchError.name === "AbortError") {
        return NextResponse.json(
          {
            success: false,
            error: "Connection timeout",
            details: `Request timed out after 15 seconds. The WordPress site at ${siteUrl} is not responding.`,
          },
          { status: 408 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: "Cannot reach WordPress site",
          details:
            fetchError.cause?.code === "ENOTFOUND"
              ? `Domain not found: ${siteUrl}. Please check the URL is correct.`
              : `Network error: ${fetchError.message}`,
        },
        { status: 400 },
      );
    }

    if (!siteResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot connect to WordPress REST API",
          details: `Status ${siteResponse.status}: ${siteResponse.statusText}`,
          status: siteResponse.status,
        },
        { status: 400 },
      );
    }

    const siteData = await siteResponse.json();

    // Test 2: Check authentication by fetching current user
    let userResponse;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      userResponse = await fetch(`${siteUrl}/wp-json/wp/v2/users/me`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      if (fetchError.name === "AbortError") {
        return NextResponse.json(
          {
            success: false,
            error: "Authentication timeout",
            details: "Request timed out while checking user credentials.",
          },
          { status: 408 },
        );
      }
      throw fetchError; // Re-throw unexpected errors
    }

    if (!userResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication failed",
          details:
            "Invalid username or application password. Please check your credentials.",
          status: userResponse.status,
        },
        { status: 401 },
      );
    }

    const userData = await userResponse.json();

    // Test 3: Check post creation permissions
    const canPublish = userData.capabilities?.publish_posts || false;
    const canEdit = userData.capabilities?.edit_posts || false;
    const canUpload = userData.capabilities?.upload_files || false;

    console.log("Test successful! Returning response with site info");

    return createSuccessResponse({
      connected: true,
      site_url: siteUrl,
      site_name: siteData.name || "WordPress Site",
      rest_api_version: siteData.namespaces?.includes("wp/v2")
        ? "v2"
        : "unknown",
      authenticated_user: userData.name || body.username,
      user_capabilities: {
        can_publish: canPublish,
        can_edit: canEdit,
        can_upload: canUpload,
      },
      message: "WordPress connection successful",
    });
  } catch (error: any) {
    console.error("WordPress test error:", error);
    console.error("Error stack:", error.stack);
    console.error("Error details:", JSON.stringify(error, null, 2));
    return handleApiError(error);
  }
}
