/**
 * Unit tests for GET /api/projects/:id/graph (T2.12).
 *
 * Tests are Category A (no live DB). Supabase is mocked; the route handler
 * and graph-builder are exercised against controlled fixture data.
 *
 * Coverage:
 *   1. Returns { nodes, edges } in @xyflow/react-compatible shape.
 *   2. Sets ETag header derived from node+edge counts.
 *   3. Calls assertProjectOwner (ownership guard enforced).
 *   4. Returns 404 when project does not exist.
 *   5. Returns 403 when ownership check fails.
 *   6. Empty stage_runs / tracks / publish_targets → empty graph (no crash).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../lib/api/errors.js';

// ── Mocks ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const assertProjectOwnerMock = vi.fn(async (..._args: any[]) => undefined);
vi.mock('../../lib/projects/ownership.js', () => ({
  assertProjectOwner: (projectId: string, userId: string, sb: unknown) =>
    assertProjectOwnerMock(projectId, userId, sb),
}));

// Supabase mock: query results are controlled per-test via these variables.
let mockProject: Record<string, unknown> | null = {
  id: 'proj-1',
  channel_id: 'ch-1',
  user_id: 'user-1',
};
let mockStageRuns: Record<string, unknown>[] = [];
let mockTracks: Record<string, unknown>[] = [];
let mockPublishTargets: Record<string, unknown>[] = [];

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({
    from(table: string) {
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: mockProject, error: null }),
            }),
          }),
        };
      }
      if (table === 'stage_runs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                data: mockStageRuns,
                error: null,
                then: (resolve: (v: { data: Record<string, unknown>[]; error: null }) => unknown) =>
                  Promise.resolve(resolve({ data: mockStageRuns, error: null })),
              }),
            }),
          }),
        };
      }
      if (table === 'tracks') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                data: mockTracks,
                error: null,
                then: (resolve: (v: { data: Record<string, unknown>[]; error: null }) => unknown) =>
                  Promise.resolve(resolve({ data: mockTracks, error: null })),
              }),
            }),
          }),
        };
      }
      if (table === 'publish_targets') {
        return {
          select: () => ({
            eq: () => ({
              data: mockPublishTargets,
              error: null,
              then: (resolve: (v: { data: Record<string, unknown>[]; error: null }) => unknown) =>
                Promise.resolve(resolve({ data: mockPublishTargets, error: null })),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

// Stub authenticate — injects userId, skips key validation.
// Must be a synchronous hook (no `done` arg) or a promise — Fastify rejects
// async hooks that also take the `done` callback.
vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: (request: { userId?: string }, _reply: unknown, done: () => void) => {
    request.userId = 'user-1';
    done();
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const { projectsRoutes } = await import('../projects.js');
  await app.register(projectsRoutes, { prefix: '/projects' });
  await app.ready();
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /projects/:id/graph', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset to happy-path defaults
    mockProject = { id: 'proj-1', channel_id: 'ch-1', user_id: 'user-1' };
    mockStageRuns = [];
    mockTracks = [];
    mockPublishTargets = [];
    assertProjectOwnerMock.mockImplementation(async () => undefined);
    app = await buildApp();
  });

  it('returns { nodes, edges } envelope for an empty project', async () => {
    const res = await app.inject({ method: 'GET', url: '/projects/proj-1/graph' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.error).toBeNull();
    expect(body.data).toHaveProperty('nodes');
    expect(body.data).toHaveProperty('edges');
    expect(Array.isArray(body.data.nodes)).toBe(true);
    expect(Array.isArray(body.data.edges)).toBe(true);
  });

  it('sets an ETag header on success', async () => {
    const res = await app.inject({ method: 'GET', url: '/projects/proj-1/graph' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['etag']).toBeTruthy();
  });

  it('calls assertProjectOwner with the correct projectId and userId', async () => {
    await app.inject({ method: 'GET', url: '/projects/proj-1/graph' });

    expect(assertProjectOwnerMock).toHaveBeenCalledWith('proj-1', 'user-1', expect.anything());
  });

  it('returns 403 when ownership guard throws FORBIDDEN', async () => {
    assertProjectOwnerMock.mockRejectedValueOnce(
      new ApiError(403, 'Forbidden', 'FORBIDDEN'),
    );

    const res = await app.inject({ method: 'GET', url: '/projects/proj-1/graph' });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.data).toBeNull();
    expect(body.error).toBeTruthy();
  });

  it('returns 404 when project does not exist', async () => {
    mockProject = null;

    const res = await app.inject({ method: 'GET', url: '/projects/proj-1/graph' });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.data).toBeNull();
    expect(body.error).toBeTruthy();
  });

  it('returns nodes for each stage_run and sequence edges between them', async () => {
    mockStageRuns = [
      {
        id: 'sr-brainstorm-1',
        stage: 'brainstorm',
        status: 'completed',
        track_id: null,
        publish_target_id: null,
        attempt_no: 1,
      },
      {
        id: 'sr-research-1',
        stage: 'research',
        status: 'completed',
        track_id: null,
        publish_target_id: null,
        attempt_no: 1,
      },
    ];
    mockTracks = [];

    const res = await app.inject({ method: 'GET', url: '/projects/proj-1/graph' });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.nodes).toHaveLength(2);
    // brainstorm → research sequence edge
    expect(data.edges.length).toBeGreaterThan(0);
    const sequenceEdge = data.edges.find(
      (e: { kind: string; from: string; to: string }) =>
        e.kind === 'sequence' && e.from === 'sr-brainstorm-1' && e.to === 'sr-research-1',
    );
    expect(sequenceEdge).toBeDefined();
  });

  it('node shape has id, stage, status, lane, label, attemptNo', async () => {
    mockStageRuns = [
      {
        id: 'sr-brainstorm-1',
        stage: 'brainstorm',
        status: 'completed',
        track_id: null,
        publish_target_id: null,
        attempt_no: 1,
      },
    ];

    const res = await app.inject({ method: 'GET', url: '/projects/proj-1/graph' });

    const { data } = res.json();
    const node = data.nodes[0];
    expect(node).toMatchObject({
      id: 'sr-brainstorm-1',
      stage: 'brainstorm',
      status: 'completed',
      lane: 'shared',
      label: 'brainstorm #1',
      attemptNo: 1,
    });
  });

  it('edge shape has id, from, to, kind', async () => {
    mockStageRuns = [
      {
        id: 'sr-b1',
        stage: 'brainstorm',
        status: 'completed',
        track_id: null,
        publish_target_id: null,
        attempt_no: 1,
      },
      {
        id: 'sr-r1',
        stage: 'research',
        status: 'completed',
        track_id: null,
        publish_target_id: null,
        attempt_no: 1,
      },
    ];

    const res = await app.inject({ method: 'GET', url: '/projects/proj-1/graph' });

    const { data } = res.json();
    const edge = data.edges[0];
    expect(edge).toHaveProperty('id');
    expect(edge).toHaveProperty('from');
    expect(edge).toHaveProperty('to');
    expect(edge).toHaveProperty('kind');
  });

  it('excludes nodes belonging to aborted tracks', async () => {
    mockTracks = [
      { id: 'track-1', project_id: 'proj-1', medium: 'blog', status: 'aborted', paused: false },
    ];
    mockStageRuns = [
      {
        id: 'sr-prod-1',
        stage: 'production',
        status: 'completed',
        track_id: 'track-1',
        publish_target_id: null,
        attempt_no: 1,
      },
    ];

    const res = await app.inject({ method: 'GET', url: '/projects/proj-1/graph' });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    // aborted track's stage_run must be excluded
    expect(data.nodes).toHaveLength(0);
  });
});
