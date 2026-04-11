/**
 * Image Generator Configuration API (Single Config)
 * PUT    /api/image-generation/config/[id] - Update config
 * DELETE /api/image-generation/config/[id] - Delete config
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import { encrypt } from "@/lib/crypto";
import { updateImageGeneratorConfigSchema } from "@brighttale/shared/schemas/imageGeneration";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const body = await req.json();
    const validated = updateImageGeneratorConfigSchema.parse(body);

    const { data: existing, error: findErr } = await sb
      .from('image_generator_configs')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (findErr) throw findErr;
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
        await sb.from('image_generator_configs')
          .update({ is_active: false })
          .neq('id', id)
          .eq('is_active', true);
      }
    }

    const { data: config, error } = await sb
      .from('image_generator_configs')
      .update(updateData as any)
      .eq('id', id)
      .select()
      .single();

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
    const sb = createServiceClient();
    const { id } = await params;
    const { error } = await sb.from('image_generator_configs').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting image generator config:", error);
    return NextResponse.json({ error: "Failed to delete config" }, { status: 500 });
  }
}
