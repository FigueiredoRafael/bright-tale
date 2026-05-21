'use client';

/**
 * Editor brief exporter — produces a downloadable PDF of the production
 * output so the user can hand it to a video/audio editor.
 *
 * Uses jsPDF + jspdf-autotable client-side so the download fires without
 * a popup, print dialog, or server round-trip.
 */

import type {
  VideoOutput,
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

const PAGE = { width: 595.28, height: 841.89, margin: 48 } as const;
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

interface Cursor {
  doc: jsPDF;
  y: number;
}

export function downloadEditorBriefPdf(args: EditorBriefArgs): void {
  const { medium, title } = args;
  const safeTitle = (title ?? '').trim() || `${medium} brief`;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const c: Cursor = { doc, y: PAGE.margin };
  renderHeader(c, medium, safeTitle);

  if (medium === 'video') renderVideo(c, coerceVideo(args.draftJson), args.bodyMarkdown);
  else if (medium === 'shorts') renderShorts(c, extractShortsArray(args.draftJson), args.bodyMarkdown);
  else if (medium === 'podcast') renderPodcast(c, extractPodcast(args.draftJson), args.bodyMarkdown);

  const slug = slugifyForFilename(safeTitle);
  doc.save(`${slug}-${medium}-brief.pdf`);
}

// ─── Layout primitives ──────────────────────────────────────────────────────

function ensureSpace(c: Cursor, height: number): void {
  if (c.y + height > PAGE.height - PAGE.margin) {
    c.doc.addPage();
    c.y = PAGE.margin;
  }
}

function renderHeader(c: Cursor, medium: BriefMedium, title: string): void {
  c.doc.setFont('helvetica', 'normal');
  c.doc.setFontSize(9);
  c.doc.setTextColor(120);
  c.doc.text(`${medium.toUpperCase()} · EDITOR BRIEF`, PAGE.margin, c.y);
  c.y += 14;

  c.doc.setFont('helvetica', 'bold');
  c.doc.setFontSize(20);
  c.doc.setTextColor(20);
  const titleLines = c.doc.splitTextToSize(title, CONTENT_WIDTH) as string[];
  for (const line of titleLines) {
    ensureSpace(c, 24);
    c.doc.text(line, PAGE.margin, c.y);
    c.y += 24;
  }

  c.doc.setFont('helvetica', 'normal');
  c.doc.setFontSize(8);
  c.doc.setTextColor(140);
  c.doc.text(`Generated ${new Date().toLocaleString()}`, PAGE.margin, c.y);
  c.y += 14;

  // Divider
  c.doc.setDrawColor(180);
  c.doc.setLineWidth(0.5);
  c.doc.line(PAGE.margin, c.y, PAGE.width - PAGE.margin, c.y);
  c.y += 16;
}

function addH2(c: Cursor, text: string, opts?: { newPage?: boolean }): void {
  if (opts?.newPage) {
    c.doc.addPage();
    c.y = PAGE.margin;
  } else {
    ensureSpace(c, 30);
    c.y += 6;
  }
  c.doc.setFont('helvetica', 'bold');
  c.doc.setFontSize(12);
  c.doc.setTextColor(20);
  c.doc.text(text.toUpperCase(), PAGE.margin, c.y);
  c.y += 6;
  c.doc.setDrawColor(200);
  c.doc.setLineWidth(0.5);
  c.doc.line(PAGE.margin, c.y, PAGE.width - PAGE.margin, c.y);
  c.y += 14;
}

function addH3(c: Cursor, text: string): void {
  ensureSpace(c, 18);
  c.doc.setFont('helvetica', 'bold');
  c.doc.setFontSize(10.5);
  c.doc.setTextColor(40);
  c.doc.text(text, PAGE.margin, c.y);
  c.y += 14;
}

function addLabel(c: Cursor, label: string, value: string): void {
  if (!value) return;
  ensureSpace(c, 14);
  c.doc.setFont('helvetica', 'bold');
  c.doc.setFontSize(9.5);
  c.doc.setTextColor(60);
  c.doc.text(`${label}:`, PAGE.margin, c.y);
  c.doc.setFont('helvetica', 'normal');
  c.doc.setTextColor(20);
  const valLines = c.doc.splitTextToSize(value, CONTENT_WIDTH - 70) as string[];
  for (let i = 0; i < valLines.length; i++) {
    if (i > 0) {
      c.y += 12;
      ensureSpace(c, 12);
    }
    c.doc.text(valLines[i], PAGE.margin + 70, c.y);
  }
  c.y += 14;
}

function addParagraph(c: Cursor, text: string, opts?: { fontSize?: number; lineHeight?: number; color?: number }): void {
  if (!text) return;
  const size = opts?.fontSize ?? 10;
  const lh = opts?.lineHeight ?? 14;
  c.doc.setFont('helvetica', 'normal');
  c.doc.setFontSize(size);
  c.doc.setTextColor(opts?.color ?? 30);
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
  c.doc.setTextColor(30);
  for (const item of items) {
    if (!item) continue;
    const lines = c.doc.splitTextToSize(item, CONTENT_WIDTH - 14) as string[];
    for (let i = 0; i < lines.length; i++) {
      ensureSpace(c, 13);
      const prefix = i === 0 ? '• ' : '  ';
      c.doc.text(prefix + lines[i], PAGE.margin, c.y);
      c.y += 13;
    }
  }
  c.y += 4;
}

function addNumberedList(c: Cursor, items: string[]): void {
  c.doc.setFont('helvetica', 'normal');
  c.doc.setFontSize(10);
  c.doc.setTextColor(30);
  let n = 1;
  for (const item of items) {
    if (!item) continue;
    const lines = c.doc.splitTextToSize(item, CONTENT_WIDTH - 20) as string[];
    for (let i = 0; i < lines.length; i++) {
      ensureSpace(c, 13);
      const prefix = i === 0 ? `${n}. ` : '   ';
      c.doc.text(prefix + lines[i], PAGE.margin, c.y);
      c.y += 13;
    }
    n += 1;
  }
  c.y += 4;
}

function addCalloutBox(c: Cursor, text: string, opts?: { fontSize?: number; lineHeight?: number }): void {
  if (!text) return;
  const size = opts?.fontSize ?? 10;
  const lh = opts?.lineHeight ?? 14;
  c.doc.setFont('courier', 'normal');
  c.doc.setFontSize(size);
  c.doc.setTextColor(20);
  const lines = c.doc.splitTextToSize(text, CONTENT_WIDTH - 16) as string[];
  const padding = 8;
  // Render line-by-line so a long block can span pages.
  ensureSpace(c, lh + padding);
  let boxStartY = c.y;
  let inBox = true;
  c.doc.setDrawColor(220);
  c.doc.setFillColor(246, 246, 246);
  for (const line of lines) {
    if (c.y + lh > PAGE.height - PAGE.margin) {
      // Close current box
      c.doc.rect(PAGE.margin - 4, boxStartY - padding, CONTENT_WIDTH + 8, c.y - boxStartY + padding, 'S');
      c.doc.addPage();
      c.y = PAGE.margin;
      boxStartY = c.y;
      inBox = true;
    }
    c.doc.text(line, PAGE.margin + 4, c.y + 2);
    c.y += lh;
  }
  if (inBox) {
    c.doc.rect(PAGE.margin - 4, boxStartY - padding, CONTENT_WIDTH + 8, c.y - boxStartY + padding, 'S');
  }
  c.y += 8;
  c.doc.setFont('helvetica', 'normal');
}

// ─── Video ──────────────────────────────────────────────────────────────────

function coerceVideo(draftJson: Record<string, unknown> | null | undefined): VideoOutput | null {
  if (!draftJson) return null;
  const flat = draftJson as Partial<VideoOutput>;
  if (flat?.teleprompter_script || flat?.script || flat?.title_options) return draftJson as unknown as VideoOutput;
  const prod = (draftJson.production ?? draftJson) as Record<string, unknown>;
  const v = (prod?.video ?? null) as Record<string, unknown> | null;
  return (v as unknown as VideoOutput) ?? null;
}

function renderVideo(c: Cursor, video: VideoOutput | null, bodyMarkdown?: string | null): void {
  if (!video) {
    addH2(c, 'Markdown body');
    addParagraph(c, bodyMarkdown?.trim() || 'No structured video output available.');
    return;
  }

  const titles = video.title_options ?? [];
  const primaryTitle = video.video_title?.primary ?? titles[0] ?? '';
  const altTitles = video.video_title?.alternatives ?? titles.slice(1);
  const description = video.video_description ?? '';
  const duration = video.estimated_duration ?? video.total_duration_estimate ?? '';

  addH2(c, 'Overview');
  if (primaryTitle) addLabel(c, 'Primary title', primaryTitle);
  if (duration) addLabel(c, 'Duration', duration);
  if (altTitles.length > 0) {
    addH3(c, 'Alternative titles');
    addNumberedList(c, altTitles);
  }
  if (description) {
    addH3(c, 'Description');
    addCalloutBox(c, description);
  }

  const thumbnailIdeas = video.thumbnail_ideas ?? [];
  if (thumbnailIdeas.length > 0) {
    addH2(c, 'Thumbnail ideas');
    thumbnailIdeas.forEach((th, i) => {
      addH3(c, `Idea ${i + 1} · ${th.emotion ?? ''}`);
      addLabel(c, 'Concept', th.concept);
      addLabel(c, 'Text overlay', th.text_overlay);
      addLabel(c, 'Color palette', th.color_palette);
      addLabel(c, 'Composition', th.composition);
    });
  }

  const teleprompter = video.teleprompter_script ?? '';
  if (teleprompter) {
    addH2(c, 'Teleprompter script', { newPage: true });
    // Teleprompter is the editor's primary read — larger font, more leading.
    addParagraph(c, teleprompter, { fontSize: 12, lineHeight: 18, color: 20 });
  }

  const editor = video.editor_script ?? null;
  if (editor) {
    addH2(c, 'Editor script', { newPage: true });
    renderEditorSection(c, 'Hook', editor.hook);
    renderEditorSection(c, 'Problem', editor.problem);
    renderEditorSection(c, 'Teaser', editor.teaser);
    (editor.chapters ?? []).forEach((ch, i) => renderEditorSection(c, `Chapter ${i + 1}`, ch));
    renderEditorSection(c, 'Affiliate segment', editor.affiliate_segment);
    renderEditorSection(c, 'Outro', editor.outro);
    if (editor.color_grading) {
      addH3(c, 'Color grading');
      addParagraph(c, editor.color_grading);
    }
  }

  const lowerThirds = video.lower_thirds ?? [];
  if (lowerThirds.length > 0) {
    addH2(c, 'Lower thirds');
    autoTable(c.doc, {
      startY: c.y,
      head: [['Timestamp', 'Line 1', 'Line 2', 'Duration']],
      body: lowerThirds.map((lt) => [
        lt.timestamp ?? '',
        lt.line1 ?? '',
        lt.line2 ?? '',
        `${lt.duration_seconds ?? 0}s`,
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: 'bold' },
      margin: { left: PAGE.margin, right: PAGE.margin },
      didDrawPage: (data) => {
        c.y = data.cursor?.y ?? c.y;
      },
    });
    const lastY = (c.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    if (lastY) c.y = lastY + 12;
  }

  if (video.image_prompts) {
    addH2(c, 'Image prompts');
    if (video.image_prompts.thumbnail_option_1) {
      addH3(c, 'Thumbnail option 1');
      addCalloutBox(c, video.image_prompts.thumbnail_option_1);
    }
    if (video.image_prompts.thumbnail_option_2) {
      addH3(c, 'Thumbnail option 2');
      addCalloutBox(c, video.image_prompts.thumbnail_option_2);
    }
    const chapterPrompts = video.image_prompts.chapters ?? [];
    if (chapterPrompts.length > 0) {
      addH3(c, 'Chapter prompts');
      for (const ch of chapterPrompts) {
        addLabel(c, ch.chapter_title || 'Chapter', '');
        addCalloutBox(c, ch.prompt);
      }
    }
  }

  if (video.pinned_comment) {
    addH2(c, 'Pinned comment');
    addCalloutBox(c, video.pinned_comment);
  }
}

function renderEditorSection(c: Cursor, label: string, sec: VideoEditorSection | undefined): void {
  if (!sec) return;
  addH3(c, label);
  if (sec.A_roll) addLabel(c, 'A-roll', sec.A_roll);
  const bRoll = sec.B_roll ?? [];
  if (bRoll.length > 0) {
    addLabel(c, 'B-roll', '');
    addBulletList(c, bRoll);
  }
  const overlays = sec.text_overlays ?? [];
  if (overlays.length > 0) {
    addLabel(c, 'Text overlays', '');
    addBulletList(c, overlays.map((o) => `[${o.time}] ${o.text}${o.style ? ` — ${o.style}` : ''}`));
  }
  if (sec.SFX) addLabel(c, 'SFX', sec.SFX);
  if (sec.BGM) addLabel(c, 'BGM', sec.BGM);
  if (sec.Transitions) addLabel(c, 'Transitions', sec.Transitions);
  if (sec.Visual_effects) addLabel(c, 'VFX', sec.Visual_effects);
  if (sec.Pacing_notes) addLabel(c, 'Pacing', sec.Pacing_notes);
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
    addH2(c, 'Markdown body');
    addParagraph(c, bodyMarkdown?.trim() || 'No structured shorts output available.');
    return;
  }
  addH2(c, `Shorts (${shorts.length})`);
  shorts.forEach((s, i) => {
    if (i > 0) {
      c.doc.addPage();
      c.y = PAGE.margin;
    }
    addH3(c, `Short #${s.short_number ?? i + 1} · ${s.duration ?? ''} · ${s.visual_style ?? ''}`);
    if (s.title) addLabel(c, 'Title', s.title);
    if (s.hook) {
      addLabel(c, 'Hook', '');
      addCalloutBox(c, s.hook);
    }
    if (s.script) {
      addLabel(c, 'Script', '');
      addCalloutBox(c, s.script);
    }
    if (s.cta) addLabel(c, 'CTA', s.cta);
    if (s.sound_effects) addLabel(c, 'SFX', s.sound_effects);
    if (s.background_music) addLabel(c, 'BGM', s.background_music);
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
    addH2(c, 'Markdown body');
    addParagraph(c, bodyMarkdown?.trim() || 'No structured podcast output available.');
    return;
  }
  addH2(c, 'Overview');
  if (podcast.episode_title) addLabel(c, 'Title', podcast.episode_title);
  if (podcast.duration_estimate) addLabel(c, 'Duration', podcast.duration_estimate);
  if (podcast.episode_description) {
    addH3(c, 'Description');
    addCalloutBox(c, podcast.episode_description);
  }
  if (podcast.intro_hook) {
    addH2(c, 'Intro / hook');
    addCalloutBox(c, podcast.intro_hook);
  }
  const talkingPoints = podcast.talking_points ?? [];
  if (talkingPoints.length > 0) {
    addH2(c, 'Talking points');
    addNumberedList(c, talkingPoints.map((tp) => tp.notes ? `${tp.point} — ${tp.notes}` : tp.point));
  }
  if ((podcast.host_talking_prompts ?? []).length > 0) {
    addH2(c, 'Host talking prompts');
    addBulletList(c, podcast.host_talking_prompts);
  }
  if ((podcast.guest_questions ?? []).length > 0) {
    addH2(c, 'Guest questions');
    addNumberedList(c, podcast.guest_questions);
  }
  if (podcast.outro) {
    addH2(c, 'Outro');
    addCalloutBox(c, podcast.outro);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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
