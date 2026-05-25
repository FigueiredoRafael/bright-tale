import { autopilotConfigSchema, type AutopilotConfig } from '@brighttale/shared/schemas/autopilotConfig';

export type DraftFormat = 'blog' | 'video' | 'shorts' | 'podcast';

export interface CanonicalCore {
  thesis: string;
  argument_chain: Array<{ position: string; evidence: string }>;
  emotional_arc: {
    opening_emotion: string;
    turning_point: string;
    closing_emotion: string;
  };
  key_stats: Array<{ stat: string; source: string }>;
  key_quotes: Array<{ quote: string; speaker: string }>;
  cta_subscribe?: string;
  cta_comment_prompt?: string;
}

export function makeCanonicalCore(overrides: Partial<CanonicalCore> = {}): CanonicalCore {
  return {
    thesis:
      'Deep-sea creatures glow because evolution rewards visibility in pitch-dark environments.',
    argument_chain: [
      { position: 'Light is rare below 200m', evidence: 'Photic zone studies show <1% sunlight penetration' },
      { position: 'Survival demands signaling', evidence: 'Bioluminescence appears in 76% of deep-sea species' },
      { position: 'Mating + predation drive expression', evidence: 'Two distinct biochemical pathways evolved independently' },
    ],
    emotional_arc: {
      opening_emotion: 'curiosity',
      turning_point: 'shock',
      closing_emotion: 'wonder',
    },
    key_stats: [{ stat: '76% of deep-sea species glow', source: 'WHOI' }],
    key_quotes: [
      { quote: 'Bioluminescence is the deep ocean lingua franca.', speaker: 'Dr. Edith Widder' },
    ],
    cta_subscribe: 'Subscribe for more marine science deep-dives.',
    cta_comment_prompt: 'What other deep-sea mysteries should we cover?',
    ...overrides,
  };
}

export function makeBlogDraftJson(opts: { body?: string } = {}) {
  const body =
    opts.body ??
    `# Why deep-sea creatures glow without sunlight\n\nThe deep ocean is the largest habitat on Earth and the darkest. **76%** of species below 200m produce some form of light — bioluminescence is the rule, not the exception.\n\n## Why it evolved\n\nLight in the deep ocean is rare, so signaling is rewarded by natural selection.`;
  return {
    blog: {
      full_draft: body,
      meta_title: 'Why deep-sea creatures glow',
      meta_description: 'A survival adaptation, not decoration.',
    },
  };
}

export function makeVideoDraftJson() {
  return {
    title_options: [
      'Why 76% of Deep Sea Animals GLOW (you wont believe why)',
      'The Real Reason Deep Sea Creatures Light Up',
    ],
    script: {
      hook: {
        duration: '0:00-0:10',
        content: 'Imagine an ocean so dark that 76% of its inhabitants make their own light.',
        visual_notes: 'Slow zoom into pitch black, then a sudden bioluminescent jellyfish appears.',
      },
      problem: {
        duration: '0:10-0:30',
        content: 'Below 200 meters, sunlight stops. Survival demands signaling.',
        visual_notes: 'Animated depth chart, photic zone collapse.',
      },
      teaser: {
        duration: '0:30-0:45',
        content: 'But why did this trait evolve in over a hundred independent lineages?',
        visual_notes: 'Phylogenetic tree highlighting bioluminescent branches.',
      },
      chapters: [
        {
          chapter_number: 1,
          title: 'Light as Currency in the Deep',
          duration: '0:45-2:30',
          content: 'In the deep ocean, light is the medium of survival — for mating, predation, and defense.',
          b_roll_suggestions: ['Anglerfish lure footage', 'Firefly squid'],
          key_stat_or_quote: '76% of deep-sea species glow',
        },
        {
          chapter_number: 2,
          title: 'The Independent Evolution Pathways',
          duration: '2:30-5:00',
          content: 'Two distinct biochemical pathways evolved independently — luciferin + luciferase, and photoprotein systems.',
          b_roll_suggestions: ['Lab footage', 'Animated molecular reactions'],
          key_stat_or_quote: 'Edith Widder: "the deep ocean lingua franca"',
        },
      ],
    },
    total_duration_estimate: '7:30',
    teleprompter_script:
      'Imagine an ocean so dark that 76% of its inhabitants make their own light...',
  };
}

export function makeShortsDraftJson() {
  return {
    shorts: [
      {
        short_number: 1,
        title: 'Why deep sea glows',
        hook: '76% of deep-sea species GLOW.',
        script: 'Below 200m, sunlight stops. So evolution rewrote the rules: make your own light.',
        duration: '0:30',
        visual_style: 'text overlay' as const,
        cta: 'Follow for more deep sea facts',
      },
      {
        short_number: 2,
        title: 'The deepest lingua franca',
        hook: 'There is a universal language in the abyss.',
        script: 'Bioluminescence is the deep ocean lingua franca — used for mating, predation, defense.',
        duration: '0:30',
        visual_style: 'b-roll' as const,
        cta: 'Like if this blew your mind',
      },
    ],
  };
}

export function makePodcastDraftJson() {
  return {
    podcast_outline: {
      outline:
        '# Episode: The Abyss That Glows\n\n## Cold open\nA submersible breaks 1000m and the lights cut out — except they do not.\n\n## Act 1: The 76%\nWhy nearly three of every four deep-sea species produce light.\n\n## Act 2: The independent inventions\nTwo evolutionary pathways, same destination.\n\n## Outro\nThe abyss is loud — just not in any frequency you can hear.',
      episode_title: 'The Abyss That Glows',
    },
  };
}

export function makeDraftRow(opts: {
  id?: string;
  type?: DraftFormat;
  title?: string;
  status?: string;
  core?: CanonicalCore | null;
  draftJson?: Record<string, unknown> | null;
}) {
  const type = opts.type ?? 'blog';
  const defaultDraftJson =
    type === 'blog' ? makeBlogDraftJson()
      : type === 'video' ? makeVideoDraftJson()
        : type === 'shorts' ? makeShortsDraftJson()
          : makePodcastDraftJson();
  return {
    id: opts.id ?? 'draft-1',
    type,
    title: opts.title ?? 'Why deep-sea creatures glow without sunlight',
    status: opts.status ?? 'completed',
    canonical_core_json: opts.core === undefined ? makeCanonicalCore() : opts.core,
    draft_json: opts.draftJson === undefined ? defaultDraftJson : opts.draftJson,
  };
}

/**
 * Build a minimal valid AutopilotConfig — useful for asserting that wizard
 * inputs (format, wordCount) propagate into the DraftEngine UI.
 */
export function makeAutopilotConfig(overrides: {
  format?: DraftFormat;
  wordCount?: number;
} = {}): AutopilotConfig {
  return autopilotConfigSchema.parse({
    defaultProvider: 'recommended',
    brainstorm: null,
    research: null,
    canonicalCore: { providerOverride: null, modelOverride: null, personaId: null },
    draft: {
      providerOverride: null,
      modelOverride: null,
      format: overrides.format ?? 'blog',
      wordCount: overrides.wordCount ?? 900,
    },
    review: {
      providerOverride: null,
      modelOverride: null,
      maxIterations: 2,
      autoApproveThreshold: 90,
      hardFailThreshold: 50,
    },
    assets: { providerOverride: null, modelOverride: null, mode: 'skip' },
    preview: { enabled: false },
    publish: { status: 'draft' },
  });
}
