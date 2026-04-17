import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createReferralsRepo(_sb: SupabaseClient<Database>) {
  return {
    async incrementReferrals(_affiliateId: string): Promise<never> { throw new Error('not_impl_2a1') },
    async createReferral(_input: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async findReferralByUserId(_userId: string): Promise<never> { throw new Error('not_impl_2a1') },
    async listReferralsByAffiliate(_affiliateId: string, _options?: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async expirePendingReferrals(_today: string): Promise<never> { throw new Error('not_impl_2a1') },
  }
}
