/**
 * Builds the printable HTML document for a video roteiro.
 * Output is fed to a new browser tab where the user prints to PDF —
 * see `./index.ts` for the orchestration.
 *
 * Design system mirrors apps/app/src/app/globals.css. The dark/light
 * surface is painted on the .page ELEMENT (not body) so it survives
 * print regardless of the browser's "Background graphics" pref.
 */

import type { VideoOutput, VideoEditorSection, VideoEditorScript } from '@brighttale/shared/types/agents';
import type { RoteiroDict } from './i18n';

export interface BuildOpts {
  channelName?: string | null;
  generatedAt?: Date;
  /** Initial theme on screen; users can toggle. Defaults to 'light'. */
  initialTheme?: 'light' | 'dark';
  /** ISO code put on <html lang=…>; also drives toLocaleString. */
  langCode: string;
}

export function buildVideoRoteiroHtml(
  video: VideoOutput,
  dict: RoteiroDict,
  opts: BuildOpts,
): string {
  const lang = opts.langCode;
  const initialTheme = opts.initialTheme ?? 'light';
  const generatedAt = opts.generatedAt ?? new Date();

  const titlePrimary =
    video.video_title?.primary ?? video.title_options?.[0] ?? 'Untitled video';
  const altTitles = collectAltTitles(video);
  const duration =
    video.estimated_duration ?? video.total_duration_estimate ?? '';
  const audioDirection = video.script?.audio_direction ?? '';
  const channel = opts.channelName ?? '';
  const editorScript = normalizeEditorScript(video.editor_script);

  return /* html */ `<!DOCTYPE html>
<html lang="${esc(lang)}" data-theme="${initialTheme}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(titlePrimary)} — ${esc(dict.doc_kicker)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
    rel="stylesheet"
  />
  <style>${STYLES}</style>
</head>
<body>

  <div class="toolbar">
    <div class="toolbar__brand">
      ${BRAND_SVG_INLINE}
    </div>
    <div class="toolbar__actions">
      <label class="toggle">
        <input type="checkbox" id="darkToggle" ${initialTheme === 'dark' ? 'checked' : ''} />
        <span>${esc(dict.btn_dark)}</span>
      </label>
      <button class="btn" onclick="window.print()">${esc(dict.btn_print)}</button>
    </div>
  </div>

  <div class="print-footer" aria-hidden="true">
    <span class="print-footer__left">${esc(titlePrimary)}${channel ? ` · ${esc(channel)}` : ''}</span>
    <span class="print-footer__right">${esc(dict.print_footer_right)}</span>
  </div>

  <main class="page">

    ${renderCover({
      dict,
      titlePrimary,
      duration,
      audioDirection,
      channel,
      generatedAt,
      lang,
    })}

    ${renderOverview({ dict, video, titlePrimary, altTitles })}

    ${video.script ? renderScript({ dict, video }) : ''}

    ${editorScript ? renderEditor({ dict, editorScript, video }) : ''}

    ${renderLowerThirds({ dict, video })}

    ${renderThumbnails({ dict, video })}

    ${renderImagePrompts({ dict, video })}

    ${video.pinned_comment ? renderPinned({ dict, comment: video.pinned_comment }) : ''}

  </main>

  <script>
    var t = document.getElementById('darkToggle');
    var root = document.documentElement;
    if (t) {
      t.addEventListener('change', function() {
        root.setAttribute('data-theme', t.checked ? 'dark' : 'light');
      });
    }
  </script>
</body>
</html>`;
}

// ─── Cover ──────────────────────────────────────────────────────────────────

function renderCover(args: {
  dict: RoteiroDict;
  titlePrimary: string;
  duration: string;
  audioDirection: string;
  channel: string;
  generatedAt: Date;
  lang: string;
}): string {
  const { dict, titlePrimary, duration, audioDirection, channel, generatedAt, lang } = args;
  const generated = safeFormatDate(generatedAt, lang);

  const items: Array<{ label: string; value: string }> = [];
  if (duration) items.push({ label: dict.meta_duration, value: duration });
  if (audioDirection) items.push({ label: dict.meta_mood, value: audioDirection });
  if (channel) items.push({ label: dict.meta_channel, value: channel });
  items.push({ label: dict.meta_generated, value: generated });

  return /* html */ `
    <header class="cover">
      <div class="cover__brand">
        ${BRAND_MARK_SVG}
        <span>BrightTale<span style="color: var(--accent); font-weight: 800;">·</span>${esc(dict.doc_brand_suffix)}</span>
      </div>
      <div class="cover__kicker">${esc(dict.doc_kicker)}</div>
      <h1 class="cover__title">${esc(titlePrimary)}</h1>
      <div class="cover__meta">
        ${items
          .map(
            (it) => `
          <div class="cover__meta-item">
            <span class="cover__meta-label">${esc(it.label)}</span>
            <strong>${esc(it.value)}</strong>
          </div>`,
          )
          .join('')}
      </div>
    </header>
  `;
}

// ─── Overview ───────────────────────────────────────────────────────────────

function renderOverview(args: {
  dict: RoteiroDict;
  video: VideoOutput;
  titlePrimary: string;
  altTitles: string[];
}): string {
  const { dict, video, titlePrimary, altTitles } = args;
  const description = video.video_description ?? '';
  const hasAlts = altTitles.length > 0;
  const hasDesc = description.trim().length > 0;

  return /* html */ `
    <section class="section">
      <div class="section__header">
        <span class="section__bar"></span>
        <span class="section__title">${esc(dict.section_overview)}</span>
      </div>
      <div class="overview-grid">
        <div class="field field--wide">
          <span class="field__label">${esc(dict.field_title_primary)}</span>
          <span class="field__value" style="font-weight: 600; font-size: 12pt;">${esc(titlePrimary)}</span>
        </div>
        ${
          hasAlts
            ? `
        <div class="field field--wide">
          <span class="field__label">${esc(dict.field_titles_alt)}</span>
          <ul class="alt-list">
            ${altTitles.map((t) => `<li>${esc(t)}</li>`).join('')}
          </ul>
        </div>`
            : ''
        }
        ${
          hasDesc
            ? `
        <div class="field field--wide">
          <span class="field__label">${esc(dict.field_description)}</span>
          <div class="desc-block">${esc(description)}</div>
        </div>`
            : ''
        }
      </div>
    </section>
  `;
}

// ─── Roteiro (script) ───────────────────────────────────────────────────────

function renderScript(args: { dict: RoteiroDict; video: VideoOutput }): string {
  const { dict, video } = args;
  const s = video.script;
  if (!s) return '';

  const cards: string[] = [];
  if (s.hook) cards.push(renderScriptCard('hook', dict.card_hook, s.hook, dict));
  if (s.problem) cards.push(renderScriptCard('problem', dict.card_problem, s.problem, dict));
  if (s.teaser) cards.push(renderScriptCard('teaser', dict.card_teaser, s.teaser, dict));

  (s.chapters ?? []).forEach((ch) => {
    cards.push(renderChapterCard(ch, dict));
  });

  if (s.affiliate_segment) cards.push(renderAffiliateCard(s.affiliate_segment, dict));
  if (s.outro) cards.push(renderOutroCard(s.outro, dict));

  if (cards.length === 0) return '';

  return /* html */ `
    <section class="section section--new-page">
      <div class="section__header">
        <span class="section__bar"></span>
        <span class="section__title">${esc(dict.section_script)}</span>
        <span class="section__hint">${esc(dict.section_script_hint)}</span>
      </div>
      ${cards.join('')}
    </section>
  `;
}

function renderScriptCard(
  tone: 'hook' | 'problem' | 'teaser',
  label: string,
  sec: { duration?: string; content?: string; visual_notes?: string },
  dict: RoteiroDict,
): string {
  return /* html */ `
    <article class="card card--${tone}">
      <header class="card__head">
        <span class="card__label">${esc(label)}</span>
        ${sec.duration ? `<span class="card__meta">${esc(sec.duration)}</span>` : ''}
      </header>
      ${sec.content ? `<div class="card__body">${esc(sec.content)}</div>` : ''}
      ${
        sec.visual_notes
          ? `<div class="card__sub">
              <div class="field field--wide">
                <span class="field__label">${esc(dict.card_visual_notes)}</span>
                <span class="field__value">${esc(sec.visual_notes)}</span>
              </div>
            </div>`
          : ''
      }
    </article>
  `;
}

function renderChapterCard(
  ch: NonNullable<VideoOutput['script']['chapters']>[number],
  dict: RoteiroDict,
): string {
  const subRows: string[] = [];
  if (Array.isArray(ch.b_roll_suggestions) && ch.b_roll_suggestions.length > 0) {
    subRows.push(
      `<div class="field">
        <span class="field__label">${esc(dict.card_b_roll)}</span>
        <ul style="margin: 0; padding-left: 14px; font-size: 9.5pt;">
          ${ch.b_roll_suggestions.map((b) => `<li>${esc(b)}</li>`).join('')}
        </ul>
      </div>`,
    );
  }
  if (ch.key_stat_or_quote) {
    subRows.push(
      `<div class="field">
        <span class="field__label">${esc(dict.card_key_stat)}</span>
        <span class="field__value" style="font-weight: 600;">${esc(ch.key_stat_or_quote)}</span>
      </div>`,
    );
  }

  return /* html */ `
    <article class="card card--chapter">
      <header class="card__head">
        <span class="card__label">${esc(dict.card_chapter(ch.chapter_number, ch.title))}</span>
        ${ch.duration ? `<span class="card__meta">${esc(ch.duration)}</span>` : ''}
      </header>
      ${ch.content ? `<div class="card__body">${esc(ch.content)}</div>` : ''}
      ${subRows.length > 0 ? `<div class="card__sub">${subRows.join('')}</div>` : ''}
    </article>
  `;
}

function renderAffiliateCard(
  a: NonNullable<VideoOutput['script']['affiliate_segment']>,
  dict: RoteiroDict,
): string {
  const subRows: string[] = [];
  if (a.transition_in) {
    subRows.push(
      `<div class="field">
        <span class="field__label">${esc(dict.card_trans_in)}</span>
        <span class="field__value">${esc(a.transition_in)}</span>
      </div>`,
    );
  }
  if (a.transition_out) {
    subRows.push(
      `<div class="field">
        <span class="field__label">${esc(dict.card_trans_out)}</span>
        <span class="field__value">${esc(a.transition_out)}</span>
      </div>`,
    );
  }
  if (a.visual_notes) {
    subRows.push(
      `<div class="field field--wide">
        <span class="field__label">${esc(dict.card_visual_notes)}</span>
        <span class="field__value">${esc(a.visual_notes)}</span>
      </div>`,
    );
  }

  return /* html */ `
    <article class="card card--affiliate">
      <header class="card__head">
        <span class="card__label">${esc(dict.card_affiliate)}</span>
        ${a.timestamp ? `<span class="card__meta">${esc(a.timestamp)}</span>` : ''}
      </header>
      ${a.script ? `<div class="card__body">${esc(a.script)}</div>` : ''}
      ${subRows.length > 0 ? `<div class="card__sub">${subRows.join('')}</div>` : ''}
    </article>
  `;
}

function renderOutroCard(
  o: NonNullable<VideoOutput['script']['outro']>,
  dict: RoteiroDict,
): string {
  const subRows: string[] = [];
  if (o.cta) {
    subRows.push(
      `<div class="field">
        <span class="field__label">${esc(dict.card_cta)}</span>
        <span class="field__value">${esc(o.cta)}</span>
      </div>`,
    );
  }
  if (o.end_screen_prompt) {
    subRows.push(
      `<div class="field">
        <span class="field__label">${esc(dict.card_end_screen)}</span>
        <span class="field__value">${esc(o.end_screen_prompt)}</span>
      </div>`,
    );
  }

  return /* html */ `
    <article class="card card--outro">
      <header class="card__head">
        <span class="card__label">${esc(dict.card_outro)}</span>
        ${o.duration ? `<span class="card__meta">${esc(o.duration)}</span>` : ''}
      </header>
      ${o.recap ? `<div class="card__body">${esc(o.recap)}</div>` : ''}
      ${subRows.length > 0 ? `<div class="card__sub">${subRows.join('')}</div>` : ''}
    </article>
  `;
}

// ─── Editor (technical notes) ───────────────────────────────────────────────

function renderEditor(args: {
  dict: RoteiroDict;
  editorScript: VideoEditorScript;
  video: VideoOutput;
}): string {
  const { dict, editorScript, video } = args;

  const blocks: string[] = [];
  if (editorScript.hook) blocks.push(renderEditorBlock(dict.card_hook, editorScript.hook, dict));
  if (editorScript.problem) blocks.push(renderEditorBlock(dict.card_problem, editorScript.problem, dict));
  if (editorScript.teaser) blocks.push(renderEditorBlock(dict.card_teaser, editorScript.teaser, dict));
  (editorScript.chapters ?? []).forEach((ch, i) => {
    const title = video.script?.chapters?.[i]?.title ?? '';
    blocks.push(renderEditorBlock(dict.card_chapter(i + 1, title), ch, dict));
  });
  if (editorScript.affiliate_segment)
    blocks.push(renderEditorBlock(dict.card_affiliate, editorScript.affiliate_segment, dict));
  if (editorScript.outro) blocks.push(renderEditorBlock(dict.card_outro, editorScript.outro, dict));

  if (blocks.length === 0) return '';

  const cg = editorScript.color_grading;

  return /* html */ `
    <section class="section section--new-page">
      <div class="section__header">
        <span class="section__bar"></span>
        <span class="section__title">${esc(dict.section_editor)}</span>
        <span class="section__hint">${esc(dict.section_editor_hint)}</span>
      </div>
      ${blocks.join('')}
      ${
        cg
          ? `<div style="margin-top: 18px; padding: 14px 16px; background: rgba(167,139,250,0.08); border: 1px solid rgba(167,139,250,0.30); border-radius: var(--radius-md); page-break-inside: avoid;">
              <div style="font-family: var(--font-display); font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #7C3AED; margin-bottom: 6px;">${esc(dict.section_color_grading)}</div>
              <div style="font-size: 10pt; line-height: 1.5;">${esc(cg)}</div>
            </div>`
          : ''
      }
    </section>
  `;
}

function renderEditorBlock(
  label: string,
  sec: VideoEditorSection,
  dict: RoteiroDict,
): string {
  const visualRows: string[] = [];
  if (sec.A_roll) visualRows.push(editorRow(ICON_CAMERA, dict.row_a_roll, esc(sec.A_roll)));
  if (Array.isArray(sec.B_roll) && sec.B_roll.length > 0) {
    const chips = sec.B_roll.map((b) => `<li>${esc(typeof b === 'string' ? b : JSON.stringify(b))}</li>`).join('');
    visualRows.push(editorRow(ICON_FILM, dict.row_b_roll, `<ul class="broll-chips">${chips}</ul>`));
  } else if (typeof sec.B_roll === 'string' && (sec.B_roll as string).length > 0) {
    visualRows.push(editorRow(ICON_FILM, dict.row_b_roll, esc(sec.B_roll as string)));
  }
  if (Array.isArray(sec.text_overlays) && sec.text_overlays.length > 0) {
    visualRows.push(editorRow(ICON_TYPE, dict.row_overlays, renderOverlayTable(sec.text_overlays, dict)));
  } else if (typeof sec.text_overlays === 'string' && (sec.text_overlays as string).length > 0) {
    visualRows.push(editorRow(ICON_TYPE, dict.row_overlays, esc(sec.text_overlays as string)));
  }

  const audioRows: string[] = [];
  if (sec.SFX) audioRows.push(editorRow(ICON_VOLUME, dict.row_sfx, esc(sec.SFX)));
  if (sec.BGM) audioRows.push(editorRow(ICON_MUSIC, dict.row_bgm, esc(sec.BGM)));

  const timingRows: string[] = [];
  if (sec.Transitions) timingRows.push(editorRow(ICON_REFRESH, dict.row_transitions, esc(sec.Transitions)));
  if (sec.Visual_effects) timingRows.push(editorRow(ICON_SPARKLES, dict.row_vfx, esc(sec.Visual_effects)));
  if (sec.Pacing_notes) timingRows.push(editorRow(ICON_CLOCK, dict.row_pacing, esc(sec.Pacing_notes)));

  const groups: string[] = [];
  if (visualRows.length > 0) groups.push(editorGroup('', dict.group_visual, visualRows));
  if (audioRows.length > 0) groups.push(editorGroup('--audio', dict.group_audio, audioRows));
  if (timingRows.length > 0) groups.push(editorGroup('--timing', dict.group_timing, timingRows));

  if (groups.length === 0) return '';

  return /* html */ `
    <div class="editor-block">
      <header class="editor-block__head">
        <span class="editor-block__bar"></span>
        <span class="editor-block__title">${esc(label)}</span>
      </header>
      <div class="editor-block__body">
        ${groups.join('')}
      </div>
    </div>
  `;
}

function editorGroup(variant: '' | '--audio' | '--timing', title: string, rows: string[]): string {
  return `
    <div class="editor-group editor-group${variant}">
      <span class="editor-group__dot"></span>
      <span class="editor-group__title">${esc(title)}</span>
      <span class="editor-group__rule"></span>
    </div>
    <div class="editor-rows">
      ${rows.join('')}
    </div>
  `;
}

function editorRow(icon: string, label: string, valueHtml: string): string {
  return `
    <div class="editor-row">
      <span class="editor-row__label">${icon}${esc(label)}</span>
      <div class="editor-row__value">${valueHtml}</div>
    </div>
  `;
}

function renderOverlayTable(
  overlays: unknown[],
  dict: RoteiroDict,
): string {
  const rows = overlays
    .map((raw) => {
      if (!raw || typeof raw !== 'object') {
        return `<tr><td class="ts">—</td><td class="copy">${esc(String(raw))}</td><td class="style"></td></tr>`;
      }
      const o = raw as { time?: string; timestamp?: string; text?: string; copy?: string; style?: string; notes?: string };
      const time = o.time ?? o.timestamp ?? '';
      const text = o.text ?? o.copy ?? '';
      const style = o.style ?? o.notes ?? '';
      return `<tr><td class="ts">${esc(time || '—')}</td><td class="copy">${esc(text)}</td><td class="style">${esc(style)}</td></tr>`;
    })
    .join('');

  return `
    <table class="overlays">
      <thead>
        <tr>
          <th>${esc(dict.overlay_th_time)}</th>
          <th>${esc(dict.overlay_th_copy)}</th>
          <th>${esc(dict.overlay_th_style)}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ─── Lower thirds ───────────────────────────────────────────────────────────

function renderLowerThirds(args: { dict: RoteiroDict; video: VideoOutput }): string {
  const { dict, video } = args;
  const lts = video.lower_thirds ?? [];
  if (lts.length === 0) return '';

  return /* html */ `
    <section class="section section--new-page">
      <div class="section__header">
        <span class="section__bar"></span>
        <span class="section__title">${esc(dict.section_lower_thirds)}</span>
        <span class="section__hint">${esc(dict.section_lower_thirds_hint(lts.length))}</span>
      </div>
      <table class="lt">
        <thead>
          <tr>
            <th style="width: 70px;">${esc(dict.lt_th_timestamp)}</th>
            <th>${esc(dict.lt_th_line1)}</th>
            <th>${esc(dict.lt_th_line2)}</th>
            <th style="width: 70px;">${esc(dict.lt_th_duration)}</th>
          </tr>
        </thead>
        <tbody>
          ${lts
            .map(
              (lt) => `
            <tr>
              <td class="ts">${esc(lt.timestamp ?? '')}</td>
              <td>${esc(lt.line1 ?? '')}</td>
              <td>${esc(lt.line2 ?? '')}</td>
              <td>${esc(String(lt.duration_seconds ?? 0))}s</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </section>
  `;
}

// ─── Thumbnails ─────────────────────────────────────────────────────────────

function renderThumbnails(args: { dict: RoteiroDict; video: VideoOutput }): string {
  const { dict, video } = args;
  const ideas = video.thumbnail_ideas ?? [];
  if (ideas.length === 0) return '';

  return /* html */ `
    <section class="section">
      <div class="section__header">
        <span class="section__bar"></span>
        <span class="section__title">${esc(dict.section_thumbnails)}</span>
      </div>
      <div class="thumb-grid">
        ${ideas
          .map((idea) => {
            const palette = parsePalette(idea.color_palette);
            return `
            <div class="thumb-card">
              <header class="thumb-card__head">
                <span class="thumb-card__copy">${esc(idea.text_overlay ?? '')}</span>
                <span class="thumb-card__emotion emotion-${esc(idea.emotion ?? 'curiosity')}">${esc(dict.thumb_emotion[idea.emotion as keyof typeof dict.thumb_emotion] ?? idea.emotion ?? '')}</span>
              </header>
              ${idea.concept ? `<p class="thumb-card__concept">${esc(idea.concept)}</p>` : ''}
              ${
                palette.length > 0
                  ? `<div class="thumb-card__palette">
                      ${palette.map((c) => `<span class="swatch" style="background: ${c.hex};" title="${esc(c.label)}"></span>`).join('')}
                      <span style="font-size: 9pt; color: var(--text-muted); margin-left: 4px;">${esc(idea.color_palette ?? '')}</span>
                    </div>`
                  : ''
              }
              ${
                idea.composition
                  ? `<div class="thumb-card__composition"><strong>${esc(dict.thumb_composition_label)}:</strong> ${esc(idea.composition)}</div>`
                  : ''
              }
            </div>`;
          })
          .join('')}
      </div>
    </section>
  `;
}

// ─── Image prompts ──────────────────────────────────────────────────────────

function renderImagePrompts(args: { dict: RoteiroDict; video: VideoOutput }): string {
  const { dict, video } = args;
  const ip = video.image_prompts;
  if (!ip) return '';
  const items: Array<{ label: string; value: string }> = [];
  if (ip.thumbnail_option_1) items.push({ label: dict.prompt_thumbnail_1, value: ip.thumbnail_option_1 });
  if (ip.thumbnail_option_2) items.push({ label: dict.prompt_thumbnail_2, value: ip.thumbnail_option_2 });
  for (const ch of ip.chapters ?? []) {
    if (ch.prompt) items.push({ label: ch.chapter_title || 'Chapter', value: ch.prompt });
  }
  if (items.length === 0) return '';

  return /* html */ `
    <section class="section">
      <div class="section__header">
        <span class="section__bar"></span>
        <span class="section__title">${esc(dict.section_image_prompts)}</span>
      </div>
      <div class="overview-grid">
        ${items
          .map(
            (it) => `
          <div class="field field--wide">
            <span class="field__label">${esc(it.label)}</span>
            <div class="desc-block" style="font-family: var(--font-mono); font-size: 9pt;">${esc(it.value)}</div>
          </div>`,
          )
          .join('')}
      </div>
    </section>
  `;
}

// ─── Pinned comment ─────────────────────────────────────────────────────────

function renderPinned(args: { dict: RoteiroDict; comment: string }): string {
  return /* html */ `
    <section class="section">
      <div class="section__header">
        <span class="section__bar"></span>
        <span class="section__title">${esc(args.dict.section_pinned)}</span>
      </div>
      <div class="desc-block">${esc(args.comment)}</div>
    </section>
  `;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function collectAltTitles(video: VideoOutput): string[] {
  const fromAlts = Array.isArray(video.video_title?.alternatives)
    ? video.video_title!.alternatives!
    : [];
  const fromOptions = Array.isArray(video.title_options) ? video.title_options : [];
  const primary = video.video_title?.primary;
  const merged = [...fromAlts, ...fromOptions.filter((t) => t !== primary)];
  return Array.from(new Set(merged.filter((t): t is string => typeof t === 'string')));
}

function esc(raw: unknown): string {
  if (raw == null) return '';
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeFormatDate(d: Date, lang: string): string {
  try {
    return d.toLocaleString(lang, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return d.toISOString();
  }
}

/**
 * Models sometimes emit editor_script in snake_case (a_roll, sfx_cues,
 * sfx, bgm, …) and overlays in alternate shapes. Coerce both so the
 * template can read a single canonical shape — and crucially, so text
 * overlays don't render as `[undefined] undefined`.
 */
function normalizeEditorScript(input: VideoEditorScript | undefined): VideoEditorScript | undefined {
  if (!input || typeof input !== 'object') return undefined;

  const normSection = (raw: unknown): VideoEditorSection | undefined => {
    if (!raw || typeof raw !== 'object') return undefined;
    const sec = raw as Record<string, unknown>;
    const pick = (...keys: string[]) =>
      keys.map((k) => sec[k]).find((v) => v != null && v !== '');
    const asString = (v: unknown): string | undefined => {
      if (v == null) return undefined;
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n');
      return String(v);
    };
    const asStringArray = (v: unknown): string[] | undefined => {
      if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)));
      if (typeof v === 'string' && v.length > 0) return v.split('\n').map((l) => l.trim()).filter(Boolean);
      return undefined;
    };

    const out: VideoEditorSection = {
      A_roll: asString(pick('A_roll', 'a_roll')),
      B_roll: asStringArray(pick('B_roll', 'b_roll')),
      SFX: asString(pick('SFX', 'sfx', 'sfx_cues')),
      BGM: asString(pick('BGM', 'bgm')),
      Transitions: asString(pick('Transitions', 'transitions')),
      Visual_effects: asString(pick('Visual_effects', 'visual_effects', 'vfx')),
      Pacing_notes: asString(pick('Pacing_notes', 'pacing_notes', 'pacing')),
      text_overlays: pick('text_overlays', 'overlays', 'TextOverlays') as VideoEditorSection['text_overlays'],
    };
    return out;
  };

  const out: VideoEditorScript = {};
  if (input.hook) out.hook = normSection(input.hook);
  if (input.problem) out.problem = normSection(input.problem);
  if (input.teaser) out.teaser = normSection(input.teaser);
  if (Array.isArray(input.chapters)) {
    out.chapters = input.chapters
      .map((c) => normSection(c))
      .filter((c): c is VideoEditorSection => c != null);
  }
  if (input.affiliate_segment) out.affiliate_segment = normSection(input.affiliate_segment);
  if (input.outro) out.outro = normSection(input.outro);
  if (typeof input.color_grading === 'string') out.color_grading = input.color_grading;

  return out;
}

const COLOR_NAME_TO_HEX: Record<string, string> = {
  black: '#0a0a0a', white: '#ffffff', gray: '#9ca3af', grey: '#9ca3af',
  red: '#ef4444', orange: '#f97316', amber: '#f59e0b', yellow: '#eab308',
  green: '#22c55e', emerald: '#10b981', teal: '#14b8a6', cyan: '#06b6d4',
  blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6', purple: '#a855f7',
  pink: '#ec4899', brown: '#92400e', beige: '#f5f5dc', gold: '#d4af37',
  silver: '#c0c0c0', navy: '#1e3a8a', neon: '#39ff14',
};

function parsePalette(raw: string | undefined): Array<{ label: string; hex: string }> {
  if (!raw) return [];
  return raw
    .split(/[,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((label) => {
      const lower = label.toLowerCase();
      const match = Object.keys(COLOR_NAME_TO_HEX).find((name) => lower.includes(name));
      return { label, hex: match ? COLOR_NAME_TO_HEX[match] : '#a3a3a3' };
    });
}

// ─── Inline assets ─────────────────────────────────────────────────────────

const BRAND_SVG_INLINE = `<svg width="118" height="22" viewBox="0 0 118 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="BrightTale">
  <rect x="0" y="3" width="16" height="16" rx="4" fill="#2DD4BF"/>
  <path d="M4 11 L7 14 L12 8" stroke="#0A1017" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <text x="22" y="16" font-family="Plus Jakarta Sans, sans-serif" font-weight="800" font-size="14" fill="currentColor">Bright<tspan fill="#FF6B35">Tale</tspan></text>
</svg>`;

const BRAND_MARK_SVG = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="BrightTale">
  <rect x="3" y="3" width="16" height="16" rx="4" fill="#2DD4BF"/>
  <path d="M7 11 L10 14 L15 8" stroke="#0A1017" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

const ICON_CAMERA = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
const ICON_FILM = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>`;
const ICON_TYPE = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`;
const ICON_VOLUME = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
const ICON_MUSIC = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
const ICON_REFRESH = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>`;
const ICON_SPARKLES = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h0M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/></svg>`;
const ICON_CLOCK = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

// ─── Styles (mirrors validated template) ────────────────────────────────────

const STYLES = `
:root {
  --brand-50:  #E6FCFA; --brand-100: #B2F5EA; --brand-500: #2DD4BF;
  --brand-600: #0D9488; --brand-700: #0F766E;
  --accent: #FF6B35; --accent-light: #FFF0EB;
  --font-sans:    'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-display: 'Plus Jakarta Sans', var(--font-sans);
  --font-mono:    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --bg: #F7F9FC; --surface: #FFFFFF; --card: #FFFFFF; --border: #E2E8F0;
  --text: #0F172A; --text-soft: #475569; --text-muted: #94A3B8;
  --panel: #F1F5F9;
  --tone-hook: #FFF0EB; --tone-hook-bar: var(--accent);
  --tone-problem: #FEF2F2; --tone-problem-bar: #EF4444;
  --tone-teaser: #EFF6FF; --tone-teaser-bar: #3B82F6;
  --tone-chapter: #F8FAFC; --tone-chapter-bar: var(--brand-600);
  --tone-affiliate: #FFFBEB; --tone-affiliate-bar: #F59E0B;
  --tone-outro: #ECFDF5; --tone-outro-bar: #10B981;
  --radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px;
}
[data-theme='dark'] {
  --bg: #0A1017; --surface: #0F1620; --card: #141E2A; --border: #1E2E40;
  --text: #F0F4F8; --text-soft: #CBD5E1; --text-muted: #64748B;
  --panel: #0F1620;
  --tone-hook: rgba(255,107,53,0.10);
  --tone-problem: rgba(239,68,68,0.10);
  --tone-teaser: rgba(59,130,246,0.12);
  --tone-chapter: rgba(45,212,191,0.06);
  --tone-affiliate: rgba(245,158,11,0.10);
  --tone-outro: rgba(16,185,129,0.10);
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); }
body {
  font-family: var(--font-sans); font-size: 11pt; line-height: 1.55;
  color: var(--text); -webkit-font-smoothing: antialiased;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
h1, h2, h3, h4 { font-family: var(--font-display); margin: 0; color: var(--text); }
p { margin: 0 0 8pt; }

.toolbar {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 12px 24px;
  background: var(--surface); border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.toolbar__brand { display: flex; align-items: center; gap: 10px; font-weight: 600; color: var(--text-soft); }
.toolbar__brand svg { display: block; }
.toolbar__actions { display: flex; align-items: center; gap: 8px; }
.btn {
  appearance: none; border: 1px solid var(--border); background: var(--card);
  color: var(--text); font: 500 13px var(--font-sans);
  padding: 8px 14px; border-radius: var(--radius-md);
  cursor: pointer;
}
.btn:hover { background: var(--panel); border-color: var(--brand-500); }
.toggle {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 10px; border: 1px solid var(--border);
  border-radius: 999px; background: var(--card);
  font-size: 12px; color: var(--text-soft);
}
@media print { .toolbar { display: none !important; } }

/* Strategy: @page { margin: 0 } makes the .page element fill the
   paper edge-to-edge (so the dark surface bleeds completely). The
   per-page breathing room is recreated via box-decoration-break: clone
   on .page — each page fragment of the element re-applies its padding
   and background, so content never collides with the page break and
   the dark fill survives across every page. Supported by Chrome and
   Firefox in print mode. */
@page { size: A4; margin: 0; }
html, body {
  background: var(--bg);
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.page {
  max-width: 180mm; margin: 0 auto; padding: 24px;
  background: var(--bg);
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
@media print {
  .page {
    max-width: 100%; margin: 0;
    /* Top/bottom padding repeats on every page thanks to clone below. */
    padding: 14mm 12mm 22mm 12mm;
    background: var(--bg);
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }
  /* Section breaks get extra top breathing room so the section header
     doesn't sit flush against the (cloned) page padding after a forced
     break. */
  .section--new-page { padding-top: 2mm; }
}

.print-footer { display: none; }
@media print {
  /* Fixed footer paints on every page, sitting inside the .page
     bottom padding band so it never overlaps content. */
  .print-footer {
    display: block; position: fixed; bottom: 8mm; left: 12mm; right: 12mm;
    font-size: 8pt; color: var(--text-muted); font-family: var(--font-sans);
  }
  .print-footer__left { float: left; }
  .print-footer__right { float: right; font-family: var(--font-mono); }
}

.cover {
  padding: 28px 32px 24px;
  background: linear-gradient(135deg, var(--brand-50) 0%, var(--surface) 60%, var(--surface) 100%);
  border: 1px solid var(--border); border-radius: var(--radius-lg);
  margin-bottom: 24px; position: relative; overflow: hidden;
}
[data-theme='dark'] .cover {
  background: linear-gradient(135deg, rgba(45,212,191,0.10) 0%, var(--card) 70%);
}
.cover::before {
  content: ''; position: absolute; left: 32px; top: 0;
  width: 48px; height: 4px; background: var(--brand-600); border-radius: 0 0 4px 4px;
}
.cover__brand {
  display: flex; align-items: center; gap: 10px; margin-bottom: 18px;
  font-family: var(--font-display); font-weight: 700; font-size: 14px;
  color: var(--text-soft);
}
.cover__kicker {
  display: inline-block; font-family: var(--font-display);
  font-size: 10px; font-weight: 700; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--brand-600); margin-bottom: 10px;
}
.cover__title {
  font-family: var(--font-display); font-weight: 800;
  font-size: 30pt; line-height: 1.1; letter-spacing: -0.02em;
  margin-bottom: 16px; max-width: 165mm;
}
.cover__meta { display: flex; flex-wrap: wrap; gap: 18px 24px; font-size: 10pt; color: var(--text-soft); }
.cover__meta strong { color: var(--text); font-weight: 600; }
.cover__meta-item { display: inline-flex; align-items: baseline; gap: 6px; }
.cover__meta-label {
  font-family: var(--font-display); font-size: 9px; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted);
}

.section { margin: 32px 0 16px; }
.section--new-page { page-break-before: always; }
.section__header {
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 8px; margin-bottom: 14px;
  border-bottom: 1px solid var(--border);
  page-break-after: avoid; break-after: avoid;
}
.section__bar { width: 4px; height: 18px; background: var(--brand-600); border-radius: 2px; }
.section__title {
  font-family: var(--font-display); font-weight: 700; font-size: 14pt;
  letter-spacing: -0.01em; text-transform: uppercase;
}
.section__hint { margin-left: auto; font-size: 9pt; color: var(--text-muted); }

.overview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; }
.field { display: flex; flex-direction: column; gap: 4px; page-break-inside: avoid; }
.field__label {
  font-family: var(--font-display); font-size: 9px; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted);
}
.field__value { font-size: 10.5pt; color: var(--text); }
.field--wide { grid-column: 1 / -1; }
.alt-list { margin: 4px 0 0; padding-left: 0; list-style: none; }
.alt-list li {
  padding: 4px 10px; background: var(--panel);
  border-left: 2px solid var(--brand-500);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  margin-bottom: 4px; font-size: 10pt;
}
.desc-block {
  padding: 14px 16px; background: var(--panel); border: 1px solid var(--border);
  border-radius: var(--radius-md); font-size: 10pt; line-height: 1.6; white-space: pre-wrap;
}

.card {
  background: var(--card); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 14px 16px 12px;
  margin-bottom: 12px; page-break-inside: avoid; position: relative;
  border-left: 4px solid var(--brand-600);
}
.card--hook { background: var(--tone-hook); border-left-color: var(--tone-hook-bar); }
.card--problem { background: var(--tone-problem); border-left-color: var(--tone-problem-bar); }
.card--teaser { background: var(--tone-teaser); border-left-color: var(--tone-teaser-bar); }
.card--chapter { background: var(--tone-chapter); border-left-color: var(--tone-chapter-bar); }
.card--affiliate { background: var(--tone-affiliate); border-left-color: var(--tone-affiliate-bar); }
.card--outro { background: var(--tone-outro); border-left-color: var(--tone-outro-bar); }
.card__head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border);
}
.card__label {
  font-family: var(--font-display); font-size: 10pt; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.08em;
}
.card__meta { font-family: var(--font-mono); font-size: 8.5pt; color: var(--text-muted); }
.card__body { font-size: 10.5pt; line-height: 1.6; color: var(--text); white-space: pre-wrap; }
.card__sub {
  margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border);
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px;
}
.card__sub .field--wide { grid-column: 1 / -1; }

.editor-block {
  border: 1px solid var(--border); border-radius: var(--radius-md);
  margin-bottom: 14px; overflow: hidden;
}
.editor-block__head {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; background: var(--panel);
  border-bottom: 1px solid var(--border);
  page-break-after: avoid; break-after: avoid;
}
.editor-block__bar { width: 3px; height: 14px; background: var(--brand-600); border-radius: 2px; }
.editor-block__title {
  font-family: var(--font-display); font-weight: 700; font-size: 11pt;
  text-transform: uppercase; letter-spacing: 0.06em;
}
.editor-block__body { padding: 10px 14px 12px; font-size: 10pt; }

.editor-group {
  margin: 8px 0 4px;
  display: flex; align-items: center; gap: 6px;
  page-break-after: avoid; break-after: avoid;
}
.editor-group:first-child { margin-top: 0; }
.editor-group__dot { width: 6px; height: 6px; border-radius: 999px; background: var(--brand-500); }
.editor-group--audio  .editor-group__dot { background: var(--accent); }
.editor-group--timing .editor-group__dot { background: #A78BFA; }
.editor-group__title {
  font-family: var(--font-display); font-size: 9px; font-weight: 700;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-soft);
}
.editor-group__rule { flex: 1; height: 1px; background: var(--border); }

.editor-rows {
  display: grid; grid-template-columns: 88px 1fr; gap: 0;
  font-size: 10pt; line-height: 1.4; margin-bottom: 6px;
}
.editor-row { display: contents; }
.editor-row__label, .editor-row__value {
  padding: 5px 8px;
  page-break-inside: avoid; break-inside: avoid;
}
.editor-row:nth-child(odd) .editor-row__label,
.editor-row:nth-child(odd) .editor-row__value { background: var(--panel); }
[data-theme='dark'] .editor-row:nth-child(odd) .editor-row__label,
[data-theme='dark'] .editor-row:nth-child(odd) .editor-row__value { background: rgba(255,255,255,0.02); }
.editor-row__label {
  font-family: var(--font-display); font-size: 9px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted);
  display: flex; align-items: flex-start; gap: 5px; padding-top: 7px;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}
.editor-row__label .ico { flex-shrink: 0; width: 11px; height: 11px; color: var(--text-muted); }
.editor-row__value {
  color: var(--text); white-space: pre-wrap;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.broll-chips {
  display: flex; flex-wrap: wrap; gap: 4px 5px; list-style: none;
  margin: 1px 0 0; padding: 0;
}
.broll-chips li {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 8px; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-size: 9pt; line-height: 1.3;
  page-break-inside: avoid; break-inside: avoid;
}
.broll-chips .dur { font-family: var(--font-mono); font-size: 8pt; color: var(--text-muted); }

table.overlays { width: 100%; border-collapse: collapse; margin-top: 2px; font-size: 9.5pt; }
table.overlays th, table.overlays td {
  padding: 4px 8px; border-bottom: 1px solid var(--border);
  text-align: left; vertical-align: top;
  page-break-inside: avoid; break-inside: avoid;
}
table.overlays thead th {
  font-family: var(--font-display); font-size: 8pt; letter-spacing: 0.10em;
  text-transform: uppercase; color: var(--text-muted); font-weight: 700;
  border-bottom-color: var(--brand-600); padding-bottom: 3px;
}
table.overlays td.ts {
  width: 48px; font-family: var(--font-mono); font-size: 8.5pt;
  color: var(--text-soft); white-space: nowrap;
}
table.overlays td.copy { font-weight: 600; color: var(--text); width: 45%; }
table.overlays td.style { color: var(--text-muted); font-style: italic; font-size: 9pt; }

table.lt { width: 100%; border-collapse: collapse; font-size: 10pt; }
table.lt th, table.lt td {
  padding: 8px 10px; border-bottom: 1px solid var(--border);
  text-align: left; vertical-align: top;
}
table.lt thead th {
  background: var(--panel); font-family: var(--font-display);
  font-size: 9px; letter-spacing: 0.10em; text-transform: uppercase;
  color: var(--text-muted);
}
table.lt td.ts { font-family: var(--font-mono); font-size: 9pt; color: var(--text-soft); }

.thumb-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.thumb-card {
  background: var(--card); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 12px 14px; page-break-inside: avoid;
}
.thumb-card__head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; margin-bottom: 8px;
}
.thumb-card__copy {
  font-family: var(--font-display); font-weight: 800; font-size: 13pt;
  line-height: 1.15; letter-spacing: -0.01em;
}
.thumb-card__emotion {
  font-family: var(--font-display); font-size: 9px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.10em;
  padding: 3px 8px; border-radius: 999px; border: 1px solid var(--border);
}
.emotion-curiosity { background: rgba(59,130,246,0.10); color: #2563EB; border-color: rgba(59,130,246,0.30); }
.emotion-shock     { background: rgba(239,68,68,0.10);  color: #DC2626; border-color: rgba(239,68,68,0.30); }
.emotion-intrigue  { background: rgba(167,139,250,0.10); color: #7C3AED; border-color: rgba(167,139,250,0.30); }
.thumb-card__concept { font-size: 9.5pt; color: var(--text-soft); margin-bottom: 8px; }
.thumb-card__palette { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.swatch { display: inline-block; width: 14px; height: 14px; border-radius: 999px; border: 1px solid var(--border); }
.thumb-card__composition {
  font-size: 9pt; color: var(--text-muted); font-style: italic;
  border-top: 1px dashed var(--border); margin-top: 8px; padding-top: 6px;
}
`;
