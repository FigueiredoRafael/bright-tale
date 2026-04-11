/**
 * Image Generator Configuration API
 * POST /api/image-generation/config - Create new config
 * GET  /api/image-generation/config - List all configs
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import { encrypt } from "@/lib/crypto";
import { imageGeneratorConfigSchema } from "@brighttale/shared/schemas/imageGeneration";

export async function POST(req: NextRequest) {
  try {
    const sb = createServiceClient();
    const body = await req.json();
    const validated = imageGeneratorConfigSchema.parse(body);

    if (!process.env.ENCRYPTION_SECRET) {
      return NextResponse.json(
        {
          error: "Server configuration error",
          message: "ENCRYPTION_SECRET environment variable is not set.",
        },
        { status: 500 },
      );
    }

    const encryptedKey = encrypt(validated.api_key);

    if (validated.is_active) {
      await sb.from('image_generator_configs')
        .update({ is_active: false })
        .eq('is_active', true);
    }

    const { data: config, error } = await sb.from('image_generator_configs').insert({
      provider: validated.provider,
      api_key: encryptedKey,
      model: validated.model,
      is_active: validated.is_active,
      config_json: validated.config_json,
    }).select().single();

    if (error) throw error;

    return NextResponse.json({
      id: config.id,
      provider: config.provider,
      model: config.model,
      is_active: config.is_active,
      config_json: config.config_json,
      created_at: config.created_at,
      updated_at: config.updated_at,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create image generator config";
    console.error("Error creating image generator config:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  try {
    const sb = createServiceClient();
    const { data: configs, error } = await sb
      .from('image_generator_configs')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const safeConfigs = (configs ?? []).map((config: any) => ({
      id: config.id,
      provider: config.provider,
      model: config.model,
      is_active: config.is_active,
      config_json: config.config_json,
      created_at: config.created_at,
      updated_at: config.updated_at,
      has_api_key: !!config.api_key,
    }));

    return NextResponse.json(safeConfigs);
  } catch (error) {
    console.error("Error fetching image generator configs:", error);
    return NextResponse.json({ error: "Failed to fetch configs" }, { status: 500 });
  }
}
