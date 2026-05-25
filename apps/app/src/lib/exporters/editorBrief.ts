'use client';

/**
 * Editor brief exporter — produces a downloadable PDF of the production
 * roteiro so the user can hand it to a video/audio editor.
 *
 * Skips the teleprompter (the editor reads the structured script, not the
 * TTS-optimised flat text). Output is jsPDF + jspdf-autotable client-side
 * so the download fires without a popup, print dialog, or server hop.
 */

import type {
  VideoOutput,
  VideoScript,
  VideoScriptSection,
  VideoEditorSection,
  ShortOutput,
  PodcastOutput,
} from '@brighttale/shared/types/agents';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type BriefMedium = 'video' | 'shorts' | 'podcast';

export interface EditorBriefArgs {
  medium: BriefMedium;
  title?: string | null;
  draftJson?: Record<string, unknown> | null;
  bodyMarkdown?: string | null;
}

const PAGE = { width: 595.28, height: 841.89, margin: 56 } as const;
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

// BrightTale palette — see apps/app/src/app/globals.css.
const BRAND = {
  ink: [17, 24, 28] as [number, number, number],          // near-black
  body: [55, 65, 70] as [number, number, number],         // soft slate
  muted: [115, 130, 138] as [number, number, number],     // metadata grey
  hairline: [220, 226, 230] as [number, number, number],  // borders
  panel: [246, 250, 251] as [number, number, number],     // light bg
  accent: [13, 148, 136] as [number, number, number],     // brand-600
  accentSoft: [180, 234, 226] as [number, number, number],
};

interface Cursor {
  doc: jsPDF;
  y: number;
}

export function downloadEditorBriefPdf(args: EditorBriefArgs): void {
  const { medium, title } = args;
  const safeTitle = (title ?? '').trim() || `${medium} brief`;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const c: Cursor = { doc, y: PAGE.margin };

  renderCover(c, medium, safeTitle);

  if (medium === 'video') renderVideo(c, coerceVideo(args.draftJson));
  else if (medium === 'shorts') renderShorts(c, extractShortsArray(args.draftJson), args.bodyMarkdown);
  else if (medium === 'podcast') renderPodcast(c, extractPodcast(args.draftJson), args.bodyMarkdown);

  renderFooters(doc, safeTitle);

  const slug = slugifyForFilename(safeTitle);
  doc.save(`${slug}-${medium}-roteiro.pdf`);
}

// ─── Cover ──────────────────────────────────────────────────────────────────

function renderCover(c: Cursor, medium: BriefMedium, title: string): void {
  // Accent bar
  c.doc.setFillColor(...BRAND.accent);
  c.doc.rect(PAGE.margin, c.y, 36, 4, 'F');
  c.y += 18;

  // Kicker
  c.doc.setFont('helvetica', 'bold');
  c.doc.setFontSize(9);
  c.doc.setTextColor(...BRAND.accent);
  c.doc.text(`${mediumLabel(medium)} · ROTEIRO`, PAGE.margin, c.y);
  c.y += 22;

  // Title
  c.doc.setFont('helvetica', 'bold');
  c.doc.setFontSize(26);
  c.doc.setTextColor(...BRAND.ink);
  const titleLines = c.doc.splitTextToSize(title, CONTENT_WIDTH) as string[];
  for (const line of titleLines) {
    ensureSpace(c, 30);
    c.doc.text(line, PAGE.margin, c.y);
    c.y += 30;
  }

  // Meta strip
  c.y += 4;
  c.doc.setFont('helvetica', 'normal');
  c.doc.setFontSize(8.5);
  c.doc.setTextColor(...BRAND.muted);
  c.doc.text(`Generated ${new Date().toLocaleString()}  ·  Bright Tale`, PAGE.margin, c.y);
  c.y += 18;

  // Divider
  hairline(c);
  c.y += 14;
}

// ─── Layout primitives ──────────────────────────────────────────────────────

function ensureSpace(c: Cursor, height: number): void {
  if (c.y + height > PAGE.height - PAGE.margin) {
    c.doc.addPage();
    c.y = PAGE.margin;
  }
}

function hairline(c: Cursor): void {
  c.doc.setDrawColor(...BRAND.hairline);
  c.doc.setLineWidth(0.5);
  c.doc.line(PAGE.margin, c.y, PAGE.width - PAGE.margin, c.y);
}

function addSectionTitle(c: Cursor, text: string, opts?: { newPage?: boolean }): void {
  if (opts?.newPage) {
    c.doc.addPage();
    c.y = PAGE.margin;
  } else {
    ensureSpace(c, 40);
    c.y += 10;
  }
  // Accent square next to label
  c.doc.setFillColor(...BRAND.accent);
  c.doc.rect(PAGE.margin, c.y - 9, 3, 11, 'F');

  c.doc.setFont('helvetica', 'bold');
  c.doc.setFontSize(13);
  c.doc.setTextColor(...BRAND.ink);
  c.doc.text(text.toUpperCase(), PAGE.margin + 10, c.y);
  c.y += 8;
  hairline(c);
  c.y += 14;
}

function addSubTitle(c: Cursor, text: string): void {
  ensureSpace(c, 18);
  c.doc.setFont('helvetica', 'bold');
  c.doc.setFontSize(10.5);
  c.doc.setTextColor(...BRAND.ink);
  c.doc.text(text, PAGE.margin, c.y);
  c.y += 14;
}

function addMetaLine(c: Cursor, parts: Array<{ label: string; value?: string | null }>): void {
  const filled = parts.filter((p) => p.value && p.value.trim());
  if (filled.length === 0) return;
  ensureSpace(c, 14);
  let x = PAGE.margin;
  for (let i = 0; i < filled.length; i++) {
    const p = filled[i];
    c.doc.setFont('helvetica', 'bold');
    c.doc.setFontSize(8.5);
    c.doc.setTextColor(...BRAND.muted);
    c.doc.text(`${p.label.toUpperCase()} `, x, c.y);
    const labelWidth = c.doc.getTextWidth(`${p.label.toUpperCase()} `);
    x += labelWidth;
    c.doc.setFont('helvetica', 'normal');
    c.doc.setTextColor(...BRAND.body);
    c.doc.text(p.value ?? '', x, c.y);
    x += c.doc.getTextWidth(p.value ?? '') + 14;
  }
  c.y += 16;
}

function addLabel(c: Cursor, label: string, value: string): void {
  if (!value) return;
  ensureSpace(c, 14);
  c.doc.setFont('helvetica', 'bold');
  c.doc.setFontSize(9);
  c.doc.setTextColor(...BRAND.muted);
  c.doc.text(label.toUpperCase(), PAGE.margin, c.y);
  c.y += 12;
  c.doc.setFont('helvetica', 'normal');
  c.doc.setFontSize(10);
  c.doc.setTextColor(...BRAND.body);
  const lines = c.doc.splitTextToSize(value, CONTENT_WIDTH) as string[];
  for (const line of lines) {
    ensureSpace(c, 13);
    c.doc.text(line, PAGE.margin, c.y);
    c.y += 13;
  }
  c.y += 6;
}

function addParagraph(c: Cursor, text: string, opts?: { fontSize?: number; lineHeight?: number; color?: [number, number, number] }): void {
  if (!text) return;
  const size = opts?.fontSize ?? 10;
  const lh = opts?.lineHeight ?? 14.5;
  c.doc.setFont('helvetica', 'normal');
  c.doc.setFontSize(size);
  c.doc.setTextColor(...(opts?.color ?? BRAND.body));
  const lines = c.doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
  for (const line of lines) {
    ensureSpace(c, lh);
    c.doc.text(line, PAGE.margin, c.y);
    c.y += lh;
  }
  c.y += 4;
}

function addBulletList(c: Cursor, items: string[]): void {
  c.doc.setFont('helvetica', 'normal');
  c.doc.setFontSize(10);
  c.doc.setTextColor(...BRAND.body);
  for (const item of items) {
    if (!item) continue;
    const lines = c.doc.splitTextToSize(item, CONTENT_WIDTH - 16) as string[];
    for (let i = 0; i < lines.length; i++) {
      ensureSpace(c, 13);
      if (i === 0) {
        c.doc.setFillColor(...BRAND.accent);
        c.doc.circle(PAGE.margin + 3, c.y - 3, 1.4, 'F');
      }
      c.doc.text(lines[i], PAGE.margin + 12, c.y);
      c.y += 13;
    }
  }
  c.y += 4;
}

/**
 * Renders a card with title, accent left bar, meta strip, and content.
 * The card paginates: when content overflows it continues on the next page
 * with the left bar and continued visual.
 */
function addScriptCard(c: Cursor, args: {
  label: string;
  duration?: string;
  timestamp?: string;
  content?: string;
  visualNotes?: string;
  sfx?: string;
  bgm?: string;
  bRoll?: string[];
  extra?: Array<{ label: string; value: string }>;
}): void {
  const { label, duration, timestamp, content, visualNotes, sfx, bgm, bRoll, extra } = args;
  ensureSpace(c, 60);
  const startY = c.y;

  // Title row
  c.doc.setFillColor(...BRAND.accent);
  c.doc.rect(PAGE.margin, c.y - 10, 3, 14, 'F');
  c.doc.setFont('helvetica', 'bold');
  c.doc.setFontSize(11);
  c.doc.setTextColor(...BRAND.ink);
  c.doc.text(label.toUpperCase(), PAGE.margin + 10, c.y);

  // Duration / timestamp on right
  if (duration || timestamp) {
    const meta = [timestamp, duration].filter(Boolean).join(' · ');
    c.doc.setFont('helvetica', 'normal');
    c.doc.setFontSize(9);
    c.doc.setTextColor(...BRAND.muted);
    const w = c.doc.getTextWidth(meta);
    c.doc.text(meta, PAGE.width - PAGE.margin - w, c.y);
  }
  c.y += 8;
  hairline(c);
  c.y += 12;

  // Content (the script lines — the editor's main read)
  if (content) {
    c.doc.setFont('helvetica', 'normal');
    c.doc.setFontSize(10.5);
    c.doc.setTextColor(...BRAND.ink);
    const lines = c.doc.splitTextToSize(content, CONTENT_WIDTH - 8) as string[];
    for (const line of lines) {
      ensureSpace(c, 15);
      c.doc.text(line, PAGE.margin + 8, c.y);
      c.y += 15;
    }
    c.y += 4;
  }

  // Meta block: visual notes, b-roll, sfx, bgm
  const hasMeta =
    !!visualNotes ||
    !!sfx ||
    !!bgm ||
    (bRoll && bRoll.length > 0) ||
    (extra && extra.length > 0);

  if (hasMeta) {
    c.y += 4;
    if (visualNotes) addLabel(c, 'Visual notes', visualNotes);
    if (bRoll && bRoll.length > 0) {
      addLabel(c, 'B-roll', '');
      c.y -= 6;
      addBulletList(c, bRoll);
    }
    if (sfx) addLabel(c, 'SFX', sfx);
    if (bgm) addLabel(c, 'BGM', bgm);
    if (extra) {
      for (const e of extra) addLabel(c, e.label, e.value);
    }
  }

  // Card divider
  c.y += 4;
  hairline(c);
  c.y += 16;

  // Suppress unused warning when card is empty
  void startY;
}

// ─── Video ──────────────────────────────────────────────────────────────────

function coerceVideo(draftJson: Record<string, unknown> | null | undefined): VideoOutput | null {
  if (!draftJson) return null;
  const flat = draftJson as Partial<VideoOutput>;
  if (flat?.script || flat?.editor_script || flat?.title_options || flat?.video_title) {
    return draftJson as unknown as VideoOutput;
  }
  const prod = (draftJson.production ?? draftJson) as Record<string, unknown>;
  const v = (prod?.video ?? null) as Record<string, unknown> | null;
  return (v as unknown as VideoOutput) ?? null;
}

function renderVideo(c: Cursor, video: VideoOutput | null): void {
  if (!video) {
    addSectionTitle(c, 'No structured video output');
    addParagraph(c, 'Produce the video first to generate a roteiro.');
    return;
  }

  const titles = video.title_options ?? [];
  const primaryTitle = video.video_title?.primary ?? titles[0] ?? '';
  const altTitles = video.video_title?.alternatives ?? titles.slice(1);
  const description = video.video_description ?? '';
  const duration = video.estimated_duration ?? video.total_duration_estimate ?? '';

  // Overview
  addSectionTitle(c, 'Overview');
  addMetaLine(c, [
    { label: 'Duration', value: duration || undefined },
    { label: 'Audio mood', value: video.script?.audio_direction || undefined },
  ]);
  if (primaryTitle) addLabel(c, 'Primary title', primaryTitle);
  if (altTitles.length > 0) {
    addLabel(c, 'Alternative titles', '');
    c.y -= 6;
    addBulletList(c, altTitles);
  }
  if (description) addLabel(c, 'Description', description);

  // Roteiro (the script itself — the editor's main artifact)
  if (video.script) {
    addSectionTitle(c, 'Roteiro', { newPage: true });
    renderVideoScript(c, video.script);
  }

  // Editor's technical companion — A-roll/B-roll/text overlays
  if (video.editor_script) {
    addSectionTitle(c, 'Edição (notas técnicas)', { newPage: true });
    renderEditorBlock(c, 'Hook', video.editor_script.hook);
    renderEditorBlock(c, 'Problem', video.editor_script.problem);
    renderEditorBlock(c, 'Teaser', video.editor_script.teaser);
    (video.editor_script.chapters ?? []).forEach((ch, i) =>
      renderEditorBlock(c, `Chapter ${i + 1}`, ch),
    );
    renderEditorBlock(c, 'Affiliate segment', video.editor_script.affiliate_segment);
    renderEditorBlock(c, 'Outro', video.editor_script.outro);
    if (video.editor_script.color_grading) {
      addSubTitle(c, 'Color grading');
      addParagraph(c, video.editor_script.color_grading);
    }
  }

  // Lower thirds
  const lowerThirds = video.lower_thirds ?? [];
  if (lowerThirds.length > 0) {
    addSectionTitle(c, 'Lower thirds');
    autoTable(c.doc, {
      startY: c.y,
      head: [['Timestamp', 'Line 1', 'Line 2', 'Duration']],
      body: lowerThirds.map((lt) => [
        lt.timestamp ?? '',
        lt.line1 ?? '',
        lt.line2 ?? '',
        `${lt.duration_seconds ?? 0}s`,
      ]),
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 6, lineColor: BRAND.hairline, lineWidth: 0.5 },
      headStyles: { fillColor: BRAND.panel, textColor: BRAND.ink, fontStyle: 'bold' },
      bodyStyles: { textColor: BRAND.body },
      margin: { left: PAGE.margin, right: PAGE.margin },
    });
    const lastY = (c.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    if (lastY) c.y = lastY + 14;
  }

  // Thumbnail ideas
  const thumbnailIdeas = video.thumbnail_ideas ?? [];
  if (thumbnailIdeas.length > 0) {
    addSectionTitle(c, 'Thumbnail ideas');
    thumbnailIdeas.forEach((th, i) => {
      addSubTitle(c, `Idea ${i + 1} · ${th.emotion ?? ''}`);
      addLabel(c, 'Concept', th.concept);
      addLabel(c, 'Text overlay', th.text_overlay);
      addLabel(c, 'Color palette', th.color_palette);
      addLabel(c, 'Composition', th.composition);
    });
  }

  // Image prompts (Imagen)
  if (video.image_prompts) {
    addSectionTitle(c, 'Image prompts');
    if (video.image_prompts.thumbnail_option_1) addLabel(c, 'Thumbnail option 1', video.image_prompts.thumbnail_option_1);
    if (video.image_prompts.thumbnail_option_2) addLabel(c, 'Thumbnail option 2', video.image_prompts.thumbnail_option_2);
    const chPrompts = video.image_prompts.chapters ?? [];
    for (const ch of chPrompts) addLabel(c, ch.chapter_title || 'Chapter', ch.prompt);
  }

  if (video.pinned_comment) {
    addSectionTitle(c, 'Pinned comment');
    addParagraph(c, video.pinned_comment);
  }
}

function renderVideoScript(c: Cursor, script: VideoScript): void {
  if (script.hook) renderSection(c, 'Hook', script.hook);
  if (script.problem) renderSection(c, 'Problem', script.problem);
  if (script.teaser) renderSection(c, 'Teaser', script.teaser);

  const chapters = script.chapters ?? [];
  chapters.forEach((ch) => {
    addScriptCard(c, {
      label: `Capítulo ${ch.chapter_number} · ${ch.title}`,
      duration: ch.duration,
      content: ch.content,
      bRoll: ch.b_roll_suggestions ?? [],
      sfx: ch.sound_effects,
      bgm: ch.background_music,
      extra: ch.key_stat_or_quote ? [{ label: 'Key stat / quote', value: ch.key_stat_or_quote }] : undefined,
    });
  });

  if (script.affiliate_segment) {
    const a = script.affiliate_segment;
    addScriptCard(c, {
      label: 'Affiliate segment',
      timestamp: a.timestamp,
      content: a.script,
      visualNotes: a.visual_notes,
      sfx: a.sound_effects,
      bgm: a.background_music,
      extra: [
        { label: 'Transition in', value: a.transition_in ?? '' },
        { label: 'Transition out', value: a.transition_out ?? '' },
      ],
    });
  }

  if (script.outro) {
    const o = script.outro;
    addScriptCard(c, {
      label: 'Outro',
      duration: o.duration,
      content: o.recap,
      sfx: o.sound_effects,
      bgm: o.background_music,
      extra: [
        { label: 'CTA', value: o.cta ?? '' },
        { label: 'End screen prompt', value: o.end_screen_prompt ?? '' },
      ],
    });
  }
}

function renderSection(c: Cursor, label: string, sec: VideoScriptSection): void {
  addScriptCard(c, {
    label,
    duration: sec.duration,
    content: sec.content,
    visualNotes: sec.visual_notes,
    sfx: sec.sound_effects,
    bgm: sec.background_music,
  });
}

function renderEditorBlock(c: Cursor, label: string, sec: VideoEditorSection | undefined): void {
  if (!sec) return;
  const overlays = sec.text_overlays ?? [];
  const overlayLines = overlays.map((o) => `[${o.time}] ${o.text}${o.style ? ` — ${o.style}` : ''}`);
  addScriptCard(c, {
    label,
    content: sec.A_roll,
    bRoll: sec.B_roll ?? [],
    sfx: sec.SFX,
    bgm: sec.BGM,
    extra: [
      ...(overlayLines.length > 0 ? [{ label: 'Text overlays', value: overlayLines.join('\n') }] : []),
      ...(sec.Transitions ? [{ label: 'Transitions', value: sec.Transitions }] : []),
      ...(sec.Visual_effects ? [{ label: 'VFX', value: sec.Visual_effects }] : []),
      ...(sec.Pacing_notes ? [{ label: 'Pacing', value: sec.Pacing_notes }] : []),
    ],
  });
}

// ─── Shorts ─────────────────────────────────────────────────────────────────

function extractShortsArray(draftJson: Record<string, unknown> | null | undefined): ShortOutput[] {
  if (!draftJson) return [];
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

function renderShorts(c: Cursor, shorts: ShortOutput[], bodyMarkdown?: string | null): void {
  if (shorts.length === 0) {
    addSectionTitle(c, 'No structured shorts output');
    addParagraph(c, bodyMarkdown?.trim() || 'Produce the shorts first to generate a roteiro.');
    return;
  }
  shorts.forEach((s, i) => {
    addSectionTitle(c, `Short #${s.short_number ?? i + 1}`, { newPage: i > 0 });
    addMetaLine(c, [
      { label: 'Duration', value: s.duration || undefined },
      { label: 'Style', value: s.visual_style || undefined },
    ]);
    if (s.title) addLabel(c, 'Title', s.title);
    addScriptCard(c, {
      label: 'Hook',
      content: s.hook,
    });
    addScriptCard(c, {
      label: 'Script',
      content: s.script,
      sfx: s.sound_effects,
      bgm: s.background_music,
    });
    if (s.cta) addLabel(c, 'CTA', s.cta);
  });
}

// ─── Podcast ────────────────────────────────────────────────────────────────

function extractPodcast(draftJson: Record<string, unknown> | null | undefined): PodcastOutput | null {
  if (!draftJson) return null;
  const flat = draftJson as Partial<PodcastOutput>;
  if (flat?.episode_title || flat?.talking_points) return draftJson as unknown as PodcastOutput;
  const prod = (draftJson.production ?? draftJson) as Record<string, unknown>;
  const p = (prod?.podcast ?? null) as Record<string, unknown> | null;
  return (p as unknown as PodcastOutput) ?? null;
}

function renderPodcast(c: Cursor, podcast: PodcastOutput | null, bodyMarkdown?: string | null): void {
  if (!podcast) {
    addSectionTitle(c, 'No structured podcast output');
    addParagraph(c, bodyMarkdown?.trim() || 'Produce the podcast first to generate a roteiro.');
    return;
  }
  addSectionTitle(c, 'Overview');
  addMetaLine(c, [{ label: 'Duration', value: podcast.duration_estimate || undefined }]);
  if (podcast.episode_title) addLabel(c, 'Episode title', podcast.episode_title);
  if (podcast.episode_description) addLabel(c, 'Description', podcast.episode_description);

  if (podcast.intro_hook) {
    addScriptCard(c, { label: 'Intro / hook', content: podcast.intro_hook });
  }

  const tps = podcast.talking_points ?? [];
  if (tps.length > 0) {
    addSectionTitle(c, 'Talking points');
    tps.forEach((tp, i) => {
      addScriptCard(c, {
        label: `Point ${i + 1}`,
        content: tp.point,
        extra: tp.notes ? [{ label: 'Notes', value: tp.notes }] : undefined,
      });
    });
  }

  if ((podcast.host_talking_prompts ?? []).length > 0) {
    addSectionTitle(c, 'Host talking prompts');
    addBulletList(c, podcast.host_talking_prompts);
  }
  if ((podcast.guest_questions ?? []).length > 0) {
    addSectionTitle(c, 'Guest questions');
    addBulletList(c, podcast.guest_questions);
  }
  if (podcast.outro) {
    addScriptCard(c, { label: 'Outro', content: podcast.outro });
  }
}

// ─── Footer & helpers ───────────────────────────────────────────────────────

function renderFooters(doc: jsPDF, title: string): void {
  const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    const footY = PAGE.height - PAGE.margin / 2;
    doc.text(title, PAGE.margin, footY);
    const pageLabel = `${i} / ${pageCount}`;
    const w = doc.getTextWidth(pageLabel);
    doc.text(pageLabel, PAGE.width - PAGE.margin - w, footY);
  }
}

function mediumLabel(m: BriefMedium): string {
  if (m === 'video') return 'VIDEO';
  if (m === 'shorts') return 'SHORTS';
  return 'PODCAST';
}

export function downloadTextFile(args: { content: string; filename: string }): void {
  const blob = new Blob([args.content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = args.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugifyForFilename(raw: string): string {
  const cleaned = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || 'untitled';
}
