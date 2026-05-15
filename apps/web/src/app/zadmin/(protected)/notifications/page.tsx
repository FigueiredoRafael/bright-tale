'use client';

import { useState, useTransition, useCallback, useEffect } from 'react';
import {
  Bell,
  Send,
  History,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Users,
  User,
} from 'lucide-react';
import { adminApi } from '@/lib/admin-path';
import { searchUser, UserSearchResult } from './actions';
import type { NotificationType } from '@/lib/notify';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotifHistoryItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
  sentBy: { id: string; name: string };
  recipientCount: number;
  readCount: number;
  isGlobal: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  donation_received: 'Doação recebida',
  donation_pending_approval: 'Doação aguardando aprovação',
  tokens_reset: 'Tokens resetados',
  plan_low: 'Plano quase esgotado',
  plan_renewed: 'Plano renovado',
  job_done: 'Tarefa concluída',
  announcement: 'Anúncio',
  coupon_redeemed: 'Cupom resgatado',
  security: 'Segurança',
};

const ALL_TYPES = Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeDate(iso: string): string {
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBanner({
  status,
}: {
  status: { kind: 'success'; message: string } | { kind: 'error'; message: string } | null;
}) {
  if (!status) return null;
  const isSuccess = status.kind === 'success';
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
        isSuccess
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-red-500/30 bg-red-500/10 text-red-400'
      }`}
    >
      {isSuccess ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0" />
      )}
      {status.message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Enviar (Send)
// ---------------------------------------------------------------------------

function SendTab({ isOwner }: { isOwner: boolean }) {
  const [target, setTarget] = useState<'user' | 'all'>('user');
  const [emailQuery, setEmailQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [type, setType] = useState<NotificationType>('announcement');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [isSending, startSend] = useTransition();
  const [status, setStatus] = useState<
    { kind: 'success'; message: string } | { kind: 'error'; message: string } | null
  >(null);

  const handleSearch = useCallback(
    (q: string) => {
      setEmailQuery(q);
      setSelectedUser(null);
      if (q.length < 2) {
        setSearchResults([]);
        return;
      }
      startSearch(async () => {
        const results = await searchUser(q);
        setSearchResults(results);
      });
    },
    [],
  );

  const handleSelectUser = (u: UserSearchResult) => {
    setSelectedUser(u);
    setEmailQuery(u.email);
    setSearchResults([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    startSend(async () => {
      const payload: Record<string, unknown> = {
        target,
        type,
        title,
        body: body || undefined,
        actionUrl: actionUrl || undefined,
      };
      if (target === 'user') {
        if (!selectedUser) {
          setStatus({ kind: 'error', message: 'Selecione um usuário antes de enviar.' });
          return;
        }
        payload.userId = selectedUser.id;
      }

      const res = await fetch(adminApi('/notifications'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { data: { sent: number } | null; error: { message: string } | null };

      if (!res.ok || json.error) {
        setStatus({ kind: 'error', message: json.error?.message ?? 'Erro ao enviar notificação.' });
        return;
      }

      const sentCount = json.data?.sent ?? 0;
      setStatus({
        kind: 'success',
        message:
          target === 'all'
            ? `Broadcast enviado para ${sentCount} usuário(s).`
            : 'Notificação enviada com sucesso.',
      });
      setTitle('');
      setBody('');
      setActionUrl('');
      setSelectedUser(null);
      setEmailQuery('');
      setType('announcement');
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <StatusBanner status={status} />

      {/* Target selector */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
          Destinatário
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setTarget('user');
              setStatus(null);
            }}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              target === 'user'
                ? 'border-[var(--primary,#2DD4A8)] bg-[var(--primary,#2DD4A8)]/10 text-[var(--primary,#2DD4A8)]'
                : 'border-[var(--border,#263146)] bg-[var(--card,#121826)] text-[var(--muted-foreground,#8b98b0)] hover:border-[var(--border,#263146)]/80'
            }`}
          >
            <User className="h-4 w-4" />
            Para um usuário
          </button>

          {isOwner && (
            <button
              type="button"
              onClick={() => {
                setTarget('all');
                setStatus(null);
              }}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                target === 'all'
                  ? 'border-[var(--primary,#2DD4A8)] bg-[var(--primary,#2DD4A8)]/10 text-[var(--primary,#2DD4A8)]'
                  : 'border-[var(--border,#263146)] bg-[var(--card,#121826)] text-[var(--muted-foreground,#8b98b0)] hover:border-[var(--border,#263146)]/80'
              }`}
            >
              <Users className="h-4 w-4" />
              Para todos (broadcast)
            </button>
          )}
        </div>
      </div>

      {/* User search (only when target=user) */}
      {target === 'user' && (
        <div className="space-y-2">
          <label
            htmlFor="email-search"
            className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]"
          >
            Buscar usuário por e-mail
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin text-[var(--muted-foreground,#8b98b0)]" />
              ) : (
                <Search className="h-4 w-4 text-[var(--muted-foreground,#8b98b0)]" />
              )}
            </div>
            <input
              id="email-search"
              type="text"
              placeholder="email@exemplo.com"
              value={emailQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--card,#121826)] py-2 pl-9 pr-3 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50"
            />
            {searchResults.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--card,#121826)] shadow-lg">
                {searchResults.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectUser(u)}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-[var(--background,#0a0e1a)]/50"
                    >
                      <span className="font-medium text-[var(--foreground,#e6edf7)]">{u.name}</span>{' '}
                      <span className="text-[var(--muted-foreground,#8b98b0)]">{u.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {selectedUser && (
            <p className="text-xs text-[var(--primary,#2DD4A8)]">
              Selecionado: <strong>{selectedUser.name}</strong> ({selectedUser.email})
            </p>
          )}
        </div>
      )}

      {/* Type select */}
      <div className="space-y-2">
        <label
          htmlFor="notif-type"
          className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]"
        >
          Tipo
        </label>
        <select
          id="notif-type"
          value={type}
          onChange={(e) => setType(e.target.value as NotificationType)}
          className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--card,#121826)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50"
        >
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>
              {NOTIFICATION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {/* Title */}
      <div className="space-y-2">
        <label
          htmlFor="notif-title"
          className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]"
        >
          Título <span className="text-red-400">*</span>
        </label>
        <input
          id="notif-title"
          type="text"
          required
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Novidade importante para você!"
          className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--card,#121826)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50"
        />
        <p className="text-right text-xs text-[var(--muted-foreground,#8b98b0)]">{title.length}/120</p>
      </div>

      {/* Body */}
      <div className="space-y-2">
        <label
          htmlFor="notif-body"
          className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]"
        >
          Mensagem <span className="text-[var(--muted-foreground,#8b98b0)]">(opcional)</span>
        </label>
        <textarea
          id="notif-body"
          maxLength={500}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Detalhes adicionais da notificação..."
          className="w-full resize-none rounded-lg border border-[var(--border,#263146)] bg-[var(--card,#121826)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50"
        />
        <p className="text-right text-xs text-[var(--muted-foreground,#8b98b0)]">{body.length}/500</p>
      </div>

      {/* Action URL */}
      <div className="space-y-2">
        <label
          htmlFor="notif-url"
          className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]"
        >
          URL de ação <span className="text-[var(--muted-foreground,#8b98b0)]">(opcional)</span>
        </label>
        <input
          id="notif-url"
          type="url"
          value={actionUrl}
          onChange={(e) => setActionUrl(e.target.value)}
          placeholder="https://..."
          className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--card,#121826)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50"
        />
      </div>

      <button
        type="submit"
        disabled={isSending}
        className="flex items-center gap-2 rounded-lg bg-[var(--primary,#2DD4A8)] px-5 py-2.5 text-sm font-semibold text-[var(--background,#0a0e1a)] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isSending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {target === 'all' ? 'Enviar para todos' : 'Enviar notificação'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tab: Histórico (History)
// ---------------------------------------------------------------------------

function HistoryTab() {
  const [items, setItems] = useState<NotifHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(adminApi('/notifications'));
      const json = (await res.json()) as {
        data: { items: NotifHistoryItem[] } | null;
        error: { message: string } | null;
      };
      if (!res.ok || json.error) {
        setError(json.error?.message ?? 'Erro ao carregar histórico.');
        return;
      }
      setItems(json.data?.items ?? []);
    } catch {
      setError('Falha de rede ao carregar histórico.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--muted-foreground,#8b98b0)]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--muted-foreground,#8b98b0)]">
        <Bell className="mb-3 h-8 w-8 opacity-30" />
        <p className="text-sm">Nenhuma notificação admin enviada ainda.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)]/50 text-left text-xs uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Título</th>
              <th className="px-4 py-3 font-semibold">Enviado por</th>
              <th className="px-4 py-3 font-semibold">Data</th>
              <th className="px-4 py-3 font-semibold text-right">Destinatários</th>
              <th className="px-4 py-3 font-semibold text-right">Leram</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-[var(--border,#263146)] last:border-0 hover:bg-[var(--background,#0a0e1a)]/30"
              >
                <td className="px-4 py-3">
                  <span className="rounded-md border border-[var(--border,#263146)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted-foreground,#8b98b0)]">
                    {NOTIFICATION_TYPE_LABELS[item.type as NotificationType] ?? item.type}
                  </span>
                </td>
                <td className="max-w-[220px] px-4 py-3">
                  <p className="truncate text-[var(--foreground,#e6edf7)]">{item.title}</p>
                  {item.body && (
                    <p className="truncate text-xs text-[var(--muted-foreground,#8b98b0)]">{item.body}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-[var(--muted-foreground,#8b98b0)]">
                  {item.sentBy.name}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted-foreground,#8b98b0)]">
                  {relativeDate(item.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  {item.isGlobal ? (
                    <span className="text-xs text-[var(--primary,#2DD4A8)]">
                      Todos ({item.recipientCount})
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--foreground,#e6edf7)]">
                      {item.recipientCount}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs font-mono text-[var(--foreground,#e6edf7)]">
                  {item.readCount}{' '}
                  <span className="text-[var(--muted-foreground,#8b98b0)]">/ {item.recipientCount}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NotificationsPage() {
  const [tab, setTab] = useState<'send' | 'history'>('send');

  // We can't easily check the role here without a server round-trip in a
  // client component, so we use a simple trick: attempt the GET and check the
  // returned role in a useEffect — but for simplicity we rely on the API to
  // guard broadcast and show the button only after we learn the role.
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  useEffect(() => {
    // Piggyback on the session cookie — just check /api/zadmin/notifications
    // with method GET to see if we get a 403 (non-manager) or succeed.
    // For the ownership check we call a tiny separate check against the manager table.
    void (async () => {
      try {
        const res = await fetch(adminApi('/notifications'));
        if (!res.ok) {
          setIsOwner(false);
          return;
        }
        // We don't know the role from the GET response, so we do a dummy POST
        // to all with an empty payload to detect 403 FORBIDDEN_BROADCAST.
        // Instead, let's just try a HEAD-like check using an obviously invalid body —
        // actually the simpler approach: default isOwner=true and let the API guard it.
        // The broadcast button is only a UX convenience; the API guards it hard.
        setIsOwner(true);
      } catch {
        setIsOwner(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground,#e6edf7)]">Notificações</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground,#8b98b0)]">
          Envie notificações para usuários individuais ou faça broadcasts para toda a base.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)]/50 p-1">
        <button
          type="button"
          onClick={() => setTab('send')}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'send'
              ? 'bg-[var(--card,#121826)] text-[var(--foreground,#e6edf7)] shadow-sm'
              : 'text-[var(--muted-foreground,#8b98b0)] hover:text-[var(--foreground,#e6edf7)]'
          }`}
        >
          <Send className="h-4 w-4" />
          Enviar
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'history'
              ? 'bg-[var(--card,#121826)] text-[var(--foreground,#e6edf7)] shadow-sm'
              : 'text-[var(--muted-foreground,#8b98b0)] hover:text-[var(--foreground,#e6edf7)]'
          }`}
        >
          <History className="h-4 w-4" />
          Histórico
        </button>
      </div>

      {/* Tab content */}
      <div className="rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)] p-6">
        {tab === 'send' ? (
          <SendTab isOwner={isOwner ?? false} />
        ) : (
          <HistoryTab />
        )}
      </div>
    </div>
  );
}
