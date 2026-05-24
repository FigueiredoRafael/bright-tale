/**
 * Unit tests for YouTube OAuth API routes (issue #217).
 *
 * Category A/B — no real DB, no real network. All Supabase calls and
 * Google fetch calls are mocked.
 *
 * Behaviors:
 * 1. POST /api/channels/:id/youtube/connect returns { data: { url }, error: null }
 *    with a Google OAuth URL containing youtube scopes and a state param.
 * 2. GET /api/channels/:id/youtube/callback with valid state+code
 *    → exchanges code, encrypts tokens, upserts publish_targets, returns { data: { success: true } }.
 * 3. Callback with mismatched state → 400 with typed error code INVALID_STATE.
 * 4. Callback with missing code → 400 VALIDATION_ERROR.
 * 5. Callback persists encrypted (not plaintext) tokens in the DB upsert call.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { youtubeOauthRoutes } from '../youtube-oauth.js';

// ── Env setup ─────────────────────────────────────────────────────────────────

process.env.ENCRYPTION_SECRET = 'a'.repeat(64);
process.env.YOUTUBE_OAUTH_CLIENT_ID = 'client-id-test';
process.env.YOUTUBE_OAUTH_CLIENT_SECRET = 'client-secret-test';
process.env.YOUTUBE_OAUTH_REDIRECT_URI = 'https://api.example.com/api/channels/CHANNEL_ID/youtube/callback';
process.env.INTERNAL_API_KEY = 'test-internal-api-key-of-adequate-length-for-hmac';

// ── Auth mock — bypass INTERNAL_API_KEY check in tests ───────────────────────

vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: async (req: { userId?: string }) => { req.userId = 'user-test-uuid'; },
  authenticateWithUser: async (req: { userId?: string }) => { req.userId = 'user-test-uuid'; },
}));

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockSelect = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
});
const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockFrom = vi.fn().mockReturnValue({
  select: mockSelect,
  upsert: mockUpsert,
  update: mockUpdate,
  insert: mockInsert,
});

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));

// ── Google fetch mock ─────────────────────────────────────────────────────────

const MOCK_TOKENS = {
  access_token: 'google-access-token',
  refresh_token: 'google-refresh-token',
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'https://www.googleapis.com/auth/youtube.upload',
};

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => MOCK_TOKENS,
});

// ── Test helpers ──────────────────────────────────────────────────────────────

const CHANNEL_ID = 'chan-test-uuid';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(youtubeOauthRoutes, { prefix: `/:channelId/youtube` });
  await app.ready();
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. POST /connect → returns consent URL with correct scopes + state
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /:channelId/youtube/connect', () => {
  it('returns a Google consent URL with youtube scopes', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/${CHANNEL_ID}/youtube/connect`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { url: string }; error: null };
    expect(body.error).toBeNull();
    expect(body.data.url).toContain('accounts.google.com');
    expect(body.data.url).toContain('youtube.upload');
    expect(body.data.url).toContain('youtube.readonly');
    expect(body.data.url).toContain('state=');
  });

  it('includes the channel-scoped redirect_uri in the consent URL', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/${CHANNEL_ID}/youtube/connect`,
    });

    const { data } = res.json() as { data: { url: string } };
    const parsed = new URL(data.url);
    const redirectUri = parsed.searchParams.get('redirect_uri') ?? '';
    expect(redirectUri).toContain(CHANNEL_ID);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /callback with valid state + code → upserts and returns success
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /:channelId/youtube/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset Google fetch mock
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_TOKENS,
    });
    // Reset supabase mocks
    mockUpsert.mockResolvedValue({ error: null });
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });
    mockInsert.mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({
      select: mockSelect,
      upsert: mockUpsert,
      update: mockUpdate,
      insert: mockInsert,
    });
  });

  it('returns success when state and code are valid', async () => {
    // Build a valid state using the makeState function
    const { makeState } = await import('../../lib/youtube/oauth.js');
    const validState = makeState(CHANNEL_ID);

    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: `/${CHANNEL_ID}/youtube/callback?code=auth-code-ok&state=${encodeURIComponent(validState)}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { success: boolean }; error: null };
    expect(body.error).toBeNull();
    expect(body.data.success).toBe(true);
  });

  it('calls DB upsert with encrypted credentials (not plaintext tokens)', async () => {
    const { makeState } = await import('../../lib/youtube/oauth.js');
    const validState = makeState(CHANNEL_ID);

    // Track upsert/insert calls
    const insertedRows: unknown[] = [];
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
      insert: vi.fn().mockImplementation((row: unknown) => {
        insertedRows.push(row);
        return Promise.resolve({ error: null });
      }),
      upsert: vi.fn().mockImplementation((row: unknown) => {
        insertedRows.push(row);
        return Promise.resolve({ error: null });
      }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }));

    const app = await buildApp();

    await app.inject({
      method: 'GET',
      url: `/${CHANNEL_ID}/youtube/callback?code=code-abc&state=${encodeURIComponent(validState)}`,
    });

    // At least one upsert/insert should have happened
    expect(insertedRows.length).toBeGreaterThan(0);

    // credentials_encrypted must not contain plaintext tokens
    const row = insertedRows[0] as Record<string, unknown>;
    const creds = row.credentials_encrypted as string;
    expect(creds).not.toContain('google-access-token');
    expect(creds).not.toContain('google-refresh-token');
    // Should be a base64-encoded blob
    expect(typeof creds).toBe('string');
    expect(creds.length).toBeGreaterThan(20);
  });

  it('returns 400 INVALID_STATE when state is tampered', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: `/${CHANNEL_ID}/youtube/callback?code=auth-code&state=tampered-state-value`,
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { data: null; error: { code: string; message: string } };
    expect(body.data).toBeNull();
    expect(body.error.code).toBe('INVALID_STATE');
  });

  it('returns 400 VALIDATION_ERROR when code is missing', async () => {
    const { makeState } = await import('../../lib/youtube/oauth.js');
    const validState = makeState(CHANNEL_ID);

    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: `/${CHANNEL_ID}/youtube/callback?state=${encodeURIComponent(validState)}`,
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { data: null; error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
