/**
 * bypass-verify.ts — HMAC-signed authorized-test-traffic bypass.
 *
 * Runs in the Next.js Edge Runtime (middleware.ts), so it uses the Web
 * Crypto API (`crypto.subtle`) instead of `node:crypto`. Same primitive,
 * edge-compatible.
 *
 * Industry-standard pattern (AWS SigV4 / Cloudflare Access signed requests):
 *   Client signs a short-lived token over (timestamp|nonce|path), sends as
 *   header `X-BrightSec-Auth`. Middleware verifies the HMAC with the shared
 *   key, rejects anything older than 60 s (replay window), caches the nonce
 *   briefly to prevent within-window replay, and only then allows the
 *   traffic to skip rate limits / future Turnstile.
 *
 * Security properties:
 *   • Leaked header from a single request cannot be replayed after 60 s.
 *   • Key lives server-side only. Client never sees it.
 *   • Wrong HMAC ≠ 429 with partial info — we simply treat the request as
 *     unauthenticated and apply all defenses normally.
 *   • HARD DISABLED in production: even a valid HMAC is ignored when
 *     NODE_ENV === 'production'.
 */

const REPLAY_WINDOW_SEC = 60
const HEADER_NAME = 'x-brightsec-auth'

const recentNonces = new Map<string, number>()

function hexToBytes(hex: string): Uint8Array {
  const n = hex.length / 2
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function bytesToHex(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0')
  return s
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function computeHmac(
  key: Uint8Array,
  timestamp: string,
  nonce: string,
  path: string,
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const data = new TextEncoder().encode(`${timestamp}.${nonce}.${path}`)
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, data)
  return bytesToHex(sig)
}

export interface BypassResult {
  honored: boolean
  reason?: string
}

/**
 * Verify the bypass header. Returns { honored: true } only when:
 *   1. NODE_ENV !== 'production'
 *   2. `BRIGHTSEC_BYPASS_HMAC_KEY` env var is set and valid hex
 *   3. Header `X-BrightSec-Auth` is present, well-formed
 *   4. Timestamp is within ±REPLAY_WINDOW_SEC
 *   5. Nonce has not been seen recently
 *   6. HMAC matches the computed signature
 *
 * On any failure, returns honored=false. Callers MUST treat a non-honored
 * result as "apply every defense normally".
 */
export async function verifyBypass(request: {
  headers: { get(name: string): string | null }
  nextUrl?: { pathname: string }
  url?: string
}): Promise<BypassResult> {
  if (process.env.NODE_ENV === 'production') {
    return { honored: false, reason: 'prod-hard-disable' }
  }

  const raw = process.env.BRIGHTSEC_BYPASS_HMAC_KEY
  if (!raw || !/^[0-9a-fA-F]{64,}$/.test(raw)) {
    return { honored: false, reason: 'no-key-configured' }
  }
  const key = hexToBytes(raw)

  const header =
    request.headers.get(HEADER_NAME) ?? request.headers.get(HEADER_NAME.toUpperCase())
  if (!header) return { honored: false, reason: 'no-header' }

  const parts = header.split('.')
  if (parts.length !== 3) return { honored: false, reason: 'malformed' }
  const [tsStr, nonce, hmacHex] = parts
  const ts = Number(tsStr)
  if (!Number.isFinite(ts)) return { honored: false, reason: 'bad-timestamp' }
  if (!/^[0-9a-f]{16,}$/.test(nonce)) return { honored: false, reason: 'bad-nonce' }
  if (!/^[0-9a-f]{64}$/.test(hmacHex)) return { honored: false, reason: 'bad-hmac' }

  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > REPLAY_WINDOW_SEC) {
    return { honored: false, reason: 'outside-replay-window' }
  }

  const path = request.nextUrl?.pathname ?? (request.url ? new URL(request.url).pathname : '')
  const expected = await computeHmac(key, tsStr, nonce, path)
  if (!constantTimeEqual(expected, hmacHex)) {
    return { honored: false, reason: 'bad-signature' }
  }

  const seenAt = recentNonces.get(nonce)
  if (seenAt && now - seenAt <= REPLAY_WINDOW_SEC) {
    return { honored: false, reason: 'nonce-reused' }
  }
  recentNonces.set(nonce, now)

  if (recentNonces.size > 1024) {
    for (const [n, t] of recentNonces) {
      if (now - t > REPLAY_WINDOW_SEC) recentNonces.delete(n)
    }
  }

  return { honored: true }
}
