import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getManager } from '@/lib/admin-check';
import { notify } from '@/lib/notify';
import { z } from 'zod';

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

const AUTO_APPROVE_DEFAULT = 1000;

async function getThreshold(db: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data } = await db
    .from('donation_config')
    .select('value')
    .eq('key', 'auto_approve_threshold')
    .maybeSingle();
  if (!data) return AUTO_APPROVE_DEFAULT;
  const val = data.value;
  return typeof val === 'number' ? val : Number(val) || AUTO_APPROVE_DEFAULT;
}

async function executeGrant(
  db: ReturnType<typeof createAdminClient>,
  orgId: string,
  amount: number,
) {
  const { data: org } = await db
    .from('organizations')
    .select('credits_addon')
    .eq('id', orgId)
    .maybeSingle();
  if (!org) return;
  await db
    .from('organizations')
    .update({ credits_addon: (org.credits_addon ?? 0) + amount })
    .eq('id', orgId);
}

/** GET /api/zadmin/donations */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);

  const manager = await getManager(supabase, user.id);
  if (!manager) return jsonError('Forbidden', 'FORBIDDEN', 403);

  const status = req.nextUrl.searchParams.get('status') ?? 'all';
  const db = createAdminClient();

  let query = db.from('token_donations').select('*').order('requested_at', { ascending: false });
  if (status !== 'all') query = query.eq('status', status);

  const { data: rows, error } = await query.limit(200);
  if (error) return jsonError(error.message, 'DB_ERROR', 500);

  const userIds = new Set<string>();
  for (const r of rows ?? []) {
    if (r.donor_id) userIds.add(r.donor_id);
    if (r.recipient_user_id) userIds.add(r.recipient_user_id);
    if (r.approved_by) userIds.add(r.approved_by);
    if (r.denied_by) userIds.add(r.denied_by);
  }

  const [{ data: profiles }, { data: orgs }] = await Promise.all([
    userIds.size > 0
      ? db.from('user_profiles').select('id, email, first_name, last_name').in('id', Array.from(userIds))
      : Promise.resolve({ data: [] }),
    db.from('organizations').select('id, name, credits_addon'),
  ]);

  const profileMap = new Map<string, { email: string; name: string }>();
  for (const p of profiles ?? []) {
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email;
    profileMap.set(p.id, { email: p.email, name });
  }
  const orgMap = new Map<string, { name: string; creditsAddon: number }>();
  for (const o of orgs ?? []) {
    orgMap.set(o.id, { name: o.name, creditsAddon: o.credits_addon });
  }

  const threshold = await getThreshold(db);

  const donations = (rows ?? []).map((r) => ({
    id: r.id,
    amount: r.amount,
    reason: r.reason,
    status: r.status,
    requestedAt: r.requested_at,
    executedAt: r.executed_at,
    donor: profileMap.get(r.donor_id) ?? { email: r.donor_id, name: r.donor_id },
    recipient: r.recipient_user_id ? (profileMap.get(r.recipient_user_id) ?? null) : null,
    recipientOrg: r.recipient_org_id ? (orgMap.get(r.recipient_org_id) ?? null) : null,
    approvedBy: r.approved_by ? (profileMap.get(r.approved_by) ?? null) : null,
    deniedBy: r.denied_by ? (profileMap.get(r.denied_by) ?? null) : null,
  }));

  const pending = (rows ?? []).filter((r) => r.status === 'pending_approval').length;
  const executed = (rows ?? []).filter((r) => r.status === 'executed').length;
  const totalDonated = (rows ?? [])
    .filter((r) => r.status === 'executed')
    .reduce((s, r) => s + (r.amount ?? 0), 0);

  return NextResponse.json({
    data: { donations, kpis: { pending, executed, totalDonated, threshold } },
    error: null,
  });
}

const createSchema = z.object({
  recipientUserId: z.string().uuid(),
  amount: z.number().int().positive().max(1_000_000),
  reason: z.string().min(1).max(500),
});

/** POST /api/zadmin/donations — create donation */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);

  const manager = await getManager(supabase, user.id);
  if (!manager || (manager.role !== 'owner' && manager.role !== 'admin')) {
    return jsonError('Forbidden', 'FORBIDDEN', 403);
  }

  let body: unknown;
  try { body = await req.json(); } catch { return jsonError('Invalid JSON', 'INVALID_JSON', 400); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.message, 'VALIDATION_ERROR', 422);

  const { recipientUserId, amount, reason } = parsed.data;
  const db = createAdminClient();

  // Find recipient org
  const { data: membership } = await db
    .from('org_members')
    .select('org_id')
    .eq('user_id', recipientUserId)
    .maybeSingle();
  if (!membership) return jsonError('Recipient has no organization', 'NO_ORG', 404);
  const orgId = membership.org_id;

  const threshold = await getThreshold(db);
  const autoExecute = amount <= threshold;
  const now = new Date().toISOString();

  const { data: donation, error: insertErr } = await db
    .from('token_donations')
    .insert({
      donor_id: user.id,
      recipient_org_id: orgId,
      recipient_user_id: recipientUserId,
      amount,
      reason,
      status: autoExecute ? 'executed' : 'pending_approval',
      requested_at: now,
      ...(autoExecute ? { approved_by: user.id, approved_at: now, executed_at: now } : {}),
    })
    .select()
    .single();

  if (insertErr) return jsonError(insertErr.message, 'DB_ERROR', 500);

  if (autoExecute) {
    await executeGrant(db, orgId, amount);
    // Notify recipient
    await notify({
      userId: recipientUserId,
      type: 'donation_received',
      title: `Você recebeu ${amount.toLocaleString('pt-BR')} tokens!`,
      body: `Motivo: ${reason}`,
      actionUrl: '/settings/usage',
    });
  } else {
    // Notify approvers: find all owner/admin managers
    const { data: approvers } = await db
      .from('managers')
      .select('user_id')
      .in('role', ['owner', 'admin'])
      .eq('is_active', true);
    const approverIds = (approvers ?? []).map((a) => a.user_id).filter((id) => id !== user.id);
    await Promise.all(
      approverIds.map((approverId) =>
        notify({
          userId: approverId,
          type: 'donation_pending_approval',
          title: `Aprovação pendente: doação de ${amount.toLocaleString('pt-BR')} tokens`,
          body: `Motivo: ${reason}`,
          actionUrl: '/admin/donations',
        }),
      ),
    );
  }

  return NextResponse.json({ data: donation, error: null }, { status: 201 });
}
