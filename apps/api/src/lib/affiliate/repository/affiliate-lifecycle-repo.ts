import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createLifecycleRepo(_sb: SupabaseClient<Database>) {
  return {
    async approve(_id: string, _input: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async pause(_id: string, _options?: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async terminate(_id: string): Promise<never> { throw new Error('not_impl_2a1') },
    async updateProfile(_affiliateId: string, _input: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async updateContract(_affiliateId: string, _startDate: string, _endDate: string): Promise<never> { throw new Error('not_impl_2a1') },
    async activateAfterContractAcceptance(_id: string): Promise<never> { throw new Error('not_impl_2a1') },
  }
}
