/**
 * Blog module exporter
 * Generates markdown and HTML from a BlogModuleOutput.
 */

import type { BlogModuleOutput } from "./schema";
import { markdownToHtml } from "../../utils.js";

export function generateBlogMarkdownExport(blog: BlogModuleOutput): string {
  let md = `# ${blog.title}\n\n`;

  // Front-matter style metadata block
  md += `---\n`;
  md += `slug: ${blog.slug}\n`;
  md += `primary_keyword: ${blog.primary_keyword}\n`;
  if (blog.secondary_keywords.length > 0) {
    md += `secondary_keywords: ${blog.secondary_keywords.join(", ")}\n`;
  }
  md += `word_count: ${blog.word_count}\n`;
  md += `---\n\n`;

  // Meta description
  md += `**Meta Description:** ${blog.meta_description}\n\n`;

  // Outline
  if (blog.outline.length > 0) {
    md += `## Outline\n\n`;
    blog.outline.forEach((item) => {
      md += `### ${item.h2}\n`;
      md += `*Target: ~${item.word_count_target} words*\n`;
      if (item.key_points.length > 0) {
        item.key_points.forEach((p) => { md += `- ${p}\n`; });
      }
      md += `\n`;
    });
  }

  md += `---\n\n`;

  // Full draft
  md += `## Full Draft\n\n`;
  md += `${blog.full_draft}\n\n`;

  // Affiliate integration
  md += `---\n\n`;
  md += `## Affiliate Integration\n\n`;
  md += `**Placement:** ${blog.affiliate_integration.placement}\n\n`;
  md += `**Copy:** ${blog.affiliate_integration.copy}\n\n`;
  md += `**Link Placeholder:** \`${blog.affiliate_integration.product_link_placeholder}\`\n\n`;
  md += `**Rationale:** ${blog.affiliate_integration.rationale}\n\n`;

  // Internal links
  if (blog.internal_links_suggested.length > 0) {
    md += `## Suggested Internal Links\n\n`;
    blog.internal_links_suggested.forEach((link) => {
      md += `- **${link.topic}** → \`${link.anchor_text}\`\n`;
    });
    md += `\n`;
  }

  return md;
}

export function generateBlogHtmlExport(blog: BlogModuleOutput): string {
  const md = generateBlogMarkdownExport(blog);
  const bodyHtml = markdownToHtml(md);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${blog.meta_description.replace(/"/g, "&quot;")}">
    <title>${blog.title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.7;
            max-width: 860px;
            margin: 0 auto;
            padding: 24px;
            color: #222;
            background: #fafafa;
        }
        h1 { font-size: 2em; border-bottom: 2px solid #333; padding-bottom: 0.3em; }
        h2 { font-size: 1.4em; margin-top: 2em; padding: 8px 12px;
             background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 0 6px 6px 0; }
        h3 { font-size: 1.1em; margin-top: 1.2em; color: #4b5563; }
        blockquote {
            border-left: 4px solid #cbd5e1; padding: 6px 12px;
            margin: 8px 0; background: #f1f5f9;
            border-radius: 0 4px 4px 0; font-size: 0.9em;
        }
        code { background: #f1f5f9; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
        pre { background: #f1f5f9; padding: 1em; border-radius: 6px; overflow-x: auto; }
        hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5em 0; }
        ul, ol { margin-bottom: 1em; }
        li { margin-bottom: 0.3em; }
        p { margin-bottom: 0.8em; }
        strong { color: #1e293b; }
    </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
