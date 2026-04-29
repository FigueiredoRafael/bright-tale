import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// Simple mock setup for chainable methods
const mockChain: Record<string, any> = {};

vi.mock('@/lib/supabase', () => {
  const chain: Record<string, any> = {};
  const methods = ['from', 'select', 'insert', 'update', 'delete', 'eq', 'is', 'or', 'order', 'rpc'];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain.maybeSingle = vi.fn();
  return {
    createServiceClient: () => chain,
  };
});

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

vi.mock('@brighttale/shared/schemas/autopilotTemplates', async () => {
  const { z } = await import('zod');
  const autopilotConfigSchema = z.object({
    maxIterations: z.number().int().positive().optional(),
    model: z.string().optional(),
  });
  return {
    createAutopilotTemplateSchema: z.object({
      name: z.string().trim().min(1).max(120),
      channelId: z.string().uuid().nullable(),
      configJson: autopilotConfigSchema,
      isDefault: z.boolean(),
    }),
    updateAutopilotTemplateSchema: z.object({
      name: z.string().trim().min(1).max(120).optional(),
      channelId: z.string().uuid().nullable().optional(),
      configJson: autopilotConfigSchema.optional(),
      isDefault: z.boolean().optional(),
    }),
  };
});

vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { autopilotTemplatesRoutes } from '../../routes/autopilot-templates.js';
import { createServiceClient } from '@/lib/supabase';

const AUTH_USER = {
  'x-internal-key': 'test-key',
  'x-user-id': 'user-123',
};

let app: FastifyInstance;
let mockSb: any;

beforeEach(async () => {
  vi.clearAllMocks();
  mockSb = createServiceClient();
  app = Fastify({ logger: false });
  await app.register(autopilotTemplatesRoutes, {
    prefix: '/autopilot-templates',
  });
  await app.ready();
});

describe('GET /autopilot-templates', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/autopilot-templates/',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns templates for user', async () => {
    const globalTemplate = {
      id: 't-1',
      user_id: 'user-123',
      channel_id: null,
      name: 'Global Template',
      config_json: { maxIterations: 3 },
      is_default: true,
      created_at: '2026-04-29T00:00:00Z',
      updated_at: '2026-04-29T00:00:00Z',
    };

    mockSb.order.mockResolvedValue({
      data: [globalTemplate],
      error: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/autopilot-templates/',
      headers: AUTH_USER,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.items).toHaveLength(1);
    expect(body.error).toBeNull();
  });
});

describe('POST /autopilot-templates', () => {
  const validBody = {
    name: 'My Template',
    channelId: null,
    configJson: { maxIterations: 3 },
    isDefault: false,
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/autopilot-templates/',
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 with invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/autopilot-templates/',
      headers: AUTH_USER,
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('INVALID_BODY');
  });

  it('creates template with isDefault=false', async () => {
    const newTemplate = {
      id: 't-new',
      user_id: 'user-123',
      channel_id: null,
      name: 'My Template',
      config_json: { maxIterations: 3 },
      is_default: false,
      created_at: '2026-04-29T00:00:00Z',
      updated_at: '2026-04-29T00:00:00Z',
    };

    mockSb.select.mockResolvedValue({
      data: [newTemplate],
      error: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/autopilot-templates/',
      headers: AUTH_USER,
      payload: validBody,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.id).toBe('t-new');
    expect(mockSb.rpc).not.toHaveBeenCalled();
  });

  it('creates template with isDefault=true and calls RPC', async () => {
    const newTemplate = {
      id: 't-new',
      user_id: 'user-123',
      channel_id: null,
      name: 'My Template',
      config_json: { maxIterations: 3 },
      is_default: true,
      created_at: '2026-04-29T00:00:00Z',
      updated_at: '2026-04-29T00:00:00Z',
    };

    mockSb.rpc.mockResolvedValue({ data: null, error: null });
    mockSb.select.mockResolvedValue({
      data: [newTemplate],
      error: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/autopilot-templates/',
      headers: AUTH_USER,
      payload: {
        ...validBody,
        isDefault: true,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(mockSb.rpc).toHaveBeenCalledWith('clear_autopilot_default', expect.any(Object));
  });
});

describe('PUT /autopilot-templates/:id', () => {
  it('returns 404 if template not found', async () => {
    mockSb.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/autopilot-templates/t-nonexistent',
      headers: AUTH_USER,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 403 if not owned by user', async () => {
    mockSb.maybeSingle.mockResolvedValue({
      data: {
        id: 't-1',
        user_id: 'other-user',
        channel_id: null,
      },
      error: null,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/autopilot-templates/t-1',
      headers: AUTH_USER,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('updates template and calls RPC when isDefault set to true', async () => {
    const updatedTemplate = {
      id: 't-1',
      user_id: 'user-123',
      channel_id: null,
      name: 'Updated',
      config_json: { maxIterations: 3 },
      is_default: true,
    };

    mockSb.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 't-1',
        user_id: 'user-123',
        channel_id: null,
      },
      error: null,
    });
    mockSb.rpc.mockResolvedValue({ data: null, error: null });
    mockSb.select.mockResolvedValueOnce({
      data: [updatedTemplate],
      error: null,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/autopilot-templates/t-1',
      headers: AUTH_USER,
      payload: { isDefault: true },
    });

    expect(res.statusCode).toBe(200);
    expect(mockSb.rpc).toHaveBeenCalledWith('clear_autopilot_default', expect.any(Object));
  });
});

describe('DELETE /autopilot-templates/:id', () => {
  it('returns 404 if template not found', async () => {
    mockSb.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/autopilot-templates/t-nonexistent',
      headers: AUTH_USER,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 403 if not owned by user', async () => {
    mockSb.maybeSingle.mockResolvedValue({
      data: {
        id: 't-1',
        user_id: 'other-user',
      },
      error: null,
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/autopilot-templates/t-1',
      headers: AUTH_USER,
    });

    expect(res.statusCode).toBe(403);
  });

  it('deletes template owned by user', async () => {
    mockSb.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 't-1',
        user_id: 'user-123',
      },
      error: null,
    });
    mockSb.delete.mockResolvedValue({
      data: null,
      error: null,
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/autopilot-templates/t-1',
      headers: AUTH_USER,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.ok).toBe(true);
  });
});
