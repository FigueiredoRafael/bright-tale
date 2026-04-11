/**
 * Shorts export utilities
 * Generates markdown and HTML formats from ShortOutput[]
 */

import type { ShortOutput } from "@brighttale/shared/types/agents";
import { markdownToHtml } from "../utils.js";

export function generateShortsMarkdownExport(shorts: ShortOutput[]): string {
  let md = `# Shorts Scripts\n\n`;
  md += `---\n`;
  md += `count: ${shorts.length}\n`;
  md += `---\n\n`;

  shorts.forEach((short) => {
    md += `## Short #${short.short_number}: ${short.title}\n\n`;
    md += `**Duration:** ${short.duration}\n`;
    md += `**Visual Style:** ${short.visual_style}\n\n`;

    md += `### 🎣 Hook (0:00-0:02)\n\n`;
    md += `${short.hook}\n\n`;

    md += `### 📜 Full Script\n\n`;
    md += `${short.script}\n\n`;

    md += `### 📣 CTA\n\n`;
    md += `${short.cta}\n\n`;

    if (short.sound_effects) {
      md += `> **Sound Effects:** ${short.sound_effects}\n`;
    }
    if (short.background_music) {
      md += `> **Background Music:** ${short.background_music}\n`;
    }

    md += `\n---\n\n`;
  });

  return md;
}

export function generateShortsHtmlExport(shorts: ShortOutput[]): string {
  const md = generateShortsMarkdownExport(shorts);
  const bodyHtml = markdownToHtml(md);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shorts Scripts</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            max-width: 860px;
            margin: 0 auto;
            padding: 24px;
            color: #222;
            background: #fafafa;
        }
        h1 { font-size: 2em; border-bottom: 2px solid #333; padding-bottom: 0.3em; }
        h2 { font-size: 1.3em; margin-top: 2em; padding: 8px 12px;
             background: linear-gradient(135deg, #f3e8ff, #ede9fe);
             border-left: 4px solid #8b5cf6; border-radius: 0 6px 6px 0; }
        h3 { font-size: 1.1em; margin-top: 1.2em; color: #4b5563; }
        blockquote {
            border-left: 4px solid #cbd5e1;
            padding: 6px 12px;
            margin: 8px 0;
            background: #f1f5f9;
            border-radius: 0 4px 4px 0;
            font-size: 0.9em;
        }
        hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5em 0; }
        p { margin-bottom: 0.8em; }
        strong { color: #1e293b; }
    </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
