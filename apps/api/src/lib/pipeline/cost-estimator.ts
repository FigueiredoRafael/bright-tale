/**
 * cost-estimator — pure estimator for multi-track project cost.
 *
 * Used by:
 *   - Wizard cost preview (T5.3) — before the user commits.
 *   - "Spent so far" / "Est. remaining" badges in the Focus sidebar (T7.2).
 *
 * Cost model: for each Track + Stage we know a token volume (input + output)
 * and a fixed unit cost (images, dollars). We look up per-token pricing in
 * `modelCatalog` for the configured (provider, model); if absent we fall
 * back to `DEFAULT_MODEL_PRICE` so unfamiliar models still produce a
 * non-zero estimate (cost preview must never crash on a typo).
 *
 * The estimator is intentionally rough — it's a planning aid, not an
 * accounting document. Real costs are accumulated by the orchestrator from
 * actual usage events (Axiom).
 */
import type { Stage } from '@brighttale/shared/pipeline/inputs';
import type { Medium } from '@brighttale/shared/pipeline/inputs';

export interface MediaConfig {
  wordCount?: number;
  durationSeconds?: number;
  provider?: string;
  model?: string;
  maxReviewIterations?: number;
  assetImageCount?: number;
}

export interface TrackSpec {
  id: string;
  medium: Medium;
  config: MediaConfig;
}

export interface AiProviderModel {
  provider: string;
  model: string;
  /** USD per 1,000 input tokens. */
  inputCostPer1kTokens: number;
  /** USD per 1,000 output tokens. */
  outputCostPer1kTokens: number;
}

export interface CostBreakdown {
  total: number;
  perTrack: Record<string, number>;
  perStage: Record<Stage, number>;
  currency: 'USD';
}

const DEFAULT_MODEL_PRICE = {
  inputCostPer1kTokens: 0.003,
  outputCostPer1kTokens: 0.015,
} as const;

const DEFAULT_IMAGE_PRICE_USD = 0.04;

/**
 * Per-stage scoping rule:
 *   - 'project' stages are shared across all tracks (brainstorm, research,
 *     canonical). They count once toward perStage and once toward the total,
 *     and are NOT charged to any individual perTrack bucket.
 *   - 'track' stages run per Track (production, review, assets, preview,
 *     publish). They count once per Track toward perStage, perTrack, and
 *     the total.
 */
const STAGE_BASIS: Record<Stage, 'project' | 'track'> = {
  brainstorm: 'project',
  research: 'project',
  canonical: 'project',
  production: 'track',
  review: 'track',
  assets: 'track',
  preview: 'track',
  publish: 'track',
};

function tokensForStage(stage: Stage, medium: Medium, config: MediaConfig): {
  input: number;
  output: number;
  imageCount?: number;
} {
  switch (stage) {
    case 'brainstorm':
      return { input: 1500, output: 1500 };
    case 'research':
      return { input: 4000, output: 6000 };
    case 'canonical':
      return { input: 2500, output: 2500 };
    case 'production': {
      // Length-based: blog uses wordCount, video/shorts/podcast use duration.
      if (medium === 'blog') {
        const words = config.wordCount ?? 1000;
        // ~1.3 tokens per word output, 5k context tokens input.
        return { input: 5000, output: Math.round(words * 1.3) };
      }
      const seconds = config.durationSeconds ?? defaultDurationFor(medium);
      // Spoken script ≈ 2.5 words/sec → tokens ≈ 3.3/sec.
      return { input: 4000, output: Math.round(seconds * 3.3) };
    }
    case 'review': {
      const iters = config.maxReviewIterations ?? 2;
      return { input: 4000 * iters, output: 2000 * iters };
    }
    case 'assets': {
      const count =
        config.assetImageCount ??
        (medium === 'blog' ? 3 : medium === 'podcast' ? 1 : 1);
      // Image-gen has near-zero LLM tokens; the cost is per-image flat.
      return { input: 200, output: 200, imageCount: count };
    }
    case 'preview':
    case 'publish':
      return { input: 0, output: 0 };
  }
}

function defaultDurationFor(medium: Medium): number {
  switch (medium) {
    case 'video':
      return 600;
    case 'shorts':
      return 60;
    case 'podcast':
      return 1800;
    case 'blog':
      return 0;
  }
}

function lookupModelPrice(
  catalog: AiProviderModel[],
  provider: string | undefined,
  model: string | undefined,
): { inputCostPer1kTokens: number; outputCostPer1kTokens: number } {
  if (!provider || !model) return DEFAULT_MODEL_PRICE;
  const hit = catalog.find((m) => m.provider === provider && m.model === model);
  return hit ?? DEFAULT_MODEL_PRICE;
}

function costForStage(
  stage: Stage,
  medium: Medium,
  config: MediaConfig,
  catalog: AiProviderModel[],
): number {
  const { input, output, imageCount } = tokensForStage(stage, medium, config);
  const price = lookupModelPrice(catalog, config.provider, config.model);
  const tokenCost =
    (input / 1000) * price.inputCostPer1kTokens +
    (output / 1000) * price.outputCostPer1kTokens;
  const imageCost = (imageCount ?? 0) * DEFAULT_IMAGE_PRICE_USD;
  return round2(tokenCost + imageCost);
}

function mergeConfig(channelDefaults: MediaConfig, override: MediaConfig): MediaConfig {
  return { ...channelDefaults, ...override };
}

function emptyPerStage(): Record<Stage, number> {
  return {
    brainstorm: 0,
    research: 0,
    canonical: 0,
    production: 0,
    review: 0,
    assets: 0,
    preview: 0,
    publish: 0,
  };
}

export function estimateProjectCost(
  tracks: TrackSpec[],
  channelDefaults: MediaConfig,
  modelCatalog: AiProviderModel[],
): CostBreakdown {
  const perTrack: Record<string, number> = {};
  const perStage = emptyPerStage();
  let total = 0;

  // Pick a representative config for project-level stages. The wizard hasn't
  // committed per-Track configs at preview time, so we use channelDefaults
  // (which the wizard has) for shared stages — production/review/assets all
  // still use the merged per-Track config below.
  const projectConfig = channelDefaults;

  for (const stage of Object.keys(STAGE_BASIS) as Stage[]) {
    if (STAGE_BASIS[stage] === 'project') {
      // Use the first Track's medium as a stand-in for shared stages; these
      // stages are medium-agnostic in practice, but tokensForStage takes a
      // Medium arg so we pass something coherent.
      const referenceMedium = tracks[0]?.medium ?? 'blog';
      const cost = costForStage(stage, referenceMedium, projectConfig, modelCatalog);
      perStage[stage] += cost;
      total += cost;
    }
  }

  for (const track of tracks) {
    const merged = mergeConfig(channelDefaults, track.config);
    let trackTotal = 0;
    for (const stage of Object.keys(STAGE_BASIS) as Stage[]) {
      if (STAGE_BASIS[stage] !== 'track') continue;
      const cost = costForStage(stage, track.medium, merged, modelCatalog);
      perStage[stage] += cost;
      trackTotal += cost;
    }
    perTrack[track.id] = round2(trackTotal);
    total += trackTotal;
  }

  return {
    total: round2(total),
    perTrack,
    perStage: roundPerStage(perStage),
    currency: 'USD',
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPerStage(perStage: Record<Stage, number>): Record<Stage, number> {
  const out = emptyPerStage();
  for (const stage of Object.keys(perStage) as Stage[]) {
    out[stage] = round2(perStage[stage]);
  }
  return out;
}
