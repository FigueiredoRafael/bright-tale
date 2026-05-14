/**
 * T1.9 — Pure cost estimator for the multi-track pipeline wizard.
 *
 * Computes a USD cost preview for a proposed project configuration without
 * touching the database. Callers supply:
 *   - tracks       : the media tracks the user has selected
 *   - channelDefaults : channel-level MediaConfig (word count, duration, etc.)
 *   - modelCatalog : flat list of AiProviderModel rows (fetched once by the
 *                    caller; the estimator is pure given these inputs)
 *
 * Token estimates are intentionally conservative rounded-up values derived from
 * observed runs. Update TOKEN_BUDGETS as empirical data accumulates.
 *
 * Referenced by: T5.3 (wizard cost preview), T7.2 (live cost badges).
 */

import type { Stage } from '@brighttale/shared/pipeline/inputs.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export type Medium = 'blog' | 'video' | 'shorts' | 'podcast';

export type TrackId = string;

/**
 * Matches the shape of a future `ai_provider_models` DB table row.
 * Fields mirror the existing `ai/pricing.ts` ModelPrice pattern extended with
 * provider + model identity so rows can be looked up by (provider, model).
 */
export interface AiProviderModel {
  provider: string;
  model: string;
  /** USD cost per 1 million input tokens */
  inputCostPerMillion: number;
  /** USD cost per 1 million output tokens */
  outputCostPerMillion: number;
}

/**
 * Per-medium configuration the channel supplies as defaults.
 * Only the fields the estimator actually uses are required; callers may pass
 * a richer object (extra keys are ignored).
 */
export interface MediaConfig {
  /** Target word count for blog medium (default 1500) */
  blogWordCount?: number;
  /** Target video duration in minutes (default 10) */
  videoDurationMin?: number;
  /** Target shorts duration in seconds (default 60) */
  shortsDurationSec?: number;
  /** Target podcast duration in minutes (default 30) */
  podcastDurationMin?: number;
  /** Provider to use for cost look-up (default 'anthropic') */
  provider?: string;
  /** Model to use for cost look-up (default 'claude-sonnet-4-5-20250514') */
  model?: string;
}

/** One track the user has requested in the wizard. */
export interface TrackSpec {
  /** Client-side identifier for the track (can be any stable string). */
  id: TrackId;
  medium: Medium;
  /** Per-track overrides; merged over channelDefaults. */
  config?: Partial<MediaConfig>;
}

export interface CostBreakdown {
  /** Sum of all per-track costs, in USD. */
  total: number;
  /** Cost per track id (production + review + assets + publish). */
  perTrack: Record<TrackId, number>;
  /** Aggregated cost per stage across all tracks (shared stages split evenly). */
  perStage: Record<Stage, number>;
  currency: 'USD';
}

// ─── Internal constants ───────────────────────────────────────────────────────

/**
 * Estimated token budget per stage × medium.
 * `input` and `output` are in thousands of tokens (multiplied by 1000 below).
 * Shared stages (brainstorm / research / canonical / preview) are independent
 * of the medium and are estimated once per project then divided by track count.
 */
interface TokenBudget {
  inputK: number;  // input tokens / 1000
  outputK: number; // output tokens / 1000
}

/** Shared project-level stages (not per-track). */
const SHARED_STAGE_BUDGETS: Partial<Record<Stage, TokenBudget>> = {
  brainstorm: { inputK: 4, outputK: 2 },
  research: { inputK: 20, outputK: 8 },
  canonical: { inputK: 15, outputK: 6 },
  preview: { inputK: 2, outputK: 1 },
};

/**
 * Per-track stage budgets at baseline (1500-word blog, 10-min video, etc.).
 * Scaled by a size multiplier derived from the track's MediaConfig.
 */
const PER_TRACK_STAGE_BUDGETS: Partial<Record<Stage, TokenBudget>> = {
  // production varies by medium — computed dynamically via PRODUCTION_BASE
  review: { inputK: 12, outputK: 4 },
  assets: { inputK: 8, outputK: 2 },
  publish: { inputK: 2, outputK: 0.5 },
};

/**
 * Production stage baseline budgets per medium at reference sizes:
 *   blog=1500 words, video=10 min, shorts=60 sec, podcast=30 min.
 */
const PRODUCTION_BASE: Record<Medium, TokenBudget> = {
  blog: { inputK: 18, outputK: 10 },
  video: { inputK: 22, outputK: 14 },
  shorts: { inputK: 10, outputK: 5 },
  podcast: { inputK: 20, outputK: 12 },
};

const REFERENCE_SIZES: Record<Medium, { wordCount?: number; durationMin?: number; durationSec?: number }> = {
  blog: { wordCount: 1500 },
  video: { durationMin: 10 },
  shorts: { durationSec: 60 },
  podcast: { durationMin: 30 },
};

const DEFAULT_PROVIDER = 'anthropic';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250514';

/** Fallback price when model is not found in catalog (treat as zero cost). */
const UNKNOWN_MODEL_PRICE: AiProviderModel = {
  provider: '__unknown__',
  model: '__unknown__',
  inputCostPerMillion: 0,
  outputCostPerMillion: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findModel(
  catalog: AiProviderModel[],
  provider: string,
  model: string,
): AiProviderModel {
  return (
    catalog.find((m) => m.provider === provider && m.model === model) ??
    UNKNOWN_MODEL_PRICE
  );
}

function tokenCostUsd(budget: TokenBudget, price: AiProviderModel): number {
  const inputCost = (budget.inputK / 1000) * price.inputCostPerMillion;
  const outputCost = (budget.outputK / 1000) * price.outputCostPerMillion;
  return inputCost + outputCost;
}

/**
 * Returns a scale factor relative to the reference content size for a medium.
 * e.g. a 3000-word blog is 2× the 1500-word reference.
 */
function productionScale(medium: Medium, config: MediaConfig): number {
  const ref = REFERENCE_SIZES[medium];
  switch (medium) {
    case 'blog': {
      const words = config.blogWordCount ?? ref.wordCount!;
      return words / ref.wordCount!;
    }
    case 'video': {
      const mins = config.videoDurationMin ?? ref.durationMin!;
      return mins / ref.durationMin!;
    }
    case 'shorts': {
      const secs = config.shortsDurationSec ?? ref.durationSec!;
      return secs / ref.durationSec!;
    }
    case 'podcast': {
      const mins = config.podcastDurationMin ?? ref.durationMin!;
      return mins / ref.durationMin!;
    }
  }
}

function mergeConfig(channel: MediaConfig, override?: Partial<MediaConfig>): MediaConfig {
  return { ...channel, ...override };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Estimate the total USD cost for a proposed multi-track project.
 *
 * Pure — no DB calls. The caller is responsible for fetching `modelCatalog`
 * (typically from `ai_provider_models` via `GET /api/ai/models`) and
 * `channelDefaults` from the channel record before calling this function.
 *
 * @param tracks         Ordered list of requested media tracks.
 * @param channelDefaults Channel-level defaults (word count, duration, model…).
 * @param modelCatalog   Rows from the `ai_provider_models` table (or equivalent).
 */
export function estimateProjectCost(
  tracks: TrackSpec[],
  channelDefaults: MediaConfig,
  modelCatalog: AiProviderModel[],
): CostBreakdown {
  const perTrack: Record<TrackId, number> = {};
  const perStage: Partial<Record<Stage, number>> = {};

  const trackCount = Math.max(tracks.length, 1);

  // ── 1. Shared project-level stages ────────────────────────────────────────
  // These run once regardless of track count; we divide their cost evenly
  // across tracks when contributing to perStage, but they do NOT add to
  // perTrack (the caller can surface them separately as "shared cost").
  const sharedProvider = channelDefaults.provider ?? DEFAULT_PROVIDER;
  const sharedModel = channelDefaults.model ?? DEFAULT_MODEL;
  const sharedPrice = findModel(modelCatalog, sharedProvider, sharedModel);

  for (const [stage, budget] of Object.entries(SHARED_STAGE_BUDGETS) as Array<[Stage, TokenBudget]>) {
    const stageCost = tokenCostUsd(budget, sharedPrice);
    perStage[stage] = (perStage[stage] ?? 0) + stageCost;
    // Shared cost is folded into perTrack proportionally (each track "owns"
    // its share of the project overhead).
    const costPerTrack = stageCost / trackCount;
    for (const t of tracks) {
      perTrack[t.id] = (perTrack[t.id] ?? 0) + costPerTrack;
    }
  }

  // ── 2. Per-track stages ───────────────────────────────────────────────────
  for (const track of tracks) {
    const cfg = mergeConfig(channelDefaults, track.config);
    const provider = cfg.provider ?? DEFAULT_PROVIDER;
    const model = cfg.model ?? DEFAULT_MODEL;
    const price = findModel(modelCatalog, provider, model);

    // Production (medium-aware, size-scaled)
    const base = PRODUCTION_BASE[track.medium];
    const scale = productionScale(track.medium, cfg);
    const scaledBudget: TokenBudget = {
      inputK: base.inputK * scale,
      outputK: base.outputK * scale,
    };
    const productionCost = tokenCostUsd(scaledBudget, price);
    perStage['production'] = (perStage['production'] ?? 0) + productionCost;
    perTrack[track.id] = (perTrack[track.id] ?? 0) + productionCost;

    // Fixed-ish per-track stages (review, assets, publish)
    for (const [stage, budget] of Object.entries(PER_TRACK_STAGE_BUDGETS) as Array<[Stage, TokenBudget]>) {
      const stageCost = tokenCostUsd(budget, price);
      perStage[stage] = (perStage[stage] ?? 0) + stageCost;
      perTrack[track.id] = (perTrack[track.id] ?? 0) + stageCost;
    }
  }

  // Ensure every Stage key is present (fill zeros for stages not touched).
  const allStages: Stage[] = [
    'brainstorm', 'research', 'canonical', 'production',
    'review', 'assets', 'preview', 'publish',
  ];
  const fullPerStage = Object.fromEntries(
    allStages.map((s) => [s, perStage[s] ?? 0]),
  ) as Record<Stage, number>;

  const total = Object.values(perTrack).reduce((sum, v) => sum + v, 0);

  return {
    total,
    perTrack,
    perStage: fullPerStage,
    currency: 'USD',
  };
}
