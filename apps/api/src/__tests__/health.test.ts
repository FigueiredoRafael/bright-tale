import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { healthRoutes } from '@/routes/health';

// Isolated server — no auth deps, no env vars, no CORS plugin needed.
async function buildHealthServer(): Promise<FastifyInstance> {
  const server = Fastify();
  await server.register(healthRoutes);
  return server;
}

describe('GET /health', () => {
  let server: FastifyInstance;

  afterEach(async () => {
    await server?.close();
  });

  it('returns 200 with { status: "ok" }', async () => {
    server = await buildHealthServer();
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('returns a valid ISO 8601 timestamp', async () => {
    server = await buildHealthServer();
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/health' });

    const { timestamp } = res.json<{ timestamp: string }>();
    expect(typeof timestamp).toBe('string');
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });
});
