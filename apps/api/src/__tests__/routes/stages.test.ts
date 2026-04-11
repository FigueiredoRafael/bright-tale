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
vi.mock('@brighttale/shared/schemas/stages', async () => {
  const { z } = await import('zod');
  const validStageTypes = [
    'discovery',
    'brainstorm',
    'research',
    'content',
    'production',
    'review',
    'publication',
    'publish',
  ] as const;

  function normalizeStageType(stage: string): string {
    const map: Record<string, string> = {
      discovery: 'brainstorm',
      content: 'production',
      publication: 'publish',
    };
    return map[stage] || stage;
  }

  return {
    validStageTypes,
    normalizeStageType,
    createStageSchema: z.object({
      project_id: z.string(),
      stage_type: z.enum(validStageTypes),
      yaml_artifact: z.string().min(10),
    }),
    createRevisionSchema: z.object({
      yaml_artifact: z.string().min(10),
      created_by: z.string().max(200).optional(),
      change_notes: z.string().max(1000).optional(),
    }),
  };
});
vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { stagesRoutes } from '../../routes/stages';

const AUTH = { 'x-internal-key': 'test-key' };

const VALID_YAML = 'yaml_artifact: this is valid yaml content for testing';
const PROJECT_ID = 'project-123';
const STAGE_TYPE = 'research';

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  // Default: project exists
  mockChain.maybeSingle.mockResolvedValue({
    data: { id: PROJECT_ID, current_stage: 'research' },
    error: null,
  });
  mockChain.single.mockResolvedValue({
    data: { id: 'stage-1', stage_type: 'research', version: 1, yaml_artifact: VALID_YAML },
    error: null,
  });
  Object.defineProperty(mockChain, 'data', {
    value: [],
    writable: true,
    configurable: true,
  });
  Object.defineProperty(mockChain, 'error', {
    value: null,
    writable: true,
    configurable: true,
  });

  app = Fastify({ logger: false });
  await app.register(stagesRoutes, { prefix: '/stages' });
  await app.ready();
});

// ─── POST /stages ────────────────────────────────────────────────────────────

describe('POST /stages', () => {
  const validBody = {
    project_id: PROJECT_ID,
    stage_type: STAGE_TYPE,
    yaml_artifact: VALID_YAML,
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'POST', url: '/stages', payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid body (missing yaml_artifact)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/stages',
      headers: AUTH,
      payload: { project_id: PROJECT_ID, stage_type: STAGE_TYPE },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when project not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'POST',
      url: '/stages',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('creates a new stage and returns 201', async () => {
    // First maybeSingle: project exists
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null })
      // Second maybeSingle: stage does not exist yet
      .mockResolvedValueOnce({ data: null, error: null });

    // single: new stage created
    mockChain.single.mockResolvedValueOnce({
      data: { id: 'stage-1', stage_type: 'research', version: 1 },
      error: null,
    });

    // project update (no .single() — uses chain directly)
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'POST',
      url: '/stages',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.message).toBe('Stage created successfully');
    expect(body.error).toBeNull();

    delete mockChain.then;
  });

  it('updates existing stage, archives old version, and returns 200', async () => {
    const existingStage = {
      id: 'stage-1',
      stage_type: 'research',
      version: 2,
      yaml_artifact: 'old yaml content that exists already',
    };

    // First maybeSingle: project exists
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null })
      // Second maybeSingle: existing stage found
      .mockResolvedValueOnce({ data: existingStage, error: null });

    // insert (revision): uses chain
    // single: updated stage
    mockChain.single.mockResolvedValueOnce({
      data: { ...existingStage, version: 3, yaml_artifact: VALID_YAML },
      error: null,
    });

    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'POST',
      url: '/stages',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.message).toBe('Stage updated successfully');
    expect(body.data.previous_version).toBe(2);
    expect(body.error).toBeNull();

    delete mockChain.then;
  });

  it('normalizes legacy stage type (discovery → brainstorm)', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null })
      // Normalized lookup (brainstorm): not found
      .mockResolvedValueOnce({ data: null, error: null })
      // Alt lookup (discovery): also not found — brand new stage
      .mockResolvedValueOnce({ data: null, error: null });

    mockChain.single.mockResolvedValueOnce({
      data: { id: 'stage-1', stage_type: 'brainstorm', version: 1 },
      error: null,
    });

    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'POST',
      url: '/stages',
      headers: AUTH,
      payload: { ...validBody, stage_type: 'discovery' },
    });
    expect(res.statusCode).toBe(201);
    // verify insert was called with brainstorm
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ stage_type: 'brainstorm' }),
    );

    delete mockChain.then;
  });
});

// ─── GET /stages/:projectId ───────────────────────────────────────────────────

describe('GET /stages/:projectId', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: `/stages/${PROJECT_ID}` });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when project not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: `/stages/${PROJECT_ID}`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('returns stages for a project', async () => {
    const stagesList = [
      { id: 'stage-1', stage_type: 'research', version: 1 },
      { id: 'stage-2', stage_type: 'production', version: 1 },
    ];

    // First maybeSingle: project
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: PROJECT_ID, current_stage: 'research' },
      error: null,
    });

    // stages query: uses chain (order returns data directly)
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ data: stagesList, error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'GET',
      url: `/stages/${PROJECT_ID}`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.project_id).toBe(PROJECT_ID);
    expect(body.data.current_stage).toBe('research');
    expect(body.error).toBeNull();

    delete mockChain.then;
  });
});

// ─── GET /stages/:projectId/:stageType ───────────────────────────────────────

describe('GET /stages/:projectId/:stageType', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid stage type', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/stages/${PROJECT_ID}/invalid-type`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_STAGE_TYPE');
  });

  it('returns 404 when project not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('returns 404 when stage not found', async () => {
    // project exists
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { id: PROJECT_ID, current_stage: null }, error: null })
      // stage not found
      .mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('STAGE_NOT_FOUND');
  });

  it('returns stage with revision history', async () => {
    const stageData = {
      id: 'stage-1',
      stage_type: 'research',
      version: 3,
      revisions: [{ id: 'rev-1', version: 2 }],
    };

    // project
    mockChain.maybeSingle
      .mockResolvedValueOnce({
        data: { id: PROJECT_ID, current_stage: 'research' },
        error: null,
      })
      // stage
      .mockResolvedValueOnce({ data: stageData, error: null });

    const res = await app.inject({
      method: 'GET',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.stage.id).toBe('stage-1');
    expect(body.data.project_id).toBe(PROJECT_ID);
    expect(body.data.is_current_stage).toBe(true);
    expect(body.error).toBeNull();
  });
});

// ─── PUT /stages/:projectId/:stageType ───────────────────────────────────────

describe('PUT /stages/:projectId/:stageType', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}`,
      payload: { yaml_artifact: VALID_YAML },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid stage type', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/stages/${PROJECT_ID}/bad-type`,
      headers: AUTH,
      payload: { yaml_artifact: VALID_YAML },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_STAGE_TYPE');
  });

  it('returns 404 when project not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PUT',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}`,
      headers: AUTH,
      payload: { yaml_artifact: VALID_YAML },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('returns 404 when stage not found', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PUT',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}`,
      headers: AUTH,
      payload: { yaml_artifact: VALID_YAML },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('STAGE_NOT_FOUND');
  });

  it('updates stage and returns 200', async () => {
    const existingStage = {
      id: 'stage-1',
      stage_type: 'research',
      version: 1,
      yaml_artifact: 'old yaml artifact content for the test',
    };

    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null })
      .mockResolvedValueOnce({ data: existingStage, error: null });

    mockChain.single.mockResolvedValueOnce({
      data: { ...existingStage, version: 2, yaml_artifact: VALID_YAML },
      error: null,
    });

    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'PUT',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}`,
      headers: AUTH,
      payload: { yaml_artifact: VALID_YAML },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.message).toBe('Stage updated successfully');
    expect(body.data.previous_version).toBe(1);
    expect(body.error).toBeNull();

    delete mockChain.then;
  });
});

// ─── PATCH /stages/:projectId/:stageType ─────────────────────────────────────

describe('PATCH /stages/:projectId/:stageType', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}`,
      payload: { yaml_artifact: VALID_YAML },
    });
    expect(res.statusCode).toBe(401);
  });

  it('updates stage and returns 200', async () => {
    const existingStage = {
      id: 'stage-1',
      stage_type: 'research',
      version: 1,
      yaml_artifact: 'old yaml artifact content for the test',
    };

    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null })
      .mockResolvedValueOnce({ data: existingStage, error: null });

    mockChain.single.mockResolvedValueOnce({
      data: { ...existingStage, version: 2, yaml_artifact: VALID_YAML },
      error: null,
    });

    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'PATCH',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}`,
      headers: AUTH,
      payload: { yaml_artifact: VALID_YAML },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.message).toBe('Stage updated successfully');
    expect(body.error).toBeNull();

    delete mockChain.then;
  });
});

// ─── POST /stages/:projectId/:stageType/revisions ────────────────────────────

describe('POST /stages/:projectId/:stageType/revisions', () => {
  const validRevisionBody = {
    yaml_artifact: VALID_YAML,
    created_by: 'user-123',
    change_notes: 'Manual snapshot before major edit',
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}/revisions`,
      payload: validRevisionBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid stage type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/stages/${PROJECT_ID}/bad-type/revisions`,
      headers: AUTH,
      payload: validRevisionBody,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_STAGE_TYPE');
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}/revisions`,
      headers: AUTH,
      payload: { yaml_artifact: 'short' }, // too short
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when project not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'POST',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}/revisions`,
      headers: AUTH,
      payload: validRevisionBody,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('returns 404 when stage not found', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'POST',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}/revisions`,
      headers: AUTH,
      payload: validRevisionBody,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('STAGE_NOT_FOUND');
  });

  it('creates revision and returns 201', async () => {
    const stageData = { id: 'stage-1', stage_type: 'research', version: 3 };

    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null })
      .mockResolvedValueOnce({ data: stageData, error: null });

    // revision insert
    mockChain.single
      .mockResolvedValueOnce({
        data: { id: 'rev-1', stage_id: 'stage-1', version: 3 },
        error: null,
      })
      // updated stage
      .mockResolvedValueOnce({
        data: { ...stageData, revisions: [{ count: 4 }] },
        error: null,
      });

    const res = await app.inject({
      method: 'POST',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}/revisions`,
      headers: AUTH,
      payload: validRevisionBody,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.message).toBe('Revision created successfully');
    expect(body.data.revision.id).toBe('rev-1');
    expect(body.error).toBeNull();
  });
});

// ─── GET /stages/:projectId/:stageType/revisions ─────────────────────────────

describe('GET /stages/:projectId/:stageType/revisions', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}/revisions`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid stage type', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/stages/${PROJECT_ID}/bad-type/revisions`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_STAGE_TYPE');
  });

  it('returns 404 when project not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}/revisions`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('returns 404 when stage not found', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}/revisions`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('STAGE_NOT_FOUND');
  });

  it('returns revisions for a stage', async () => {
    const stageData = { id: 'stage-1', stage_type: 'research', version: 3 };
    const revisionsList = [
      { id: 'rev-2', version: 3 },
      { id: 'rev-1', version: 2 },
    ];

    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { id: PROJECT_ID }, error: null })
      .mockResolvedValueOnce({ data: stageData, error: null });

    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ data: revisionsList, error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'GET',
      url: `/stages/${PROJECT_ID}/${STAGE_TYPE}/revisions`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.stage_id).toBe('stage-1');
    expect(body.data.project_id).toBe(PROJECT_ID);
    expect(body.data.stage_type).toBe('research');
    expect(body.error).toBeNull();

    delete mockChain.then;
  });
});
