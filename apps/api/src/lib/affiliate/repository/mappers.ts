import type {
  Affiliate, AffiliateClick, AffiliateReferral, AffiliateCommission,
  AffiliatePayout, AffiliatePixKey, AffiliateContentSubmission,
  AffiliateContractHistoryEntry, IAffiliateRepository,
} from '@tn-figueiredo/affiliate'
import type { Database } from '@brighttale/shared/types/database'

// ── Affiliate (centralized) ─────────────────────────────────────────────
export type DbAffiliate = Database['public']['Tables']['affiliates']['Row']

// NOTE: Package's Affiliate interface omits some SQL columns:
// user_id, contract_acceptance_version, contract_accepted_*, proposal_notes,
// proposal_created_at. These are SQL-only and read separately when needed
// (e.g., proposal-related fields driven by use cases via different queries).
export function mapAffiliateFromDb(r: DbAffiliate): Affiliate {
  return {
    id: r.id, code: r.code, name: r.name, email: r.email,
    status: r.status as Affiliate['status'],
    tier: r.tier as Affiliate['tier'],
    commissionRate: Number(r.commission_rate),
    fixedFeeBrl: r.fixed_fee_brl,
    contractStartDate: r.contract_start_date,
    contractEndDate: r.contract_end_date,
    contractVersion: r.contract_version,
    proposedTier: r.proposed_tier as Affiliate['proposedTier'],
    proposedCommissionRate: r.proposed_commission_rate !== null ? Number(r.proposed_commission_rate) : null,
    proposedFixedFeeBrl: r.proposed_fixed_fee_brl,
    channelName: r.channel_name,
    channelUrl: r.channel_url,
    channelPlatform: r.channel_platform,
    socialLinks: (r.social_links as unknown as Affiliate['socialLinks']) ?? [],
    subscribersCount: r.subscribers_count,
    adjustedFollowers: r.adjusted_followers,
    affiliateType: r.affiliate_type as Affiliate['affiliateType'],
    knownIpHashes: r.known_ip_hashes ?? [],
    notes: r.notes,
    taxId: r.tax_id,
    totalClicks: r.total_clicks,
    totalReferrals: r.total_referrals,
    totalConversions: r.total_conversions,
    totalEarningsBrl: r.total_earnings_brl,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// ── Click ───────────────────────────────────────────────────────────────
export type DbAffiliateClick = Database['public']['Tables']['affiliate_clicks']['Row']

export function mapClickFromDb(r: DbAffiliateClick): AffiliateClick {
  return {
    id: r.id, affiliateId: r.affiliate_id, affiliateCode: r.affiliate_code,
    ipHash: r.ip_hash, userAgent: r.user_agent, landingUrl: r.landing_url,
    utmSource: r.utm_source, utmMedium: r.utm_medium, utmCampaign: r.utm_campaign,
    sourcePlatform: r.source_platform, deviceType: r.device_type,
    convertedAt: r.converted_at, convertedUserId: r.converted_user_id,
    createdAt: r.created_at,
  }
}

export function mapClickToDbInsert(input: Parameters<IAffiliateRepository['createClick']>[0]) {
  return {
    affiliate_id: input.affiliateId,
    affiliate_code: input.affiliateCode,
    ip_hash: input.ipHash ?? null,
    user_agent: input.userAgent ?? null,
    landing_url: input.landingUrl ?? null,
    utm_source: input.utmSource ?? null,
    utm_medium: input.utmMedium ?? null,
    utm_campaign: input.utmCampaign ?? null,
    source_platform: input.sourcePlatform ?? null,
    device_type: input.deviceType ?? null,
  }
}

// ── Referral ────────────────────────────────────────────────────────────
export type DbAffiliateReferral = Database['public']['Tables']['affiliate_referrals']['Row']

// NOTE: Package's AffiliateReferral interface omits createdAt (SQL has it).
// Also omits utm_*, signup_user_agent, signup_fingerprint (no SQL columns yet).
export function mapReferralFromDb(r: DbAffiliateReferral): AffiliateReferral {
  return {
    id: r.id,
    affiliateId: r.affiliate_id,
    affiliateCode: r.affiliate_code,
    userId: r.user_id,
    clickId: r.click_id,
    attributionStatus: r.attribution_status as AffiliateReferral['attributionStatus'],
    signupDate: r.signup_date,
    windowEnd: r.window_end,
    convertedAt: r.converted_at,
    platform: r.platform as AffiliateReferral['platform'],
    signupIpHash: r.signup_ip_hash,
  }
}

export function mapReferralToDbInsert(input: Parameters<IAffiliateRepository['createReferral']>[0]) {
  return {
    affiliate_id: input.affiliateId,
    affiliate_code: input.affiliateCode,
    user_id: input.userId,
    click_id: input.clickId ?? null,
    attribution_status: input.attributionStatus,
    signup_date: input.signupDate,
    window_end: input.windowEnd,
    platform: input.platform ?? null,
    signup_ip_hash: input.signupIpHash ?? null,
  }
}

// ── Commission ──────────────────────────────────────────────────────────
export type DbAffiliateCommission = Database['public']['Tables']['affiliate_commissions']['Row']

export function mapCommissionFromDb(r: DbAffiliateCommission): AffiliateCommission {
  return {
    id: r.id,
    affiliateId: r.affiliate_id,
    affiliateCode: r.affiliate_code,
    userId: r.user_id ?? '',
    referralId: r.referral_id,
    paymentAmount: r.payment_amount,
    stripeFee: r.stripe_fee,
    netAmount: r.net_amount,
    commissionRate: Number(r.commission_rate),
    commissionBrl: r.commission_brl,
    fixedFeeBrl: r.fixed_fee_brl,
    totalBrl: r.total_brl,
    paymentType: r.payment_type as AffiliateCommission['paymentType'],
    status: r.status as AffiliateCommission['status'],
    paymentPeriodStart: null,
    paymentPeriodEnd: null,
    isRetroactive: false,
    createdAt: r.created_at,
  }
}

// NOTE: Package's AffiliateCommission interface omits `payoutId` (despite SQL
// having payout_id column — set later by markCommissionsPaid). It also declares
// paymentPeriodStart/End/isRetroactive that don't exist as SQL columns yet
// (package ahead of public schema). Defaulted on read; ignored on write.
export function mapCommissionToDbInsert(input: Parameters<IAffiliateRepository['createCommission']>[0]) {
  return {
    affiliate_id: input.affiliateId,
    affiliate_code: input.affiliateCode,
    user_id: input.userId,
    referral_id: input.referralId,
    payment_amount: input.paymentAmount,
    stripe_fee: input.stripeFee,
    net_amount: input.netAmount,
    commission_rate: input.commissionRate,
    commission_brl: input.commissionBrl,
    fixed_fee_brl: input.fixedFeeBrl ?? null,
    total_brl: input.totalBrl,
    payment_type: input.paymentType,
    status: input.status,
  }
}

// ── Payout ──────────────────────────────────────────────────────────────
export type DbAffiliatePayout = Database['public']['Tables']['affiliate_payouts']['Row']

export function mapPayoutFromDb(r: DbAffiliatePayout): AffiliatePayout {
  return {
    id: r.id,
    affiliateId: r.affiliate_id,
    affiliateCode: r.affiliate_code,
    totalBrl: r.total_brl,
    commissionIds: r.commission_ids ?? [],
    pixKeyId: r.pix_key_id,
    pixKeyValue: r.pix_key_value,
    pixKeyType: r.pix_key_type as AffiliatePayout['pixKeyType'],
    status: r.status as AffiliatePayout['status'],
    requestedAt: r.requested_at,
    reviewedAt: r.reviewed_at,
    completedAt: r.completed_at,
    adminNotes: r.admin_notes,
    taxId: r.tax_id,
    taxIdType: r.tax_id_type as AffiliatePayout['taxIdType'],
  }
}

// NOTE: SQL has payment_reference column but package's AffiliatePayout omits it.
// Skipped on read + write.
export function mapPayoutToDbInsert(input: Parameters<IAffiliateRepository['createPayout']>[0]) {
  return {
    affiliate_id: input.affiliateId,
    affiliate_code: input.affiliateCode,
    total_brl: input.totalBrl,
    commission_ids: input.commissionIds,
    pix_key_id: input.pixKeyId ?? null,
    pix_key_value: input.pixKeyValue ?? null,
    pix_key_type: input.pixKeyType ?? null,
    status: input.status,
    reviewed_at: input.reviewedAt ?? null,
    completed_at: input.completedAt ?? null,
    admin_notes: input.adminNotes ?? null,
    tax_id: input.taxId ?? null,
    tax_id_type: input.taxIdType ?? null,
  }
}

// ── PIX key ─────────────────────────────────────────────────────────────
export type DbAffiliatePixKey = Database['public']['Tables']['affiliate_pix_keys']['Row']

export function mapPixKeyFromDb(r: DbAffiliatePixKey): AffiliatePixKey {
  return {
    id: r.id,
    affiliateId: r.affiliate_id,
    keyType: r.key_type as AffiliatePixKey['keyType'],
    keyValue: r.key_value,
    keyDisplay: r.key_display,
    isDefault: r.is_default,
    label: r.label,
    createdAt: r.created_at,
  }
}

// NOTE: SQL has updated_at column; package's AffiliatePixKey interface omits it.
export function mapPixKeyToDbInsert(input: Parameters<IAffiliateRepository['addPixKey']>[0]) {
  return {
    affiliate_id: input.affiliateId,
    key_type: input.keyType,
    key_value: input.keyValue,
    key_display: input.keyDisplay,
    is_default: input.isDefault,
    label: input.label ?? null,
  }
}

// ── Content submission ──────────────────────────────────────────────────
export type DbAffiliateContentSubmission = Database['public']['Tables']['affiliate_content_submissions']['Row']

export function mapContentSubmissionFromDb(r: DbAffiliateContentSubmission): AffiliateContentSubmission {
  return {
    id: r.id,
    affiliateId: r.affiliate_id,
    platform: r.platform as AffiliateContentSubmission['platform'],
    contentType: r.content_type as AffiliateContentSubmission['contentType'],
    url: r.url,
    title: r.title,
    description: r.description,
    status: r.status as AffiliateContentSubmission['status'],
    reviewNotes: r.review_notes,
    postedAt: r.posted_at,
    createdAt: r.created_at,
  }
}

// NOTE: SQL has updated_at column; package's AffiliateContentSubmission omits it.
export function mapContentSubmissionToDbInsert(input: Parameters<IAffiliateRepository['submitContent']>[0]) {
  return {
    affiliate_id: input.affiliateId,
    platform: input.platform,
    content_type: input.contentType,
    url: input.url,
    title: input.title ?? null,
    description: input.description ?? null,
    posted_at: input.postedAt ?? null,
  }
}

// ── Contract history entry ──────────────────────────────────────────────
export type DbAffiliateContractHistoryEntry = Database['public']['Tables']['affiliate_contract_history']['Row']

export function mapContractHistoryFromDb(r: DbAffiliateContractHistoryEntry): AffiliateContractHistoryEntry {
  return {
    id: r.id,
    affiliateId: r.affiliate_id,
    action: r.action as AffiliateContractHistoryEntry['action'],
    oldTier: r.old_tier,
    newTier: r.new_tier,
    oldCommissionRate: r.old_commission_rate !== null ? Number(r.old_commission_rate) : null,
    newCommissionRate: r.new_commission_rate !== null ? Number(r.new_commission_rate) : null,
    oldFixedFeeBrl: r.old_fixed_fee_brl,
    newFixedFeeBrl: r.new_fixed_fee_brl,
    oldStatus: r.old_status,
    newStatus: r.new_status,
    performedBy: r.performed_by,
    notes: r.notes,
    contractVersion: r.contract_version,
    acceptedIp: r.accepted_ip,
    acceptedUa: r.accepted_ua,
    createdAt: r.created_at,
  }
}

export function mapContractHistoryToDbInsert(input: Parameters<IAffiliateRepository['addContractHistory']>[0]) {
  return {
    affiliate_id: input.affiliateId,
    action: input.action,
    old_tier: input.oldTier ?? null,
    new_tier: input.newTier ?? null,
    old_commission_rate: input.oldCommissionRate ?? null,
    new_commission_rate: input.newCommissionRate ?? null,
    old_fixed_fee_brl: input.oldFixedFeeBrl ?? null,
    new_fixed_fee_brl: input.newFixedFeeBrl ?? null,
    old_status: input.oldStatus ?? null,
    new_status: input.newStatus ?? null,
    performed_by: input.performedBy ?? null,
    notes: input.notes ?? null,
    contract_version: input.contractVersion ?? null,
    accepted_ip: input.acceptedIp ?? null,
    accepted_ua: input.acceptedUa ?? null,
  }
}
