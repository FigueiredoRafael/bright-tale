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
vi.mock('@brighttale/shared/schemas/canonicalCoreApi', async () => {
  const { z } = await import('zod');
  const argumentStepSchema = z.object({
    step: z.number().int().positive(),
    claim: z.string().min(1),
    evidence: z.string().min(1),
    source_ids: z.array(z.string()).optional(),
  });
  const emotionalArcSchema = z.object({
    opening_emotion: z.string().min(1),
    turning_point: z.string().min(1),
    closing_emotion: z.string().min(1),
  });
  const keyStatSchema = z.object({
    stat: z.string().min(1),
    figure: z.string().min(1),
    source_id: z.string().optional(),
  });
  const keyQuoteSchema = z.object({
    quote: z.string().min(1),
    author: z.string().min(1),
    credentials: z.string().optional(),
  });
  const affiliateMomentSchema = z.object({
    trigger_context: z.string().min(1),
    product_angle: z.string().min(1),
    cta_primary: z.string().min(1),
  });
  const createCanonicalCoreSchema = z.object({
    idea_id: z.string().min(1),
    project_id: z.string().optional(),
    thesis: z.string().min(1),
    argument_chain: z.array(argumentStepSchema).min(1),
    emotional_arc: emotionalArcSchema,
    key_stats: z.array(keyStatSchema),
    key_quotes: z.array(keyQuoteSchema).optional(),
    affiliate_moment: affiliateMomentSchema.optional(),
    cta_subscribe: z.string().optional(),
    cta_comment_prompt: z.string().optional(),
  });
  const updateCanonicalCoreSchema = createCanonicalCoreSchema
    .omit({ idea_id: true })
    .partial()
    .extend({
      argument_chain: z.array(argumentStepSchema).min(1).optional(),
    });
  return { createCanonicalCoreSchema, updateCanonicalCoreSchema };
});
vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { canonicalCoreRoutes } from '../../routes/canonical-core';

const AUTH = { 'x-internal-key': 'test-key' };
const AUTH_USER = { ...AUTH, 'x-user-id': 'user-123' };

const validBody = {
  idea_id: 'idea-1',
  thesis: 'This is the thesis',
  argument_chain: [{ step: 1, claim: 'Claim 1', evidence: 'Evidence 1' }],
  emotional_arc: {
    opening_emotion: 'Curiosity',
    turning_point: 'Revelation',
    closing_emotion: 'Satisfaction',
  },
  key_stats: [{ stat: 'Growth rate', figure: '50%' }],
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockChain.single.mockResolvedValue({ data: { id: 'cc-1', thesis: 'Test thesis' }, error: null });
  mockChain.maybeSingle.mockResolvedValue({
    data: { id: 'cc-1', thesis: 'Test thesis' },
    error: null,
  });
  Object.defineProperty(mockChain, 'data', {
    value: [{ id: 'cc-1', thesis: 'Test thesis' }],
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
  await app.register(canonicalCoreRoutes, { prefix: '/canonical-core' });
  await app.ready();
});

describe('GET /canonical-core', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/canonical-core' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with auth', async () => {
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      if (callCount % 2 === 1) {
        resolve({ count: 2, data: null, error: null });
      } else {
        resolve({ data: [{ id: 'cc-1', thesis: 'Test thesis' }], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'GET',
      url: '/canonical-core',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.canonical_cores).toBeDefined();
    expect(body.data.pagination).toBeDefined();
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
        resolve({ data: [{ id: 'cc-1' }], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    await app.inject({
      method: 'GET',
      url: '/canonical-core',
      headers: AUTH_USER,
    });

    expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'user-123');

    delete mockChain.then;
  });

  it('filters by idea_id query param', async () => {
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      if (callCount % 2 === 1) {
        resolve({ count: 1, data: null, error: null });
      } else {
        resolve({ data: [{ id: 'cc-1' }], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    await app.inject({
      method: 'GET',
      url: '/canonical-core?idea_id=idea-1',
      headers: AUTH,
    });

    expect(mockChain.eq).toHaveBeenCalledWith('idea_id', 'idea-1');

    delete mockChain.then;
  });
});

describe('POST /canonical-core', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'POST', url: '/canonical-core', payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it('creates canonical core and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/canonical-core',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.canonical_core).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('inserts user_id from X-User-Id header', async () => {
    await app.inject({
      method: 'POST',
      url: '/canonical-core',
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
      url: '/canonical-core',
      headers: AUTH,
      payload: validBody,
    });
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: null }),
    );
  });

  it('JSON.stringifies argument_chain on insert', async () => {
    await app.inject({
      method: 'POST',
      url: '/canonical-core',
      headers: AUTH,
      payload: validBody,
    });
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        argument_chain_json: JSON.stringify(validBody.argument_chain),
      }),
    );
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/canonical-core',
      headers: AUTH,
      payload: { thesis: 'only thesis, missing required fields' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /canonical-core/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/canonical-core/cc-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with a valid canonical core', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'cc-1', thesis: 'Test thesis' },
      error: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/canonical-core/cc-1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.canonical_core.id).toBe('cc-1');
    expect(body.error).toBeNull();
  });

  it('returns 404 when canonical core not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/canonical-core/nonexistent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('PUT /canonical-core/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/canonical-core/cc-1',
      payload: { thesis: 'Updated thesis' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when canonical core not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PUT',
      url: '/canonical-core/nonexistent',
      headers: AUTH,
      payload: { thesis: 'Updated thesis' },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('updates canonical core and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'cc-1' },
      error: null,
    });
    mockChain.single.mockResolvedValueOnce({
      data: { id: 'cc-1', thesis: 'Updated thesis' },
      error: null,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/canonical-core/cc-1',
      headers: AUTH,
      payload: { thesis: 'Updated thesis' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.canonical_core).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('JSON.stringifies argument_chain on update', async () => {
    const updatedChain = [{ step: 1, claim: 'New claim', evidence: 'New evidence' }];
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'cc-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({
      data: { id: 'cc-1', argument_chain_json: JSON.stringify(updatedChain) },
      error: null,
    });

    await app.inject({
      method: 'PUT',
      url: '/canonical-core/cc-1',
      headers: AUTH,
      payload: { argument_chain: updatedChain },
    });

    expect(mockChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        argument_chain_json: JSON.stringify(updatedChain),
      }),
    );
  });
});

describe('DELETE /canonical-core/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/canonical-core/cc-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when canonical core not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'DELETE',
      url: '/canonical-core/nonexistent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('deletes canonical core and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'cc-1' },
      error: null,
    });
    mockChain.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/canonical-core/cc-1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.deleted).toBe(true);
    expect(body.error).toBeNull();
  });
});
