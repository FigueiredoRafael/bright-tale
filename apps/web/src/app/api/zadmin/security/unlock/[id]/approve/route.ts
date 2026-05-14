import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getManager } from '@/lib/admin-check';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

/** POST /api/zadmin/security/unlock/[id]/approve */
export async function POST(
  _req: NextRequest,
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

  const db = createAdminClient();
  const dbAny = db as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  const { data: req, error: fetchErr } = await dbAny
    .from('mfa_unlock_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) return jsonError(fetchErr.message, 'DB_ERROR', 500);
  if (!req) return jsonError('Request not found', 'NOT_FOUND', 404);
  if (req.status !== 'pending') {
    return jsonError(`Cannot approve a request with status: ${req.status}`, 'INVALID_STATUS', 409);
  }
  if (req.requester_id === user.id) {
    return jsonError('Requester cannot approve their own unlock request', 'SELF_APPROVAL', 403);
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await dbAny
    .from('mfa_unlock_requests')
    .update({ status: 'approved', approved_by: user.id, approved_at: now })
    .eq('id', id)
    .select()
    .single();

  if (updateErr) return jsonError(updateErr.message, 'DB_ERROR', 500);

  return NextResponse.json({ data: updated, error: null });
}
