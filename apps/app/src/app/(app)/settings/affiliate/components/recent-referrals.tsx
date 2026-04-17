import type { AffiliateReferral } from '@tn-figueiredo/affiliate';
import { formatDate } from '@/lib/formatters';
import { strings } from './strings';

interface Props { items: AffiliateReferral[] }

export function RecentReferrals({ items }: Props) {
  const latest = items.slice(0, 10);
  if (latest.length === 0) {
    return (
      <section className="space-y-2">
        <h3 className="font-medium">{strings.referrals.section_title}</h3>
        <p className="text-sm text-muted-foreground">{strings.referrals.empty}</p>
      </section>
    );
  }
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{strings.referrals.section_title}</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr><th>Data</th><th>Status</th><th>Conversão</th></tr>
        </thead>
        <tbody>
          {latest.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-2">{formatDate(r.signupDate)}</td>
              <td className="py-2">{r.attributionStatus}</td>
              <td className="py-2">{r.convertedAt ? formatDate(r.convertedAt) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
