/**
 * autopilot-config-resolver — T1.7
 *
 * Pure module.  Resolves the effective autopilot configuration for a given
 * (project, track | null, stage) triple by coalescing three layers:
 *
 *   1. track.autopilot_config_json[stage]   (most specific — overrides everything)
 *   2. project.autopilot_config_json[stage] (project default)
 *   3. FALLBACK_BY_STAGE[stage]             (safe system default)
 *
 * The result is a fully-populated ResolvedStageAutopilotEntry — every field
 * is present, so callers never have to null-check individual properties.
 *
 * Usage (orchestrator, before any stage_run dispatch):
 *
 *   const cfg = resolveAutopilotConfig(project, track, 'review');
 *   if (cfg.skip) { ... }
 *   if (score < cfg.hardFailThreshold) { ... }
 *
 * Refs #31
 */

import {
  autopilotConfigSchema,
  FALLBACK_BY_STAGE,
  type AutopilotConfig,
  type ResolvedStageAutopilotEntry,
} from '@brighttale/shared';
import type { Stage } from '@brighttale/shared';

// ─── Input shapes ─────────────────────────────────────────────────────────────

/** Minimum project shape required by the resolver. */
export interface AutopilotProjectInput {
  autopilotConfigJson: unknown;
}

/**
 * Minimum track shape required by the resolver.
 * Pass `null` for shared stages (brainstorm, research, canonical) that have
 * no associated Track.
 */
export interface AutopilotTrackInput {
  autopilotConfigJson: unknown;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Safely parses the raw JSONB value from `projects.autopilot_config_json` or
 * `tracks.autopilot_config_json`.  Invalid / null input yields an empty object
 * (all stages inherit from the next coalesce layer).
 */
function parseConfig(raw: unknown): AutopilotConfig {
  const result = autopilotConfigSchema.safeParse(raw);
  return result.success ? result.data : {};
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolves the effective autopilot config for a single stage.
 *
 * @param project  - Project row with `autopilotConfigJson` (unknown — may be null).
 * @param track    - Track row with `autopilotConfigJson`, or null for shared stages.
 * @param stage    - The pipeline stage being dispatched.
 * @returns        A fully-resolved StageAutopilotEntry (no optional fields).
 */
export function resolveAutopilotConfig(
  project: AutopilotProjectInput,
  track: AutopilotTrackInput | null,
  stage: Stage,
): ResolvedStageAutopilotEntry {
  const fallback = FALLBACK_BY_STAGE[stage];
  const projectConfig: AutopilotConfig = parseConfig(project.autopilotConfigJson);
  const trackConfig: AutopilotConfig = track !== null ? parseConfig(track.autopilotConfigJson) : {};

  // Coalesce: track overrides project; project fills over fallback.
  const projectEntry = projectConfig[stage] ?? {};
  const trackEntry   = trackConfig[stage]   ?? {};

  return {
    maxIterations:     trackEntry.maxIterations     ?? projectEntry.maxIterations     ?? fallback.maxIterations,
    minScore:          trackEntry.minScore           ?? projectEntry.minScore           ?? fallback.minScore,
    hardFailThreshold: trackEntry.hardFailThreshold  ?? projectEntry.hardFailThreshold  ?? fallback.hardFailThreshold,
    skip:              trackEntry.skip               ?? projectEntry.skip               ?? fallback.skip,
    pauseAfter:        trackEntry.pauseAfter         ?? projectEntry.pauseAfter         ?? fallback.pauseAfter,
  };
}
