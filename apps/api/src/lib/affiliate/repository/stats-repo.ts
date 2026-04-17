import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createStatsRepo(_sb: SupabaseClient<Database>) {
  return {
    async getStats(_affiliateId: string): Promise<never> { throw new Error('not_impl_2a1') },
    async getPendingContractsCount(): Promise<never> { throw new Error('not_impl_2a1') },
  }
}
