'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2 } from 'lucide-react';
import type { UserListItem } from '@brighttale/shared/types/users';

interface UserEditModalProps {
  user: UserListItem;
  onClose: () => void;
}

export function UserEditModal({ user, onClose }: UserEditModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState(user.firstName ?? '');
  const [lastName, setLastName] = useState(user.lastName ?? '');
  const [isActive, setIsActive] = useState(user.isActive);
  const [isPremium, setIsPremium] = useState(user.isPremium);
  const [premiumPlan, setPremiumPlan] = useState<'monthly' | 'yearly'>(
    user.premiumPlan ?? 'monthly',
  );
  const [premiumExpiresAt, setPremiumExpiresAt] = useState(
    user.premiumExpiresAt ? user.premiumExpiresAt.slice(0, 10) : '',
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        isActive,
        isPremium,
      };

      if (isPremium) {
        body.premiumPlan = premiumPlan;
        body.premiumExpiresAt = premiumExpiresAt
          ? new Date(premiumExpiresAt).toISOString()
          : undefined;
      }

      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? 'Erro ao salvar');
      }

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full h-9 px-3 text-sm bg-white dark:bg-dash-surface border border-slate-200 dark:border-dash-border rounded-lg text-slate-700 dark:text-v-primary placeholder:text-slate-400 dark:placeholder:text-v-dim focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-v-blue/50 transition-colors';
  const labelClass = 'block text-xs font-medium text-slate-500 dark:text-v-secondary mb-1';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-dash-card rounded-xl shadow-lg p-6 w-full max-w-md border border-slate-200 dark:border-dash-border">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-v-primary">
            Editar Usuário
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dash-surface text-slate-400 dark:text-v-dim transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Nome</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Nome"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Sobrenome</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Sobrenome"
                className={inputClass}
              />
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-dash-border">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-v-primary">Conta ativa</p>
              <p className="text-xs text-slate-400 dark:text-v-dim">Permite login na plataforma</p>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-dash-border'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>

          {/* Premium toggle */}
          <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-dash-border">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-v-primary">Premium</p>
              <p className="text-xs text-slate-400 dark:text-v-dim">Acesso a recursos pagos</p>
            </div>
            <button
              type="button"
              onClick={() => setIsPremium(!isPremium)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isPremium ? 'bg-amber-500' : 'bg-slate-300 dark:bg-dash-border'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isPremium ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>

          {/* Premium fields */}
          {isPremium && (
            <div className="flex flex-col gap-3 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800/30">
              <div>
                <label className={labelClass}>Plano</label>
                <select
                  value={premiumPlan}
                  onChange={(e) => setPremiumPlan(e.target.value as 'monthly' | 'yearly')}
                  className={inputClass}
                >
                  <option value="monthly">Mensal</option>
                  <option value="yearly">Anual</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Expira em</label>
                <input
                  type="date"
                  value={premiumExpiresAt}
                  onChange={(e) => setPremiumExpiresAt(e.target.value)}
                  className={inputClass}
                  required={isPremium}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-600 dark:text-v-red bg-red-50 dark:bg-red-900/10 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800/30">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-sm rounded-lg border border-slate-200 dark:border-dash-border text-slate-600 dark:text-v-secondary hover:bg-slate-50 dark:hover:bg-dash-surface transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="h-9 px-4 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-v-blue dark:hover:bg-v-blue/80 text-white font-medium disabled:opacity-50 flex items-center gap-2 transition-colors"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
