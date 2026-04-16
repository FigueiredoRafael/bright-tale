'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { adminApi } from '@/lib/admin-path';
import type { UserListItem } from '@brighttale/shared/types/users';

interface UserRoleModalProps {
  user: UserListItem;
  onClose: () => void;
}

export function UserRoleModal({ user, onClose }: UserRoleModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newRole = user.role === 'admin' ? 'user' : 'admin';
  const isPromoting = newRole === 'admin';

  const handleConfirm = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(adminApi(`/users/${user.id}/role`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? 'Erro ao alterar papel');
      }

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-dash-card rounded-xl shadow-lg p-6 w-full max-w-md border border-slate-200 dark:border-dash-border">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-v-primary">
            Alterar Papel
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dash-surface text-slate-400 dark:text-v-dim transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Icon + message */}
        <div className="flex flex-col items-center gap-3 py-4">
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center ${isPromoting ? 'bg-amber-100 dark:bg-amber-900/20' : 'bg-slate-100 dark:bg-dash-surface'}`}
          >
            {isPromoting ? (
              <ShieldCheck className="w-7 h-7 text-amber-600 dark:text-v-yellow" />
            ) : (
              <ShieldOff className="w-7 h-7 text-slate-500 dark:text-v-secondary" />
            )}
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-700 dark:text-v-primary">
              {isPromoting ? (
                <>
                  Promover <strong>{name}</strong> a <strong>administrador</strong>?
                </>
              ) : (
                <>
                  Remover privilégios de admin de <strong>{name}</strong>?
                </>
              )}
            </p>
            <p className="text-xs text-slate-400 dark:text-v-dim mt-1">
              {isPromoting
                ? 'O usuário terá acesso total ao painel admin.'
                : 'O usuário voltará a ser um usuário comum.'}
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-600 dark:text-v-red bg-red-50 dark:bg-red-900/10 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800/30 mb-4">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 text-sm rounded-lg border border-slate-200 dark:border-dash-border text-slate-600 dark:text-v-secondary hover:bg-slate-50 dark:hover:bg-dash-surface transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`h-9 px-4 text-sm rounded-lg font-medium disabled:opacity-50 flex items-center gap-2 transition-colors text-white ${isPromoting ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-600 hover:bg-slate-700 dark:bg-dash-surface dark:hover:bg-dash-card dark:border dark:border-dash-border dark:text-v-secondary'}`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isPromoting ? 'Promover' : 'Remover admin'}
          </button>
        </div>
      </div>
    </div>
  );
}
