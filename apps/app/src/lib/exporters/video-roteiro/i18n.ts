/**
 * Localized chrome strings for the video roteiro PDF template.
 *
 * Two language layers live in the export:
 *   1. CONTENT — title, script body, B-roll, overlays — comes from BC_VIDEO
 *      already in channel.language. The template renders it as-is.
 *   2. CHROME  — section headers, row labels, table headers, footer copy
 *      — looked up here by `channel.language` (ISO code).
 *
 * Add a language by dropping a new entry in DICTS. No template change needed.
 */

export type RoteiroLang = 'pt-BR' | 'en-US' | 'es-ES';

export interface RoteiroDict {
  // Document chrome
  doc_kicker: string;              // small uppercase above the cover title
  doc_brand_suffix: string;        // appears next to "BrightTale" in toolbar/cover

  // Cover meta
  meta_duration: string;
  meta_mood: string;
  meta_channel: string;
  meta_generated: string;

  // Sections
  section_overview: string;
  section_script: string;
  section_script_hint: string;
  section_editor: string;
  section_editor_hint: string;
  section_lower_thirds: string;
  section_lower_thirds_hint: (n: number) => string;
  section_thumbnails: string;
  section_pinned: string;
  section_color_grading: string;
  section_image_prompts: string;

  // Overview fields
  field_title_primary: string;
  field_titles_alt: string;
  field_description: string;

  // Script card labels
  card_hook: string;
  card_problem: string;
  card_teaser: string;
  card_chapter: (n: number, title: string) => string;
  card_affiliate: string;
  card_outro: string;
  card_visual_notes: string;
  card_b_roll: string;
  card_key_stat: string;
  card_cta: string;
  card_end_screen: string;
  card_trans_in: string;
  card_trans_out: string;
  card_audio_direction: string;

  // Editor-block sub-groups
  group_visual: string;
  group_audio: string;
  group_timing: string;

  // Editor rows
  row_a_roll: string;
  row_b_roll: string;
  row_overlays: string;
  row_sfx: string;
  row_bgm: string;
  row_transitions: string;
  row_vfx: string;
  row_pacing: string;

  // Tables
  overlay_th_time: string;
  overlay_th_copy: string;
  overlay_th_style: string;
  lt_th_timestamp: string;
  lt_th_line1: string;
  lt_th_line2: string;
  lt_th_duration: string;

  // Thumbnails
  thumb_emotion: { curiosity: string; shock: string; intrigue: string };
  thumb_palette_label: string;
  thumb_composition_label: string;

  // Image prompts
  prompt_thumbnail_1: string;
  prompt_thumbnail_2: string;

  // Toolbar (screen-only)
  btn_print: string;
  btn_dark: string;

  // Print footer
  print_footer_right: string;
}

const PT_BR: RoteiroDict = {
  doc_kicker: 'Vídeo · Roteiro',
  doc_brand_suffix: 'Studio',

  meta_duration: 'Duração',
  meta_mood: 'Mood',
  meta_channel: 'Canal',
  meta_generated: 'Gerado em',

  section_overview: 'Visão geral',
  section_script: 'Roteiro',
  section_script_hint: 'Leitura para o apresentador',
  section_editor: 'Edição · Notas técnicas',
  section_editor_hint: 'Companion do editor de vídeo',
  section_lower_thirds: 'Lower thirds',
  section_lower_thirds_hint: (n) => `${n} ${n === 1 ? 'insert' : 'inserts'}`,
  section_thumbnails: 'Ideias de thumbnail',
  section_pinned: 'Comentário fixado',
  section_color_grading: 'Color grading',
  section_image_prompts: 'Prompts de imagem',

  field_title_primary: 'Título principal',
  field_titles_alt: 'Títulos alternativos (A/B)',
  field_description: 'Descrição (YouTube)',

  card_hook: 'Hook',
  card_problem: 'Problema',
  card_teaser: 'Teaser',
  card_chapter: (n, title) => `Capítulo ${n}${title ? ` · ${title}` : ''}`,
  card_affiliate: 'Bloco de afiliados',
  card_outro: 'Outro',
  card_visual_notes: 'Notas visuais',
  card_b_roll: 'B-roll',
  card_key_stat: 'Stat / citação-chave',
  card_cta: 'CTA',
  card_end_screen: 'End screen',
  card_trans_in: 'Transição (entrada)',
  card_trans_out: 'Transição (saída)',
  card_audio_direction: 'Direção de áudio',

  group_visual: 'Visual',
  group_audio: 'Áudio',
  group_timing: 'Timing',

  row_a_roll: 'A-roll',
  row_b_roll: 'B-roll',
  row_overlays: 'Overlays',
  row_sfx: 'SFX',
  row_bgm: 'BGM',
  row_transitions: 'Transições',
  row_vfx: 'VFX',
  row_pacing: 'Pacing',

  overlay_th_time: 'Time',
  overlay_th_copy: 'Copy',
  overlay_th_style: 'Style',
  lt_th_timestamp: 'Timestamp',
  lt_th_line1: 'Linha 1',
  lt_th_line2: 'Linha 2',
  lt_th_duration: 'Duração',

  thumb_emotion: { curiosity: 'Curiosidade', shock: 'Choque', intrigue: 'Intriga' },
  thumb_palette_label: 'Paleta',
  thumb_composition_label: 'Composição',

  prompt_thumbnail_1: 'Thumbnail · opção 1',
  prompt_thumbnail_2: 'Thumbnail · opção 2',

  btn_print: 'Imprimir / Salvar PDF',
  btn_dark: 'Dark mode',

  print_footer_right: 'Roteiro · BrightTale',
};

const EN_US: RoteiroDict = {
  doc_kicker: 'Video · Script',
  doc_brand_suffix: 'Studio',

  meta_duration: 'Duration',
  meta_mood: 'Mood',
  meta_channel: 'Channel',
  meta_generated: 'Generated',

  section_overview: 'Overview',
  section_script: 'Script',
  section_script_hint: 'Reader copy for the host',
  section_editor: 'Edit · Technical notes',
  section_editor_hint: 'Video editor companion',
  section_lower_thirds: 'Lower thirds',
  section_lower_thirds_hint: (n) => `${n} ${n === 1 ? 'insert' : 'inserts'}`,
  section_thumbnails: 'Thumbnail ideas',
  section_pinned: 'Pinned comment',
  section_color_grading: 'Color grading',
  section_image_prompts: 'Image prompts',

  field_title_primary: 'Primary title',
  field_titles_alt: 'Alternative titles (A/B)',
  field_description: 'Description (YouTube)',

  card_hook: 'Hook',
  card_problem: 'Problem',
  card_teaser: 'Teaser',
  card_chapter: (n, title) => `Chapter ${n}${title ? ` · ${title}` : ''}`,
  card_affiliate: 'Affiliate segment',
  card_outro: 'Outro',
  card_visual_notes: 'Visual notes',
  card_b_roll: 'B-roll',
  card_key_stat: 'Key stat / quote',
  card_cta: 'CTA',
  card_end_screen: 'End screen',
  card_trans_in: 'Transition in',
  card_trans_out: 'Transition out',
  card_audio_direction: 'Audio direction',

  group_visual: 'Visual',
  group_audio: 'Audio',
  group_timing: 'Timing',

  row_a_roll: 'A-roll',
  row_b_roll: 'B-roll',
  row_overlays: 'Overlays',
  row_sfx: 'SFX',
  row_bgm: 'BGM',
  row_transitions: 'Transitions',
  row_vfx: 'VFX',
  row_pacing: 'Pacing',

  overlay_th_time: 'Time',
  overlay_th_copy: 'Copy',
  overlay_th_style: 'Style',
  lt_th_timestamp: 'Timestamp',
  lt_th_line1: 'Line 1',
  lt_th_line2: 'Line 2',
  lt_th_duration: 'Duration',

  thumb_emotion: { curiosity: 'Curiosity', shock: 'Shock', intrigue: 'Intrigue' },
  thumb_palette_label: 'Palette',
  thumb_composition_label: 'Composition',

  prompt_thumbnail_1: 'Thumbnail · option 1',
  prompt_thumbnail_2: 'Thumbnail · option 2',

  btn_print: 'Print / Save as PDF',
  btn_dark: 'Dark mode',

  print_footer_right: 'Script · BrightTale',
};

const ES_ES: RoteiroDict = {
  doc_kicker: 'Vídeo · Guión',
  doc_brand_suffix: 'Studio',

  meta_duration: 'Duración',
  meta_mood: 'Mood',
  meta_channel: 'Canal',
  meta_generated: 'Generado',

  section_overview: 'Visión general',
  section_script: 'Guión',
  section_script_hint: 'Lectura para el presentador',
  section_editor: 'Edición · Notas técnicas',
  section_editor_hint: 'Compañero del editor de vídeo',
  section_lower_thirds: 'Lower thirds',
  section_lower_thirds_hint: (n) => `${n} ${n === 1 ? 'inserto' : 'insertos'}`,
  section_thumbnails: 'Ideas de miniatura',
  section_pinned: 'Comentario fijado',
  section_color_grading: 'Color grading',
  section_image_prompts: 'Prompts de imagen',

  field_title_primary: 'Título principal',
  field_titles_alt: 'Títulos alternativos (A/B)',
  field_description: 'Descripción (YouTube)',

  card_hook: 'Hook',
  card_problem: 'Problema',
  card_teaser: 'Teaser',
  card_chapter: (n, title) => `Capítulo ${n}${title ? ` · ${title}` : ''}`,
  card_affiliate: 'Bloque de afiliados',
  card_outro: 'Outro',
  card_visual_notes: 'Notas visuales',
  card_b_roll: 'B-roll',
  card_key_stat: 'Stat / cita clave',
  card_cta: 'CTA',
  card_end_screen: 'End screen',
  card_trans_in: 'Transición (entrada)',
  card_trans_out: 'Transición (salida)',
  card_audio_direction: 'Dirección de audio',

  group_visual: 'Visual',
  group_audio: 'Audio',
  group_timing: 'Timing',

  row_a_roll: 'A-roll',
  row_b_roll: 'B-roll',
  row_overlays: 'Overlays',
  row_sfx: 'SFX',
  row_bgm: 'BGM',
  row_transitions: 'Transiciones',
  row_vfx: 'VFX',
  row_pacing: 'Pacing',

  overlay_th_time: 'Time',
  overlay_th_copy: 'Copy',
  overlay_th_style: 'Style',
  lt_th_timestamp: 'Timestamp',
  lt_th_line1: 'Línea 1',
  lt_th_line2: 'Línea 2',
  lt_th_duration: 'Duración',

  thumb_emotion: { curiosity: 'Curiosidad', shock: 'Shock', intrigue: 'Intriga' },
  thumb_palette_label: 'Paleta',
  thumb_composition_label: 'Composición',

  prompt_thumbnail_1: 'Miniatura · opción 1',
  prompt_thumbnail_2: 'Miniatura · opción 2',

  btn_print: 'Imprimir / Guardar PDF',
  btn_dark: 'Modo oscuro',

  print_footer_right: 'Guión · BrightTale',
};

const DICTS: Record<RoteiroLang, RoteiroDict> = {
  'pt-BR': PT_BR,
  'en-US': EN_US,
  'es-ES': ES_ES,
};

/**
 * Resolve the dictionary for a channel's ISO language code.
 * Accepts loose inputs (`pt`, `en`, `es-MX`) by mapping the language
 * subtag, falling back to en-US if nothing matches.
 */
export function pickDict(language?: string | null): RoteiroDict {
  if (!language) return EN_US;
  if (language in DICTS) return DICTS[language as RoteiroLang];
  const primary = language.split('-')[0]?.toLowerCase();
  if (primary === 'pt') return PT_BR;
  if (primary === 'es') return ES_ES;
  if (primary === 'en') return EN_US;
  return EN_US;
}
