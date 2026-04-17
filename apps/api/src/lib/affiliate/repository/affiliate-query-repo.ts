import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapAffiliateFromDb } from './mappers'

export function createQueryRepo(sb: SupabaseClient<Database>) {
  return {
    async findById(id: string) {
      const { data } = await sb.from('affiliates').select('*').eq('id', id).maybeSingle()
      return data ? mapAffiliateFromDb(data) : null
    },

    async findByCode(code: string) {
      const { data } = await sb.from('affiliates').select('*').eq('code', code).maybeSingle()
      return data ? mapAffiliateFromDb(data) : null
    },

    async findByUserId(userId: string) {
      const { data } = await sb.from('affiliates').select('*').eq('user_id', userId).maybeSingle()
      return data ? mapAffiliateFromDb(data) : null
    },

    async findByEmail(email: string) {
      const { data } = await sb.from('affiliates').select('*').eq('email', email).maybeSingle()
      return data ? mapAffiliateFromDb(data) : null
    },

    async isCodeTaken(code: string): Promise<boolean> {
      const { data } = await sb.from('affiliates').select('id').eq('code', code).maybeSingle()
      return data !== null
    },

    async create(input: Parameters<IAffiliateRepository['create']>[0]) {
      const row = {
        code: input.code,
        name: input.name,
        email: input.email,
        channel_name: input.channelName ?? null,
        channel_url: input.channelUrl ?? null,
        channel_platform: input.channelPlatform ?? null,
        social_links: (input.socialLinks ?? []) as never,
        subscribers_count: input.subscribersCount ?? null,
        tax_id: input.taxId ?? null,
        notes: input.notes ?? null,
      }
      const { data, error } = await sb.from('affiliates').insert(row).select().single()
      if (error) throw error
      return mapAffiliateFromDb(data)
    },

    async createInternal(input: Parameters<IAffiliateRepository['createInternal']>[0]) {
      const row = {
        code: input.code,
        name: input.name ?? 'Internal',
        email: input.email,
        affiliate_type: 'internal',
        status: 'active',
      }
      const { data, error } = await sb.from('affiliates').insert(row).select().single()
      if (error) throw error
      return mapAffiliateFromDb(data)
    },

    async linkUserId(affiliateId: string, userId: string) {
      const { data, error } = await sb
        .from('affiliates')
        .update({ user_id: userId })
        .eq('id', affiliateId)
        .select()
        .single()
      if (error) throw error
      return mapAffiliateFromDb(data)
    },

    async listAll(options?: Parameters<IAffiliateRepository['listAll']>[0]) {
      let q = sb.from('affiliates').select('*')
      if (options?.status) q = q.eq('status', options.status)
      if (options?.limit) q = q.limit(options.limit)
      if (options?.offset && options?.limit) {
        q = q.range(options.offset, options.offset + options.limit - 1)
      }
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      // Affiliate (full) is wider than AffiliateAdminSummary; cast through unknown
      // because TS's structural assignability complains about extra-property width.
      return (data ?? []).map(mapAffiliateFromDb) as unknown as Awaited<ReturnType<IAffiliateRepository['listAll']>>
    },
  }
}
