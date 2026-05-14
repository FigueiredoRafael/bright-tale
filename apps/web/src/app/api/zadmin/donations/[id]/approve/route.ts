import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getManager } from '@/lib/admin-check';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

/** POST /api/zadmin/donations/[id]/approve */
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
  const { data: donation, error: fetchErr } = await db
    .from('token_donations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) return jsonError(fetchErr.message, 'DB_ERROR', 500);
  if (!donation) return jsonError('Donation not found', 'NOT_FOUND', 404);
  if (donation.status !== 'pending_approval') {
    return jsonError(`Cannot approve a donation with status: ${donation.status}`, 'INVALID_STATUS', 409);
  }
  // Prevent self-approval — the donor cannot approve their own donation
  if (donation.donor_id === user.id) {
    return jsonError('Donor cannot approve their own donation', 'SELF_APPROVAL', 403);
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await db
    .from('token_donations')
    .update({ status: 'executed', approved_by: user.id, approved_at: now, executed_at: now })
    .eq('id', id)
    .select()
    .single();

  if (updateErr) return jsonError(updateErr.message, 'DB_ERROR', 500);

  // Grant tokens to recipient org
  const { data: org } = await db
    .from('organizations')
    .select('credits_addon')
    .eq('id', donation.recipient_org_id)
    .maybeSingle();

  if (org) {
    await db
      .from('organizations')
      .update({ credits_addon: (org.credits_addon ?? 0) + donation.amount })
      .eq('id', donation.recipient_org_id);
  }

  return NextResponse.json({ data: updated, error: null });
}
