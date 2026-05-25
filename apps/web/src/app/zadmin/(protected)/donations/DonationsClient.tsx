'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/admin-path';
import { Gift, Clock, CheckCircle2, XCircle, ChevronDown, ThumbsUp, ThumbsDown } from 'lucide-react';

type DonationStatus = 'pending_approval' | 'approved' | 'denied' | 'executed';

interface DonationRow {
  id: string;
  amount: number;
  reason: string;
  status: DonationStatus;
  requestedAt: string;
  executedAt: string | null;
  donor: { email: string; name: string };
  recipient: { email: string; name: string } | null;
  recipientOrg: { name: string; creditsAddon: number } | null;
  approvedBy: { email: string; name: string } | null;
  deniedBy: { email: string; name: string } | null;
}

interface Kpis {
  pending: number;
  executed: number;
  totalDonated: number;
  threshold: number;
}

interface Props {
  initialDonations: DonationRow[];
  kpis: Kpis;
}

const STATUS_LABELS: Record<DonationStatus, string> = {
  pending_approval: 'Aguardando',
  approved: 'Aprovado',
  denied: 'Negado',
  executed: 'Executado',
};

const STATUS_CLASSES: Record<DonationStatus, string> = {
  pending_approval: 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/30',
  approved: 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/30',
  denied: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/30',
  executed: 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30',
};

function relativeDate(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d atrás`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function KpiCard({ label, value, icon, sub }: { label: string; value: string | number; icon: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-dash-surface flex items-center justify-center text-slate-500 dark:text-v-dim">
        {icon}
      </div>
      <div>
        <p className="text-xs text-slate-500 dark:text-v-dim">{label}</p>
        <p className="text-xl font-bold text-slate-800 dark:text-v-primary">{value}</p>
        {sub && <p className="text-xs text-slate-400 dark:text-v-dim">{sub}</p>}
      </div>
    </div>
  );
}

function ExpandedRow({ donation }: { donation: DonationRow }) {
  return (
    <tr className="bg-slate-50 dark:bg-dash-surface/30">
      <td colSpan={6} className="px-6 py-3 text-xs text-slate-500 dark:text-v-secondary space-y-1">
        <p><span className="font-medium">Org destinatária:</span> {donation.recipientOrg?.name ?? '—'}</p>
        <p><span className="font-medium">Motivo:</span> {donation.reason}</p>
        {donation.approvedBy && (
          <p><span className="font-medium">Aprovado por:</span> {donation.approvedBy.name}</p>
        )}
        {donation.deniedBy && (
          <p><span className="font-medium">Negado por:</span> {donation.deniedBy.name}</p>
        )}
        {donation.executedAt && (
          <p><span className="font-medium">Executado em:</span> {relativeDate(donation.executedAt)}</p>
        )}
      </td>
    </tr>
  );
}

export function DonationsClient({ initialDonations, kpis: initialKpis }: Props) {
  const router = useRouter();
  const [donations, setDonations] = useState(initialDonations);
  const [kpis, setKpis] = useState(initialKpis);
  const [filter, setFilter] = useState<'all' | DonationStatus>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(adminApi(`/donations?status=${filter}`));
    const json = await res.json();
    if (json.data) {
      setDonations(json.data.donations);
      setKpis(json.data.kpis);
    }
  }, [filter]);

  const handleApprove = async (id: string) => {
    setLoadingId(id);
    await fetch(adminApi(`/donations/${id}/approve`), { method: 'POST' });
    setLoadingId(null);
    await refetch();
    router.refresh();
  };

  const handleDeny = async (id: string) => {
    setLoadingId(id);
    await fetch(adminApi(`/donations/${id}/deny`), { method: 'POST' });
    setLoadingId(null);
    await refetch();
    router.refresh();
  };

  const visible = filter === 'all' ? donations : donations.filter((d) => d.status === filter);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex justify-between items-start animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-v-primary tracking-tight">Doações de tokens</h1>
          <p className="text-sm text-slate-500 dark:text-v-secondary mt-1">
            Grants de tokens de admin para usuários. Acima de {kpis.threshold.toLocaleString()} tokens requer aprovação de segundo admin.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up-1">
        <KpiCard label="Pendentes" value={kpis.pending} icon={<Clock className="w-5 h-5" />} sub="aguardando aprovação" />
        <KpiCard label="Executadas" value={kpis.executed} icon={<CheckCircle2 className="w-5 h-5" />} />
        <KpiCard label="Total doado" value={kpis.totalDonated.toLocaleString()} icon={<Gift className="w-5 h-5" />} sub="tokens" />
        <KpiCard label="Auto-aprova até" value={kpis.threshold.toLocaleString()} icon={<Gift className="w-5 h-5" />} sub="tokens" />
      </div>

      {/* Filter tabs */}
      <div className="animate-fade-in-up-2 flex gap-2 text-sm">
        {(['all', 'pending_approval', 'executed', 'denied'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg border font-medium transition-colors ${filter === s
              ? 'bg-slate-900 dark:bg-v-primary text-white dark:text-dash-bg border-slate-900 dark:border-v-primary'
              : 'bg-white dark:bg-dash-card text-slate-600 dark:text-v-secondary border-slate-200 dark:border-dash-border hover:border-slate-400'
            }`}
          >
            {s === 'all' ? 'Todas' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="animate-fade-in-up-2 bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl shadow-sm overflow-hidden">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-v-dim">
            <Gift className="w-8 h-8 mb-3 opacity-40" />
            <p className="text-sm">Nenhuma doação encontrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-dash-border">
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim">Doador</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim">Destinatário</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim">Tokens</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim hidden md:table-cell">Data</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim">Status</th>
                  <th className="py-3 px-4 text-right"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => (
                  <>
                    <tr
                      key={d.id}
                      className="border-b border-slate-50 dark:border-dash-border/50 hover:bg-slate-50 dark:hover:bg-dash-surface/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-800 dark:text-v-primary text-sm">{d.donor.name}</p>
                        <p className="text-xs text-slate-400 dark:text-v-dim">{d.donor.email}</p>
                      </td>
                      <td className="py-3 px-4">
                        {d.recipient ? (
                          <>
                            <p className="font-medium text-slate-800 dark:text-v-primary text-sm">{d.recipient.name}</p>
                            <p className="text-xs text-slate-400 dark:text-v-dim">{d.recipient.email}</p>
                          </>
                        ) : (
                          <p className="text-xs text-slate-400 dark:text-v-dim">—</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono font-semibold text-slate-800 dark:text-v-primary">
                          {d.amount.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-4 hidden md:table-cell">
                        <span className="text-xs text-slate-400 dark:text-v-dim">{relativeDate(d.requestedAt)}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_CLASSES[d.status]}`}>
                          {STATUS_LABELS[d.status]}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {d.status === 'pending_approval' && (
                            <>
                              <button
                                type="button"
                                disabled={loadingId === d.id}
                                onClick={() => handleApprove(d.id)}
                                className="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
                                title="Aprovar"
                              >
                                <ThumbsUp className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                disabled={loadingId === d.id}
                                onClick={() => handleDeny(d.id)}
                                className="p-1.5 rounded-lg text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                                title="Negar"
                              >
                                <ThumbsDown className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dash-surface text-muted-foreground transition-colors"
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform ${expandedId === d.id ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === d.id && <ExpandedRow key={`${d.id}-exp`} donation={d} />}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
