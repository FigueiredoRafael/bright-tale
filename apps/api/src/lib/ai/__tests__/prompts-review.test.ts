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

  it('includes idea context but explicitly NOT research data (prompt-size optimization)', () => {
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
    // Research data is intentionally dropped from the reviewer prompt — the
    // research session JSON is 5-15KB and the reviewer evaluates the draft,
    // not the research. Keeping it caused the model to summarize research
    // instead of reviewing the draft.
    expect(msg).not.toContain('card1');
    expect(msg).not.toContain('Research data:');
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

  it('injects the blog rubric with mandatory schema override + worked example', () => {
    const msg = buildReviewMessage({
      type: 'blog',
      title: 'Test',
      draftJson: { full_draft: 'x', slug: 'y' },
    });
    // System-prompt override (compressed wording)
    expect(msg).toContain('MANDATORY SCHEMA OVERRIDE');
    expect(msg).toContain('blog_review object MUST include a "rubric_evaluation"');
    expect(msg).toContain('Do NOT include a "score" field');
    expect(msg).toContain('Missing keys count as fail');
    // Worked example (JSON block with rubric_evaluation key + sample pass/evidence)
    expect(msg).toContain('"rubric_evaluation"');
    expect(msg).toContain('"pass"');
    expect(msg).toContain('"evidence"');
    // All 10 criteria listed by key (single-line each in the criteria block)
    expect(msg).toContain('has_strong_hook');
    expect(msg).toContain('thesis_clear_in_intro');
    expect(msg).toContain('meets_word_count');
    expect(msg).toContain('claims_have_inline_citations');
    expect(msg).toContain('outline_matches_canonical');
    expect(msg).toContain('no_promotional_tone');
    expect(msg).toContain('sentence_clarity');
    expect(msg).toContain('seo_meta_optimized');
    expect(msg).toContain('cta_present_and_aligned');
    expect(msg).toContain('strengths_preserved');
    expect(msg).toContain('Calibration:');
    expect(msg).toContain('aesthetic preference');
  });

  it('keeps the rubric block compact (no per-criterion multi-line breakdown)', () => {
    // Regression test: the previous verbose layout (5 lines per criterion +
    // a redundant required-keys list + a self-check paragraph) was inflating
    // the prompt. After compression each criterion is one line and the
    // required-keys list is gone (the criteria block IS the keys list).
    const msg = buildReviewMessage({
      type: 'blog',
      title: 'Test',
      draftJson: { full_draft: 'x', slug: 'y' },
    });
    // Old verbose markers should NOT appear
    expect(msg).not.toContain('what to check:');
    expect(msg).not.toContain('examples of FAIL:');
    expect(msg).not.toContain('Required keys (ALL');
    expect(msg).not.toContain('Self-check before returning');
  });

  it('injects the video rubric override with all 10 criteria keys', () => {
    const msg = buildReviewMessage({
      type: 'video',
      title: 'Test',
      draftJson: {},
    });
    expect(msg).toContain('MANDATORY SCHEMA OVERRIDE');
    expect(msg).toContain('video_review object MUST include a "rubric_evaluation"');
    expect(msg).toContain('Do NOT include a "score" field');
    expect(msg).toContain('has_strong_hook');
    expect(msg).toContain('chapters_align_to_canonical');
    expect(msg).toContain('outro_has_cta');
    expect(msg).toContain('thumbnail_specified');
    expect(msg).toContain('strengths_preserved');
  });

  it('injects the shorts rubric override', () => {
    const msg = buildReviewMessage({
      type: 'shorts',
      title: 'Test',
      draftJson: {},
    });
    expect(msg).toContain('MANDATORY SCHEMA OVERRIDE');
    expect(msg).toContain('shorts_review object MUST include a "rubric_evaluation"');
  });

  it('injects the podcast rubric override', () => {
    const msg = buildReviewMessage({
      type: 'podcast',
      title: 'Test',
      draftJson: {},
    });
    expect(msg).toContain('MANDATORY SCHEMA OVERRIDE');
    expect(msg).toContain('podcast_review object MUST include a "rubric_evaluation"');
  });

  it('skips the rubric override for unknown types', () => {
    const msg = buildReviewMessage({
      type: 'newsletter',
      title: 'Test',
      draftJson: {},
    });
    expect(msg).not.toContain('MANDATORY SCHEMA OVERRIDE');
    expect(msg).not.toContain('rubric_evaluation');
  });
});
