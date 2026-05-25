import { createAdminClient } from '@/lib/supabase/admin';

interface AuditEntry {
  actorId: string;
  action: string;
  targetUserId?: string;
  amount?: number;
  amountUnit?: 'tokens' | 'usd_cents';
  metadata?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const db = createAdminClient();
    await db.from('admin_audit_log').insert({
      actor_id: entry.actorId,
      action: entry.action,
      target_user_id: entry.targetUserId ?? null,
      amount: entry.amount ?? null,
      amount_unit: entry.amountUnit ?? null,
      metadata_json: entry.metadata ?? null,
    });
  } catch (err) {
    console.error('[audit-log] Failed to write audit entry:', err);
  }
}
