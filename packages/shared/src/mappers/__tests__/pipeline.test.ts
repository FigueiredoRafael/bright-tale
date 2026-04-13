import { describe, it, expect } from 'vitest';
import {
  mapBrainstormSessionFromDb,
  mapResearchSessionFromDb,
  mapContentDraftFromDb,
  mapContentAssetFromDb,
} from '../db';

describe('mapBrainstormSessionFromDb', () => {
  it('converts snake_case DB row to camelCase', () => {
    const row = {
      id: 'bs-1',
      org_id: 'org-1',
      user_id: 'user-1',
      channel_id: 'ch-1',
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
      level: 'deep',
      focus_tags: ['stats', 'expert_advice'],
      input_json: {},
      cards_json: null,
      approved_cards_json: null,
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
      type: 'blog',
      title: 'Deep Work',
      canonical_core_json: { hook: 'x' },
      draft_json: { body: 'y' },
      review_feedback_json: null,
      status: 'scheduled',
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
      created_at: '2026-04-13T00:00:00.000Z',
      updated_at: '2026-04-13T00:00:00.000Z',
    });
    expect(out.draftId).toBe('cd-1');
    expect(out.creditsUsed).toBe(30);
    expect(out.position).toBe(0);
    expect(out.provider).toBe('gemini_imagen');
  });
});
