import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createCommissionsRepo(_sb: SupabaseClient<Database>) {
  return {
    async incrementConversions(_affiliateId: string, _earningsBrl: number): Promise<never> { throw new Error('not_impl_2a1') },
    async createCommission(_input: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async listPendingCommissions(_affiliateId: string): Promise<never> { throw new Error('not_impl_2a1') },
    async markCommissionsPaid(_commissionIds: string[], _payoutId: string): Promise<never> { throw new Error('not_impl_2a1') },
  }
}
