import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';
import { redirect } from 'next/navigation';
import { adminPath } from '@/lib/admin-path';
import { DonationsClient } from './DonationsClient';

export const dynamic = 'force-dynamic';

export default async function DonationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !await isAdminUser(supabase, user.id)) {
    redirect(adminPath('/login'));
  }

  const db = createAdminClient();

  const [{ data: rows }, { data: configRow }] = await Promise.all([
    db.from('token_donations').select('*').order('requested_at', { ascending: false }).limit(200),
    db.from('donation_config').select('value').eq('key', 'auto_approve_threshold').maybeSingle(),
  ]);

  const threshold = configRow ? Number(configRow.value) || 1000 : 1000;

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

  const donations = (rows ?? []).map((r) => ({
    id: r.id as string,
    amount: r.amount as number,
    reason: r.reason as string,
    status: r.status as 'pending_approval' | 'approved' | 'denied' | 'executed',
    requestedAt: r.requested_at as string,
    executedAt: r.executed_at as string | null,
    donor: profileMap.get(r.donor_id as string) ?? { email: r.donor_id as string, name: r.donor_id as string },
    recipient: r.recipient_user_id ? (profileMap.get(r.recipient_user_id as string) ?? null) : null,
    recipientOrg: r.recipient_org_id ? (orgMap.get(r.recipient_org_id as string) ?? null) : null,
    approvedBy: r.approved_by ? (profileMap.get(r.approved_by as string) ?? null) : null,
    deniedBy: r.denied_by ? (profileMap.get(r.denied_by as string) ?? null) : null,
  }));

  const pending = donations.filter((d) => d.status === 'pending_approval').length;
  const executed = donations.filter((d) => d.status === 'executed').length;
  const totalDonated = donations.filter((d) => d.status === 'executed').reduce((s, d) => s + d.amount, 0);

  return (
    <DonationsClient
      initialDonations={donations}
      kpis={{ pending, executed, totalDonated, threshold }}
    />
  );
}
