import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createPixRepo(_sb: SupabaseClient<Database>) {
  return {
    async addPixKey(_input: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async listPixKeys(_affiliateId: string): Promise<never> { throw new Error('not_impl_2a1') },
    async setDefaultPixKey(_affiliateId: string, _pixKeyId: string): Promise<never> { throw new Error('not_impl_2a1') },
    async deletePixKey(_pixKeyId: string): Promise<never> { throw new Error('not_impl_2a1') },
  }
}
