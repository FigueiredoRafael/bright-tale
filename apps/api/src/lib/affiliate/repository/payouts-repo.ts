import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createPayoutsRepo(_sb: SupabaseClient<Database>) {
  return {
    async createPayout(_input: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async findPayoutById(_id: string): Promise<never> { throw new Error('not_impl_2a1') },
    async updatePayoutStatus(_id: string, _status: unknown, _meta?: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async listPayouts(_options?: unknown): Promise<never> { throw new Error('not_impl_2a1') },
  }
}
