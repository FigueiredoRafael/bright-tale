import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapPayoutFromDb, mapPayoutToDbInsert } from './mappers'

export function createPayoutsRepo(sb: SupabaseClient<Database>) {
  return {
    async createPayout(input: Parameters<IAffiliateRepository['createPayout']>[0]) {
      const row = mapPayoutToDbInsert(input)
      const { data, error } = await sb.from('affiliate_payouts').insert(row).select().single()
      if (error) throw error
      return mapPayoutFromDb(data)
    },

    async findPayoutById(id: string) {
      const { data } = await sb.from('affiliate_payouts').select('*').eq('id', id).maybeSingle()
      return data ? mapPayoutFromDb(data) : null
    },

    async updatePayoutStatus(
      id: string,
      status: Parameters<IAffiliateRepository['updatePayoutStatus']>[1],
      meta?: Parameters<IAffiliateRepository['updatePayoutStatus']>[2],
    ) {
      type PayoutUpdate = Database['public']['Tables']['affiliate_payouts']['Update']
      const fields: PayoutUpdate = { status }
      if (meta?.reviewedAt) fields.reviewed_at = meta.reviewedAt
      if (meta?.completedAt) fields.completed_at = meta.completedAt
      if (meta?.adminNotes !== undefined) fields.admin_notes = meta.adminNotes
      const { data, error } = await sb
        .from('affiliate_payouts')
        .update(fields)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return mapPayoutFromDb(data)
    },

    async listPayouts(options?: Parameters<IAffiliateRepository['listPayouts']>[0]) {
      let q = sb.from('affiliate_payouts').select('*')
      if (options?.status) q = q.eq('status', options.status)
      if (options?.affiliateId) q = q.eq('affiliate_id', options.affiliateId)
      if (options?.limit) q = q.limit(options.limit)
      // `offset && limit` was a bug: offset=0 is falsy so page 0 was silently
      // dropped. Use explicit undefined check.
      if (options?.offset !== undefined && options?.limit) {
        q = q.range(options.offset, options.offset + options.limit - 1)
      }
      const { data, error } = await q.order('requested_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapPayoutFromDb)
    },
  }
}
