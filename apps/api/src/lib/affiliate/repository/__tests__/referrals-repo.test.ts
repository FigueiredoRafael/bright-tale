import { describe, it, expect, vi } from 'vitest'
import { createReferralsRepo } from '../referrals-repo'

describe('referrals-repo', () => {
  it('expirePendingReferrals filters by attribution_status + window_end, returns count', async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: 'r1' }, { id: 'r2' }], error: null })
    const lt = vi.fn().mockReturnValue({ select })
    const eq = vi.fn().mockReturnValue({ lt })
    const update = vi.fn().mockReturnValue({ eq })
    const sb = { from: vi.fn(() => ({ update })) } as any
    const n = await createReferralsRepo(sb).expirePendingReferrals('2026-04-17T00:00:00Z')
    expect(eq).toHaveBeenCalledWith('attribution_status', 'pending_contract')
    expect(lt).toHaveBeenCalledWith('window_end', '2026-04-17T00:00:00Z')
    expect(n).toBe(2)
  })

  it('incrementReferrals calls RPC with correct args', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await createReferralsRepo({ rpc } as any).incrementReferrals('aff-1')
    expect(rpc).toHaveBeenCalledWith('increment_affiliate_referrals', { aff_id: 'aff-1' })
  })
})
