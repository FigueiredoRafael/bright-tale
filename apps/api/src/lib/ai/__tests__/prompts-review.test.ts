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

  it('wraps a flat draft_json under production.<type> so the agent contract is satisfied', () => {
    // The review agent's BC_REVIEW_INPUT contract requires
    // production.blog.full_draft (and similar). Without wrapping a flat draft,
    // the reviewer reports "Missing required field" even though the field
    // exists at a different path.
    const msg = buildReviewMessage({
      type: 'blog',
      title: 'Test',
      draftJson: {
        title: 'Test',
        slug: 'test-slug',
        full_draft: 'Lorem ipsum content',
        outline: [],
      },
    });
    expect(msg).toContain('"production"');
    expect(msg).toContain('"blog"');
    expect(msg).toContain('"full_draft": "Lorem ipsum content"');
    expect(msg).toContain('"slug": "test-slug"');
  });

  it('passes through draft_json already wrapped under production', () => {
    const msg = buildReviewMessage({
      type: 'blog',
      title: 'Test',
      draftJson: {
        production: { blog: { full_draft: 'already wrapped' } },
      },
    });
    expect(msg).toContain('"full_draft": "already wrapped"');
    // Should not double-wrap
    const productionOccurrences = (msg.match(/"production":/g) ?? []).length;
    expect(productionOccurrences).toBe(1);
  });

  it('promotes a half-wrapped draft (e.g. {blog: {...}}) to production.<type>', () => {
    const msg = buildReviewMessage({
      type: 'video',
      title: 'Test',
      draftJson: {
        video: { script: { hook_0_10s: 'opening hook here' } },
      },
    });
    expect(msg).toContain('"production"');
    expect(msg).toContain('"video"');
    expect(msg).toContain('"hook_0_10s": "opening hook here"');
  });

  it('injects the blog rubric and asks for rubric_evaluation when type=blog', () => {
    const msg = buildReviewMessage({
      type: 'blog',
      title: 'Test',
      draftJson: { full_draft: 'x', slug: 'y' },
    });
    expect(msg).toContain('Rubric (REQUIRED');
    expect(msg).toContain('blog_review.rubric_evaluation');
    expect(msg).toContain('has_strong_hook');
    expect(msg).toContain('thesis_clear_in_intro');
    expect(msg).toContain('meets_word_count');
    expect(msg).toContain('claims_have_inline_citations');
    expect(msg).toContain('PASS when:');
    expect(msg).toContain('Do NOT include a `score` field');
    expect(msg).toContain('aesthetic preference');
  });

  it('does NOT inject a rubric for types without one (video/shorts/podcast)', () => {
    const videoMsg = buildReviewMessage({
      type: 'video',
      title: 'Test',
      draftJson: {},
    });
    expect(videoMsg).not.toContain('Rubric (REQUIRED');
    expect(videoMsg).not.toContain('rubric_evaluation');
  });
});
