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
    // loadDraft → maybeSingle returns draft
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'cd-1', type: 'blog', research_session_id: null, model_tier: 'standard' },
      error: null,
    });
    // org lookup
    mockChain.single
      .mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null })
      .mockResolvedValueOnce({
        data: { id: 'cd-1', canonical_core_json: { stage: 'canonical-core', produced: true } },
        error: null,
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
  it('runs agent-3b-{type} and stores draft_json', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'cd-1',
        type: 'blog',
        canonical_core_json: { hook: 'x' },
        model_tier: 'standard',
      },
      error: null,
    });
    mockChain.single
      .mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null })
      .mockResolvedValueOnce({
        data: { id: 'cd-1', draft_json: { stage: 'produce', produced: true }, status: 'in_review' },
        error: null,
      });

    const res = await app.inject({
      method: 'POST',
      url: '/content-drafts/cd-1/produce',
      headers: AUTH_USER,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('in_review');
    expect(body.data.draft_json.stage).toBe('produce');
  });
});
