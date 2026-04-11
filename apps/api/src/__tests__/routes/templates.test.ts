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
vi.mock('@/lib/queries/templates', () => ({
  resolveTemplate: vi.fn(),
}));
vi.mock('@brighttale/shared/schemas/templates', async () => {
  const { z } = await import('zod');
  return {
    createTemplateSchema: z.object({
      name: z.string().min(3).max(200),
      type: z.enum(['discovery', 'production', 'review']),
      config_json: z.string().min(2),
      parent_template_id: z.string().optional(),
    }),
    updateTemplateSchema: z.object({
      name: z.string().min(3).max(200).optional(),
      type: z.enum(['discovery', 'production', 'review']).optional(),
      config_json: z.string().min(2).optional(),
      parent_template_id: z.string().nullable().optional(),
    }),
    listTemplatesQuerySchema: z.object({
      type: z.enum(['discovery', 'production', 'review']).optional(),
      parent_template_id: z.string().optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().positive().default(1).optional(),
      limit: z.coerce.number().int().positive().max(100).default(20).optional(),
      sort: z.enum(['created_at', 'updated_at', 'name', 'type']).default('created_at').optional(),
      order: z.enum(['asc', 'desc']).default('desc').optional(),
    }),
  };
});
vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { templatesRoutes } from '../../routes/templates';
import { resolveTemplate } from '@/lib/queries/templates';

const AUTH = { 'x-internal-key': 'test-key' };
const AUTH_USER = { ...AUTH, 'x-user-id': 'user-123' };

const mockResolveTemplate = resolveTemplate as ReturnType<typeof vi.fn>;

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockChain.single.mockResolvedValue({ data: { id: 't-1', name: 'Test Template', type: 'discovery', config_json: '{}' }, error: null });
  mockChain.maybeSingle.mockResolvedValue({
    data: { id: 't-1', name: 'Test Template', type: 'discovery', config_json: '{}' },
    error: null,
  });
  Object.defineProperty(mockChain, 'data', {
    value: [{ id: 't-1', name: 'Test Template' }],
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
  mockResolveTemplate.mockResolvedValue({ some: 'config' });
  app = Fastify({ logger: false });
  await app.register(templatesRoutes, { prefix: '/templates' });
  await app.ready();
});

// ─── GET /templates ──────────────────────────────────────────────────────────

describe('GET /templates', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with auth', async () => {
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      if (callCount % 2 === 1) {
        resolve({ count: 2, data: null, error: null });
      } else {
        resolve({ data: [{ id: 't-1', name: 'Test Template' }], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({ method: 'GET', url: '/templates', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.pagination).toBeDefined();
    expect(body.error).toBeNull();

    delete mockChain.then;
  });

  it('filters by type when provided', async () => {
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      if (callCount % 2 === 1) {
        resolve({ count: 1, data: null, error: null });
      } else {
        resolve({ data: [{ id: 't-1', name: 'Test' }], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    await app.inject({ method: 'GET', url: '/templates?type=discovery', headers: AUTH });
    expect(mockChain.eq).toHaveBeenCalledWith('type', 'discovery');

    delete mockChain.then;
  });
});

// ─── POST /templates ─────────────────────────────────────────────────────────

describe('POST /templates', () => {
  const validBody = {
    name: 'My Template',
    type: 'discovery',
    config_json: '{"key":"value"}',
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'POST', url: '/templates', payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it('creates template and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/templates',
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
      url: '/templates',
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
      url: '/templates',
      headers: AUTH,
      payload: validBody,
    });
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: null }),
    );
  });

  it('returns 400 for invalid JSON in config_json', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/templates',
      headers: AUTH,
      payload: { ...validBody, config_json: 'not-valid-json{{{' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_JSON');
  });

  it('returns 400 for invalid body (missing required fields)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/templates',
      headers: AUTH,
      payload: { name: 'X' }, // too short, missing type and config_json
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when parent template not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'POST',
      url: '/templates',
      headers: AUTH,
      payload: { ...validBody, parent_template_id: 'parent-123' },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('PARENT_NOT_FOUND');
  });

  it('returns 400 when parent type mismatches', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'parent-123', type: 'production' },
      error: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/templates',
      headers: AUTH,
      payload: { ...validBody, type: 'discovery', parent_template_id: 'parent-123' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('TYPE_MISMATCH');
  });
});

// ─── GET /templates/:id ───────────────────────────────────────────────────────

describe('GET /templates/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates/t-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with a valid template', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 't-1', name: 'Test Template', type: 'discovery', config_json: '{"x":1}' },
      error: null,
    });

    const res = await app.inject({ method: 'GET', url: '/templates/t-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.id).toBe('t-1');
    expect(body.data.config).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('returns 404 when template not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/templates/nonexistent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

// ─── PUT /templates/:id ───────────────────────────────────────────────────────

describe('PUT /templates/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/templates/t-1',
      payload: { name: 'Updated Template' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when template not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PUT',
      url: '/templates/nonexistent',
      headers: AUTH,
      payload: { name: 'Updated Template' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('updates template and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 't-1', name: 'Old Name', type: 'discovery', config_json: '{}' },
      error: null,
    });
    mockChain.single.mockResolvedValueOnce({
      data: { id: 't-1', name: 'Updated Template', type: 'discovery', config_json: '{}' },
      error: null,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/templates/t-1',
      headers: AUTH,
      payload: { name: 'Updated Template' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('returns 400 for invalid JSON in config_json', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 't-1', name: 'Old', type: 'discovery', config_json: '{}' },
      error: null,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/templates/t-1',
      headers: AUTH,
      payload: { config_json: 'invalid{json' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_JSON');
  });

  it('returns 400 when template references itself as parent', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 't-1', name: 'Template', type: 'discovery', config_json: '{}' },
      error: null,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/templates/t-1',
      headers: AUTH,
      payload: { parent_template_id: 't-1' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('SELF_REFERENCE');
  });

  it('returns 400 for circular inheritance', async () => {
    // existing template: t-1, type: discovery
    mockChain.maybeSingle
      .mockResolvedValueOnce({
        data: { id: 't-1', name: 'Template 1', type: 'discovery', config_json: '{}' },
        error: null,
      })
      // parent lookup: t-2, type: discovery
      .mockResolvedValueOnce({
        data: { id: 't-2', type: 'discovery' },
        error: null,
      })
      // circular check: t-2's parent is t-1 → cycle detected
      .mockResolvedValueOnce({
        data: { parent_template_id: 't-1' },
        error: null,
      });

    const res = await app.inject({
      method: 'PUT',
      url: '/templates/t-1',
      headers: AUTH,
      payload: { parent_template_id: 't-2' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('CIRCULAR_INHERITANCE');
  });
});

// ─── DELETE /templates/:id ────────────────────────────────────────────────────

describe('DELETE /templates/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/templates/t-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when template not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'DELETE',
      url: '/templates/nonexistent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when template has children', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 't-1', children: [{ count: 2 }] },
      error: null,
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/templates/t-1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('HAS_CHILDREN');
  });

  it('deletes template and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 't-1', children: [{ count: 0 }] },
      error: null,
    });
    mockChain.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/templates/t-1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.success).toBe(true);
  });
});

// ─── GET /templates/:id/resolved ─────────────────────────────────────────────

describe('GET /templates/:id/resolved', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates/t-1/resolved' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with resolved template', async () => {
    mockResolveTemplate.mockResolvedValueOnce({ merged: 'config', key: 'value' });

    const res = await app.inject({
      method: 'GET',
      url: '/templates/t-1/resolved',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.resolvedTemplate).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('returns 404 when template not found', async () => {
    mockResolveTemplate.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'GET',
      url: '/templates/nonexistent/resolved',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('calls resolveTemplate with the correct id', async () => {
    mockResolveTemplate.mockResolvedValueOnce({ config: 'data' });

    await app.inject({
      method: 'GET',
      url: '/templates/t-42/resolved',
      headers: AUTH,
    });

    expect(mockResolveTemplate).toHaveBeenCalledWith('t-42');
  });
});
