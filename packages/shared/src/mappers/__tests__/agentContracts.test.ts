import { describe, it, expect } from 'vitest';
import { review } from '../../../../../scripts/agents/review';

function collectFieldNames(fields: any[], prefix = ''): string[] {
  const names: string[] = [];
  for (const f of fields) {
    const name = prefix ? `${prefix}.${f.name}` : f.name;
    names.push(name);
    if (f.type === 'object' && Array.isArray(f.fields)) {
      names.push(...collectFieldNames(f.fields, name));
    }
    if (f.type === 'array' && f.items?.type === 'object' && Array.isArray(f.items.fields)) {
      names.push(...collectFieldNames(f.items.fields, name + '[]'));
    }
  }
  return names;
}

describe('Review agent inputSchema', () => {
  const productionField = review.sections.inputSchema.fields.find((f) => f.name === 'production');
  if (!productionField || productionField.type !== 'object' || !productionField.fields) {
    throw new Error('production field missing');
  }
  const allFields = collectFieldNames(productionField.fields);

  it('declares required Blog fields', () => {
    for (const f of ['blog.title', 'blog.slug', 'blog.meta_description', 'blog.primary_keyword',
                     'blog.full_draft']) {
      expect(allFields).toContain(f);
    }
  });

  it('declares required Video fields', () => {
    for (const f of ['video.title_options', 'video.script', 'video.estimated_duration',
                     'video.thumbnail', 'video.chapter_count']) {
      expect(allFields).toContain(f);
    }
  });

  it('declares required Podcast fields', () => {
    for (const f of ['podcast.episode_title', 'podcast.talking_points', 'podcast.intro_hook',
                     'podcast.outro']) {
      expect(allFields).toContain(f);
    }
  });

  it('declares required Shorts fields (arrOf)', () => {
    const shorts = productionField.fields.find((f) => f.name === 'shorts');
    expect(shorts?.type).toBe('array');
    expect(shorts?.items?.type).toBe('object');
    const shortsFields = shorts?.items?.fields?.map((f: any) => f.name) ?? [];
    expect(shortsFields).toEqual(expect.arrayContaining(['hook', 'script', 'visual_style', 'duration_target']));
  });

  it('declares required Engagement fields', () => {
    for (const f of ['engagement.pinned_comment', 'engagement.community_post',
                     'engagement.hook_tweet', 'engagement.thread_outline']) {
      expect(allFields).toContain(f);
    }
  });
});
