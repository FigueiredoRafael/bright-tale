import { describe, it, expect } from 'vitest';
import { buildCanonicalCoreMessage, buildProduceMessage, buildReproduceMessage } from '../prompts/production.js';
import type { IdeaContext } from '../loadIdeaContext.js';

const mockIdea: IdeaContext = {
  id: 'uuid-123',
  title: 'Test Idea',
  core_tension: 'Old way vs new way',
  target_audience: 'Developers',
  scroll_stopper: 'Did you know 73% fail?',
  curiosity_gap: 'The one thing nobody tells you',
  monetization: { affiliate_angle: 'CRM tools' },
};

describe('buildCanonicalCoreMessage', () => {
  it('includes title and type', () => {
    const msg = buildCanonicalCoreMessage({
      type: 'blog',
      title: 'AI Ethics Deep Dive',
      ideaId: 'uuid-123',
    });
    expect(msg).toContain('AI Ethics Deep Dive');
    expect(msg).toContain('blog');
    expect(msg).toContain('canonical core');
  });

  it('includes research cards as JSON (not YAML)', () => {
    const msg = buildCanonicalCoreMessage({
      type: 'video',
      title: 'test',
      researchCards: [{ title: 'Finding 1', summary: 'Important data' }],
    });
    expect(msg).toContain('"title": "Finding 1"');
    expect(msg).toContain('"summary": "Important data"');
  });

  it('includes idea context when provided', () => {
    const msg = buildCanonicalCoreMessage({
      type: 'blog',
      title: 'test',
      idea: mockIdea,
    });
    expect(msg).toContain('Selected idea:');
    expect(msg).toContain('"core_tension": "Old way vs new way"');
    expect(msg).toContain('"scroll_stopper": "Did you know 73% fail?"');
  });

  it('includes production params as JSON (not YAML)', () => {
    const msg = buildCanonicalCoreMessage({
      type: 'blog',
      title: 'test',
      productionParams: { target_word_count: 1000 },
    });
    expect(msg).toContain('"target_word_count": 1000');
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

  it('includes idea context when provided', () => {
    const msg = buildProduceMessage({
      type: 'blog',
      title: 'test',
      canonicalCore: { thesis: 'test' },
      idea: mockIdea,
    });
    expect(msg).toContain('Original idea context:');
    expect(msg).toContain('"target_audience": "Developers"');
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

  it('includes idea context when provided', () => {
    const msg = buildReproduceMessage({
      type: 'blog',
      title: 'test',
      reviewFeedback: { overall_verdict: 'revision_required' },
      idea: mockIdea,
    });
    expect(msg).toContain('Original idea context:');
    expect(msg).toContain('"curiosity_gap"');
  });
});
