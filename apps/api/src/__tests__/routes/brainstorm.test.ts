/**
 * F2-016 — brainstorm endpoint tests.
 * Focuses on auth + validation; full pipeline is exercised manually via
 * the dev environment because it spans the AI provider + Inngest.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

const mockChain: Record<string, any> = {};
[
  'from', 'select', 'insert', 'update', 'delete', 'upsert',
  'eq', 'neq', 'in', 'order', 'limit', 'range',
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
      return reply.status(status).send({
        data: null,
        error: { message: error.message, code: error.code },
      });
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
  loadAgentPrompt: vi.fn(async () => 'You are BC_BRAINSTORM.'),
}));
vi.mock('@/lib/ai/router', () => ({
  STAGE_COSTS: { brainstorm: 50, research: 100, production: 200, review: 50 },
  generateWithFallback: vi.fn(async () => ({
    result: {
      ideas: [
        { title: 'Mock idea A', target_audience: 'devs', verdict: 'viable' },
        { title: 'Mock idea B', target_audience: 'PMs', verdict: 'experimental' },
      ],
    },
    providerName: 'mock',
    model: 'mock',
    attempts: 1,
  })),
}));
vi.mock('@/jobs/client', () => ({
  inngest: { send: vi.fn(async () => ({ ids: ['evt-1'] })) },
}));
vi.mock('@/jobs/emitter', () => ({
  emitJobEvent: vi.fn(async () => undefined),
}));

import { brainstormRoutes } from '@/routes/brainstorm';

const AUTH = { 'x-internal-key': 'test-key' };
const AUTH_USER = { ...AUTH, 'x-user-id': 'user-1' };

let app: FastifyInstance;

beforeEach(async () => {
  process.env.INTERNAL_API_KEY = 'test-key';
  vi.clearAllMocks();
  mockChain.single.mockResolvedValue({ data: { id: 'session-1', org_id: 'org-1' }, error: null });
  mockChain.maybeSingle.mockResolvedValue({ data: null, error: null });

  app = Fastify({ logger: false });
  await app.register(brainstormRoutes, { prefix: '/brainstorm' });
  await app.ready();
});

describe('POST /brainstorm/sessions', () => {
  it('rejects without internal key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/brainstorm/sessions',
      payload: { inputMode: 'blind', topic: 'ai' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects without user id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/brainstorm/sessions',
      headers: AUTH,
      payload: { inputMode: 'blind', topic: 'ai' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid input mode', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/brainstorm/sessions',
      headers: AUTH_USER,
      payload: { inputMode: 'invalid', topic: 'ai' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts blind mode with topic', async () => {
    // First single: org_membership lookup → returns org_id
    mockChain.single
      .mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'session-1' }, error: null });

    const res = await app.inject({
      method: 'POST',
      url: '/brainstorm/sessions',
      headers: AUTH_USER,
      payload: { inputMode: 'blind', topic: 'ai productivity' },
    });

    // F2-036: POST now enqueues the job and returns 202 with just the sessionId.
    // The actual ideas are produced asynchronously by the Inngest function and
    // streamed via GET /sessions/:id/events (SSE).
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.error).toBeNull();
    expect(body.data.sessionId).toBe('session-1');
    expect(body.data.status).toBe('queued');
  });

  it('accepts reference_guided without topic when URL provided', async () => {
    mockChain.single
      .mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'session-2' }, error: null });

    const res = await app.inject({
      method: 'POST',
      url: '/brainstorm/sessions',
      headers: AUTH_USER,
      payload: {
        inputMode: 'reference_guided',
        referenceUrl: 'https://youtube.com/watch?v=abc',
      },
    });

    expect(res.statusCode).toBe(202);
  });
});
