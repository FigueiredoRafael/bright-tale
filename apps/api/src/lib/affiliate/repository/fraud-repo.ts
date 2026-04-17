import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@brighttale/shared/types/database'
import type { AffiliateFraudFlag, AffiliateRiskScore, IAffiliateRepository } from '@tn-figueiredo/affiliate'

type DbFraudFlag = Database['public']['Tables']['affiliate_fraud_flags']['Row']
type DbRiskScore = Database['public']['Tables']['affiliate_risk_scores']['Row']

function mapFraudFlagFromDb(r: DbFraudFlag): AffiliateFraudFlag {
  return {
    id: r.id,
    affiliateId: r.affiliate_id,
    referralId: r.referral_id,
    flagType: r.flag_type as AffiliateFraudFlag['flagType'],
    severity: r.severity as AffiliateFraudFlag['severity'],
    details: (r.details as Record<string, unknown>) ?? {},
    status: r.status as AffiliateFraudFlag['status'],
    adminNotes: r.admin_notes,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
  }
}

function mapRiskScoreFromDb(r: DbRiskScore): AffiliateRiskScore {
  return {
    affiliateId: r.affiliate_id,
    score: r.score,
    flagCount: r.flag_count,
    updatedAt: r.updated_at,
  }
}

export function createFraudRepo(sb: SupabaseClient<Database>) {
  return {
    async listFraudFlags(options?: Parameters<IAffiliateRepository['listFraudFlags']>[0]) {
      let q = sb.from('affiliate_fraud_flags').select('*', { count: 'exact' })
      if (options?.status) q = q.eq('status', options.status)
      if (options?.severity) q = q.eq('severity', options.severity)
      if (options?.affiliateId) q = q.eq('affiliate_id', options.affiliateId)
      const perPage = options?.perPage ?? 50
      const page = options?.page ?? 1
      q = q.range((page - 1) * perPage, page * perPage - 1)
      const { data, count, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      return { items: (data ?? []).map(mapFraudFlagFromDb), total: count ?? 0 }
    },

    async listRiskScores(options?: Parameters<IAffiliateRepository['listRiskScores']>[0]) {
      let q = sb.from('affiliate_risk_scores').select('*')
      if (options?.minScore !== undefined) q = q.gte('score', options.minScore)
      const { data, error } = await q.order('score', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapRiskScoreFromDb)
    },

    async findFraudFlagById(flagId: string) {
      const { data } = await sb.from('affiliate_fraud_flags').select('*').eq('id', flagId).maybeSingle()
      return data ? mapFraudFlagFromDb(data) : null
    },

    async updateFraudFlagStatus(
      flagId: string,
      status: Parameters<IAffiliateRepository['updateFraudFlagStatus']>[1],
      notes?: string,
    ) {
      const fields: Database['public']['Tables']['affiliate_fraud_flags']['Update'] = { status }
      if (notes !== undefined) fields.admin_notes = notes
      if (status === 'resolved' || status === 'confirmed_fraud' || status === 'false_positive') {
        fields.resolved_at = new Date().toISOString()
      }
      const { data, error } = await sb
        .from('affiliate_fraud_flags')
        .update(fields)
        .eq('id', flagId)
        .select()
        .single()
      if (error) throw error
      return mapFraudFlagFromDb(data)
    },
  }
}
