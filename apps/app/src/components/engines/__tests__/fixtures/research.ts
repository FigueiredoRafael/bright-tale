export interface ResearchFindings {
  research_summary: string;
  idea_validation: {
    core_claim_verified: boolean;
    evidence_strength: 'weak' | 'moderate' | 'strong';
    confidence_score: number;
    validation_notes: string;
  };
  sources: Array<{
    source_id: string;
    title: string;
    url: string;
    type: string;
    credibility: 'high' | 'medium' | 'low';
    key_insight: string;
    quote_excerpt?: string;
    date_published?: string;
  }>;
  statistics: Array<{
    stat_id: string;
    claim: string;
    figure: string;
    source_id: string;
    context: string;
  }>;
  expert_quotes: Array<{
    quote_id: string;
    quote: string;
    author: string;
    credentials: string;
    source_id: string;
  }>;
  counterarguments: Array<{
    counter_id: string;
    point: string;
    strength: 'high' | 'medium' | 'low';
    rebuttal: string;
    source_id: string;
  }>;
  knowledge_gaps: string[];
  refined_angle: {
    should_pivot: boolean;
    updated_title: string;
    updated_hook: string;
    angle_notes: string;
    recommendation: string;
  };
  seo: { primary_keyword: string };
}

export function makeResearchFindings(overrides: Partial<ResearchFindings> = {}): ResearchFindings {
  return {
    research_summary:
      'Deep-sea bioluminescence is well-documented across multiple lineages and serves several survival functions.',
    idea_validation: {
      core_claim_verified: true,
      evidence_strength: 'strong',
      confidence_score: 0.86,
      validation_notes: 'Multiple peer-reviewed sources confirm the survival hypothesis.',
    },
    sources: [
      {
        source_id: 'src-1',
        title: 'Bioluminescence in Marine Animals',
        url: 'https://example.org/marine-biolum',
        type: 'source',
        credibility: 'high',
        key_insight: 'Over 76% of deep-sea organisms produce some form of light.',
        quote_excerpt: 'The deep ocean is the largest habitat on Earth and the darkest.',
        date_published: '2024-02-10',
      },
    ],
    statistics: [
      {
        stat_id: 'stat-1',
        claim: 'of deep-sea organisms exhibit bioluminescence',
        figure: '76%',
        source_id: 'src-1',
        context: 'Across surveyed species below 200m depth in the Pacific.',
      },
    ],
    expert_quotes: [
      {
        quote_id: 'q-1',
        quote: 'Bioluminescence is the deep ocean lingua franca for communication.',
        author: 'Dr. Edith Widder',
        credentials: 'Marine biologist, ORCA',
        source_id: 'src-1',
      },
    ],
    counterarguments: [
      {
        counter_id: 'cn-1',
        point: 'Some argue bioluminescence may be evolutionarily incidental.',
        strength: 'low',
        rebuttal: 'Multiple independent evolution events suggest selective pressure.',
        source_id: 'src-1',
      },
    ],
    knowledge_gaps: [
      'Energetic cost of luminescence in low-prey environments',
      'Long-term effects of light pollution on deep-sea fauna',
    ],
    refined_angle: {
      should_pivot: false,
      updated_title: 'Why the deep sea glows: evolutionary pressure as the answer',
      updated_hook: '76% of deep-sea life lights up — for survival, not decoration.',
      angle_notes: 'Keep the survival framing, lean on the 76% statistic.',
      recommendation: 'Lead with the statistic; cite Widder as expert anchor.',
    },
    seo: { primary_keyword: 'deep sea bioluminescence' },
    ...overrides,
  };
}

export function makeResearchSession(opts: {
  id?: string;
  findings?: ResearchFindings;
  refinedAngle?: ResearchFindings['refined_angle'];
} = {}) {
  const findings = opts.findings ?? makeResearchFindings();
  return {
    id: opts.id ?? 'rs-session-1',
    level: 'medium',
    input_json: { topic: 'deep sea bioluminescence', focusTags: ['stats', 'expert_advice'] },
    cards_json: findings,
    refined_angle_json: opts.refinedAngle ?? findings.refined_angle,
  };
}
