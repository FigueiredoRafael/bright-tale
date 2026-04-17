import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapContractHistoryFromDb, mapContractHistoryToDbInsert } from './mappers'

export function createHistoryRepo(sb: SupabaseClient<Database>) {
  return {
    async addContractHistory(entry: Parameters<IAffiliateRepository['addContractHistory']>[0]): Promise<void> {
      const row = mapContractHistoryToDbInsert(entry)
      const { error } = await sb.from('affiliate_contract_history').insert(row)
      if (error) throw error
    },

    async getContractHistory(affiliateId: string) {
      const { data, error } = await sb
        .from('affiliate_contract_history')
        .select('*')
        .eq('affiliate_id', affiliateId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapContractHistoryFromDb)
    },
  }
}
