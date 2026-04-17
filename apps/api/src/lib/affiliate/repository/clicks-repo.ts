import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { IAffiliateRepository } from '@tn-figueiredo/affiliate'
import { mapClickFromDb, mapClickToDbInsert } from './mappers'

export function createClicksRepo(sb: SupabaseClient<Database>) {
  return {
    async incrementClicks(affiliateId: string): Promise<void> {
      // Atomic counter; column total_clicks updated via PG function (race-safe).
      const { error } = await sb.rpc('increment_affiliate_clicks', { aff_id: affiliateId })
      if (error) throw error
    },

    async createClick(input: Parameters<IAffiliateRepository['createClick']>[0]) {
      const row = mapClickToDbInsert(input)
      const { data, error } = await sb.from('affiliate_clicks').insert(row).select().single()
      if (error) throw error
      return mapClickFromDb(data)
    },

    async markClickConverted(clickId: string, userId: string): Promise<void> {
      const { error } = await sb
        .from('affiliate_clicks')
        .update({ converted_user_id: userId, converted_at: new Date().toISOString() })
        .eq('id', clickId)
      if (error) throw error
    },

    async getClicksByPlatform(affiliateId: string, days?: number) {
      const since = days
        ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        : '1970-01-01T00:00:00Z'
      const { data, error } = await sb
        .from('affiliate_clicks')
        .select('source_platform, converted_at')
        .eq('affiliate_id', affiliateId)
        .gte('created_at', since)
      if (error) throw error
      const grouped = new Map<string, { clicks: number; conversions: number }>()
      for (const c of data ?? []) {
        const key = c.source_platform ?? 'unknown'
        const cur = grouped.get(key) ?? { clicks: 0, conversions: 0 }
        cur.clicks += 1
        if (c.converted_at) cur.conversions += 1
        grouped.set(key, cur)
      }
      return Array.from(grouped.entries()).map(([sourcePlatform, v]) => ({ sourcePlatform, ...v }))
    },
  }
}
