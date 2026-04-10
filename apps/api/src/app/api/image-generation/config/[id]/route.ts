/**
 * Image Generator Configuration API (Single Config)
 * PUT    /api/image-generation/config/[id] - Update config
 * DELETE /api/image-generation/config/[id] - Delete config
 */

import { NextRequest, NextResponse } from "next/server";
// TODO-supabase: import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { updateImageGeneratorConfigSchema } from "@brighttale/shared/schemas/imageGeneration";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const validated = updateImageGeneratorConfigSchema.parse(body);

    const existing = await prisma.imageGeneratorConfig.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Config not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (validated.api_key) {
      if (!process.env.ENCRYPTION_SECRET) {
        return NextResponse.json(
          { error: "ENCRYPTION_SECRET environment variable is not set." },
          { status: 500 },
        );
      }
      updateData.api_key = encrypt(validated.api_key);
    }

    if (validated.model !== undefined) updateData.model = validated.model;
    if (validated.config_json !== undefined) updateData.config_json = validated.config_json;

    if (validated.is_active !== undefined) {
      updateData.is_active = validated.is_active;
      if (validated.is_active) {
        await prisma.imageGeneratorConfig.updateMany({
          where: { id: { not: id }, is_active: true },
          data: { is_active: false },
        });
      }
    }

    const config = await prisma.imageGeneratorConfig.update({
      where: { id },
      data: updateData,
    });

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
    const message = error instanceof Error ? error.message : "Failed to update config";
    console.error("Error updating image generator config:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await prisma.imageGeneratorConfig.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting image generator config:", error);
    return NextResponse.json({ error: "Failed to delete config" }, { status: 500 });
  }
}
