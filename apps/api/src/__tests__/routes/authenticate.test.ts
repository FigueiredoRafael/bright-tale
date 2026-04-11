import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate';

vi.stubEnv('INTERNAL_API_KEY', 'test-key');

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify({ logger: false });
  app.get('/test', { preHandler: [authenticate] }, async (request, reply) => {
    return reply.send({ userId: request.userId });
  });
  await app.ready();
});

describe('authenticate middleware', () => {
  it('returns 401 when X-Internal-Key is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      data: null,
      error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
    });
  });

  it('returns 401 when X-Internal-Key is wrong', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-internal-key': 'wrong-key' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('passes through with correct key and no user id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-internal-key': 'test-key' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: undefined });
  });

  it('extracts X-User-Id when present', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-internal-key': 'test-key', 'x-user-id': 'user-123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'user-123' });
  });

  it('ignores non-string X-User-Id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-internal-key': 'test-key' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBeUndefined();
  });
});
