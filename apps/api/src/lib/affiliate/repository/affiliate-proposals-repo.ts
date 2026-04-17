import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { Affiliate, IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapAffiliateFromDb, type DbAffiliate } from './mappers'

export function createProposalsRepo(sb: SupabaseClient<Database>) {
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
    async proposeContractChange(
      id: string,
      input: Parameters<IAffiliateRepository['proposeContractChange']>[1],
    ) {
      // Status stays 'active' (no pending_proposal status). Use case orchestrates
      // addContractHistory + email separately.
      return update(id, {
        proposed_tier: input.proposedTier ?? null,
        proposed_commission_rate: input.proposedCommissionRate ?? null,
        proposed_fixed_fee_brl: input.proposedFixedFeeBrl ?? null,
        proposal_notes: input.notes ?? null,
        proposal_created_at: new Date().toISOString(),
      })
    },

    async cancelProposal(id: string) {
      return update(id, {
        proposed_tier: null,
        proposed_commission_rate: null,
        proposed_fixed_fee_brl: null,
        proposal_notes: null,
        proposal_created_at: null,
      })
    },

    async acceptProposal(id: string) {
      // Clears proposal columns. Use case calls updateContract/updateProfile
      // separately to apply the proposed values, then calls
      // activateAfterContractAcceptance to set status='active'.
      return update(id, {
        proposed_tier: null,
        proposed_commission_rate: null,
        proposed_fixed_fee_brl: null,
        proposal_notes: null,
        proposal_created_at: null,
      })
    },

    async rejectProposal(id: string) {
      return update(id, {
        proposed_tier: null,
        proposed_commission_rate: null,
        proposed_fixed_fee_brl: null,
        proposal_notes: null,
        proposal_created_at: null,
      })
    },
  }
}
