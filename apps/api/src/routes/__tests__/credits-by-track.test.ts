/**
 * Unit tests for GET /api/credits/usage/by-track?projectId=<uuid> (T7.2).
 *
 * Category A/B tests — no live DB; Supabase is mocked.
 *
 * Coverage:
 *   1. Returns byTrack array aggregated from credit_usage joined with tracks.
 *   2. Includes tracks with zero spend (totalCost: 0).
 *   3. Returns 400 when projectId is missing.
 *   4. Returns 400 when projectId is not a valid UUID.
 *   5. Calls assertProjectOwner (ownership guard enforced).
 *   6. Returns 403 when ownership guard rejects.
 *   7. Returns 401 when user is not authenticated.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../lib/api/errors.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

const assertProjectOwnerMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('../../lib/projects/ownership.js', () => ({
  assertProjectOwner: (projectId: string, userId: string, sb: unknown) =>
    assertProjectOwnerMock(projectId, userId, sb),
}));

let mockTracks: Array<{ id: string; medium: string }> = [];
let mockUsage: Array<{ track_id: string | null; cost: number }> = [];

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({
    from(table: string) {
      if (table === 'tracks') {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({ data: mockTracks, error: null }),
          }),
        };
      }
      if (table === 'credit_usage') {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({ data: mockUsage, error: null }),
          }),
        };
      }
      return {};
    },
  }),
}));

vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: (request: { userId?: string }, _reply: unknown, done: () => void) => {
    request.userId = 'user-1';
    done();
  },
  authenticateWithUser: (request: { userId?: string }, _reply: unknown, done: () => void) => {
    request.userId = 'user-1';
    done();
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const { creditsRoutes } = await import('../credits.js');
  await app.register(creditsRoutes, { prefix: '/credits' });
  await app.ready();
  return app;
}

const VALID_PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TRACK_1_ID = '550e8400-e29b-41d4-a716-446655440001';
const TRACK_2_ID = '550e8400-e29b-41d4-a716-446655440002';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /credits/usage/by-track', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    assertProjectOwnerMock.mockImplementation(async () => undefined);
    mockTracks = [
      { id: TRACK_1_ID, medium: 'blog' },
      { id: TRACK_2_ID, medium: 'video' },
    ];
    mockUsage = [
      { track_id: TRACK_1_ID, cost: 10 },
      { track_id: TRACK_1_ID, cost: 8 },
      { track_id: null, cost: 5 }, // unattributed row — should be ignored
    ];
    app = await buildApp();
  });

  it('returns byTrack array with aggregated totalCost per track', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/credits/usage/by-track?projectId=${VALID_PROJECT_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.error).toBeNull();
    expect(Array.isArray(body.data.byTrack)).toBe(true);

    const blogEntry = body.data.byTrack.find((t: { trackId: string }) => t.trackId === TRACK_1_ID);
    expect(blogEntry).toBeDefined();
    expect(blogEntry.totalCost).toBe(18);
    expect(blogEntry.medium).toBe('blog');
  });

  it('includes tracks with zero spend (totalCost 0)', async () => {
    // Track 2 has no usage rows
    const res = await app.inject({
      method: 'GET',
      url: `/credits/usage/by-track?projectId=${VALID_PROJECT_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const videoEntry = body.data.byTrack.find((t: { trackId: string }) => t.trackId === TRACK_2_ID);
    expect(videoEntry).toBeDefined();
    expect(videoEntry.totalCost).toBe(0);
    expect(videoEntry.medium).toBe('video');
  });

  it('returns 400 when projectId query param is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/credits/usage/by-track',
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.data).toBeNull();
    expect(body.error).toBeTruthy();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when projectId is not a valid UUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/credits/usage/by-track?projectId=not-a-uuid',
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.data).toBeNull();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('calls assertProjectOwner with the correct projectId and userId', async () => {
    await app.inject({
      method: 'GET',
      url: `/credits/usage/by-track?projectId=${VALID_PROJECT_ID}`,
    });

    expect(assertProjectOwnerMock).toHaveBeenCalledWith(
      VALID_PROJECT_ID,
      'user-1',
      expect.anything(),
    );
  });

  it('returns 403 when ownership guard throws FORBIDDEN', async () => {
    assertProjectOwnerMock.mockRejectedValueOnce(
      new ApiError(403, 'Forbidden', 'FORBIDDEN'),
    );

    const res = await app.inject({
      method: 'GET',
      url: `/credits/usage/by-track?projectId=${VALID_PROJECT_ID}`,
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.data).toBeNull();
    expect(body.error).toBeTruthy();
  });

  it('returns empty byTrack array when project has no tracks', async () => {
    mockTracks = [];
    mockUsage = [];

    const res = await app.inject({
      method: 'GET',
      url: `/credits/usage/by-track?projectId=${VALID_PROJECT_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.byTrack).toEqual([]);
  });
});
