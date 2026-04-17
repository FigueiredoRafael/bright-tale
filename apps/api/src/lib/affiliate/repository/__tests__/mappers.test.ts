import { describe, it, expect } from 'vitest'
import {
  mapAffiliateFromDb,
  mapClickFromDb,
  mapClickToDbInsert,
  mapReferralFromDb,
  mapReferralToDbInsert,
  mapCommissionFromDb,
  mapCommissionToDbInsert,
  mapPayoutFromDb,
  mapPayoutToDbInsert,
  mapPixKeyFromDb,
  mapPixKeyToDbInsert,
  mapContentSubmissionFromDb,
  mapContentSubmissionToDbInsert,
  mapContractHistoryFromDb,
  mapContractHistoryToDbInsert,
} from '../mappers'

// ── Affiliate ───────────────────────────────────────────────────────────
describe('mappers — Affiliate fromDb', () => {
  // Build a typical DB row (snake_case) — Postgres NUMERIC comes back as string
  const dbRow: any = {
    id: 'aff-1',
    code: 'CREATOR',
    name: 'Jane Creator',
    email: 'jane@example.com',
    status: 'active',
    tier: 'standard',
    commission_rate: '0.15',
    fixed_fee_brl: 0,
    contract_start_date: '2026-01-01',
    contract_end_date: null,
    contract_version: 1,
    proposed_tier: null,
    proposed_commission_rate: null,
    proposed_fixed_fee_brl: null,
    channel_name: 'Jane Channel',
    channel_url: 'https://youtube.com/@jane',
    channel_platform: 'youtube',
    social_links: [{ platform: 'instagram', url: 'https://ig.com/j' }],
    subscribers_count: 1000,
    adjusted_followers: 1000,
    affiliate_type: 'creator',
    known_ip_hashes: ['abc'],
    notes: null,
    tax_id: '123',
    total_clicks: 0,
    total_referrals: 0,
    total_conversions: 0,
    total_earnings_brl: 0,
    created_at: '2026-04-16T00:00:00Z',
    updated_at: '2026-04-16T00:00:00Z',
    // SQL-only columns the mapper should ignore:
    user_id: 'user-1',
    contract_acceptance_version: 1,
    proposal_notes: null,
    proposal_created_at: null,
  }

  it('coerces commission_rate string → number', () => {
    const a = mapAffiliateFromDb(dbRow)
    expect(a.commissionRate).toBe(0.15)
    expect(typeof a.commissionRate).toBe('number')
  })

  it('coerces proposed_commission_rate (null preserved, string → number)', () => {
    expect(mapAffiliateFromDb(dbRow).proposedCommissionRate).toBeNull()
    const withProposed = { ...dbRow, proposed_commission_rate: '0.20' }
    expect(mapAffiliateFromDb(withProposed).proposedCommissionRate).toBe(0.2)
  })

  it('preserves all camelCase identity fields and JSONB social_links', () => {
    const a = mapAffiliateFromDb(dbRow)
    expect(a.id).toBe('aff-1')
    expect(a.code).toBe('CREATOR')
    expect(a.name).toBe('Jane Creator')
    expect(a.email).toBe('jane@example.com')
    expect(a.status).toBe('active')
    expect(a.tier).toBe('standard')
    expect(a.channelPlatform).toBe('youtube')
    expect(a.affiliateType).toBe('creator')
    expect(Array.isArray(a.socialLinks)).toBe(true)
    expect(a.socialLinks).toHaveLength(1)
    expect(a.socialLinks?.[0]).toEqual({ platform: 'instagram', url: 'https://ig.com/j' })
  })

  it('defaults total_clicks/total_referrals to numeric zero and known_ip_hashes from null → []', () => {
    const a = mapAffiliateFromDb({ ...dbRow, known_ip_hashes: null })
    expect(a.totalClicks).toBe(0)
    expect(a.totalReferrals).toBe(0)
    expect(a.totalConversions).toBe(0)
    expect(a.totalEarningsBrl).toBe(0)
    expect(a.knownIpHashes).toEqual([])
  })

  it('defaults social_links to [] when null', () => {
    const a = mapAffiliateFromDb({ ...dbRow, social_links: null })
    expect(a.socialLinks).toEqual([])
  })
})

// ── Click ───────────────────────────────────────────────────────────────
describe('mappers — Click round-trip', () => {
  it('toInsert preserves camelCase fields as snake_case (no field swaps)', () => {
    const input = {
      affiliateId: 'aff-1',
      affiliateCode: 'CREATOR',
      ipHash: 'hash-1',
      userAgent: 'Mozilla/5.0',
      landingUrl: 'https://brighttale.io/?ref=CREATOR',
      utmSource: 'youtube',
      utmMedium: 'video',
      utmCampaign: 'spring',
      sourcePlatform: 'youtube' as const,
      deviceType: 'mobile' as const,
    }
    const row = mapClickToDbInsert(input)
    expect(row).toEqual({
      affiliate_id: 'aff-1',
      affiliate_code: 'CREATOR',
      ip_hash: 'hash-1',
      user_agent: 'Mozilla/5.0',
      landing_url: 'https://brighttale.io/?ref=CREATOR',
      utm_source: 'youtube',
      utm_medium: 'video',
      utm_campaign: 'spring',
      source_platform: 'youtube',
      device_type: 'mobile',
    })
    // Critical: not swapped
    expect(row.affiliate_id).toBe('aff-1')
    expect(row.affiliate_code).toBe('CREATOR')
  })

  it('toInsert defaults all optional fields to null when omitted', () => {
    const row = mapClickToDbInsert({
      affiliateId: 'aff-1',
      affiliateCode: 'CREATOR',
    } as any)
    expect(row).toEqual({
      affiliate_id: 'aff-1',
      affiliate_code: 'CREATOR',
      ip_hash: null,
      user_agent: null,
      landing_url: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      source_platform: null,
      device_type: null,
    })
  })

  it('fromDb maps snake_case → camelCase and preserves null/timestamps', () => {
    const dbRow: any = {
      id: 'click-1',
      affiliate_id: 'aff-1',
      affiliate_code: 'CREATOR',
      ip_hash: 'hash-1',
      user_agent: 'ua',
      landing_url: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      source_platform: 'youtube',
      device_type: 'mobile',
      converted_at: null,
      converted_user_id: null,
      created_at: '2026-04-17T00:00:00Z',
    }
    const click = mapClickFromDb(dbRow)
    expect(click.id).toBe('click-1')
    expect(click.affiliateId).toBe('aff-1')
    expect(click.affiliateCode).toBe('CREATOR')
    expect(click.sourcePlatform).toBe('youtube')
    expect(click.deviceType).toBe('mobile')
    expect(click.convertedAt).toBeNull()
    expect(click.createdAt).toBe('2026-04-17T00:00:00Z')
  })
})

// ── Referral ────────────────────────────────────────────────────────────
describe('mappers — Referral round-trip', () => {
  const input = {
    affiliateId: 'aff-1',
    affiliateCode: 'CREATOR',
    userId: 'user-1',
    clickId: 'click-1',
    attributionStatus: 'pending' as const,
    signupDate: '2026-04-17',
    windowEnd: '2026-04-24',
    platform: 'web' as const,
    signupIpHash: 'ip-hash',
  }

  it('toInsert maps all camelCase → snake_case', () => {
    const row = mapReferralToDbInsert(input)
    expect(row).toEqual({
      affiliate_id: 'aff-1',
      affiliate_code: 'CREATOR',
      user_id: 'user-1',
      click_id: 'click-1',
      attribution_status: 'pending',
      signup_date: '2026-04-17',
      window_end: '2026-04-24',
      platform: 'web',
      signup_ip_hash: 'ip-hash',
    })
  })

  it('toInsert defaults clickId / platform / signupIpHash to null when omitted', () => {
    const row = mapReferralToDbInsert({
      affiliateId: 'aff-1',
      affiliateCode: 'CREATOR',
      userId: 'user-1',
      attributionStatus: 'pending',
      signupDate: '2026-04-17',
      windowEnd: '2026-04-24',
    } as any)
    expect(row.click_id).toBeNull()
    expect(row.platform).toBeNull()
    expect(row.signup_ip_hash).toBeNull()
  })

  it('fromDb produces the AffiliateReferral shape (no createdAt — interface omits it)', () => {
    const dbRow: any = {
      id: 'ref-1',
      affiliate_id: 'aff-1',
      affiliate_code: 'CREATOR',
      user_id: 'user-1',
      click_id: 'click-1',
      attribution_status: 'pending',
      signup_date: '2026-04-17',
      window_end: '2026-04-24',
      converted_at: null,
      platform: 'web',
      signup_ip_hash: 'ip-hash',
      created_at: '2026-04-17T00:00:00Z',
    }
    const r = mapReferralFromDb(dbRow)
    expect(r.id).toBe('ref-1')
    expect(r.affiliateId).toBe('aff-1')
    expect(r.userId).toBe('user-1')
    expect(r.clickId).toBe('click-1')
    expect(r.attributionStatus).toBe('pending')
    expect(r.signupDate).toBe('2026-04-17')
    expect(r.windowEnd).toBe('2026-04-24')
    expect(r.platform).toBe('web')
    expect(r.signupIpHash).toBe('ip-hash')
    expect(r.convertedAt).toBeNull()
    // AffiliateReferral interface intentionally omits createdAt
    expect((r as any).createdAt).toBeUndefined()
  })
})

// ── Commission ──────────────────────────────────────────────────────────
describe('mappers — Commission round-trip', () => {
  const input = {
    affiliateId: 'aff-1',
    affiliateCode: 'CREATOR',
    userId: 'user-1',
    referralId: 'ref-1',
    paymentAmount: 1000,
    stripeFee: 50,
    netAmount: 950,
    commissionRate: 0.15,
    commissionBrl: 142.5,
    fixedFeeBrl: 5,
    totalBrl: 147.5,
    paymentType: 'monthly' as const,
    status: 'pending' as const,
    paymentPeriodStart: null,
    paymentPeriodEnd: null,
    isRetroactive: false,
  }

  it('toInsert maps all required fields and defaults fixedFeeBrl', () => {
    const row = mapCommissionToDbInsert(input)
    expect(row.affiliate_id).toBe('aff-1')
    expect(row.affiliate_code).toBe('CREATOR')
    expect(row.user_id).toBe('user-1')
    expect(row.referral_id).toBe('ref-1')
    expect(row.payment_amount).toBe(1000)
    expect(row.stripe_fee).toBe(50)
    expect(row.net_amount).toBe(950)
    expect(row.commission_rate).toBe(0.15)
    expect(row.commission_brl).toBe(142.5)
    expect(row.fixed_fee_brl).toBe(5)
    expect(row.total_brl).toBe(147.5)
    expect(row.payment_type).toBe('monthly')
    expect(row.status).toBe('pending')

    const without = mapCommissionToDbInsert({ ...input, fixedFeeBrl: undefined } as any)
    expect(without.fixed_fee_brl).toBeNull()
  })

  it('fromDb coerces commission_rate string → number and defaults paymentPeriod fields', () => {
    const dbRow: any = {
      id: 'com-1',
      affiliate_id: 'aff-1',
      affiliate_code: 'CREATOR',
      user_id: 'user-1',
      referral_id: 'ref-1',
      payment_amount: 1000,
      stripe_fee: 50,
      net_amount: 950,
      commission_rate: '0.15',
      commission_brl: 142.5,
      fixed_fee_brl: 5,
      total_brl: 147.5,
      payment_type: 'monthly',
      status: 'pending',
      created_at: '2026-04-17T00:00:00Z',
    }
    const c = mapCommissionFromDb(dbRow)
    expect(c.commissionRate).toBe(0.15)
    expect(typeof c.commissionRate).toBe('number')
    expect(c.paymentPeriodStart).toBeNull()
    expect(c.paymentPeriodEnd).toBeNull()
    expect(c.isRetroactive).toBe(false)
    expect(c.createdAt).toBe('2026-04-17T00:00:00Z')
  })

  // Documented intentional behavior: commission rows referencing a deleted/masked
  // user account return userId as '' instead of null. Use cases consuming the
  // mapper must not rely on falsy === null.
  it('fromDb masks null user_id as empty string (intentional behavior)', () => {
    const dbRow: any = {
      id: 'com-2',
      affiliate_id: 'aff-1',
      affiliate_code: 'CREATOR',
      user_id: null,
      referral_id: 'ref-1',
      payment_amount: 1000,
      stripe_fee: 50,
      net_amount: 950,
      commission_rate: '0.15',
      commission_brl: 142.5,
      fixed_fee_brl: 5,
      total_brl: 147.5,
      payment_type: 'monthly',
      status: 'pending',
      created_at: '2026-04-17T00:00:00Z',
    }
    expect(mapCommissionFromDb(dbRow).userId).toBe('')
  })
})

// ── Payout ──────────────────────────────────────────────────────────────
describe('mappers — Payout round-trip', () => {
  it('toInsert preserves commission_ids array and defaults all optional meta to null', () => {
    const row = mapPayoutToDbInsert({
      affiliateId: 'aff-1',
      affiliateCode: 'CREATOR',
      totalBrl: 500,
      commissionIds: ['c1', 'c2', 'c3'],
      status: 'pending',
    } as any)
    expect(row).toEqual({
      affiliate_id: 'aff-1',
      affiliate_code: 'CREATOR',
      total_brl: 500,
      commission_ids: ['c1', 'c2', 'c3'],
      pix_key_id: null,
      pix_key_value: null,
      pix_key_type: null,
      status: 'pending',
      reviewed_at: null,
      completed_at: null,
      admin_notes: null,
      tax_id: null,
      tax_id_type: null,
    })
  })

  it('toInsert preserves PIX + tax fields when supplied', () => {
    const row = mapPayoutToDbInsert({
      affiliateId: 'aff-1',
      affiliateCode: 'CREATOR',
      totalBrl: 500,
      commissionIds: ['c1'],
      pixKeyId: 'pix-1',
      pixKeyValue: 'jane@example.com',
      pixKeyType: 'email' as const,
      status: 'approved' as const,
      reviewedAt: '2026-04-17T00:00:00Z',
      completedAt: null,
      adminNotes: 'OK',
      taxId: '12345678900',
      taxIdType: 'cpf' as const,
    } as any)
    expect(row.pix_key_id).toBe('pix-1')
    expect(row.pix_key_value).toBe('jane@example.com')
    expect(row.pix_key_type).toBe('email')
    expect(row.reviewed_at).toBe('2026-04-17T00:00:00Z')
    expect(row.admin_notes).toBe('OK')
    expect(row.tax_id).toBe('12345678900')
    expect(row.tax_id_type).toBe('cpf')
  })

  it('fromDb maps all fields and defaults commission_ids null → []', () => {
    const dbRow: any = {
      id: 'pay-1',
      affiliate_id: 'aff-1',
      affiliate_code: 'CREATOR',
      total_brl: 500,
      commission_ids: null,
      pix_key_id: 'pix-1',
      pix_key_value: 'jane@example.com',
      pix_key_type: 'email',
      status: 'pending',
      requested_at: '2026-04-17T00:00:00Z',
      reviewed_at: null,
      completed_at: null,
      admin_notes: null,
      tax_id: '123',
      tax_id_type: 'cpf',
    }
    const p = mapPayoutFromDb(dbRow)
    expect(p.id).toBe('pay-1')
    expect(p.affiliateId).toBe('aff-1')
    expect(p.totalBrl).toBe(500)
    expect(p.commissionIds).toEqual([])
    expect(p.pixKeyId).toBe('pix-1')
    expect(p.pixKeyValue).toBe('jane@example.com')
    expect(p.pixKeyType).toBe('email')
    expect(p.requestedAt).toBe('2026-04-17T00:00:00Z')
    expect(p.taxIdType).toBe('cpf')
  })
})

// ── PIX key ─────────────────────────────────────────────────────────────
describe('mappers — PixKey round-trip', () => {
  it('toInsert preserves required fields and defaults label to null', () => {
    const row = mapPixKeyToDbInsert({
      affiliateId: 'aff-1',
      keyType: 'email' as const,
      keyValue: 'jane@example.com',
      keyDisplay: 'jane@***',
      isDefault: true,
    } as any)
    expect(row).toEqual({
      affiliate_id: 'aff-1',
      key_type: 'email',
      key_value: 'jane@example.com',
      key_display: 'jane@***',
      is_default: true,
      label: null,
    })
  })

  it('toInsert preserves label when provided', () => {
    const row = mapPixKeyToDbInsert({
      affiliateId: 'aff-1',
      keyType: 'cpf' as const,
      keyValue: '12345678900',
      keyDisplay: '123.***.***-00',
      isDefault: false,
      label: 'Personal',
    } as any)
    expect(row.label).toBe('Personal')
    expect(row.key_type).toBe('cpf')
    expect(row.is_default).toBe(false)
  })

  it('fromDb produces the AffiliatePixKey shape', () => {
    const dbRow: any = {
      id: 'pix-1',
      affiliate_id: 'aff-1',
      key_type: 'email',
      key_value: 'jane@example.com',
      key_display: 'jane@***',
      is_default: true,
      label: 'Personal',
      created_at: '2026-04-17T00:00:00Z',
      updated_at: '2026-04-17T00:00:00Z',
    }
    const k = mapPixKeyFromDb(dbRow)
    expect(k.id).toBe('pix-1')
    expect(k.affiliateId).toBe('aff-1')
    expect(k.keyType).toBe('email')
    expect(k.keyValue).toBe('jane@example.com')
    expect(k.keyDisplay).toBe('jane@***')
    expect(k.isDefault).toBe(true)
    expect(k.label).toBe('Personal')
    expect(k.createdAt).toBe('2026-04-17T00:00:00Z')
    // updated_at intentionally not exposed by interface
    expect((k as any).updatedAt).toBeUndefined()
  })
})

// ── Content submission ──────────────────────────────────────────────────
describe('mappers — ContentSubmission round-trip', () => {
  it('toInsert preserves required fields and defaults all optionals to null', () => {
    const row = mapContentSubmissionToDbInsert({
      affiliateId: 'aff-1',
      platform: 'youtube' as const,
      contentType: 'video' as const,
      url: 'https://youtu.be/x',
    } as any)
    expect(row).toEqual({
      affiliate_id: 'aff-1',
      platform: 'youtube',
      content_type: 'video',
      url: 'https://youtu.be/x',
      title: null,
      description: null,
      posted_at: null,
    })
  })

  it('toInsert preserves title/description/postedAt when provided', () => {
    const row = mapContentSubmissionToDbInsert({
      affiliateId: 'aff-1',
      platform: 'instagram' as const,
      contentType: 'post' as const,
      url: 'https://ig.com/p/abc',
      title: 'Spring drop',
      description: 'BrightTale collab',
      postedAt: '2026-04-17T00:00:00Z',
    } as any)
    expect(row.title).toBe('Spring drop')
    expect(row.description).toBe('BrightTale collab')
    expect(row.posted_at).toBe('2026-04-17T00:00:00Z')
    expect(row.platform).toBe('instagram')
    expect(row.content_type).toBe('post')
  })

  it('fromDb maps all fields including review_notes / status', () => {
    const dbRow: any = {
      id: 'sub-1',
      affiliate_id: 'aff-1',
      platform: 'youtube',
      content_type: 'video',
      url: 'https://youtu.be/x',
      title: 'Spring drop',
      description: 'BrightTale collab',
      status: 'approved',
      review_notes: 'Looks great',
      posted_at: '2026-04-17T00:00:00Z',
      created_at: '2026-04-17T00:00:00Z',
      updated_at: '2026-04-17T00:00:00Z',
    }
    const s = mapContentSubmissionFromDb(dbRow)
    expect(s.id).toBe('sub-1')
    expect(s.affiliateId).toBe('aff-1')
    expect(s.platform).toBe('youtube')
    expect(s.contentType).toBe('video')
    expect(s.url).toBe('https://youtu.be/x')
    expect(s.title).toBe('Spring drop')
    expect(s.description).toBe('BrightTale collab')
    expect(s.status).toBe('approved')
    expect(s.reviewNotes).toBe('Looks great')
    expect(s.postedAt).toBe('2026-04-17T00:00:00Z')
    expect(s.createdAt).toBe('2026-04-17T00:00:00Z')
  })
})

// ── Contract history ────────────────────────────────────────────────────
describe('mappers — ContractHistory round-trip', () => {
  it('toInsert with all fields populated maps every column without dropping any', () => {
    const row = mapContractHistoryToDbInsert({
      affiliateId: 'aff-1',
      action: 'tier_change' as const,
      oldTier: 'standard',
      newTier: 'premium',
      oldCommissionRate: 0.15,
      newCommissionRate: 0.2,
      oldFixedFeeBrl: 0,
      newFixedFeeBrl: 5,
      oldStatus: 'active',
      newStatus: 'active',
      performedBy: 'admin-1',
      notes: 'Annual review bump',
      contractVersion: 2,
      acceptedIp: '1.2.3.4',
      acceptedUa: 'Mozilla/5.0',
    } as any)
    expect(row).toEqual({
      affiliate_id: 'aff-1',
      action: 'tier_change',
      old_tier: 'standard',
      new_tier: 'premium',
      old_commission_rate: 0.15,
      new_commission_rate: 0.2,
      old_fixed_fee_brl: 0,
      new_fixed_fee_brl: 5,
      old_status: 'active',
      new_status: 'active',
      performed_by: 'admin-1',
      notes: 'Annual review bump',
      contract_version: 2,
      accepted_ip: '1.2.3.4',
      accepted_ua: 'Mozilla/5.0',
    })
  })

  it('toInsert with only required fields defaults all 13 optional columns to null', () => {
    const row = mapContractHistoryToDbInsert({
      affiliateId: 'aff-1',
      action: 'created' as const,
    } as any)
    expect(row).toEqual({
      affiliate_id: 'aff-1',
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

  it('fromDb coerces commission_rate strings → numbers (and preserves null)', () => {
    const dbRow: any = {
      id: 'hist-1',
      affiliate_id: 'aff-1',
      action: 'tier_change',
      old_tier: 'standard',
      new_tier: 'premium',
      old_commission_rate: '0.15',
      new_commission_rate: '0.20',
      old_fixed_fee_brl: 0,
      new_fixed_fee_brl: 5,
      old_status: 'active',
      new_status: 'active',
      performed_by: 'admin-1',
      notes: null,
      contract_version: 2,
      accepted_ip: null,
      accepted_ua: null,
      created_at: '2026-04-17T00:00:00Z',
    }
    const h = mapContractHistoryFromDb(dbRow)
    expect(h.id).toBe('hist-1')
    expect(h.affiliateId).toBe('aff-1')
    expect(h.action).toBe('tier_change')
    expect(h.oldTier).toBe('standard')
    expect(h.newTier).toBe('premium')
    expect(h.oldCommissionRate).toBe(0.15)
    expect(h.newCommissionRate).toBe(0.2)
    expect(typeof h.oldCommissionRate).toBe('number')
    expect(typeof h.newCommissionRate).toBe('number')
    expect(h.oldFixedFeeBrl).toBe(0)
    expect(h.newFixedFeeBrl).toBe(5)
    expect(h.performedBy).toBe('admin-1')
    expect(h.contractVersion).toBe(2)
    expect(h.createdAt).toBe('2026-04-17T00:00:00Z')

    const nullRow = { ...dbRow, old_commission_rate: null, new_commission_rate: null }
    const nh = mapContractHistoryFromDb(nullRow)
    expect(nh.oldCommissionRate).toBeNull()
    expect(nh.newCommissionRate).toBeNull()
  })
})
