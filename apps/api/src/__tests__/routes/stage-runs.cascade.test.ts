/**
 * Cascade re-run integration test for POST /projects/:projectId/stage-runs.
 *
 * Spec: when `cascade: true` is sent with a stage, the route MUST mark every
 * non-terminal/successful Stage Run for that stage AND every downstream stage
 * as `aborted` BEFORE calling the orchestrator's `requestStageRun`. The
 * idempotency guard inside `advanceAfter` only treats
 * {queued, running, awaiting_user, completed, skipped} as "still owns the
 * slot" — aborted/failed are free to be re-attempted, so the bulk abort is
 * what lets the chain naturally rebuild.
 *
 * This file pins:
 *   1. The bulk UPDATE covers the right stages (slice from `body.stage`).
 *   2. The status filter targets the right set of statuses.
 *   3. assertProjectOwner runs BEFORE the destructive update.
 *   4. requestStageRun still fires after a successful cascade.
 *   5. A DB failure on the cascade returns 500 CASCADE_FAILED — no half-run.
 *   6. `cascade: false` (or absent) does NOT touch downstream runs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { requestStageRunMock } = vi.hoisted(() => ({ requestStageRunMock: vi.fn() }));
vi.mock('@/lib/pipeline/orchestrator', async () => {
  const actual = await vi.importActual<typeof import('../../lib/pipeline/orchestrator')>(
    '@/lib/pipeline/orchestrator',
  );
  return { ...actual, requestStageRun: requestStageRunMock };
});

// Track every update() call on the chain so we can inspect the cascade payload.
interface MockChain {
  from: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: undefined;
}
const sbChain: MockChain = {} as MockChain;

/**
 * The cascade UPDATE is awaited directly (no terminal `.single()`), so the
 * promise resolution comes from the `.in()` chain itself. Make the last
 * `.in()` call return a thenable that resolves to `{ error }`.
 */
let cascadeUpdateError: unknown = null;
const cascadeCallRecord: Array<{
  table: string;
  updatePayload: unknown;
  filters: Array<{ method: string; args: unknown[] }>;
}> = [];
let currentRecord: (typeof cascadeCallRecord)[number] | null = null;

/**
 * Build a chainable + thenable object returned after `update(...)`. Subsequent
 * `.eq` / `.in` calls return the same object (records the filter, stays
 * chainable). Awaiting the object at any point resolves to `{ error }` —
 * matches the supabase-js fluent builder semantics.
 */
function makeUpdateChain(): Record<string, unknown> & PromiseLike<{ error: unknown }> {
  const ch: Record<string, unknown> & PromiseLike<{ error: unknown }> = {
    then(onResolve, onReject) {
      return Promise.resolve({ error: cascadeUpdateError }).then(onResolve, onReject);
    },
  } as Record<string, unknown> & PromiseLike<{ error: unknown }>;

  ['eq', 'in', 'select'].forEach((m) => {
    (ch as unknown as Record<string, ReturnType<typeof vi.fn>>)[m] = vi.fn((...args: unknown[]) => {
      if (currentRecord && (m === 'eq' || m === 'in')) {
        currentRecord.filters.push({ method: m, args });
      }
      return ch;
    });
  });
  return ch;
}

function makeChain() {
  // `from`, `select`, `update`, `eq`, `in`, `order` on the base chain — used
  // by both cascade and non-cascade paths.
  ['from', 'select', 'eq', 'in', 'order'].forEach((m) => {
    (sbChain as unknown as Record<string, ReturnType<typeof vi.fn>>)[m] = vi.fn(
      (...args: unknown[]) => {
        if (m === 'from') {
          currentRecord = { table: args[0] as string, updatePayload: undefined, filters: [] };
          cascadeCallRecord.push(currentRecord);
        }
        if (currentRecord && (m === 'eq' || m === 'in')) {
          currentRecord.filters.push({ method: m, args });
        }
        return sbChain;
      },
    );
  });
  // update() pivots to a chainable+thenable so awaiting resolves to {error}.
  sbChain.update = vi.fn((payload: unknown) => {
    if (currentRecord) currentRecord.updatePayload = payload;
    return makeUpdateChain() as unknown;
  }) as ReturnType<typeof vi.fn>;
  sbChain.maybeSingle = vi.fn();
  sbChain.then = undefined;
}

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => sbChain,
}));

const { assertProjectOwnerMock } = vi.hoisted(() => ({
  assertProjectOwnerMock: vi.fn(async () => undefined),
}));
vi.mock('@/lib/projects/ownership', () => ({
  assertProjectOwner: assertProjectOwnerMock,
}));

const { inngestSendMock } = vi.hoisted(() => ({
  inngestSendMock: vi.fn(async () => ({ ids: ['evt-1'] })),
}));
vi.mock('@/jobs/client', () => ({ inngest: { send: inngestSendMock } }));

vi.mock('@/middleware/authenticate', () => ({
  authenticate: vi.fn(async (request: any, reply: any) => {
    const key = request.headers['x-internal-key'];
    if (!key || key !== process.env.INTERNAL_API_KEY) {
      return reply
        .status(401)
        .send({ data: null, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
    }
    request.userId = request.headers['x-user-id'];
  }),
}));

// ─── Import under test (after mocks) ────────────────────────────────────────

import { stageRunsRoutes } from '@/routes/stage-runs';

const AUTH = { 'x-internal-key': 'test-key', 'x-user-id': 'user-1' };
const PROJECT_ID = 'proj-1';

let app: FastifyInstance;

beforeEach(async () => {
  process.env.INTERNAL_API_KEY = 'test-key';
  vi.clearAllMocks();
  cascadeCallRecord.length = 0;
  currentRecord = null;
  cascadeUpdateError = null;
  makeChain();
  assertProjectOwnerMock.mockResolvedValue(undefined);
  requestStageRunMock.mockResolvedValue({
    id: 'sr-new',
    projectId: PROJECT_ID,
    stage: 'research',
    status: 'queued',
    attemptNo: 1,
  });

  app = Fastify({ logger: false });
  await app.register(stageRunsRoutes, { prefix: '/projects' });
  await app.ready();
});

describe('POST /:projectId/stage-runs — cascade=true', () => {
  it('marks every downstream Stage Run aborted when cascading from research', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs`,
      headers: AUTH,
      payload: {
        stage: 'research',
        input: { depth: 'medium' },
        cascade: true,
      },
    });

    expect(res.statusCode).toBe(201);

    // Exactly one bulk update on stage_runs
    const updateCalls = cascadeCallRecord.filter((c) => c.table === 'stage_runs');
    expect(updateCalls.length).toBe(1);
    const call = updateCalls[0]!;

    // Payload sets status=aborted with the cascade error message and timestamps
    const payload = call.updatePayload as Record<string, unknown>;
    expect(payload.status).toBe('aborted');
    expect(payload.error_message).toContain('cascade re-run');
    expect(payload.error_message).toContain('research');
    expect(typeof payload.finished_at).toBe('string');
    expect(typeof payload.updated_at).toBe('string');

    // Filters scope to this project + affected stages + the right status set
    const projectFilter = call.filters.find(
      (f) => f.method === 'eq' && f.args[0] === 'project_id',
    );
    expect(projectFilter?.args[1]).toBe(PROJECT_ID);

    const stageFilter = call.filters.find(
      (f) => f.method === 'in' && f.args[0] === 'stage',
    );
    // Cascading from 'research' should hit research + all downstream stages
    expect(stageFilter?.args[1]).toEqual([
      'research', 'draft', 'review', 'assets', 'preview', 'publish',
    ]);

    const statusFilter = call.filters.find(
      (f) => f.method === 'in' && f.args[0] === 'status',
    );
    // Only "still owns the slot" statuses are superseded — failed/aborted are
    // already free for re-attempt and should be left alone.
    expect(statusFilter?.args[1]).toEqual([
      'queued', 'running', 'awaiting_user', 'completed', 'skipped',
    ]);
  });

  it('cascades the WHOLE pipeline when cascading from brainstorm', async () => {
    requestStageRunMock.mockResolvedValueOnce({
      id: 'sr-brain',
      projectId: PROJECT_ID,
      stage: 'brainstorm',
      status: 'queued',
      attemptNo: 1,
    });

    await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs`,
      headers: AUTH,
      payload: {
        stage: 'brainstorm',
        input: { mode: 'topic_driven', topic: 'x' },
        cascade: true,
      },
    });

    const call = cascadeCallRecord.find((c) => c.table === 'stage_runs')!;
    const stageFilter = call.filters.find(
      (f) => f.method === 'in' && f.args[0] === 'stage',
    );
    expect(stageFilter?.args[1]).toEqual([
      'brainstorm', 'research', 'draft', 'review', 'assets', 'preview', 'publish',
    ]);
  });

  it('cascades only publish itself when cascading from publish (no downstream)', async () => {
    requestStageRunMock.mockResolvedValueOnce({
      id: 'sr-pub',
      projectId: PROJECT_ID,
      stage: 'publish',
      status: 'awaiting_user',
      attemptNo: 1,
    });

    await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs`,
      headers: AUTH,
      payload: {
        stage: 'publish',
        input: {},
        cascade: true,
      },
    });

    const call = cascadeCallRecord.find((c) => c.table === 'stage_runs')!;
    const stageFilter = call.filters.find(
      (f) => f.method === 'in' && f.args[0] === 'stage',
    );
    expect(stageFilter?.args[1]).toEqual(['publish']);
  });

  it('asserts project ownership BEFORE issuing the destructive bulk update', async () => {
    // Make ownership fail — the cascade UPDATE must NOT be issued.
    assertProjectOwnerMock.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { statusCode: 403, code: 'FORBIDDEN' }),
    );

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs`,
      headers: AUTH,
      payload: {
        stage: 'research',
        input: { depth: 'medium' },
        cascade: true,
      },
    });

    // Status comes from the error mapper — anything 4xx is fine; the
    // load-bearing assertion is that the update never ran.
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(cascadeCallRecord.find((c) => c.table === 'stage_runs')).toBeUndefined();
    expect(requestStageRunMock).not.toHaveBeenCalled();
  });

  it('still creates the new Stage Run after a successful cascade', async () => {
    await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs`,
      headers: AUTH,
      payload: {
        stage: 'research',
        input: { depth: 'medium' },
        cascade: true,
      },
    });

    // Cascade fires first, then requestStageRun is invoked exactly once
    expect(cascadeCallRecord.find((c) => c.table === 'stage_runs')).toBeDefined();
    expect(requestStageRunMock).toHaveBeenCalledTimes(1);
    expect(requestStageRunMock).toHaveBeenCalledWith(
      PROJECT_ID,
      'research',
      { depth: 'medium' },
      'user-1',
    );
  });

  it('returns 500 CASCADE_FAILED when the bulk update errors, and does NOT create a new run', async () => {
    cascadeUpdateError = { message: 'connection lost', code: '57P03' };

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs`,
      headers: AUTH,
      payload: {
        stage: 'research',
        input: { depth: 'medium' },
        cascade: true,
      },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('CASCADE_FAILED');
    // The new Stage Run MUST NOT be created when cascade fails — half-state
    // would leave the project with a fresh research run and a stale draft.
    expect(requestStageRunMock).not.toHaveBeenCalled();
  });
});

describe('POST /:projectId/stage-runs — cascade=false (or absent)', () => {
  it('does NOT touch downstream Stage Runs when cascade is absent', async () => {
    await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs`,
      headers: AUTH,
      payload: { stage: 'research', input: { depth: 'medium' } },
    });

    // No update calls to stage_runs at all
    expect(cascadeCallRecord.find((c) => c.table === 'stage_runs')).toBeUndefined();
    // But the Stage Run is still created normally
    expect(requestStageRunMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT touch downstream Stage Runs when cascade is explicitly false', async () => {
    await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/stage-runs`,
      headers: AUTH,
      payload: {
        stage: 'research',
        input: { depth: 'medium' },
        cascade: false,
      },
    });

    expect(cascadeCallRecord.find((c) => c.table === 'stage_runs')).toBeUndefined();
    expect(requestStageRunMock).toHaveBeenCalledTimes(1);
  });
});
