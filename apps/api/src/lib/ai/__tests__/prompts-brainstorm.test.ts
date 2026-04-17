import { describe, it, expect } from 'vitest';
import { buildBrainstormMessage } from '../prompts/brainstorm.js';

describe('buildBrainstormMessage', () => {
  it('builds message with topic only', () => {
    const msg = buildBrainstormMessage({ topic: 'AI in healthcare' });
    expect(msg).toContain('AI in healthcare');
    expect(msg).toContain('5');
    expect(msg).toContain('JSON');
  });

  it('includes ideas count', () => {
    const msg = buildBrainstormMessage({ topic: 'test', ideasRequested: 3 });
    expect(msg).toContain('3');
  });

  it('includes fine-tuning context', () => {
    const msg = buildBrainstormMessage({
      topic: 'test',
      fineTuning: {
        niche: 'technology',
        audience: 'developers',
        tone: 'casual',
        goal: 'engage',
        constraints: 'avoid clickbait',
      },
    });
    expect(msg).toContain('technology');
    expect(msg).toContain('developers');
    expect(msg).toContain('casual');
    expect(msg).toContain('engage');
    expect(msg).toContain('avoid clickbait');
  });

  it('includes channel context', () => {
    const msg = buildBrainstormMessage({
      topic: 'test',
      channel: {
        name: 'BrightCurios',
        niche: 'Science',
        language: 'pt-BR',
        tone: 'Curious',
      },
    });
    expect(msg).toContain('BrightCurios');
    expect(msg).toContain('pt-BR');
  });

  it('omits empty fine-tuning fields', () => {
    const msg = buildBrainstormMessage({
      topic: 'test',
      fineTuning: { niche: '', tone: '', audience: '', goal: '', constraints: '' },
    });
    expect(msg).not.toContain('Niche:');
    expect(msg).not.toContain('Tone:');
  });

  it('includes reference URL when provided', () => {
    const msg = buildBrainstormMessage({
      topic: 'test',
      referenceUrl: 'https://example.com/article',
    });
    expect(msg).toContain('https://example.com/article');
  });

  it('handles no topic gracefully', () => {
    const msg = buildBrainstormMessage({});
    expect(msg).toContain('content ideas');
    expect(msg).toContain('JSON');
  });
});
