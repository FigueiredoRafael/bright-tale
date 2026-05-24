/**
 * S8 — YouTube OAuth helpers (apps/api/src/lib/youtube/oauth.ts)
 *
 * Category A — pure logic, no network, no DB.
 * Tests: buildConsentUrl, encryptTokens/decryptTokens, exchangeCode (mocked fetch),
 *        state-parameter validation helper.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const TEST_SECRET = 'a'.repeat(64);

describe('YouTube OAuth helpers', () => {
  beforeAll(() => {
    vi.stubEnv('ENCRYPTION_SECRET', TEST_SECRET);
    vi.stubEnv('YOUTUBE_OAUTH_CLIENT_ID', 'test-client-id');
    vi.stubEnv('YOUTUBE_OAUTH_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv('YOUTUBE_OAUTH_REDIRECT_URI', 'https://api.brighttale.io/channels/oauth/youtube/callback');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  // ── buildConsentUrl ─────────────────────────────────────────────────────────

  describe('buildConsentUrl(channelId)', () => {
    it('returns a Google OAuth URL with youtube.upload + youtube.readonly scopes', async () => {
      const { buildConsentUrl } = await import('../oauth.js');
      const channelId = 'ch-abc123';
      const url = buildConsentUrl(channelId);

      expect(url).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);

      const parsed = new URL(url);
      const scope = parsed.searchParams.get('scope') ?? '';
      expect(scope).toContain('youtube.upload');
      expect(scope).toContain('youtube.readonly');
    });

    it('embeds channel-scoped state parameter', async () => {
      const { buildConsentUrl } = await import('../oauth.js');
      const channelId = 'ch-xyz789';
      const url = buildConsentUrl(channelId);

      const parsed = new URL(url);
      const state = parsed.searchParams.get('state') ?? '';
      // state must encode the channelId so callback can verify ownership
      expect(state).toContain(channelId);
    });

    it('uses YOUTUBE_OAUTH_REDIRECT_URI env var in redirect_uri', async () => {
      const { buildConsentUrl } = await import('../oauth.js');
      const url = buildConsentUrl('ch-1');

      const parsed = new URL(url);
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'https://api.brighttale.io/channels/oauth/youtube/callback',
      );
    });

    it('requests offline access and consent prompt (for refresh token)', async () => {
      const { buildConsentUrl } = await import('../oauth.js');
      const url = buildConsentUrl('ch-1');

      const parsed = new URL(url);
      expect(parsed.searchParams.get('access_type')).toBe('offline');
      expect(parsed.searchParams.get('prompt')).toBe('consent');
    });

    it('throws when YOUTUBE_OAUTH_CLIENT_ID is missing', async () => {
      vi.stubEnv('YOUTUBE_OAUTH_CLIENT_ID', '');
      vi.resetModules();
      const { buildConsentUrl } = await import('../oauth.js');
      expect(() => buildConsentUrl('ch-1')).toThrow(/YOUTUBE_OAUTH_CLIENT_ID/);
      vi.stubEnv('YOUTUBE_OAUTH_CLIENT_ID', 'test-client-id');
    });
  });

  // ── encryptTokens / decryptTokens ───────────────────────────────────────────

  describe('encryptTokens / decryptTokens round-trip', () => {
    it('encrypts and decrypts token payload correctly', async () => {
      vi.resetModules();
      vi.stubEnv('ENCRYPTION_SECRET', TEST_SECRET);
      const { encryptTokens, decryptTokens } = await import('../oauth.js');

      const tokens = {
        access_token: 'ya29.access-token',
        refresh_token: '1//refresh-token',
        expiry_date: 1700000000000,
      };
      const targetId = 'pt-abc123';

      const encrypted = encryptTokens(tokens, targetId);
      expect(encrypted).not.toContain('ya29.access-token');
      expect(encrypted).not.toContain('1//refresh-token');

      const decrypted = decryptTokens(encrypted, targetId);
      expect(decrypted.refresh_token).toBe('1//refresh-token');
      expect(decrypted.access_token).toBe('ya29.access-token');
    });

    it('decryptTokens fails when targetId is wrong (AAD mismatch)', async () => {
      vi.resetModules();
      vi.stubEnv('ENCRYPTION_SECRET', TEST_SECRET);
      const { encryptTokens, decryptTokens } = await import('../oauth.js');

      const tokens = { access_token: 'tok', refresh_token: 'ref', expiry_date: 0 };
      const encrypted = encryptTokens(tokens, 'pt-real');
      expect(() => decryptTokens(encrypted, 'pt-different')).toThrow();
    });

    it('encrypted output is different every call (random IV)', async () => {
      vi.resetModules();
      vi.stubEnv('ENCRYPTION_SECRET', TEST_SECRET);
      const { encryptTokens } = await import('../oauth.js');

      const tokens = { access_token: 'tok', refresh_token: 'ref', expiry_date: 0 };
      const e1 = encryptTokens(tokens, 'pt-1');
      const e2 = encryptTokens(tokens, 'pt-1');
      expect(e1).not.toBe(e2);
    });
  });

  // ── validateStateParam ──────────────────────────────────────────────────────

  describe('validateStateParam(state, channelId)', () => {
    it('returns true when state contains the expected channelId', async () => {
      vi.resetModules();
      const { buildConsentUrl, validateStateParam } = await import('../oauth.js');
      const channelId = 'ch-match';
      const url = buildConsentUrl(channelId);
      const state = new URL(url).searchParams.get('state') ?? '';

      expect(validateStateParam(state, channelId)).toBe(true);
    });

    it('returns false when state does not match channelId', async () => {
      vi.resetModules();
      const { buildConsentUrl, validateStateParam } = await import('../oauth.js');
      const url = buildConsentUrl('ch-real');
      const state = new URL(url).searchParams.get('state') ?? '';

      expect(validateStateParam(state, 'ch-different')).toBe(false);
    });

    it('returns false for empty state', async () => {
      vi.resetModules();
      const { validateStateParam } = await import('../oauth.js');
      expect(validateStateParam('', 'ch-1')).toBe(false);
    });
  });

  // ── exchangeCode ────────────────────────────────────────────────────────────

  describe('exchangeCode(code)', () => {
    it('POSTs to Google token endpoint and returns parsed tokens', async () => {
      vi.resetModules();
      vi.stubEnv('YOUTUBE_OAUTH_CLIENT_ID', 'test-client-id');
      vi.stubEnv('YOUTUBE_OAUTH_CLIENT_SECRET', 'test-client-secret');
      vi.stubEnv('YOUTUBE_OAUTH_REDIRECT_URI', 'https://api.brighttale.io/channels/oauth/youtube/callback');

      const mockTokenResponse = {
        access_token: 'ya29.new-access',
        refresh_token: '1//new-refresh',
        expires_in: 3599,
        token_type: 'Bearer',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse),
      } as Response);

      const { exchangeCode } = await import('../oauth.js');
      const tokens = await exchangeCode('auth-code-123');

      expect(tokens.refresh_token).toBe('1//new-refresh');
      expect(tokens.access_token).toBe('ya29.new-access');

      // Should have called Google's token endpoint
      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws when Google returns an error', async () => {
      vi.resetModules();
      vi.stubEnv('YOUTUBE_OAUTH_CLIENT_ID', 'test-client-id');
      vi.stubEnv('YOUTUBE_OAUTH_CLIENT_SECRET', 'test-client-secret');
      vi.stubEnv('YOUTUBE_OAUTH_REDIRECT_URI', 'https://api.brighttale.io/channels/oauth/youtube/callback');

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'invalid_grant', error_description: 'Code expired' }),
      } as Response);

      const { exchangeCode } = await import('../oauth.js');
      await expect(exchangeCode('bad-code')).rejects.toThrow(/invalid_grant|Code expired/);
    });
  });
});
