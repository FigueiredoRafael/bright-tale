/**
 * F2-018/019 — research-sessions endpoint tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

const mockChain: Record<string, any> = {};
[
  'from', 'select', 'insert', 'update', 'delete', 'upsert',
  'eq', 'in', 'order', 'limit',
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
vi.mock('@/lib/credits/reservations', () => ({
  reserve: vi.fn(async () => 'mock-token'),
  commit: vi.fn(async () => undefined),
  release: vi.fn(async () => undefined),
}));
vi.mock('@/lib/ai/promptLoader', () => ({
  loadAgentPrompt: vi.fn(async () => 'You are BC_RESEARCH.'),
}));
vi.mock('@/lib/ai/router', () => ({
  STAGE_COSTS: { brainstorm: 50, research: 100, production: 200, review: 50 },
  generateWithFallback: vi.fn(async () => ({
    result: {
      cards: [
        { type: 'source', title: 'A study', url: 'https://x', relevance: 9 },
        { type: 'quote', author: 'Expert', quote: 'wow' },
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

  it('enqueues research and returns 202 with session id', async () => {
    mockChain.single
      .mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null }) // org lookup
      .mockResolvedValueOnce({ data: { id: 'rs-1' }, error: null }); // insert session

    const res = await app.inject({
      method: 'POST',
      url: '/research-sessions',
      headers: AUTH_USER,
      // BRI-159: create schema now requires projectId OR channelId. This test
      // models the project-linked enqueue path (no ephemeral project created).
      payload: { level: 'medium', topic: 'deep work', focusTags: ['stats'], projectId: 'proj-1' },
    });

    // Research is enqueued and runs async via the research/generate job;
    // the route responds 202 Accepted with the session id so the client can
    // subscribe to SSE for live results.
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.data.sessionId).toBe('rs-1');
    expect(body.data.level).toBe('medium');
  });
});

describe('GET /research-sessions?status=completed — BRI-157 status derived from stage_runs', () => {
  it('returns sessions whose latest research stage_run is completed', async () => {
    // Mock 1: stage_runs query returns a completed run for project-42
    // Mock 2: research_sessions query returns matching session
    // The mockChain is shared, so we chain two sequential resolutions.
    // stage_runs query: .select().eq('stage').in('status').order()  → resolves with data
    // sessions query: .select().in('project_id').order().limit()    → resolves with data
    mockChain.order
      // First call: stage_runs ordered result (array with completed run)
      .mockReturnValueOnce({
        ...mockChain,
        data: [{ project_id: 'proj-42', status: 'completed', awaiting_reason: null }],
        error: null,
      })
      // Second call: sessions ordered + limit chain
      .mockReturnValue(mockChain);

    mockChain.limit
      .mockResolvedValueOnce({
        data: [{ id: 'rs-42', project_id: 'proj-42', channel_id: null, idea_id: null, level: 'medium', input_json: {}, cards_json: null, created_at: '2026-01-01' }],
        error: null,
      });

    const res = await app.inject({
      method: 'GET',
      url: '/research-sessions?status=completed',
      headers: AUTH_USER,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.sessions).toHaveLength(1);
    expect(body.data.sessions[0].status).toBe('completed');
    expect(body.data.sessions[0].id).toBe('rs-42');
  });
});

describe('PATCH /research-sessions/:id/review', () => {
  it('saves approved cards', async () => {
    // BRI-156 (D24a): review handler now fetches session first (maybeSingle)
    // to get project_id for Stage Run reconciliation, then does the update.
    // The old test only mocked .single() (for the update chain); now we also
    // need maybeSingle for the select, and we mock the stage_runs select
    // returning null (no project) so reconciliation is skipped.
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'rs-1', project_id: null, user_id: 'user-1' },
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
    // Handler now returns { id } not the full session row (no .select().single() on update).
    expect(body.data.id).toBe('rs-1');
  });
});
