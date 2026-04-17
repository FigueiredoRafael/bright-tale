import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createProposalsRepo(_sb: SupabaseClient<Database>) {
  return {
    async proposeContractChange(_id: string, _input: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async cancelProposal(_id: string): Promise<never> { throw new Error('not_impl_2a1') },
    async acceptProposal(_id: string): Promise<never> { throw new Error('not_impl_2a1') },
    async rejectProposal(_id: string): Promise<never> { throw new Error('not_impl_2a1') },
  }
}
