import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

/**
 * Self-contained Fastify instance mirroring the /ref scope registration in
 * apps/api/src/index.ts. We don't boot the full server — just the piece under
 * test. This makes the test fast (no Supabase, no real config).
 */
async function buildTestServer(): Promise<FastifyInstance> {
  const server = Fastify({ trustProxy: true });
  await server.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 30,
      timeWindow: '1 minute',
      cache: 10_000,
      keyGenerator: (req) => req.ip,
      continueExceeding: false,
      errorResponseBuilder: (_req, ctx) => ({
        statusCode: 429,
        data: null,
        error: {
          code: 'RATE_LIMITED',
          message: `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)}s.`,
        },
      }),
    });
    scope.get('/:code', async (_req, reply) => {
      reply.code(302).header('location', 'https://brighttale.io/signup').send();
    });
  }, { prefix: '/ref' });

  // Sibling scope without rate-limit — to verify scope isolation
  server.register(async (scope) => {
    scope.get('/me', async () => ({ data: { ok: true }, error: null }));
  }, { prefix: '/affiliate' });

  await server.ready();
  return server;
}

describe('/ref rate-limit', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('first 30 requests from the same IP pass', async () => {
    for (let i = 0; i < 30; i++) {
      const res = await server.inject({ url: '/ref/ABC', remoteAddress: '1.1.1.1' });
      expect(res.statusCode).toBe(302);
    }
  });

  it('31st request from same IP returns 429 with envelope', async () => {
    const res = await server.inject({ url: '/ref/ABC', remoteAddress: '1.1.1.1' });
    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({
      data: null,
      error: { code: 'RATE_LIMITED' },
    });
    expect(body.error.message).toMatch(/Too many requests/);
  });

  it('response includes x-ratelimit-* headers', async () => {
    const res = await server.inject({ url: '/ref/ABC', remoteAddress: '2.2.2.2' });
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('different IP gets fresh allowance (keyGenerator isolates)', async () => {
    const res = await server.inject({ url: '/ref/ABC', remoteAddress: '9.9.9.9' });
    expect(res.statusCode).toBe(302);
  });

  it('trustProxy: X-Forwarded-For header drives keying', async () => {
    // Reset by using a fresh XFF that hasn't been limited
    for (let i = 0; i < 30; i++) {
      const res = await server.inject({
        url: '/ref/ABC',
        remoteAddress: '127.0.0.1',
        headers: { 'x-forwarded-for': '5.5.5.5' },
      });
      expect(res.statusCode).toBe(302);
    }
    const blocked = await server.inject({
      url: '/ref/ABC',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '5.5.5.5' },
    });
    expect(blocked.statusCode).toBe(429);

    // A different X-Forwarded-For from the same socket still has allowance
    const other = await server.inject({
      url: '/ref/ABC',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '6.6.6.6' },
    });
    expect(other.statusCode).toBe(302);
  });

  it('scope isolation: /affiliate/me unaffected by /ref limit exhaustion', async () => {
    // IP 1.1.1.1 is already blocked on /ref from the first test
    const res = await server.inject({ url: '/affiliate/me', remoteAddress: '1.1.1.1' });
    expect(res.statusCode).toBe(200);
  });
});
