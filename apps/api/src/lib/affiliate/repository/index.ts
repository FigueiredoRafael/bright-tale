import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { createQueryRepo } from './affiliate-query-repo'
import { createLifecycleRepo } from './affiliate-lifecycle-repo'
import { createProposalsRepo } from './affiliate-proposals-repo'
import { createHistoryRepo } from './affiliate-history-repo'
import { createClicksRepo } from './clicks-repo'
import { createReferralsRepo } from './referrals-repo'
import { createCommissionsRepo } from './commissions-repo'
import { createPayoutsRepo } from './payouts-repo'
import { createPixRepo } from './pix-repo'
import { createContentRepo } from './content-repo'
import { createFraudRepo } from './fraud-repo'
import { createStatsRepo } from './stats-repo'

export class SupabaseAffiliateRepository implements IAffiliateRepository {
  private query: ReturnType<typeof createQueryRepo>
  private lifecycle: ReturnType<typeof createLifecycleRepo>
  private proposals: ReturnType<typeof createProposalsRepo>
  private history: ReturnType<typeof createHistoryRepo>
  private clicks: ReturnType<typeof createClicksRepo>
  private referrals: ReturnType<typeof createReferralsRepo>
  private commissions: ReturnType<typeof createCommissionsRepo>
  private payouts: ReturnType<typeof createPayoutsRepo>
  private pix: ReturnType<typeof createPixRepo>
  private content: ReturnType<typeof createContentRepo>
  private fraud: ReturnType<typeof createFraudRepo>
  private stats: ReturnType<typeof createStatsRepo>

  constructor(private sb: SupabaseClient<Database>) {
    this.query = createQueryRepo(sb)
    this.lifecycle = createLifecycleRepo(sb)
    this.proposals = createProposalsRepo(sb)
    this.history = createHistoryRepo(sb)
    this.clicks = createClicksRepo(sb)
    this.referrals = createReferralsRepo(sb)
    this.commissions = createCommissionsRepo(sb)
    this.payouts = createPayoutsRepo(sb)
    this.pix = createPixRepo(sb)
    this.content = createContentRepo(sb)
    this.fraud = createFraudRepo(sb)
    this.stats = createStatsRepo(sb)
  }

  // Query (9)
  findById(id: string) { return this.query.findById(id) }
  findByCode(code: string) { return this.query.findByCode(code) }
  findByUserId(userId: string) { return this.query.findByUserId(userId) }
  findByEmail(email: string) { return this.query.findByEmail(email) }
  isCodeTaken(code: string) { return this.query.isCodeTaken(code) }
  create(input: Parameters<IAffiliateRepository['create']>[0]) { return this.query.create(input) }
  createInternal(input: Parameters<IAffiliateRepository['createInternal']>[0]) { return this.query.createInternal(input) }
  linkUserId(affiliateId: string, userId: string) { return this.query.linkUserId(affiliateId, userId) }
  listAll(options?: Parameters<IAffiliateRepository['listAll']>[0]) { return this.query.listAll(options) }

  // Lifecycle (6)
  approve(id: string, input: Parameters<IAffiliateRepository['approve']>[1]) { return this.lifecycle.approve(id, input) }
  pause(id: string, options?: Parameters<IAffiliateRepository['pause']>[1]) { return this.lifecycle.pause(id, options) }
  terminate(id: string) { return this.lifecycle.terminate(id) }
  updateProfile(affiliateId: string, input: Parameters<IAffiliateRepository['updateProfile']>[1]) { return this.lifecycle.updateProfile(affiliateId, input) }
  updateContract(affiliateId: string, startDate: string, endDate: string) { return this.lifecycle.updateContract(affiliateId, startDate, endDate) }
  activateAfterContractAcceptance(id: string) { return this.lifecycle.activateAfterContractAcceptance(id) }

  // History (2)
  addContractHistory(entry: Parameters<IAffiliateRepository['addContractHistory']>[0]) { return this.history.addContractHistory(entry) }
  getContractHistory(affiliateId: string) { return this.history.getContractHistory(affiliateId) }

  // Proposals (4)
  proposeContractChange(id: string, input: Parameters<IAffiliateRepository['proposeContractChange']>[1]) { return this.proposals.proposeContractChange(id, input) }
  cancelProposal(id: string) { return this.proposals.cancelProposal(id) }
  acceptProposal(id: string) { return this.proposals.acceptProposal(id) }
  rejectProposal(id: string) { return this.proposals.rejectProposal(id) }

  // Clicks (4)
  incrementClicks(affiliateId: string) { return this.clicks.incrementClicks(affiliateId) }
  createClick(input: Parameters<IAffiliateRepository['createClick']>[0]) { return this.clicks.createClick(input) }
  markClickConverted(clickId: string, userId: string) { return this.clicks.markClickConverted(clickId, userId) }
  getClicksByPlatform(affiliateId: string, days?: number) { return this.clicks.getClicksByPlatform(affiliateId, days) }

  // Referrals (5)
  incrementReferrals(affiliateId: string) { return this.referrals.incrementReferrals(affiliateId) }
  createReferral(input: Parameters<IAffiliateRepository['createReferral']>[0]) { return this.referrals.createReferral(input) }
  findReferralByUserId(userId: string) { return this.referrals.findReferralByUserId(userId) }
  listReferralsByAffiliate(affiliateId: string, options?: Parameters<IAffiliateRepository['listReferralsByAffiliate']>[1]) { return this.referrals.listReferralsByAffiliate(affiliateId, options) }
  expirePendingReferrals(today: string) { return this.referrals.expirePendingReferrals(today) }

  // Commissions (4)
  incrementConversions(affiliateId: string, earningsBrl: number) { return this.commissions.incrementConversions(affiliateId, earningsBrl) }
  createCommission(input: Parameters<IAffiliateRepository['createCommission']>[0]) { return this.commissions.createCommission(input) }
  listPendingCommissions(affiliateId: string) { return this.commissions.listPendingCommissions(affiliateId) }
  markCommissionsPaid(commissionIds: string[], payoutId: string) { return this.commissions.markCommissionsPaid(commissionIds, payoutId) }

  // Payouts (4)
  createPayout(input: Parameters<IAffiliateRepository['createPayout']>[0]) { return this.payouts.createPayout(input) }
  findPayoutById(id: string) { return this.payouts.findPayoutById(id) }
  updatePayoutStatus(id: string, status: Parameters<IAffiliateRepository['updatePayoutStatus']>[1], meta?: Parameters<IAffiliateRepository['updatePayoutStatus']>[2]) { return this.payouts.updatePayoutStatus(id, status, meta) }
  listPayouts(options?: Parameters<IAffiliateRepository['listPayouts']>[0]) { return this.payouts.listPayouts(options) }

  // PIX (4)
  addPixKey(input: Parameters<IAffiliateRepository['addPixKey']>[0]) { return this.pix.addPixKey(input) }
  listPixKeys(affiliateId: string) { return this.pix.listPixKeys(affiliateId) }
  setDefaultPixKey(affiliateId: string, pixKeyId: string) { return this.pix.setDefaultPixKey(affiliateId, pixKeyId) }
  deletePixKey(pixKeyId: string) { return this.pix.deletePixKey(pixKeyId) }

  // Content (3)
  submitContent(input: Parameters<IAffiliateRepository['submitContent']>[0]) { return this.content.submitContent(input) }
  reviewContent(submissionId: string, status: 'approved' | 'rejected', reviewNotes?: string) { return this.content.reviewContent(submissionId, status, reviewNotes) }
  listContentSubmissions(affiliateId: string) { return this.content.listContentSubmissions(affiliateId) }

  // Fraud (4)
  listFraudFlags(options?: Parameters<IAffiliateRepository['listFraudFlags']>[0]) { return this.fraud.listFraudFlags(options) }
  listRiskScores(options?: Parameters<IAffiliateRepository['listRiskScores']>[0]) { return this.fraud.listRiskScores(options) }
  findFraudFlagById(flagId: string) { return this.fraud.findFraudFlagById(flagId) }
  updateFraudFlagStatus(flagId: string, status: Parameters<IAffiliateRepository['updateFraudFlagStatus']>[1], notes?: string) { return this.fraud.updateFraudFlagStatus(flagId, status, notes) }

  // Stats (2)
  getStats(affiliateId: string) { return this.stats.getStats(affiliateId) }
  getPendingContractsCount() { return this.stats.getPendingContractsCount() }
}
