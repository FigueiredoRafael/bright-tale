import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  createServiceClient: vi.fn(() => ({})),
}))

import {
  buildAffiliateContainer,
  __resetAffiliateContainer,
} from '@/lib/affiliate/container'

describe('affiliate container', () => {
  beforeEach(() => {
    __resetAffiliateContainer()
  })

  it('returns the same instance on second call (caching)', () => {
    const a = buildAffiliateContainer()
    const b = buildAffiliateContainer()
    expect(a).toBe(b)
  })

  it('__resetAffiliateContainer clears cache; next call returns new instance', () => {
    const a = buildAffiliateContainer()
    __resetAffiliateContainer()
    const b = buildAffiliateContainer()
    expect(a).not.toBe(b)
  })

  it('exposes all top-level fields', () => {
    const c = buildAffiliateContainer()
    expect(c).toHaveProperty('config')
    expect(c).toHaveProperty('repo')
    expect(c).toHaveProperty('email')
    expect(c).toHaveProperty('taxId')
    expect(c).toHaveProperty('getAuthenticatedUser')
    expect(c).toHaveProperty('isAdmin')
    expect(c).toHaveProperty('trackClickUseCase')
    expect(c).toHaveProperty('attributeUseCase')
    expect(c).toHaveProperty('calcCommissionUseCase')
    expect(c).toHaveProperty('expirePendingUseCase')
    expect(c).toHaveProperty('endUserDeps')
    expect(c).toHaveProperty('adminDeps')
  })

  it('endUserDeps has expected use-case fields (16 total)', () => {
    const c = buildAffiliateContainer()
    const deps = c.endUserDeps as unknown as Record<string, unknown>
    // Spot-check key fields
    expect(deps).toHaveProperty('applyUseCase')
    expect(deps).toHaveProperty('getMyAffiliateUseCase')
    expect(deps).toHaveProperty('getStatsUseCase')
    expect(deps).toHaveProperty('createPayoutUseCase')
    expect(deps).toHaveProperty('addPixKeyUseCase')
    expect(deps).toHaveProperty('submitContentUseCase')
    expect(deps).toHaveProperty('acceptProposalUseCase')
    expect(deps).toHaveProperty('rejectProposalUseCase')
    expect(deps).toHaveProperty('clicksByPlatformUseCase')
    expect(deps).toHaveProperty('trackClickUseCase')
    expect(deps).toHaveProperty('getAuthenticatedUser')
    expect(deps).toHaveProperty('isAdmin')
  })

  it('adminDeps has expected use-case fields (17 total)', () => {
    const c = buildAffiliateContainer()
    const deps = c.adminDeps as unknown as Record<string, unknown>
    expect(deps).toHaveProperty('overviewUseCase')
    expect(deps).toHaveProperty('detailUseCase')
    expect(deps).toHaveProperty('approveUseCase')
    expect(deps).toHaveProperty('pauseUseCase')
    expect(deps).toHaveProperty('renewUseCase')
    expect(deps).toHaveProperty('expirePendingUseCase')
    expect(deps).toHaveProperty('pendingContractsUseCase')
    expect(deps).toHaveProperty('proposeChangeUseCase')
    expect(deps).toHaveProperty('cancelProposalUseCase')
    expect(deps).toHaveProperty('approvePayoutUseCase')
    expect(deps).toHaveProperty('rejectPayoutUseCase')
    expect(deps).toHaveProperty('completePayoutUseCase')
    expect(deps).toHaveProperty('listPayoutsUseCase')
    expect(deps).toHaveProperty('reviewContentUseCase')
    expect(deps).toHaveProperty('listFraudFlagsUseCase')
    expect(deps).toHaveProperty('listRiskScoresUseCase')
    expect(deps).toHaveProperty('resolveFraudFlagUseCase')
  })

  it('expirePendingUseCase reference is shared between top-level and adminDeps', () => {
    const c = buildAffiliateContainer()
    expect(c.expirePendingUseCase).toBe(c.adminDeps.expirePendingUseCase)
  })

  it('trackClickUseCase reference is shared between top-level and endUserDeps', () => {
    const c = buildAffiliateContainer()
    expect(c.trackClickUseCase).toBe(c.endUserDeps.trackClickUseCase)
  })
})
