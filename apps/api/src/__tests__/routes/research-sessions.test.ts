/**
 * F2-018/019 — research-sessions endpoint tests.
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
  loadAgentPrompt: vi.fn(async () => 'You are BC_RESEARCH.'),
}));
vi.mock('@/lib/ai/router', () => ({
  STAGE_COSTS: { brainstorm: 50, research: 100, production: 200, review: 50 },
  getRouteForStage: vi.fn(() => ({
    provider: {
      generateContent: vi.fn(async () => ({
        cards: [
          { type: 'source', title: 'A study', url: 'https://x', relevance: 9 },
          { type: 'quote', author: 'Expert', quote: 'wow' },
        ],
      })),
    },
  })),
}));

import { researchSessionsRoutes } from '@/routes/research-sessions';

const AUTH_USER = { 'x-internal-key': 'test-key', 'x-user-id': 'user-1' };

let app: FastifyInstance;

beforeEach(async () => {
  process.env.INTERNAL_API_KEY = 'test-key';
  vi.clearAllMocks();
  app = Fastify({ logger: false });
  await app.register(researchSessionsRoutes, { prefix: '/research-sessions' });
  await app.ready();
});

describe('POST /research-sessions', () => {
  it('rejects invalid level', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/research-sessions',
      headers: AUTH_USER,
      payload: { level: 'galaxy', topic: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('runs research and returns cards', async () => {
    mockChain.single
      .mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null }) // org lookup
      .mockResolvedValueOnce({ data: { id: 'rs-1' }, error: null }); // insert session

    const res = await app.inject({
      method: 'POST',
      url: '/research-sessions',
      headers: AUTH_USER,
      payload: { level: 'medium', topic: 'deep work', focusTags: ['stats'] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.sessionId).toBe('rs-1');
    expect(body.data.level).toBe('medium');
    expect(body.data.cards).toHaveLength(2);
  });
});

describe('PATCH /research-sessions/:id/review', () => {
  it('saves approved cards', async () => {
    mockChain.single.mockResolvedValueOnce({
      data: { id: 'rs-1', status: 'reviewed', approved_cards_json: [{ type: 'source' }] },
      error: null,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/research-sessions/rs-1/review',
      headers: AUTH_USER,
      payload: { approvedCardsJson: [{ type: 'source' }] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('reviewed');
  });
});
