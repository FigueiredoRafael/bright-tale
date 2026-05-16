'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { SupportThreadDrawer } from './support-thread-drawer';

interface SupportThreadActionsProps {
  threadId: string;
  userId: string;
  escalationSummary: string | null;
  currentStatus: string;
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'Aberta' },
  { value: 'escalated', label: 'Escalada' },
  { value: 'resolved', label: 'Resolvida' },
  { value: 'closed', label: 'Fechada' },
];

const PRIORITY_OPTIONS = [
  { value: 'P0', label: 'P0 — Crítico' },
  { value: 'P1', label: 'P1 — Alto' },
  { value: 'P2', label: 'P2 — Médio' },
  { value: 'P3', label: 'P3 — Baixo' },
];

export function SupportThreadActions({
  threadId,
  userId,
  escalationSummary,
  currentStatus,
}: SupportThreadActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function updateThread(updates: { status?: string; priority?: string }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/zadmin/support/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const json = (await res.json()) as { data: unknown; error: { message: string } | null };
      if (!res.ok || json.error) {
        setError(json.error?.message ?? 'Erro ao atualizar thread');
        return;
      }
      router.refresh();
    } catch {
      setError('Erro de rede');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {error && (
          <span className="text-xs text-red-400">{error}</span>
        )}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-1 rounded border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-2 py-1 text-xs text-[var(--muted-foreground,#8b98b0)] hover:text-[var(--foreground,#e6edf7)] hover:border-blue-500/50 transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Ver conversa
        </button>
        <select
          disabled={loading}
          defaultValue=""
          onChange={(e) => {
            const val = e.target.value;
            if (val) {
              void updateThread({ priority: val });
              e.target.value = '';
            }
          }}
          className="rounded border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-2 py-1 text-xs text-[var(--foreground,#e6edf7)] disabled:opacity-50"
        >
          <option value="" disabled>Prioridade</option>
          {PRIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          disabled={loading}
          value={currentStatus}
          onChange={(e) => {
            const val = e.target.value;
            if (val !== currentStatus) {
              void updateThread({ status: val });
            }
          }}
          className="rounded border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-2 py-1 text-xs text-[var(--foreground,#e6edf7)] disabled:opacity-50"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {drawerOpen && (
        <SupportThreadDrawer
          threadId={threadId}
          userId={userId}
          escalationSummary={escalationSummary}
          onClose={() => setDrawerOpen(false)}
          onAction={() => router.refresh()}
        />
      )}
    </>
  );
}
