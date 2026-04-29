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

vi.mock('@/lib/projects/ownership', () => ({
  assertProjectOwner: vi.fn(),
}));

vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { projectSetupRoutes } from '../../routes/project-setup';
import { assertProjectOwner } from '@/lib/projects/ownership';

const AUTH = { 'x-internal-key': 'test-key' };
const AUTH_USER = { ...AUTH, 'x-user-id': 'user-123' };

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  Object.defineProperty(mockChain, 'data', {
    value: { id: 'p-1' },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(mockChain, 'error', {
    value: null,
    writable: true,
    configurable: true,
  });
  mockChain.maybeSingle.mockResolvedValue({
    data: { id: 'p-1' },
    error: null,
  });
  (assertProjectOwner as any).mockResolvedValue(undefined);
  app = Fastify({ logger: false });
  await app.register(projectSetupRoutes, { prefix: '/projects' });
  await app.ready();
});

describe('PATCH /projects/:id/abort', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/projects/p-1/abort',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with wrong auth key', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/projects/p-1/abort',
      headers: { 'x-internal-key': 'wrong-key' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('calls assertProjectOwner with projectId and userId', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/projects/p-1/abort',
      headers: AUTH_USER,
    });
    expect(assertProjectOwner).toHaveBeenCalledWith('p-1', 'user-123', expect.any(Object));
  });

  it('returns 403 when user is not project owner', async () => {
    const apiError = new Error('Forbidden');
    (apiError as any).statusCode = 403;
    (apiError as any).code = 'FORBIDDEN';
    (assertProjectOwner as any).mockRejectedValue(apiError);

    const res = await app.inject({
      method: 'PATCH',
      url: '/projects/p-1/abort',
      headers: AUTH_USER,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when project does not exist', async () => {
    const apiError = new Error('Project not found');
    (apiError as any).statusCode = 404;
    (apiError as any).code = 'NOT_FOUND';
    (assertProjectOwner as any).mockRejectedValue(apiError);

    const res = await app.inject({
      method: 'PATCH',
      url: '/projects/p-1/abort',
      headers: AUTH_USER,
    });
    expect(res.statusCode).toBe(404);
  });

  it('updates abort_requested_at to current timestamp', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/projects/p-1/abort',
      headers: AUTH_USER,
    });

    expect(res.statusCode).toBe(200);
    expect(mockChain.update).toHaveBeenCalledWith({
      abort_requested_at: expect.any(String),
    });
    const updateCall = (mockChain.update as any).mock.calls[0][0];
    expect(updateCall.abort_requested_at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
  });

  it('returns 200 with ok: true on success', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/projects/p-1/abort',
      headers: AUTH_USER,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.ok).toBe(true);
    expect(body.error).toBeNull();
  });

  it('calls eq() with projectId', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/projects/p-1/abort',
      headers: AUTH_USER,
    });
    expect(mockChain.eq).toHaveBeenCalledWith('id', 'p-1');
  });
});

describe('DELETE /projects/:id/abort', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/projects/p-1/abort',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with wrong auth key', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/projects/p-1/abort',
      headers: { 'x-internal-key': 'wrong-key' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('calls assertProjectOwner with projectId and userId', async () => {
    await app.inject({
      method: 'DELETE',
      url: '/projects/p-1/abort',
      headers: AUTH_USER,
    });
    expect(assertProjectOwner).toHaveBeenCalledWith('p-1', 'user-123', expect.any(Object));
  });

  it('returns 403 when user is not project owner', async () => {
    const apiError = new Error('Forbidden');
    (apiError as any).statusCode = 403;
    (apiError as any).code = 'FORBIDDEN';
    (assertProjectOwner as any).mockRejectedValue(apiError);

    const res = await app.inject({
      method: 'DELETE',
      url: '/projects/p-1/abort',
      headers: AUTH_USER,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when project does not exist', async () => {
    const apiError = new Error('Project not found');
    (apiError as any).statusCode = 404;
    (apiError as any).code = 'NOT_FOUND';
    (assertProjectOwner as any).mockRejectedValue(apiError);

    const res = await app.inject({
      method: 'DELETE',
      url: '/projects/p-1/abort',
      headers: AUTH_USER,
    });
    expect(res.statusCode).toBe(404);
  });

  it('updates abort_requested_at to null', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/projects/p-1/abort',
      headers: AUTH_USER,
    });

    expect(res.statusCode).toBe(200);
    expect(mockChain.update).toHaveBeenCalledWith({
      abort_requested_at: null,
    });
  });

  it('returns 200 with ok: true on success', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/projects/p-1/abort',
      headers: AUTH_USER,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.ok).toBe(true);
    expect(body.error).toBeNull();
  });

  it('calls eq() with projectId', async () => {
    await app.inject({
      method: 'DELETE',
      url: '/projects/p-1/abort',
      headers: AUTH_USER,
    });
    expect(mockChain.eq).toHaveBeenCalledWith('id', 'p-1');
  });
});
