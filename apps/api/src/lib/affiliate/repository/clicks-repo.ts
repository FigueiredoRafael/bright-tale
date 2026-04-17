import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createClicksRepo(_sb: SupabaseClient<Database>) {
  return {
    async incrementClicks(_affiliateId: string): Promise<never> { throw new Error('not_impl_2a1') },
    async createClick(_input: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async markClickConverted(_clickId: string, _userId: string): Promise<never> { throw new Error('not_impl_2a1') },
    async getClicksByPlatform(_affiliateId: string, _days?: number): Promise<never> { throw new Error('not_impl_2a1') },
  }
}
