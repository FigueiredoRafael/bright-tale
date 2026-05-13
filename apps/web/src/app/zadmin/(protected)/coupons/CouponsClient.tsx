'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/admin-path';
import { Tag, Plus, Archive, Copy, Check, X } from 'lucide-react';

interface CouponRow {
  id: string;
  code: string;
  kind: string;
  credits_amount: number;
  max_uses_total: number | null;
  max_uses_per_user: number;
  valid_from: string;
  valid_until: string | null;
  archived_at: string | null;
  created_at: string;
  coupon_redemptions: { count: number }[];
}

interface Props {
  initialCoupons: CouponRow[];
}

function relativeDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-v-primary transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CreateCouponForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [credits, setCredits] = useState('');
  const [maxTotal, setMaxTotal] = useState('');
  const [maxPerUser, setMaxPerUser] = useState('1');
  const [validUntil, setValidUntil] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const creditsN = parseInt(credits, 10);
    if (!code.trim() || !creditsN || creditsN <= 0) {
      setError('Código e quantidade de créditos são obrigatórios.');
      return;
    }

    setLoading(true);
    const res = await fetch(adminApi('/coupons'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code.trim().toUpperCase(),
        creditsAmount: creditsN,
        maxUsesTotal: maxTotal ? parseInt(maxTotal, 10) : null,
        maxUsesPerUser: parseInt(maxPerUser, 10) || 1,
        validUntil: validUntil || null,
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (json.error) { setError(json.error.message); return; }
    onCreated();
  };

  return (
    <div className="bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-v-primary">Novo cupom (credit_grant)</h3>
        <button type="button" onClick={onCancel} className="p-1 rounded text-muted-foreground hover:bg-slate-100 dark:hover:bg-dash-surface transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-600 dark:text-v-secondary mb-1">Código</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ex: WELCOME500"
            className="w-full rounded-lg border border-slate-200 dark:border-dash-border bg-white dark:bg-dash-surface px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-v-secondary mb-1">Créditos</label>
          <input
            type="number" min={1} value={credits} onChange={(e) => setCredits(e.target.value)}
            placeholder="500"
            className="w-full rounded-lg border border-slate-200 dark:border-dash-border bg-white dark:bg-dash-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-v-secondary mb-1">Usos por user</label>
          <input
            type="number" min={1} value={maxPerUser} onChange={(e) => setMaxPerUser(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-dash-border bg-white dark:bg-dash-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-v-secondary mb-1">Usos totais (vazio = ilimitado)</label>
          <input
            type="number" min={1} value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)}
            placeholder="ilimitado"
            className="w-full rounded-lg border border-slate-200 dark:border-dash-border bg-white dark:bg-dash-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-v-secondary mb-1">Expira em (opcional)</label>
          <input
            type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value ? new Date(e.target.value).toISOString() : '')}
            className="w-full rounded-lg border border-slate-200 dark:border-dash-border bg-white dark:bg-dash-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        {error && <p className="col-span-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded px-3 py-2">{error}</p>}

        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-dash-border text-slate-600 dark:text-v-secondary hover:bg-slate-50 dark:hover:bg-dash-surface transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={loading} className="px-4 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors disabled:opacity-50">
            {loading ? 'Criando…' : 'Criar cupom'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function CouponsClient({ initialCoupons }: Props) {
  const router = useRouter();
  const [coupons, setCoupons] = useState(initialCoupons);
  const [creating, setCreating] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(adminApi('/coupons'));
    const json = await res.json();
    if (json.data) setCoupons(json.data);
  }, []);

  const handleArchive = async (id: string) => {
    if (!confirm('Arquivar este cupom?')) return;
    setArchivingId(id);
    await fetch(adminApi(`/coupons/${id}/archive`), { method: 'POST' });
    setArchivingId(null);
    await refetch();
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex justify-between items-start animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-v-primary tracking-tight">Cupons</h1>
          <p className="text-sm text-slate-500 dark:text-v-secondary mt-1">
            Cupons de crédito grátis (credit_grant). Desconto percentual/fixo via Stripe — configurar no Stripe Dashboard.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo cupom
        </button>
      </div>

      {creating && (
        <div className="animate-fade-in-up">
          <CreateCouponForm
            onCreated={async () => { setCreating(false); await refetch(); router.refresh(); }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {/* Table */}
      <div className="animate-fade-in-up-1 bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-xl shadow-sm overflow-hidden">
        {coupons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-v-dim">
            <Tag className="w-8 h-8 mb-3 opacity-40" />
            <p className="text-sm">Nenhum cupom criado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-dash-border">
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim">Código</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim">Créditos</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim hidden md:table-cell">Usos</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim hidden lg:table-cell">Expira</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim">Status</th>
                  <th className="py-3 px-4 text-right"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => {
                  const redemptions = c.coupon_redemptions?.[0]?.count ?? 0;
                  const isExpired = c.valid_until && new Date(c.valid_until) < new Date();
                  const isArchived = !!c.archived_at;
                  const isActive = !isArchived && !isExpired;

                  return (
                    <tr
                      key={c.id}
                      className="border-b border-slate-50 dark:border-dash-border/50 hover:bg-slate-50 dark:hover:bg-dash-surface/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-semibold text-slate-800 dark:text-v-primary">{c.code}</span>
                          <CopyButton text={c.code} />
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono font-semibold text-violet-600 dark:text-violet-400">
                          +{c.credits_amount.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-4 hidden md:table-cell">
                        <span className="text-xs text-slate-500 dark:text-v-secondary">
                          {redemptions} / {c.max_uses_total ?? '∞'}
                          <span className="text-slate-400 dark:text-v-dim"> (max {c.max_uses_per_user}/user)</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 hidden lg:table-cell">
                        <span className="text-xs text-slate-400 dark:text-v-dim">
                          {c.valid_until ? relativeDate(c.valid_until) : '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {isArchived ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-dash-surface text-slate-400 dark:text-v-dim border border-slate-200 dark:border-dash-border">Arquivado</span>
                        ) : isExpired ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/30">Expirado</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/30">Ativo</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isActive && (
                          <button
                            type="button"
                            disabled={archivingId === c.id}
                            onClick={() => handleArchive(c.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                            title="Arquivar"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
