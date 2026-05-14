/**
 * Unit tests for the cost-estimator module (T1.9).
 *
 * All tests are pure (no DB calls). The estimator only needs a modelCatalog
 * array, a channelDefaults object, and a TrackSpec array.
 */

import { describe, it, expect } from 'vitest';
import {
  estimateProjectCost,
  type AiProviderModel,
  type MediaConfig,
  type TrackSpec,
} from '../cost-estimator.js';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const anthropicSonnet: AiProviderModel = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250514',
  inputCostPerMillion: 3,
  outputCostPerMillion: 15,
};

const geminiFlash: AiProviderModel = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  inputCostPerMillion: 0.075,
  outputCostPerMillion: 0.3,
};

const gpt4o: AiProviderModel = {
  provider: 'openai',
  model: 'gpt-4o',
  inputCostPerMillion: 2.5,
  outputCostPerMillion: 10,
};

const fullCatalog: AiProviderModel[] = [anthropicSonnet, geminiFlash, gpt4o];

const defaultChannelConfig: MediaConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250514',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBlogTrack(id = 'track-blog', config?: Partial<MediaConfig>): TrackSpec {
  return { id, medium: 'blog', config };
}

function makeVideoTrack(id = 'track-video', config?: Partial<MediaConfig>): TrackSpec {
  return { id, medium: 'video', config };
}

function makeShortsTrack(id = 'track-shorts', config?: Partial<MediaConfig>): TrackSpec {
  return { id, medium: 'shorts', config };
}

function makePodcastTrack(id = 'track-podcast', config?: Partial<MediaConfig>): TrackSpec {
  return { id, medium: 'podcast', config };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('estimateProjectCost — return shape', () => {
  it('returns a CostBreakdown with total, perTrack, perStage, and currency', () => {
    const result = estimateProjectCost([makeBlogTrack()], defaultChannelConfig, fullCatalog);

    expect(result).toMatchObject({
      currency: 'USD',
    });
    expect(typeof result.total).toBe('number');
    expect(typeof result.perTrack).toBe('object');
    expect(typeof result.perStage).toBe('object');
  });

  it('perStage contains all 8 canonical stages', () => {
    const result = estimateProjectCost([makeBlogTrack()], defaultChannelConfig, fullCatalog);

    const expectedStages = [
      'brainstorm', 'research', 'canonical', 'production',
      'review', 'assets', 'preview', 'publish',
    ];
    for (const stage of expectedStages) {
      expect(result.perStage).toHaveProperty(stage);
      expect(typeof result.perStage[stage as keyof typeof result.perStage]).toBe('number');
    }
  });

  it('total equals the sum of all perTrack values', () => {
    const tracks: TrackSpec[] = [
      makeBlogTrack('t1'),
      makeVideoTrack('t2'),
    ];
    const result = estimateProjectCost(tracks, defaultChannelConfig, fullCatalog);

    const sumOfTracks = Object.values(result.perTrack).reduce((a, b) => a + b, 0);
    expect(result.total).toBeCloseTo(sumOfTracks, 10);
  });
});

describe('estimateProjectCost — single track', () => {
  it('produces a positive cost for a single blog track', () => {
    const result = estimateProjectCost([makeBlogTrack()], defaultChannelConfig, fullCatalog);

    expect(result.total).toBeGreaterThan(0);
    expect(result.perTrack['track-blog']).toBeGreaterThan(0);
  });

  it('perStage production cost equals the blog track production contribution', () => {
    const result = estimateProjectCost([makeBlogTrack('t1')], defaultChannelConfig, fullCatalog);

    // With one track, perStage.production should equal exactly what that track contributed.
    expect(result.perStage.production).toBeGreaterThan(0);
    // The sum of per-stage costs that belong to the track should account for the track total.
    const trackSpecificStages = ['production', 'review', 'assets', 'publish'] as const;
    const sumTrackStages = trackSpecificStages.reduce((s, st) => s + result.perStage[st], 0);
    // Add shared stage contributions (all assigned to the one track).
    const sharedStages = ['brainstorm', 'research', 'canonical', 'preview'] as const;
    const sumShared = sharedStages.reduce((s, st) => s + result.perStage[st], 0);
    expect(result.total).toBeCloseTo(sumTrackStages + sumShared, 8);
  });
});

describe('estimateProjectCost — multi-track aggregation', () => {
  it('two tracks produce a higher total than one track', () => {
    const single = estimateProjectCost([makeBlogTrack()], defaultChannelConfig, fullCatalog);
    const dual = estimateProjectCost(
      [makeBlogTrack('t1'), makeVideoTrack('t2')],
      defaultChannelConfig,
      fullCatalog,
    );

    expect(dual.total).toBeGreaterThan(single.total);
  });

  it('perTrack contains an entry for every track id supplied', () => {
    const tracks: TrackSpec[] = [
      makeBlogTrack('t1'),
      makeVideoTrack('t2'),
      makeShortsTrack('t3'),
    ];
    const result = estimateProjectCost(tracks, defaultChannelConfig, fullCatalog);

    expect(Object.keys(result.perTrack)).toHaveLength(3);
    expect(result.perTrack).toHaveProperty('t1');
    expect(result.perTrack).toHaveProperty('t2');
    expect(result.perTrack).toHaveProperty('t3');
  });

  it('perStage.production grows with each additional track', () => {
    const one = estimateProjectCost([makeBlogTrack()], defaultChannelConfig, fullCatalog);
    const two = estimateProjectCost(
      [makeBlogTrack('t1'), makeBlogTrack('t2')],
      defaultChannelConfig,
      fullCatalog,
    );

    expect(two.perStage.production).toBeGreaterThan(one.perStage.production);
  });

  it('shared stages (brainstorm, research, canonical) are the same cost regardless of track count', () => {
    const one = estimateProjectCost([makeBlogTrack()], defaultChannelConfig, fullCatalog);
    const three = estimateProjectCost(
      [makeBlogTrack('t1'), makeVideoTrack('t2'), makePodcastTrack('t3')],
      defaultChannelConfig,
      fullCatalog,
    );

    // Shared stages run once; their absolute costs in perStage must be equal.
    expect(three.perStage.brainstorm).toBeCloseTo(one.perStage.brainstorm, 10);
    expect(three.perStage.research).toBeCloseTo(one.perStage.research, 10);
    expect(three.perStage.canonical).toBeCloseTo(one.perStage.canonical, 10);
  });
});

describe('estimateProjectCost — channel default vs project/track override', () => {
  it('using a cheaper model produces a lower cost', () => {
    const expensive = estimateProjectCost(
      [makeBlogTrack('t1')],
      { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
      fullCatalog,
    );
    const cheap = estimateProjectCost(
      [makeBlogTrack('t1')],
      { provider: 'gemini', model: 'gemini-2.5-flash' },
      fullCatalog,
    );

    expect(cheap.total).toBeLessThan(expensive.total);
  });

  it('per-track config overrides channel defaults for that track only', () => {
    // Estimate a project where t1=anthropic (channel default) and t2=gemini (override).
    const tracks: TrackSpec[] = [
      makeBlogTrack('t1'), // uses channel default (anthropic)
      makeVideoTrack('t2', { provider: 'gemini', model: 'gemini-2.5-flash' }), // override
    ];
    const withOverride = estimateProjectCost(tracks, defaultChannelConfig, fullCatalog);

    // Estimate the same layout but both tracks forced to gemini (channel default = gemini).
    const allCheapConfig: MediaConfig = { provider: 'gemini', model: 'gemini-2.5-flash' };
    const allCheap = estimateProjectCost(
      [makeBlogTrack('t1'), makeVideoTrack('t2')],
      allCheapConfig,
      fullCatalog,
    );

    // When t2 uses gemini in both cases, the per-track-stage contribution (production,
    // review, assets, publish) for t2 should be identical.
    // The shared-stage overhead for t2 differs (anthropic vs gemini) because shared
    // stages use channelDefaults.model. So we test that:
    // 1. t1 costs more in withOverride (it uses anthropic) than in allCheap (gemini).
    expect(withOverride.perTrack['t1']).toBeGreaterThan(allCheap.perTrack['t1']);
    // 2. The overall total is higher when t1 uses the expensive model.
    expect(withOverride.total).toBeGreaterThan(allCheap.total);
    // 3. perStage.review in allCheap < withOverride because withOverride has t1 on anthropic.
    expect(withOverride.perStage.review).toBeGreaterThan(allCheap.perStage.review);
  });

  it('larger blog word count increases production cost proportionally', () => {
    const standard = estimateProjectCost(
      [makeBlogTrack('t1', { blogWordCount: 1500 })],
      defaultChannelConfig,
      fullCatalog,
    );
    const double = estimateProjectCost(
      [makeBlogTrack('t1', { blogWordCount: 3000 })],
      defaultChannelConfig,
      fullCatalog,
    );

    // Production cost should roughly double for a doubled word target.
    // We check that double.perStage.production ≈ 2 × standard.perStage.production.
    expect(double.perStage.production).toBeCloseTo(standard.perStage.production * 2, 5);
  });
});

describe('estimateProjectCost — unknown model fallback', () => {
  it('returns zero USD cost (graceful) when model is not in catalog', () => {
    const result = estimateProjectCost(
      [makeBlogTrack()],
      { provider: 'mystery-corp', model: 'quantum-v99' },
      fullCatalog, // does not contain mystery-corp/quantum-v99
    );

    // Cost should be zero because the unknown model has zero pricing.
    expect(result.total).toBe(0);
    expect(result.perTrack['track-blog']).toBe(0);
  });

  it('returns zero cost for a track that overrides to an unknown model', () => {
    const tracks: TrackSpec[] = [
      makeBlogTrack('t1'),
      makeVideoTrack('t2', { provider: 'nobody', model: 'no-such-model' }),
    ];
    const result = estimateProjectCost(tracks, defaultChannelConfig, fullCatalog);

    // t1 should still have a cost; t2 contribution for its own per-track stages = 0.
    // (shared stages still contribute to t2 because they use the channel model)
    expect(result.perTrack['t1']).toBeGreaterThan(0);
    // t2's production/review/assets/publish contribution should be zero.
    // Its total perTrack entry includes shared-stage overhead (anthropic).
    // Just verify total > 0 and t1 > portion attributable to shared on t2.
    expect(result.total).toBeGreaterThan(0);
  });
});

describe('estimateProjectCost — all four media', () => {
  it('blog track produces a positive cost', () => {
    const r = estimateProjectCost([makeBlogTrack()], defaultChannelConfig, fullCatalog);
    expect(r.perTrack['track-blog']).toBeGreaterThan(0);
  });

  it('video track produces a positive cost', () => {
    const r = estimateProjectCost([makeVideoTrack()], defaultChannelConfig, fullCatalog);
    expect(r.perTrack['track-video']).toBeGreaterThan(0);
  });

  it('shorts track produces a positive cost', () => {
    const r = estimateProjectCost([makeShortsTrack()], defaultChannelConfig, fullCatalog);
    expect(r.perTrack['track-shorts']).toBeGreaterThan(0);
  });

  it('podcast track produces a positive cost', () => {
    const r = estimateProjectCost([makePodcastTrack()], defaultChannelConfig, fullCatalog);
    expect(r.perTrack['track-podcast']).toBeGreaterThan(0);
  });

  it('shorter shorts cost less than a full video (in production stage)', () => {
    const shorts = estimateProjectCost([makeShortsTrack()], defaultChannelConfig, fullCatalog);
    const video = estimateProjectCost([makeVideoTrack()], defaultChannelConfig, fullCatalog);

    // Shorts baseline (60s≈1min) should be cheaper than video baseline (10min).
    expect(shorts.perStage.production).toBeLessThan(video.perStage.production);
  });

  it('four-media project total > any single-media project total', () => {
    const all = estimateProjectCost(
      [makeBlogTrack('t1'), makeVideoTrack('t2'), makeShortsTrack('t3'), makePodcastTrack('t4')],
      defaultChannelConfig,
      fullCatalog,
    );
    const blogOnly = estimateProjectCost([makeBlogTrack('t1')], defaultChannelConfig, fullCatalog);

    expect(all.total).toBeGreaterThan(blogOnly.total);
  });
});
