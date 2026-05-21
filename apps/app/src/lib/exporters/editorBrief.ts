'use client';

/**
 * Editor brief exporter — opens a print-optimised window so the user can save
 * the production output as PDF via the browser's native print dialog.
 *
 * Handles video / shorts / podcast. Blog uses MarkdownPreview + WP draft and
 * doesn't need a brief.
 */

import type { VideoOutput, ShortOutput, PodcastOutput } from '@brighttale/shared/types/agents';
import { markdownToHtml } from '@/lib/utils';

export type BriefMedium = 'video' | 'shorts' | 'podcast';

export interface EditorBriefArgs {
  medium: BriefMedium;
  title?: string | null;
  draftJson?: Record<string, unknown> | null;
  bodyMarkdown?: string | null;
}

export function openEditorBriefPrintView(args: EditorBriefArgs): void {
  const html = buildEditorBriefHtml(args);
  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) {
    alert('Não consegui abrir a janela de print. Habilite popups e tente de novo.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Print fires once the document parses + paints. Some browsers race; the
  // onload callback after document.close gives the layout engine time to
  // settle before the print dialog appears.
  const fire = () => {
    win.focus();
    win.print();
  };
  if (win.document.readyState === 'complete') {
    setTimeout(fire, 50);
  } else {
    win.addEventListener('load', () => setTimeout(fire, 50));
  }
}

export function buildEditorBriefHtml(args: EditorBriefArgs): string {
  const { medium, title, draftJson, bodyMarkdown } = args;
  const safeTitle = (title ?? '').trim() || 'Editor Brief';
  const body = renderMediumBody({ medium, draftJson, bodyMarkdown });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(safeTitle)} — Editor Brief</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  :root { color-scheme: light; }
  html, body { background: #fff; color: #111; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 11pt; line-height: 1.5; margin: 0; padding: 24px;
  }
  header { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 20px; }
  header .kicker { text-transform: uppercase; letter-spacing: 0.08em; font-size: 9pt; color: #666; }
  header h1 { font-size: 22pt; margin: 4px 0 0 0; line-height: 1.2; }
  section { margin: 18px 0; page-break-inside: avoid; }
  section h2 {
    font-size: 13pt; text-transform: uppercase; letter-spacing: 0.06em;
    border-bottom: 1px solid #ccc; padding-bottom: 4px; margin: 24px 0 10px 0;
  }
  section h3 { font-size: 11pt; margin: 12px 0 4px 0; }
  .grid { display: grid; grid-template-columns: 140px 1fr; gap: 4px 12px; }
  .grid .k { color: #666; }
  ul { margin: 4px 0 8px 18px; padding: 0; }
  ol { margin: 4px 0 8px 22px; padding: 0; }
  li { margin: 2px 0; }
  pre, .script {
    white-space: pre-wrap; word-wrap: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10pt; background: #f6f6f6; padding: 10px 12px; border-radius: 4px;
    page-break-inside: auto;
  }
  .teleprompter { font-size: 14pt; line-height: 1.8; white-space: pre-wrap; }
  .meta { color: #666; font-size: 9pt; }
  .scene { border-left: 3px solid #444; padding-left: 10px; margin: 8px 0; page-break-inside: avoid; }
  .scene .label { font-weight: 600; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }
  .markdown h1 { font-size: 16pt; margin: 16px 0 8px; }
  .markdown h2 { font-size: 13pt; margin: 14px 0 6px; }
  .markdown h3 { font-size: 11pt; margin: 12px 0 4px; }
  .markdown p { margin: 6px 0; }
  .markdown ul, .markdown ol { margin: 6px 0 6px 22px; }
  .markdown code { background: #f1f1f1; padding: 1px 4px; border-radius: 3px; font-size: 9.5pt; }
  .pagebreak { page-break-before: always; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 10pt; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f4f4f4; font-weight: 600; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <header>
    <div class="kicker">${escapeHtml(medium.toUpperCase())} · Editor Brief</div>
    <h1>${escapeHtml(safeTitle)}</h1>
    <div class="meta">Generated ${new Date().toLocaleString()}</div>
  </header>
  ${body}
</body>
</html>`;
}

function renderMediumBody(args: {
  medium: BriefMedium;
  draftJson?: Record<string, unknown> | null;
  bodyMarkdown?: string | null;
}): string {
  const { medium, draftJson, bodyMarkdown } = args;
  if (medium === 'video') {
    return renderVideoBody(coerceVideo(draftJson), bodyMarkdown);
  }
  if (medium === 'shorts') {
    return renderShortsBody(draftJson, bodyMarkdown);
  }
  if (medium === 'podcast') {
    return renderPodcastBody(draftJson, bodyMarkdown);
  }
  return '';
}

// ─── Video ──────────────────────────────────────────────────────────────────

function coerceVideo(draftJson: Record<string, unknown> | null | undefined): VideoOutput | null {
  if (!draftJson) return null;
  // draftJson can be either flat VideoOutput or wrapped { production: { video: {...} } }
  const flat = draftJson as Partial<VideoOutput>;
  if (flat?.teleprompter_script || flat?.script || flat?.title_options) return draftJson as unknown as VideoOutput;
  const prod = (draftJson.production ?? draftJson) as Record<string, unknown>;
  const v = (prod?.video ?? null) as Record<string, unknown> | null;
  return (v as unknown as VideoOutput) ?? null;
}

function renderVideoBody(video: VideoOutput | null, bodyMarkdown?: string | null): string {
  if (!video) {
    return renderMarkdownFallback(bodyMarkdown ?? '', 'No structured video output — markdown body shown.');
  }

  const titles = video.title_options ?? [];
  const primaryTitle = video.video_title?.primary ?? titles[0] ?? '';
  const altTitles = video.video_title?.alternatives ?? titles.slice(1);

  const description = video.video_description ?? '';
  const teleprompter = video.teleprompter_script ?? '';
  const editor = video.editor_script ?? null;
  const lowerThirds = video.lower_thirds ?? [];
  const thumbnailIdeas = video.thumbnail_ideas ?? [];
  const imagePrompts = video.image_prompts ?? null;
  const pinnedComment = video.pinned_comment ?? '';
  const duration = video.estimated_duration ?? video.total_duration_estimate ?? '';

  const parts: string[] = [];

  parts.push(`<section>
    <h2>Overview</h2>
    <div class="grid">
      ${primaryTitle ? `<div class="k">Primary Title</div><div>${escapeHtml(primaryTitle)}</div>` : ''}
      ${duration ? `<div class="k">Duration</div><div>${escapeHtml(duration)}</div>` : ''}
    </div>
    ${altTitles.length > 0 ? `<h3>Alternative Titles</h3><ol>${altTitles.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ol>` : ''}
    ${description ? `<h3>Description</h3><div class="script">${escapeHtml(description)}</div>` : ''}
  </section>`);

  if (thumbnailIdeas.length > 0) {
    parts.push(`<section>
      <h2>Thumbnail Ideas</h2>
      ${thumbnailIdeas.map((th, i) => `
        <div class="scene">
          <div class="label">Idea ${i + 1} · ${escapeHtml(th.emotion ?? '')}</div>
          <div><strong>Concept:</strong> ${escapeHtml(th.concept)}</div>
          <div><strong>Text Overlay:</strong> ${escapeHtml(th.text_overlay)}</div>
          <div><strong>Color Palette:</strong> ${escapeHtml(th.color_palette)}</div>
          <div><strong>Composition:</strong> ${escapeHtml(th.composition)}</div>
        </div>`).join('')}
    </section>`);
  }

  if (teleprompter) {
    parts.push(`<section class="pagebreak">
      <h2>Teleprompter Script</h2>
      <div class="teleprompter">${escapeHtml(teleprompter)}</div>
    </section>`);
  }

  if (editor) {
    parts.push(`<section class="pagebreak">
      <h2>Editor Script</h2>
      ${renderEditorSection('Hook', editor.hook)}
      ${renderEditorSection('Problem', editor.problem)}
      ${renderEditorSection('Teaser', editor.teaser)}
      ${(editor.chapters ?? []).map((c, i) => renderEditorSection(`Chapter ${i + 1}`, c)).join('')}
      ${renderEditorSection('Affiliate Segment', editor.affiliate_segment)}
      ${renderEditorSection('Outro', editor.outro)}
      ${editor.color_grading ? `<h3>Color Grading</h3><p>${escapeHtml(editor.color_grading)}</p>` : ''}
    </section>`);
  }

  if (lowerThirds.length > 0) {
    parts.push(`<section>
      <h2>Lower Thirds</h2>
      <table>
        <thead><tr><th>Timestamp</th><th>Line 1</th><th>Line 2</th><th>Duration</th></tr></thead>
        <tbody>
          ${lowerThirds.map((lt) => `<tr>
            <td>${escapeHtml(lt.timestamp)}</td>
            <td>${escapeHtml(lt.line1)}</td>
            <td>${escapeHtml(lt.line2 ?? '')}</td>
            <td>${lt.duration_seconds}s</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>`);
  }

  if (imagePrompts) {
    const chapterPrompts = imagePrompts.chapters ?? [];
    parts.push(`<section>
      <h2>Image Prompts</h2>
      ${imagePrompts.thumbnail_option_1 ? `<h3>Thumbnail Option 1</h3><div class="script">${escapeHtml(imagePrompts.thumbnail_option_1)}</div>` : ''}
      ${imagePrompts.thumbnail_option_2 ? `<h3>Thumbnail Option 2</h3><div class="script">${escapeHtml(imagePrompts.thumbnail_option_2)}</div>` : ''}
      ${chapterPrompts.length > 0 ? `<h3>Chapter Prompts</h3>${chapterPrompts.map((c) => `
        <div class="scene">
          <div class="label">${escapeHtml(c.chapter_title)}</div>
          <div class="script">${escapeHtml(c.prompt)}</div>
        </div>`).join('')}` : ''}
    </section>`);
  }

  if (pinnedComment) {
    parts.push(`<section>
      <h2>Pinned Comment</h2>
      <div class="script">${escapeHtml(pinnedComment)}</div>
    </section>`);
  }

  return parts.join('\n');
}

function renderEditorSection(label: string, sec?: import('@brighttale/shared/types/agents').VideoEditorSection): string {
  if (!sec) return '';
  const bRoll = sec.B_roll ?? [];
  const overlays = sec.text_overlays ?? [];
  return `<div class="scene">
    <div class="label">${escapeHtml(label)}</div>
    ${sec.A_roll ? `<div><strong>A-roll:</strong> ${escapeHtml(sec.A_roll)}</div>` : ''}
    ${bRoll.length > 0 ? `<div><strong>B-roll:</strong><ul>${bRoll.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul></div>` : ''}
    ${overlays.length > 0 ? `<div><strong>Text overlays:</strong><ul>${overlays.map((o) => `<li>[${escapeHtml(o.time)}] ${escapeHtml(o.text)}${o.style ? ` <span class="meta">— ${escapeHtml(o.style)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
    ${sec.SFX ? `<div><strong>SFX:</strong> ${escapeHtml(sec.SFX)}</div>` : ''}
    ${sec.BGM ? `<div><strong>BGM:</strong> ${escapeHtml(sec.BGM)}</div>` : ''}
    ${sec.Transitions ? `<div><strong>Transitions:</strong> ${escapeHtml(sec.Transitions)}</div>` : ''}
    ${sec.Visual_effects ? `<div><strong>VFX:</strong> ${escapeHtml(sec.Visual_effects)}</div>` : ''}
    ${sec.Pacing_notes ? `<div><strong>Pacing:</strong> ${escapeHtml(sec.Pacing_notes)}</div>` : ''}
  </div>`;
}

// ─── Shorts ─────────────────────────────────────────────────────────────────

function renderShortsBody(draftJson: Record<string, unknown> | null | undefined, bodyMarkdown?: string | null): string {
  const shorts = extractShortsArray(draftJson);
  if (shorts.length === 0) {
    return renderMarkdownFallback(bodyMarkdown ?? '', 'No structured shorts output — markdown body shown.');
  }
  return `<section>
    <h2>Shorts (${shorts.length})</h2>
    ${shorts.map((s, i) => `
      <div class="scene${i > 0 ? ' pagebreak' : ''}">
        <div class="label">Short #${s.short_number ?? i + 1} · ${escapeHtml(s.duration ?? '')} · ${escapeHtml(s.visual_style ?? '')}</div>
        <h3>${escapeHtml(s.title ?? '')}</h3>
        ${s.hook ? `<div><strong>Hook:</strong> ${escapeHtml(s.hook)}</div>` : ''}
        ${s.script ? `<div><strong>Script:</strong><div class="script">${escapeHtml(s.script)}</div></div>` : ''}
        ${s.cta ? `<div><strong>CTA:</strong> ${escapeHtml(s.cta)}</div>` : ''}
        ${s.sound_effects ? `<div><strong>SFX:</strong> ${escapeHtml(s.sound_effects)}</div>` : ''}
        ${s.background_music ? `<div><strong>BGM:</strong> ${escapeHtml(s.background_music)}</div>` : ''}
      </div>`).join('')}
  </section>`;
}

function extractShortsArray(draftJson: Record<string, unknown> | null | undefined): ShortOutput[] {
  if (!draftJson) return [];
  // Possible shapes:
  //   - { shorts: ShortOutput[] }
  //   - { production: { shorts: ShortOutput[] } }
  //   - ShortOutput (single — wrap)
  const candidates: unknown[] = [
    (draftJson as { shorts?: unknown }).shorts,
    ((draftJson.production as Record<string, unknown> | undefined)?.shorts),
    draftJson,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as ShortOutput[];
  }
  return [];
}

// ─── Podcast ────────────────────────────────────────────────────────────────

function renderPodcastBody(draftJson: Record<string, unknown> | null | undefined, bodyMarkdown?: string | null): string {
  const podcast = extractPodcast(draftJson);
  if (!podcast) {
    return renderMarkdownFallback(bodyMarkdown ?? '', 'No structured podcast output — markdown body shown.');
  }
  return `<section>
    <h2>Overview</h2>
    <div class="grid">
      ${podcast.episode_title ? `<div class="k">Title</div><div>${escapeHtml(podcast.episode_title)}</div>` : ''}
      ${podcast.duration_estimate ? `<div class="k">Duration</div><div>${escapeHtml(podcast.duration_estimate)}</div>` : ''}
    </div>
    ${podcast.episode_description ? `<h3>Description</h3><div class="script">${escapeHtml(podcast.episode_description)}</div>` : ''}
  </section>
  ${podcast.intro_hook ? `<section><h2>Intro / Hook</h2><div class="script">${escapeHtml(podcast.intro_hook)}</div></section>` : ''}
  ${(podcast.talking_points ?? []).length > 0 ? `<section>
    <h2>Talking Points</h2>
    <ol>${(podcast.talking_points ?? []).map((tp) => `<li><strong>${escapeHtml(tp.point)}</strong>${tp.notes ? `<div class="meta">${escapeHtml(tp.notes)}</div>` : ''}</li>`).join('')}</ol>
  </section>` : ''}
  ${(podcast.host_talking_prompts ?? []).length > 0 ? `<section>
    <h2>Host Talking Prompts</h2>
    <ul>${(podcast.host_talking_prompts ?? []).map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
  </section>` : ''}
  ${(podcast.guest_questions ?? []).length > 0 ? `<section>
    <h2>Guest Questions</h2>
    <ol>${(podcast.guest_questions ?? []).map((q) => `<li>${escapeHtml(q)}</li>`).join('')}</ol>
  </section>` : ''}
  ${podcast.outro ? `<section><h2>Outro</h2><div class="script">${escapeHtml(podcast.outro)}</div></section>` : ''}`;
}

function extractPodcast(draftJson: Record<string, unknown> | null | undefined): PodcastOutput | null {
  if (!draftJson) return null;
  const flat = draftJson as Partial<PodcastOutput>;
  if (flat?.episode_title || flat?.talking_points) return draftJson as unknown as PodcastOutput;
  const prod = (draftJson.production ?? draftJson) as Record<string, unknown>;
  const p = (prod?.podcast ?? null) as Record<string, unknown> | null;
  return (p as unknown as PodcastOutput) ?? null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function renderMarkdownFallback(md: string, banner: string): string {
  if (!md.trim()) {
    return `<section><p class="meta">${escapeHtml(banner)}</p><p class="meta">Nothing to render.</p></section>`;
  }
  return `<section>
    <p class="meta">${escapeHtml(banner)}</p>
    <div class="markdown">${markdownToHtml(md)}</div>
  </section>`;
}

function escapeHtml(s: string | undefined | null): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Plain text download (teleprompter) ─────────────────────────────────────

export function downloadTextFile(args: { content: string; filename: string }): void {
  const blob = new Blob([args.content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = args.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on next tick — some browsers fetch the blob lazily.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
