/**
 * POST /api/assets/generate
 * Generate an image with the active AI image provider and save it locally.
 */

import { NextRequest, NextResponse } from "next/server";
import { getImageProvider } from "@/lib/ai/imageIndex";
import { saveImageLocally } from "@/lib/files/imageStorage";
import { generateImageRequestSchema } from "@brighttale/shared/schemas/imageGeneration";
import { createServiceClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const sb = createServiceClient();
    const body = await req.json();
    const validated = generateImageRequestSchema.parse(body);

    const provider = await getImageProvider();

    const results = await provider.generateImages({
      prompt: validated.prompt,
      numImages: validated.numImages,
      aspectRatio: validated.aspectRatio,
      outputMimeType: validated.outputMimeType,
    });

    if (results.length === 0) {
      return NextResponse.json({ error: "No images were generated" }, { status: 502 });
    }

    // Save all generated images and create Asset records
    const assets = await Promise.all(
      results.map(async (result) => {
        const { localPath, publicUrl } = await saveImageLocally(
          result.base64,
          result.mimeType,
          validated.project_id,
        );

        const { data, error } = await sb.from('assets').insert({
          project_id: validated.project_id ?? null,
          asset_type: "image",
          source: "generated",
          source_url: publicUrl,
          local_path: localPath,
          prompt: validated.prompt,
          role: validated.role ?? null,
          content_type: validated.content_type ?? null,
          content_id: validated.content_id ?? null,
        }).select().single();

        if (error) throw error;
        return data;
      }),
    );

    return NextResponse.json(assets.length === 1 ? assets[0] : assets, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Image generation failed";
    console.error("Image generation error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
