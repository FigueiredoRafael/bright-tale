import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// Simple mock setup for chainable methods
vi.mock('@/lib/supabase', () => {
  const chain: Record<string, any> = {};
  const methods = [
    'from',
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'is',
    'or',
    'order',
    'rpc',
  ];
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

  it('returns list with authenticated user', async () => {
    const template = {
      id: 't-1',
      user_id: 'user-123',
      channel_id: null,
      name: 'Template',
      config_json: { maxIterations: 3 },
      is_default: true,
      created_at: '2026-04-29T00:00:00Z',
      updated_at: '2026-04-29T00:00:00Z',
    };

    mockSb.order.mockResolvedValue({
      data: [template],
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

  it('returns 404 when channelId query param references missing channel', async () => {
    // Setup chain: from('channels').select().eq().maybeSingle() -> { data: null }
    const channelChain = {
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };
    mockSb.select.mockReturnValue(channelChain);

    const res = await app.inject({
      method: 'GET',
      url: '/autopilot-templates/?channelId=00000000-0000-0000-0000-000000000001',
      headers: AUTH_USER,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('applies OR filter on base table (no referencedTable) when channelId provided', async () => {
    // Regression: passing { referencedTable: 'autopilot_templates' } made
    // PostgREST reject the OR with "is not an embedded resource."
    // Reset select to default chainable behaviour (prior tests override it).
    mockSb.select.mockReturnValue(mockSb);
    let fromCall = 0;
    mockSb.from.mockImplementation((table: string) => {
      fromCall++;
      if (fromCall === 1 && table === 'channels') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { user_id: 'user-123' },
                error: null,
              }),
            }),
          }),
        };
      }
      return mockSb;
    });
    mockSb.order.mockResolvedValue({ data: [], error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/autopilot-templates/?channelId=00000000-0000-0000-0000-000000000003',
      headers: AUTH_USER,
    });

    expect(res.statusCode).toBe(200);
    expect(mockSb.or).toHaveBeenCalledTimes(1);
    expect(mockSb.or.mock.calls[0]).toHaveLength(1);
    expect(mockSb.or.mock.calls[0][0]).toBe(
      'channel_id.is.null,channel_id.eq.00000000-0000-0000-0000-000000000003'
    );
  });

  it('returns 403 when channelId query param is owned by different user', async () => {
    // Setup chain: from('channels').select().eq().maybeSingle() -> { data: { user_id: 'other-user' } }
    const channelChain = {
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: 'other-user' }, error: null }),
      }),
    };
    mockSb.select.mockReturnValue(channelChain);

    const res = await app.inject({
      method: 'GET',
      url: '/autopilot-templates/?channelId=00000000-0000-0000-0000-000000000002',
      headers: AUTH_USER,
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

describe('POST /autopilot-templates', () => {
  const validBody = {
    name: 'Template',
    channelId: null,
    configJson: { maxIterations: 3 },
    isDefault: false,
  };

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/autopilot-templates/',
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 with invalid input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/autopilot-templates/',
      headers: AUTH_USER,
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('creates template successfully', async () => {
    const newTemplate = {
      id: 't-new',
      user_id: 'user-123',
      channel_id: null,
      name: 'Template',
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
  });

  it('calls RPC when isDefault is true', async () => {
    const newTemplate = {
      id: 't-new',
      user_id: 'user-123',
      channel_id: null,
      name: 'Template',
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

    await app.inject({
      method: 'POST',
      url: '/autopilot-templates/',
      headers: AUTH_USER,
      payload: { ...validBody, isDefault: true },
    });

    expect(mockSb.rpc).toHaveBeenCalledWith(
      'clear_autopilot_default',
      expect.any(Object)
    );
  });

  it('returns 404 when channelId in body references missing channel', async () => {
    // Reset mocks before this test
    Object.values(mockSb).forEach((fn: any) => {
      if (typeof fn === 'function' && fn.mockClear) fn.mockClear();
    });
    // Setup chain for channel ownership check: from('channels').select().eq().maybeSingle() -> null
    const channelChain = {
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };
    mockSb.from.mockReturnValue({ select: vi.fn().mockReturnValue(channelChain) });

    const res = await app.inject({
      method: 'POST',
      url: '/autopilot-templates/',
      headers: AUTH_USER,
      payload: { ...validBody, channelId: '00000000-0000-0000-0000-000000000001' },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 403 when channelId in body is owned by different user', async () => {
    // Reset mocks before this test
    Object.values(mockSb).forEach((fn: any) => {
      if (typeof fn === 'function' && fn.mockClear) fn.mockClear();
    });
    // Setup chain for channel ownership check: from('channels').select().eq().maybeSingle() -> { user_id: 'other' }
    const channelChain = {
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: 'other-user' }, error: null }),
      }),
    };
    mockSb.from.mockReturnValue({ select: vi.fn().mockReturnValue(channelChain) });

    const res = await app.inject({
      method: 'POST',
      url: '/autopilot-templates/',
      headers: AUTH_USER,
      payload: { ...validBody, channelId: '00000000-0000-0000-0000-000000000002' },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

describe('PUT /autopilot-templates/:id', () => {
  beforeEach(() => {
    // Reset all mocks before each test in this suite
    Object.values(mockSb).forEach((fn: any) => {
      if (typeof fn === 'function' && fn.mockClear) {
        fn.mockClear();
        fn.mockReturnValue(mockSb);
      }
    });
  });

  it('returns 404 when template not found', async () => {
    mockSb.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/autopilot-templates/t-missing',
      headers: AUTH_USER,
      payload: { name: 'New Name' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when not owned by user', async () => {
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
      payload: { name: 'New' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('updates template without calling RPC when isDefault omitted', async () => {
    mockSb.maybeSingle.mockResolvedValue({
      data: {
        id: 't-1',
        user_id: 'user-123',
        channel_id: null,
      },
      error: null,
    });
    // Make the update chain return properly
    const updateChain = {
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 't-1', name: 'Updated' }],
          error: null,
        }),
      }),
    };
    mockSb.update.mockReturnValue(updateChain);

    const res = await app.inject({
      method: 'PUT',
      url: '/autopilot-templates/t-1',
      headers: AUTH_USER,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockSb.rpc).not.toHaveBeenCalled();
  });

  it('calls RPC when isDefault is set to true, then performs update', async () => {
    mockSb.maybeSingle.mockResolvedValue({
      data: {
        id: 't-1',
        user_id: 'user-123',
        channel_id: 'ch-1',
      },
      error: null,
    });
    // RPC for clearing defaults returns success
    mockSb.rpc.mockResolvedValue({ data: null, error: null });
    // Update chain for the template update
    const updateChain = {
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 't-1', is_default: true }],
          error: null,
        }),
      }),
    };
    mockSb.update.mockReturnValue(updateChain);

    const res = await app.inject({
      method: 'PUT',
      url: '/autopilot-templates/t-1',
      headers: AUTH_USER,
      payload: { isDefault: true },
    });

    expect(res.statusCode).toBe(200);
    // Verify RPC was called BEFORE update with correct params
    expect(mockSb.rpc).toHaveBeenCalledWith('clear_autopilot_default', {
      p_user_id: 'user-123',
      p_channel_id: 'ch-1',
    });
    // Verify update was called after RPC
    expect(mockSb.update).toHaveBeenCalled();
  });

  it('returns 404 when channel not found during update', async () => {
    // Reset and setup mocks for this specific flow:
    // First call: from('autopilot_templates').select().eq().maybeSingle() returns the template
    // Second call: from('channels').select().eq().maybeSingle() returns null
    Object.values(mockSb).forEach((fn: any) => {
      if (typeof fn === 'function' && fn.mockClear) fn.mockClear();
    });

    // Mock chain for template lookup
    const templateChain = {
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 't-1', user_id: 'user-123', channel_id: null },
          error: null,
        }),
      }),
    };

    // Mock chain for channel lookup (missing)
    const channelChain = {
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };

    // Create from() that returns different chains based on table
    mockSb.from.mockImplementation((table: string) => {
      if (table === 'autopilot_templates') {
        return { select: vi.fn().mockReturnValue(templateChain) };
      } else if (table === 'channels') {
        return { select: vi.fn().mockReturnValue(channelChain) };
      }
      return mockSb;
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/autopilot-templates/t-1',
      headers: AUTH_USER,
      payload: { channelId: '00000000-0000-0000-0000-000000000001' },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 403 when channel is not owned by user during update', async () => {
    // Mock chain for template lookup
    const templateChain = {
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 't-1', user_id: 'user-123', channel_id: null },
          error: null,
        }),
      }),
    };

    // Mock chain for channel lookup (different owner)
    const channelChain = {
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: 'other-user' }, error: null }),
      }),
    };

    // Create from() that returns different chains based on table
    mockSb.from.mockImplementation((table: string) => {
      if (table === 'autopilot_templates') {
        return { select: vi.fn().mockReturnValue(templateChain) };
      } else if (table === 'channels') {
        return { select: vi.fn().mockReturnValue(channelChain) };
      }
      return mockSb;
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/autopilot-templates/t-1',
      headers: AUTH_USER,
      payload: { channelId: '00000000-0000-0000-0000-000000000002' },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

describe('DELETE /autopilot-templates/:id', () => {
  beforeEach(() => {
    // Reset all mocks before each test in this suite
    Object.values(mockSb).forEach((fn: any) => {
      if (typeof fn === 'function' && fn.mockClear) {
        fn.mockClear();
        fn.mockReturnValue(mockSb);
      }
    });
  });

  it('returns 404 when template not found', async () => {
    mockSb.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/autopilot-templates/t-missing',
      headers: AUTH_USER,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when not owned by user', async () => {
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

  it('calls delete method when owned', async () => {
    mockSb.maybeSingle.mockResolvedValue({
      data: {
        id: 't-1',
        user_id: 'user-123',
      },
      error: null,
    });
    // Make the chain properly resolve
    const deleteChain = {
      eq: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    };
    mockSb.delete.mockReturnValue(deleteChain);

    const res = await app.inject({
      method: 'DELETE',
      url: '/autopilot-templates/t-1',
      headers: AUTH_USER,
    });

    expect(res.statusCode).toBe(200);
    expect(mockSb.delete).toHaveBeenCalled();
  });
});
