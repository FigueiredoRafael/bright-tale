/**
 * Podcast export utilities
 * Generates markdown and HTML formats from PodcastOutput
 */

import type { PodcastOutput } from "@brighttale/shared/types/agents";
import { markdownToHtml } from "../utils.js";

export function generatePodcastMarkdownExport(podcast: PodcastOutput): string {
  let md = `# Podcast Episode: ${podcast.episode_title}\n\n`;
  md += `---\n`;
  md += `duration: ${podcast.duration_estimate || "TBD"}\n`;
  md += `---\n\n`;

  md += `## Episode Description\n\n${podcast.episode_description}\n\n`;

  md += `## Intro Hook\n\n${podcast.intro_hook}\n\n`;

  if (podcast.talking_points?.length > 0) {
    md += `## Talking Points\n\n`;
    podcast.talking_points.forEach((tp, i) => {
      md += `### ${i + 1}. ${tp.point}\n\n`;
      md += `${tp.notes}\n\n`;
    });
  }

  if (podcast.personal_angle) {
    md += `## Personal Angle\n\n${podcast.personal_angle}\n\n`;
  }

  if (podcast.guest_questions?.length > 0) {
    md += `## Guest Questions\n\n`;
    podcast.guest_questions.forEach((q, i) => {
      md += `${i + 1}. ${q}\n`;
    });
    md += `\n`;
  }

  md += `## Outro\n\n${podcast.outro}\n\n`;
  md += `---\n\n**Duration Estimate:** ${podcast.duration_estimate || "TBD"}\n`;

  return md;
}

export function generatePodcastHtmlExport(podcast: PodcastOutput): string {
  const md = generatePodcastMarkdownExport(podcast);
  const bodyHtml = markdownToHtml(md);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${podcast.episode_title}</title>
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
        h2 { font-size: 1.3em; margin-top: 2em; padding: 8px 12px;
             background: #ecfdf5; border-left: 4px solid #10b981; border-radius: 0 6px 6px 0; }
        h3 { font-size: 1.1em; margin-top: 1.2em; color: #4b5563; }
        hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5em 0; }
        p { margin-bottom: 0.8em; }
        ol, ul { margin-bottom: 1em; }
        li { margin-bottom: 0.4em; }
    </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
