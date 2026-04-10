/**
 * Video module exporter
 * Wraps the existing videoExporter functions to accept VideoModuleOutput.
 * The underlying export logic lives in src/lib/exporters/videoExporter.ts.
 */

import type { VideoModuleOutput } from "./schema";
import type { VideoOutput } from "@brighttale/shared/types/agents";
import {
  generateVideoMarkdownExport as _md,
  generateVideoHtmlExport as _html,
  generateTeleprompterExport as _teleprompter,
} from "@/lib/exporters/videoExporter";

// VideoModuleOutput is structurally compatible with VideoOutput — cast directly.
function toVideoOutput(video: VideoModuleOutput): VideoOutput {
  return video as unknown as VideoOutput;
}

export function generateVideoMarkdownExport(video: VideoModuleOutput, title?: string): string {
  return _md(toVideoOutput(video), title);
}

export function generateVideoHtmlExport(video: VideoModuleOutput, title?: string): string {
  return _html(toVideoOutput(video), title);
}

export function generateTeleprompterExport(video: VideoModuleOutput, title?: string): string {
  return _teleprompter(toVideoOutput(video), title);
}
