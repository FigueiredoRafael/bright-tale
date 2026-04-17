import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('NEXT_PUBLIC_ADMIN_SLUG', 'admin');

import {
  approve, pause, proposeChange, cancelProposal, renewContract,
} from '@/app/zadmin/(protected)/affiliates/actions/affiliates';

describe('affiliate actions', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true }, error: null }), { status: 200 }),
    );
  });

  it('approve → POST /api/admin/affiliate/:id/approve with body', async () => {
    await approve('aff-1', { tier: 'nano', commissionRate: 0.15 } as never);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/admin/affiliate/aff-1/approve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ tier: 'nano', commissionRate: 0.15 }),
      }),
    );
  });

  it('pause → POST with no body', async () => {
    await pause('aff-2');
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe('/api/admin/affiliate/aff-2/pause');
    expect((call[1] as RequestInit).body).toBeUndefined();
  });

  it('proposeChange → POST /:id/propose-change', async () => {
    await proposeChange('aff-3', { newTier: 'micro', newRate: 0.2 } as never);
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/admin/affiliate/aff-3/propose-change');
  });

  it('cancelProposal → POST /:id/cancel-proposal', async () => {
    await cancelProposal('aff-4');
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/admin/affiliate/aff-4/cancel-proposal');
  });

  it('renewContract → POST /:id/renew', async () => {
    await renewContract('aff-5');
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/admin/affiliate/aff-5/renew');
  });

  it('throws with parsed envelope on 4xx', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ data: null, error: { code: 'INVALID_STATE', message: 'already paused' } }),
        { status: 409 },
      ),
    );
    await expect(pause('aff-6')).rejects.toThrow(/INVALID_STATE.*already paused/);
  });

  it('encodes id in URL (prevents path traversal)', async () => {
    await approve('a/b', {} as never);
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/admin/affiliate/a%2Fb/approve');
  });
});
