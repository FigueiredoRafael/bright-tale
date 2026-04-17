import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { Affiliate, IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapAffiliateFromDb, type DbAffiliate } from './mappers'

export function createLifecycleRepo(sb: SupabaseClient<Database>) {
  async function update(id: string, fields: Partial<DbAffiliate>): Promise<Affiliate> {
    const { data, error } = await sb
      .from('affiliates')
      .update(fields)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return mapAffiliateFromDb(data)
  }

  return {
    async approve(id: string, input: Parameters<IAffiliateRepository['approve']>[1]) {
      const fields: Partial<DbAffiliate> = {
        status: 'approved',
        tier: input.tier,
        commission_rate: input.commissionRate,
        fixed_fee_brl: input.fixedFeeBrl ?? null,
        contract_start_date: input.contractStartDate,
        contract_end_date: input.contractEndDate,
        contract_version: input.contractVersion,
      }
      return update(id, fields)
    },

    async pause(id: string, _options?: Parameters<IAffiliateRepository['pause']>[1]) {
      return update(id, { status: 'paused' })
    },

    async terminate(id: string) {
      return update(id, { status: 'terminated' })
    },

    async updateProfile(affiliateId: string, input: Parameters<IAffiliateRepository['updateProfile']>[1]) {
      const fields: Partial<DbAffiliate> = {}
      if (input.channelName !== undefined) fields.channel_name = input.channelName
      if (input.channelUrl !== undefined) fields.channel_url = input.channelUrl
      if (input.channelPlatform !== undefined) fields.channel_platform = input.channelPlatform
      if (input.socialLinks !== undefined) fields.social_links = input.socialLinks as never
      if (input.subscribersCount !== undefined) fields.subscribers_count = input.subscribersCount
      if (input.notes !== undefined) fields.notes = input.notes
      return update(affiliateId, fields)
    },

    async updateContract(affiliateId: string, contractStartDate: string, contractEndDate: string) {
      return update(affiliateId, {
        contract_start_date: contractStartDate,
        contract_end_date: contractEndDate,
      })
    },

    async activateAfterContractAcceptance(id: string) {
      return update(id, {
        status: 'active',
        contract_accepted_at: new Date().toISOString(),
      })
    },
  }
}
