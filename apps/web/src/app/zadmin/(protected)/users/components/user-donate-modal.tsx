'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/admin-path';
import type { UserListItem } from '@brighttale/shared/types/users';
import { Gift, X } from 'lucide-react';

interface Props {
  user: UserListItem;
  onClose: () => void;
}

export function UserDonateModal({ user, onClose }: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = parseInt(amount, 10);
    if (!parsed || parsed <= 0) { setError('Informe um valor maior que zero.'); return; }
    if (!reason.trim()) { setError('Motivo é obrigatório.'); return; }

    setLoading(true);
    const res = await fetch(adminApi('/donations'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientUserId: user.id, amount: parsed, reason: reason.trim() }),
    });
    const json = await res.json();
    setLoading(false);

    if (json.error) {
      setError(json.error.message ?? 'Erro inesperado.');
      return;
    }

    setSuccess(true);
    router.refresh();
    setTimeout(onClose, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-dash-card border border-slate-200 dark:border-dash-border rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dash-border">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-emerald-500" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-v-primary">Doar tokens</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dash-surface text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-500 dark:text-v-secondary">
            Destinatário: <span className="font-medium text-slate-800 dark:text-v-primary">{name}</span>
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-v-secondary mb-1.5">
              Quantidade de tokens
            </label>
            <input
              type="number"
              min={1}
              max={1_000_000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="ex: 500"
              className="w-full rounded-lg border border-slate-200 dark:border-dash-border bg-white dark:bg-dash-surface px-3 py-2 text-sm text-slate-800 dark:text-v-primary focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="mt-1 text-xs text-slate-400 dark:text-v-dim">
              Doações ≤ 1.000 tokens são executadas imediatamente. Acima disso requer aprovação de outro admin.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-v-secondary mb-1.5">
              Motivo <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex: Compensação por downtime, bonificação..."
              rows={3}
              className="w-full rounded-lg border border-slate-200 dark:border-dash-border bg-white dark:bg-dash-surface px-3 py-2 text-sm text-slate-800 dark:text-v-primary focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
          )}

          {success && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">
              ✓ Doação {parseInt(amount, 10) <= 1000 ? 'executada' : 'enviada para aprovação'} com sucesso!
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-dash-border text-slate-600 dark:text-v-secondary hover:bg-slate-50 dark:hover:bg-dash-surface transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Enviando…' : 'Confirmar doação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
