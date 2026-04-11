/**
 * Shorts module exporter
 * Wraps the existing shortsExporter functions to accept ShortsModuleOutput.
 */

import type { ShortsModuleOutput } from "./schema.js";
import type { ShortOutput } from "@brighttale/shared/types/agents";
import {
  generateShortsMarkdownExport as _md,
  generateShortsHtmlExport as _html,
} from "../../exporters/shortsExporter.js";

function toShortOutputArray(shorts: ShortsModuleOutput): ShortOutput[] {
  return shorts as unknown as ShortOutput[];
}

export function generateShortsMarkdownExport(shorts: ShortsModuleOutput): string {
  return _md(toShortOutputArray(shorts));
}

export function generateShortsHtmlExport(shorts: ShortsModuleOutput): string {
  return _html(toShortOutputArray(shorts));
}
