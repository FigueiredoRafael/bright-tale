import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getManager } from '@/lib/admin-check';
import { notify, notifyMany, NotificationType } from '@/lib/notify';
import { logAudit } from '@/lib/audit-log';
import { z } from 'zod';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

interface NotifHistoryItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
  sentBy: { id: string; name: string };
  recipientCount: number;
  readCount: number;
  isGlobal: boolean;
}

/** GET /api/zadmin/notifications — admin-sent notification history */
export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);

  const manager = await getManager(supabase, user.id);
  if (!manager) return jsonError('Forbidden', 'FORBIDDEN', 403);

  const db = createAdminClient();

  // Fetch all admin-sent notifications (sent_by IS NOT NULL).
  // We group by title + type + date_trunc('second', created_at) + sent_by
  // to collapse broadcast rows into one "send" per batch.
  const { data: rows, error } = await db
    .from('notifications')
    .select('id, type, title, body, created_at, sent_by, is_read, user_id')
    .not('sent_by', 'is', null)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) return jsonError(error.message, 'DB_ERROR', 500);

  // Collect unique sender IDs
  const senderIds = new Set<string>();
  for (const r of rows ?? []) {
    if (r.sent_by) senderIds.add(r.sent_by as string);
  }

  const { data: profiles } = await (senderIds.size > 0
    ? db
        .from('user_profiles')
        .select('id, email, first_name, last_name')
        .in('id', Array.from(senderIds))
    : Promise.resolve({ data: [] as { id: string; email: string; first_name: string | null; last_name: string | null }[] }));

  const profileMap = new Map<string, { id: string; name: string }>();
  for (const p of profiles ?? []) {
    const name =
      [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email;
    profileMap.set(p.id, { id: p.id, name });
  }

  // Group rows by the composite key: sent_by + type + title + truncated-second
  type GroupKey = string;
  interface GroupAccum {
    id: string;
    type: string;
    title: string;
    body: string | null;
    createdAt: string;
    sentById: string;
    userIds: Set<string>;
    readCount: number;
  }
  const groups = new Map<GroupKey, GroupAccum>();

  for (const r of rows ?? []) {
    const truncSec = (r.created_at as string).slice(0, 19); // "YYYY-MM-DDTHH:MM:SS"
    const key: GroupKey = `${r.sent_by as string}|${r.type as string}|${r.title as string}|${truncSec}`;
    const existing = groups.get(key);
    if (existing) {
      existing.userIds.add(r.user_id as string);
      if (r.is_read) existing.readCount += 1;
    } else {
      groups.set(key, {
        id: r.id as string,
        type: r.type as string,
        title: r.title as string,
        body: (r.body as string | null) ?? null,
        createdAt: r.created_at as string,
        sentById: r.sent_by as string,
        userIds: new Set([r.user_id as string]),
        readCount: r.is_read ? 1 : 0,
      });
    }
  }

  const items: NotifHistoryItem[] = Array.from(groups.values()).map((g) => ({
    id: g.id,
    type: g.type,
    title: g.title,
    body: g.body,
    createdAt: g.createdAt,
    sentBy: profileMap.get(g.sentById) ?? { id: g.sentById, name: g.sentById },
    recipientCount: g.userIds.size,
    readCount: g.readCount,
    isGlobal: g.userIds.size > 1,
  }));

  return NextResponse.json({ data: { items }, error: null });
}

const notifySchema = z.object({
  target: z.enum(['user', 'all']),
  userId: z.string().uuid().optional(),
  type: z.enum([
    'donation_received',
    'donation_pending_approval',
    'tokens_reset',
    'plan_low',
    'plan_renewed',
    'job_done',
    'announcement',
    'coupon_redeemed',
    'security',
  ] as [NotificationType, ...NotificationType[]]),
  title: z.string().min(1).max(120).optional(),
  body: z.string().max(500).optional(),
  actionUrl: z.string().url().optional().or(z.literal('')),
  variables: z.record(z.string(), z.string()).optional(),
});

/** POST /api/zadmin/notifications — send notification */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);

  const manager = await getManager(supabase, user.id);
  if (!manager || (manager.role !== 'owner' && manager.role !== 'admin')) {
    return jsonError('Forbidden', 'FORBIDDEN', 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON', 'INVALID_JSON', 400);
  }

  const parsed = notifySchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.message, 'VALIDATION_ERROR', 422);

  const { target, userId, type, title, body: msgBody, actionUrl, variables } = parsed.data;

  if (target === 'user') {
    if (!userId) {
      return jsonError('userId é obrigatório quando target=user', 'MISSING_USER_ID', 422);
    }
    await notify({
      userId,
      type,
      title,
      body: msgBody,
      actionUrl: actionUrl || undefined,
      variables,
      sentBy: user.id,
    });

    void logAudit({
      actorId: user.id,
      action: 'notification_sent',
      targetUserId: userId,
      metadata: { target, type, title, recipient_count: 1 },
    });

    return NextResponse.json({ data: { sent: 1 }, error: null }, { status: 201 });
  }

  // target === 'all' — only owner can broadcast
  if (manager.role !== 'owner') {
    return jsonError('Somente owner pode fazer broadcast', 'FORBIDDEN_BROADCAST', 403);
  }

  const db = createAdminClient();
  const { data: allProfiles, error: profilesErr } = await db
    .from('user_profiles')
    .select('id');

  if (profilesErr) return jsonError(profilesErr.message, 'DB_ERROR', 500);

  const userIds = (allProfiles ?? []).map((p) => p.id as string);

  await notifyMany(userIds, {
    type,
    title,
    body: msgBody,
    actionUrl: actionUrl || undefined,
    variables,
    sentBy: user.id,
  });

  void logAudit({
    actorId: user.id,
    action: 'notification_sent',
    metadata: { target, type, title, recipient_count: userIds.length },
  });

  return NextResponse.json({ data: { sent: userIds.length }, error: null }, { status: 201 });
}
