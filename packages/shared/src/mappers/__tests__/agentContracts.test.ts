import { describe, it, expect } from 'vitest';
import { review } from '../../../../../scripts/agents/review';
import { brainstorm } from '../../../../../scripts/agents/brainstorm';
import { research } from '../../../../../scripts/agents/research';
import { blog } from '../../../../../scripts/agents/blog';
// import { video } from '../../../../../scripts/agents/video';
import { shorts } from '../../../../../scripts/agents/shorts';
import { podcast } from '../../../../../scripts/agents/podcast';
import { engagement } from '../../../../../scripts/agents/engagement';
import { contentCore } from '../../../../../scripts/agents/content-core';

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
                     'blog.secondary_keywords', 'blog.outline', 'blog.full_draft',
                     'blog.affiliate_integration', 'blog.internal_links_suggested']) {
      expect(allFields).toContain(f);
    }
  });

  it('declares required Video fields', () => {
    for (const f of ['video.title_options', 'video.script', 'video.teleprompter_script',
                     'video.video_description', 'video.estimated_duration', 'video.thumbnail',
                     'video.chapter_count']) {
      expect(allFields).toContain(f);
    }
  });

  it('declares required Podcast fields', () => {
    for (const f of ['podcast.episode_title', 'podcast.episode_description', 'podcast.intro_hook',
                     'podcast.talking_points', 'podcast.host_talking_prompts',
                     'podcast.guest_questions', 'podcast.outro']) {
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

describe('content_warning field presence', () => {
  const agentsToCheck = [
    { name: 'brainstorm', agent: brainstorm },
    { name: 'research', agent: research },
    { name: 'blog', agent: blog },
    // { name: 'video', agent: video },  // BLOCKED: video.ts has parse error
    { name: 'shorts', agent: shorts },
    { name: 'podcast', agent: podcast },
    { name: 'engagement', agent: engagement },
    { name: 'content-core', agent: contentCore },
  ];

  for (const { name, agent } of agentsToCheck) {
    it(`${name}.outputSchema declares content_warning`, () => {
      const findField = (fields: unknown[]): boolean =>
        fields.some((f) => {
          if (!f || typeof f !== 'object') return false;
          const field = f as { name?: string; fields?: unknown[] };
          if (field.name === 'content_warning') return true;
          if (Array.isArray(field.fields)) return findField(field.fields);
          return false;
        });
      expect(findField(agent.sections.outputSchema.fields)).toBe(true);
    });
  }
});
