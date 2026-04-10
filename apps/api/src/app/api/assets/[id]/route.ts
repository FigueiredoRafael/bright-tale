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
// TODO-supabase: import { prisma } from "@/lib/prisma";
import { deleteImageFile } from "@/lib/files/imageStorage";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const asset = await prisma.asset.findUnique({ where: { id } });

    if (!asset) {
      throw new ApiError(404, "Asset not found");
    }

    // Remove local file for generated images
    if (asset.source === "generated" && asset.local_path) {
      await deleteImageFile(asset.local_path);
    }

    await prisma.asset.delete({ where: { id } });

    return NextResponse.json(
      createSuccessResponse({ deleted: true, asset_id: id, message: "Asset deleted successfully" }),
      { status: 200 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
