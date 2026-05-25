/**
 * M-005 — user notifications endpoint tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

const mockChain: Record<string, unknown> = {};
[
  'from', 'select', 'insert', 'update', 'delete',
  'eq', 'order', 'limit',
].forEach((m) => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});

vi.mock('@/lib/supabase/index', () => ({ createServiceClient: () => mockChain }));
vi.mock('@/middleware/authenticate', () => ({
  authenticate: vi.fn(async (request: { headers: Record<string, string>; userId?: string }, reply: { status: (n: number) => { send: (b: unknown) => void }; }) => {
    const key = request.headers['x-internal-key'];
    if (!key || key !== process.env.INTERNAL_API_KEY) {
      return reply.status(401).send({ data: null, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
    }
    request.userId = request.headers['x-user-id'];
  }),
}));
vi.mock('@/lib/api/fastify-errors', () => ({
  sendError: vi.fn(async (reply: { status: (n: number) => { send: (b: unknown) => void }; }, error: { status?: number; statusCode?: number; message?: string; code?: string }) => {
    const status = error?.status ?? error?.statusCode;
    if (status) {
      return reply.status(status).send({ data: null, error: { message: error.message, code: error.code } });
    }
    return reply.status(500).send({ data: null, error: { message: 'Server error', code: 'INTERNAL' } });
  }),
}));

import { userNotificationsRoutes } from '@/routes/notifications';

const AUTH_HEADERS = { 'x-internal-key': 'test-key', 'x-user-id': 'user-1' };

let app: FastifyInstance;

beforeEach(async () => {
  process.env.INTERNAL_API_KEY = 'test-key';
  vi.clearAllMocks();
  // Reset mockChain so each test can set its own return value.
  ['from', 'select', 'insert', 'update', 'delete', 'eq', 'order', 'limit'].forEach((m) => {
    (mockChain[m] as ReturnType<typeof vi.fn>).mockReturnValue(mockChain);
  });
  app = Fastify({ logger: false });
  await app.register(userNotificationsRoutes, { prefix: '/notifications' });
  await app.ready();
});

describe('GET /notifications', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/notifications',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns notification list', async () => {
    const fakeNotifs = [
      { id: 'n1', user_id: 'user-1', type: 'plan_renewed', title: 'Plano ativado!', body: null, action_url: null, is_read: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ];
    // The chain ends with limit() returning { data, error }
    (mockChain.limit as ReturnType<typeof vi.fn>).mockResolvedValue({ data: fakeNotifs, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: AUTH_HEADERS,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { notifications: unknown[] } };
    expect(body.data.notifications).toHaveLength(1);
  });

  it('filters unread when ?unread=true', async () => {
    // Let limit() return the mock chain (default) so the conditional eq chain works.
    // The second eq('is_read', false) is called on the chain; await chain resolves to
    // undefined which the route normalises to [].
    await app.inject({
      method: 'GET',
      url: '/notifications?unread=true',
      headers: AUTH_HEADERS,
    });

    expect(mockChain.eq).toHaveBeenCalledWith('is_read', false);
  });
});

describe('PATCH /notifications/read-all', () => {
  it('marks all notifications as read', async () => {
    // The chain ends with eq() returning { error: null }
    (mockChain.eq as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(mockChain) // .eq('user_id', ...)
      .mockResolvedValueOnce({ error: null }); // .eq('is_read', false)

    const res = await app.inject({
      method: 'PATCH',
      url: '/notifications/read-all',
      headers: AUTH_HEADERS,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { success: boolean } };
    expect(body.data.success).toBe(true);
  });
});
