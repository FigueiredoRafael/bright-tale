/**
 * T2.10 — POST /projects/:projectId/tracks (Add Medium flow).
 *
 * Strategy mirrors stage-runs.test.ts: mock supabase + orchestrator so the
 * route can be exercised in isolation. The orchestrator's "enqueue Production
 * for a newly-added Track" helper is mocked here; its actual fan-out logic
 * is covered by the orchestrator/fan-out-planner test suites.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { enqueueProductionForNewTrackMock } = vi.hoisted(() => ({
  enqueueProductionForNewTrackMock: vi.fn(async () => undefined),
}));

vi.mock('@/lib/pipeline/orchestrator', async () => {
  const actual = await vi.importActual<typeof import('../../lib/pipeline/orchestrator')>(
    '@/lib/pipeline/orchestrator',
  );
  return {
    ...actual,
    enqueueProductionForNewTrack: enqueueProductionForNewTrackMock,
  };
});

// Chainable supabase mock. Insert path: from→insert→select→single.
// Read path:  from→select→eq→maybeSingle / from→select→eq→eq→order→limit→maybeSingle.
const sbChain: Record<string, any> = {};
[
  'from',
  'insert',
  'select',
  'eq',
  'order',
  'limit',
  'update',
].forEach((m) => {
  sbChain[m] = vi.fn().mockReturnValue(sbChain);
});
sbChain.maybeSingle = vi.fn();
sbChain.single = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => sbChain,
}));

const { assertProjectOwnerMock } = vi.hoisted(() => ({
  assertProjectOwnerMock: vi.fn(async () => undefined),
}));
vi.mock('@/lib/projects/ownership', () => ({
  assertProjectOwner: assertProjectOwnerMock,
}));

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

import { tracksRoutes } from '@/routes/tracks';
import { ApiError } from '@/lib/api/errors';

const AUTH = { 'x-internal-key': 'test-key', 'x-user-id': 'user-1' };
const PROJECT_ID = 'proj-1';

let app: FastifyInstance;

beforeEach(async () => {
  process.env.INTERNAL_API_KEY = 'test-key';
  vi.clearAllMocks();
  ['from', 'insert', 'select', 'eq', 'order', 'limit', 'update'].forEach((m) => {
    sbChain[m] = vi.fn().mockReturnValue(sbChain);
  });
  sbChain.maybeSingle = vi.fn();
  sbChain.single = vi.fn();
  assertProjectOwnerMock.mockResolvedValue(undefined);
  enqueueProductionForNewTrackMock.mockResolvedValue(undefined);

  app = Fastify({ logger: false });
  await app.register(tracksRoutes, { prefix: '/projects' });
  await app.ready();
});

describe('POST /projects/:projectId/tracks', () => {
  it('inserts a Track and returns it in the {data,error} envelope', async () => {
    // Project mode lookup — manual (no enqueue branch).
    sbChain.maybeSingle.mockResolvedValueOnce({
      data: { id: PROJECT_ID, mode: 'manual', autopilot_config_json: null },
      error: null,
    });
    // Insert .select().single() result.
    sbChain.single.mockResolvedValueOnce({
      data: {
        id: 'tr-1',
        project_id: PROJECT_ID,
        medium: 'video',
        status: 'active',
        paused: false,
        autopilot_config_json: null,
        created_at: '2026-05-15T10:00:00Z',
        updated_at: '2026-05-15T10:00:00Z',
      },
      error: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/tracks`,
      headers: AUTH,
      payload: { medium: 'video' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.error).toBeNull();
    expect(body.data.track.id).toBe('tr-1');
    expect(body.data.track.medium).toBe('video');
    expect(body.data.track.projectId).toBe(PROJECT_ID);
    expect(assertProjectOwnerMock).toHaveBeenCalledWith(PROJECT_ID, 'user-1', expect.anything());
    expect(enqueueProductionForNewTrackMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the medium is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/tracks`,
      headers: AUTH,
      payload: { medium: 'tiktok' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without the internal API key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/tracks`,
      headers: { 'x-user-id': 'user-1' },
      payload: { medium: 'blog' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when the caller does not own the project', async () => {
    assertProjectOwnerMock.mockRejectedValueOnce(new ApiError(403, 'Forbidden', 'FORBIDDEN'));

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/tracks`,
      headers: AUTH,
      payload: { medium: 'blog' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('returns 404 when the project is missing', async () => {
    assertProjectOwnerMock.mockRejectedValueOnce(new ApiError(404, 'Project not found', 'NOT_FOUND'));

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/tracks`,
      headers: AUTH,
      payload: { medium: 'blog' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('enqueues Production when project is autopilot and Canonical is completed', async () => {
    sbChain.maybeSingle.mockResolvedValueOnce({
      data: { id: PROJECT_ID, mode: 'autopilot', autopilot_config_json: { defaultProvider: 'recommended' } },
      error: null,
    });
    sbChain.single.mockResolvedValueOnce({
      data: {
        id: 'tr-9',
        project_id: PROJECT_ID,
        medium: 'shorts',
        status: 'active',
        paused: false,
        autopilot_config_json: null,
        created_at: '2026-05-15T10:00:00Z',
        updated_at: '2026-05-15T10:00:00Z',
      },
      error: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/tracks`,
      headers: AUTH,
      payload: { medium: 'shorts' },
    });

    expect(res.statusCode).toBe(201);
    expect(enqueueProductionForNewTrackMock).toHaveBeenCalledWith(PROJECT_ID, 'tr-9');
  });

  it('does NOT enqueue Production when project mode is not autopilot', async () => {
    sbChain.maybeSingle.mockResolvedValueOnce({
      data: { id: PROJECT_ID, mode: 'manual', autopilot_config_json: null },
      error: null,
    });
    sbChain.single.mockResolvedValueOnce({
      data: {
        id: 'tr-2',
        project_id: PROJECT_ID,
        medium: 'podcast',
        status: 'active',
        paused: false,
        autopilot_config_json: null,
        created_at: '2026-05-15T10:00:00Z',
        updated_at: '2026-05-15T10:00:00Z',
      },
      error: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/tracks`,
      headers: AUTH,
      payload: { medium: 'podcast' },
    });

    expect(res.statusCode).toBe(201);
    expect(enqueueProductionForNewTrackMock).not.toHaveBeenCalled();
  });

  it('persists autopilotConfigJson onto the inserted Track', async () => {
    sbChain.maybeSingle.mockResolvedValueOnce({
      data: { id: PROJECT_ID, mode: 'manual', autopilot_config_json: null },
      error: null,
    });
    sbChain.single.mockResolvedValueOnce({
      data: {
        id: 'tr-3',
        project_id: PROJECT_ID,
        medium: 'blog',
        status: 'active',
        paused: false,
        autopilot_config_json: { review: { maxIterations: 2, autoApproveThreshold: 90, hardFailThreshold: 50 } },
        created_at: '2026-05-15T10:00:00Z',
        updated_at: '2026-05-15T10:00:00Z',
      },
      error: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${PROJECT_ID}/tracks`,
      headers: AUTH,
      payload: {
        medium: 'blog',
        autopilotConfigJson: {
          review: { maxIterations: 2, autoApproveThreshold: 90, hardFailThreshold: 50 },
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const insertCall = (sbChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertCall.project_id).toBe(PROJECT_ID);
    expect(insertCall.medium).toBe('blog');
    expect(insertCall.autopilot_config_json).toEqual({
      review: { maxIterations: 2, autoApproveThreshold: 90, hardFailThreshold: 50 },
    });
  });
});
