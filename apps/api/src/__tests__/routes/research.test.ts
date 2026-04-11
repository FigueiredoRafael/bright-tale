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
vi.mock('@brighttale/shared/schemas/research', async () => {
  const { z } = await import('zod');
  return {
    createResearchSchema: z.object({
      title: z.string().min(3).max(200),
      theme: z.string().min(2).max(100),
      research_content: z.string().min(10),
      idea_id: z.string().optional(),
    }),
    updateResearchSchema: z.object({
      title: z.string().min(3).max(200).optional(),
      theme: z.string().min(2).max(100).optional(),
      research_content: z.string().min(10).optional(),
      idea_id: z.string().optional(),
    }),
    listResearchQuerySchema: z.object({
      theme: z.string().optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().positive().default(1).optional(),
      limit: z.coerce.number().int().positive().max(100).default(20).optional(),
      sort: z.enum(['created_at', 'updated_at', 'title', 'projects_count', 'winners_count']).default('created_at').optional(),
      order: z.enum(['asc', 'desc']).default('desc').optional(),
    }),
    addSourceSchema: z.object({
      url: z.string().url(),
      title: z.string().min(2).max(300),
      author: z.string().max(200).optional(),
      date: z.string().datetime().optional(),
    }),
  };
});
vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { researchRoutes } from '../../routes/research';

const AUTH = { 'x-internal-key': 'test-key' };
const AUTH_USER = { ...AUTH, 'x-user-id': 'user-123' };

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockChain.single.mockResolvedValue({ data: { id: 'r-1', title: 'Test Research' }, error: null });
  mockChain.maybeSingle.mockResolvedValue({
    data: { id: 'r-1', title: 'Test Research', theme: 'tech', projects: [] },
    error: null,
  });
  Object.defineProperty(mockChain, 'data', {
    value: [{ id: 'r-1', title: 'Test Research' }],
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
  await app.register(researchRoutes, { prefix: '/research' });
  await app.ready();
});

describe('POST /research', () => {
  const validBody = {
    title: 'My Test Research',
    theme: 'technology',
    research_content: 'This is detailed research content that is long enough to pass validation.',
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'POST', url: '/research', payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with wrong auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/research',
      headers: { 'x-internal-key': 'wrong-key' },
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('creates research and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/research',
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
      url: '/research',
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
      url: '/research',
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
      url: '/research',
      headers: AUTH,
      payload: { title: 'X' }, // too short, missing fields
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /research', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/research' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with auth', async () => {
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      if (callCount % 2 === 1) {
        resolve({ count: 5, data: null, error: null });
      } else {
        resolve({ data: [{ id: 'r-1', title: 'Test Research' }], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'GET',
      url: '/research',
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
        resolve({ data: [{ id: 'r-1', title: 'Test Research' }], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    await app.inject({
      method: 'GET',
      url: '/research',
      headers: AUTH_USER,
    });

    expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'user-123');

    delete mockChain.then;
  });
});

describe('GET /research/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/research/r-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with a valid research', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'r-1', title: 'Test Research', theme: 'tech' },
      error: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/research/r-1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.id).toBe('r-1');
    expect(body.error).toBeNull();
  });

  it('returns 404 when research not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/research/nonexistent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /research/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/research/r-1',
      payload: { title: 'Updated Research Title' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when research not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PATCH',
      url: '/research/nonexistent',
      headers: AUTH,
      payload: { title: 'Updated Research Title' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('updates research and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'r-1', title: 'Old Title' },
      error: null,
    });
    mockChain.single.mockResolvedValueOnce({
      data: { id: 'r-1', title: 'Updated Research Title' },
      error: null,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/research/r-1',
      headers: AUTH,
      payload: { title: 'Updated Research Title' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
  });
});

describe('DELETE /research/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/research/r-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when research not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'DELETE',
      url: '/research/nonexistent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when research is used by projects', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'r-1', projects: [{ count: 3 }] },
      error: null,
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/research/r-1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('RESEARCH_IN_USE');
  });

  it('deletes research and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'r-1', projects: [{ count: 0 }] },
      error: null,
    });
    mockChain.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/research/r-1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.success).toBe(true);
  });
});

describe('GET /research/:id/sources', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/research/r-1/sources' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when research not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/research/nonexistent/sources',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns sources list with auth', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'r-1' },
      error: null,
    });
    // The second query (sources list) uses the chain directly
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      resolve({ data: [{ id: 's-1', url: 'https://example.com' }], error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'GET',
      url: '/research/r-1/sources',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.error).toBeNull();

    delete mockChain.then;
  });
});

describe('POST /research/:id/sources', () => {
  const validSource = {
    url: 'https://example.com/article',
    title: 'A Great Article About Technology',
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/research/r-1/sources',
      payload: validSource,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when research not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'POST',
      url: '/research/nonexistent/sources',
      headers: AUTH,
      payload: validSource,
    });
    expect(res.statusCode).toBe(404);
  });

  it('creates source and returns 201', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'r-1' },
      error: null,
    });
    mockChain.single.mockResolvedValueOnce({
      data: { id: 's-1', url: 'https://example.com/article', research_id: 'r-1' },
      error: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/research/r-1/sources',
      headers: AUTH,
      payload: validSource,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/research/r-1/sources',
      headers: AUTH,
      payload: { url: 'not-a-url', title: 'X' }, // invalid url, title too short
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /research/:id/sources/:sourceId', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/research/r-1/sources/s-1',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when source not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'DELETE',
      url: '/research/r-1/sources/nonexistent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when source does not belong to research', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 's-1', research_id: 'different-research' },
      error: null,
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/research/r-1/sources/s-1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_RESEARCH_ID');
  });

  it('deletes source and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 's-1', research_id: 'r-1' },
      error: null,
    });
    const origDelete = mockChain.delete;
    mockChain.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/research/r-1/sources/s-1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.success).toBe(true);

    mockChain.delete = origDelete;
  });
});

describe('GET /research/by-idea/:ideaId', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/research/by-idea/idea-123',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with research results', async () => {
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      resolve({ data: [{ id: 'r-1', title: 'Research for Idea' }], error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'GET',
      url: '/research/by-idea/idea-123',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.idea_id).toBe('idea-123');
    expect(body.error).toBeNull();

    delete mockChain.then;
  });
});
