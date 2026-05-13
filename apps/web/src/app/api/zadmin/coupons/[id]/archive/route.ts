import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getManager } from '@/lib/admin-check';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

/** POST /api/zadmin/coupons/[id]/archive */
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
  const { data, error } = await db
    .from('custom_coupons')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .is('archived_at', null)
    .select()
    .maybeSingle();

  if (error) return jsonError(error.message, 'DB_ERROR', 500);
  if (!data) return jsonError('Coupon not found or already archived', 'NOT_FOUND', 404);

  return NextResponse.json({ data, error: null });
}
