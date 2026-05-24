/**
 * YouTube OAuth 2.0 helpers (S8).
 *
 * Pure functions — no DB access, no side effects.
 * Route handlers in apps/api/src/routes/channels.ts use these.
 *
 * Required env vars:
 *   YOUTUBE_OAUTH_CLIENT_ID
 *   YOUTUBE_OAUTH_CLIENT_SECRET
 *   YOUTUBE_OAUTH_REDIRECT_URI   (e.g. https://api.brighttale.io/channels/:id/youtube/callback)
 *   ENCRYPTION_SECRET            (32-byte hex — shared with apps/api/src/lib/crypto.ts)
 */

import { encrypt, decrypt, aadFor } from '../crypto.js';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

export interface YouTubeTokens {
  access_token: string;
  refresh_token: string;
  expiry_date?: number;
  token_type?: string;
}

/**
 * Build a Google consent URL for YouTube OAuth.
 * State parameter encodes the channelId so the callback can verify ownership.
 */
export function buildConsentUrl(channelId: string): string {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error('YOUTUBE_OAUTH_CLIENT_ID is not configured');

  const redirectUri = process.env.YOUTUBE_OAUTH_REDIRECT_URI ?? 'http://localhost:3001/channels/oauth/youtube/callback';
  const state = buildState(channelId);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: YOUTUBE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params}`;
}

/**
 * Build an opaque state string that encodes the channelId.
 * Format: "ch:<channelId>:<random>" — simple and auditable.
 */
function buildState(channelId: string): string {
  const random = Math.random().toString(36).slice(2);
  return `ch:${channelId}:${random}`;
}

/**
 * Validate that the state parameter from the callback belongs to channelId.
 */
export function validateStateParam(state: string, channelId: string): boolean {
  if (!state) return false;
  const parts = state.split(':');
  if (parts.length < 2) return false;
  // Format: "ch:<channelId>:<random>"
  return parts[0] === 'ch' && parts[1] === channelId;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 * Calls Google's token endpoint — mock `fetch` in tests.
 */
export async function exchangeCode(code: string): Promise<YouTubeTokens> {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_OAUTH_REDIRECT_URI ?? 'http://localhost:3001/channels/oauth/youtube/callback';

  const body = new URLSearchParams({
    code,
    client_id: clientId ?? '',
    client_secret: clientSecret ?? '',
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    const errCode = typeof json['error'] === 'string' ? json['error'] : 'token_exchange_failed';
    const errDesc = typeof json['error_description'] === 'string' ? json['error_description'] : 'Token exchange failed';
    throw new Error(`${errCode}: ${errDesc}`);
  }

  if (typeof json['access_token'] !== 'string' || typeof json['refresh_token'] !== 'string') {
    throw new Error('Google token response missing access_token or refresh_token');
  }

  return {
    access_token: json['access_token'],
    refresh_token: json['refresh_token'],
    expiry_date: typeof json['expires_in'] === 'number'
      ? Date.now() + json['expires_in'] * 1000
      : undefined,
    token_type: typeof json['token_type'] === 'string' ? json['token_type'] : undefined,
  };
}

/**
 * Encrypt YouTube tokens for storage in publish_targets.credentials_encrypted.
 * Uses AES-256-GCM with AAD bound to the publish_targets row id.
 */
export function encryptTokens(tokens: YouTubeTokens, publishTargetId: string): string {
  const plaintext = JSON.stringify(tokens);
  const aad = aadFor('publish_targets', 'credentials_encrypted', publishTargetId, '');
  return encrypt(plaintext, { aad });
}

/**
 * Decrypt YouTube tokens from publish_targets.credentials_encrypted.
 */
export function decryptTokens(encrypted: string, publishTargetId: string): YouTubeTokens {
  const aad = aadFor('publish_targets', 'credentials_encrypted', publishTargetId, '');
  const plaintext = decrypt(encrypted, { aad });
  return JSON.parse(plaintext) as YouTubeTokens;
}
