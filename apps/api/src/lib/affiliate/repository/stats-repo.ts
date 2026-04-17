import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'

export function createStatsRepo(sb: SupabaseClient<Database>) {
  return {
    async getStats(affiliateId: string) {
      // Aggregates affiliate_payouts.total_brl GROUP BY status.
      // 'pending' + 'approved' + 'processing' = pendingPayoutBrl
      // 'completed' = paidPayoutBrl
      const { data, error } = await sb
        .from('affiliate_payouts')
        .select('status, total_brl')
        .eq('affiliate_id', affiliateId)
      if (error) throw error
      let pendingPayoutBrl = 0
      let paidPayoutBrl = 0
      for (const p of data ?? []) {
        if (p.status === 'completed') paidPayoutBrl += p.total_brl
        else if (p.status === 'pending' || p.status === 'approved' || p.status === 'processing') {
          pendingPayoutBrl += p.total_brl
        }
      }
      return { pendingPayoutBrl, paidPayoutBrl }
    },

    async getPendingContractsCount(): Promise<number> {
      const { count, error } = await sb
        .from('affiliates')
        .select('id', { count: 'exact', head: true })
        .not('proposal_created_at', 'is', null)
      if (error) throw error
      return count ?? 0
    },
  }
}
