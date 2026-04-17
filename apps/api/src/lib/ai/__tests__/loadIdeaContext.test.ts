// apps/api/src/lib/ai/__tests__/loadIdeaContext.test.ts
import { describe, it, expect } from 'vitest';
import { parseDiscoveryData, type IdeaContext } from '../loadIdeaContext.js';

describe('parseDiscoveryData', () => {
  it('extracts scroll_stopper and curiosity_gap from JSON string', () => {
    const raw = JSON.stringify({
      scroll_stopper: 'Did you know 73% fail?',
      curiosity_gap: 'The one thing nobody tells you',
      monetization: {
        affiliate_angle: 'CRM tools',
        product_fit: 'High',
        sponsor_appeal: 'Medium',
      },
      repurpose_potential: {
        blog_angle: 'Listicle',
        video_angle: 'Talking head',
        shorts_hooks: ['Hook 1', 'Hook 2'],
        podcast_angle: 'Interview style',
      },
    });

    const result = parseDiscoveryData(raw);
    expect(result.scroll_stopper).toBe('Did you know 73% fail?');
    expect(result.curiosity_gap).toBe('The one thing nobody tells you');
    expect(result.monetization?.affiliate_angle).toBe('CRM tools');
    expect(result.repurpose_potential?.shorts_hooks).toEqual(['Hook 1', 'Hook 2']);
  });

  it('returns empty object for null input', () => {
    const result = parseDiscoveryData(null);
    expect(result.scroll_stopper).toBeUndefined();
    expect(result.monetization).toBeUndefined();
  });

  it('handles invalid JSON gracefully', () => {
    const result = parseDiscoveryData('not valid json {{{');
    expect(result.scroll_stopper).toBeUndefined();
  });

  it('handles already-parsed object', () => {
    const result = parseDiscoveryData({ scroll_stopper: 'test' });
    expect(result.scroll_stopper).toBe('test');
  });
});
