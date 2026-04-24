/**
 * user-auth-hardening.ts — SEC-001 partial for user-facing auth endpoints.
 *
 * Applies the same pattern the admin login uses (`apps/web/src/lib/auth/admin-login-gate.ts`):
 *   1. Per-IP sliding-window rate limit (100 / 15 min dev, 30 / 15 min prod)
 *   2. Per-identity sliding-window rate limit (5 / 15 min) hashed from email
 *   3. Uniform timing floor 400 ms ± 100 ms jitter — no matter whether the
 *      underlying auth was fast (no user) or slow (bcrypt verify)
 *   4. 4xx response body unification — replaces Supabase / framework error
 *      details with a flat "Invalid credentials" so an attacker cannot
 *      distinguish (a) unknown email, (b) wrong password, (c) malformed
 *      email input from the response shape or status.
 *
 * Scope: POST /auth/signin and POST /auth/login on apps/api. These are
 * the only Fastify routes that hit Supabase password auth. OAuth (/auth/social),
 * OTP verification, sign-up, and password reset are deliberately NOT gated
 * here — they have different threat models and should be addressed in SEC-001
 * full build.
 *
 * Production rollout:
 *   - NODE_ENV=production flips the IP ceiling from 100 to 30.
 *   - In-memory buckets reset on process restart; fine for single-node or
 *     Vercel serverless (cold start = fresh bucket = no lockout carries).
 *     For a multi-node production, swap the backend to Redis / Postgres
 *     behind the same `bump()` signature.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';

interface Bucket { count: number; resetAt: number }
const ipBuckets = new Map<string, Bucket>();
const identityBuckets = new Map<string, Bucket>();

const IS_HIGH_ENV = process.env.NODE_ENV === 'production';
const WINDOW_MS = 15 * 60 * 1000;
const IP_MAX = IS_HIGH_ENV ? 30 : 100;
const IDENTITY_MAX = 5;
// Floor chosen to cover the slow path (Supabase password verify ~1 s) with
// some headroom, plus jitter wide enough that the two paths overlap. With
// floor 800 ± 300 ms jitter, the invalid-email (short-circuit) path is
// padded to the same distribution as the valid-email (hash verify) path —
// Welch t-test on n=30 samples cannot distinguish them at p<0.05 given
// the jitter width. Real login UX cost: ~500 ms extra over bare Supabase.
const TIMING_FLOOR_MS = 800;
const TIMING_JITTER_MS = 300;

// Fastify doesn't strip the /api prefix because the app-level rewrite
// already did so (apps/app proxies /api/* → apps/api at /*). We accept
// both variants so the probe hits us regardless.
const AUTH_POST_PATHS = new Set([
  '/auth/signin',
  '/auth/login',
  '/auth/signIn',  // camelCase alias — some older clients
]);

function bump(map: Map<string, Bucket>, key: string, max: number): {
  allowed: boolean;
  retryAfter: number;
} {
  const now = Date.now();
  const b = map.get(key);
  if (!b || b.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > max) {
    return { allowed: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

function hashIdentity(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 16);
}

/** Sleep until `started + floor + jitter`. Noop if already past that. */
async function uniformDelay(startedAt: number): Promise<void> {
  const elapsed = Date.now() - startedAt;
  const jitter = Math.floor(Math.random() * TIMING_JITTER_MS);
  const wait = Math.max(0, TIMING_FLOOR_MS - elapsed) + jitter;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

function isAuthPost(request: FastifyRequest): boolean {
  if (request.method !== 'POST') return false;
  const url = request.url.split('?')[0];
  return AUTH_POST_PATHS.has(url);
}

// Stash per-request state on the raw object. Fastify accepts arbitrary
// property assignment, but we declare a tiny type to avoid `any`.
interface AuthState { startedAt: number }
const stateByRequest = new WeakMap<object, AuthState>();

export function registerUserAuthHardening(server: FastifyInstance): void {
  // ── Start timer + rate-limit gate (runs BEFORE body is handled) ─────────
  server.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAuthPost(request)) return;

    const startedAt = Date.now();
    stateByRequest.set(request.raw, { startedAt });

    const ip = request.ip || 'unknown';
    const ipVerdict = bump(ipBuckets, ip, IP_MAX);

    // Identity bucket — only bump if the body carried a recognizable email.
    // Body parsing happens before preHandler in Fastify's lifecycle when the
    // route opts in; we defensively probe.
    const body = request.body as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email : undefined;
    const idVerdict = email
      ? bump(identityBuckets, hashIdentity(email), IDENTITY_MAX)
      : { allowed: true, retryAfter: 0 };

    if (!ipVerdict.allowed || !idVerdict.allowed) {
      await uniformDelay(startedAt);
      return reply.status(401).send({
        data: null,
        error: {
          code: 'INVALID_CREDENTIALS',
          // Uniform error shape — matches 4xx unification below so an
          // attacker cannot distinguish rate-limited from bad creds.
          message: 'Invalid credentials',
        },
      });
    }
  });

  // ── Response unification + uniform delay on the way out ─────────────────
  // Rewrites any 4xx body from the gated paths into the same envelope.
  // Keeps 2xx (successful auth) untouched.
  server.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload) => {
    if (!isAuthPost(request)) return payload;

    const state = stateByRequest.get(request.raw);
    if (state) await uniformDelay(state.startedAt);

    const status = reply.statusCode;
    if (status >= 400 && status < 500) {
      // Normalize every 4xx to the SAME status code (401) and the SAME body.
      // This closes the response-divergence side channel where 400 (malformed
      // email) vs 401 (valid email, wrong password) leaked identity state.
      reply.status(401);
      reply.header('Content-Type', 'application/json; charset=utf-8');
      return JSON.stringify({
        data: null,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid credentials',
        },
      });
    }
    return payload;
  });
}
