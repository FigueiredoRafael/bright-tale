import { describe, it, expect, vi } from 'vitest'
import { createHistoryRepo } from '../affiliate-history-repo'

describe('affiliate-history-repo', () => {
  it('addContractHistory maps all camelCase fields to snake_case on insert', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const sb = { from: vi.fn(() => ({ insert })) } as any
    await createHistoryRepo(sb).addContractHistory({
      affiliateId: 'a1',
      action: 'proposal_accepted',
      oldTier: 'nano',
      newTier: 'micro',
      oldCommissionRate: 0.15,
      newCommissionRate: 0.2,
      performedBy: 'admin-1',
      notes: 'promoted',
    })
    expect(sb.from).toHaveBeenCalledWith('affiliate_contract_history')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      affiliate_id: 'a1',
      action: 'proposal_accepted',
      old_tier: 'nano',
      new_tier: 'micro',
      old_commission_rate: 0.15,
      new_commission_rate: 0.2,
      performed_by: 'admin-1',
      notes: 'promoted',
    }))
  })

  it('addContractHistory with only required fields defaults all optional fields to null', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const sb = { from: vi.fn(() => ({ insert })) } as any
    await createHistoryRepo(sb).addContractHistory({
      affiliateId: 'a1',
      action: 'created',
    } as any)
    expect(insert).toHaveBeenCalledWith({
      affiliate_id: 'a1',
      action: 'created',
      old_tier: null,
      new_tier: null,
      old_commission_rate: null,
      new_commission_rate: null,
      old_fixed_fee_brl: null,
      new_fixed_fee_brl: null,
      old_status: null,
      new_status: null,
      performed_by: null,
      notes: null,
      contract_version: null,
      accepted_ip: null,
      accepted_ua: null,
    })
  })

  it('getContractHistory filters by affiliate_id, orders by created_at DESC, returns mapped entries', async () => {
    const rows = [
      {
        id: 'h2', affiliate_id: 'a1', action: 'tier_change',
        old_tier: 'nano', new_tier: 'micro',
        old_commission_rate: 0.15, new_commission_rate: 0.2,
        old_fixed_fee_brl: null, new_fixed_fee_brl: null,
        old_status: null, new_status: null,
        performed_by: 'admin-1', notes: 'n',
        contract_version: 1, accepted_ip: null, accepted_ua: null,
        created_at: '2026-04-17T00:00:00Z',
      },
      {
        id: 'h1', affiliate_id: 'a1', action: 'created',
        old_tier: null, new_tier: null,
        old_commission_rate: null, new_commission_rate: null,
        old_fixed_fee_brl: null, new_fixed_fee_brl: null,
        old_status: null, new_status: null,
        performed_by: null, notes: null,
        contract_version: null, accepted_ip: null, accepted_ua: null,
        created_at: '2026-04-16T00:00:00Z',
      },
    ]
    const order = vi.fn().mockResolvedValue({ data: rows, error: null })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    const sb = { from: vi.fn(() => ({ select })) } as any

    const result = await createHistoryRepo(sb).getContractHistory('a1')

    expect(sb.from).toHaveBeenCalledWith('affiliate_contract_history')
    expect(eq).toHaveBeenCalledWith('affiliate_id', 'a1')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('h2')
    expect(result[0].affiliateId).toBe('a1')
    expect(result[0].action).toBe('tier_change')
    expect(result[0].oldCommissionRate).toBe(0.15)
    expect(result[0].newCommissionRate).toBe(0.2)
  })

  it('getContractHistory returns [] when supabase data is null', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: null })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    const sb = { from: vi.fn(() => ({ select })) } as any
    const result = await createHistoryRepo(sb).getContractHistory('a1')
    expect(result).toEqual([])
  })
})
