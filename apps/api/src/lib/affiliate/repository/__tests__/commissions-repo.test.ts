import { describe, it, expect, vi } from 'vitest'
import { createCommissionsRepo } from '../commissions-repo'

describe('commissions-repo', () => {
  it('listPendingCommissions filters by affiliate_id + status=pending', async () => {
    const eq2 = vi.fn().mockResolvedValue({ data: [], error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const sb = { from: vi.fn(() => ({ select: () => ({ eq: eq1 }) })) } as any
    await createCommissionsRepo(sb).listPendingCommissions('aff-1')
    expect(eq1).toHaveBeenCalledWith('affiliate_id', 'aff-1')
    expect(eq2).toHaveBeenCalledWith('status', 'pending')
  })

  it('incrementConversions passes both args to RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await createCommissionsRepo({ rpc } as any).incrementConversions('aff-1', 1500)
    expect(rpc).toHaveBeenCalledWith('increment_affiliate_conversions', { aff_id: 'aff-1', earnings_brl: 1500 })
  })
})
