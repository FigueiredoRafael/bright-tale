'use client';

import { useState } from 'react';
import { Shield, CheckCheck, X, Clock, Lock } from 'lucide-react';

interface UnlockRequest {
  id: string;
  requester_id: string;
  status: string;
  reason: string | null;
  requested_at: string;
  approved_by: string | null;
  approved_at: string | null;
  denied_by: string | null;
  denied_at: string | null;
  executed_at: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/30',
  approved: 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/30',
  denied: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/30',
  executed: 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30',
};

function formatDt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function SecurityClient({ requests: initial, pendingCount }: { requests: UnlockRequest[]; pendingCount: number }) {
  const [requests, setRequests] = useState(initial);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: 'approve' | 'deny') {
    setLoading(`${id}-${action}`);
    setError(null);
    try {
      const res = await fetch(`/api/zadmin/security/unlock/${id}/${action}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Action failed');
      setRequests((prev) => prev.map((r) => r.id === id ? { ...r, ...json.data } : r));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-v-primary tracking-tight">Segurança</h1>
          <p className="text-sm text-slate-500 dark:text-v-secondary mt-1">
            Pedidos de desbloqueio MFA (lost-phone). Aprovação requer segundo admin.
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-md px-2 py-1 font-semibold">
            <Clock className="w-3 h-3" />
            {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up-1">
        {[
          { label: 'Total', value: requests.length },
          { label: 'Pendentes', value: requests.filter((r) => r.status === 'pending').length },
          { label: 'Aprovados', value: requests.filter((r) => r.status === 'approved' || r.status === 'executed').length },
          { label: 'Negados', value: requests.filter((r) => r.status === 'denied').length },
        ].map((k) => (
          <div key={k.label} className="bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl p-4 flex items-center gap-3">
            <Shield className="w-5 h-5 text-slate-400 dark:text-v-dim" />
            <div>
              <p className="text-xs text-slate-500 dark:text-v-dim">{k.label}</p>
              <p className="text-xl font-bold text-slate-800 dark:text-v-primary">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Unlock requests table */}
      <div className="animate-fade-in-up-2 bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-dash-border flex items-center gap-2">
          <Lock className="w-4 h-4 text-slate-400 dark:text-v-dim" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-v-primary">Pedidos de desbloqueio MFA</h2>
        </div>

        {requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-v-dim">
            <Shield className="w-8 h-8 mb-3 opacity-30" />
            <p className="text-sm">Nenhum pedido de desbloqueio.</p>
            <p className="text-xs mt-1 text-center max-w-xs">
              Pedidos aparecem aqui quando um admin/manager solicita remoção do TOTP factor (telefone perdido).
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-dash-border">
                  {['Requester', 'Status', 'Motivo', 'Solicitado', 'Resolvido', 'Ações'].map((h) => (
                    <th key={h} className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 dark:border-dash-border/50 hover:bg-slate-50 dark:hover:bg-dash-surface/50">
                    <td className="py-3 px-4 font-mono text-xs text-slate-400">{r.requester_id.slice(0, 8)}…</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[r.status] ?? STATUS_STYLES.pending}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 dark:text-v-secondary max-w-[200px] truncate">
                      {r.reason ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400">{formatDt(r.requested_at)}</td>
                    <td className="py-3 px-4 text-xs text-slate-400">
                      {r.status === 'approved' || r.status === 'executed' ? formatDt(r.approved_at) :
                       r.status === 'denied' ? formatDt(r.denied_at) : '—'}
                    </td>
                    <td className="py-3 px-4">
                      {r.status === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => act(r.id, 'approve')}
                            disabled={loading !== null}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                          >
                            <CheckCheck className="w-3 h-3" />
                            {loading === `${r.id}-approve` ? '…' : 'Aprovar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => act(r.id, 'deny')}
                            disabled={loading !== null}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                          >
                            <X className="w-3 h-3" />
                            {loading === `${r.id}-deny` ? '…' : 'Negar'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300 dark:text-v-dim">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="animate-fade-in-up-2 bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-v-primary mb-3">Fluxo de desbloqueio (M-016)</h2>
        <ol className="space-y-2 text-xs text-slate-500 dark:text-v-secondary list-decimal list-inside">
          <li>Admin A perde acesso ao telefone → acessa <code className="bg-slate-100 dark:bg-dash-surface px-1 rounded">/admin/mfa</code> → submete pedido com motivo</li>
          <li>Admin B (diferente de A) recebe notificação → aprova aqui usando seu próprio MFA</li>
          <li>Service-role unenrolls o TOTP factor de A → A pode re-enroll com novo telefone</li>
          <li>Evento registrado no audit log com IDs de ambos os admins</li>
        </ol>
        <p className="mt-3 text-xs text-slate-400 dark:text-v-dim italic">
          Status <strong>approved</strong> = pendente de execução (unenroll via Supabase Admin API). Status <strong>executed</strong> = factor removido.
          Execução automática pendente de implementação server-side.
        </p>
      </div>
    </div>
  );
}
