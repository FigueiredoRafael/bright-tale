/**
 * GET /api/assets/[id]/download
 * Stream a single generated image file as an attachment.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createServiceClient } from '@/lib/supabase';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;

    const { data: asset, error } = await sb.from('assets').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    if (!asset.local_path) {
      return NextResponse.json({ error: "Asset has no local file to download" }, { status: 400 });
    }

    const absolutePath = path.resolve(process.cwd(), asset.local_path);

    if (!fs.existsSync(absolutePath)) {
      return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
    }

    const ext = path.extname(absolutePath).slice(1) || "jpg";
    const mimeType = ext === "png" ? "image/png" : "image/jpeg";
    const filename = `image-${id.slice(0, 8)}.${ext}`;

    const fileBuffer = fs.readFileSync(absolutePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(fileBuffer.length),
      },
    });
  } catch (error) {
    console.error("Error downloading asset:", error);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
