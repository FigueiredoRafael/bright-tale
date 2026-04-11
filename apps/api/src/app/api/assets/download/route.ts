/**
 * GET /api/assets/download?ids=id1,id2,id3
 * Bulk download — streams a ZIP archive of selected generated images.
 * If no ids provided, downloads all generated images accessible by the caller.
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import { Readable } from "stream";
import { createServiceClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const sb = createServiceClient();
    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get("ids");
    const projectId = searchParams.get("projectId");

    let query = sb.from('assets').select('*').eq('source', 'generated');

    if (idsParam) {
      const ids = idsParam.split(",").map(s => s.trim()).filter(Boolean);
      query = query.in('id', ids);
    } else if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data: assets, error } = await query;
    if (error) throw error;

    const validAssets = (assets ?? []).filter((a: any) => a.local_path && fs.existsSync(path.resolve(process.cwd(), a.local_path)));

    if (validAssets.length === 0) {
      return NextResponse.json({ error: "No downloadable assets found" }, { status: 404 });
    }

    // Create ZIP archive in memory
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      archive.on("data", (chunk: Buffer) => chunks.push(chunk));
      archive.on("end", resolve);
      archive.on("error", reject);

      for (const asset of validAssets) {
        const absolutePath = path.resolve(process.cwd(), asset.local_path!);
        const ext = path.extname(absolutePath).slice(1) || "jpg";
        const role = asset.role ?? "image";
        const filename = `${role}-${asset.id.slice(0, 8)}.${ext}`;
        archive.file(absolutePath, { name: filename });
      }

      archive.finalize();
    });

    const zipBuffer = Buffer.concat(chunks);
    const timestamp = new Date().toISOString().slice(0, 10);
    const zipName = `images-${timestamp}.zip`;

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
        "Content-Length": String(zipBuffer.length),
      },
    });
  } catch (error) {
    console.error("Bulk download error:", error);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
