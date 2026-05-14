import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';
import { redirect } from 'next/navigation';
import { adminPath } from '@/lib/admin-path';
import { SecurityClient } from './SecurityClient';

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !await isAdminUser(supabase, user.id)) redirect(adminPath('/login'));

  const db = createAdminClient();
  const dbAny = db as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  const { data: requests } = await dbAny
    .from('mfa_unlock_requests')
    .select('id, requester_id, status, reason, requested_at, approved_by, approved_at, denied_by, denied_at, executed_at')
    .order('requested_at', { ascending: false })
    .limit(50);

  const pendingCount = (requests ?? []).filter((r: { status: string }) => r.status === 'pending').length;

  return <SecurityClient requests={requests ?? []} pendingCount={pendingCount} />;
}
