import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authenticate } from '../authenticate.js';

function mockRequest(headers: Record<string, string>) {
  return { headers } as unknown as Parameters<typeof authenticate>[0];
}

function mockReply() {
  const reply = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    send(body: unknown) {
      reply.body = body;
      return reply;
    },
  };
  return reply as unknown as Parameters<typeof authenticate>[1];
}

describe('authenticate middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects request with no key', async () => {
    process.env.INTERNAL_API_KEY = 'key-current';
    const req = mockRequest({});
    const reply = mockReply();
    await authenticate(req, reply);
    expect((reply as unknown as { statusCode: number }).statusCode).toBe(401);
  });

  it('accepts primary key', async () => {
    process.env.INTERNAL_API_KEY = 'key-current';
    const req = mockRequest({ 'x-internal-key': 'key-current', 'x-user-id': 'user-1' });
    const reply = mockReply();
    const result = await authenticate(req, reply);
    expect(result).toBeUndefined();
    expect(req.userId).toBe('user-1');
  });

  it('rejects invalid key', async () => {
    process.env.INTERNAL_API_KEY = 'key-current';
    const req = mockRequest({ 'x-internal-key': 'wrong-key' });
    const reply = mockReply();
    await authenticate(req, reply);
    expect((reply as unknown as { statusCode: number }).statusCode).toBe(401);
  });

  it('accepts previous key during rotation', async () => {
    process.env.INTERNAL_API_KEY = 'key-new';
    process.env.INTERNAL_API_KEY_PREVIOUS = 'key-old';
    const req = mockRequest({ 'x-internal-key': 'key-old', 'x-user-id': 'user-2' });
    const reply = mockReply();
    const result = await authenticate(req, reply);
    expect(result).toBeUndefined();
    expect(req.userId).toBe('user-2');
  });

  it('accepts new key during rotation', async () => {
    process.env.INTERNAL_API_KEY = 'key-new';
    process.env.INTERNAL_API_KEY_PREVIOUS = 'key-old';
    const req = mockRequest({ 'x-internal-key': 'key-new' });
    const reply = mockReply();
    const result = await authenticate(req, reply);
    expect(result).toBeUndefined();
  });

  it('rejects unknown key during rotation', async () => {
    process.env.INTERNAL_API_KEY = 'key-new';
    process.env.INTERNAL_API_KEY_PREVIOUS = 'key-old';
    const req = mockRequest({ 'x-internal-key': 'key-unknown' });
    const reply = mockReply();
    await authenticate(req, reply);
    expect((reply as unknown as { statusCode: number }).statusCode).toBe(401);
  });

  it('works without previous key set', async () => {
    process.env.INTERNAL_API_KEY = 'key-only';
    delete process.env.INTERNAL_API_KEY_PREVIOUS;
    const req = mockRequest({ 'x-internal-key': 'key-only' });
    const reply = mockReply();
    const result = await authenticate(req, reply);
    expect(result).toBeUndefined();
  });

  it('rejects when no env keys configured', async () => {
    delete process.env.INTERNAL_API_KEY;
    delete process.env.INTERNAL_API_KEY_PREVIOUS;
    const req = mockRequest({ 'x-internal-key': 'anything' });
    const reply = mockReply();
    await authenticate(req, reply);
    expect((reply as unknown as { statusCode: number }).statusCode).toBe(401);
  });
});
