import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/admin-check';
import { userRoleUpdateSchema } from '@brighttale/shared/schemas/users';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

/** PATCH /api/zadmin/users/[id]/role — change user role */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
  if (!await isAdminUser(supabase, user.id)) return jsonError('Forbidden', 'FORBIDDEN', 403);

  // Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON', 'INVALID_JSON', 400);
  }

  const parsed = userRoleUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.message, 'VALIDATION_ERROR', 422);
  }

  const { role } = parsed.data;
  const db = createAdminClient();

  // Safety: prevent self-demotion
  if (role === 'user' && user.id === id) {
    return jsonError('Cannot remove your own admin role', 'SELF_DEMOTION', 400);
  }

  if (role === 'admin') {
    const { error } = await db
      .from('user_roles')
      .upsert({ user_id: id, role: 'admin' }, { onConflict: 'user_id,role' });
    if (error) return jsonError(error.message, 'DB_ERROR', 500);
  } else {
    // Safety: prevent removing last admin
    const { count, error: countErr } = await db
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin');
    if (countErr) return jsonError(countErr.message, 'DB_ERROR', 500);
    if ((count ?? 0) <= 1) return jsonError('Cannot remove the last admin', 'LAST_ADMIN', 400);

    const { error } = await db
      .from('user_roles')
      .delete()
      .eq('user_id', id)
      .eq('role', 'admin');
    if (error) return jsonError(error.message, 'DB_ERROR', 500);
  }

  return NextResponse.json({ data: { success: true }, error: null });
}
