import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapCommissionFromDb, mapCommissionToDbInsert } from './mappers'

export function createCommissionsRepo(sb: SupabaseClient<Database>) {
  return {
    async incrementConversions(affiliateId: string, earningsBrl: number): Promise<void> {
      const { error } = await sb.rpc('increment_affiliate_conversions', {
        aff_id: affiliateId,
        earnings_brl: earningsBrl,
      })
      if (error) throw error
    },

    async createCommission(input: Parameters<IAffiliateRepository['createCommission']>[0]) {
      const row = mapCommissionToDbInsert(input)
      const { data, error } = await sb.from('affiliate_commissions').insert(row).select().single()
      if (error) throw error
      return mapCommissionFromDb(data)
    },

    async listPendingCommissions(affiliateId: string) {
      const { data, error } = await sb
        .from('affiliate_commissions')
        .select('*')
        .eq('affiliate_id', affiliateId)
        .eq('status', 'pending')
      if (error) throw error
      return (data ?? []).map(mapCommissionFromDb)
    },

    async markCommissionsPaid(commissionIds: string[], payoutId: string): Promise<void> {
      const { error } = await sb
        .from('affiliate_commissions')
        .update({ status: 'paid', payout_id: payoutId })
        .in('id', commissionIds)
      if (error) throw error
    },
  }
}
