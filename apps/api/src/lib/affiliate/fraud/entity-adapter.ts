import type { IEntityRepository } from '@tn-figueiredo/fraud-detection';
import type { Affiliate } from '@tn-figueiredo/affiliate';
import type { SupabaseAffiliateRepository } from '../repository';

/**
 * Bridges FraudDetectionEngine's IEntityRepository<Affiliate> port to the
 * domain's SupabaseAffiliateRepository. One non-trivial translation: the
 * engine emits `action: 'paused_fraud'` which is NOT permitted by
 * affiliate_contract_history's CHECK constraint (2A migration
 * 20260417000004_affiliate_004_contract.sql:6-9 allows only approved/paused/
 * terminated/contract_renewed/proposal_*). We remap paused_fraud → paused
 * with a prefixed note to preserve the audit trail without a schema change.
 */
export class AffiliateEntityAdapter implements IEntityRepository<Affiliate> {
  constructor(private readonly repo: SupabaseAffiliateRepository) {}

  findById(id: string): Promise<Affiliate | null> {
    return this.repo.findById(id);
  }

  pause(id: string, options?: { skipAudit?: boolean }): Promise<Affiliate> {
    return this.repo.pause(id, options);
  }

  async addHistory(entry: {
    entityId: string;
    action: string;
    notes?: string | null;
    oldStatus?: string | null;
    newStatus?: string | null;
  }): Promise<void> {
    const isFraudPause = entry.action === 'paused_fraud';
    await this.repo.addContractHistory({
      affiliateId: entry.entityId,
      action: (isFraudPause ? 'paused' : entry.action) as never,
      notes: isFraudPause
        ? `[fraud-engine] ${entry.notes ?? 'auto-pause'}`
        : (entry.notes ?? null),
      oldStatus: entry.oldStatus ?? null,
      newStatus: entry.newStatus ?? null,
    });
  }
}
