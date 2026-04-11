import { describe, it, expect, afterEach } from 'vitest';
import { buildProxyHeaders, middleware } from '@/middleware';

describe('buildProxyHeaders', () => {
  it('injects x-internal-key', () => {
    const headers = buildProxyHeaders(new Headers(), 'secret-key');
    expect(headers.get('x-internal-key')).toBe('secret-key');
  });

  it('overwrites any client-supplied x-internal-key', () => {
    const input = new Headers({ 'x-internal-key': 'forged-key' });
    const headers = buildProxyHeaders(input, 'real-key');
    expect(headers.get('x-internal-key')).toBe('real-key');
  });

  it('strips client-supplied x-user-id to prevent impersonation', () => {
    const input = new Headers({ 'x-user-id': 'attacker-uuid' });
    const headers = buildProxyHeaders(input, 'real-key');
    expect(headers.has('x-user-id')).toBe(false);
  });

  it('generates x-request-id when absent', () => {
    const headers = buildProxyHeaders(new Headers(), 'key');
    expect(headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('preserves caller-supplied x-request-id for trace continuity', () => {
    const input = new Headers({ 'x-request-id': 'trace-abc-123' });
    const headers = buildProxyHeaders(input, 'key');
    expect(headers.get('x-request-id')).toBe('trace-abc-123');
  });

  it('preserves unrelated headers', () => {
    const input = new Headers({ 'content-type': 'application/json', 'accept': 'application/json' });
    const headers = buildProxyHeaders(input, 'key');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('accept')).toBe('application/json');
  });
});

describe('middleware()', () => {
  const originalKey = process.env.INTERNAL_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = originalKey;
  });

  it('returns 500 MIDDLEWARE_MISCONFIGURED when INTERNAL_API_KEY is missing', async () => {
    delete process.env.INTERNAL_API_KEY;
    const request = new Request('http://localhost:3000/api/projects') as unknown as Parameters<typeof middleware>[0];
    const response = middleware(request);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('MIDDLEWARE_MISCONFIGURED');
    expect(body.data).toBeNull();
  });

  it('returns NextResponse with injected headers when env is set', () => {
    process.env.INTERNAL_API_KEY = 'test-secret';
    const request = new Request('http://localhost:3000/api/projects', {
      headers: { 'x-internal-key': 'forged', 'x-user-id': 'attacker' },
    }) as unknown as Parameters<typeof middleware>[0];
    const response = middleware(request);
    // NextResponse.next({ request: { headers } }) serialises overrides via
    // x-middleware-override-headers + x-middleware-request-<name> headers.
    const overrides = response.headers.get('x-middleware-override-headers') ?? '';
    expect(overrides).toContain('x-internal-key');
    expect(response.headers.get('x-middleware-request-x-internal-key')).toBe('test-secret');
  });
});
