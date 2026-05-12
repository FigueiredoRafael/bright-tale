/**
 * Slice 2 (#10) — Generic Stage Run intake endpoint + Brainstorm dispatcher.
 *
 * Covers:
 *   POST /projects/:projectId/stage-runs    — create a Stage Run
 *   GET  /projects/:projectId/stages         — snapshot of latest Stage Runs
 *
 * Strategy: mock the orchestrator module so route logic can be tested
 * in isolation from DB. (Orchestrator behaviour is covered separately
 * in apps/api/src/lib/pipeline/__tests__/orchestrator.test.ts.)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ─── Mock orchestrator + supabase before importing the route ────────────────

const { requestStageRunMock } = vi.hoisted(() => ({ requestStageRunMock: vi.fn() }));

vi.mock('@/lib/pipeline/orchestrator', async () => {
  const actual = await vi.importActual<typeof import('../../lib/pipeline/orchestrator')>(
    '@/lib/pipeline/orchestrator',
  );
  return {
    ...actual,
    requestStageRun: requestStageRunMock,
  };
});

// Snapshot endpoint reads stage_runs through supabase directly. Provide a chain.
const sbChain: Record<string, any> = {};
['from', 'select', 'eq', 'order', 'update'].forEach((m) => {
  sbChain[m] = vi.fn().mockReturnValue(sbChain);
});
sbChain.maybeSingle = vi.fn();
sbChain.then = undefined; // not a thenable except via terminal ops

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => sbChain,
}));

// Stub assertProjectOwner so route tests don't have to mock projects + channels.
const { assertProjectOwnerMock } = vi.hoisted(() => ({ assertProjectOwnerMock: vi.fn(async () => undefined) }));
vi.mock('@/lib/projects/ownership', () => ({
  assertProjectOwner: assertProjectOwnerMock,
}));

// Stub inngest so Continue endpoint can dispatch without a real client.
const { inngestSendMock } = vi.hoisted(() => ({ inngestSendMock: vi.fn(async () => ({ ids: ['evt-1'] })) }));
vi.mock('@/jobs/client', () => ({
  inngest: { send: inngestSendMock },
}));

vi.mock('@/middleware/authenticate', () => ({
  authenticate: vi.fn(async (request: any, reply: any) => {
    const key = request.headers['x-internal-key'];
    if (!key || key !== process.env.INTERNAL_API_KEY) {
      return reply.status(401).send({ data: null, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
    }
    request.userId = request.headers['x-user-id'];
  }),
}));

import { stageRunsRoutes } from '@/routes/stage-runs';
import {
  StageNotMigratedError,
  StageInputValidationError,
  PredecessorNotDoneError,
  ConcurrentStageRunError,
} from '@/lib/pipeline/orchestrator';
import { ApiError } from '@/lib/api/errors';

const AUTH = { 'x-internal-key': 'test-key', 'x-user-id': 'user-1' };
const PROJECT_ID = 'proj-1';

let app: FastifyInstance;

beforeEach(async () => {
  process.env.INTERNAL_API_KEY = 'test-key';
  vi.clearAllMocks();
  // Reset chain methods (preserve self-return semantics)
  ['from', 'select', 'eq', 'order', 'update'].forEach((m) => {
    sbChain[m] = vi.fn().mockReturnValue(sbChain);
  });
  sbChain.maybeSingle = vi.fn();
  assertProjectOwnerMock.mockResolvedValue(undefined);

  app = Fastify({ logger: false });
  await app.register(stageRunsRoutes, { prefix: '/projects' });
  await app.ready();
});

// ─── POST /:projectId/stage-runs ─────────────────────────────────────────────

describe('POST /projects/:projectId/stage-runs', () => {
  it('creates a queued brainstorm Stage Run and returns the row in the envelope', async () => {
    requestStageRunMock.mockResolvedValueOnce({
      id: 'sr-1',
      projectId: PROJECT_ID,
      stage: 'brainstorm',
      status: 'queued',
      attemptNo: 1,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs`,
      headers: AUTH,
      payload: { stage: 'brainstorm', input: { mode: 'topic_driven', topic: 'deep work' } },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.error).toBeNull();
    expect(body.data.stageRun.id).toBe('sr-1');
    expect(body.data.stageRun.stage).toBe('brainstorm');
    expect(body.data.stageRun.status).toBe('queued');
    expect(requestStageRunMock).toHaveBeenCalledWith(
      PROJECT_ID,
      'brainstorm',
      { mode: 'topic_driven', topic: 'deep work' },
      'user-1',
    );
  });

  it('returns 400 STAGE_NOT_MIGRATED when stage is not yet migrated', async () => {
    requestStageRunMock.mockRejectedValueOnce(new StageNotMigratedError('research'));

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs`,
      headers: AUTH,
      payload: { stage: 'research', input: {} },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('STAGE_NOT_MIGRATED');
  });

  it('returns 403 when the caller does not own the project', async () => {
    requestStageRunMock.mockRejectedValueOnce(new ApiError(403, 'Forbidden', 'FORBIDDEN'));

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs`,
      headers: AUTH,
      payload: { stage: 'brainstorm', input: { mode: 'topic_driven', topic: 'x' } },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('returns 409 CONCURRENT_STAGE_RUN when a non-terminal run already exists', async () => {
    requestStageRunMock.mockRejectedValueOnce(new ConcurrentStageRunError('brainstorm'));

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs`,
      headers: AUTH,
      payload: { stage: 'brainstorm', input: { mode: 'topic_driven', topic: 'x' } },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONCURRENT_STAGE_RUN');
  });

  it('returns 409 PREDECESSOR_NOT_DONE when predecessor stage has no terminal-OK run', async () => {
    requestStageRunMock.mockRejectedValueOnce(new PredecessorNotDoneError('research', 'brainstorm'));

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs`,
      headers: AUTH,
      payload: { stage: 'research', input: {} },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('PREDECESSOR_NOT_DONE');
  });

  it('returns 400 when input fails schema validation', async () => {
    requestStageRunMock.mockRejectedValueOnce(
      new StageInputValidationError('brainstorm', 'mode is required'),
    );

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs`,
      headers: AUTH,
      payload: { stage: 'brainstorm', input: {} },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('STAGE_INPUT_VALIDATION');
  });

  it('returns 400 when request body itself is malformed (no stage)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs`,
      headers: AUTH,
      payload: { input: {} },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(requestStageRunMock).not.toHaveBeenCalled();
  });

  it('returns 401 without the internal API key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs`,
      headers: { 'x-user-id': 'user-1' },
      payload: { stage: 'brainstorm', input: { mode: 'topic_driven', topic: 'x' } },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /:projectId/stages ──────────────────────────────────────────────────

describe('GET /projects/:projectId/stages', () => {
  it('returns the latest Stage Run per Stage', async () => {
    // Snapshot endpoint queries `stage_runs` ordered by created_at desc.
    // The route is responsible for de-duping to one per stage.
    // It ALSO fetches the project's mode/paused via maybeSingle.
    sbChain.maybeSingle = vi.fn().mockResolvedValueOnce({
      data: { mode: 'autopilot', paused: false },
      error: null,
    });
    sbChain.order = vi.fn().mockResolvedValueOnce({
      data: [
        {
          id: 'sr-3',
          project_id: PROJECT_ID,
          stage: 'brainstorm',
          status: 'completed',
          awaiting_reason: null,
          payload_ref: { kind: 'brainstorm_draft', id: 'bd-1' },
          attempt_no: 2,
          input_json: null,
          error_message: null,
          started_at: '2026-05-11T16:00:00Z',
          finished_at: '2026-05-11T16:01:00Z',
          created_at: '2026-05-11T16:00:00Z',
          updated_at: '2026-05-11T16:01:00Z',
        },
        {
          id: 'sr-2',
          project_id: PROJECT_ID,
          stage: 'brainstorm',
          status: 'failed',
          awaiting_reason: null,
          payload_ref: null,
          attempt_no: 1,
          input_json: null,
          error_message: null,
          started_at: '2026-05-11T15:00:00Z',
          finished_at: '2026-05-11T15:01:00Z',
          created_at: '2026-05-11T15:00:00Z',
          updated_at: '2026-05-11T15:01:00Z',
        },
        {
          id: 'sr-1',
          project_id: PROJECT_ID,
          stage: 'research',
          status: 'queued',
          awaiting_reason: null,
          payload_ref: null,
          attempt_no: 1,
          input_json: null,
          error_message: null,
          started_at: null,
          finished_at: null,
          created_at: '2026-05-11T16:02:00Z',
          updated_at: '2026-05-11T16:02:00Z',
        },
      ],
      error: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/stages`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const { data, error } = res.json();
    expect(error).toBeNull();
    // De-duped: one row per stage (the latest attempt) — so 2 rows for 2 stages
    expect(data.stageRuns).toHaveLength(2);
    const byStage = Object.fromEntries(data.stageRuns.map((r: any) => [r.stage, r]));
    expect(byStage.brainstorm.id).toBe('sr-3'); // attempt_no 2 wins over 1
    expect(byStage.research.id).toBe('sr-1');
  });

  it('returns an empty array when the project has no Stage Runs yet', async () => {
    sbChain.maybeSingle = vi.fn().mockResolvedValueOnce({
      data: { mode: 'autopilot', paused: false },
      error: null,
    });
    sbChain.order = vi.fn().mockResolvedValueOnce({ data: [], error: null });

    const res = await app.inject({
      method: 'GET',
      url: `/projects/${PROJECT_ID}/stages`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.stageRuns).toEqual([]);
  });
});

// ─── POST /:projectId/stage-runs/:stageRunId/continue ────────────────────────

describe('POST /projects/:projectId/stage-runs/:stageRunId/continue', () => {
  it('flips awaiting_user → queued and emits pipeline/stage.requested', async () => {
    sbChain.maybeSingle = vi.fn().mockResolvedValueOnce({
      data: {
        id: 'sr-pub',
        project_id: PROJECT_ID,
        stage: 'publish',
        status: 'awaiting_user',
        awaiting_reason: 'manual_advance',
      },
      error: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs/sr-pub/continue`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.error).toBeNull();
    expect(body.data.stageRunId).toBe('sr-pub');
    expect(body.data.status).toBe('queued');
    expect(body.data.stage).toBe('publish');

    expect(inngestSendMock).toHaveBeenCalledTimes(1);
    const event = (inngestSendMock as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(event.name).toBe('pipeline/stage.requested');
    expect(event.data.stageRunId).toBe('sr-pub');
    expect(event.data.stage).toBe('publish');
  });

  it('returns 409 INVALID_STATUS when Stage Run is not awaiting_user', async () => {
    sbChain.maybeSingle = vi.fn().mockResolvedValueOnce({
      data: { id: 'sr-pub', project_id: PROJECT_ID, stage: 'publish', status: 'running' },
      error: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs/sr-pub/continue`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INVALID_STATUS');
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the Stage Run is not found', async () => {
    sbChain.maybeSingle = vi.fn().mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs/sr-missing/continue`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('returns 403 when caller does not own the project', async () => {
    const { ApiError } = await import('@/lib/api/errors');
    assertProjectOwnerMock.mockRejectedValueOnce(new ApiError(403, 'Forbidden', 'FORBIDDEN'));

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs/sr-pub/continue`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });
});

// ─── PATCH /:projectId/stage-runs/:stageRunId (abort) ────────────────────────

describe('PATCH /projects/:projectId/stage-runs/:stageRunId (abort)', () => {
  it('transitions a running Stage Run to aborted and emits finished', async () => {
    sbChain.maybeSingle = vi.fn().mockResolvedValueOnce({
      data: { id: 'sr-1', project_id: PROJECT_ID, stage: 'brainstorm', status: 'running' },
      error: null,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${PROJECT_ID}/stage-runs/sr-1`,
      headers: AUTH,
      payload: { action: 'abort' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('aborted');
    const updateCall = (sbChain.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.status).toBe('aborted');

    const finishedCall = (inngestSendMock as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => (c[0] as { name: string }).name === 'pipeline/stage.run.finished',
    );
    expect(finishedCall).toBeDefined();
  });

  it('returns 409 when the Stage Run is already terminal', async () => {
    sbChain.maybeSingle = vi.fn().mockResolvedValueOnce({
      data: { id: 'sr-1', project_id: PROJECT_ID, stage: 'brainstorm', status: 'completed' },
      error: null,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${PROJECT_ID}/stage-runs/sr-1`,
      headers: AUTH,
      payload: { action: 'abort' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INVALID_STATUS');
  });

  it('returns 400 when action is not "abort"', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${PROJECT_ID}/stage-runs/sr-1`,
      headers: AUTH,
      payload: { action: 'something_else' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when the Stage Run does not belong to the project', async () => {
    sbChain.maybeSingle = vi.fn().mockResolvedValueOnce({
      data: { id: 'sr-1', project_id: 'OTHER_PROJECT', stage: 'brainstorm', status: 'running' },
      error: null,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${PROJECT_ID}/stage-runs/sr-1`,
      headers: AUTH,
      payload: { action: 'abort' },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ─── POST /:projectId/stage-runs/:stageRunId/manual-output ───────────────────

describe('POST /projects/:projectId/stage-runs/:stageRunId/manual-output', () => {
  it('forwards to the legacy endpoint and marks the Stage Run completed', async () => {
    sbChain.maybeSingle = vi.fn().mockResolvedValueOnce({
      data: {
        id: 'sr-1',
        project_id: PROJECT_ID,
        stage: 'brainstorm',
        status: 'awaiting_user',
        awaiting_reason: 'manual_paste',
        payload_ref: { kind: 'brainstorm_session', id: 'bs-sess-1' },
      },
      error: null,
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { draftIds: ['bd-1'] }, error: null }),
    });
    vi.stubGlobal('fetch', fetchMock);
    process.env.API_URL = 'http://api.test';

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs/sr-1/manual-output`,
      headers: AUTH,
      payload: { output: 'BC_BRAINSTORM_OUTPUT:\n...' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('completed');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/brainstorm/sessions/bs-sess-1/manual-output',
      expect.objectContaining({ method: 'POST' }),
    );

    const updateCall = (sbChain.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.status).toBe('completed');
    expect(updateCall.payload_ref).toEqual({ kind: 'brainstorm_draft', id: 'bd-1' });
  });

  it('returns 409 when the Stage Run is not awaiting_user(manual_paste)', async () => {
    sbChain.maybeSingle = vi.fn().mockResolvedValueOnce({
      data: {
        id: 'sr-1',
        project_id: PROJECT_ID,
        stage: 'brainstorm',
        status: 'running',
        awaiting_reason: null,
        payload_ref: null,
      },
      error: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs/sr-1/manual-output`,
      headers: AUTH,
      payload: { output: 'x' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INVALID_STATUS');
  });

  it('returns 400 STAGE_NOT_SUPPORTED for non-brainstorm stages', async () => {
    sbChain.maybeSingle = vi.fn().mockResolvedValueOnce({
      data: {
        id: 'sr-1',
        project_id: PROJECT_ID,
        stage: 'research',
        status: 'awaiting_user',
        awaiting_reason: 'manual_paste',
        payload_ref: { kind: 'research_session', id: 'rs-1' },
      },
      error: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs/sr-1/manual-output`,
      headers: AUTH,
      payload: { output: 'x' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('STAGE_NOT_SUPPORTED');
  });
});
