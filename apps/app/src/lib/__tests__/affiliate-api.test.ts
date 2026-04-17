import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AffiliateApiError, affiliateApi } from '../affiliate-api';

describe('affiliate-api envelope adapter', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  it('200 + success:true returns data', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: 'a1' } }), { status: 200 }),
    );
    const me = await affiliateApi.getMe();
    expect(me).toEqual({ id: 'a1' });
  });

  it('404 + success:false on getMe → null', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'not found' }), { status: 404 }),
    );
    const me = await affiliateApi.getMe();
    expect(me).toBeNull();
  });

  it('404 on any other method → throws NOT_FOUND AffiliateApiError', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'gone' }), { status: 404 }),
    );
    await expect(affiliateApi.getStats()).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'gone',
    });
  });

  it('403 → FORBIDDEN', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'no' }), { status: 403 }),
    );
    await expect(affiliateApi.getStats()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('409 → CONFLICT', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'dup' }), { status: 409 }),
    );
    await expect(affiliateApi.getStats()).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('422 → VALIDATION', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'bad' }), { status: 422 }),
    );
    await expect(affiliateApi.getStats()).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('non-JSON body → UNKNOWN with HTTP N message', async () => {
    fetchSpy.mockResolvedValue(new Response('<html>500</html>', { status: 500 }));
    await expect(affiliateApi.getStats()).rejects.toMatchObject({
      code: 'UNKNOWN',
      message: 'HTTP 500',
    });
  });

  it('204 No Content → undefined', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await affiliateApi.setDefaultPixKey('k1');
    expect(res).toBeUndefined();
  });

  it('success:true with no data body → undefined', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    const res = await affiliateApi.rejectProposal();
    expect(res).toBeUndefined();
  });

  it('AffiliateApiError instance branding', () => {
    const e = new AffiliateApiError(404, 'NOT_FOUND', 'x');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('AffiliateApiError');
    expect(e.status).toBe(404);
  });
});
