'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SupportThreadDrawer, type IncomingMessage } from './support-thread-drawer';

interface SupportThreadActionsProps {
  threadId: string;
  userId: string;
  escalationSummary: string | null;
  currentStatus: string;
  userUnreadCount: number;
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'Aberta' },
  { value: 'escalated', label: 'Escalada' },
  { value: 'in_progress', label: 'Em atendimento' },
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
  userUnreadCount: initialUnread,
}: SupportThreadActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [liveUnread, setLiveUnread] = useState(initialUnread);
  const [incomingMessages, setIncomingMessages] = useState<IncomingMessage[]>([]);
  const supabaseRef = useRef(createClient());
  const drawerOpenRef = useRef(drawerOpen);
  drawerOpenRef.current = drawerOpen;

  // Keep in sync if server re-renders with a new value
  useEffect(() => { setLiveUnread(initialUnread); }, [initialUnread]);

  // Realtime: single subscription lives here — drawer inherits via props
  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`support-thread-${threadId}`)
      .on('broadcast', { event: 'new_message' }, (payload) => {
        const row = payload.payload as IncomingMessage & { thread_id: string };
        if (row.role === 'user') {
          if (drawerOpenRef.current) {
            setIncomingMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              return [...prev, row];
            });
          } else {
            setLiveUnread((n) => n + 1);
          }
        }
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [threadId]);

  function handleOpenDrawer() {
    setLiveUnread(0); // optimistic reset — GET /messages will reset in DB too
    setIncomingMessages([]);
    setDrawerOpen(true);
  }

  function handleCloseDrawer() {
    setIncomingMessages([]);
    setDrawerOpen(false);
  }

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
          onClick={handleOpenDrawer}
          className={`relative flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors ${
            liveUnread > 0
              ? 'border-blue-500/60 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20'
              : 'border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] text-[var(--muted-foreground,#8b98b0)] hover:text-[var(--foreground,#e6edf7)] hover:border-blue-500/50'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {liveUnread > 0 ? `${liveUnread} nova${liveUnread > 1 ? 's' : ''}` : 'Ver conversa'}
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
          newMessages={incomingMessages}
          onClose={handleCloseDrawer}
          onAction={() => router.refresh()}
        />
      )}
    </>
  );
}
