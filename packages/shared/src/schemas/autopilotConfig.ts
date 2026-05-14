/**
 * Zod schema for the per-Stage autopilot configuration.
 *
 * AutopilotConfig is a partial record keyed by Stage.  Each Stage entry can
 * carry its own iteration budget, quality thresholds, and skip/pause flags.
 * All fields are optional so that both project-level and track-level configs
 * can be sparse — the resolver fills gaps with FALLBACK_BY_STAGE.
 *
 * Used by: autopilot-config-resolver (apps/api/src/lib/pipeline/)
 */
import { z } from 'zod';
import { STAGES } from '../pipeline/inputs';

// ─── Per-Stage config entry ──────────────────────────────────────────────────

export const stageAutopilotEntrySchema = z.object({
  /**
   * Maximum number of loop iterations allowed for this stage before the
   * orchestrator surfaces an "awaiting_user" status.
   */
  maxIterations: z.number().int().min(0).optional(),

  /**
   * Minimum quality score (0–100) that must be reached before the pipeline
   * advances past the review stage.  Only meaningful on 'review'.
   */
  minScore: z.number().min(0).max(100).optional(),

  /**
   * Score below which a draft is immediately rejected and a new iteration is
   * spawned.  Only meaningful on 'review'.
   */
  hardFailThreshold: z.number().min(0).max(100).optional(),

  /**
   * Skip this stage entirely in autopilot mode.
   * The orchestrator will emit a 'skipped' stage_run and advance.
   */
  skip: z.boolean().optional(),

  /**
   * Pause the pipeline after dispatching this stage; requires user action to
   * continue (same as "awaiting_user" with reason='manual_advance').
   */
  pauseAfter: z.boolean().optional(),
});

export type StageAutopilotEntry = z.infer<typeof stageAutopilotEntrySchema>;

// ─── Full AutopilotConfig (one optional entry per Stage) ─────────────────────

/**
 * A sparse map of Stage → StageAutopilotEntry.
 * Both project.autopilot_config_json and track.autopilot_config_json conform
 * to this shape.  Missing Stage keys are filled by FALLBACK_BY_STAGE inside
 * the resolver.
 */
export const autopilotConfigSchema = z.object({
  brainstorm: stageAutopilotEntrySchema.optional(),
  research:   stageAutopilotEntrySchema.optional(),
  canonical:  stageAutopilotEntrySchema.optional(),
  production: stageAutopilotEntrySchema.optional(),
  review:     stageAutopilotEntrySchema.optional(),
  assets:     stageAutopilotEntrySchema.optional(),
  preview:    stageAutopilotEntrySchema.optional(),
  publish:    stageAutopilotEntrySchema.optional(),
});

export type AutopilotConfig = z.infer<typeof autopilotConfigSchema>;

// ─── Resolved per-Stage config (all fields present after fallback merge) ──────

/**
 * The result of resolveAutopilotConfig.  Every field is guaranteed present
 * because the resolver fills gaps from FALLBACK_BY_STAGE.
 */
export const resolvedStageAutopilotEntrySchema = stageAutopilotEntrySchema.extend({
  maxIterations:    z.number().int().min(0),
  minScore:         z.number().min(0).max(100),
  hardFailThreshold: z.number().min(0).max(100),
  skip:             z.boolean(),
  pauseAfter:       z.boolean(),
});

export type ResolvedStageAutopilotEntry = z.infer<typeof resolvedStageAutopilotEntrySchema>;

// ─── Stage-level fallback defaults ───────────────────────────────────────────

/**
 * FALLBACK_BY_STAGE provides safe defaults used when neither the project nor
 * the track defines a config entry for a particular stage.  These values are
 * intentionally conservative: no skips, no forced pauses, generous iteration
 * budgets for looping stages, 0 for non-looping stages.
 */
export const FALLBACK_BY_STAGE: Record<(typeof STAGES)[number], ResolvedStageAutopilotEntry> = {
  brainstorm: { maxIterations: 0,  minScore: 0,  hardFailThreshold: 0,  skip: false, pauseAfter: false },
  research:   { maxIterations: 3,  minScore: 0,  hardFailThreshold: 0,  skip: false, pauseAfter: false },
  canonical:  { maxIterations: 0,  minScore: 0,  hardFailThreshold: 0,  skip: false, pauseAfter: false },
  production: { maxIterations: 5,  minScore: 0,  hardFailThreshold: 0,  skip: false, pauseAfter: false },
  review:     { maxIterations: 5,  minScore: 90, hardFailThreshold: 40, skip: false, pauseAfter: false },
  assets:     { maxIterations: 0,  minScore: 0,  hardFailThreshold: 0,  skip: false, pauseAfter: false },
  preview:    { maxIterations: 0,  minScore: 0,  hardFailThreshold: 0,  skip: false, pauseAfter: false },
  publish:    { maxIterations: 0,  minScore: 0,  hardFailThreshold: 0,  skip: false, pauseAfter: true  },
};
