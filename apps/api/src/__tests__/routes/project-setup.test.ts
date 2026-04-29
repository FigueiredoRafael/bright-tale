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

vi.mock('@/lib/pipeline-state', () => ({
  derivedFromStageResults: vi.fn(),
  nextStageAfter: vi.fn(),
}));

vi.mock('@brighttale/shared/schemas/projectSetup', async () => {
  const { z } = await import('zod');
  return {
    setupProjectSchema: z.object({
      mode: z.enum(['step-by-step', 'supervised', 'overview']),
      autopilotConfig: z.any().nullable(),
      templateId: z.string().nullable(),
      startStage: z.enum(['brainstorm', 'research', 'draft', 'review', 'assets', 'preview', 'publish']),
    }).superRefine((v, ctx) => {
      if (v.mode !== 'step-by-step' && !v.autopilotConfig) {
        ctx.addIssue({
          code: 'custom',
          path: ['autopilotConfig'],
          message: 'autopilotConfig required for supervised/overview modes',
        });
      }
    }),
  };
});

vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { projectSetupRoutes } from '../../routes/project-setup';
import { assertProjectOwner } from '@/lib/projects/ownership';
import { derivedFromStageResults, nextStageAfter } from '@/lib/pipeline-state';

const AUTH = { 'x-internal-key': 'test-key' };
const AUTH_USER = { ...AUTH, 'x-user-id': 'user-123' };

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  Object.defineProperty(mockChain, 'data', {
    value: { id: 'p-1', pipeline_state_json: null },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(mockChain, 'error', {
    value: null,
    writable: true,
    configurable: true,
  });
  mockChain.maybeSingle.mockResolvedValue({
    data: { id: 'p-1', pipeline_state_json: null },
    error: null,
  });
  (assertProjectOwner as any).mockResolvedValue(undefined);
  (derivedFromStageResults as any).mockReturnValue(null);
  (nextStageAfter as any).mockReturnValue('brainstorm');
  app = Fastify({ logger: false });
  await app.register(projectSetupRoutes, { prefix: '/projects' });
  await app.ready();
});

describe('POST /projects/:id/setup', () => {
  const validBody = {
    mode: 'step-by-step',
    autopilotConfig: null,
    templateId: null,
    startStage: 'brainstorm',
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects/p-1/setup',
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with wrong auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects/p-1/setup',
      headers: { 'x-internal-key': 'wrong-key' },
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid body (missing fields)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects/p-1/setup',
      headers: AUTH,
      payload: { mode: 'step-by-step' }, // missing startStage, etc
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_BODY');
  });

  it('returns 400 for supervised mode without autopilotConfig', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects/p-1/setup',
      headers: AUTH,
      payload: {
        mode: 'supervised',
        autopilotConfig: null,
        templateId: null,
        startStage: 'brainstorm',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_BODY');
  });

  it('calls assertProjectOwner with projectId and userId', async () => {
    await app.inject({
      method: 'POST',
      url: '/projects/p-1/setup',
      headers: AUTH_USER,
      payload: validBody,
    });
    expect(assertProjectOwner).toHaveBeenCalledWith('p-1', 'user-123', expect.any(Object));
  });

  it('returns 403 when assertProjectOwner throws 403', async () => {
    const apiError = new Error('Forbidden');
    (apiError as any).statusCode = 403;
    (apiError as any).code = 'FORBIDDEN';
    (assertProjectOwner as any).mockRejectedValue(apiError);

    const res = await app.inject({
      method: 'POST',
      url: '/projects/p-1/setup',
      headers: AUTH_USER,
      payload: validBody,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when assertProjectOwner throws 404', async () => {
    const apiError = new Error('Project not found');
    (apiError as any).statusCode = 404;
    (apiError as any).code = 'NOT_FOUND';
    (assertProjectOwner as any).mockRejectedValue(apiError);

    const res = await app.inject({
      method: 'POST',
      url: '/projects/p-1/setup',
      headers: AUTH_USER,
      payload: validBody,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when startStage does not match expected stage', async () => {
    (nextStageAfter as any).mockReturnValue('research');

    const res = await app.inject({
      method: 'POST',
      url: '/projects/p-1/setup',
      headers: AUTH_USER,
      payload: validBody, // startStage: 'brainstorm', but expected: 'research'
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('STAGE_MISMATCH');
    expect(body.error.message).toContain('research');
  });

  it('returns 200 with ok: true on success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects/p-1/setup',
      headers: AUTH_USER,
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.ok).toBe(true);
    expect(body.error).toBeNull();
  });

  it('updates project with mode, autopilotConfig, and templateId', async () => {
    const configObj = { iterations: 5 };
    const res = await app.inject({
      method: 'POST',
      url: '/projects/p-1/setup',
      headers: AUTH_USER,
      payload: {
        mode: 'supervised',
        autopilotConfig: configObj,
        templateId: 'tmpl-1',
        startStage: 'brainstorm',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockChain.update).toHaveBeenCalledWith({
      mode: 'supervised',
      autopilot_config_json: configObj,
      autopilot_template_id: 'tmpl-1',
      pipeline_state_json: null,
    });
  });

  it('does not reset pipeline_state_json when stages are already completed', async () => {
    (derivedFromStageResults as any).mockReturnValue('research');
    (nextStageAfter as any).mockReturnValue('draft');

    const res = await app.inject({
      method: 'POST',
      url: '/projects/p-1/setup',
      headers: AUTH_USER,
      payload: {
        mode: 'step-by-step',
        autopilotConfig: null,
        templateId: null,
        startStage: 'draft',
      },
    });

    expect(res.statusCode).toBe(200);
    const updateCall = (mockChain.update as any).mock.calls[0][0];
    expect(updateCall.pipeline_state_json).toBeUndefined();
  });
});
