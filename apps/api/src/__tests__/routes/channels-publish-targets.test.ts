/**
 * T2.13 — GET /channels/:id/publish-targets
 *
 * Tests:
 *  1. Returns items list in { data: { items }, error: null } envelope (with ?medium).
 *  2. ?medium=blog filters via resolvePublishTargets.
 *  3. credentials_encrypted is NEVER present in the response (with ?medium).
 *  4. Returns 401 without auth.
 *  5. Returns 404 when the caller does not own the channel.
 *  6. Returns 400 when ?medium is invalid.
 *  7. Returns empty items array when no targets exist (with ?medium).
 *  8. Returns all active targets when no ?medium given (uses DB path).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { resolvePublishTargetsMock } = vi.hoisted(() => ({
  resolvePublishTargetsMock: vi.fn(),
}));

vi.mock('@/lib/pipeline/publish-target-resolver', () => ({
  resolvePublishTargets: resolvePublishTargetsMock,
}));

// Chainable supabase mock.
// `sbChain` supports both terminal `.single()` / `.maybeSingle()` calls and
// being directly awaited (no-medium publish-targets path awaits the query chain).
const sbChain: Record<string, unknown> = {};
(['from', 'select', 'eq', 'order', 'limit', 'or'] as const).forEach((m) => {
  sbChain[m] = vi.fn().mockReturnValue(sbChain);
});
sbChain.single = vi.fn();
sbChain.maybeSingle = vi.fn();

// listResult is overridden per-test for the no-medium DB query path.
let listResult: { data: unknown[]; error: null | { message: string } } = {
  data: [],
  error: null,
};
sbChain.then = (
  resolve: (v: { data: unknown[]; error: null | { message: string } }) => unknown,
) => Promise.resolve(listResult).then(resolve);

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => sbChain,
}));

vi.mock('@/middleware/authenticate', () => ({
  authenticate: vi.fn(
    async (
      request: { headers: Record<string, string>; userId?: string },
      reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const key = request.headers['x-internal-key'];
      if (!key || key !== process.env.INTERNAL_API_KEY) {
        return reply
          .status(401)
          .send({ data: null, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      }
      request.userId = request.headers['x-user-id'];
    },
  ),
}));

import { channelsRoutes } from '@/routes/channels';

const AUTH = { 'x-internal-key': 'test-key', 'x-user-id': 'user-1' };
const CHANNEL_ID = 'ch-abc123';
const ORG_ID = 'org-xyz';

const SAMPLE_TARGET = {
  id: 'pt-1',
  channelId: CHANNEL_ID,
  orgId: null,
  type: 'wordpress',
  displayName: 'My Blog',
  configJson: { site_url: 'https://example.com' },
  isActive: true,
  createdAt: '2026-05-14T00:00:00Z',
  updatedAt: '2026-05-14T00:00:00Z',
};

// Raw DB row shape (no-medium path)
const SAMPLE_ROW = {
  id: 'pt-1',
  channel_id: CHANNEL_ID,
  org_id: null,
  type: 'wordpress',
  display_name: 'My Blog',
  config_json: { site_url: 'https://example.com' },
  is_active: true,
  created_at: '2026-05-14T00:00:00Z',
  updated_at: '2026-05-14T00:00:00Z',
};

let app: FastifyInstance;

function seedOrgLookup() {
  (sbChain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    data: { org_id: ORG_ID },
    error: null,
  });
}

function seedChannelOwnership(found = true) {
  (sbChain.single as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    data: found ? { id: CHANNEL_ID } : null,
    error: found ? null : { message: 'Not found', code: 'PGRST116' },
  });
}

beforeEach(async () => {
  process.env.INTERNAL_API_KEY = 'test-key';
  vi.clearAllMocks();

  (['from', 'select', 'eq', 'order', 'limit', 'or'] as const).forEach((m) => {
    sbChain[m] = vi.fn().mockReturnValue(sbChain);
  });
  sbChain.single = vi.fn();
  sbChain.maybeSingle = vi.fn();
  listResult = { data: [], error: null };
  sbChain.then = (
    resolve: (v: { data: unknown[]; error: null | { message: string } }) => unknown,
  ) => Promise.resolve(listResult).then(resolve);

  resolvePublishTargetsMock.mockResolvedValue([]);

  app = Fastify({ logger: false });
  await app.register(channelsRoutes, { prefix: '/channels' });
  await app.ready();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /channels/:id/publish-targets', () => {
  it('returns items in { data: { items }, error: null } envelope', async () => {
    seedOrgLookup();
    seedChannelOwnership(true);
    resolvePublishTargetsMock.mockResolvedValueOnce([SAMPLE_TARGET]);

    const res = await app.inject({
      method: 'GET',
      url: `/channels/${CHANNEL_ID}/publish-targets?medium=blog`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.error).toBeNull();
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].id).toBe('pt-1');
    expect(body.data.items[0].displayName).toBe('My Blog');
  });

  it('passes ?medium=blog to resolvePublishTargets and returns filtered results', async () => {
    seedOrgLookup();
    seedChannelOwnership(true);
    const blogTarget = { ...SAMPLE_TARGET, type: 'wordpress' };
    resolvePublishTargetsMock.mockResolvedValueOnce([blogTarget]);

    const res = await app.inject({
      method: 'GET',
      url: `/channels/${CHANNEL_ID}/publish-targets?medium=blog`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.error).toBeNull();
    expect(body.data.items[0].type).toBe('wordpress');
    expect(resolvePublishTargetsMock).toHaveBeenCalledWith(
      expect.anything(), // sb
      CHANNEL_ID,
      ORG_ID,
      'blog',
    );
  });

  it('NEVER exposes credentials_encrypted in the response', async () => {
    seedOrgLookup();
    seedChannelOwnership(true);
    // Resolver returns a target that somehow has credentials_encrypted — must be stripped.
    const targetWithSecret = {
      ...SAMPLE_TARGET,
      credentials_encrypted: 'SUPER_SECRET_CIPHERTEXT',
    };
    resolvePublishTargetsMock.mockResolvedValueOnce([targetWithSecret]);

    const res = await app.inject({
      method: 'GET',
      url: `/channels/${CHANNEL_ID}/publish-targets?medium=blog`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const rawText = res.body;
    const body = res.json();

    // Must not appear anywhere in the raw response body
    expect(rawText).not.toContain('credentials_encrypted');
    expect(rawText).not.toContain('SUPER_SECRET_CIPHERTEXT');
    // Must not appear in any item object
    body.data.items.forEach((item: Record<string, unknown>) => {
      expect(item).not.toHaveProperty('credentials_encrypted');
    });
  });

  it('returns 401 without the internal API key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/channels/${CHANNEL_ID}/publish-targets`,
      headers: { 'x-user-id': 'user-1' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('returns 404 when caller does not own the channel', async () => {
    seedOrgLookup();
    seedChannelOwnership(false);

    const res = await app.inject({
      method: 'GET',
      url: `/channels/${CHANNEL_ID}/publish-targets?medium=blog`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('CHANNEL_NOT_FOUND');
  });

  it('returns 400 when ?medium value is not a valid medium', async () => {
    seedOrgLookup();
    seedChannelOwnership(true);

    const res = await app.inject({
      method: 'GET',
      url: `/channels/${CHANNEL_ID}/publish-targets?medium=tiktok`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns empty items array when no targets exist for the channel', async () => {
    seedOrgLookup();
    seedChannelOwnership(true);
    resolvePublishTargetsMock.mockResolvedValueOnce([]);

    const res = await app.inject({
      method: 'GET',
      url: `/channels/${CHANNEL_ID}/publish-targets?medium=video`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.error).toBeNull();
    expect(body.data.items).toEqual([]);
  });

  it('returns all active targets via DB when no ?medium param given', async () => {
    seedOrgLookup();
    seedChannelOwnership(true);
    // No medium → DB query path; listResult is the awaited chain result.
    listResult = { data: [SAMPLE_ROW], error: null };

    const res = await app.inject({
      method: 'GET',
      url: `/channels/${CHANNEL_ID}/publish-targets`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.error).toBeNull();
    expect(body.data.items).toHaveLength(1);
    // Should be mapped to camelCase
    expect(body.data.items[0].id).toBe('pt-1');
    expect(body.data.items[0].displayName).toBe('My Blog');
    // Resolver must NOT have been called (DB path taken instead)
    expect(resolvePublishTargetsMock).not.toHaveBeenCalled();
  });
});
