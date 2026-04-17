import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapPixKeyFromDb, mapPixKeyToDbInsert } from './mappers'

export function createPixRepo(sb: SupabaseClient<Database>) {
  return {
    async addPixKey(input: Parameters<IAffiliateRepository['addPixKey']>[0]) {
      const row = mapPixKeyToDbInsert(input)
      const { data, error } = await sb.from('affiliate_pix_keys').insert(row).select().single()
      if (error) throw error
      return mapPixKeyFromDb(data)
    },

    async listPixKeys(affiliateId: string) {
      const { data, error } = await sb
        .from('affiliate_pix_keys')
        .select('*')
        .eq('affiliate_id', affiliateId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapPixKeyFromDb)
    },

    async setDefaultPixKey(affiliateId: string, pixKeyId: string): Promise<void> {
      // Two-step: unset all then set chosen. Tiny race window acceptable for MVP.
      await sb.from('affiliate_pix_keys').update({ is_default: false }).eq('affiliate_id', affiliateId)
      const { error } = await sb.from('affiliate_pix_keys').update({ is_default: true }).eq('id', pixKeyId)
      if (error) throw error
    },

    async deletePixKey(pixKeyId: string): Promise<void> {
      const { error } = await sb.from('affiliate_pix_keys').delete().eq('id', pixKeyId)
      if (error) throw error
    },
  }
}
