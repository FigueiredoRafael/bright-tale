/**
 * Shorts Export API
 * GET /api/shorts/[id]/export?format=markdown|html|json
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createErrorResponse } from "@/lib/api/errors";
import {
  generateShortsMarkdownExport,
  generateShortsHtmlExport,
} from "@/lib/exporters/shortsExporter";
import type { ShortOutput } from "@/types/agents";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "markdown";

    const draft = await prisma.shortsDraft.findUnique({ where: { id } });

    if (!draft) {
      return NextResponse.json(createErrorResponse("Shorts not found", 404), { status: 404 });
    }

    const shorts: ShortOutput[] = JSON.parse(draft.shorts_json);

    switch (format) {
      case "html": {
        const html = generateShortsHtmlExport(shorts);
        return new NextResponse(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": `attachment; filename="shorts-${id}.html"`,
          },
        });
      }

      case "json": {
        return NextResponse.json(
          { id: draft.id, shorts, short_count: draft.short_count, status: draft.status,
            project_id: draft.project_id, idea_id: draft.idea_id,
            created_at: draft.created_at, updated_at: draft.updated_at },
          { headers: { "Content-Disposition": `attachment; filename="shorts-${id}.json"` } },
        );
      }

      case "markdown":
      default: {
        const markdown = generateShortsMarkdownExport(shorts);
        return new NextResponse(markdown, {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="shorts-${id}.md"`,
          },
        });
      }
    }
  } catch (error) {
    console.error("Failed to export shorts:", error);
    return NextResponse.json(createErrorResponse("Failed to export shorts", 500), { status: 500 });
  }
}
