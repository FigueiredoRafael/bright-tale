import { createAdminClient } from '@/lib/supabase/admin';
import { KpiSection, KpiCard } from '@tn-figueiredo/admin/client';
import { OrgsTable } from './components/orgs-table';

export const dynamic = 'force-dynamic';

interface Org {
  id: string;
  name: string;
  slug: string;
  plan: string;
  credits_total: number;
  credits_used: number;
  credits_addon: number;
  credits_reset_at: string | null;
  created_at: string;
  member_count: number;
}

async function fetchOrgsData() {
  const db = createAdminClient();

  // Fetch all orgs with member counts
  const { data: orgs, error } = await db
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Get member counts per org
  const { data: memberships } = await db
    .from('org_memberships')
    .select('org_id');

  const memberCounts: Record<string, number> = {};
  for (const m of memberships ?? []) {
    memberCounts[m.org_id] = (memberCounts[m.org_id] ?? 0) + 1;
  }

  const orgsWithCounts: Org[] = (orgs ?? []).map((o) => ({
    ...o,
    member_count: memberCounts[o.id] ?? 0,
  }));

  // KPIs
  const totalOrgs = orgsWithCounts.length;
  const freeCount = orgsWithCounts.filter((o) => o.plan === 'free').length;
  const paidCount = totalOrgs - freeCount;
  const totalCreditsUsed = orgsWithCounts.reduce((sum, o) => sum + o.credits_used, 0);

  return { orgs: orgsWithCounts, totalOrgs, freeCount, paidCount, totalCreditsUsed };
}

export default async function OrgsPage() {
  const { orgs, totalOrgs, freeCount, paidCount, totalCreditsUsed } = await fetchOrgsData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Organizations</h1>
        <p className="text-muted-foreground text-sm">
          Manage plans, credits, and organization settings
        </p>
      </div>

      <KpiSection title="Overview" color="blue">
        <KpiCard label="Total Orgs" value={totalOrgs} />
        <KpiCard label="Paid Plans" value={paidCount} />
        <KpiCard label="Free Plans" value={freeCount} />
        <KpiCard label="Credits Used" value={totalCreditsUsed.toLocaleString()} />
      </KpiSection>

      <OrgsTable orgs={orgs} />
    </div>
  );
}
