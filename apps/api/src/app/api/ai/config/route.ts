/**
 * AI Provider Configuration API
 * POST /api/ai/config - Create new AI config
 * GET /api/ai/config - List all AI configs
 */

import { NextRequest, NextResponse } from "next/server";
// TODO-supabase: import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { createAIConfigSchema } from "@brighttale/shared/schemas/ai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = createAIConfigSchema.parse(body);

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

    // Encrypt API key
    const encryptedKey = encrypt(validated.api_key);

    // If setting as active, deactivate all others
    if (validated.is_active) {
      await prisma.aIProviderConfig.updateMany({
        where: { is_active: true },
        data: { is_active: false },
      });
    }

    // Create config
    const config = await prisma.aIProviderConfig.create({
      data: {
        provider: validated.provider,
        api_key: encryptedKey,
        is_active: validated.is_active,
        config_json: validated.config_json,
      },
    });

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
    const configs = await prisma.aIProviderConfig.findMany({
      orderBy: { updated_at: "desc" },
    });

    // Don't return encrypted API keys
    const safeConfigs = configs.map(config => ({
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
