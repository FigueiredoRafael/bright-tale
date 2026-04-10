/**
 * Image Generator Connection Test
 * POST /api/image-generation/test
 *
 * Tests connectivity by generating a single low-cost test image.
 */

import { NextRequest, NextResponse } from "next/server";
import { GeminiImagenProvider } from "@/lib/ai/providers/gemini-imagen";
import { decrypt } from "@/lib/crypto";
// TODO-supabase: import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body as { id?: string };

    let provider: GeminiImagenProvider;

    if (id) {
      const config = await prisma.imageGeneratorConfig.findUnique({ where: { id } });
      if (!config) {
        return NextResponse.json({ error: "Config not found" }, { status: 404 });
      }
      const apiKey = decrypt(config.api_key);
      provider = new GeminiImagenProvider(apiKey, config.model);
    } else {
      // Test with env key if provided in request body
      const { api_key, model } = body as { api_key?: string; model?: string };
      if (!api_key) {
        return NextResponse.json({ error: "api_key required for test" }, { status: 400 });
      }
      provider = new GeminiImagenProvider(api_key, model ?? "gemini-2.5-flash-image");
    }

    const results = await provider.generateImages({
      prompt: "A simple test image: a bright blue circle on a white background.",
      numImages: 1,
      aspectRatio: "1:1",
    });

    if (results.length === 0) {
      return NextResponse.json({ success: false, error: "No images returned from provider" });
    }

    return NextResponse.json({
      success: true,
      message: `Connection successful. Generated ${results.length} test image(s).`,
      mimeType: results[0].mimeType,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Connection test failed";
    console.error("Image generation test failed:", error);
    return NextResponse.json({ success: false, error: message });
  }
}
