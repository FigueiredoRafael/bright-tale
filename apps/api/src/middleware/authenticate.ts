import { FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'node:crypto';

function getValidKeys(): string[] {
  const keys: string[] = [];
  const primary = process.env.INTERNAL_API_KEY;
  if (primary) keys.push(primary);
  const previous = process.env.INTERNAL_API_KEY_PREVIOUS;
  if (previous) keys.push(previous);
  return keys;
}

/** Constant-time string compare. Returns false if lengths differ (no side channel on length
 *  beyond that, which is acceptable for fixed-length secrets). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function keyMatches(key: string, validKeys: string[]): boolean {
  if (validKeys.length === 0) return false;
  let matched = false;
  // Check every valid key regardless of early match so total time is constant
  // with respect to how many valid keys there are (tiny leak, but closes the
  // most obvious timing channel).
  for (const valid of validKeys) {
    if (safeEqual(key, valid)) matched = true;
  }
  return matched;
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const key = request.headers['x-internal-key'];
  const validKeys = getValidKeys();

  if (!key || typeof key !== 'string' || !keyMatches(key, validKeys)) {
    return reply.status(401).send({
      data: null,
      error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
    });
  }

  const userId = request.headers['x-user-id'];
  request.userId = typeof userId === 'string' ? userId : undefined;
}

/**
 * Stricter variant — requires BOTH a valid INTERNAL_API_KEY AND a user session
 * (x-user-id header, only injected by apps/app proxy when a Supabase session is
 * present). Use on any route that serves user-scoped or business-sensitive
 * data (agent prompts, credentials, provider configs, user PII, etc.).
 *
 * Do NOT use on routes that must remain reachable pre-login (auth/*, webhooks/*,
 * health checks).
 */
export async function authenticateWithUser(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  if (reply.sent) return; // 401 already sent by authenticate
  if (!request.userId) {
    return reply.status(401).send({
      data: null,
      error: { message: 'Unauthorized', code: 'UNAUTHORIZED_NO_SESSION' },
    });
  }
}
