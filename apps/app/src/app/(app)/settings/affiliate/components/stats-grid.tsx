import type { AffiliateStats } from '@tn-figueiredo/affiliate';
import { formatBrl } from '@/lib/formatters';
import { strings } from './strings';

interface Props { stats: AffiliateStats | null }

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export function StatsGrid({ stats }: Props) {
  if (!stats) {
    return <div className="text-sm text-muted-foreground">—</div>;
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Card label={strings.stats.clicks} value={stats.totalClicks} />
      <Card label={strings.stats.referrals} value={stats.totalReferrals} />
      <Card label={strings.stats.conversions} value={stats.totalConversions} />
      <Card label={strings.stats.pending} value={formatBrl(stats.pendingPayoutBrl)} />
      <Card label={strings.stats.paid} value={formatBrl(stats.paidPayoutBrl)} />
    </div>
  );
}
