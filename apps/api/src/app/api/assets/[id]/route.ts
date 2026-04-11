/**
 * DELETE /api/assets/[id]
 * Delete an asset — also removes local file if source="generated"
 */
import { NextRequest, NextResponse } from "next/server";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { createServiceClient } from '@/lib/supabase';
import { deleteImageFile } from "@/lib/files/imageStorage";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;

    const { data: asset, error } = await sb.from('assets').select('*').eq('id', id).maybeSingle();
    if (error) throw error;

    if (!asset) {
      throw new ApiError(404, "Asset not found");
    }

    // Remove local file for generated images
    if (asset.source === "generated" && asset.local_path) {
      await deleteImageFile(asset.local_path);
    }

    const { error: delErr } = await sb.from('assets').delete().eq('id', id);
    if (delErr) throw delErr;

    return NextResponse.json(
      createSuccessResponse({ deleted: true, asset_id: id, message: "Asset deleted successfully" }),
      { status: 200 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
