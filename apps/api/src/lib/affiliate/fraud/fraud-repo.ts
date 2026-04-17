import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@brighttale/shared/types/database';
import type {
  IFraudRepository,
  FraudSeverity,
  RiskScore,
} from '@tn-figueiredo/fraud-detection';

/**
 * Writer-side IFraudRepository backed by the 2A `affiliate_fraud_flags` and
 * `affiliate_risk_scores` tables. Column-name remap: upstream `entity_id` →
 * local `affiliate_id`.
 *
 * Separate from `apps/api/src/lib/affiliate/repository/fraud-repo.ts` (which
 * is the admin READER for ListAffiliateFraudFlagsUseCase et al.). Writer and
 * reader live in sibling modules to keep IAffiliateRepository's surface in
 * repository/ uncluttered.
 */
export class SupabaseFraudRepository implements IFraudRepository {
  constructor(private readonly sb: SupabaseClient<Database>) {}

  async findRecentFlag(params: { entityId: string; flagType: string; since: string }) {
    const { data, error } = await this.sb
      .from('affiliate_fraud_flags')
      .select('id')
      .eq('affiliate_id', params.entityId)
      .eq('flag_type', params.flagType)
      .gte('created_at', params.since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? { id: data.id } : null;
  }

  async createFlag(input: {
    entityId: string;
    referralId?: string | null;
    flagType: string;
    severity: FraudSeverity;
    details: Record<string, unknown>;
    status: 'open';
  }) {
    const { error } = await this.sb.from('affiliate_fraud_flags').insert({
      affiliate_id: input.entityId,
      referral_id: input.referralId ?? null,
      flag_type: input.flagType,
      severity: input.severity,
      details: input.details as never, // Database Json cast
      status: input.status,
    });
    if (error) throw error;
  }

  async listOpenFlags(entityId: string) {
    const { data, error } = await this.sb
      .from('affiliate_fraud_flags')
      .select('flag_type, severity')
      .eq('affiliate_id', entityId)
      .in('status', ['open', 'investigating']);
    if (error) throw error;
    return (data ?? []).map((r: { flag_type: string; severity: string }) => ({
      flagType: r.flag_type,
      severity: r.severity as FraudSeverity,
    }));
  }

  async upsertRiskScore(score: RiskScore) {
    const { error } = await this.sb
      .from('affiliate_risk_scores')
      .upsert(
        {
          affiliate_id: score.entityId,
          score: score.score,
          flag_count: score.flagCount,
          updated_at: score.updatedAt,
        },
        { onConflict: 'affiliate_id' },
      );
    if (error) throw error;
  }
}
