/**
 * T2.11 — PATCH /projects/:projectId/tracks/:trackId.
 *
 * Mirrors tracks.test.ts: supabase + abort-cascade helper mocked so the
 * route can be exercised in isolation. Cascade semantics (which stage_runs
 * get aborted) are owned by lib/pipeline/abortTrack; here we only assert
 * the route calls it on `status: 'aborted'`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { abortTrackMock } = vi.hoisted(() => ({
  abortTrackMock: vi.fn(async () => undefined),
}));
vi.mock('@/lib/pipeline/abortTrack', () => ({
  abortTrack: abortTrackMock,
}));

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
const TRACK_ID = 'tr-1';

let app: FastifyInstance;

function trackRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: TRACK_ID,
    project_id: PROJECT_ID,
    medium: 'video',
    status: 'active',
    paused: false,
    autopilot_config_json: null,
    created_at: '2026-05-15T10:00:00Z',
    updated_at: '2026-05-15T10:00:00Z',
    ...overrides,
  };
}

beforeEach(async () => {
  process.env.INTERNAL_API_KEY = 'test-key';
  vi.clearAllMocks();
  ['from', 'insert', 'select', 'eq', 'order', 'limit', 'update'].forEach((m) => {
    sbChain[m] = vi.fn().mockReturnValue(sbChain);
  });
  sbChain.maybeSingle = vi.fn();
  sbChain.single = vi.fn();
  assertProjectOwnerMock.mockResolvedValue(undefined);
  abortTrackMock.mockResolvedValue(undefined);

  app = Fastify({ logger: false });
  await app.register(tracksRoutes, { prefix: '/projects' });
  await app.ready();
});

describe('PATCH /projects/:projectId/tracks/:trackId', () => {
  it('pauses an active Track and returns the updated row', async () => {
    // Existing track lookup.
    sbChain.maybeSingle.mockResolvedValueOnce({
      data: trackRow({ paused: false }),
      error: null,
    });
    // Update .select().single() result.
    sbChain.single.mockResolvedValueOnce({
      data: trackRow({ paused: true, updated_at: '2026-05-15T10:05:00Z' }),
      error: null,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${PROJECT_ID}/tracks/${TRACK_ID}`,
      headers: AUTH,
      payload: { paused: true },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.error).toBeNull();
    expect(body.data.track.paused).toBe(true);
    expect(body.data.track.id).toBe(TRACK_ID);

    const updateCall = (sbChain.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.paused).toBe(true);
    expect(abortTrackMock).not.toHaveBeenCalled();
    expect(assertProjectOwnerMock).toHaveBeenCalledWith(PROJECT_ID, 'user-1', expect.anything());
  });

  it('aborts a Track and cascades to in-flight stage_runs', async () => {
    sbChain.maybeSingle.mockResolvedValueOnce({
      data: trackRow({ status: 'active' }),
      error: null,
    });
    sbChain.single.mockResolvedValueOnce({
      data: trackRow({ status: 'aborted' }),
      error: null,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${PROJECT_ID}/tracks/${TRACK_ID}`,
      headers: AUTH,
      payload: { status: 'aborted' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.track.status).toBe('aborted');
    expect(abortTrackMock).toHaveBeenCalledWith(PROJECT_ID, TRACK_ID);

    const updateCall = (sbChain.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.status).toBe('aborted');
  });

  it('rejects abort on an already-completed Track', async () => {
    sbChain.maybeSingle.mockResolvedValueOnce({
      data: trackRow({ status: 'completed' }),
      error: null,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${PROJECT_ID}/tracks/${TRACK_ID}`,
      headers: AUTH,
      payload: { status: 'aborted' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('TRACK_TERMINAL');
    expect(abortTrackMock).not.toHaveBeenCalled();
    expect(sbChain.update).not.toHaveBeenCalled();
  });

  it('persists autopilotConfigJson override', async () => {
    sbChain.maybeSingle.mockResolvedValueOnce({
      data: trackRow(),
      error: null,
    });
    const override = { review: { maxIterations: 3 } };
    sbChain.single.mockResolvedValueOnce({
      data: trackRow({ autopilot_config_json: override }),
      error: null,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${PROJECT_ID}/tracks/${TRACK_ID}`,
      headers: AUTH,
      payload: { autopilotConfigJson: override },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.track.autopilotConfigJson).toEqual(override);

    const updateCall = (sbChain.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.autopilot_config_json).toEqual(override);
  });

  it('returns 400 on empty body', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${PROJECT_ID}/tracks/${TRACK_ID}`,
      headers: AUTH,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 on invalid status value', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${PROJECT_ID}/tracks/${TRACK_ID}`,
      headers: AUTH,
      payload: { status: 'completed' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without the internal API key', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${PROJECT_ID}/tracks/${TRACK_ID}`,
      headers: { 'x-user-id': 'user-1' },
      payload: { paused: true },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when the caller does not own the project', async () => {
    assertProjectOwnerMock.mockRejectedValueOnce(new ApiError(403, 'Forbidden', 'FORBIDDEN'));

    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${PROJECT_ID}/tracks/${TRACK_ID}`,
      headers: AUTH,
      payload: { paused: true },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('returns 404 when the Track is not found under the project', async () => {
    sbChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${PROJECT_ID}/tracks/${TRACK_ID}`,
      headers: AUTH,
      payload: { paused: true },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});
