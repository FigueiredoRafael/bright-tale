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

  it('omits prior-attempts section when none provided', () => {
    const msg = buildReviewMessage({
      type: 'blog',
      title: 'test',
      draftJson: {},
    });
    expect(msg).not.toContain('Previous review attempts');
    expect(msg).not.toContain('Convergence rules');
    expect(msg).not.toContain('Per-prior-critical evaluation');
  });

  it('renders prior attempts with score, verdict, and issues', () => {
    const msg = buildReviewMessage({
      type: 'blog',
      title: 'test',
      draftJson: {},
      priorAttempts: [
        {
          attemptNo: 2,
          score: 68,
          verdict: 'revision_required',
          criticalIssues: ['weak intro hook', 'missing CTA'],
          minorIssues: ['repetitive phrasing'],
        },
        {
          attemptNo: 1,
          score: 72,
          verdict: 'revision_required',
          criticalIssues: ['weak intro hook'],
          minorIssues: [],
        },
      ],
    });
    expect(msg).toContain('Previous review attempts');
    expect(msg).toContain('Attempt #2');
    expect(msg).toContain('Attempt #1');
    expect(msg).toContain('weak intro hook');
    expect(msg).toContain('missing CTA');
    expect(msg).toContain('repetitive phrasing');
    expect(msg).toContain('Per-prior-critical evaluation');
    expect(msg).toContain('quote the specific passage from the CURRENT draft');
    expect(msg).toContain('Convergence rules');
    expect(msg).toContain('previous_score + 5');
    expect(msg).toContain('score MUST be >= the most recent prior score');
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

  it('handles attempts with null score gracefully', () => {
    const msg = buildReviewMessage({
      type: 'blog',
      title: 'test',
      draftJson: {},
      priorAttempts: [
        {
          attemptNo: 1,
          score: null,
          verdict: 'rejected',
          criticalIssues: ['major factual error'],
          minorIssues: [],
        },
      ],
    });
    expect(msg).toContain('score=n/a');
    expect(msg).toContain('major factual error');
  });
});
