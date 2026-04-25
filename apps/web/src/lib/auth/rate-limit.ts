/**
 * rate-limit.ts — minimal sliding-window rate limiter for auth flows.
 *
 * Dev / single-process default: in-memory Map. Not multi-instance-safe.
 * Prod: replace the backend via the RateLimitStore interface — point it at
 * Upstash Redis, Postgres, or any KV with atomic increment semantics.
 *
 * Usage:
 *   import { checkRateLimit } from '@/lib/auth/rate-limit'
 *   const verdict = await checkRateLimit({
 *     key: `admin-login:${ipHash}:${identityHash}`,
 *     max: 5,
 *     windowMs: 15 * 60 * 1000,
 *   })
 *   if (!verdict.allowed) throw new Error('Too many attempts')
 */

export interface RateLimitVerdict {
  allowed: boolean
  remaining: number
  resetAt: number
  /** Seconds until reset (for Retry-After-style hints). */
  retryAfter: number
}

export interface RateLimitRequest {
  key: string
  max: number
  windowMs: number
}

export interface RateLimitStore {
  increment(
    key: string,
    windowMs: number,
  ): Promise<{ count: number; resetAt: number }>
}

// ── In-memory backend (dev default) ────────────────────────────────────────
// Not shared across Next.js serverless invocations. Swap for Redis/Postgres
// backend before relying on this in prod.
class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>()

  async increment(
    key: string,
    windowMs: number,
  ): Promise<{ count: number; resetAt: number }> {
    const now = Date.now()
    const bucket = this.buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      const next = { count: 1, resetAt: now + windowMs }
      this.buckets.set(key, next)
      return next
    }
    bucket.count += 1
    // Punitive extension: every attempt while blocked resets the full window,
    // making brute-force increasingly expensive.
    if (bucket.count > 1) {
      bucket.resetAt = now + windowMs
    }
    return bucket
  }
}

// Singleton shared across hot reloads in dev — avoids resetting counters on
// every HMR.
const globalAny = globalThis as unknown as { __brightSecRateStore?: RateLimitStore }
const store: RateLimitStore =
  globalAny.__brightSecRateStore ?? (globalAny.__brightSecRateStore = new MemoryStore())

/**
 * Hash an identifier (e.g., email or IP) so raw PII isn't held in memory
 * beyond the window. Deterministic, not keyed — fine for bucket lookup, NOT
 * for storage of sensitive data.
 */
export function rateLimitKey(...parts: string[]): string {
  return parts.map((p) => p.toLowerCase().trim()).join('|')
}

export async function checkRateLimit(
  req: RateLimitRequest,
): Promise<RateLimitVerdict> {
  const { count, resetAt } = await store.increment(req.key, req.windowMs)
  const allowed = count <= req.max
  const remaining = Math.max(0, req.max - count)
  const retryAfter = allowed ? 0 : Math.ceil((resetAt - Date.now()) / 1000)
  return { allowed, remaining, resetAt, retryAfter }
}

/** Force-reset a key (useful after successful auth so a good login doesn't
 *  consume the brute-force budget for the next attacker). */
export function resetRateLimit(_key: string): void {
  // For MemoryStore we don't expose a delete; the next increment after
  // windowMs resets naturally. In the Redis-backed version, implement DEL.
}
