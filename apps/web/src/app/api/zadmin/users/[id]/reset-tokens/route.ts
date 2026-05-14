import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getManager } from '@/lib/admin-check';
import { z } from 'zod';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

const bodySchema = z.object({
  reason: z.string().min(1).max(500),
});

/** POST /api/zadmin/users/[id]/reset-tokens */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: targetUserId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);

  const manager = await getManager(supabase, user.id);
  if (!manager || (manager.role !== 'owner' && manager.role !== 'admin')) {
    return jsonError('Forbidden', 'FORBIDDEN', 403);
  }

  let body: unknown;
  try { body = await req.json(); } catch { return jsonError('Invalid JSON', 'INVALID_JSON', 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.message, 'VALIDATION_ERROR', 422);

  const db = createAdminClient();

  // Find target user's org
  const { data: membership } = await db
    .from('org_members')
    .select('org_id')
    .eq('user_id', targetUserId)
    .maybeSingle();
  if (!membership) return jsonError('User has no organization', 'NO_ORG', 404);
  const orgId = membership.org_id;

  // Snapshot current state for audit
  const { data: org } = await db
    .from('organizations')
    .select('credits_used, credits_addon')
    .eq('id', orgId)
    .maybeSingle();
  if (!org) return jsonError('Organization not found', 'NO_ORG', 404);

  // Reset: zero out credits_used and credits_addon (extra)
  const { error: updateErr } = await db
    .from('organizations')
    .update({ credits_used: 0, credits_addon: 0 })
    .eq('id', orgId);
  if (updateErr) return jsonError(updateErr.message, 'DB_ERROR', 500);

  // Audit log
  await db.from('token_reset_audit').insert({
    target_org_id: orgId,
    target_user_id: targetUserId,
    reset_by: user.id,
    reset_at: new Date().toISOString(),
    reason: parsed.data.reason,
    prev_credits_used: org.credits_used ?? 0,
    prev_credits_addon: org.credits_addon ?? 0,
  });

  return NextResponse.json({
    data: { success: true, prevUsed: org.credits_used, prevAddon: org.credits_addon },
    error: null,
  });
}
