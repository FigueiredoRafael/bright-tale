import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapReferralFromDb, mapReferralToDbInsert } from './mappers'

export function createReferralsRepo(sb: SupabaseClient<Database>) {
  return {
    async incrementReferrals(affiliateId: string): Promise<void> {
      const { error } = await sb.rpc('increment_affiliate_referrals', { aff_id: affiliateId })
      if (error) throw error
    },

    async createReferral(input: Parameters<IAffiliateRepository['createReferral']>[0]) {
      const row = mapReferralToDbInsert(input)
      const { data, error } = await sb.from('affiliate_referrals').insert(row).select().single()
      if (error) throw error
      return mapReferralFromDb(data)
    },

    async findReferralByUserId(userId: string) {
      const { data } = await sb
        .from('affiliate_referrals')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      return data ? mapReferralFromDb(data) : null
    },

    async listReferralsByAffiliate(
      affiliateId: string,
      options?: Parameters<IAffiliateRepository['listReferralsByAffiliate']>[1],
    ) {
      let q = sb.from('affiliate_referrals').select('*').eq('affiliate_id', affiliateId)
      if (options?.limit) q = q.limit(options.limit)
      // `offset && limit` was a bug: offset=0 is falsy so page 0 was silently
      // dropped. Use explicit undefined check.
      if (options?.offset !== undefined && options?.limit) {
        q = q.range(options.offset, options.offset + options.limit - 1)
      }
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapReferralFromDb)
    },

    async expirePendingReferrals(today: string): Promise<number> {
      // Per package interface: returns Promise<number>. Package's SQL model stores
      // window_end per referral (default NOW() + 12 months); expire when past it.
      const { data, error } = await sb
        .from('affiliate_referrals')
        .update({ attribution_status: 'expired' })
        .eq('attribution_status', 'pending_contract')
        .lt('window_end', today)
        .select('id')
      if (error) throw error
      return data?.length ?? 0
    },
  }
}
