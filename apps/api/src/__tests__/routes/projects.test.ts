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
vi.mock('@/lib/api/errors', () => ({
  ApiError: class ApiError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, message: string, code: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
}));
vi.mock('@/lib/idempotency', () => ({
  createKey: vi.fn(),
  getKeyByToken: vi.fn().mockResolvedValue(null),
  consumeKey: vi.fn(),
}));
vi.mock('@/lib/config', () => ({
  ENABLE_BULK_LIMITS: false,
  MAX_BULK_CREATE: 50,
  AI_PROVIDER: 'mock',
  IDEMPOTENCY_TOKEN_TTL_SECONDS: 3600,
}));
vi.mock('@/lib/queries/discovery', () => ({
  createProjectsFromDiscovery: vi.fn().mockResolvedValue({ success: true }),
}));
vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { projectsRoutes } from '../../routes/projects';

const AUTH = { 'x-internal-key': 'test-key' };
const AUTH_USER = { ...AUTH, 'x-user-id': 'user-123' };

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockChain.single.mockResolvedValue({ data: { id: 'p-1', title: 'Test' }, error: null });
  mockChain.maybeSingle.mockResolvedValue({
    data: {
      id: 'p-1',
      title: 'Test',
      projects_count: 0,
      winners_count: 0,
      research_id: null,
    },
    error: null,
  });
  Object.defineProperty(mockChain, 'data', {
    value: [{ id: 'p-1', title: 'Test' }],
    writable: true,
    configurable: true,
  });
  Object.defineProperty(mockChain, 'error', {
    value: null,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(mockChain, 'count', {
    value: 1,
    writable: true,
    configurable: true,
  });
  app = Fastify({ logger: false });
  await app.register(projectsRoutes, { prefix: '/projects' });
  await app.ready();
});

describe('POST /projects', () => {
  const validBody = {
    title: 'My Test Project',
    current_stage: 'brainstorm',
    mode: 'step-by-step',
    status: 'active',
    winner: false,
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'POST', url: '/projects', payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with wrong auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      headers: { 'x-internal-key': 'wrong-key' },
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('creates a project and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('inserts user_id from X-User-Id header', async () => {
    await app.inject({
      method: 'POST',
      url: '/projects',
      headers: AUTH_USER,
      payload: validBody,
    });
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-123' }),
    );
  });

  it('inserts null user_id when X-User-Id header is absent', async () => {
    await app.inject({
      method: 'POST',
      url: '/projects',
      headers: AUTH,
      payload: validBody,
    });
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: null }),
    );
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      headers: AUTH,
      payload: { title: 'X' }, // title too short, missing fields
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /projects', () => {
  beforeEach(() => {
    // For list queries we need both count and data
    // mockChain is used for both queries via Promise.all
    // The mock is chainable and returns itself; count/data/error are on the chain
    mockChain.order.mockReturnValue(mockChain);
    mockChain.range.mockReturnValue(mockChain);
    // Simulate the two parallel queries returning count and data
    // We need maybeSingle to NOT be called for list; count query resolves via the chain itself
    // Using a simple approach: make the chain thenable so awaiting it gives count
  });

  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/projects' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with auth', async () => {
    // Override Promise.all behavior by making the chain resolve
    // The GET handler does Promise.all([countQuery, dataQuery])
    // Each query is the chain itself; we need them to resolve with { count, data, error }
    // Since the chain is the same object, both resolve to mockChain
    // We use then/catch via the thenable protocol
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      if (callCount % 2 === 1) {
        resolve({ count: 5, data: null, error: null });
      } else {
        resolve({ data: [{ id: 'p-1', title: 'Test' }], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'GET',
      url: '/projects',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();

    delete mockChain.then;
  });

  it('filters by user_id when X-User-Id header is present', async () => {
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      if (callCount % 2 === 1) {
        resolve({ count: 1, data: null, error: null });
      } else {
        resolve({ data: [{ id: 'p-1', title: 'Test' }], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    await app.inject({
      method: 'GET',
      url: '/projects',
      headers: AUTH_USER,
    });

    expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'user-123');

    delete mockChain.then;
  });

  it('does not filter by user_id when X-User-Id header is absent', async () => {
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      if (callCount % 2 === 1) {
        resolve({ count: 1, data: null, error: null });
      } else {
        resolve({ data: [{ id: 'p-1', title: 'Test' }], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    await app.inject({
      method: 'GET',
      url: '/projects',
      headers: AUTH,
    });

    const eqCalls = mockChain.eq.mock.calls;
    const userIdCalls = eqCalls.filter((c: any[]) => c[0] === 'user_id');
    expect(userIdCalls).toHaveLength(0);

    delete mockChain.then;
  });
});

describe('GET /projects/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/projects/p-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with a valid project', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'p-1', title: 'Test', research_id: null },
      error: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/projects/p-1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.id).toBe('p-1');
    expect(body.error).toBeNull();
  });

  it('returns 404 when project not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/projects/nonexistent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /projects/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/projects/p-1' });
    expect(res.statusCode).toBe(401);
  });

  it('deletes a project and returns 200', async () => {
    // First maybeSingle returns the project, delete returns no error
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'p-1', title: 'Test', research_id: null, winner: false },
      error: null,
    });
    // delete chain: mockChain.delete().eq('id', id) => resolves to { error: null }
    mockChain.eq.mockReturnValue({ ...mockChain, then: undefined });

    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ error: null });
      return { catch: vi.fn() };
    });

    // We need the delete chain to resolve
    const origDelete = mockChain.delete;
    mockChain.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/projects/p-1',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.success).toBe(true);

    mockChain.delete = origDelete;
  });

  it('returns 404 when project not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'DELETE',
      url: '/projects/nonexistent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /projects/bulk-create', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects/bulk-create',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 501 when createProjectsFromDiscovery is not implemented', async () => {
    const { createProjectsFromDiscovery } = await import('@/lib/queries/discovery');
    vi.mocked(createProjectsFromDiscovery).mockRejectedValueOnce(
      new Error('createProjectsFromDiscovery not implemented'),
    );

    const validPayload = {
      research: {
        ideas: [
          {
            idea_id: 'BC-IDEA-001',
            title: 'A great title for the idea that is long enough',
            core_tension: 'This is the core tension of the idea which needs to be at least 20 chars',
            target_audience: 'People who care about this topic',
            search_intent: 'informational',
            primary_keyword: {
              keyword: 'test keyword',
              difficulty: 'low',
              basis: 'This is the basis for the keyword selection',
            },
            mrbeast_hook: 'This hook is designed to grab attention immediately and make people watch',
            monetization: { affiliate_angle: 'Promote products related to this topic' },
            why_it_wins: 'This idea wins because it addresses a gap in the market effectively',
            repurpose_map: {
              blog: 'Write a detailed blog post covering all aspects',
              video: 'Create a tutorial video demonstrating the concept',
              shorts: ['Quick tip short video about this topic'],
              podcast: 'Record a podcast episode discussing the details',
            },
            risk_flags: [],
            verdict: 'viable',
          },
        ],
        pick_recommendation: { best_choice: 'BC-IDEA-001', why: 'This is why this idea is the best choice for the current situation' },
      },
      selected_ideas: ['BC-IDEA-001'],
      defaults: {},
    };

    const res = await app.inject({
      method: 'POST',
      url: '/projects/bulk-create',
      headers: AUTH,
      payload: validPayload,
    });

    expect(res.statusCode).toBe(501);
  });
});

describe('POST /projects/bulk', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects/bulk',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid operation', async () => {
    // Ensure projects exist mock
    Object.defineProperty(mockChain, 'data', {
      value: [{ id: 'cltest00001' }],
      writable: true,
      configurable: true,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/projects/bulk',
      headers: AUTH,
      payload: {
        operation: 'invalid_operation',
        project_ids: ['cltest00001'],
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /projects/:id/winner', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects/p-1/winner',
      payload: { winner: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when project not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'POST',
      url: '/projects/nonexistent/winner',
      headers: AUTH,
      payload: { winner: true },
    });
    expect(res.statusCode).toBe(404);
  });

  it('marks project as winner and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'p-1', title: 'Test', research_id: null, winner: false },
      error: null,
    });
    mockChain.single.mockResolvedValueOnce({
      data: { id: 'p-1', title: 'Test', winner: true },
      error: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/projects/p-1/winner',
      headers: AUTH,
      payload: { winner: true },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.success).toBe(true);
    expect(body.data.message).toBe('Project marked as winner');
  });
});
