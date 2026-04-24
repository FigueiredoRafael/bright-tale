/**
 * admin-login-gate.ts — rate-limit + constant-time-ish hardening on top
 * of the admin login Server Action.
 *
 * Wraps `signInWithPassword` so every call:
 *   1. Rate-limits per identity (email hash) AND per source IP.
 *   2. Runs a deterministic minimum-delay floor (~400ms + jitter) so
 *      enumeration via timing is hobbled.
 *   3. Returns a uniform `{ ok:false, code }` shape on every failure axis.
 *
 * The underlying Supabase call behavior is unchanged on success.
 *
 * Note: this module runs in a Server Action context. `request.ip` is only
 * reliably set on Vercel / behind a correctly-configured proxy. In dev
 * we fall back to a fixed bucket so the limiter still works.
 */

'use server'

import { headers } from 'next/headers'
import { createHash } from 'node:crypto'
import { checkRateLimit, rateLimitKey } from './rate-limit'

const WINDOW_MS = 15 * 60 * 1000 // 15 min
const MAX_PER_IDENTITY = 5 // per-identity fails before lock
const MAX_PER_IP = 30 // per-IP fails (covers password spray across many identities)
const TIMING_FLOOR_MS = 400
const TIMING_JITTER_MS = 100

// Forgot-password has a separate, tighter budget so an attacker can't
// weaponize the endpoint as an email-flood against a victim.
const FORGOT_MAX_PER_IDENTITY = 3 // max 3 reset emails per email / 15 min
const FORGOT_MAX_PER_IP = 10 // max 10 requests per IP / 15 min

function ipHash(ip: string | undefined): string {
  return createHash('sha256')
    .update((ip ?? 'unknown').toLowerCase())
    .digest('hex')
    .slice(0, 16)
}

function identityHash(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 16)
}

async function sourceIp(): Promise<string | undefined> {
  try {
    const h = await headers()
    return (
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      h.get('x-real-ip') ??
      undefined
    )
  } catch {
    return undefined
  }
}

async function uniformDelay(startedAt: number): Promise<void> {
  const elapsed = Date.now() - startedAt
  const jitter = Math.floor(Math.random() * TIMING_JITTER_MS)
  const wait = Math.max(0, TIMING_FLOOR_MS - elapsed) + jitter
  await new Promise((r) => setTimeout(r, wait))
}

export interface AdminLoginGateResult {
  allowed: boolean
  /** On failure, one of: 'RATE_LIMITED_IDENTITY' | 'RATE_LIMITED_IP'. */
  code?: 'RATE_LIMITED_IDENTITY' | 'RATE_LIMITED_IP'
  /** Seconds until the limit resets. Present when allowed === false. */
  retryAfter?: number
}

/**
 * Gate function — call BEFORE invoking Supabase signInWithPassword.
 * Returns an allowed/blocked verdict and, on block, the Retry-After hint.
 */
export async function gateAdminLogin(params: {
  email: string
}): Promise<AdminLoginGateResult> {
  const ip = await sourceIp()
  const iHash = ipHash(ip)
  const idHash = identityHash(params.email)

  // Identity-scoped (one email getting brute-forced across many IPs).
  const id = await checkRateLimit({
    key: rateLimitKey('admin-login', 'identity', idHash),
    max: MAX_PER_IDENTITY,
    windowMs: WINDOW_MS,
  })
  if (!id.allowed) {
    return { allowed: false, code: 'RATE_LIMITED_IDENTITY', retryAfter: id.retryAfter }
  }

  // IP-scoped (one IP spraying many identities).
  const ipVerdict = await checkRateLimit({
    key: rateLimitKey('admin-login', 'ip', iHash),
    max: MAX_PER_IP,
    windowMs: WINDOW_MS,
  })
  if (!ipVerdict.allowed) {
    return { allowed: false, code: 'RATE_LIMITED_IP', retryAfter: ipVerdict.retryAfter }
  }

  return { allowed: true }
}

/**
 * After-action uniform delay: wait until the total action time reaches
 * TIMING_FLOOR_MS + jitter, regardless of whether the underlying call was
 * fast (no-user) or slow (password check). Call with the time the caller
 * captured just before invoking the Supabase method.
 */
export async function finishWithUniformDelay(startedAt: number): Promise<void> {
  await uniformDelay(startedAt)
}

/**
 * Gate function for forgot-password. Tighter identity budget (3 vs 5) to
 * prevent abuse as an email-flood weapon. IP budget also tighter.
 */
export async function gateForgotPassword(params: {
  email: string
}): Promise<AdminLoginGateResult> {
  const ip = await sourceIp()
  const iHash = ipHash(ip)
  const idHash = identityHash(params.email)

  const id = await checkRateLimit({
    key: rateLimitKey('admin-forgot', 'identity', idHash),
    max: FORGOT_MAX_PER_IDENTITY,
    windowMs: WINDOW_MS,
  })
  if (!id.allowed) {
    return { allowed: false, code: 'RATE_LIMITED_IDENTITY', retryAfter: id.retryAfter }
  }

  const ipVerdict = await checkRateLimit({
    key: rateLimitKey('admin-forgot', 'ip', iHash),
    max: FORGOT_MAX_PER_IP,
    windowMs: WINDOW_MS,
  })
  if (!ipVerdict.allowed) {
    return { allowed: false, code: 'RATE_LIMITED_IP', retryAfter: ipVerdict.retryAfter }
  }

  return { allowed: true }
}
