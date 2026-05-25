'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminPaths } from '@/lib/use-admin-paths';
import { ClipboardList } from 'lucide-react';

interface AuditLogItem {
  id: string;
  action: string;
  actor: { id: string; name: string };
  targetUser: { id: string; name: string } | null;
  amount: number | null;
  amountUnit: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditLogResponse {
  data: {
    items: AuditLogItem[];
    total: number;
    page: number;
    totalPages: number;
  } | null;
  error: { code: string; message: string } | null;
}

type ActionFilter =
  | 'all'
  | 'coupon_created'
  | 'coupon_archived'
  | 'donation_created_auto'
  | 'donation_created_pending'
  | 'donation_approved'
  | 'donation_denied'
  | 'token_reset'
  | 'notification_sent';

interface ActionMeta {
  label: string;
  emoji: string;
  colorClass: string;
}

const ACTION_META: Record<string, ActionMeta> = {
  coupon_created: {
    label: 'Cupom criado',
    emoji: '🎟️',
    colorClass: 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30',
  },
  coupon_archived: {
    label: 'Cupom arquivado',
    emoji: '🗂️',
    colorClass: 'bg-slate-100 dark:bg-dash-surface text-slate-500 dark:text-v-dim border-slate-200 dark:border-dash-border',
  },
  donation_created_auto: {
    label: 'Doação (auto)',
    emoji: '💸',
    colorClass: 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/30',
  },
  donation_created_pending: {
    label: 'Doação (pendente)',
    emoji: '⏳',
    colorClass: 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/30',
  },
  donation_approved: {
    label: 'Doação aprovada',
    emoji: '✅',
    colorClass: 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30',
  },
  donation_denied: {
    label: 'Doação negada',
    emoji: '❌',
    colorClass: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/30',
  },
  token_reset: {
    label: 'Tokens resetados',
    emoji: '🔄',
    colorClass: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/30',
  },
  notification_sent: {
    label: 'Notificação enviada',
    emoji: '📢',
    colorClass: 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/30',
  },
};

const ACTION_FILTER_OPTIONS: { value: ActionFilter; label: string }[] = [
  { value: 'all', label: 'Todas as ações' },
  { value: 'coupon_created', label: '🎟️ Cupom criado' },
  { value: 'coupon_archived', label: '🗂️ Cupom arquivado' },
  { value: 'donation_created_auto', label: '💸 Doação (auto)' },
  { value: 'donation_created_pending', label: '⏳ Doação (pendente)' },
  { value: 'donation_approved', label: '✅ Doação aprovada' },
  { value: 'donation_denied', label: '❌ Doação negada' },
  { value: 'token_reset', label: '🔄 Tokens resetados' },
  { value: 'notification_sent', label: '📢 Notificação enviada' },
];

function formatAmount(amount: number | null, amountUnit: string | null): string {
  if (amount === null) return '—';
  if (amountUnit === 'tokens') return `${amount.toLocaleString('pt-BR')} tokens`;
  if (amountUnit === 'usd_cents') {
    const reais = amount / 100;
    return `R$ ${reais.toFixed(2).replace('.', ',')}`;
  }
  return String(amount);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractDetails(item: AuditLogItem): string {
  const m = item.metadata;
  if (!m) return '—';

  const parts: string[] = [];

  if (typeof m.code === 'string') parts.push(`Código: ${m.code}`);
  if (typeof m.reason === 'string') parts.push(m.reason);
  if (typeof m.title === 'string') parts.push(m.title);
  if (typeof m.recipient_count === 'number' && m.recipient_count > 1) {
    parts.push(`${m.recipient_count} destinatários`);
  }

  const text = parts.join(' · ');
  return text.length > 60 ? `${text.slice(0, 57)}…` : text || '—';
}

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? { label: action, emoji: '•', colorClass: 'bg-slate-100 dark:bg-dash-surface text-slate-500 dark:text-v-dim border-slate-200 dark:border-dash-border' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${meta.colorClass}`}>
      <span>{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  );
}

export default function AuditLogPage() {
  const { adminApi } = useAdminPaths();
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (currentPage: number, currentAction: ActionFilter) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(currentPage), limit: '50' });
      if (currentAction !== 'all') qs.set('action', currentAction);
      const res = await fetch(`${adminApi('/audit-log')}?${qs.toString()}`);
      const json = (await res.json()) as AuditLogResponse;
      if (json.error || !json.data) {
        setError(json.error?.message ?? 'Erro ao carregar audit log');
        return;
      }
      setItems(json.data.items);
      setTotal(json.data.total);
      setTotalPages(json.data.totalPages);
    } catch {
      setError('Erro ao carregar audit log');
    } finally {
      setLoading(false);
    }
  }, [adminApi]);

  useEffect(() => {
    void fetchData(page, actionFilter);
  }, [fetchData, page, actionFilter]);

  const handleFilterChange = (value: ActionFilter) => {
    setActionFilter(value);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-v-primary tracking-tight">Audit Log</h1>
        <p className="text-sm text-slate-500 dark:text-v-secondary mt-1">
          Histórico de ações administrativas
        </p>
      </div>

      {/* Filter bar */}
      <div className="animate-fade-in-up flex items-center gap-3">
        <label className="text-xs font-medium text-slate-600 dark:text-v-secondary whitespace-nowrap">
          Filtrar por ação
        </label>
        <select
          value={actionFilter}
          onChange={(e) => handleFilterChange(e.target.value as ActionFilter)}
          className="rounded-lg border border-slate-200 dark:border-dash-border bg-white dark:bg-dash-surface px-3 py-1.5 text-sm text-slate-800 dark:text-v-primary focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          {ACTION_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <span className="text-xs text-slate-400 dark:text-v-dim ml-auto">
          {total.toLocaleString('pt-BR')} registro{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="animate-fade-in-up-1 bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 dark:text-v-dim">
            <span className="text-sm">Carregando…</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-red-500 dark:text-red-400">
            <span className="text-sm">{error}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-v-dim">
            <ClipboardList className="w-8 h-8 mb-3 opacity-40" />
            <p className="text-sm">Nenhuma ação registrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-dash-border">
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim">
                    Ação
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim">
                    Ator
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim hidden md:table-cell">
                    Usuário afetado
                  </th>
                  <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim hidden lg:table-cell">
                    Valor
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim hidden lg:table-cell">
                    Detalhes
                  </th>
                  <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim">
                    Data
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-50 dark:border-dash-border/50 hover:bg-slate-50 dark:hover:bg-dash-surface/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <ActionBadge action={item.action} />
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-slate-800 dark:text-v-primary font-medium text-sm">{item.actor.name}</span>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      {item.targetUser ? (
                        <span className="text-slate-600 dark:text-v-secondary text-sm">{item.targetUser.name}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-v-dim text-sm">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right hidden lg:table-cell">
                      <span className="font-mono text-sm text-slate-700 dark:text-v-secondary whitespace-nowrap">
                        {formatAmount(item.amount, item.amountUnit)}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <span className="text-xs text-slate-500 dark:text-v-secondary truncate max-w-xs block">
                        {extractDetails(item)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-xs text-slate-400 dark:text-v-dim whitespace-nowrap">
                        {formatDate(item.createdAt)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="animate-fade-in-up flex items-center justify-between">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-dash-border text-slate-600 dark:text-v-secondary hover:bg-slate-50 dark:hover:bg-dash-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Anterior
          </button>
          <span className="text-xs text-slate-500 dark:text-v-secondary">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-dash-border text-slate-600 dark:text-v-secondary hover:bg-slate-50 dark:hover:bg-dash-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Próximo
          </button>
        </div>
      )}
    </div>
  );
}
