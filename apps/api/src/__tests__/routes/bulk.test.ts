/**
 * F2-013 — bulk endpoint tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChain: Record<string, any> = {};
['from', 'select', 'insert', 'update', 'eq', 'order', 'limit', 'in'].forEach((m) => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.single = vi.fn();
mockChain.maybeSingle = vi.fn();

vi.mock('@/lib/supabase', () => ({ createServiceClient: () => mockChain }));
vi.mock('@/middleware/authenticate', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: vi.fn(async (req: any, reply: any) => {
    const key = req.headers['x-internal-key'];
    if (!key || key !== process.env.INTERNAL_API_KEY) {
      return reply.status(401).send({ data: null, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
    }
    req.userId = req.headers['x-user-id'];
  }),
}));
vi.mock('@/lib/api/fastify-errors', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendError: vi.fn(async (reply: any, error: any) => {
    const status = error?.status ?? error?.statusCode;
    if (status) return reply.status(status).send({ data: null, error: { message: error.message, code: error.code } });
    if (error?.name === 'ZodError') return reply.status(400).send({ data: null, error: { message: 'Validation failed', code: 'VALIDATION_ERROR' } });
    return reply.status(500).send({ data: null, error: { message: 'Server error', code: 'INTERNAL' } });
  }),
}));
vi.mock('@/lib/credits', () => ({
  checkCredits: vi.fn(async () => true),
}));
vi.mock('@/jobs/client', () => ({
  inngest: { send: vi.fn(async () => ({ ids: ['evt'] })) },
}));
vi.mock('@/jobs/emitter', () => ({
  emitJobEvent: vi.fn(async () => undefined),
}));

import { bulkRoutes } from '@/routes/bulk';

const AUTH = { 'x-internal-key': 'test-key', 'x-user-id': 'user-1' };
let app: FastifyInstance;

beforeEach(async () => {
  process.env.INTERNAL_API_KEY = 'test-key';
  vi.clearAllMocks();
  mockChain.single.mockResolvedValue({ data: { org_id: 'org-1' }, error: null });
  // loadCreditSettings → fall back to defaults via { data: null }
  mockChain.maybeSingle.mockResolvedValue({ data: null, error: null });
  app = Fastify({ logger: false });
  await app.register(bulkRoutes, { prefix: '/bulk' });
  await app.ready();
});

describe('POST /bulk/drafts', () => {
  it('rejects without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bulk/drafts',
      payload: { channelId: '00000000-0000-0000-0000-000000000001', researchSessionId: '00000000-0000-0000-0000-000000000002', type: 'blog', titles: ['a'] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects empty titles', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bulk/drafts',
      headers: AUTH,
      payload: { channelId: '00000000-0000-0000-0000-000000000001', researchSessionId: '00000000-0000-0000-0000-000000000002', type: 'blog', titles: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects more than 20 titles', async () => {
    const titles = Array.from({ length: 21 }, (_, i) => `Title ${i}`);
    const res = await app.inject({
      method: 'POST',
      url: '/bulk/drafts',
      headers: AUTH,
      payload: { channelId: '00000000-0000-0000-0000-000000000001', researchSessionId: '00000000-0000-0000-0000-000000000002', type: 'blog', titles },
    });
    expect(res.statusCode).toBe(400);
  });

  it('queues N drafts when payload is valid', async () => {
    mockChain.single
      .mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null }) // membership
      .mockResolvedValueOnce({ data: { id: 'draft-1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'draft-2' }, error: null });

    const res = await app.inject({
      method: 'POST',
      url: '/bulk/drafts',
      headers: AUTH,
      payload: {
        channelId: '00000000-0000-0000-0000-000000000001',
        researchSessionId: '00000000-0000-0000-0000-000000000002',
        type: 'blog',
        provider: 'ollama',
        titles: ['Post A', 'Post B'],
      },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.data.drafts).toHaveLength(2);
    expect(body.data.drafts[0].title).toBe('Post A');
    expect(body.data.totalCostReserved).toBe(0); // Ollama = free
  });
});
