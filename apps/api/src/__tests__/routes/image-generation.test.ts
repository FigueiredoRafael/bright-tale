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
vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn().mockReturnValue('encrypted'),
  decrypt: vi.fn(),
}));
vi.mock('@brighttale/shared/schemas/imageGeneration', async () => {
  const { z } = await import('zod');
  const imageGeneratorConfigSchema = z.object({
    provider: z.enum(['gemini']),
    api_key: z.string().min(1),
    model: z.enum(['gemini-2.5-flash-image', 'imagen-3.0-generate-002']),
    is_active: z.boolean().default(false),
    config_json: z.string().optional(),
  });
  const updateImageGeneratorConfigSchema = imageGeneratorConfigSchema.partial().extend({
    is_active: z.boolean().optional(),
  });
  return { imageGeneratorConfigSchema, updateImageGeneratorConfigSchema };
});
vi.stubEnv('INTERNAL_API_KEY', 'test-key');
vi.stubEnv('ENCRYPTION_SECRET', 'test-secret');

import { imageGenerationRoutes } from '../../routes/image-generation';

const AUTH = { 'x-internal-key': 'test-key' };

const validCreateBody = {
  provider: 'gemini',
  api_key: 'test-api-key',
  model: 'imagen-3.0-generate-002',
  is_active: false,
};

const mockConfig = {
  id: 'img-cfg-1',
  provider: 'gemini',
  api_key: 'encrypted-key',
  model: 'imagen-3.0-generate-002',
  is_active: false,
  config_json: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockChain.single.mockResolvedValue({ data: mockConfig, error: null });
  mockChain.maybeSingle.mockResolvedValue({ data: mockConfig, error: null });
  Object.defineProperty(mockChain, 'data', {
    value: [mockConfig],
    writable: true,
    configurable: true,
  });
  Object.defineProperty(mockChain, 'error', {
    value: null,
    writable: true,
    configurable: true,
  });
  app = Fastify({ logger: false });
  await app.register(imageGenerationRoutes, { prefix: '/image-generation' });
  await app.ready();
});

describe('POST /image-generation/config', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/image-generation/config',
      payload: validCreateBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('creates config and returns safe response (no api_key)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/image-generation/config',
      headers: AUTH,
      payload: validCreateBody,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe('img-cfg-1');
    expect(body.provider).toBe('gemini');
    expect(body.model).toBe('imagen-3.0-generate-002');
    expect(body.api_key).toBeUndefined();
  });

  it('encrypts the api_key before insert', async () => {
    const { encrypt } = await import('@/lib/crypto');
    await app.inject({
      method: 'POST',
      url: '/image-generation/config',
      headers: AUTH,
      payload: validCreateBody,
    });
    expect(encrypt).toHaveBeenCalledWith('test-api-key');
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ api_key: 'encrypted' }),
    );
  });

  it('includes model field in insert', async () => {
    await app.inject({
      method: 'POST',
      url: '/image-generation/config',
      headers: AUTH,
      payload: validCreateBody,
    });
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'imagen-3.0-generate-002' }),
    );
  });

  it('deactivates others when is_active=true', async () => {
    await app.inject({
      method: 'POST',
      url: '/image-generation/config',
      headers: AUTH,
      payload: { ...validCreateBody, is_active: true },
    });
    expect(mockChain.update).toHaveBeenCalledWith({ is_active: false });
    expect(mockChain.eq).toHaveBeenCalledWith('is_active', true);
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/image-generation/config',
      headers: AUTH,
      payload: { provider: 'gemini' }, // missing api_key and model
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when ENCRYPTION_SECRET is missing', async () => {
    vi.stubEnv('ENCRYPTION_SECRET', '');
    const res = await app.inject({
      method: 'POST',
      url: '/image-generation/config',
      headers: AUTH,
      payload: validCreateBody,
    });
    expect(res.statusCode).toBe(500);
    vi.stubEnv('ENCRYPTION_SECRET', 'test-secret');
  });
});

describe('GET /image-generation/config', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/image-generation/config' });
    expect(res.statusCode).toBe(401);
  });

  it('returns list with has_api_key boolean (no actual key)', async () => {
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ data: [mockConfig], error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'GET',
      url: '/image-generation/config',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].has_api_key).toBe(true);
    expect(body[0].api_key).toBeUndefined();
    expect(body[0].model).toBe('imagen-3.0-generate-002');

    delete mockChain.then;
  });
});

describe('GET /image-generation/config/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/image-generation/config/img-cfg-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns config with has_api_key instead of actual key', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockConfig, error: null });
    const res = await app.inject({
      method: 'GET',
      url: '/image-generation/config/img-cfg-1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe('img-cfg-1');
    expect(body.model).toBe('imagen-3.0-generate-002');
    expect(body.has_api_key).toBe(true);
    expect(body.api_key).toBeUndefined();
  });

  it('returns 404 when config not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await app.inject({
      method: 'GET',
      url: '/image-generation/config/nonexistent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe('Config not found');
  });
});

describe('PUT /image-generation/config/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/image-generation/config/img-cfg-1',
      payload: { is_active: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when config not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await app.inject({
      method: 'PUT',
      url: '/image-generation/config/nonexistent',
      headers: AUTH,
      payload: { is_active: true },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe('Config not found');
  });

  it('updates config and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'img-cfg-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({ data: mockConfig, error: null });
    const res = await app.inject({
      method: 'PUT',
      url: '/image-generation/config/img-cfg-1',
      headers: AUTH,
      payload: { is_active: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe('img-cfg-1');
    expect(body.model).toBe('imagen-3.0-generate-002');
    expect(body.api_key).toBeUndefined();
  });

  it('encrypts new api_key when provided', async () => {
    const { encrypt } = await import('@/lib/crypto');
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'img-cfg-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({ data: mockConfig, error: null });
    await app.inject({
      method: 'PUT',
      url: '/image-generation/config/img-cfg-1',
      headers: AUTH,
      payload: { api_key: 'new-key' },
    });
    expect(encrypt).toHaveBeenCalledWith('new-key');
    expect(mockChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ api_key: 'encrypted' }),
    );
  });

  it('deactivates others when is_active=true', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'img-cfg-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({ data: mockConfig, error: null });
    await app.inject({
      method: 'PUT',
      url: '/image-generation/config/img-cfg-1',
      headers: AUTH,
      payload: { is_active: true },
    });
    expect(mockChain.neq).toHaveBeenCalledWith('id', 'img-cfg-1');
    expect(mockChain.eq).toHaveBeenCalledWith('is_active', true);
  });

  it('updates model field when provided', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'img-cfg-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({ data: mockConfig, error: null });
    await app.inject({
      method: 'PUT',
      url: '/image-generation/config/img-cfg-1',
      headers: AUTH,
      payload: { model: 'gemini-2.5-flash-image' },
    });
    expect(mockChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-2.5-flash-image' }),
    );
  });
});

describe('DELETE /image-generation/config/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/image-generation/config/img-cfg-1',
    });
    expect(res.statusCode).toBe(401);
  });

  it('deletes config and returns success', async () => {
    mockChain.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const res = await app.inject({
      method: 'DELETE',
      url: '/image-generation/config/img-cfg-1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });
});
