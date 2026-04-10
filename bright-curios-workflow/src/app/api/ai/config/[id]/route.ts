/**
 * AI Provider Configuration API (Single Config)
 * GET /api/ai/config/[id] - Get single config
 * PUT /api/ai/config/[id] - Update config
 * DELETE /api/ai/config/[id] - Delete config
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { updateAIConfigSchema } from "@/lib/schemas/ai";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const config = await prisma.aIProviderConfig.findUnique({
      where: { id },
    });

    if (!config) {
      return NextResponse.json({ error: "Config not found" }, { status: 404 });
    }

    // Don't return encrypted API key
    return NextResponse.json({
      id: config.id,
      provider: config.provider,
      is_active: config.is_active,
      config_json: config.config_json,
      created_at: config.created_at,
      updated_at: config.updated_at,
      has_api_key: !!config.api_key,
    });
  } catch (error: any) {
    console.error("Error fetching AI config:", error);
    return NextResponse.json(
      { error: "Failed to fetch AI config" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const validated = updateAIConfigSchema.parse(body);

    // Check if config exists
    const existing = await prisma.aIProviderConfig.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Config not found" }, { status: 404 });
    }

    // Build update data
    const updateData: any = {};

    if (validated.api_key) {
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
      updateData.api_key = encrypt(validated.api_key);
    }

    if (validated.is_active !== undefined) {
      updateData.is_active = validated.is_active;

      // If setting as active, deactivate all others
      if (validated.is_active) {
        await prisma.aIProviderConfig.updateMany({
          where: {
            id: { not: id },
            is_active: true,
          },
          data: { is_active: false },
        });
      }
    }

    if (validated.config_json !== undefined) {
      updateData.config_json = validated.config_json;
    }

    // Update config
    const config = await prisma.aIProviderConfig.update({
      where: { id },
      data: updateData,
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
    console.error("Error updating AI config:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update AI config" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    await prisma.aIProviderConfig.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting AI config:", error);
    return NextResponse.json(
      { error: "Failed to delete AI config" },
      { status: 500 },
    );
  }
}
