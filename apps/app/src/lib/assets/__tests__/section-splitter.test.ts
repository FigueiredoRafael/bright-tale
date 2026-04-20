import { describe, it, expect } from 'vitest';
import { splitDraftBySections } from '../section-splitter';

describe('splitDraftBySections', () => {
  it('extracts intro + H2 sections in order', () => {
    const markdown = [
      'Intro paragraph one.',
      '',
      'Intro paragraph two.',
      '',
      '## First Heading',
      '',
      'Content under first.',
      '',
      '## Second Heading',
      '',
      'Content under second.',
    ].join('\n');

    const result = splitDraftBySections(markdown);

    expect(result.intro).toContain('Intro paragraph one');
    expect(result.intro).toContain('Intro paragraph two');
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].heading).toBe('First Heading');
    expect(result.sections[0].body).toContain('Content under first.');
    expect(result.sections[1].heading).toBe('Second Heading');
    expect(result.sections[1].body).toContain('Content under second.');
  });

  it('handles no intro (starts with H2)', () => {
    const markdown = '## Only Heading\n\nBody.';
    const result = splitDraftBySections(markdown);
    expect(result.intro).toBe('');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].heading).toBe('Only Heading');
    expect(result.sections[0].body).toBe('Body.');
  });

  it('handles draft with no H2 at all', () => {
    const markdown = 'Just a paragraph. No headings.';
    const result = splitDraftBySections(markdown);
    expect(result.intro).toBe('Just a paragraph. No headings.');
    expect(result.sections).toHaveLength(0);
  });

  it('returns empty structure for empty input', () => {
    const result = splitDraftBySections('');
    expect(result.intro).toBe('');
    expect(result.sections).toHaveLength(0);
  });

  it('trims surrounding whitespace on intro and section bodies', () => {
    const markdown = '   \n\nIntro.\n\n## H\n\n   Body.   \n\n';
    const result = splitDraftBySections(markdown);
    expect(result.intro).toBe('Intro.');
    expect(result.sections[0].body).toBe('Body.');
  });
});
