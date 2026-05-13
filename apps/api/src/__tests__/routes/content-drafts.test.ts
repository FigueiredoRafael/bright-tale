/**
 * F2-020/F2-021 — content-drafts endpoint tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

const mockChain: Record<string, any> = {};
[
  'from', 'select', 'insert', 'update', 'delete', 'upsert',
  'eq', 'order', 'limit',
].forEach(m => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.single = vi.fn();
mockChain.maybeSingle = vi.fn();

vi.mock('@/lib/supabase', () => ({ createServiceClient: () => mockChain }));
vi.mock('@/middleware/authenticate', () => ({
  authenticate: vi.fn(async (request: any, reply: any) => {
    const key = request.headers['x-internal-key'];
    if (!key || key !== process.env.INTERNAL_API_KEY) {
      return reply.status(401).send({ data: null, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
    }
    request.userId = request.headers['x-user-id'];
  }),
}));
vi.mock('@/lib/api/fastify-errors', () => ({
  sendError: vi.fn(async (reply: any, error: any) => {
    const status = error?.status ?? error?.statusCode;
    if (status) {
      return reply.status(status).send({ data: null, error: { message: error.message, code: error.code } });
    }
    if (error?.name === 'ZodError') {
      return reply.status(400).send({ data: null, error: { message: 'Validation failed', code: 'VALIDATION_ERROR' } });
    }
    return reply.status(500).send({ data: null, error: { message: 'Server error', code: 'INTERNAL' } });
  }),
}));
vi.mock('@/lib/credits', () => ({
  checkCredits: vi.fn(async () => true),
  debitCredits: vi.fn(async () => undefined),
}));
vi.mock('@/lib/ai/promptLoader', () => ({
  loadAgentPrompt: vi.fn(async (slug: string) => `prompt:${slug}`),
}));
vi.mock('@/lib/ai/router', () => ({
  STAGE_COSTS: { brainstorm: 50, research: 100, production: 200, review: 50 },
  generateWithFallback: vi.fn(async (_stage: any, _tier: any, params: any) => ({
    result: { stage: params.input.stage, produced: true, body: 'fake content' },
    providerName: 'mock',
    model: 'mock',
    attempts: 1,
  })),
}));
vi.mock('@/lib/ai/channelContext', () => ({
  buildChannelContext: vi.fn(async () => 'channel: test\n'),
}));
vi.mock('@/lib/axiom', () => ({
  logAiUsage: vi.fn(),
}));

import { contentDraftsRoutes } from '@/routes/content-drafts';

const AUTH_USER = { 'x-internal-key': 'test-key', 'x-user-id': 'user-1' };

let app: FastifyInstance;

beforeEach(async () => {
  process.env.INTERNAL_API_KEY = 'test-key';
  vi.clearAllMocks();
  app = Fastify({ logger: false });
  await app.register(contentDraftsRoutes, { prefix: '/content-drafts' });
  await app.ready();
});

describe('POST /content-drafts', () => {
  it('rejects invalid type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content-drafts',
      headers: AUTH_USER,
      payload: { type: 'newsletter' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('creates blog draft', async () => {
    mockChain.single
      .mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'cd-1', type: 'blog', status: 'draft' }, error: null });

    const res = await app.inject({
      method: 'POST',
      url: '/content-drafts',
      headers: AUTH_USER,
      payload: { type: 'blog', title: 'Deep Work' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.type).toBe('blog');
  });
});

describe('POST /content-drafts/:id/canonical-core', () => {
  it('runs agent-3a and stores canonical_core_json', async () => {
    // loadDraft → maybeSingle returns draft; loadCreditSettings → maybeSingle returns null (uses defaults)
    mockChain.maybeSingle
      .mockResolvedValueOnce({
        data: { id: 'cd-1', type: 'blog', research_session_id: null, model_tier: 'standard' },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    // org lookup + draft update
    mockChain.single
      .mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null })
      .mockResolvedValueOnce({
        data: { id: 'cd-1', canonical_core_json: { stage: 'canonical-core', produced: true } },
        error: null,
      });
    // override generateWithFallback to avoid relying on params.input.stage
    const router = await import('@/lib/ai/router');
    (router.generateWithFallback as any).mockResolvedValueOnce({
      result: { stage: 'canonical-core', produced: true },
      providerName: 'mock',
      model: 'mock',
      attempts: 1,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/content-drafts/cd-1/canonical-core',
      headers: AUTH_USER,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.canonical_core_json.stage).toBe('canonical-core');
  });
});

describe('POST /content-drafts/:id/produce', () => {
  it('enqueues the production-produce job and returns 202 with queued status', async () => {
    // Route is now async: dispatches `production/produce` to Inngest and
    // returns 202 immediately. SSE on /:id/events streams progress; the
    // worker is responsible for writing the final draft_json.
    mockChain.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: 'cd-1',
          type: 'blog',
          canonical_core_json: { hook: 'x' },
          production_settings_json: { wordCountTarget: 1500 },
          model_tier: 'standard',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    mockChain.single.mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null });

    const res = await app.inject({
      method: 'POST',
      url: '/content-drafts/cd-1/produce',
      headers: AUTH_USER,
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.data.draftId).toBe('cd-1');
    expect(body.data.status).toBe('queued');
    expect(body.error).toBeNull();
  });
});

describe('POST /content-drafts/:id/generate-asset-prompts', () => {
  const DRAFT_ID = 'draft-1';
  const ORG_ID = 'org-1';

  it('returns BC_ASSETS_OUTPUT on AI path', async () => {
    // loadDraft chain — .maybeSingle() resolves the draft row.
    // buildAssetsInput chain — .maybeSingle() for channel lookup
    // Both use maybeSingle, so we need to mock both
    mockChain.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: DRAFT_ID,
          user_id: 'user-1',
          org_id: ORG_ID,
          channel_id: 'ch-1',
          type: 'blog',
          title: 'Sample',
          draft_json: { blog: { outline: [{ h2: 'Intro', key_points: ['a', 'b'] }] } },
          canonical_core_json: {},
          idea_id: null,
          model_tier: 'standard',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          niche: 'tech',
          niche_tags: ['ai'],
          tone: 'informative',
          language: 'English',
          market: 'global',
          region: 'US',
        },
        error: null,
      });
    // getOrgId chain — .single() resolves the org membership row.
    mockChain.single.mockResolvedValueOnce({
      data: { org_id: ORG_ID },
      error: null,
    });

    const router = await import('@/lib/ai/router');
    (router.generateWithFallback as any).mockResolvedValueOnce({
      result: {
        visual_direction: { style: 'minimal', color_palette: ['#000'], mood: 'calm', constraints: [] },
        slots: [{ slot: 'featured', section_title: 'Sample', prompt_brief: 'x', style_rationale: 'y', aspect_ratio: '16:9' }],
      },
      providerName: 'gemini',
      model: 'gemini-2.5-flash',
      attempts: 1,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/generate-asset-prompts`,
      headers: AUTH_USER,
      payload: { provider: 'gemini' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.slots).toHaveLength(1);
    expect(body.data.visual_direction.style).toBe('minimal');
    expect(body.error).toBeNull();
  });

  it('returns 202 awaiting_manual on manual path without calling the router', async () => {
    // loadDraft chain — .maybeSingle() resolves the draft row.
    // buildAssetsInput chain — .maybeSingle() for channel lookup
    mockChain.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: DRAFT_ID,
          user_id: 'user-1',
          org_id: ORG_ID,
          channel_id: 'ch-1',
          type: 'blog',
          title: 'Sample',
          draft_json: { blog: { outline: [{ h2: 'Intro', key_points: ['a', 'b'] }] } },
          canonical_core_json: {},
          idea_id: null,
          model_tier: 'standard',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          niche: 'tech',
          niche_tags: ['ai'],
          tone: 'informative',
          language: 'English',
          market: 'global',
          region: 'US',
        },
        error: null,
      });
    // getOrgId chain — .single() resolves the org membership row.
    mockChain.single.mockResolvedValueOnce({
      data: { org_id: ORG_ID },
      error: null,
    });

    const router = await import('@/lib/ai/router');
    (router.generateWithFallback as any).mockClear();

    const res = await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/generate-asset-prompts`,
      headers: AUTH_USER,
      payload: { provider: 'manual' },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.payload);
    expect(body.data.status).toBe('awaiting_manual');
    expect(typeof body.data.prompt).toBe('string');
    expect(body.data.prompt).toContain('BC_ASSETS_INPUT');
    expect((router.generateWithFallback as any).mock.calls.length).toBe(0);
  });

  it('surfaces LLM errors via the response envelope', async () => {
    // loadDraft chain — .maybeSingle() resolves the draft row.
    // buildAssetsInput chain — .maybeSingle() for channel lookup
    mockChain.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: DRAFT_ID,
          user_id: 'user-1',
          org_id: ORG_ID,
          channel_id: 'ch-1',
          type: 'blog',
          title: 'Sample',
          draft_json: { blog: { outline: [{ h2: 'Intro', key_points: ['a', 'b'] }] } },
          canonical_core_json: {},
          idea_id: null,
          model_tier: 'standard',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          niche: 'tech',
          niche_tags: ['ai'],
          tone: 'informative',
          language: 'English',
          market: 'global',
          region: 'US',
        },
        error: null,
      });
    // getOrgId chain — .single() resolves the org membership row.
    mockChain.single.mockResolvedValueOnce({
      data: { org_id: ORG_ID },
      error: null,
    });

    const router = await import('@/lib/ai/router');
    (router.generateWithFallback as any).mockRejectedValueOnce(new Error('provider down'));

    const res = await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/generate-asset-prompts`,
      headers: AUTH_USER,
      payload: { provider: 'gemini' },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.payload);
    expect(body.error).toBeTruthy();
  });
});
