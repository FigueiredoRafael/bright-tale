import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/admin-check';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

/** PATCH /api/zadmin/orgs/[id] — update org plan, credits, billing */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
  if (!await isAdminUser(supabase, user.id)) return jsonError('Forbidden', 'FORBIDDEN', 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return jsonError('Invalid JSON', 'INVALID_JSON', 400);
  }

  const db = createAdminClient();

  // Build update — only allow specific fields
  const update: Record<string, unknown> = {};
  if (body.plan !== undefined) update.plan = body.plan;
  if (body.credits_total !== undefined) update.credits_total = body.credits_total;
  if (body.credits_used !== undefined) update.credits_used = body.credits_used;
  if (body.credits_addon !== undefined) update.credits_addon = body.credits_addon;
  if (body.credits_reset_at !== undefined) update.credits_reset_at = body.credits_reset_at;
  if (body.billing_cycle !== undefined) update.billing_cycle = body.billing_cycle;
  if (body.name !== undefined) update.name = body.name;

  if (Object.keys(update).length === 0) {
    return jsonError('No fields to update', 'NO_CHANGES', 400);
  }

  const { data: org, error } = await db
    .from('organizations')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return jsonError(error.message, 'DB_ERROR', 500);

  return NextResponse.json({ data: org, error: null });
}
