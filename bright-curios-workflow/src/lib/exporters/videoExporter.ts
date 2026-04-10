/**
 * Video export utilities
 * Generates markdown, HTML, and teleprompter formats from VideoOutput
 */

import type { VideoOutput } from "@/types/agents";
import { markdownToHtml } from "@/lib/utils";

// ─── Markdown Export ────────────────────────────────────────────────────────

export function generateVideoMarkdownExport(video: VideoOutput, title?: string): string {
  const displayTitle = title || video.title_options?.[0] || "Video Script";
  let md = `# Video Script: ${displayTitle}\n\n`;

  md += `---\n`;
  md += `total_duration: ${video.total_duration_estimate || "TBD"}\n`;
  md += `---\n\n`;

  // Title options
  md += `## Title Options\n\n`;
  video.title_options?.forEach((t, i) => {
    md += `${i + 1}. ${t}\n`;
  });
  md += `\n`;

  // Thumbnail
  if (video.thumbnail) {
    md += `## Thumbnail Concept\n\n`;
    md += `- **Visual:** ${video.thumbnail.visual_concept}\n`;
    md += `- **Text Overlay:** ${video.thumbnail.text_overlay}\n`;
    md += `- **Emotion:** ${video.thumbnail.emotion}\n`;
    md += `- **Why It Works:** ${video.thumbnail.why_it_works}\n\n`;
  }

  if (!video.script) return md;

  const { hook, problem, teaser, chapters, affiliate_segment, outro } = video.script;

  md += `## Script\n\n`;

  // Hook
  if (hook) {
    md += `### 🎬 HOOK (${hook.duration})\n\n`;
    md += `${hook.content}\n\n`;
    md += `> **Visual Notes:** ${hook.visual_notes}\n`;
    if (hook.sound_effects) md += `> **Sound Effects:** ${hook.sound_effects}\n`;
    if (hook.background_music) md += `> **Background Music:** ${hook.background_music}\n`;
    md += `\n`;
  }

  // Problem
  if (problem) {
    md += `### ⚡ PROBLEM (${problem.duration})\n\n`;
    md += `${problem.content}\n\n`;
    md += `> **Visual Notes:** ${problem.visual_notes}\n`;
    if (problem.sound_effects) md += `> **Sound Effects:** ${problem.sound_effects}\n`;
    if (problem.background_music) md += `> **Background Music:** ${problem.background_music}\n`;
    md += `\n`;
  }

  // Teaser
  if (teaser) {
    md += `### 🔮 TEASER (${teaser.duration})\n\n`;
    md += `${teaser.content}\n\n`;
    md += `> **Visual Notes:** ${teaser.visual_notes}\n`;
    if (teaser.sound_effects) md += `> **Sound Effects:** ${teaser.sound_effects}\n`;
    if (teaser.background_music) md += `> **Background Music:** ${teaser.background_music}\n`;
    md += `\n`;
  }

  // Chapters
  chapters?.forEach((ch) => {
    md += `### Chapter ${ch.chapter_number}: ${ch.title} (${ch.duration})\n\n`;
    md += `${ch.content}\n\n`;

    if (ch.b_roll_suggestions?.length > 0) {
      md += `**B-Roll Suggestions:**\n`;
      ch.b_roll_suggestions.forEach((b) => { md += `- ${b}\n`; });
      md += `\n`;
    }

    if (ch.key_stat_or_quote) {
      md += `**Key Stat/Quote:** ${ch.key_stat_or_quote}\n\n`;
    }

    if (ch.sound_effects) md += `> **Sound Effects:** ${ch.sound_effects}\n`;
    if (ch.background_music) md += `> **Background Music:** ${ch.background_music}\n`;
    md += `\n---\n\n`;
  });

  // Affiliate segment
  if (affiliate_segment) {
    md += `### 💰 AFFILIATE SEGMENT (${affiliate_segment.timestamp})\n\n`;
    md += `**Transition In:** ${affiliate_segment.transition_in}\n\n`;
    md += `${affiliate_segment.script}\n\n`;
    md += `**Transition Out:** ${affiliate_segment.transition_out}\n\n`;
    md += `> **Visual Notes:** ${affiliate_segment.visual_notes}\n`;
    if (affiliate_segment.sound_effects) md += `> **Sound Effects:** ${affiliate_segment.sound_effects}\n`;
    if (affiliate_segment.background_music) md += `> **Background Music:** ${affiliate_segment.background_music}\n`;
    md += `\n`;
  }

  // Outro
  if (outro) {
    md += `### 🎤 OUTRO (${outro.duration})\n\n`;
    md += `**Recap:** ${outro.recap}\n\n`;
    md += `**CTA:** ${outro.cta}\n\n`;
    md += `**End Screen:** ${outro.end_screen_prompt}\n\n`;
    if (outro.sound_effects) md += `> **Sound Effects:** ${outro.sound_effects}\n`;
    if (outro.background_music) md += `> **Background Music:** ${outro.background_music}\n`;
    md += `\n`;
  }

  md += `---\n\n**Total Duration:** ${video.total_duration_estimate || "TBD"}\n`;

  return md;
}

// ─── HTML Export ─────────────────────────────────────────────────────────────

export function generateVideoHtmlExport(video: VideoOutput, title?: string): string {
  const md = generateVideoMarkdownExport(video, title);
  const bodyHtml = markdownToHtml(md);
  const displayTitle = title || video.title_options?.[0] || "Video Script";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${displayTitle}</title>
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
        h2 { font-size: 1.4em; margin-top: 2em; color: #333; }
        h3 { font-size: 1.15em; margin-top: 1.5em; padding: 8px 12px; border-radius: 6px; }

        /* Hook — blue */
        h3:has(+ p):nth-of-type(1), h3[id*="hook"] { background: #dbeafe; border-left: 4px solid #3b82f6; }
        /* Problem — red */
        h3[id*="problem"] { background: #fee2e2; border-left: 4px solid #ef4444; }
        /* Teaser — yellow */
        h3[id*="teaser"] { background: #fef9c3; border-left: 4px solid #eab308; }
        /* Affiliate — green */
        h3[id*="affiliate"] { background: #dcfce7; border-left: 4px solid #22c55e; }
        /* Outro — purple */
        h3[id*="outro"] { background: #f3e8ff; border-left: 4px solid #a855f7; }

        blockquote {
            border-left: 4px solid #cbd5e1;
            padding: 6px 12px;
            margin: 8px 0;
            background: #f1f5f9;
            border-radius: 0 4px 4px 0;
            font-size: 0.9em;
        }
        blockquote strong { color: #475569; }
        /* Sound effects — orange */
        blockquote:has(strong:contains("Sound Effects")) {
            border-left-color: #f97316;
            background: #fff7ed;
        }
        /* Background music — purple */
        blockquote:has(strong:contains("Background Music")) {
            border-left-color: #a855f7;
            background: #faf5ff;
        }
        hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5em 0; }
        ul { margin-bottom: 1em; }
        li { margin-bottom: 0.3em; }
        p { margin-bottom: 0.8em; }
        strong { color: #1e293b; }
        pre { background: #f1f5f9; padding: 1em; border-radius: 6px; overflow-x: auto; }
        code { background: #f1f5f9; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
    </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

// ─── Teleprompter Export ──────────────────────────────────────────────────────

export function generateTeleprompterExport(video: VideoOutput, title?: string): string {
  const displayTitle = title || video.title_options?.[0] || "Video Script";
  const divider = "═".repeat(50);
  let out = `${displayTitle}\n${divider}\n\n`;
  out += `TELEPROMPTER SCRIPT\n`;
  out += `Total Duration: ${video.total_duration_estimate || "TBD"}\n\n`;

  if (!video.script) return out;

  const { hook, problem, teaser, chapters, affiliate_segment, outro } = video.script;

  // Hook
  if (hook) {
    out += `${divider}\n  HOOK — ${hook.duration}\n${divider}\n\n`;
    out += `${hook.content}\n\n`;
    if (hook.visual_notes) out += `  [PAUSE — CUT TO: ${hook.visual_notes.trim()}]\n`;
    if (hook.sound_effects) out += `  [SFX: ${hook.sound_effects.trim()}]\n`;
    if (hook.background_music) out += `  [MUSIC: ${hook.background_music.trim()}]\n`;
    out += `\n`;
  }

  // Problem
  if (problem) {
    out += `${divider}\n  PROBLEM — ${problem.duration}\n${divider}\n\n`;
    out += `${problem.content}\n\n`;
    if (problem.visual_notes) out += `  [PAUSE — SHOW: ${problem.visual_notes.trim()}]\n`;
    if (problem.sound_effects) out += `  [SFX: ${problem.sound_effects.trim()}]\n`;
    if (problem.background_music) out += `  [MUSIC: ${problem.background_music.trim()}]\n`;
    out += `\n`;
  }

  // Teaser
  if (teaser) {
    out += `${divider}\n  TEASER — ${teaser.duration}\n${divider}\n\n`;
    out += `${teaser.content}\n\n`;
    if (teaser.visual_notes) out += `  [PAUSE — ${teaser.visual_notes.trim()}]\n`;
    if (teaser.sound_effects) out += `  [SFX: ${teaser.sound_effects.trim()}]\n`;
    if (teaser.background_music) out += `  [MUSIC: ${teaser.background_music.trim()}]\n`;
    out += `\n`;
  }

  // Chapters
  chapters?.forEach((ch) => {
    out += `${divider}\n  CHAPTER ${ch.chapter_number}: ${ch.title} — ${ch.duration}\n${divider}\n\n`;
    out += `${ch.content}\n\n`;

    if (ch.b_roll_suggestions?.length > 0) {
      out += `  [B-ROLL PAUSE: ${ch.b_roll_suggestions.join(", ")}]\n`;
    }
    if (ch.key_stat_or_quote) {
      out += `  * KEY STAT: ${ch.key_stat_or_quote.trim()}\n`;
    }
    if (ch.sound_effects) out += `  [SFX: ${ch.sound_effects.trim()}]\n`;
    if (ch.background_music) out += `  [MUSIC: ${ch.background_music.trim()}]\n`;
    out += `\n`;
  });

  // Affiliate
  if (affiliate_segment) {
    out += `${divider}\n  AFFILIATE — ${affiliate_segment.timestamp}\n${divider}\n\n`;
    if (affiliate_segment.transition_in) {
      out += `  >> TRANSITION IN: ${affiliate_segment.transition_in.trim()}\n\n`;
    }
    out += `${affiliate_segment.script}\n\n`;
    if (affiliate_segment.transition_out) {
      out += `  >> TRANSITION OUT: ${affiliate_segment.transition_out.trim()}\n`;
    }
    if (affiliate_segment.sound_effects) out += `  [SFX: ${affiliate_segment.sound_effects.trim()}]\n`;
    if (affiliate_segment.background_music) out += `  [MUSIC: ${affiliate_segment.background_music.trim()}]\n`;
    out += `\n`;
  }

  // Outro
  if (outro) {
    out += `${divider}\n  OUTRO — ${outro.duration}\n${divider}\n\n`;
    if (outro.recap) out += `${outro.recap}\n\n`;
    if (outro.cta) out += `${outro.cta}\n\n`;
    if (outro.end_screen_prompt) out += `  [HOLD FOR END SCREEN: ${outro.end_screen_prompt.trim()}]\n`;
    if (outro.sound_effects) out += `  [SFX: ${outro.sound_effects.trim()}]\n`;
    if (outro.background_music) out += `  [MUSIC: ${outro.background_music.trim()}]\n`;
    out += `\n`;
  }

  out += `${divider}\n  TOTAL: ${video.total_duration_estimate || "TBD"}\n${divider}\n`;

  return out;
}
