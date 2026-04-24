import { describe, it, expect } from 'vitest';
import {
  validateSources,
  validateSourcesFormat,
  validateHeadings,
  validateNotXButY,
  validateSignaturePhraseUsage,
  validateEmDashFiller,
  validateBannedWords,
  validateHollowAdjectives,
  runDraftValidators,
} from '../draftValidators.js';

const EMPTY_CORE = { argument_chain: [], key_stats: [] };

const CORE_WITH_5_SOURCES = {
  argument_chain: [
    { source_ids: ['S1', 'S6'] },
    { source_ids: ['S3'] },
    { source_ids: ['S5'] },
  ],
  key_stats: [
    { source_id: 'S7' },
    { source_id: 'S6' }, // duplicate, should dedupe
  ],
};

const VALID_DRAFT_END = `\n## Sources\n- [Title One](https://example.com/1)\n- [Title Two](https://example.com/2)\n- [Title Three](https://example.com/3)\n- [Title Four](https://example.com/4)\n- [Title Five](https://example.com/5)\n`;

describe('validateSources', () => {
  it('flags missing Sources section', () => {
    const issues = validateSources('# Title\n\nBody only, no sources.', EMPTY_CORE);
    expect(issues[0]).toContain('Missing "## Sources"');
  });

  it('flags empty Sources section', () => {
    const issues = validateSources('Body.\n\n## Sources\n', EMPTY_CORE);
    expect(issues[0]).toContain('empty');
  });

  it('flags Sources with no list items', () => {
    const issues = validateSources('Body.\n\n## Sources\nSome paragraph but no bullets.', EMPTY_CORE);
    expect(issues[0]).toContain('no list items');
  });

  it('flags fewer Sources entries than referenced source_ids', () => {
    const draft = 'Body.\n\n## Sources\n- [Only One](https://example.com/1)';
    const issues = validateSources(draft, CORE_WITH_5_SOURCES);
    expect(issues[0]).toContain('1 entries but 5 unique source_ids');
  });

  it('passes when Sources matches referenced source_ids count', () => {
    const draft = `Body.${VALID_DRAFT_END}`;
    expect(validateSources(draft, CORE_WITH_5_SOURCES)).toEqual([]);
  });

  it('passes when no source_ids referenced and Sources has any entries', () => {
    const draft = `Body.\n\n## Sources\n- [Some Source](https://example.com/x)`;
    expect(validateSources(draft, EMPTY_CORE)).toEqual([]);
  });
});

describe('validateSourcesFormat', () => {
  it('flags Sx: prefix on Sources lines', () => {
    const draft = 'Body.\n\n## Sources\n- S1: Some Title (https://example.com)';
    expect(validateSourcesFormat(draft)[0]).toContain('Sx:');
  });

  it('flags nested markdown links', () => {
    const draft = 'Body.\n\n## Sources\n- [[Inner Link](https://x)](https://y)';
    expect(validateSourcesFormat(draft)[0]).toContain('nested markdown link');
  });

  it('flags lines that do not match - [title](url)', () => {
    const draft = 'Body.\n\n## Sources\n- Just a plain text line';
    expect(validateSourcesFormat(draft)[0]).toContain('not in "- [title](url)"');
  });

  it('passes well-formed Sources lines', () => {
    expect(validateSourcesFormat(`Body.${VALID_DRAFT_END}`)).toEqual([]);
  });

  it('skips when Sources section missing entirely (covered by validateSources)', () => {
    expect(validateSourcesFormat('No sources section.')).toEqual([]);
  });
});

describe('validateHeadings', () => {
  const outline = [
    { h2: 'AI Adoption Is Rising' },
    { h2: 'Pricing Defines the Moat' },
  ];

  it('passes when each H2 is rendered with ##', () => {
    const draft = '## AI Adoption Is Rising\n\nBody.\n\n## Pricing Defines the Moat\n\nMore body.';
    expect(validateHeadings(draft, outline)).toEqual([]);
  });

  it('flags H2 rendered as H3', () => {
    const draft = '### AI Adoption Is Rising\n\nBody.\n\n### Pricing Defines the Moat\n\nMore body.';
    const issues = validateHeadings(draft, outline);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('wrong heading level');
  });

  it('flags H2 not present at all', () => {
    const draft = '## Different Heading\n\nBody.';
    const issues = validateHeadings(draft, outline);
    expect(issues[0]).toContain('not found as any heading');
  });

  it('passes empty outline', () => {
    expect(validateHeadings('## Anything', [])).toEqual([]);
  });
});

describe('validateNotXButY', () => {
  it('passes when pattern used at most once', () => {
    expect(validateNotXButY('The problem is not adoption. It is translation.')).toEqual([]);
  });

  it('flags 2+ uses of "X is not Y. It is Z."', () => {
    const draft = `
The problem is not adoption. It is translation.
The mistake is not the product. It is the sequencing.
Pricing is not just wrong. It is disconnected.
`;
    const issues = validateNotXButY(draft);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/detected [2-9]\d* times/);
  });

  it('flags "Not X, but Y." pattern when overused', () => {
    const draft = 'Not because of code, but because of design. Not because of luck, but because of effort.';
    expect(validateNotXButY(draft)).toHaveLength(1);
  });

  it('flags parallel "Not X. Not Y." stacks', () => {
    const draft = `
Not at the feature level. Not at the model level.
It is not about features. Not about models.
`;
    expect(validateNotXButY(draft).length).toBeGreaterThanOrEqual(1);
  });
});

describe('validateSignaturePhraseUsage', () => {
  const phrases = ["Run the actual numbers:", "Most people skip this part:"];

  it('passes when each phrase used 0-2 times', () => {
    const draft = 'Run the actual numbers: foo. Run the actual numbers: bar. Most people skip this part: baz.';
    expect(validateSignaturePhraseUsage(draft, phrases)).toEqual([]);
  });

  it('flags 3+ uses of one phrase', () => {
    const draft = 'Run the actual numbers: A. Run the actual numbers: B. Run the actual numbers: C.';
    const issues = validateSignaturePhraseUsage(draft, phrases);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('Run the actual numbers');
    expect(issues[0]).toContain('3×');
  });

  it('handles empty phrases array', () => {
    expect(validateSignaturePhraseUsage('any text', [])).toEqual([]);
  });

  it('treats curly and straight apostrophes as equivalent', () => {
    const phrasesWithApostrophe = ["Here's what actually happened:"];
    const draft = "Here's what actually happened: A. Here's what actually happened: B. Here's what actually happened: C.";
    expect(validateSignaturePhraseUsage(draft, phrasesWithApostrophe)).toHaveLength(1);
  });
});

describe('validateEmDashFiller', () => {
  it('passes when em-dashes used sparingly', () => {
    expect(validateEmDashFiller('A — short — note.')).toEqual([]);
  });

  it('flags 4+ em-dashes outside quote attributions', () => {
    const draft = 'A — B. C — D. E — F. G — H. I — J.';
    expect(validateEmDashFiller(draft)).toHaveLength(1);
  });

  it('does not count em-dashes inside blockquote lines', () => {
    const draft = '> "A — B — C — D — E" — quote source\n\nBody — A.';
    expect(validateEmDashFiller(draft)).toEqual([]);
  });
});

describe('validateBannedWords', () => {
  it('flags "journey"', () => {
    expect(validateBannedWords('On this journey of building...')[0]).toContain('"journey"');
  });

  it('flags "essence" as metaphor', () => {
    expect(validateBannedWords('The essence of the product.')[0]).toContain('"essence"');
  });

  it('flags "furthermore" paragraph starts', () => {
    expect(validateBannedWords('A.\n\nFurthermore, B.')[0]).toContain('"furthermore"');
  });

  it("flags \"It's important to\" openings", () => {
    expect(validateBannedWords("It's important to remember.")[0]).toContain('important to');
  });

  it('returns empty array when no banned words present', () => {
    expect(validateBannedWords('Clean prose, no offending words.')).toEqual([]);
  });
});

describe('validateHollowAdjectives', () => {
  it('flags "fascinating", "incredible", "essential" usage', () => {
    const issues = validateHollowAdjectives('A fascinating insight, an incredible result, an essential lever.');
    expect(issues).toHaveLength(3);
  });

  it('passes when none used', () => {
    expect(validateHollowAdjectives('Concrete words only.')).toEqual([]);
  });
});

describe('runDraftValidators (integration)', () => {
  it('passes a clean well-formed draft', () => {
    const draft = `Intro.

## AI Adoption Is Rising

Body — with one em-dash.

## Sources
- [Some Title](https://example.com)`;

    const findings = runDraftValidators({
      fullDraft: draft,
      outline: [{ h2: 'AI Adoption Is Rising' }],
      canonicalCore: { argument_chain: [{ source_ids: ['S1'] }], key_stats: [] },
      signaturePhrases: [],
    });

    expect(findings.critical).toEqual([]);
    expect(findings.important).toEqual([]);
    expect(findings.minor).toEqual([]);
  });

  it('catches multiple issues in a draft from the wild (Alex-style)', () => {
    const draft = `Intro.

### AI Adoption Is Rising

Run the actual numbers: A.
Run the actual numbers: B.
Run the actual numbers: C.

The problem is not adoption. It is translation.
The mistake is not the product. It is the sequencing.

## Sources
`;

    const findings = runDraftValidators({
      fullDraft: draft,
      outline: [{ h2: 'AI Adoption Is Rising' }],
      canonicalCore: { argument_chain: [{ source_ids: ['S1'] }], key_stats: [] },
      signaturePhrases: ['Run the actual numbers:'],
    });

    expect(findings.critical.length).toBeGreaterThanOrEqual(2); // empty Sources + H3 instead of H2
    expect(findings.important.length).toBeGreaterThanOrEqual(2); // signature phrase 3× + Not X But Y 2×
  });
});
