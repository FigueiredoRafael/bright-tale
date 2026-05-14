/**
 * M-005 — server-side notify helper.
 * Inserts a notification row; Supabase Realtime pushes it to the client Bell.
 * Email delivery is intentionally NOT wired yet (Resend integration TODO).
 */
import { createAdminClient } from '@/lib/supabase/admin';

export type NotificationType =
  | 'donation_received'
  | 'donation_pending_approval'
  | 'tokens_reset'
  | 'plan_low'
  | 'plan_renewed'
  | 'job_done'
  | 'announcement'
  | 'coupon_redeemed'
  | 'security';

interface NotifyOptions {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  actionUrl?: string;
  /** How many days until this notification expires. Default: 90 */
  ttlDays?: number;
}

export async function notify(opts: NotifyOptions): Promise<void> {
  const db = createAdminClient();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (opts.ttlDays ?? 90));

  await db.from('notifications').insert({
    user_id: opts.userId,
    type: opts.type,
    title: opts.title,
    body: opts.body ?? null,
    action_url: opts.actionUrl ?? null,
    expires_at: expiresAt.toISOString(),
    sent_via_email: false,
    sent_via_push: false,
  });
}

/** Notify multiple users at once (broadcast to a subset). */
export async function notifyMany(userIds: string[], opts: Omit<NotifyOptions, 'userId'>): Promise<void> {
  if (userIds.length === 0) return;
  const db = createAdminClient();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (opts.ttlDays ?? 90));

  await db.from('notifications').insert(
    userIds.map((userId) => ({
      user_id: userId,
      type: opts.type,
      title: opts.title,
      body: opts.body ?? null,
      action_url: opts.actionUrl ?? null,
      expires_at: expiresAt.toISOString(),
      sent_via_email: false,
      sent_via_push: false,
    })),
  );
}
