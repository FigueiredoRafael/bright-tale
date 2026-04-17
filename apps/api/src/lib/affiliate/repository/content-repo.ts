import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapContentSubmissionFromDb, mapContentSubmissionToDbInsert } from './mappers'

export function createContentRepo(sb: SupabaseClient<Database>) {
  return {
    async submitContent(input: Parameters<IAffiliateRepository['submitContent']>[0]) {
      const row = mapContentSubmissionToDbInsert(input)
      const { data, error } = await sb
        .from('affiliate_content_submissions')
        .insert(row)
        .select()
        .single()
      if (error) throw error
      return mapContentSubmissionFromDb(data)
    },

    async reviewContent(submissionId: string, status: 'approved' | 'rejected', reviewNotes?: string) {
      const { data, error } = await sb
        .from('affiliate_content_submissions')
        .update({ status, review_notes: reviewNotes ?? null })
        .eq('id', submissionId)
        .select()
        .single()
      if (error) throw error
      return mapContentSubmissionFromDb(data)
    },

    async listContentSubmissions(affiliateId: string) {
      const { data, error } = await sb
        .from('affiliate_content_submissions')
        .select('*')
        .eq('affiliate_id', affiliateId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapContentSubmissionFromDb)
    },
  }
}
