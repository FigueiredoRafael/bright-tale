/**
 * turnstile-verify.ts — Cloudflare Turnstile server-side verification.
 *
 * Call this from any Server Action that needs bot protection. Pass the
 * token returned by the client widget. Returns a boolean + reason for
 * debug logging; never exposes reason to the client.
 *
 * Policy: in dev (`NODE_ENV !== 'production'`) and when the secret is not
 * configured, verify is a no-op that always returns success. This lets
 * the dev flow continue without the widget. In production the secret
 * MUST be set or all logins fail closed.
 */

const ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export interface TurnstileResult {
  ok: boolean
  reason?: string
  /** Cloudflare returns error codes for telemetry. Log them, never echo. */
  cfErrors?: string[]
}

export async function verifyTurnstile(
  token: string | undefined,
  remoteIp?: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  const isProd = process.env.NODE_ENV === 'production'

  // Dev convenience: widget not wired yet → let traffic through.
  if (!secret) {
    return isProd
      ? { ok: false, reason: 'no-secret-in-prod' }
      : { ok: true, reason: 'no-secret-dev-passthrough' }
  }
  if (!token) return { ok: false, reason: 'no-token' }

  const body = new URLSearchParams({ secret, response: token })
  if (remoteIp) body.set('remoteip', remoteIp)

  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  if (!resp.ok) {
    return { ok: false, reason: `verify-http-${resp.status}` }
  }
  const data = (await resp.json()) as { success: boolean; 'error-codes'?: string[] }
  if (data.success) return { ok: true }
  return {
    ok: false,
    reason: 'cf-rejected',
    cfErrors: data['error-codes'] ?? [],
  }
}
