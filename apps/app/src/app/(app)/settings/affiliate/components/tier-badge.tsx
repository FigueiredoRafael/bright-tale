import type { AffiliateTier } from '@tn-figueiredo/affiliate';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/formatters';
import { strings } from './strings';

interface Props {
  tier: AffiliateTier;
  commissionRate: number;
  contractEndDate: string;
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.floor(ms / 86_400_000);
}

export function TierBadge({ tier, commissionRate, contractEndDate }: Props) {
  const days = daysUntil(contractEndDate);
  const expiryColor =
    days <= 7 ? 'text-red-600 bg-red-50 border-red-200'
    : days <= 30 ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
    : 'text-muted-foreground border-border';

  const pct = `${Math.round(commissionRate * 100)}%`;

  return (
    <div className="flex items-center gap-3">
      <Badge variant="secondary">{strings.tier[tier]}</Badge>
      <span className="text-sm font-medium">{pct}</span>
      <span className={`text-xs px-2 py-0.5 rounded border ${expiryColor}`}>
        até {formatDate(contractEndDate)}
      </span>
    </div>
  );
}
