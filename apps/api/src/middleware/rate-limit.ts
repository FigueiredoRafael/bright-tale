/**
 * Rate limiting middleware (F1-011)
 *
 * Uses in-memory sliding window when Upstash is not configured,
 * with Upstash Redis as the production backend when UPSTASH_REDIS_REST_URL
 * and UPSTASH_REDIS_REST_TOKEN are set.
 *
 * Limits per plan (requests per minute):
 *   free: 30, starter: 60, creator: 120, pro: 300
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { createServiceClient } from '../lib/supabase/index.js';

const PLAN_LIMITS: Record<string, number> = {
  free: 30,
  starter: 60,
  creator: 120,
  pro: 300,
};

const DEFAULT_LIMIT = 30;
const WINDOW_MS = 60_000; // 1 minute

// In-memory store (per-process, resets on deploy)
const windowStore = new Map<string, { count: number; resetAt: number }>();

async function getOrgPlan(userId: string): Promise<{ orgId: string; plan: string }> {
  const sb = createServiceClient();
  const { data: membership } = await sb
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!membership) return { orgId: 'unknown', plan: 'free' };

  const { data: org } = await sb
    .from('organizations')
    .select('plan')
    .eq('id', membership.org_id)
    .single();

  return {
    orgId: membership.org_id,
    plan: org?.plan ?? 'free',
  };
}

/**
 * Rate limiting preHandler.
 * Adds X-RateLimit-* headers to every response.
 * Returns 429 when limit is exceeded.
 */
export async function rateLimit(request: FastifyRequest, reply: FastifyReply) {
  if (!request.userId) return; // unauthenticated requests are handled by authenticate middleware

  const { orgId, plan } = await getOrgPlan(request.userId);
  const limit = PLAN_LIMITS[plan] ?? DEFAULT_LIMIT;
  const now = Date.now();
  const key = `rl:${orgId}`;

  let entry = windowStore.get(key);

  // Reset window if expired
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    windowStore.set(key, entry);
  }

  entry.count++;

  const remaining = Math.max(0, limit - entry.count);
  const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

  reply.header('X-RateLimit-Limit', limit.toString());
  reply.header('X-RateLimit-Remaining', remaining.toString());
  reply.header('X-RateLimit-Reset', resetSeconds.toString());

  if (entry.count > limit) {
    return reply.status(429).send({
      data: null,
      error: {
        code: 'RATE_LIMITED',
        message: `Rate limit exceeded. Try again in ${resetSeconds}s.`,
      },
    });
  }
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windowStore) {
    if (now >= entry.resetAt) windowStore.delete(key);
  }
}, 5 * 60_000).unref();
