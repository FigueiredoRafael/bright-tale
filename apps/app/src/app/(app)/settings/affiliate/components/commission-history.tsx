'use client';

import { useState } from 'react';
import type { AffiliateCommission } from '@tn-figueiredo/affiliate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatBrl, formatDate } from '@/lib/formatters';
import { strings } from './strings';

interface Props { items: AffiliateCommission[] }

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  paid: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

const PAGE = 20;

export function CommissionHistory({ items }: Props) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE));
  const start = page * PAGE;
  const view = items.slice(start, start + PAGE);

  if (items.length === 0) {
    return (
      <section className="space-y-2">
        <h3 className="font-medium">{strings.commissions.section_title}</h3>
        <p className="text-sm text-muted-foreground">{strings.commissions.empty}</p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="font-medium">{strings.commissions.section_title}</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr><th>Data</th><th>Valor</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {view.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="py-2">{formatDate(c.createdAt)}</td>
              <td className="py-2">{formatBrl(c.totalBrl ?? 0)}</td>
              <td className="py-2">
                <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_CLASS[c.status] ?? ''}`}>
                  {strings.commissions.status[c.status as keyof typeof strings.commissions.status] ?? c.status}
                </span>
              </td>
              <td className="py-2">
                {c.isRetroactive && <Badge variant="outline">{strings.commissions.retroactive_badge}</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span>{page + 1} / {totalPages}</span>
          <Button variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      )}
    </section>
  );
}
