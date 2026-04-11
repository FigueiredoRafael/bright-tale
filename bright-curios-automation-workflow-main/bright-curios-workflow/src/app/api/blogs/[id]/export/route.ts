/**
 * Blog Export API
 * GET /api/blogs/[id]/export?format=markdown|html|json
 * Export a blog draft in various formats
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createErrorResponse } from "@/lib/api/errors";
import { markdownToHtml } from "@/lib/utils";
import type { BlogOutput } from "@/types/agents";

interface Params {
  params: Promise<{ id: string }>;
}

// Wrap HTML content in full document with styling
function wrapInHtmlDocument(bodyHtml: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        h1, h2, h3 { margin-top: 1.5em; margin-bottom: 0.5em; }
        h1 { font-size: 2em; }
        h2 { font-size: 1.5em; color: #444; }
        h3 { font-size: 1.2em; color: #555; }
        p { margin-bottom: 1em; }
        blockquote {
            border-left: 4px solid #007bff;
            padding-left: 1em;
            margin: 1em 0;
            color: #555;
            font-style: italic;
        }
        code {
            background: #f4f4f4;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-size: 0.9em;
        }
        pre {
            background: #f4f4f4;
            padding: 1em;
            border-radius: 5px;
            overflow-x: auto;
        }
        pre code {
            background: none;
            padding: 0;
        }
        a { color: #007bff; text-decoration: none; }
        a:hover { text-decoration: underline; }
        ul, ol { margin-bottom: 1em; }
        li { margin-bottom: 0.5em; }
        hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
    </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

// Generate clean markdown export
function generateMarkdownExport(blog: BlogOutput): string {
  let md = `# ${blog.title}\n\n`;

  // Meta section
  md += `---\n`;
  md += `slug: ${blog.slug}\n`;
  md += `meta_description: "${blog.meta_description}"\n`;
  if (blog.primary_keyword) {
    md += `primary_keyword: ${blog.primary_keyword}\n`;
  }
  if (blog.secondary_keywords && blog.secondary_keywords.length > 0) {
    md += `secondary_keywords: [${blog.secondary_keywords.join(", ")}]\n`;
  }
  md += `word_count: ${blog.word_count}\n`;
  md += `---\n\n`;

  // Full draft
  md += blog.full_draft || "";

  // Affiliate section if present
  if (blog.affiliate_integration?.copy) {
    md += `\n\n---\n\n## Affiliate Information\n\n`;
    md += `**Placement:** ${blog.affiliate_integration.placement}\n\n`;
    md += `**Copy:** ${blog.affiliate_integration.copy}\n\n`;
    if (blog.affiliate_integration.rationale) {
      md += `**Rationale:** ${blog.affiliate_integration.rationale}\n`;
    }
  }

  return md;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "markdown";

    const blog = await prisma.blogDraft.findUnique({
      where: { id },
    });

    if (!blog) {
      return NextResponse.json(createErrorResponse("Blog not found", 404), {
        status: 404,
      });
    }

    // Transform to BlogOutput format
    const blogOutput: BlogOutput = {
      title: blog.title,
      slug: blog.slug,
      meta_description: blog.meta_description,
      full_draft: blog.full_draft,
      outline: blog.outline_json ? JSON.parse(blog.outline_json) : [],
      primary_keyword: blog.primary_keyword || "",
      secondary_keywords: blog.secondary_keywords,
      affiliate_integration: {
        placement:
          (blog.affiliate_placement as "intro" | "middle" | "conclusion") ||
          "middle",
        copy: blog.affiliate_copy || "",
        product_link_placeholder: blog.affiliate_link || "",
        rationale: blog.affiliate_rationale || "",
      },
      internal_links_suggested: blog.internal_links_json
        ? JSON.parse(blog.internal_links_json)
        : [],
      word_count: blog.word_count,
    };

    switch (format) {
      case "html": {
        const bodyHtml = markdownToHtml(blogOutput.full_draft);
        const html = wrapInHtmlDocument(bodyHtml, blogOutput.title);
        return new NextResponse(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": `attachment; filename="${blog.slug}.html"`,
          },
        });
      }

      case "json": {
        return NextResponse.json(
          {
            id: blog.id,
            ...blogOutput,
            status: blog.status,
            project_id: blog.project_id,
            idea_id: blog.idea_id,
            created_at: blog.created_at,
            updated_at: blog.updated_at,
          },
          {
            headers: {
              "Content-Disposition": `attachment; filename="${blog.slug}.json"`,
            },
          },
        );
      }

      case "markdown":
      default: {
        const markdown = generateMarkdownExport(blogOutput);
        return new NextResponse(markdown, {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="${blog.slug}.md"`,
          },
        });
      }
    }
  } catch (error) {
    console.error("Failed to export blog:", error);
    return NextResponse.json(
      createErrorResponse("Failed to export blog", 500),
      { status: 500 },
    );
  }
}
