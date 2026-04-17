import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createQueryRepo(_sb: SupabaseClient<Database>) {
  return {
    async findById(_id: string): Promise<never> { throw new Error('not_impl_2a1') },
    async findByCode(_code: string): Promise<never> { throw new Error('not_impl_2a1') },
    async findByUserId(_userId: string): Promise<never> { throw new Error('not_impl_2a1') },
    async findByEmail(_email: string): Promise<never> { throw new Error('not_impl_2a1') },
    async isCodeTaken(_code: string): Promise<never> { throw new Error('not_impl_2a1') },
    async create(_input: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async createInternal(_input: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async linkUserId(_affiliateId: string, _userId: string): Promise<never> { throw new Error('not_impl_2a1') },
    async listAll(_options?: unknown): Promise<never> { throw new Error('not_impl_2a1') },
  }
}
