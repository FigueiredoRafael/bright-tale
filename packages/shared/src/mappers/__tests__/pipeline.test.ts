import { describe, it, expect } from 'vitest';
import {
  mapBrainstormSessionFromDb,
  mapResearchSessionFromDb,
  mapContentDraftFromDb,
  mapContentAssetFromDb,
} from '../db';
import { legacyKeywordFallback } from '../pipeline';

describe('mapBrainstormSessionFromDb', () => {
  it('converts snake_case DB row to camelCase', () => {
    const row = {
      id: 'bs-1',
      org_id: 'org-1',
      user_id: 'user-1',
      channel_id: 'ch-1',
      project_id: null,
      input_mode: 'blind',
      input_json: { topic: 'ai' },
      model_tier: 'standard',
      status: 'completed',
      error_message: null,
      created_at: '2026-04-13T00:00:00.000Z',
      updated_at: '2026-04-13T00:00:01.000Z',
    };
    const out = mapBrainstormSessionFromDb(row);
    expect(out.orgId).toBe('org-1');
    expect(out.channelId).toBe('ch-1');
    expect(out.inputMode).toBe('blind');
    expect(out.inputJson).toEqual({ topic: 'ai' });
    expect(out.modelTier).toBe('standard');
    expect(out.errorMessage).toBeNull();
  });
});

describe('mapResearchSessionFromDb', () => {
  it('maps level + focus_tags arrays', () => {
    const out = mapResearchSessionFromDb({
      id: 'rs-1',
      org_id: 'org-1',
      user_id: 'u-1',
      channel_id: null,
      idea_id: 'BC-IDEA-001',
      project_id: null,
      level: 'deep',
      focus_tags: ['stats', 'expert_advice'],
      input_json: {},
      cards_json: null,
      approved_cards_json: null,
      refined_angle_json: null,
      pivot_applied: false,
      model_tier: 'premium',
      status: 'reviewed',
      error_message: null,
      created_at: '2026-04-13T00:00:00.000Z',
      updated_at: '2026-04-13T00:00:00.000Z',
    });
    expect(out.level).toBe('deep');
    expect(out.focusTags).toEqual(['stats', 'expert_advice']);
    expect(out.ideaId).toBe('BC-IDEA-001');
    expect(out.modelTier).toBe('premium');
    expect(out.refinedAngleJson).toBeNull();
    expect(out.pivotApplied).toBe(false);
  });
});

describe('mapContentDraftFromDb', () => {
  it('maps all nullable json fields and scheduling', () => {
    const out = mapContentDraftFromDb({
      id: 'cd-1',
      org_id: 'org-1',
      user_id: 'u-1',
      channel_id: 'ch-1',
      idea_id: 'BC-IDEA-001',
      research_session_id: 'rs-1',
      project_id: null,
      type: 'blog',
      title: 'Deep Work',
      canonical_core_json: { hook: 'x' },
      draft_json: { body: 'y' },
      review_feedback_json: null,
      production_settings_json: null,
      status: 'scheduled',
      review_score: null,
      review_verdict: 'pending',
      iteration_count: 0,
      approved_at: null,
      wordpress_post_id: null,
      scheduled_at: '2026-05-01T10:00:00.000Z',
      published_at: null,
      published_url: null,
      created_at: '2026-04-13T00:00:00.000Z',
      updated_at: '2026-04-13T00:00:00.000Z',
    });
    expect(out.type).toBe('blog');
    expect(out.researchSessionId).toBe('rs-1');
    expect(out.canonicalCoreJson).toEqual({ hook: 'x' });
    expect(out.scheduledAt).toBe('2026-05-01T10:00:00.000Z');
    expect(out.publishedUrl).toBeNull();
    expect(out.projectId).toBeNull();
    expect(out.reviewVerdict).toBe('pending');
    expect(out.iterationCount).toBe(0);
    expect(out.wordpressPostId).toBeNull();
  });
});

describe('mapContentAssetFromDb', () => {
  it('maps credits_used and position', () => {
    const out = mapContentAssetFromDb({
      id: 'ca-1',
      org_id: 'org-1',
      user_id: 'u-1',
      draft_id: 'cd-1',
      type: 'thumbnail',
      url: 'https://cdn/x.png',
      provider: 'gemini_imagen',
      meta_json: { prompt: 'p' },
      credits_used: 30,
      position: 0,
      role: 'featured_image',
      alt_text: 'A cool image',
      webp_url: 'https://cdn/x.webp',
      source_type: 'ai_generated',
      created_at: '2026-04-13T00:00:00.000Z',
      updated_at: '2026-04-13T00:00:00.000Z',
    });
    expect(out.draftId).toBe('cd-1');
    expect(out.creditsUsed).toBe(30);
    expect(out.position).toBe(0);
    expect(out.provider).toBe('gemini_imagen');
    expect(out.role).toBe('featured_image');
    expect(out.altText).toBe('A cool image');
    expect(out.webpUrl).toBe('https://cdn/x.webp');
    expect(out.sourceType).toBe('ai_generated');
  });
});

describe('legacyKeywordFallback', () => {
  it('returns string array from legacy string[] shape', () => {
    expect(legacyKeywordFallback(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('returns keyword field from new shape', () => {
    expect(
      legacyKeywordFallback([
        { keyword: 'a', source_id: 'SRC-001' },
        { keyword: 'b', source_id: 'SRC-002' },
      ]),
    ).toEqual(['a', 'b']);
  });

  it('handles mixed shapes', () => {
    expect(
      legacyKeywordFallback([
        'legacy',
        { keyword: 'new', source_id: 'SRC-001' },
      ]),
    ).toEqual(['legacy', 'new']);
  });

  it('returns empty array for non-array input', () => {
    expect(legacyKeywordFallback(null)).toEqual([]);
    expect(legacyKeywordFallback(undefined)).toEqual([]);
    expect(legacyKeywordFallback('not-an-array')).toEqual([]);
  });

  it('filters out malformed entries', () => {
    expect(
      legacyKeywordFallback([
        'ok',
        { wrong: 'shape' },
        null,
        { keyword: 'good', source_id: 'SRC-001' },
      ]),
    ).toEqual(['ok', 'good']);
  });
});
