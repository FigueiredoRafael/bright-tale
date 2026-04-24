/**
 * bypass-sign.ts — client-side signer for the BrightSec test-traffic
 * bypass. Mirrors the verifier in apps/web/src/lib/auth/bypass-verify.ts.
 *
 * Usage (from a probe):
 *   import { buildBypassHeader } from '../lib/bypass-sign'
 *   const header = buildBypassHeader(url.pathname)
 *   if (header) probe({ url, headers: { 'X-BrightSec-Auth': header }, ... })
 *
 * When BRIGHTSEC_BYPASS_HMAC_KEY is not set in the probe's env, this
 * returns null and the probe just doesn't send the header — the target's
 * defenses apply normally. That's the right behavior for (a) dev where
 * the key hasn't been set, and (b) staging / prod where bypass is hard-
 * disabled on the server anyway.
 */

import { createHmac, randomBytes } from 'node:crypto'

const HEADER_NAME = 'X-BrightSec-Auth'

export function buildBypassHeader(path: string): { name: string; value: string } | null {
  const rawKey = process.env.BRIGHTSEC_BYPASS_HMAC_KEY
  if (!rawKey || !/^[0-9a-fA-F]{64,}$/.test(rawKey)) return null
  const key = Buffer.from(rawKey, 'hex')
  const ts = Math.floor(Date.now() / 1000).toString()
  const nonce = randomBytes(16).toString('hex')
  const hmac = createHmac('sha256', key).update(`${ts}.${nonce}.${path}`).digest('hex')
  return { name: HEADER_NAME, value: `${ts}.${nonce}.${hmac}` }
}

/** Convenience — returns headers object ready to spread into fetch/probe. */
export function bypassHeaders(path: string): Record<string, string> {
  const h = buildBypassHeader(path)
  return h ? { [h.name]: h.value } : {}
}
