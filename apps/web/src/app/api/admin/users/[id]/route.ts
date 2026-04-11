import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/admin-check';
import { userUpdateSchema } from '@brighttale/shared/schemas/users';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

/** PATCH /api/admin/users/[id] — update user profile/premium/active */
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

  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.message, 'VALIDATION_ERROR', 422);
  }

  const data = parsed.data;
  const db = createAdminClient();

  // Build snake_case update object
  const update: Record<string, unknown> = {};
  if (data.firstName !== undefined) update.first_name = data.firstName;
  if (data.lastName !== undefined) update.last_name = data.lastName;
  if (data.isActive !== undefined) update.is_active = data.isActive;

  if (data.isPremium !== undefined) {
    update.is_premium = data.isPremium;
    if (data.isPremium) {
      update.premium_plan = data.premiumPlan;
      update.premium_expires_at = data.premiumExpiresAt;
      update.premium_started_at = new Date().toISOString();
    } else {
      update.premium_plan = null;
      update.premium_started_at = null;
      update.premium_expires_at = null;
    }
  }

  const { data: updated, error } = await db
    .from('user_profiles')
    .update(update as never)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) return jsonError(error.message, 'DB_ERROR', 500);
  if (!updated) return jsonError('User not found', 'NOT_FOUND', 404);

  return NextResponse.json({ data: updated, error: null });
}

/** DELETE /api/admin/users/[id] — hard delete user */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
  if (!await isAdminUser(supabase, user.id)) return jsonError('Forbidden', 'FORBIDDEN', 403);

  // Safety: prevent self-deletion
  if (user.id === id) return jsonError('Cannot delete your own account', 'SELF_DELETE', 400);

  const db = createAdminClient();

  // Safety: prevent deleting last admin
  const { data: roleRow } = await db
    .from('user_roles')
    .select('role')
    .eq('user_id', id)
    .eq('role', 'admin')
    .maybeSingle();

  if (roleRow) {
    const { count, error: countErr } = await db
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin');
    if (countErr) return jsonError(countErr.message, 'DB_ERROR', 500);
    if ((count ?? 0) <= 1) return jsonError('Cannot delete the last admin', 'LAST_ADMIN', 400);
  }

  const { error } = await db.from('user_profiles').delete().eq('id', id);
  if (error) return jsonError(error.message, 'DB_ERROR', 500);

  return NextResponse.json({ data: { success: true }, error: null });
}
