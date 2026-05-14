import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';
import { redirect } from 'next/navigation';
import { adminPath } from '@/lib/admin-path';
import { CouponsClient } from './CouponsClient';

export const dynamic = 'force-dynamic';

export default async function CouponsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !await isAdminUser(supabase, user.id)) {
    redirect(adminPath('/login'));
  }

  const db = createAdminClient();
  const { data: coupons } = await db
    .from('custom_coupons')
    .select('*, coupon_redemptions(count)')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  return <CouponsClient initialCoupons={coupons ?? []} />;
}
