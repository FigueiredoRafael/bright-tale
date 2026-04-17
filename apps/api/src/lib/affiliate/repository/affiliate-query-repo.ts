import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { AffiliateAdminSummary, IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapAffiliateFromDb } from './mappers'

type DbAffiliate = Database['public']['Tables']['affiliates']['Row']

// Narrow projection — package's AffiliateAdminSummary intentionally omits
// taxId, knownIpHashes, notes, channelUrl, etc. Returning the full Affiliate
// shape would leak those fields to admin endpoints. Keep this in sync with
// the package's AffiliateAdminSummary interface (dist/fraud-admin-*.d.ts).
function mapAffiliateAdminSummaryFromDb(r: DbAffiliate): AffiliateAdminSummary {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    email: r.email,
    status: r.status as AffiliateAdminSummary['status'],
    tier: r.tier as AffiliateAdminSummary['tier'],
    commissionRate: Number(r.commission_rate),
    fixedFeeBrl: r.fixed_fee_brl,
    totalReferrals: r.total_referrals,
    totalClicks: r.total_clicks,
    totalConversions: r.total_conversions,
    totalEarningsBrl: r.total_earnings_brl,
    contractAcceptanceVersion: r.contract_acceptance_version,
    contractAcceptedAt: r.contract_accepted_at,
    contractEndDate: r.contract_end_date,
    affiliateType: r.affiliate_type as AffiliateAdminSummary['affiliateType'],
    createdAt: r.created_at,
  }
}

export function createQueryRepo(sb: SupabaseClient<Database>) {
  return {
    async findById(id: string) {
      const { data } = await sb.from('affiliates').select('*').eq('id', id).maybeSingle()
      return data ? mapAffiliateFromDb(data) : null
    },

    async findByCode(code: string) {
      const { data } = await sb.from('affiliates').select('*').eq('code', code).maybeSingle()
      return data ? mapAffiliateFromDb(data) : null
    },

    async findByUserId(userId: string) {
      const { data } = await sb.from('affiliates').select('*').eq('user_id', userId).maybeSingle()
      return data ? mapAffiliateFromDb(data) : null
    },

    async findByEmail(email: string) {
      const { data } = await sb.from('affiliates').select('*').eq('email', email).maybeSingle()
      return data ? mapAffiliateFromDb(data) : null
    },

    async isCodeTaken(code: string): Promise<boolean> {
      const { data } = await sb.from('affiliates').select('id').eq('code', code).maybeSingle()
      return data !== null
    },

    async create(input: Parameters<IAffiliateRepository['create']>[0]) {
      const row = {
        code: input.code,
        name: input.name,
        email: input.email,
        channel_name: input.channelName ?? null,
        channel_url: input.channelUrl ?? null,
        channel_platform: input.channelPlatform ?? null,
        social_links: (input.socialLinks ?? []) as never,
        subscribers_count: input.subscribersCount ?? null,
        tax_id: input.taxId ?? null,
        notes: input.notes ?? null,
      }
      const { data, error } = await sb.from('affiliates').insert(row).select().single()
      if (error) throw error
      return mapAffiliateFromDb(data)
    },

    async createInternal(input: Parameters<IAffiliateRepository['createInternal']>[0]) {
      const row = {
        code: input.code,
        name: input.name ?? 'Internal',
        email: input.email,
        affiliate_type: 'internal',
        status: 'active',
      }
      const { data, error } = await sb.from('affiliates').insert(row).select().single()
      if (error) throw error
      return mapAffiliateFromDb(data)
    },

    async linkUserId(affiliateId: string, userId: string) {
      const { data, error } = await sb
        .from('affiliates')
        .update({ user_id: userId })
        .eq('id', affiliateId)
        .select()
        .single()
      if (error) throw error
      return mapAffiliateFromDb(data)
    },

    async listAll(options?: Parameters<IAffiliateRepository['listAll']>[0]) {
      // Project columns to AffiliateAdminSummary shape — never SELECT *
      // (avoids leaking taxId, knownIpHashes, notes, channelUrl to admin UI).
      let q = sb
        .from('affiliates')
        .select(
          'id, code, name, email, status, tier, commission_rate, fixed_fee_brl, ' +
          'total_referrals, total_clicks, total_conversions, total_earnings_brl, ' +
          'contract_acceptance_version, contract_accepted_at, contract_end_date, ' +
          'affiliate_type, created_at',
        )
      if (options?.status) q = q.eq('status', options.status)
      if (options?.limit) q = q.limit(options.limit)
      if (options?.offset !== undefined && options?.limit) {
        q = q.range(options.offset, options.offset + options.limit - 1)
      }
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      // The narrow projection produces a typed-string select inference that
      // doesn't structurally match DbAffiliate. Pick only the columns we need
      // via unknown; the runtime row IS a subset of DbAffiliate.
      return ((data ?? []) as unknown as DbAffiliate[]).map(mapAffiliateAdminSummaryFromDb)
    },
  }
}
