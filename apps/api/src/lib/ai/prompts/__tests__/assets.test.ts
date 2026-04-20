import { describe, it, expect } from 'vitest';
import { buildAssetsMessage } from '../assets';

describe('buildAssetsMessage', () => {
  it('wraps BC_ASSETS_INPUT in a JSON code block with clear instruction', () => {
    const msg = buildAssetsMessage({
      title: 'Sample Title',
      content_type: 'blog',
      sections: [
        { slot: 'featured', section_title: 'Sample Title', key_points: [] },
        { slot: 'section_1', section_title: 'Intro', key_points: ['a', 'b'] },
      ],
      channel_context: { niche: 'tech', tone: 'informative' },
      idea_context: null,
    });

    expect(msg).toContain('BC_ASSETS_INPUT');
    expect(msg).toContain('Sample Title');
    expect(msg).toContain('section_1');
    expect(msg).toContain('BC_ASSETS_OUTPUT');
    expect(msg).toMatch(/```json/);
  });

  it('includes idea context when present', () => {
    const msg = buildAssetsMessage({
      title: 'X',
      content_type: 'blog',
      sections: [],
      channel_context: {},
      idea_context: { id: 'idea-1', title: 'Idea', core_tension: 'tension' } as any,
    });
    expect(msg).toContain('idea_context');
    expect(msg).toContain('tension');
  });
});
