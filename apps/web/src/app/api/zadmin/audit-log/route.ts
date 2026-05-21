import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getManager } from '@/lib/admin-check';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

interface AuditLogItem {
  id: string;
  action: string;
  actor: { id: string; name: string };
  targetUser: { id: string; name: string } | null;
  amount: number | null;
  amountUnit: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** GET /api/zadmin/audit-log */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);

  const manager = await getManager(supabase, user.id);
  if (!manager) return jsonError('Forbidden', 'FORBIDDEN', 403);

  const params = req.nextUrl.searchParams;
  const action = params.get('action') ?? undefined;
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(params.get('limit') ?? '50', 10)));
  const offset = (page - 1) * limit;

  const db = createAdminClient();

  // Count query
  let countQuery = db
    .from('admin_audit_log')
    .select('id', { count: 'exact', head: true });
  if (action) countQuery = countQuery.eq('action', action);

  const { count, error: countErr } = await countQuery;
  if (countErr) return jsonError(countErr.message, 'DB_ERROR', 500);

  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);

  // Data query
  let dataQuery = db
    .from('admin_audit_log')
    .select('id, action, actor_id, target_user_id, amount, amount_unit, metadata_json, created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (action) dataQuery = dataQuery.eq('action', action);

  const { data: rows, error: rowsErr } = await dataQuery;
  if (rowsErr) return jsonError(rowsErr.message, 'DB_ERROR', 500);

  // Collect unique user IDs to resolve names
  const userIdSet = new Set<string>();
  for (const r of rows ?? []) {
    userIdSet.add(r.actor_id as string);
    if (r.target_user_id) userIdSet.add(r.target_user_id as string);
  }

  const userIds = Array.from(userIdSet);
  const { data: profiles } = await (userIds.length > 0
    ? db
        .from('user_profiles')
        .select('id, email, first_name, last_name')
        .in('id', userIds)
    : Promise.resolve({ data: [] as { id: string; email: string; first_name: string | null; last_name: string | null }[] }));

  const profileMap = new Map<string, { id: string; name: string }>();
  for (const p of profiles ?? []) {
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email;
    profileMap.set(p.id, { id: p.id, name });
  }

  const items: AuditLogItem[] = (rows ?? []).map((r) => {
    const actorId = r.actor_id as string;
    const targetId = r.target_user_id as string | null;
    const metadata = r.metadata_json as Record<string, unknown> | null;

    return {
      id: r.id as string,
      action: r.action as string,
      actor: profileMap.get(actorId) ?? { id: actorId, name: actorId },
      targetUser: targetId
        ? (profileMap.get(targetId) ?? { id: targetId, name: targetId })
        : null,
      amount: (r.amount as number | null) ?? null,
      amountUnit: (r.amount_unit as string | null) ?? null,
      metadata,
      createdAt: r.created_at as string,
    };
  });

  return NextResponse.json({
    data: { items, total, page, totalPages },
    error: null,
  });
}
