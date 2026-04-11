/**
 * Podcast module exporter
 * Wraps the existing podcastExporter functions to accept PodcastModuleOutput.
 */

import type { PodcastModuleOutput } from "./schema.js";
import type { PodcastOutput } from "@brighttale/shared/types/agents";
import {
  generatePodcastMarkdownExport as _md,
  generatePodcastHtmlExport as _html,
} from "../../exporters/podcastExporter.js";

function toPodcastOutput(podcast: PodcastModuleOutput): PodcastOutput {
  return podcast as unknown as PodcastOutput;
}

export function generatePodcastMarkdownExport(podcast: PodcastModuleOutput): string {
  return _md(toPodcastOutput(podcast));
}

export function generatePodcastHtmlExport(podcast: PodcastModuleOutput): string {
  return _html(toPodcastOutput(podcast));
}
