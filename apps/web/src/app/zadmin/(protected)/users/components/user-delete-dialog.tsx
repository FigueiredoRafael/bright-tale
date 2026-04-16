'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2, Trash2 } from 'lucide-react';
import { adminApi } from '@/lib/admin-path';
import type { UserListItem } from '@brighttale/shared/types/users';

interface UserDeleteDialogProps {
  user: UserListItem;
  onClose: () => void;
}

export function UserDeleteDialog({ user, onClose }: UserDeleteDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(adminApi(`/users/${user.id}`), {
        method: 'DELETE',
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? 'Erro ao deletar usuário');
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
            Excluir Usuário
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
          <div className="w-14 h-14 rounded-full flex items-center justify-center bg-red-100 dark:bg-red-900/20">
            <Trash2 className="w-7 h-7 text-red-600 dark:text-v-red" />
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-700 dark:text-v-primary">
              Excluir <strong>{name}</strong> permanentemente?
            </p>
            <p className="text-xs text-slate-400 dark:text-v-dim mt-1">
              Esta ação não pode ser desfeita. Todos os dados do usuário serão removidos.
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
            onClick={handleDelete}
            disabled={loading}
            className="h-9 px-4 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}
