import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createProposalsRepo } from '../affiliate-proposals-repo'

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
  status: 'active' as const, tier: 'nano' as const, commission_rate: 0.15,
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

describe('affiliate-proposals-repo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-17T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('proposeContractChange writes ALL 5 proposal fields with proposal_created_at as recent ISO', async () => {
    const { sb, update } = makeChain({
      ...rowBase,
      proposed_tier: 'micro',
      proposed_commission_rate: 0.2,
      proposed_fixed_fee_brl: 500,
      proposal_notes: 'upgrade',
      proposal_created_at: '2026-04-17T00:00:00.000Z',
    })
    await createProposalsRepo(sb as any).proposeContractChange('a1', {
      affiliateId: 'a1',
      proposedTier: 'micro',
      proposedCommissionRate: 0.2,
      proposedFixedFeeBrl: 500,
      notes: 'upgrade',
    })
    expect(update).toHaveBeenCalledWith({
      proposed_tier: 'micro',
      proposed_commission_rate: 0.2,
      proposed_fixed_fee_brl: 500,
      proposal_notes: 'upgrade',
      proposal_created_at: '2026-04-17T00:00:00.000Z',
    })
  })

  it('proposeContractChange returns mapped Affiliate (camelCase fields)', async () => {
    const { sb } = makeChain({
      ...rowBase,
      proposed_tier: 'micro',
      proposed_commission_rate: 0.2,
      proposed_fixed_fee_brl: 500,
      proposal_notes: 'upgrade',
      proposal_created_at: '2026-04-17T00:00:00.000Z',
    })
    const result = await createProposalsRepo(sb as any).proposeContractChange('a1', {
      affiliateId: 'a1',
      proposedTier: 'micro',
      proposedCommissionRate: 0.2,
      proposedFixedFeeBrl: 500,
      notes: 'upgrade',
    })
    expect(result.id).toBe('a1')
    expect(result.proposedTier).toBe('micro')
    expect(result.proposedCommissionRate).toBe(0.2)
    expect(result.proposedFixedFeeBrl).toBe(500)
  })

  it('cancelProposal clears all 5 proposal columns to null', async () => {
    const { sb, update } = makeChain(rowBase)
    await createProposalsRepo(sb as any).cancelProposal('a1')
    expect(update).toHaveBeenCalledWith({
      proposed_tier: null,
      proposed_commission_rate: null,
      proposed_fixed_fee_brl: null,
      proposal_notes: null,
      proposal_created_at: null,
    })
  })

  it('acceptProposal clears all 5 proposal columns', async () => {
    const { sb, update } = makeChain(rowBase)
    await createProposalsRepo(sb as any).acceptProposal('a1')
    expect(update).toHaveBeenCalledWith({
      proposed_tier: null,
      proposed_commission_rate: null,
      proposed_fixed_fee_brl: null,
      proposal_notes: null,
      proposal_created_at: null,
    })
  })

  it('rejectProposal clears all 5 proposal columns', async () => {
    const { sb, update } = makeChain(rowBase)
    await createProposalsRepo(sb as any).rejectProposal('a1')
    expect(update).toHaveBeenCalledWith({
      proposed_tier: null,
      proposed_commission_rate: null,
      proposed_fixed_fee_brl: null,
      proposal_notes: null,
      proposal_created_at: null,
    })
  })
})
