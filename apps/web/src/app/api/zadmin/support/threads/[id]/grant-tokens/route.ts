import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getManager } from '@/lib/admin-check';
import { logAudit } from '@/lib/audit-log';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

/** POST /api/zadmin/support/threads/[id]/grant-tokens
 *  Body: { amount: number, note?: string }
 *  Finds the thread's user → their org → adds credits_addon directly.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);

  const manager = await getManager(supabase, user.id);
  if (!manager || (manager.role !== 'owner' && manager.role !== 'admin')) {
    return jsonError('Forbidden', 'FORBIDDEN', 403);
  }

  const body = await req.json() as { amount?: number; note?: string };
  const amount = Number(body.amount);
  if (!amount || amount <= 0 || !Number.isInteger(amount)) {
    return jsonError('amount must be a positive integer', 'INVALID_AMOUNT', 400);
  }

  const db = createAdminClient();

  // Resolve thread → user_id
  const { data: thread } = await db
    .from('support_threads')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!thread) return jsonError('Thread not found', 'NOT_FOUND', 404);
  const targetUserId = thread.user_id as string;

  // Resolve user → org
  const { data: membership } = await db
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', targetUserId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return jsonError('User has no organization', 'NO_ORG', 404);
  const orgId = membership.org_id as string;

  const { data: org } = await db
    .from('organizations')
    .select('credits_addon')
    .eq('id', orgId)
    .maybeSingle();

  if (!org) return jsonError('Organization not found', 'NO_ORG', 404);

  await db
    .from('organizations')
    .update({ credits_addon: ((org.credits_addon as number) ?? 0) + amount })
    .eq('id', orgId);

  // Mark thread resolved
  await db
    .from('support_threads')
    .update({ status: 'resolved', updated_at: new Date().toISOString() })
    .eq('id', id);

  void logAudit({
    actorId: user.id,
    action: 'tokens_reset',
    targetUserId,
    amount,
    amountUnit: 'tokens',
    metadata: { thread_id: id, note: body.note ?? 'suporte: reembolso via fila' },
  });

  return NextResponse.json({ data: { granted: amount, orgId }, error: null });
}
