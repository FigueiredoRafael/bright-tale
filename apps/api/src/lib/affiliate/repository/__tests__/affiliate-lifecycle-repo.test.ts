import { describe, it, expect, vi } from 'vitest'
import { createLifecycleRepo } from '../affiliate-lifecycle-repo'

function makeChain(returnData: unknown) {
  const single = vi.fn().mockResolvedValue({ data: returnData, error: null })
  const eq = vi.fn().mockReturnValue({ select: () => ({ single }) })
  const update = vi.fn().mockReturnValue({ eq })
  const sb = { from: vi.fn(() => ({ update })) }
  return { sb, update, eq, single }
}

// Minimal affiliate row the mapper accepts
const rowBase = {
  id: 'a1', user_id: null, code: 'X', name: 'A', email: 'a@x.com',
  status: 'paused' as const, tier: 'nano' as const, commission_rate: 0.15,
  fixed_fee_brl: null, contract_start_date: null, contract_end_date: null,
  contract_version: 1, contract_acceptance_version: null, contract_accepted_at: null,
  contract_accepted_ip: null, contract_accepted_ua: null,
  proposed_tier: null, proposed_commission_rate: null, proposed_fixed_fee_brl: null,
  proposal_notes: null, proposal_created_at: null,
  channel_name: null, channel_url: null, channel_platform: null,
  social_links: [], subscribers_count: null, adjusted_followers: null,
  affiliate_type: 'external' as const, known_ip_hashes: [], notes: null, tax_id: null,
  total_clicks: 0, total_referrals: 0, total_conversions: 0, total_earnings_brl: 0,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

describe('affiliate-lifecycle-repo', () => {
  it('approve sets status=approved + applies tier/rate/contract dates AND maps row to Affiliate', async () => {
    // Row returned reflects the post-update state — the mapper must transform
    // snake_case → camelCase for the function's domain return value.
    const { sb, update } = makeChain({
      ...rowBase,
      status: 'approved', tier: 'nano', commission_rate: 0.15,
      contract_start_date: '2026-04-17', contract_end_date: '2027-04-17',
      contract_version: 1, fixed_fee_brl: 1000,
    })
    const result = await createLifecycleRepo(sb as any).approve('a1', {
      affiliateId: 'a1', tier: 'nano', commissionRate: 0.15, fixedFeeBrl: 1000,
      contractStartDate: '2026-04-17', contractEndDate: '2027-04-17', contractVersion: 1,
    })
    // Assert Postgres write payload (snake_case)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'approved', tier: 'nano', commission_rate: 0.15, fixed_fee_brl: 1000,
      contract_start_date: '2026-04-17', contract_end_date: '2027-04-17', contract_version: 1,
    }))
    // Assert mapper output (camelCase) — guards against silent regressions in
    // mapAffiliateFromDb (e.g., snake_case leaking through, NaN coercion)
    expect(result.status).toBe('approved')
    expect(result.tier).toBe('nano')
    expect(result.commissionRate).toBe(0.15)
    expect(result.fixedFeeBrl).toBe(1000)
    expect(result.contractStartDate).toBe('2026-04-17')
    expect(result.contractEndDate).toBe('2027-04-17')
    expect(result.contractVersion).toBe(1)
  })

  it('pause sets status=paused AND returns mapped Affiliate', async () => {
    const { sb, update } = makeChain(rowBase)
    const result = await createLifecycleRepo(sb as any).pause('a1')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'paused' }))
    expect(result.status).toBe('paused')
    expect(result.id).toBe('a1')
  })
})
