import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createContentRepo(_sb: SupabaseClient<Database>) {
  return {
    async submitContent(_input: unknown): Promise<never> { throw new Error('not_impl_2a1') },
    async reviewContent(_submissionId: string, _status: 'approved' | 'rejected', _reviewNotes?: string): Promise<never> { throw new Error('not_impl_2a1') },
    async listContentSubmissions(_affiliateId: string): Promise<never> { throw new Error('not_impl_2a1') },
  }
}
