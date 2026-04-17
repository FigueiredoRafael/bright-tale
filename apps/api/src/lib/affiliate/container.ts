import {
  ApplyAsAffiliateUseCase,
  GetMyAffiliateUseCase,
  GetAffiliateStatsUseCase,
  GetMyCommissionsUseCase,
  GetAffiliateReferralsUseCase,
  UpdateAffiliateProfileUseCase,
  ApproveAffiliateUseCase,
  PauseAffiliateUseCase,
  TrackAffiliateLinkClickUseCase,
  AttributeSignupToAffiliateUseCase,
  CalculateAffiliateCommissionUseCase,
  ExpirePendingReferralsUseCase,
  GetAffiliateClicksByPlatformUseCase,
  type AffiliateConfig,
} from '@tn-figueiredo/affiliate'
import { createServiceClient } from '@/lib/supabase'
import { SupabaseAffiliateRepository } from './repository'
import { ResendAffiliateEmailService } from './email-service'
import { StubTaxIdRepository } from './tax-id-service'
import { AFFILIATE_CONFIG } from './config'
import { getAuthenticatedUser, isAdmin } from './auth-context'

// Explicit interface (NOT `ReturnType<typeof buildAffiliateContainer>`) — that
// pattern self-references and triggers TS2456. Container shape grows in 2A.3+
// so we use a wide-then-narrow approach with explicit annotation.
export interface AffiliateContainer {
  config: AffiliateConfig
  repo: SupabaseAffiliateRepository
  email: ResendAffiliateEmailService
  taxId: StubTaxIdRepository
  getAuthenticatedUser: typeof getAuthenticatedUser
  isAdmin: typeof isAdmin
  // 2A.2: 8 use cases
  applyUseCase: ApplyAsAffiliateUseCase
  getMyAffiliateUseCase: GetMyAffiliateUseCase
  getStatsUseCase: GetAffiliateStatsUseCase
  getMyCommissionsUseCase: GetMyCommissionsUseCase
  getReferralsUseCase: GetAffiliateReferralsUseCase
  updateProfileUseCase: UpdateAffiliateProfileUseCase
  approveUseCase: ApproveAffiliateUseCase
  pauseUseCase: PauseAffiliateUseCase
  // 2A.3: 5 tracking use cases
  trackClickUseCase: TrackAffiliateLinkClickUseCase
  attributeUseCase: AttributeSignupToAffiliateUseCase
  calcCommissionUseCase: CalculateAffiliateCommissionUseCase
  expirePendingUseCase: ExpirePendingReferralsUseCase
  clicksByPlatformUseCase: GetAffiliateClicksByPlatformUseCase
}

let cached: AffiliateContainer | null = null

export function buildAffiliateContainer(): AffiliateContainer {
  if (cached) return cached

  const sb = createServiceClient()
  const repo = new SupabaseAffiliateRepository(sb)
  const email = new ResendAffiliateEmailService()
  const taxId = new StubTaxIdRepository()
  const config: AffiliateConfig = AFFILIATE_CONFIG

  cached = {
    config, repo, email, taxId,
    getAuthenticatedUser, isAdmin,
    // 2A.2:
    applyUseCase: new ApplyAsAffiliateUseCase(repo, email, taxId),
    getMyAffiliateUseCase: new GetMyAffiliateUseCase(repo),
    getStatsUseCase: new GetAffiliateStatsUseCase(repo),
    getMyCommissionsUseCase: new GetMyCommissionsUseCase(repo),
    getReferralsUseCase: new GetAffiliateReferralsUseCase(repo),
    updateProfileUseCase: new UpdateAffiliateProfileUseCase(repo),
    approveUseCase: new ApproveAffiliateUseCase(repo, email, config, taxId),
    pauseUseCase: new PauseAffiliateUseCase(repo),
    // 2A.3 (verified constructor signatures):
    trackClickUseCase: new TrackAffiliateLinkClickUseCase(repo, config),
    attributeUseCase: new AttributeSignupToAffiliateUseCase(repo, config, undefined /* fraud — 2E */),
    calcCommissionUseCase: new CalculateAffiliateCommissionUseCase(repo, config),
    expirePendingUseCase: new ExpirePendingReferralsUseCase(repo),
    clicksByPlatformUseCase: new GetAffiliateClicksByPlatformUseCase(repo),
  }
  return cached
}

export function __resetAffiliateContainer(): void {
  cached = null
}
