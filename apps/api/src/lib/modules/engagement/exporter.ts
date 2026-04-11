/**
 * Engagement module exporter
 * Generates markdown from EngagementModuleOutput.
 * No prior exporter existed for this format — this is the first.
 */

import type { EngagementModuleOutput } from "./schema.js";

export function generateEngagementMarkdownExport(engagement: EngagementModuleOutput): string {
  let md = `# Engagement Content\n\n`;

  // Pinned Comment
  md += `## Pinned Comment\n\n`;
  md += `${engagement.pinned_comment}\n\n`;

  // Community Post
  md += `---\n\n`;
  md += `## Community Post\n\n`;
  md += `${engagement.community_post}\n\n`;

  // Twitter Thread
  md += `---\n\n`;
  md += `## Twitter Thread\n\n`;
  md += `### Hook Tweet\n\n`;
  md += `${engagement.twitter_thread.hook_tweet}\n\n`;

  if (engagement.twitter_thread.thread_outline.length > 0) {
    md += `### Thread\n\n`;
    engagement.twitter_thread.thread_outline.forEach((tweet, i) => {
      md += `**Tweet ${i + 2}:**\n\n`;
      md += `${tweet}\n\n`;
    });
  }

  return md;
}
