import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// Chainable supabase mock
const mockChain: Record<string, any> = {};
[
  'from', 'select', 'insert', 'update', 'delete', 'upsert',
  'eq', 'neq', 'in', 'ilike', 'or', 'overlaps', 'filter',
  'order', 'limit', 'range',
].forEach(m => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.single = vi.fn();
mockChain.maybeSingle = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => mockChain,
}));
vi.mock('@/middleware/authenticate', () => ({
  authenticate: vi.fn(async (request: any, reply: any) => {
    const key = request.headers['x-internal-key'];
    if (!key || key !== process.env.INTERNAL_API_KEY) {
      return reply.status(401).send({
        data: null,
        error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
      });
    }
    const userId = request.headers['x-user-id'];
    request.userId = typeof userId === 'string' ? userId : undefined;
  }),
}));
vi.mock('@/lib/api/fastify-errors', () => ({
  sendError: vi.fn(async (reply: any, error: any) => {
    if (error && error.statusCode) {
      return reply.status(error.statusCode).send({
        data: null,
        error: { message: error.message, code: error.code },
      });
    }
    if (error && error.name === 'ZodError') {
      return reply.status(400).send({
        data: null,
        error: { message: 'Validation error', code: 'VALIDATION_ERROR' },
      });
    }
    return reply.status(500).send({
      data: null,
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
    });
  }),
}));
vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { agentsRoutes } from '../../routes/agents';

const AUTH = { 'x-internal-key': 'test-key' };

const mockAgent = {
  id: 'agent-1',
  name: 'Brainstorm Agent',
  slug: 'brainstorm',
  stage: 1,
  instructions: 'You are a brainstorm assistant...',
  input_schema: '{}',
  output_schema: '{}',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockChain.single.mockResolvedValue({ data: mockAgent, error: null });
  mockChain.maybeSingle.mockResolvedValue({ data: mockAgent, error: null });
  Object.defineProperty(mockChain, 'data', {
    value: [mockAgent],
    writable: true,
    configurable: true,
  });
  Object.defineProperty(mockChain, 'error', {
    value: null,
    writable: true,
    configurable: true,
  });

  app = Fastify({ logger: false });
  await app.register(agentsRoutes, { prefix: '/agents' });
  await app.ready();
});

describe('GET /agents', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/agents' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with list of agents', async () => {
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      resolve({ data: [mockAgent], error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'GET',
      url: '/agents',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.agents).toBeDefined();
    expect(body.error).toBeNull();

    delete mockChain.then;
  });

  it('orders agents by stage ascending', async () => {
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ data: [mockAgent], error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    await app.inject({
      method: 'GET',
      url: '/agents',
      headers: AUTH,
    });

    expect(mockChain.order).toHaveBeenCalledWith('stage', { ascending: true });

    delete mockChain.then;
  });
});

describe('GET /agents/:slug', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/agents/brainstorm' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with agent data', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockAgent, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/agents/brainstorm',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.agent).toBeDefined();
    expect(body.data.agent.slug).toBe('brainstorm');
    expect(body.error).toBeNull();
  });

  it('returns 404 when agent not found with special response shape', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/agents/nonexistent',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    // Matches original pattern: { data: { error: { message, code } }, error: null }
    expect(body.error).toBeNull();
    expect(body.data.error).toBeDefined();
    expect(body.data.error.code).toBe('AGENT_NOT_FOUND');
  });

  it('queries by slug', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockAgent, error: null });

    await app.inject({
      method: 'GET',
      url: '/agents/brainstorm',
      headers: AUTH,
    });

    expect(mockChain.eq).toHaveBeenCalledWith('slug', 'brainstorm');
  });
});

describe('PUT /agents/:slug', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/agents/brainstorm',
      payload: { instructions: 'Updated instructions' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when agent not found with special response shape', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PUT',
      url: '/agents/nonexistent',
      headers: AUTH,
      payload: { instructions: 'Updated instructions' },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    // Matches original pattern: { data: { error: { message, code } }, error: null }
    expect(body.error).toBeNull();
    expect(body.data.error).toBeDefined();
    expect(body.data.error.code).toBe('AGENT_NOT_FOUND');
  });

  it('updates agent and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'agent-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({
      data: { ...mockAgent, instructions: 'Updated instructions' },
      error: null,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/agents/brainstorm',
      headers: AUTH,
      payload: { instructions: 'Updated instructions' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.agent).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('includes updated_at timestamp in update', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'agent-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({ data: mockAgent, error: null });

    await app.inject({
      method: 'PUT',
      url: '/agents/brainstorm',
      headers: AUTH,
      payload: { instructions: 'Updated instructions' },
    });

    expect(mockChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ updated_at: expect.any(String) }),
    );
  });

  it('returns 400 for invalid body (name too long)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/agents/brainstorm',
      headers: AUTH,
      payload: { name: 'a'.repeat(101) }, // exceeds max(100)
    });

    expect(res.statusCode).toBe(400);
  });
});
