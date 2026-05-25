import { describe, expect, it } from 'vitest';
import {
  estimateProjectCost,
  type AiProviderModel,
  type MediaConfig,
  type TrackSpec,
} from '../cost-estimator';

const catalog: AiProviderModel[] = [
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    inputCostPer1kTokens: 0.003,
    outputCostPer1kTokens: 0.015,
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    inputCostPer1kTokens: 0.0025,
    outputCostPer1kTokens: 0.01,
  },
];

const defaults: MediaConfig = {
  wordCount: 1000,
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
};

describe('estimateProjectCost — single Track', () => {
  it('returns a non-zero total with full breakdown for one blog Track', () => {
    const tracks: TrackSpec[] = [
      { id: 't1', medium: 'blog', config: {} },
    ];
    const out = estimateProjectCost(tracks, defaults, catalog);
    expect(out.currency).toBe('USD');
    expect(out.total).toBeGreaterThan(0);
    expect(out.perTrack.t1).toBeGreaterThan(0);
    // Project-level stages count once, not zero
    expect(out.perStage.brainstorm).toBeGreaterThan(0);
    expect(out.perStage.research).toBeGreaterThan(0);
    expect(out.perStage.canonical).toBeGreaterThan(0);
    // Track-level stages count for the single Track
    expect(out.perStage.production).toBeGreaterThan(0);
    expect(out.perStage.review).toBeGreaterThan(0);
    expect(out.perStage.assets).toBeGreaterThan(0);
    // Preview + publish are free in this model
    expect(out.perStage.preview).toBe(0);
    expect(out.perStage.publish).toBe(0);
  });
});

describe('estimateProjectCost — multi-track aggregation', () => {
  it('total equals sum of project-level stages + every Track stage', () => {
    const tracks: TrackSpec[] = [
      { id: 'blog', medium: 'blog', config: {} },
      { id: 'video', medium: 'video', config: {} },
    ];
    const out = estimateProjectCost(tracks, defaults, catalog);

    const projectStages = out.perStage.brainstorm + out.perStage.research + out.perStage.canonical;
    const trackStages =
      out.perStage.production +
      out.perStage.review +
      out.perStage.assets +
      out.perStage.preview +
      out.perStage.publish;
    const expectedTotal = projectStages + trackStages;
    // Float rounding tolerance
    expect(Math.abs(out.total - Math.round(expectedTotal * 100) / 100)).toBeLessThan(0.02);
    expect(Object.keys(out.perTrack).sort()).toEqual(['blog', 'video']);
  });

  it('two Tracks of the same medium cost roughly 2× the per-Track production', () => {
    const oneTrack = estimateProjectCost(
      [{ id: 'a', medium: 'blog', config: {} }],
      defaults,
      catalog,
    );
    const twoTracks = estimateProjectCost(
      [
        { id: 'a', medium: 'blog', config: {} },
        { id: 'b', medium: 'blog', config: {} },
      ],
      defaults,
      catalog,
    );
    expect(twoTracks.perStage.production).toBeCloseTo(oneTrack.perStage.production * 2, 2);
    // Project-level stages stay flat
    expect(twoTracks.perStage.brainstorm).toBeCloseTo(oneTrack.perStage.brainstorm, 4);
  });
});

describe('estimateProjectCost — channel default vs project override', () => {
  it('a Track config overrides channel defaults for that Track only', () => {
    const tracks: TrackSpec[] = [
      { id: 'short-blog', medium: 'blog', config: { wordCount: 200 } },
      { id: 'long-blog', medium: 'blog', config: { wordCount: 3000 } },
    ];
    const out = estimateProjectCost(tracks, defaults, catalog);
    expect(out.perTrack['long-blog']).toBeGreaterThan(out.perTrack['short-blog']);
  });

  it('falls back to channel defaults when Track config is empty', () => {
    const withTrackConfig = estimateProjectCost(
      [{ id: 't', medium: 'blog', config: { wordCount: 1000 } }],
      defaults,
      catalog,
    );
    const fromDefault = estimateProjectCost(
      [{ id: 't', medium: 'blog', config: {} }],
      defaults,
      catalog,
    );
    expect(withTrackConfig.total).toBeCloseTo(fromDefault.total, 2);
  });
});

describe('estimateProjectCost — model catalog lookup', () => {
  it('uses configured (provider, model) pricing from the catalog', () => {
    const cheapCatalog: AiProviderModel[] = [
      {
        provider: 'anthropic',
        model: 'haiku',
        inputCostPer1kTokens: 0.0008,
        outputCostPer1kTokens: 0.004,
      },
    ];
    const cheapDefaults: MediaConfig = { ...defaults, model: 'haiku' };
    const cheap = estimateProjectCost(
      [{ id: 't', medium: 'blog', config: {} }],
      cheapDefaults,
      cheapCatalog,
    );
    const expensive = estimateProjectCost(
      [{ id: 't', medium: 'blog', config: {} }],
      defaults,
      catalog,
    );
    expect(cheap.total).toBeLessThan(expensive.total);
  });

  it('falls back to DEFAULT_MODEL_PRICE when (provider, model) is unknown', () => {
    const unknownDefaults: MediaConfig = {
      ...defaults,
      provider: 'unknownco',
      model: 'phantom-1',
    };
    const out = estimateProjectCost(
      [{ id: 't', medium: 'blog', config: {} }],
      unknownDefaults,
      catalog,
    );
    // Non-zero — fallback price kicks in
    expect(out.total).toBeGreaterThan(0);
  });
});

describe('estimateProjectCost — per-medium weighting', () => {
  function singleTrack(medium: TrackSpec['medium'], config: MediaConfig = {}) {
    return estimateProjectCost(
      [{ id: 't', medium, config }],
      defaults,
      catalog,
    );
  }

  it('blog production scales with wordCount', () => {
    const small = singleTrack('blog', { wordCount: 500 });
    const big = singleTrack('blog', { wordCount: 5000 });
    expect(big.perStage.production).toBeGreaterThan(small.perStage.production);
  });

  it('video has a higher production cost than shorts by default (longer duration)', () => {
    const video = singleTrack('video');
    const shorts = singleTrack('shorts');
    expect(video.perStage.production).toBeGreaterThan(shorts.perStage.production);
  });

  it('podcast estimates use durationSeconds', () => {
    const short = singleTrack('podcast', { durationSeconds: 600 });
    const long = singleTrack('podcast', { durationSeconds: 3600 });
    expect(long.perStage.production).toBeGreaterThan(short.perStage.production);
  });

  it('all four media produce non-zero estimates', () => {
    for (const medium of ['blog', 'video', 'shorts', 'podcast'] as const) {
      const out = singleTrack(medium);
      expect(out.total).toBeGreaterThan(0);
    }
  });
});

describe('estimateProjectCost — purity', () => {
  it('does not mutate its inputs', () => {
    const tracks: TrackSpec[] = [
      { id: 't1', medium: 'blog', config: { wordCount: 1500 } },
    ];
    const tracksSnapshot = JSON.stringify(tracks);
    const defaultsSnapshot = JSON.stringify(defaults);
    const catalogSnapshot = JSON.stringify(catalog);

    estimateProjectCost(tracks, defaults, catalog);

    expect(JSON.stringify(tracks)).toBe(tracksSnapshot);
    expect(JSON.stringify(defaults)).toBe(defaultsSnapshot);
    expect(JSON.stringify(catalog)).toBe(catalogSnapshot);
  });

  it('is deterministic — two calls with same args return identical result', () => {
    const tracks: TrackSpec[] = [{ id: 't1', medium: 'blog', config: {} }];
    const first = estimateProjectCost(tracks, defaults, catalog);
    const second = estimateProjectCost(tracks, defaults, catalog);
    expect(first).toEqual(second);
  });
});
