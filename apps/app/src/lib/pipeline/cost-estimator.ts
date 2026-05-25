/**
 * Client-side cost estimator — mirrors apps/api/src/lib/pipeline/cost-estimator.ts
 * (T1.9). Pure function, no server-only imports; safe to call from React components.
 *
 * DO NOT add server-only imports here. This file runs in the browser.
 */
import type { Stage, Medium } from '@brighttale/shared/pipeline/inputs';

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

function tokensForStage(
  stage: Stage,
  medium: Medium,
  config: MediaConfig,
): { input: number; output: number; imageCount?: number } {
  switch (stage) {
    case 'brainstorm':
      return { input: 1500, output: 1500 };
    case 'research':
      return { input: 4000, output: 6000 };
    case 'canonical':
      return { input: 2500, output: 2500 };
    case 'production': {
      if (medium === 'blog') {
        const words = config.wordCount ?? 1000;
        return { input: 5000, output: Math.round(words * 1.3) };
      }
      const seconds = config.durationSeconds ?? defaultDurationFor(medium);
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

  const projectConfig = channelDefaults;

  for (const stage of Object.keys(STAGE_BASIS) as Stage[]) {
    if (STAGE_BASIS[stage] === 'project') {
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
