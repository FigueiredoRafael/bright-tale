'use client';

/**
 * Opens the video roteiro in a new browser tab as a print-ready HTML
 * document. The user then uses the toolbar button (or the system print
 * shortcut) to save as PDF.
 *
 * HTML → print is chosen over jsPDF because:
 *   - full design-system fidelity (custom fonts, CSS grid, dark mode)
 *   - native typography hinting & ligatures
 *   - no font-embedding licence concerns
 *   - users can review on screen before committing to PDF
 */

import type { VideoOutput } from '@brighttale/shared/types/agents';
import { pickDict } from './i18n';
import { buildVideoRoteiroHtml } from './template';

export interface OpenRoteiroArgs {
  video: VideoOutput;
  /** ISO code from `channel.language`. Defaults to 'en-US'. */
  language?: string | null;
  /** Channel display name — appears in the cover meta strip. */
  channelName?: string | null;
  /** Initial dark/light state. Defaults to the OS preference. */
  initialTheme?: 'light' | 'dark';
}

/**
 * Open a new tab with the printable roteiro. Returns the opened
 * Window reference (null if popup blocked) so callers can show a
 * toast or fallback link.
 */
export function openVideoRoteiroForPrint(args: OpenRoteiroArgs): Window | null {
  const language = args.language ?? 'en-US';
  const dict = pickDict(language);
  const initialTheme =
    args.initialTheme ??
    (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light');

  const html = buildVideoRoteiroHtml(args.video, dict, {
    channelName: args.channelName,
    initialTheme,
    langCode: language,
  });

  const win = window.open('', '_blank', 'noopener=no');
  if (!win) return null;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return win;
}
