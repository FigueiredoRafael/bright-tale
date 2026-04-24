import { describe, it, expect } from 'vitest';
import {
  validateColeNoSecondPersonCommands,
  validateColeNoMotivationalListH2,
  validateColeNoJourneyWord,
  validateColeNoSpecificFinancialClaims,
  validateAlexStatsHaveAttribution,
  validateAlexNoStudiesShowWithoutCitation,
  validateAlexNoFinancialAdvice,
  validateCaseyPassiveIncomeQualified,
  validateCaseyAcknowledgesSurvivorshipBias,
  runPersonaValidators,
} from '../personaValidators.js';

// ── Cole ─────────────────────────────────────────────────────────────────────

describe('validateColeNoSecondPersonCommands', () => {
  it('flags "you should" in body', () => {
    expect(validateColeNoSecondPersonCommands('You should validate first.')).toHaveLength(1);
  });

  it('flags "start by" in affiliate copy', () => {
    const issues = validateColeNoSecondPersonCommands(
      'Body is clean.',
      "If you're unsure, start by measuring value.",
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain('affiliate copy');
  });

  it('passes when prose is descriptive (Cole-style)', () => {
    expect(validateColeNoSecondPersonCommands(
      'Founders who get unstuck on pricing tend to do one thing first — measure where value shows up.',
    )).toEqual([]);
  });
});

describe('validateColeNoMotivationalListH2', () => {
  it('flags "5 ways to..." H2', () => {
    expect(validateColeNoMotivationalListH2([{ h2: '5 ways to validate your B2B idea' }])).toHaveLength(1);
  });

  it('passes argument-position H2s', () => {
    expect(validateColeNoMotivationalListH2([{ h2: 'Why hustle culture is bad advice' }])).toEqual([]);
  });
});

describe('validateColeNoJourneyWord', () => {
  it('flags "journey"', () => {
    expect(validateColeNoJourneyWord('On this journey of building...')).toHaveLength(1);
  });

  it('passes when not present', () => {
    expect(validateColeNoJourneyWord('It\'s a build, not a journ... actually it is a build.')).toEqual([]);
  });
});

describe('validateColeNoSpecificFinancialClaims', () => {
  it('flags "$10K MRR"', () => {
    expect(validateColeNoSpecificFinancialClaims('We hit $10K MRR last month.')).toHaveLength(1);
  });

  it('flags "MRR of $5,000"', () => {
    expect(validateColeNoSpecificFinancialClaims('Our MRR of $5,000 doubled.')).toHaveLength(1);
  });

  it('flags "runway of 6 months"', () => {
    expect(validateColeNoSpecificFinancialClaims('We had a runway of 6 months left.')).toHaveLength(1);
  });

  it('passes when no specific numbers', () => {
    expect(validateColeNoSpecificFinancialClaims('Revenue was small and runway was tight.')).toEqual([]);
  });
});

// ── Alex ─────────────────────────────────────────────────────────────────────

describe('validateAlexStatsHaveAttribution', () => {
  it('passes when stat is followed by source name', () => {
    const draft = '**80% of teams ship on time** — McKinsey reports this consistently across years.';
    expect(validateAlexStatsHaveAttribution(draft)).toEqual([]);
  });

  it('passes when stat has nearby URL', () => {
    const draft = 'Adoption is real. **5% of firms are future-built**. Source: https://bcg.com/study';
    expect(validateAlexStatsHaveAttribution(draft)).toEqual([]);
  });

  it('flags bare stat with no attribution nearby', () => {
    const draft = `**80% of teams report no impact**. The market is broken.

Pricing is the issue. **5% of firms succeed**. The rest don't.

Most companies struggle with this.`;
    expect(validateAlexStatsHaveAttribution(draft).length).toBeGreaterThan(0);
  });

  it('passes when "according to <source>" present', () => {
    const draft = '**21% of orgs have redesigned workflows**, according to recent enterprise surveys.';
    expect(validateAlexStatsHaveAttribution(draft)).toEqual([]);
  });

  it('returns empty when no stats present', () => {
    expect(validateAlexStatsHaveAttribution('Plain prose with no numbers.')).toEqual([]);
  });
});

describe('validateAlexNoStudiesShowWithoutCitation', () => {
  it('flags "studies show" without a link', () => {
    expect(validateAlexNoStudiesShowWithoutCitation('Studies show this works.')).toHaveLength(1);
  });

  it('passes when "studies show" has an inline link', () => {
    expect(validateAlexNoStudiesShowWithoutCitation(
      'Studies show that [the 4% rule holds](https://example.com/study).',
    )).toEqual([]);
  });

  it('flags "research shows" without citation', () => {
    expect(validateAlexNoStudiesShowWithoutCitation('Research shows AI helps.')).toHaveLength(1);
  });
});

describe('validateAlexNoFinancialAdvice', () => {
  it('flags "invest in X"', () => {
    expect(validateAlexNoFinancialAdvice('You should invest in index funds.').length).toBeGreaterThan(0);
  });

  it('flags "this is the best investment"', () => {
    expect(validateAlexNoFinancialAdvice('This is the best investment for retirement.').length).toBeGreaterThan(0);
  });

  it('passes neutral analytical prose', () => {
    expect(validateAlexNoFinancialAdvice('Index funds historically outperformed actively-managed funds in published backtests.')).toEqual([]);
  });
});

// ── Casey ────────────────────────────────────────────────────────────────────

describe('validateCaseyPassiveIncomeQualified', () => {
  it('flags bare "passive income"', () => {
    expect(validateCaseyPassiveIncomeQualified('Build a passive income stream and watch the money flow.').length).toBeGreaterThan(0);
  });

  it('passes when qualified with "low-maintenance"', () => {
    expect(validateCaseyPassiveIncomeQualified('What people call passive income is really low-maintenance income — there\'s still ongoing work.')).toEqual([]);
  });

  it('passes when qualified with "still requires"', () => {
    expect(validateCaseyPassiveIncomeQualified('Passive income still requires customer support, churn handling, and product fixes.')).toEqual([]);
  });
});

describe('validateCaseyAcknowledgesSurvivorshipBias', () => {
  it('flags success-pattern post that omits survivorship-bias caveat', () => {
    const draft = 'Looking at the winners across micro-SaaS, here is what worked.';
    expect(validateCaseyAcknowledgesSurvivorshipBias(draft)).toHaveLength(1);
  });

  it('passes when survivorship bias is acknowledged', () => {
    const draft = 'Looking at the winners — with the obvious survivorship bias caveat — here\'s what worked.';
    expect(validateCaseyAcknowledgesSurvivorshipBias(draft)).toEqual([]);
  });

  it('passes when post is not analyzing success patterns', () => {
    expect(validateCaseyAcknowledgesSurvivorshipBias('A post about something else entirely.')).toEqual([]);
  });
});

// ── Entry point ──────────────────────────────────────────────────────────────

describe('runPersonaValidators', () => {
  it('returns empty findings when persona slug is null', () => {
    const f = runPersonaValidators(null, {
      fullDraft: 'You should do this. studies show.',
      outline: [],
    });
    expect(f.critical).toEqual([]);
    expect(f.important).toEqual([]);
    expect(f.minor).toEqual([]);
  });

  it('runs Cole rules for cole-merritt', () => {
    const f = runPersonaValidators('cole-merritt', {
      fullDraft: 'You should validate first. On this journey...',
      outline: [{ h2: '5 ways to ship faster' }],
    });
    expect(f.critical.length).toBeGreaterThanOrEqual(1); // second-person command
    expect(f.important.length).toBeGreaterThanOrEqual(2); // journey + motivational H2
  });

  it('runs Alex rules for alex-strand', () => {
    const f = runPersonaValidators('alex-strand', {
      fullDraft: '**80% drop off**. Studies show this works.',
      outline: [],
    });
    expect(f.critical.length).toBeGreaterThan(0); // bare stat
    expect(f.important.length).toBeGreaterThan(0); // studies show
  });

  it('runs Casey rules for casey-park', () => {
    const f = runPersonaValidators('casey-park', {
      fullDraft: 'Looking at the winners, here is what worked. Build a passive income stream.',
      outline: [],
    });
    expect(f.critical.length).toBeGreaterThan(0); // passive income unqualified
    expect(f.important.length).toBeGreaterThan(0); // survivorship bias missing
  });

  it('returns empty for unknown persona slug', () => {
    const f = runPersonaValidators('unknown-persona', { fullDraft: 'Anything', outline: [] });
    expect(f).toEqual({ critical: [], important: [], minor: [] });
  });
});
