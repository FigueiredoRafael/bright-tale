import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { buildProxyHeaders, proxy as middleware } from '@/proxy';

// Mock the Supabase middleware client so tests don't require real Supabase
vi.mock('@/lib/supabase/middleware', () => ({
  createMiddlewareClient: vi.fn().mockReturnValue({
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    },
    response: vi.fn().mockReturnValue({
      headers: new Headers(),
    }),
  }),
}));

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

  it('injects x-user-id when userId is provided', () => {
    const headers = buildProxyHeaders(new Headers(), 'key', 'user-123');
    expect(headers.get('x-user-id')).toBe('user-123');
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
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    // Disable Supabase auth checks in API proxy tests
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = originalKey;
    if (originalSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    if (originalSupabaseKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseKey;
  });

  it('returns 500 PROXY_MISCONFIGURED when INTERNAL_API_KEY is missing for /api routes', async () => {
    delete process.env.INTERNAL_API_KEY;
    const request = new Request('http://localhost:3000/api/projects') as unknown as Parameters<typeof middleware>[0];
    (request as unknown as { nextUrl: URL }).nextUrl = new URL('http://localhost:3000/api/projects');
    const response = await middleware(request);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('PROXY_MISCONFIGURED');
    expect(body.data).toBeNull();
  });

  it('returns NextResponse with injected headers when env is set for /api routes', async () => {
    process.env.INTERNAL_API_KEY = 'test-secret';
    const request = new Request('http://localhost:3000/api/projects', {
      headers: { 'x-internal-key': 'forged', 'x-user-id': 'attacker' },
    }) as unknown as Parameters<typeof middleware>[0];
    (request as unknown as { nextUrl: URL }).nextUrl = new URL('http://localhost:3000/api/projects');
    const response = await middleware(request);
    // NextResponse.next({ request: { headers } }) serialises overrides via
    // x-middleware-override-headers + x-middleware-request-<name> headers.
    const overrides = response.headers.get('x-middleware-override-headers') ?? '';
    expect(overrides).toContain('x-internal-key');
    expect(response.headers.get('x-middleware-request-x-internal-key')).toBe('test-secret');
  });
});
