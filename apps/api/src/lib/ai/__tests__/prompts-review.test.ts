import { describe, it, expect } from 'vitest';
import { buildReviewMessage } from '../prompts/review.js';

describe('buildReviewMessage', () => {
  it('includes draft type and title', () => {
    const msg = buildReviewMessage({
      type: 'blog',
      title: 'AI Ethics Post',
      draftJson: { content: 'draft text...' },
    });
    expect(msg).toContain('blog');
    expect(msg).toContain('AI Ethics Post');
    expect(msg).toContain('JSON');
  });

  it('includes canonical core when provided', () => {
    const msg = buildReviewMessage({
      type: 'video',
      title: 'test',
      draftJson: {},
      canonicalCore: { thesis: 'important claim' },
    });
    expect(msg).toContain('important claim');
  });

  it('includes content types requested', () => {
    const msg = buildReviewMessage({
      type: 'blog',
      title: 'test',
      draftJson: {},
      contentTypesRequested: ['blog', 'video'],
    });
    expect(msg).toContain('blog');
    expect(msg).toContain('video');
  });

  it('includes idea and research data', () => {
    const msg = buildReviewMessage({
      type: 'blog',
      title: 'test',
      draftJson: {},
      idea: {
        id: 'idea-1',
        title: 'Great idea',
        core_tension: 'tension',
        target_audience: 'audience',
      },
      research: { cards: ['card1'] },
    });
    expect(msg).toContain('Great idea');
    expect(msg).toContain('card1');
  });

  it('includes channel context', () => {
    const msg = buildReviewMessage({
      type: 'blog',
      title: 'test',
      draftJson: {},
      channel: { name: 'BrightCurios', language: 'pt-BR' },
    });
    expect(msg).toContain('BrightCurios');
    expect(msg).toContain('pt-BR');
  });

  it('does NOT include prior-attempts memory in the reviewer prompt (reviewer is stateless)', () => {
    // Sanity check: the reviewer prompt must never carry past criticals.
    // Giving the reviewer prior-attempts memory caused it to anchor on stale
    // flags and stop seeing genuine improvements. The PRODUCER still uses
    // prior-attempts memory (see prompts-production tests) — only the reviewer
    // has been reverted to stateless.
    const msg = buildReviewMessage({
      type: 'blog',
      title: 'test',
      draftJson: {},
    });
    expect(msg).not.toContain('Previous review attempts');
    expect(msg).not.toContain('Convergence rules');
    expect(msg).not.toContain('Per-prior-critical evaluation');
    expect(msg).not.toContain('Partial progress');
    expect(msg).not.toContain('What counts as a "strong hook"');
  });

  it('falls back to draftJson.title when input.title is empty or "null"', () => {
    const fallbackMsg = buildReviewMessage({
      type: 'blog',
      title: 'null',
      draftJson: { blog: { title: 'Real Title From Draft JSON' } },
    });
    expect(fallbackMsg).toContain('Real Title From Draft JSON');
    expect(fallbackMsg).not.toContain('Title: "null"');

    const emptyMsg = buildReviewMessage({
      type: 'blog',
      title: '',
      draftJson: { title: 'Top-Level Draft Title' },
    });
    expect(emptyMsg).toContain('Top-Level Draft Title');
  });

  it('omits the Title line entirely when no title can be resolved', () => {
    const msg = buildReviewMessage({
      type: 'blog',
      title: '',
      draftJson: { content: 'no title anywhere' },
    });
    expect(msg).not.toMatch(/^Title:/m);
  });

});
