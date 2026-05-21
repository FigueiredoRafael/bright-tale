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

  it('does NOT include stubborn-loop language on first attempt', () => {
    const msg = buildReproduceMessage({
      type: 'blog',
      title: 'test',
      reviewFeedback: { overall_verdict: 'revision_required' },
      iterationCount: 1,
    });
    expect(msg).toContain('Revision attempt: #1');
    expect(msg).not.toContain('FAILED to address');
    expect(msg).not.toContain('replacing whole paragraphs');
  });

  it('escalates language when iteration >= 2', () => {
    const msg = buildReproduceMessage({
      type: 'blog',
      title: 'test',
      reviewFeedback: {
        overall_verdict: 'revision_required',
        critical_issues: ['weak hook'],
      },
      iterationCount: 3,
    });
    expect(msg).toContain('Revision attempt: #3');
    expect(msg).toContain('FAILED to address');
    expect(msg).toContain('replacing whole paragraphs');
    expect(msg).toContain('MUST be resolved, not softened');
  });

  it('surfaces priorAttempts so producer can see what fixes have already failed', () => {
    const msg = buildReproduceMessage({
      type: 'blog',
      title: 'test',
      reviewFeedback: {
        overall_verdict: 'revision_required',
        critical_issues: ['intro lacks hook'],
      },
      iterationCount: 4,
      priorAttempts: [
        {
          attemptNo: 3,
          score: 60,
          verdict: 'revision_required',
          criticalIssues: ['intro lacks hook', 'sentences too long'],
          minorIssues: [],
        },
        {
          attemptNo: 2,
          score: 55,
          verdict: 'revision_required',
          criticalIssues: ['intro lacks hook'],
          minorIssues: [],
        },
      ],
    });
    expect(msg).toContain('Previous revision attempts on this draft');
    expect(msg).toContain('Attempt #3');
    expect(msg).toContain('score=60');
    expect(msg).toContain('Attempt #2');
    expect(msg).toContain('"intro lacks hook"');
    expect(msg).toContain('your prior fix attempt for that issue did NOT work');
    expect(msg).toContain('fundamentally different rewrite');
  });

  it('does not include priorAttempts block when none provided', () => {
    const msg = buildReproduceMessage({
      type: 'blog',
      title: 'test',
      reviewFeedback: { overall_verdict: 'revision_required' },
    });
    expect(msg).not.toContain('Previous revision attempts on this draft');
    expect(msg).not.toContain('Producer self-check');
  });
});
