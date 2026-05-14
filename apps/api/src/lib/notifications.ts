/**
 * M-005 — Notification helper.
 * Inserts a user-scoped notification into the `notifications` table.
 * Failures are intentionally swallowed — notifications are non-critical.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@brighttale/shared/types/database';

interface NotificationPayload {
  type: string;
  title: string;
  body?: string;
  action_url?: string;
}

export async function insertNotification(
  sb: SupabaseClient<Database>,
  userId: string,
  payload: NotificationPayload,
): Promise<void> {
  await sb.from('notifications').insert({
    user_id: userId,
    type: payload.type,
    title: payload.title,
    body: payload.body ?? null,
    action_url: payload.action_url ?? null,
    is_read: false,
  });
}
