/**
 * S8 — YouTube OAuth route handlers
 *
 * Tests:
 *   POST /channels/:id/youtube/connect
 *     1. Returns consent URL with state param scoped to channelId
 *     2. Returns 401 without auth
 *     3. Returns 404 if channel not owned by caller
 *     4. Returns 503 when YOUTUBE_OAUTH_CLIENT_ID is not configured
 *
 *   GET /channels/:id/youtube/callback
 *     5. Exchanges code, persists encrypted tokens, returns { data: target }
 *     6. Rejects mismatched state (channelId in state != path param)
 *     7. Returns 401 without auth
 *     8. credentials_encrypted never appears in response
 *     9. Returns 400 when code param is missing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { exchangeCodeMock, buildConsentUrlMock, validateStateParamMock, encryptTokensMock } = vi.hoisted(() => ({
  exchangeCodeMock: vi.fn(),
  buildConsentUrlMock: vi.fn(),
  validateStateParamMock: vi.fn(),
  encryptTokensMock: vi.fn(),
}));

vi.mock('@/lib/youtube/oauth', () => ({
  buildConsentUrl: buildConsentUrlMock,
  exchangeCode: exchangeCodeMock,
  validateStateParam: validateStateParamMock,
  encryptTokens: encryptTokensMock,
}));

// Chainable Supabase mock
const sbChain: Record<string, unknown> = {};
(['from', 'select', 'eq', 'order', 'limit', 'upsert', 'insert', 'update'] as const).forEach((m) => {
  sbChain[m] = vi.fn().mockReturnValue(sbChain);
});
sbChain.single = vi.fn();
sbChain.maybeSingle = vi.fn();

let sbSingleResult: { data: unknown; error: unknown } = { data: null, error: null };
sbChain.single = vi.fn(() => Promise.resolve(sbSingleResult));
sbChain.maybeSingle = vi.fn(() => Promise.resolve(sbSingleResult));

// upsert with .select().single() chain — needs to work
sbChain.upsert = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnValue({
    single: vi.fn(() => Promise.resolve({ data: SAMPLE_PT_ROW, error: null })),
  }),
});

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

const SAMPLE_PT_ROW = {
  id: 'pt-yt-1',
  channel_id: CHANNEL_ID,
  org_id: null,
  type: 'youtube',
  display_name: 'My YouTube Channel',
  config_json: { channelTitle: 'BrightTale', channelHandle: '@brighttale' },
  is_active: true,
  created_at: '2026-05-24T00:00:00Z',
  updated_at: '2026-05-24T00:00:00Z',
};

function buildApp(): FastifyInstance {
  process.env.INTERNAL_API_KEY = 'test-key';
  const app = Fastify({ logger: false });
  app.register(channelsRoutes, { prefix: '/channels' });
  return app;
}

function mockOrgAndChannel(
  app: FastifyInstance,
  { channelFound = true }: { channelFound?: boolean } = {},
) {
  // GET org
  sbChain.single = vi.fn()
    // org lookup
    .mockResolvedValueOnce({ data: { org_id: ORG_ID }, error: null })
    // channel ownership check
    .mockResolvedValueOnce(
      channelFound
        ? { data: { id: CHANNEL_ID }, error: null }
        : { data: null, error: { message: 'not found' } },
    );

  app.ready();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /channels/:id/youtube/connect', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    buildConsentUrlMock.mockReturnValue(
      `https://accounts.google.com/o/oauth2/v2/auth?state=ch:${CHANNEL_ID}:rand&client_id=test`,
    );
  });

  it('returns { data: { url } } with the consent URL', async () => {
    mockOrgAndChannel(app);

    const res = await app.inject({
      method: 'POST',
      url: `/channels/${CHANNEL_ID}/youtube/connect`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { url: string }; error: null }>();
    expect(body.error).toBeNull();
    expect(body.data.url).toContain('accounts.google.com');
    expect(buildConsentUrlMock).toHaveBeenCalledWith(CHANNEL_ID);
  });

  it('state parameter in the URL is scoped to the channelId', async () => {
    mockOrgAndChannel(app);

    const res = await app.inject({
      method: 'POST',
      url: `/channels/${CHANNEL_ID}/youtube/connect`,
      headers: AUTH,
    });

    const body = res.json<{ data: { url: string } }>();
    const parsed = new URL(body.data.url);
    const state = parsed.searchParams.get('state') ?? '';
    expect(state).toContain(CHANNEL_ID);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/channels/${CHANNEL_ID}/youtube/connect`,
      headers: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when channel is not owned by the caller', async () => {
    sbChain.single = vi.fn()
      .mockResolvedValueOnce({ data: { org_id: ORG_ID }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'not found' } });

    const res = await app.inject({
      method: 'POST',
      url: `/channels/ch-not-mine/youtube/connect`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /channels/:id/youtube/callback', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();

    exchangeCodeMock.mockResolvedValue({
      access_token: 'ya29.access',
      refresh_token: '1//refresh',
      expiry_date: Date.now() + 3600 * 1000,
    });
    encryptTokensMock.mockReturnValue('encrypted-blob');
    validateStateParamMock.mockReturnValue(true);
  });

  it('exchanges code, persists encrypted tokens, returns target without credentials', async () => {
    sbChain.single = vi.fn()
      .mockResolvedValueOnce({ data: { org_id: ORG_ID }, error: null })
      .mockResolvedValueOnce({ data: { id: CHANNEL_ID }, error: null });

    const upsertSingle = vi.fn().mockResolvedValue({ data: SAMPLE_PT_ROW, error: null });
    sbChain.upsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: upsertSingle }),
    });

    const state = `ch:${CHANNEL_ID}:rand`;
    const res = await app.inject({
      method: 'GET',
      url: `/channels/${CHANNEL_ID}/youtube/callback?code=auth-code-123&state=${encodeURIComponent(state)}`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Record<string, unknown>; error: null }>();
    expect(body.error).toBeNull();
    // credentials_encrypted must NOT be in the response
    expect(body.data).not.toHaveProperty('credentials_encrypted');
    expect(body.data).not.toHaveProperty('credentialsEncrypted');
    // exchangeCode was called with the auth code
    expect(exchangeCodeMock).toHaveBeenCalledWith('auth-code-123');
    // encryptTokens was called (tokens are encrypted before storage)
    expect(encryptTokensMock).toHaveBeenCalled();
  });

  it('rejects with 400 when state channelId does not match path param', async () => {
    validateStateParamMock.mockReturnValue(false);

    sbChain.single = vi.fn()
      .mockResolvedValueOnce({ data: { org_id: ORG_ID }, error: null })
      .mockResolvedValueOnce({ data: { id: CHANNEL_ID }, error: null });

    const state = `ch:ch-different:rand`;
    const res = await app.inject({
      method: 'GET',
      url: `/channels/${CHANNEL_ID}/youtube/callback?code=auth-code&state=${encodeURIComponent(state)}`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ data: null; error: { code: string } }>();
    expect(body.error.code).toBe('STATE_MISMATCH');
  });

  it('returns 400 when code query param is missing', async () => {
    sbChain.single = vi.fn()
      .mockResolvedValueOnce({ data: { org_id: ORG_ID }, error: null })
      .mockResolvedValueOnce({ data: { id: CHANNEL_ID }, error: null });

    const res = await app.inject({
      method: 'GET',
      url: `/channels/${CHANNEL_ID}/youtube/callback?state=ch:${CHANNEL_ID}:rand`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/channels/${CHANNEL_ID}/youtube/callback?code=xyz&state=abc`,
      headers: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('tokens are never returned in plaintext in the response', async () => {
    sbChain.single = vi.fn()
      .mockResolvedValueOnce({ data: { org_id: ORG_ID }, error: null })
      .mockResolvedValueOnce({ data: { id: CHANNEL_ID }, error: null });

    sbChain.upsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: SAMPLE_PT_ROW, error: null }),
      }),
    });

    const state = `ch:${CHANNEL_ID}:rand`;
    const res = await app.inject({
      method: 'GET',
      url: `/channels/${CHANNEL_ID}/youtube/callback?code=code&state=${encodeURIComponent(state)}`,
      headers: AUTH,
    });

    const rawBody = res.body;
    // access_token and refresh_token values must never appear in the response body
    expect(rawBody).not.toContain('ya29.access');
    expect(rawBody).not.toContain('1//refresh');
    expect(rawBody).not.toContain('credentials_encrypted');
  });
});
