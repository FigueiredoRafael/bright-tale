import { describe, it, expect } from 'vitest';
import { buildCanonicalCoreMessage, buildProduceMessage, buildReproduceMessage } from '../prompts/production.js';

describe('buildCanonicalCoreMessage', () => {
  it('includes title and type', () => {
    const msg = buildCanonicalCoreMessage({
      type: 'blog',
      title: 'AI Ethics Deep Dive',
      ideaId: 'BC-IDEA-001',
    });
    expect(msg).toContain('AI Ethics Deep Dive');
    expect(msg).toContain('blog');
    expect(msg).toContain('canonical core');
  });

  it('includes research cards when provided', () => {
    const msg = buildCanonicalCoreMessage({
      type: 'video',
      title: 'test',
      researchCards: [{ title: 'Finding 1', summary: 'Important data' }],
    });
    expect(msg).toContain('Finding 1');
  });
});

describe('buildProduceMessage', () => {
  it('includes canonical core reference', () => {
    const msg = buildProduceMessage({
      type: 'blog',
      title: 'test',
      canonicalCore: { thesis: 'AI changes everything' },
    });
    expect(msg).toContain('blog');
    expect(msg).toContain('AI changes everything');
  });
});

describe('buildReproduceMessage', () => {
  it('includes review feedback', () => {
    const msg = buildReproduceMessage({
      type: 'blog',
      title: 'test',
      reviewFeedback: {
        overall_verdict: 'revision_required',
        critical_issues: ['Missing sources'],
      },
    });
    expect(msg).toContain('Missing sources');
    expect(msg).toContain('revision_required');
  });

  it('includes strengths', () => {
    const msg = buildReproduceMessage({
      type: 'video',
      title: 'test',
      reviewFeedback: {
        strengths: ['Great hook', 'Solid research'],
      },
    });
    expect(msg).toContain('Great hook');
    expect(msg).toContain('Solid research');
  });
});
