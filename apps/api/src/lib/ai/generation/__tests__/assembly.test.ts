/**
 * Unit tests for the generation assembly layer.
 *
 * Covers:
 *   - deriveEffectiveProductionParams: video_style → channel_type derivation
 *     (the intentional consistency fix: pipeline-production-dispatch now also
 *     applies this derivation, not just production-produce.ts)
 *   - buildStageSystemPrompt: constraints block prepended correctly
 */
import { describe, it, expect } from 'vitest';
import { deriveEffectiveProductionParams, buildStageSystemPrompt } from '../assembly.js';

describe('deriveEffectiveProductionParams', () => {
  it('returns productionParams unchanged for non-video types', () => {
    const params = { word_count: 800 };
    const result = deriveEffectiveProductionParams('blog', { video_style: 'face' }, params);
    expect(result).toEqual(params);
  });

  it('returns productionParams unchanged when channel is null', () => {
    const params = { video_style_config: {} };
    const result = deriveEffectiveProductionParams('video', null, params);
    expect(result).toEqual(params);
  });

  it('returns null when both channel and productionParams are null for non-video', () => {
    const result = deriveEffectiveProductionParams('blog', null, null);
    expect(result).toBeNull();
  });

  it('derives channel_type=presenter from video_style=face', () => {
    const result = deriveEffectiveProductionParams('video', { video_style: 'face' }, null);
    expect(result).not.toBeNull();
    expect((result!.video_style_config as Record<string, unknown>).channel_type).toBe('presenter');
  });

  it('derives channel_type=presenter from video_style=hybrid', () => {
    const result = deriveEffectiveProductionParams('video', { video_style: 'hybrid' }, null);
    expect((result!.video_style_config as Record<string, unknown>).channel_type).toBe('presenter');
  });

  it('derives channel_type=dark from video_style=dark', () => {
    const result = deriveEffectiveProductionParams('video', { video_style: 'dark' }, null);
    expect((result!.video_style_config as Record<string, unknown>).channel_type).toBe('dark');
  });

  it('does NOT override channel_type when already explicitly set', () => {
    const params = { video_style_config: { channel_type: 'custom_type' } };
    const result = deriveEffectiveProductionParams('video', { video_style: 'face' }, params);
    // existing value preserved
    expect((result!.video_style_config as Record<string, unknown>).channel_type).toBe('custom_type');
  });

  it('preserves existing productionParams fields when deriving', () => {
    const params = { some_flag: true };
    const result = deriveEffectiveProductionParams('video', { video_style: 'face' }, params);
    expect((result as Record<string, unknown>).some_flag).toBe(true);
  });

  it('returns productionParams unchanged when video_style is unknown', () => {
    const params = { word_count: 800 };
    const result = deriveEffectiveProductionParams('video', { video_style: 'unknown_value' }, params);
    expect(result).toEqual(params);
  });
});

describe('buildStageSystemPrompt', () => {
  it('returns agent instructions unchanged when no constraints', () => {
    const result = buildStageSystemPrompt('You are an agent.', []);
    expect(result).toBe('You are an agent.');
  });

  it('prepends constraints block before agent instructions', () => {
    const result = buildStageSystemPrompt('You are an agent.', ['No profanity', 'EN only']);
    expect(result).toContain('## Content Constraints');
    expect(result).toContain('No profanity');
    expect(result).toContain('EN only');
    expect(result).toContain('You are an agent.');
    // constraints come before instructions
    expect(result.indexOf('## Content Constraints')).toBeLessThan(result.indexOf('You are an agent.'));
  });

  it('returns empty string when instructions are null and no constraints', () => {
    const result = buildStageSystemPrompt(null, []);
    expect(result).toBe('');
  });

  it('returns constraints block alone when instructions are null', () => {
    const result = buildStageSystemPrompt(null, ['Rule 1']);
    expect(result).toContain('## Content Constraints');
    expect(result).toContain('Rule 1');
  });
});
