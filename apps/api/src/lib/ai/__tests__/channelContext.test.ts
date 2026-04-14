import { describe, it, expect } from 'vitest';
import { formatChannelContext } from '../channelContext';

describe('formatChannelContext', () => {
  it('builds context block with all fields', () => {
    const result = formatChannelContext({
      language: 'pt-BR',
      region: 'br',
      market: 'br',
      tone: 'informative',
      niche: 'personal finance',
      nicheTags: ['investing', 'budgeting'],
      name: 'FinançasFáceis',
    });

    expect(result).toContain('## Channel Context');
    expect(result).toContain('Language: pt-BR');
    expect(result).toContain('Region: br');
    expect(result).toContain('Tone: informative');
    expect(result).toContain('Niche: personal finance');
    expect(result).toContain('investing, budgeting');
    expect(result).toContain('FinançasFáceis');
    expect(result).toContain('CRITICAL');
  });

  it('handles missing optional fields', () => {
    const result = formatChannelContext({
      language: 'en',
      region: 'us',
      market: 'us',
      tone: null,
      niche: null,
      nicheTags: null,
      name: 'TechBites',
    });

    expect(result).toContain('Language: en');
    expect(result).toContain('Region: us');
    expect(result).not.toContain('Tone:');
    expect(result).not.toContain('Niche:');
  });

  it('includes cultural adaptation instruction for non-English', () => {
    const result = formatChannelContext({
      language: 'pt-BR',
      region: 'br',
      market: 'br',
      tone: null,
      niche: null,
      nicheTags: null,
      name: 'Test',
    });

    expect(result).toContain('ALL content output MUST be written in pt-BR');
    expect(result).toContain('cultural references appropriate for br');
  });

  it('omits cultural adaptation line for English', () => {
    const result = formatChannelContext({
      language: 'en',
      region: 'us',
      market: 'us',
      tone: null,
      niche: null,
      nicheTags: null,
      name: 'Test',
    });

    expect(result).not.toContain('ALL content output MUST be written in');
  });
});
