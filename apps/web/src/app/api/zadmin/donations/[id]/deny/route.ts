import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getManager } from '@/lib/admin-check';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

/** POST /api/zadmin/donations/[id]/deny */
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
  const { data: donation } = await db
    .from('token_donations')
    .select('status')
    .eq('id', id)
    .maybeSingle();

  if (!donation) return jsonError('Donation not found', 'NOT_FOUND', 404);
  if (donation.status !== 'pending_approval') {
    return jsonError(`Cannot deny a donation with status: ${donation.status}`, 'INVALID_STATUS', 409);
  }

  const { data: updated, error } = await db
    .from('token_donations')
    .update({ status: 'denied', denied_by: user.id, denied_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return jsonError(error.message, 'DB_ERROR', 500);
  return NextResponse.json({ data: updated, error: null });
}
