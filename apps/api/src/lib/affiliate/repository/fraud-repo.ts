import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createFraudRepo(_sb: SupabaseClient<Database>) {
  return {
    async listFraudFlags(_options?: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async listRiskScores(_options?: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async findFraudFlagById(_flagId: string): Promise<never> { throw new Error('not_impl_2a1') },
    async updateFraudFlagStatus(_flagId: string, _status: unknown, _notes?: string): Promise<never> { throw new Error('not_impl_2a1') },
  }
}
