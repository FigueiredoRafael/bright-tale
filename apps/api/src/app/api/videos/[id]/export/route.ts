/**
 * Video Export API
 * GET /api/videos/[id]/export?format=markdown|html|teleprompter|json
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import { createErrorResponse } from "@/lib/api/errors";
import {
  generateVideoMarkdownExport,
  generateVideoHtmlExport,
  generateTeleprompterExport,
} from "@/lib/exporters/videoExporter";
import type { VideoOutput } from "@brighttale/shared/types/agents";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "markdown";

    const { data: video, error } = await sb.from('video_drafts').select('*').eq('id', id).maybeSingle();
    if (error) throw error;

    if (!video) {
      return NextResponse.json(createErrorResponse("Video not found", 404), { status: 404 });
    }

    const videoOutput: VideoOutput = {
      title_options: video.title_options,
      thumbnail: video.thumbnail_json ? JSON.parse(video.thumbnail_json) : undefined,
      script: video.script_json ? JSON.parse(video.script_json) : undefined,
      total_duration_estimate: video.total_duration_estimate ?? "",
    };

    const slug = video.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    switch (format) {
      case "html": {
        const html = generateVideoHtmlExport(videoOutput, video.title);
        return new NextResponse(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": `attachment; filename="${slug}-script.html"`,
          },
        });
      }

      case "teleprompter": {
        const text = generateTeleprompterExport(videoOutput, video.title);
        return new NextResponse(text, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${slug}-teleprompter.txt"`,
          },
        });
      }

      case "json": {
        return NextResponse.json(
          {
            id: video.id,
            title: video.title,
            ...videoOutput,
            word_count: video.word_count,
            status: video.status,
            project_id: video.project_id,
            idea_id: video.idea_id,
            created_at: video.created_at,
            updated_at: video.updated_at,
          },
          {
            headers: {
              "Content-Disposition": `attachment; filename="${slug}.json"`,
            },
          },
        );
      }

      case "markdown":
      default: {
        const markdown = generateVideoMarkdownExport(videoOutput, video.title);
        return new NextResponse(markdown, {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="${slug}-script.md"`,
          },
        });
      }
    }
  } catch (error) {
    console.error("Failed to export video:", error);
    return NextResponse.json(createErrorResponse("Failed to export video", 500), { status: 500 });
  }
}
