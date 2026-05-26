#!/usr/bin/env tsx
/**
 * Sync agents/agent-*.md from scripts/agents/*.ts (source of truth).
 * Markdowns are documentation mirrors of the assembled prompt that gets
 * seeded into agent_prompts.instructions. Run after editing any seed.
 *
 * Run: npx tsx scripts/agents-to-markdown.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assembleInstructions } from '@brighttale/shared';
import { ALL_AGENTS } from './agents/index';

const REPO_ROOT = process.cwd();
const OUT_DIR = join(REPO_ROOT, 'agents');

// slug → markdown filename. Matches the historical numbering used in
// agents/agent-{n}{sub}-{slug}.md. Stage alone isn't enough because the
// 3b family (blog/shorts/podcast/engagement/video) all share stage='production'.
const FILENAME_BY_SLUG: Record<string, string> = {
  brainstorm: 'agent-1-brainstorm.md',
  research: 'agent-2-research.md',
  'content-core': 'agent-3a-content-core.md',
  blog: 'agent-3b-blog.md',
  shorts: 'agent-3b-shorts.md',
  podcast: 'agent-3b-podcast.md',
  engagement: 'agent-3b-engagement.md',
  video: 'agent-3b-video.md',
  review: 'agent-4-review.md',
  assets: 'agent-5-assets.md',
};

function main() {
  let written = 0;
  for (const agent of ALL_AGENTS) {
    const filename = FILENAME_BY_SLUG[agent.slug];
    if (!filename) {
      console.warn(`[skip] no filename mapping for slug=${agent.slug}`);
      continue;
    }
    const body = assembleInstructions(agent.sections);
    const header = `# ${agent.name}\n\n_Generated from \`scripts/agents/${agent.slug}.ts\` via \`scripts/agents-to-markdown.ts\`. Do not edit by hand — change the seed and rerun._\n\n---\n\n`;
    writeFileSync(join(OUT_DIR, filename), header + body + '\n');
    written += 1;
  }
  console.log(`Synced ${written} agent markdown files in ${OUT_DIR}`);
}

main();
