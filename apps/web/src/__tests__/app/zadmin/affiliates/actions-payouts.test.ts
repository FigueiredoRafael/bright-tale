import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('NEXT_PUBLIC_ADMIN_SLUG', 'admin');

import {
  approvePayout, rejectPayout, completePayout,
} from '@/app/zadmin/(protected)/affiliates/actions/payouts';

describe('payout actions', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true }, error: null }), { status: 200 }),
    );
  });

  it('approvePayout → POST /:aid/payouts/:pid/approve', async () => {
    await approvePayout('aff-1', 'pay-1');
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/admin/affiliate/aff-1/payouts/pay-1/approve');
  });

  it('rejectPayout → POST with notes body', async () => {
    await rejectPayout('aff-2', 'pay-2', 'bad data');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/admin/affiliate/aff-2/payouts/pay-2/reject');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ notes: 'bad data' });
  });

  it('completePayout → POST /:aid/payouts/:pid/complete', async () => {
    await completePayout('aff-3', 'pay-3');
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/admin/affiliate/aff-3/payouts/pay-3/complete');
  });
});
