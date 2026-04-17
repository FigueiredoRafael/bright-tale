import {
  ApplyAsAffiliateUseCase, ApproveAffiliateUseCase, PauseAffiliateUseCase,
  GetMyAffiliateUseCase, GetMyCommissionsUseCase, GetAffiliateStatsUseCase,
  GetAffiliateReferralsUseCase, TrackAffiliateLinkClickUseCase,
  AttributeSignupToAffiliateUseCase, CalculateAffiliateCommissionUseCase,
  UpdateAffiliateProfileUseCase, ExpirePendingReferralsUseCase,
  CreateAffiliatePayoutUseCase, AddPixKeyUseCase, SetDefaultPixKeyUseCase,
  DeletePixKeyUseCase, ListPixKeysUseCase, SubmitContentUseCase,
  AcceptContractProposalUseCase, RejectContractProposalUseCase,
  GetAffiliateClicksByPlatformUseCase, GetAdminAffiliateOverviewUseCase,
  GetAdminAffiliateDetailUseCase, RenewAffiliateContractUseCase,
  GetPendingContractsAffiliatesUseCase, ProposeContractChangeUseCase,
  CancelProposalUseCase, ApprovePayoutUseCase, RejectPayoutUseCase,
  CompletePayoutUseCase, ListAllPayoutsUseCase, ReviewContentSubmissionUseCase,
  ListAffiliateFraudFlagsUseCase, ListAffiliateRiskScoresUseCase,
  ResolveFraudFlagUseCase,
  type AffiliateConfig,
} from '@tn-figueiredo/affiliate'
import type {
  AffiliateRouteDeps,
  AffiliateAdminRouteDeps,
} from '@tn-figueiredo/affiliate/routes'
import { createServiceClient } from '@/lib/supabase'
import { SupabaseAffiliateRepository } from './repository'
import { ResendAffiliateEmailService } from './email-service'
import { StubTaxIdRepository } from './tax-id-service'
import { AFFILIATE_CONFIG } from './config'
import { getAuthenticatedUser, isAdmin } from './auth-context'

// Explicit interface (NOT `ReturnType<typeof buildAffiliateContainer>`) — that
// pattern self-references and triggers TS2456.
export interface AffiliateContainer {
  config: AffiliateConfig
  repo: SupabaseAffiliateRepository
  email: ResendAffiliateEmailService
  taxId: StubTaxIdRepository
  getAuthenticatedUser: typeof getAuthenticatedUser
  isAdmin: typeof isAdmin
  // Standalone use cases also referenced outside route helpers
  trackClickUseCase: TrackAffiliateLinkClickUseCase
  attributeUseCase: AttributeSignupToAffiliateUseCase
  calcCommissionUseCase: CalculateAffiliateCommissionUseCase
  expirePendingUseCase: ExpirePendingReferralsUseCase
  // Pre-shaped deps for package route helpers
  endUserDeps: AffiliateRouteDeps
  adminDeps: AffiliateAdminRouteDeps
}

let cached: AffiliateContainer | null = null

export function buildAffiliateContainer(): AffiliateContainer {
  if (cached) return cached

  const sb = createServiceClient()
  const repo = new SupabaseAffiliateRepository(sb)
  const email = new ResendAffiliateEmailService()
  const taxId = new StubTaxIdRepository()
  const config: AffiliateConfig = AFFILIATE_CONFIG

  const trackClickUseCase = new TrackAffiliateLinkClickUseCase(repo, config)
  const expirePendingUseCase = new ExpirePendingReferralsUseCase(repo)
  const attributeUseCase = new AttributeSignupToAffiliateUseCase(repo, config, undefined /* fraud — 2E */)
  const calcCommissionUseCase = new CalculateAffiliateCommissionUseCase(repo, config)

  const endUserDeps: AffiliateRouteDeps = {
    getAuthenticatedUser, isAdmin,
    applyUseCase: new ApplyAsAffiliateUseCase(repo, email, taxId),
    getMyAffiliateUseCase: new GetMyAffiliateUseCase(repo),
    getStatsUseCase: new GetAffiliateStatsUseCase(repo),
    getMyCommissionsUseCase: new GetMyCommissionsUseCase(repo),
    getReferralsUseCase: new GetAffiliateReferralsUseCase(repo),
    createPayoutUseCase: new CreateAffiliatePayoutUseCase(repo, taxId, config),
    updateProfileUseCase: new UpdateAffiliateProfileUseCase(repo),
    addPixKeyUseCase: new AddPixKeyUseCase(repo, taxId),
    setDefaultPixKeyUseCase: new SetDefaultPixKeyUseCase(repo),
    deletePixKeyUseCase: new DeletePixKeyUseCase(repo),
    listPixKeysUseCase: new ListPixKeysUseCase(repo),
    submitContentUseCase: new SubmitContentUseCase(repo),
    acceptProposalUseCase: new AcceptContractProposalUseCase(repo),
    rejectProposalUseCase: new RejectContractProposalUseCase(repo),
    clicksByPlatformUseCase: new GetAffiliateClicksByPlatformUseCase(repo),
    trackClickUseCase,
  }

  const adminDeps: AffiliateAdminRouteDeps = {
    getAuthenticatedUser, isAdmin,
    overviewUseCase: new GetAdminAffiliateOverviewUseCase(repo),
    detailUseCase: new GetAdminAffiliateDetailUseCase(repo),
    approveUseCase: new ApproveAffiliateUseCase(repo, email, config, taxId),
    pauseUseCase: new PauseAffiliateUseCase(repo),
    renewUseCase: new RenewAffiliateContractUseCase(repo),
    expirePendingUseCase,
    pendingContractsUseCase: new GetPendingContractsAffiliatesUseCase(repo),
    proposeChangeUseCase: new ProposeContractChangeUseCase(repo, email, config),
    cancelProposalUseCase: new CancelProposalUseCase(repo),
    approvePayoutUseCase: new ApprovePayoutUseCase(repo),
    rejectPayoutUseCase: new RejectPayoutUseCase(repo),
    completePayoutUseCase: new CompletePayoutUseCase(repo),
    listPayoutsUseCase: new ListAllPayoutsUseCase(repo),
    reviewContentUseCase: new ReviewContentSubmissionUseCase(repo),
    listFraudFlagsUseCase: new ListAffiliateFraudFlagsUseCase(repo),
    listRiskScoresUseCase: new ListAffiliateRiskScoresUseCase(repo),
    resolveFraudFlagUseCase: new ResolveFraudFlagUseCase(repo),
  }

  cached = {
    config, repo, email, taxId,
    getAuthenticatedUser, isAdmin,
    trackClickUseCase, attributeUseCase, calcCommissionUseCase, expirePendingUseCase,
    endUserDeps,
    adminDeps,
  }
  return cached
}

export function __resetAffiliateContainer(): void {
  cached = null
}
