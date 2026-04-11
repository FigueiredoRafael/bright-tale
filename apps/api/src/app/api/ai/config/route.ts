/**
 * AI Provider Configuration API
 * POST /api/ai/config - Create new AI config
 * GET /api/ai/config - List all AI configs
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import { encrypt } from "@/lib/crypto";
import { createAIConfigSchema } from "@brighttale/shared/schemas/ai";

export async function POST(req: NextRequest) {
  try {
    const sb = createServiceClient();
    const body = await req.json();
    const validated = createAIConfigSchema.parse(body);

    if (!process.env.ENCRYPTION_SECRET) {
      return NextResponse.json(
        {
          error: "Server configuration error",
          message: "ENCRYPTION_SECRET environment variable is not set. Please configure it in your .env file.",
        },
        { status: 500 },
      );
    }

    const encryptedKey = encrypt(validated.api_key);

    if (validated.is_active) {
      await sb.from('ai_provider_configs').update({ is_active: false }).eq('is_active', true);
    }

    const { data: config, error } = await sb.from('ai_provider_configs').insert({
      provider: validated.provider,
      api_key: encryptedKey,
      is_active: validated.is_active,
      config_json: validated.config_json,
    }).select().single();

    if (error) throw error;

    return NextResponse.json({
      id: config.id,
      provider: config.provider,
      is_active: config.is_active,
      config_json: config.config_json,
      created_at: config.created_at,
      updated_at: config.updated_at,
    });
  } catch (error: any) {
    console.error("Error creating AI config:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create AI config" },
      { status: 400 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const sb = createServiceClient();
    const { data: configs, error } = await sb
      .from('ai_provider_configs')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const safeConfigs = (configs ?? []).map((config: any) => ({
      id: config.id,
      provider: config.provider,
      is_active: config.is_active,
      config_json: config.config_json,
      created_at: config.created_at,
      updated_at: config.updated_at,
      has_api_key: !!config.api_key,
    }));

    return NextResponse.json(safeConfigs);
  } catch (error: any) {
    console.error("Error fetching AI configs:", error);
    return NextResponse.json(
      { error: "Failed to fetch AI configs" },
      { status: 500 },
    );
  }
}
