import { createIdeaSchema } from '@brighttale/shared/schemas/ideas';

export interface BrainstormIdeaFixture {
  id: string;
  idea_id: string;
  title: string;
  core_tension: string;
  target_audience: string;
  verdict: 'viable' | 'weak' | 'experimental';
  discovery_data?: string;
}

function buildIdea(overrides: Partial<BrainstormIdeaFixture> & { id: string }): BrainstormIdeaFixture {
  const base = {
    idea_id: `BC-IDEA-${overrides.id.replace(/\D/g, '').padStart(3, '0')}`,
    title: 'Default Idea Title For Test',
    core_tension: 'Tension between curiosity and analysis paralysis.',
    target_audience: 'Brazilian science-curious adults 25-45',
    verdict: 'viable' as const,
    ...overrides,
  };
  const parsed = createIdeaSchema.parse({
    idea_id: base.idea_id,
    title: base.title,
    core_tension: base.core_tension,
    target_audience: base.target_audience,
    verdict: base.verdict,
  });
  return {
    id: overrides.id,
    idea_id: parsed.idea_id ?? base.idea_id,
    title: parsed.title,
    core_tension: parsed.core_tension,
    target_audience: parsed.target_audience,
    verdict: parsed.verdict,
    discovery_data: base.discovery_data,
  };
}

export function makeBrainstormIdeas(): BrainstormIdeaFixture[] {
  return [
    buildIdea({
      id: 'idea-1',
      title: 'Why deep-sea creatures glow without sunlight',
      core_tension: 'Light without a sun source contradicts terrestrial intuition.',
      target_audience: 'Curious science fans new to marine biology',
      verdict: 'viable',
      discovery_data: JSON.stringify({
        angle: 'Bioluminescence as evolutionary survival',
        repurposing: ['shorts', 'podcast-segment'],
        risk_flags: ['niche audience'],
      }),
    }),
    buildIdea({
      id: 'idea-2',
      title: 'The neuroscience of nostalgia in adults',
      core_tension: 'Memories warp over time but feel sharper than the present.',
      target_audience: 'Millennials reflecting on the early 2000s',
      verdict: 'weak',
    }),
    buildIdea({
      id: 'idea-3',
      title: 'Quantum computing explained with playing cards',
      core_tension: 'Familiar metaphor for a counterintuitive technology.',
      target_audience: 'High schoolers and curious adults',
      verdict: 'experimental',
    }),
  ];
}

export function makeBrainstormSession(opts: {
  id?: string;
  recommendedPick?: string;
  rationale?: string;
  contentWarning?: string;
} = {}) {
  return {
    id: opts.id ?? 'bs-session-1',
    input_json: { topic: 'deep sea phenomena' },
    recommendation_json: {
      pick: opts.recommendedPick ?? 'Why deep-sea creatures glow without sunlight',
      rationale:
        opts.rationale ??
        'High visual potential, broad curiosity, fits channel niche, low controversy risk.',
      content_warning: opts.contentWarning,
    },
  };
}
