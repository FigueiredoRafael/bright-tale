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
vi.mock('@brighttale/shared/schemas/ideas', async () => {
  const { z } = await import('zod');
  return {
    listIdeasQuerySchema: z.object({
      verdict: z.enum(['viable', 'weak', 'experimental']).optional(),
      source_type: z.enum(['brainstorm', 'import', 'manual']).optional(),
      tags: z.string().optional(),
      search: z.string().optional(),
      is_public: z.coerce.boolean().optional(),
      page: z.coerce.number().int().positive().default(1).optional(),
      limit: z.coerce.number().int().positive().max(100).default(20).optional(),
    }),
    createIdeaSchema: z.object({
      idea_id: z.string().regex(/^BC-IDEA-\d{3,}$/).optional(),
      title: z.string().min(5).max(200),
      core_tension: z.string().default(''),
      target_audience: z.string().default(''),
      verdict: z.enum(['viable', 'weak', 'experimental']).default('experimental'),
      discovery_data: z.string().optional().default(''),
      source_type: z.enum(['brainstorm', 'import', 'manual']).default('manual'),
      source_project_id: z.string().optional(),
      tags: z.array(z.string()).optional().default([]),
      is_public: z.boolean().optional().default(true),
      markdown_content: z.string().optional(),
    }),
    updateIdeaSchema: z.object({
      title: z.string().min(5).max(200).optional(),
      core_tension: z.string().optional(),
      target_audience: z.string().optional(),
      verdict: z.enum(['viable', 'weak', 'experimental']).optional(),
      discovery_data: z.string().optional(),
      tags: z.array(z.string()).optional(),
      is_public: z.boolean().optional(),
      markdown_content: z.string().optional(),
    }),
    calculateSimilarity: vi.fn().mockReturnValue(0),
    SimilarityWarning: {},
  };
});
vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { ideasRoutes } from '../../routes/ideas';

const AUTH = { 'x-internal-key': 'test-key' };
const AUTH_USER = { ...AUTH, 'x-user-id': 'user-123' };

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();

  mockChain.single.mockResolvedValue({ data: { id: 'idea-1', idea_id: 'BC-IDEA-001', title: 'Test Idea' }, error: null });
  mockChain.maybeSingle.mockResolvedValue({
    data: { id: 'idea-1', idea_id: 'BC-IDEA-001', title: 'Test Idea' },
    error: null,
  });
  Object.defineProperty(mockChain, 'data', {
    value: [{ id: 'idea-1', idea_id: 'BC-IDEA-001', title: 'Test Idea' }],
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
  await app.register(ideasRoutes, { prefix: '/ideas' });
  await app.ready();
});

// ──────────────────────────────────────────────
// POST /ideas/archive
// ──────────────────────────────────────────────
describe('POST /ideas/archive', () => {
  const validBody = {
    ideas: [
      {
        idea_id: 'BC-IDEA-001',
        title: 'Test Idea Title',
        core_tension: 'This is the core tension for the idea',
        target_audience: 'Target audience here',
        verdict: 'viable',
      },
    ],
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'POST', url: '/ideas/archive', payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with wrong auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ideas/archive',
      headers: { 'x-internal-key': 'wrong-key' },
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('archives ideas and returns 200', async () => {
    mockChain.select.mockReturnValue({
      ...mockChain,
      then: (resolve: (v: any) => void) => {
        resolve({ data: [{ id: 'idea-1' }], error: null });
        return { catch: vi.fn() };
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/ideas/archive',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ideas/archive',
      headers: AUTH,
      payload: { ideas: [] }, // empty array fails .min(1)
    });
    expect(res.statusCode).toBe(400);
  });
});

// ──────────────────────────────────────────────
// GET /ideas/library
// ──────────────────────────────────────────────
describe('GET /ideas/library', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/ideas/library' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with auth', async () => {
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      if (callCount % 2 === 1) {
        resolve({ count: 5, data: null, error: null });
      } else {
        resolve({ data: [{ id: 'idea-1', title: 'Test Idea' }], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'GET',
      url: '/ideas/library',
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
        resolve({ data: [{ id: 'idea-1', title: 'Test Idea' }], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    await app.inject({
      method: 'GET',
      url: '/ideas/library',
      headers: AUTH_USER,
    });

    expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'user-123');

    delete mockChain.then;
  });
});

// ──────────────────────────────────────────────
// POST /ideas/library
// ──────────────────────────────────────────────
describe('POST /ideas/library', () => {
  const validBody = {
    title: 'A great new idea for testing',
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'POST', url: '/ideas/library', payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it('creates idea and returns 201', async () => {
    // First select: existing ideas for similarity check
    // Second: count for idea_id generation
    // Third: check collision
    // Fourth: insert
    let selectCallCount = 0;
    mockChain.select.mockImplementation((...args: any[]) => {
      selectCallCount++;
      return mockChain;
    });
    mockChain.maybeSingle.mockResolvedValue({ data: null, error: null }); // no collision
    mockChain.single.mockResolvedValue({
      data: { id: 'idea-new', idea_id: 'BC-IDEA-002', title: 'A great new idea for testing' },
      error: null,
    });

    // The select for existing ideas (similarity) returns empty array
    // Mock the chained call ending in promise resolution
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ data: [], error: null, count: 0 });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'POST',
      url: '/ideas/library',
      headers: AUTH,
      payload: validBody,
    });

    delete mockChain.then;

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('includes user_id in insert', async () => {
    mockChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockChain.single.mockResolvedValue({
      data: { id: 'idea-new', idea_id: 'BC-IDEA-002', title: 'A great new idea for testing' },
      error: null,
    });

    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ data: [], error: null, count: 0 });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    await app.inject({
      method: 'POST',
      url: '/ideas/library',
      headers: AUTH_USER,
      payload: validBody,
    });

    delete mockChain.then;

    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-123' }),
    );
  });

  it('returns 400 for invalid body (title too short)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ideas/library',
      headers: AUTH,
      payload: { title: 'Bad' }, // too short
    });
    expect(res.statusCode).toBe(400);
  });
});

// ──────────────────────────────────────────────
// GET /ideas/library/:id
// ──────────────────────────────────────────────
describe('GET /ideas/library/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/ideas/library/idea-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with a valid idea', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'idea-1', idea_id: 'BC-IDEA-001', title: 'Test Idea' },
      error: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/ideas/library/idea-1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.idea.id).toBe('idea-1');
    expect(body.error).toBeNull();
  });

  it('returns 404 when idea not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/ideas/library/nonexistent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

// ──────────────────────────────────────────────
// PATCH /ideas/library/:id
// ──────────────────────────────────────────────
describe('PATCH /ideas/library/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/ideas/library/idea-1',
      payload: { title: 'Updated Idea Title Here' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when idea not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PATCH',
      url: '/ideas/library/nonexistent',
      headers: AUTH,
      payload: { title: 'Updated Idea Title Here' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('updates idea and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'idea-1' },
      error: null,
    });
    mockChain.single.mockResolvedValueOnce({
      data: { id: 'idea-1', title: 'Updated Idea Title Here' },
      error: null,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/ideas/library/idea-1',
      headers: AUTH,
      payload: { title: 'Updated Idea Title Here' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
  });
});

// ──────────────────────────────────────────────
// DELETE /ideas/library/:id
// ──────────────────────────────────────────────
describe('DELETE /ideas/library/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/ideas/library/idea-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when idea not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'DELETE',
      url: '/ideas/library/nonexistent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
  });

  it('deletes idea and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'idea-1' },
      error: null,
    });
    mockChain.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/ideas/library/idea-1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.deleted).toBe(true);
  });
});
