import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createHistoryRepo(_sb: SupabaseClient<Database>) {
  return {
    async addContractHistory(_entry: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async getContractHistory(_affiliateId: string): Promise<never> { throw new Error('not_impl_2a1') },
  }
}
