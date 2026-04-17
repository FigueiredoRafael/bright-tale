import { describe, it, expect, vi } from 'vitest'
import { createQueryRepo } from '../affiliate-query-repo'

describe('affiliate-query-repo', () => {
  it('findById returns mapped affiliate when found', async () => {
    const row = {
      id: 'aff-1', user_id: 'u1', code: 'X', name: 'A', email: 'a@x.com',
      status: 'active', tier: 'nano', commission_rate: 0.15,
      fixed_fee_brl: null, contract_start_date: null, contract_end_date: null,
      contract_version: 1, contract_acceptance_version: null, contract_accepted_at: null,
      contract_accepted_ip: null, contract_accepted_ua: null,
      proposed_tier: null, proposed_commission_rate: null, proposed_fixed_fee_brl: null,
      proposal_notes: null, proposal_created_at: null,
      channel_name: null, channel_url: null, channel_platform: null,
      social_links: [], subscribers_count: null, adjusted_followers: null,
      affiliate_type: 'external', known_ip_hashes: [], notes: null, tax_id: null,
      total_clicks: 0, total_referrals: 0, total_conversions: 0, total_earnings_brl: 0,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null })
    const sb = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })) } as any
    const repo = createQueryRepo(sb)
    const r = await repo.findById('aff-1')
    expect(sb.from).toHaveBeenCalledWith('affiliates')
    expect(r?.id).toBe('aff-1')
    expect(r?.commissionRate).toBe(0.15)
  })

  it('findByCode returns null when not found', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const sb = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })) } as any
    expect(await createQueryRepo(sb).findByCode('NONE')).toBeNull()
  })
})
