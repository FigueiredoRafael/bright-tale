import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/lib/admin-check', () => ({
  isAdminUser: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';
import { proxyToApi } from '@/app/api/zadmin/affiliate/_shared/proxy';

function makeReq(body?: unknown): NextRequest {
  return new NextRequest('http://localhost:3002/api/zadmin/affiliate/abc/approve', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('proxyToApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_URL = 'http://api.test';
    process.env.INTERNAL_API_KEY = 'secret';
  });

  it('happy path: forwards body + secret + user id, returns apps/api status+body', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    } as never);
    vi.mocked(isAdminUser).mockResolvedValue(true);
    const upstream = { data: { ok: true }, error: null };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(upstream), { status: 200 }),
    );

    const res = await proxyToApi(makeReq({ tier: 'nano' }), '/admin/affiliate/abc/approve', 'POST');

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload).toEqual(upstream);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://api.test/admin/affiliate/abc/approve',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Internal-Key': 'secret',
          'x-user-id': 'u1',
          'Content-Type': 'application/json',
        }),
      }),
    );
    fetchSpy.mockRestore();
  });

  it('401 when no session', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as never);
    const res = await proxyToApi(makeReq({}), '/admin/affiliate/abc/approve', 'POST');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('403 when non-admin', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    } as never);
    vi.mocked(isAdminUser).mockResolvedValue(false);
    const res = await proxyToApi(makeReq({}), '/admin/affiliate/abc/approve', 'POST');
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
