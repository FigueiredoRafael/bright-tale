/**
 * YouTube OAuth 2.0 helper (issue #217).
 *
 * Handles the three OAuth steps:
 *   1. buildAuthUrl  — generate the Google consent URL with correct scopes + HMAC-signed state
 *   2. makeState / verifyState — sign and verify state params (closes CSRF)
 *   3. exchangeCode  — exchange auth code → tokens, encrypt, return blob
 *   4. refreshTokens — use refresh_token to get a new access_token, encrypt, return blob
 *
 * Token storage uses the same AES-256-GCM envelope as WordPress credentials
 * (apps/api/src/lib/crypto.ts). Credentials are NEVER returned in plaintext.
 *
 * Required env vars:
 *   YOUTUBE_OAUTH_CLIENT_ID
 *   YOUTUBE_OAUTH_CLIENT_SECRET
 *   YOUTUBE_OAUTH_REDIRECT_URI   — should contain CHANNEL_ID as a path segment
 *   INTERNAL_API_KEY             — used to HMAC-sign state parameters
 *   ENCRYPTION_SECRET            — AES-256-GCM key (64 hex chars)
 */

import { createHmac } from 'crypto';
import { encrypt, decrypt, aadFor } from '../crypto.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface EncryptedCredentials {
  credentialsEncrypted: string;
}

// ── Scopes ────────────────────────────────────────────────────────────────────

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

// ── Config helpers ────────────────────────────────────────────────────────────

function getClientId(): string {
  const id = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  if (!id) throw new Error('YOUTUBE_OAUTH_CLIENT_ID is not set');
  return id;
}

function getClientSecret(): string {
  const s = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  if (!s) throw new Error('YOUTUBE_OAUTH_CLIENT_SECRET is not set');
  return s;
}

/**
 * Build the redirect URI for a specific channel. The YOUTUBE_OAUTH_REDIRECT_URI
 * env var must contain `CHANNEL_ID` as a literal placeholder which is replaced
 * at runtime. This lets the callback route be scoped to the channel.
 */
function getRedirectUri(channelId: string): string {
  const template = process.env.YOUTUBE_OAUTH_REDIRECT_URI;
  if (!template) throw new Error('YOUTUBE_OAUTH_REDIRECT_URI is not set');
  return template.replace('CHANNEL_ID', channelId);
}

function getHmacSecret(): string {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) throw new Error('INTERNAL_API_KEY is not set');
  return key;
}

// ── State helpers ─────────────────────────────────────────────────────────────

/**
 * Build an HMAC-signed state string scoped to the channel.
 *
 * Format: `{channelId}.{hmac}`
 *
 * The channelId prefix lets the callback extract the channel without a DB
 * roundtrip. The HMAC prevents CSRF / state-swapping attacks.
 */
export function makeState(channelId: string): string {
  const secret = getHmacSecret();
  const hmac = createHmac('sha256', secret).update(channelId).digest('hex');
  return `${channelId}.${hmac}`;
}

/**
 * Verify an OAuth state parameter.
 * Returns true iff the state was created by makeState for this channelId.
 */
export function verifyState(state: string, channelId: string): boolean {
  if (!state) return false;
  const dotIdx = state.indexOf('.');
  if (dotIdx === -1) return false;
  const embeddedChannelId = state.slice(0, dotIdx);
  if (embeddedChannelId !== channelId) return false;
  const expected = makeState(channelId);
  // Constant-time comparison
  if (expected.length !== state.length) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(state);
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// ── Auth URL builder ──────────────────────────────────────────────────────────

/**
 * Build the Google OAuth consent URL for a channel.
 * The state is HMAC-signed with INTERNAL_API_KEY and includes the channelId.
 */
export function buildAuthUrl(channelId: string): string {
  const clientId = getClientId();
  const redirectUri = getRedirectUri(channelId);
  const state = makeState(channelId);

  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', YOUTUBE_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);

  return url.toString();
}

// ── Token exchange ────────────────────────────────────────────────────────────

/**
 * Exchange an authorization code for tokens.
 *
 * Calls Google's token endpoint, encrypts the token blob with the
 * publish_targets row's AAD, and returns the encrypted string.
 *
 * @param code        - The authorization code from the callback query string.
 * @param channelId   - The channel that initiated the OAuth flow.
 * @param targetRowId - The publish_targets.id to bind the AAD to.
 */
export async function exchangeCode(
  code: string,
  channelId: string,
  targetRowId: string,
): Promise<EncryptedCredentials> {
  const body = new URLSearchParams({
    code,
    client_id: getClientId(),
    client_secret: getClientSecret(),
    redirect_uri: getRedirectUri(channelId),
    grant_type: 'authorization_code',
  });

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `YouTube token exchange failed: ${res.status} — ${JSON.stringify(err)}`,
    );
  }

  const tokens = (await res.json()) as GoogleTokens;
  const credentialsPlain = JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_in: tokens.expires_in,
    token_type: tokens.token_type,
    scope: tokens.scope ?? null,
  });

  const aad = aadFor('publish_targets', 'credentials_encrypted', targetRowId, '');
  const credentialsEncrypted = encrypt(credentialsPlain, { aad });

  return { credentialsEncrypted };
}

// ── Token refresh ─────────────────────────────────────────────────────────────

/**
 * Refresh an access token using the stored refresh_token.
 *
 * Decrypts the existing credentials blob, calls Google's token endpoint with
 * the refresh_token, encrypts the updated blob (preserving the refresh_token),
 * and returns it.
 *
 * @param credentialsEncrypted - The current encrypted credentials blob from publish_targets.
 * @param targetRowId          - The publish_targets.id (used for AAD).
 */
export async function refreshTokens(
  credentialsEncrypted: string,
  targetRowId: string,
): Promise<EncryptedCredentials> {
  const aad = aadFor('publish_targets', 'credentials_encrypted', targetRowId, '');

  // Decrypt existing credentials
  const plain = decrypt(credentialsEncrypted, { aad });
  const existing = JSON.parse(plain) as Record<string, unknown>;

  const refreshToken = existing.refresh_token;
  if (typeof refreshToken !== 'string' || !refreshToken) {
    throw new Error('No refresh_token in stored credentials');
  }

  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `YouTube token refresh failed: ${res.status} — ${JSON.stringify(err)}`,
    );
  }

  const refreshed = (await res.json()) as Partial<GoogleTokens>;

  // Build updated credentials: carry forward refresh_token (Google only sends it once)
  const updated = JSON.stringify({
    ...existing,
    access_token: refreshed.access_token ?? existing.access_token,
    expires_in: refreshed.expires_in ?? existing.expires_in,
    token_type: refreshed.token_type ?? existing.token_type,
    // Preserve refresh_token from original — Google doesn't re-issue it on refresh
    refresh_token: refreshToken,
  });

  const newEncrypted = encrypt(updated, { aad });
  return { credentialsEncrypted: newEncrypted };
}
