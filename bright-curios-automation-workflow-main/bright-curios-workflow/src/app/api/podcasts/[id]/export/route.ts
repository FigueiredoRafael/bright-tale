/**
 * Podcast Export API
 * GET /api/podcasts/[id]/export?format=markdown|html|json
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createErrorResponse } from "@/lib/api/errors";
import {
  generatePodcastMarkdownExport,
  generatePodcastHtmlExport,
} from "@/lib/exporters/podcastExporter";
import type { PodcastOutput } from "@/types/agents";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "markdown";

    const draft = await prisma.podcastDraft.findUnique({ where: { id } });

    if (!draft) {
      return NextResponse.json(createErrorResponse("Podcast not found", 404), { status: 404 });
    }

    const podcast: PodcastOutput = {
      episode_title: draft.episode_title,
      episode_description: draft.episode_description,
      intro_hook: draft.intro_hook,
      talking_points: JSON.parse(draft.talking_points_json),
      personal_angle: draft.personal_angle,
      guest_questions: draft.guest_questions,
      outro: draft.outro,
      duration_estimate: draft.duration_estimate ?? "",
    };

    const slug = draft.episode_title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    switch (format) {
      case "html": {
        const html = generatePodcastHtmlExport(podcast);
        return new NextResponse(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": `attachment; filename="${slug}.html"`,
          },
        });
      }

      case "json": {
        return NextResponse.json(
          { id: draft.id, ...podcast, word_count: draft.word_count, status: draft.status,
            project_id: draft.project_id, idea_id: draft.idea_id,
            created_at: draft.created_at, updated_at: draft.updated_at },
          { headers: { "Content-Disposition": `attachment; filename="${slug}.json"` } },
        );
      }

      case "markdown":
      default: {
        const markdown = generatePodcastMarkdownExport(podcast);
        return new NextResponse(markdown, {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="${slug}.md"`,
          },
        });
      }
    }
  } catch (error) {
    console.error("Failed to export podcast:", error);
    return NextResponse.json(createErrorResponse("Failed to export podcast", 500), { status: 500 });
  }
}
