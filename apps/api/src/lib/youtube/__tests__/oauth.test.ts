/**
 * Unit tests for YouTube OAuth helper (issue #217).
 *
 * Category A/B — no real network calls; Google token exchange is mocked.
 *
 * Behaviors tested:
 * 1. buildAuthUrl returns a Google OAuth URL with correct scopes and HMAC-signed state
 * 2. verifyState accepts a valid state and returns channel id
 * 3. verifyState rejects a tampered state
 * 4. exchangeCode encrypts tokens before persisting; plain text never returned
 * 5. refreshTokens updates credentials_encrypted in-place; returns new access token
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAuthUrl,
  verifyState,
  makeState,
  exchangeCode,
  refreshTokens,
  type GoogleTokens,
} from '../oauth.js';
import { decrypt } from '../../crypto.js';

// ─── Environment setup ────────────────────────────────────────────────────────

process.env.ENCRYPTION_SECRET = 'a'.repeat(64);
process.env.YOUTUBE_OAUTH_CLIENT_ID = 'test-client-id';
process.env.YOUTUBE_OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.YOUTUBE_OAUTH_REDIRECT_URI = 'https://api.example.com/api/channels/CHANNEL_ID/youtube/callback';
process.env.INTERNAL_API_KEY = 'test-internal-api-key-of-adequate-length-for-hmac';

// ─── Mock Google token exchange ───────────────────────────────────────────────

const mockExchangeTokens = vi.fn<() => Promise<GoogleTokens>>();
const mockRefreshAccessToken = vi.fn<() => Promise<{ access_token: string; expiry_date: number }>>();

vi.mock('../oauth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../oauth.js')>();
  return {
    ...actual,
    // Expose fetch hook points so tests can inject different responses
  };
});

// We will use a separate approach: mock fetch at the module level
const mockFetch = vi.fn();

// ─── Helper ───────────────────────────────────────────────────────────────────

const CHANNEL_ID = 'chan-uuid-1234';

// ─── Test suites ─────────────────────────────────────────────────────────────

describe('buildAuthUrl', () => {
  it('returns a URL on accounts.google.com with youtube scopes', () => {
    const url = buildAuthUrl(CHANNEL_ID);
    expect(url).toContain('accounts.google.com');
    expect(url).toContain('youtube.upload');
    expect(url).toContain('youtube.readonly');
  });

  it('includes a state parameter', () => {
    const url = buildAuthUrl(CHANNEL_ID);
    const parsed = new URL(url);
    const state = parsed.searchParams.get('state');
    expect(state).toBeTruthy();
    expect(typeof state).toBe('string');
  });

  it('includes the correct redirect_uri', () => {
    const url = buildAuthUrl(CHANNEL_ID);
    const parsed = new URL(url);
    const redirectUri = parsed.searchParams.get('redirect_uri');
    // Redirect URI should reference the channel id
    expect(redirectUri).toContain(CHANNEL_ID);
  });
});

describe('makeState / verifyState', () => {
  it('verifyState returns channelId for a freshly-made state', () => {
    const state = makeState(CHANNEL_ID);
    const result = verifyState(state, CHANNEL_ID);
    expect(result).toBe(true);
  });

  it('verifyState returns false for a tampered state', () => {
    const state = makeState(CHANNEL_ID);
    // Flip a character in the HMAC portion
    const tampered = state.slice(0, -1) + (state.endsWith('a') ? 'b' : 'a');
    const result = verifyState(tampered, CHANNEL_ID);
    expect(result).toBe(false);
  });

  it('verifyState returns false for a state with a different channelId', () => {
    const state = makeState('other-channel');
    const result = verifyState(state, CHANNEL_ID);
    expect(result).toBe(false);
  });

  it('verifyState returns false for an empty state', () => {
    expect(verifyState('', CHANNEL_ID)).toBe(false);
  });

  it('state contains channelId embedded so callback can extract it', () => {
    const state = makeState(CHANNEL_ID);
    // State should start with channelId so the callback can extract it
    // without a DB roundtrip
    expect(state.startsWith(CHANNEL_ID + '.')).toBe(true);
  });
});

describe('exchangeCode (token encryption)', () => {
  it('returns encrypted credentials — access_token never appears in plain response', async () => {
    // Mock the Google OAuth token endpoint
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'plain-access-token',
        refresh_token: 'plain-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/youtube.upload',
      }),
    });

    const result = await exchangeCode('auth-code-123', CHANNEL_ID, 'target-row-id');

    // The returned credentials should be encrypted (base64 blob, not plaintext)
    expect(result.credentialsEncrypted).toBeTruthy();
    expect(result.credentialsEncrypted).not.toContain('plain-access-token');
    expect(result.credentialsEncrypted).not.toContain('plain-refresh-token');
  });

  it('encrypted blob decrypts back to tokens with correct AAD', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'decryptable-access',
        refresh_token: 'decryptable-refresh',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/youtube.upload',
      }),
    });

    const TARGET_ID = 'pt-uuid-9999';
    const result = await exchangeCode('code-456', CHANNEL_ID, TARGET_ID);

    // Decrypt with the correct AAD
    const aad = `publish_targets:credentials_encrypted:${TARGET_ID}:`;
    const plain = decrypt(result.credentialsEncrypted, { aad });
    const parsed = JSON.parse(plain) as Record<string, unknown>;

    expect(parsed.access_token).toBe('decryptable-access');
    expect(parsed.refresh_token).toBe('decryptable-refresh');
  });

  it('throws if Google returns a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant', error_description: 'Code was already redeemed.' }),
    });

    await expect(exchangeCode('bad-code', CHANNEL_ID, 'pt-id')).rejects.toThrow();
  });
});

describe('refreshTokens', () => {
  it('calls Google refresh endpoint and returns new encrypted credentials', async () => {
    process.env.ENCRYPTION_SECRET = 'a'.repeat(64);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'refreshed-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    });

    // Build encrypted credentials with a refresh_token
    const { encrypt } = await import('../../crypto.js');
    const TARGET_ID = 'pt-refresh-test';
    const aad = `publish_targets:credentials_encrypted:${TARGET_ID}:`;
    const originalCreds = encrypt(
      JSON.stringify({ access_token: 'old-access', refresh_token: 'my-refresh-token' }),
      { aad },
    );

    const result = await refreshTokens(originalCreds, TARGET_ID);

    // New credentials should be encrypted
    expect(result.credentialsEncrypted).toBeTruthy();
    expect(result.credentialsEncrypted).not.toContain('refreshed-access-token');

    // Decrypt and verify new access token is stored
    const plain = decrypt(result.credentialsEncrypted, { aad });
    const parsed = JSON.parse(plain) as Record<string, unknown>;
    expect(parsed.access_token).toBe('refreshed-access-token');
    // refresh_token should be carried forward
    expect(parsed.refresh_token).toBe('my-refresh-token');
  });
});
