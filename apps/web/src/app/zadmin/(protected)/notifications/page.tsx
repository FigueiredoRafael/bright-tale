'use client';

import { useState, useTransition, useCallback, useEffect, useRef } from 'react';
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
  FileText,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
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

interface NotificationTemplate {
  type: string;
  label: string;
  titleTemplate: string;
  bodyTemplate: string | null;
  defaultActionUrl: string | null;
  availableVariables: string[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
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
// Template preview info box (shown in Send tab when a type is selected)
// ---------------------------------------------------------------------------

function TemplatePreview({ template }: { template: NotificationTemplate | null }) {
  if (!template) return null;
  return (
    <div className="rounded-lg border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)]/40 px-4 py-3 text-xs space-y-1">
      <p className="font-semibold text-[var(--muted-foreground,#8b98b0)] uppercase tracking-wider mb-2">
        Template padrão
      </p>
      <p className="text-[var(--muted-foreground,#8b98b0)]">
        <span className="font-medium text-[var(--foreground,#e6edf7)]">Título: </span>
        {template.titleTemplate}
      </p>
      {template.bodyTemplate && (
        <p className="text-[var(--muted-foreground,#8b98b0)]">
          <span className="font-medium text-[var(--foreground,#e6edf7)]">Corpo: </span>
          {template.bodyTemplate}
        </p>
      )}
      {template.availableVariables.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          <span className="font-medium text-[var(--foreground,#e6edf7)]">Variáveis: </span>
          {template.availableVariables.map((v) => (
            <span
              key={v}
              className="rounded bg-[var(--primary,#2DD4A8)]/10 px-1.5 py-0.5 font-mono text-[var(--primary,#2DD4A8)]"
            >
              {`{${v}}`}
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-[var(--muted-foreground,#8b98b0)] opacity-70">
        Se deixar título/corpo em branco, o template acima será usado automaticamente.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Enviar (Send)
// ---------------------------------------------------------------------------

function SendTab({
  isOwner,
  templates,
}: {
  isOwner: boolean;
  templates: NotificationTemplate[];
}) {
  const [target, setTarget] = useState<'user' | 'all'>('user');
  const [emailQuery, setEmailQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [isSearching, startSearch] = useTransition();
  // Use string so custom template types work without casting.
  const [type, setType] = useState<string>('announcement');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [variableInputs, setVariableInputs] = useState<Record<string, string>>({});
  const [isSending, startSend] = useTransition();
  const [status, setStatus] = useState<
    { kind: 'success'; message: string } | { kind: 'error'; message: string } | null
  >(null);

  const activeTemplate = templates.find((t) => t.type === type) ?? null;

  // When the type changes, reset per-variable inputs.
  const handleTypeChange = (newType: string) => {
    setType(newType);
    setVariableInputs({});
    setStatus(null);
  };

  const titleIsVariable = activeTemplate?.availableVariables.includes('title') ?? false;
  const bodyIsVariable = activeTemplate?.availableVariables.includes('body') ?? false;
  // Extra variables are those that are neither title nor body.
  const extraVariables =
    activeTemplate?.availableVariables.filter((v) => v !== 'title' && v !== 'body') ?? [];

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
      if (target === 'user' && !selectedUser) {
        setStatus({ kind: 'error', message: 'Selecione um usuário antes de enviar.' });
        return;
      }

      // Build the variables map from variableInputs.
      // If title/body are variables, they must be provided via variableInputs.
      const variables: Record<string, string> = { ...variableInputs };

      // Validate required variable fields.
      if (titleIsVariable) {
        const titleVal = variableInputs['title']?.trim() ?? '';
        if (!titleVal) {
          setStatus({ kind: 'error', message: 'O campo "Título" é obrigatório para este template.' });
          return;
        }
      }

      const payload: Record<string, unknown> = {
        target,
        type,
        actionUrl: actionUrl || undefined,
        variables: Object.keys(variables).length > 0 ? variables : undefined,
      };

      // title as a direct field: only when it is NOT a template variable.
      if (!titleIsVariable && title.trim()) {
        payload.title = title.trim();
      }

      // body as a direct field: only when it is NOT a template variable.
      if (!bodyIsVariable) {
        payload.body = body || undefined;
      }

      if (target === 'user') {
        payload.userId = selectedUser!.id;
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
      setVariableInputs({});
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

      {/* Type select — built from templates list, not a hardcoded enum */}
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
          onChange={(e) => handleTypeChange(e.target.value)}
          className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--card,#121826)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50"
        >
          {templates.length === 0 ? (
            <option value="announcement">announcement</option>
          ) : (
            templates.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))
          )}
        </select>

        {/* Template preview for selected type */}
        {activeTemplate && <TemplatePreview template={activeTemplate} />}
      </div>

      {/* Title — rendered as a variable input when the template uses {title} */}
      <div className="space-y-2">
        <label
          htmlFor="notif-title"
          className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]"
        >
          {titleIsVariable ? (
            <>
              Título{' '}
              <span className="text-red-400 normal-case font-normal">*obrigatório</span>
            </>
          ) : (
            <>
              Título{' '}
              <span className="text-[var(--muted-foreground,#8b98b0)] normal-case font-normal">
                (opcional — usa template se vazio)
              </span>
            </>
          )}
        </label>
        {titleIsVariable ? (
          <input
            id="notif-title"
            type="text"
            maxLength={120}
            required
            value={variableInputs['title'] ?? ''}
            onChange={(e) =>
              setVariableInputs((prev) => ({ ...prev, title: e.target.value }))
            }
            placeholder="Texto que substituirá {title} no template"
            className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--card,#121826)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50"
          />
        ) : (
          <>
            <input
              id="notif-title"
              type="text"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Deixe vazio para usar o template padrão"
              className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--card,#121826)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50"
            />
            <p className="text-right text-xs text-[var(--muted-foreground,#8b98b0)]">{title.length}/120</p>
          </>
        )}
      </div>

      {/* Body — rendered as a variable input when the template uses {body} */}
      <div className="space-y-2">
        <label
          htmlFor="notif-body"
          className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]"
        >
          {bodyIsVariable ? (
            <>Mensagem <span className="text-red-400 normal-case font-normal">*obrigatório</span></>
          ) : (
            <>Mensagem <span className="text-[var(--muted-foreground,#8b98b0)]">(opcional)</span></>
          )}
        </label>
        {bodyIsVariable ? (
          <textarea
            id="notif-body"
            maxLength={500}
            rows={3}
            required
            value={variableInputs['body'] ?? ''}
            onChange={(e) =>
              setVariableInputs((prev) => ({ ...prev, body: e.target.value }))
            }
            placeholder="Texto que substituirá {body} no template"
            className="w-full resize-none rounded-lg border border-[var(--border,#263146)] bg-[var(--card,#121826)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50"
          />
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Extra template variables (not title/body) */}
      {extraVariables.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
            Variáveis do template
          </p>
          {extraVariables.map((v) => (
            <div key={v} className="space-y-1.5">
              <label
                htmlFor={`var-${v}`}
                className="text-xs font-semibold text-[var(--muted-foreground,#8b98b0)]"
              >
                <span className="font-mono text-[var(--primary,#2DD4A8)]">{`{${v}}`}</span>
              </label>
              <input
                id={`var-${v}`}
                type="text"
                value={variableInputs[v] ?? ''}
                onChange={(e) =>
                  setVariableInputs((prev) => ({ ...prev, [v]: e.target.value }))
                }
                placeholder={`Valor para {${v}}`}
                className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--card,#121826)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50"
              />
            </div>
          ))}
        </div>
      )}

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
// Template editor row (accordion item)
// ---------------------------------------------------------------------------

interface TemplateRowProps {
  template: NotificationTemplate;
  isOwnerOrAdmin: boolean;
  onSaved: (updated: NotificationTemplate) => void;
}

function TemplateRow({ template, isOwnerOrAdmin, onSaved }: TemplateRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [titleTemplate, setTitleTemplate] = useState(template.titleTemplate);
  const [bodyTemplate, setBodyTemplate] = useState(template.bodyTemplate ?? '');
  const [defaultActionUrl, setDefaultActionUrl] = useState(template.defaultActionUrl ?? '');
  const [isSaving, startSave] = useTransition();
  const [rowStatus, setRowStatus] = useState<
    { kind: 'success'; message: string } | { kind: 'error'; message: string } | null
  >(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function insertVar(v: string, field: 'title' | 'body') {
    const placeholder = `{${v}}`;
    if (field === 'title' && titleRef.current) {
      const el = titleRef.current;
      const start = el.selectionStart ?? titleTemplate.length;
      const end = el.selectionEnd ?? titleTemplate.length;
      const next = titleTemplate.slice(0, start) + placeholder + titleTemplate.slice(end);
      setTitleTemplate(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + placeholder.length, start + placeholder.length);
      });
    } else if (field === 'body' && bodyRef.current) {
      const el = bodyRef.current;
      const start = el.selectionStart ?? bodyTemplate.length;
      const end = el.selectionEnd ?? bodyTemplate.length;
      const next = bodyTemplate.slice(0, start) + placeholder + bodyTemplate.slice(end);
      setBodyTemplate(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + placeholder.length, start + placeholder.length);
      });
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setRowStatus(null);
    startSave(async () => {
      const res = await fetch(adminApi(`/notification-templates/${template.type}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleTemplate,
          bodyTemplate: bodyTemplate || null,
          defaultActionUrl: defaultActionUrl || null,
        }),
      });
      const json = (await res.json()) as {
        data: NotificationTemplate | null;
        error: { message: string } | null;
      };
      if (!res.ok || json.error) {
        setRowStatus({ kind: 'error', message: json.error?.message ?? 'Erro ao salvar.' });
        return;
      }
      setRowStatus({ kind: 'success', message: 'Template salvo com sucesso.' });
      if (json.data) onSaved(json.data);
    });
  }

  return (
    <div className="border-b border-[var(--border,#263146)] last:border-0">
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-[var(--background,#0a0e1a)]/30 transition-colors"
      >
        <span className="rounded-md border border-[var(--border,#263146)] px-2 py-0.5 text-[11px] font-medium text-[var(--primary,#2DD4A8)]">
          {template.label}
        </span>
        <span className="font-mono text-xs text-[var(--muted-foreground,#8b98b0)]">{template.type}</span>
        <span className="flex-1" />
        {template.availableVariables.map((v) => (
          <span
            key={v}
            className="hidden sm:inline-block rounded bg-[var(--background,#0a0e1a)]/60 px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted-foreground,#8b98b0)]"
          >
            {`{${v}}`}
          </span>
        ))}
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-[var(--muted-foreground,#8b98b0)]" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted-foreground,#8b98b0)]" />
        )}
      </button>

      {/* Accordion body */}
      {expanded && (
        <form onSubmit={handleSave} className="px-5 pb-5 space-y-4">
          <StatusBanner status={rowStatus} />

          {/* Available variables as chips */}
          {template.availableVariables.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
                Variáveis disponíveis — clique para inserir
              </p>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-[var(--muted-foreground,#8b98b0)]">Título:</span>
                {template.availableVariables.map((v) => (
                  <button
                    key={`title-${v}`}
                    type="button"
                    onClick={() => insertVar(v, 'title')}
                    className="rounded bg-[var(--primary,#2DD4A8)]/10 px-1.5 py-0.5 font-mono text-xs text-[var(--primary,#2DD4A8)] hover:bg-[var(--primary,#2DD4A8)]/20 transition-colors"
                  >
                    {`{${v}}`}
                  </button>
                ))}
                {template.bodyTemplate !== undefined && (
                  <>
                    <span className="ml-2 text-xs text-[var(--muted-foreground,#8b98b0)]">Corpo:</span>
                    {template.availableVariables.map((v) => (
                      <button
                        key={`body-${v}`}
                        type="button"
                        onClick={() => insertVar(v, 'body')}
                        className="rounded bg-[var(--background,#0a0e1a)]/60 px-1.5 py-0.5 font-mono text-xs text-[var(--muted-foreground,#8b98b0)] hover:bg-[var(--background,#0a0e1a)] transition-colors"
                      >
                        {`{${v}}`}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Title template */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
              Título template
            </label>
            <input
              ref={titleRef}
              type="text"
              maxLength={300}
              required
              disabled={!isOwnerOrAdmin}
              value={titleTemplate}
              onChange={(e) => setTitleTemplate(e.target.value)}
              className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50 disabled:opacity-50"
            />
          </div>

          {/* Body template */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
              Corpo template <span className="normal-case font-normal">(opcional)</span>
            </label>
            <textarea
              ref={bodyRef}
              maxLength={1000}
              rows={3}
              disabled={!isOwnerOrAdmin}
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
              className="w-full resize-none rounded-lg border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50 disabled:opacity-50"
            />
          </div>

          {/* Default action URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
              URL de ação padrão <span className="normal-case font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              maxLength={500}
              disabled={!isOwnerOrAdmin}
              value={defaultActionUrl}
              onChange={(e) => setDefaultActionUrl(e.target.value)}
              placeholder="/settings/usage"
              className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50 disabled:opacity-50"
            />
          </div>

          {isOwnerOrAdmin && (
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 rounded-lg bg-[var(--primary,#2DD4A8)] px-4 py-2 text-sm font-semibold text-[var(--background,#0a0e1a)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Salvar
            </button>
          )}
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Templates
// ---------------------------------------------------------------------------

interface CreateFormState {
  type: string;
  label: string;
  titleTemplate: string;
  bodyTemplate: string;
  defaultActionUrl: string;
  availableVariablesRaw: string;
}

const EMPTY_CREATE_FORM: CreateFormState = {
  type: '',
  label: '',
  titleTemplate: '',
  bodyTemplate: '',
  defaultActionUrl: '',
  availableVariablesRaw: '',
};

function TemplatesTab({ isOwnerOrAdmin }: { isOwnerOrAdmin: boolean }) {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [isCreating, startCreate] = useTransition();
  const [createStatus, setCreateStatus] = useState<
    { kind: 'success'; message: string } | { kind: 'error'; message: string } | null
  >(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(adminApi('/notification-templates'));
      const json = (await res.json()) as {
        data: NotificationTemplate[] | null;
        error: { message: string } | null;
      };
      if (!res.ok || json.error) {
        setError(json.error?.message ?? 'Erro ao carregar templates.');
        return;
      }
      setTemplates(json.data ?? []);
    } catch {
      setError('Falha de rede ao carregar templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  function handleSaved(updated: NotificationTemplate) {
    setTemplates((prev) => prev.map((t) => (t.type === updated.type ? updated : t)));
  }

  function handleCreateField(field: keyof CreateFormState, value: string) {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateStatus(null);
    startCreate(async () => {
      const availableVariables = createForm.availableVariablesRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(adminApi('/notification-templates'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: createForm.type,
          label: createForm.label,
          titleTemplate: createForm.titleTemplate,
          bodyTemplate: createForm.bodyTemplate || null,
          defaultActionUrl: createForm.defaultActionUrl || null,
          availableVariables,
        }),
      });
      const json = (await res.json()) as {
        data: NotificationTemplate | null;
        error: { message: string } | null;
      };
      if (!res.ok || json.error) {
        setCreateStatus({ kind: 'error', message: json.error?.message ?? 'Erro ao criar template.' });
        return;
      }
      if (json.data) {
        setTemplates((prev) => [json.data as NotificationTemplate, ...prev]);
      }
      setCreateForm(EMPTY_CREATE_FORM);
      setShowCreate(false);
      setCreateStatus(null);
    });
  }

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

  return (
    <div className="space-y-4">
      {/* Create button — only for owners/admins */}
      {isOwnerOrAdmin && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setShowCreate((v) => !v);
              setCreateStatus(null);
              setCreateForm(EMPTY_CREATE_FORM);
            }}
            className="flex items-center gap-2 rounded-lg border border-[var(--primary,#2DD4A8)]/50 px-4 py-2 text-sm font-medium text-[var(--primary,#2DD4A8)] hover:bg-[var(--primary,#2DD4A8)]/10 transition-colors"
          >
            {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showCreate ? 'Cancelar' : 'Criar template'}
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && isOwnerOrAdmin && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-[var(--primary,#2DD4A8)]/30 bg-[var(--card,#121826)] p-5 space-y-4"
        >
          <p className="text-sm font-semibold text-[var(--foreground,#e6edf7)]">Novo template</p>
          <StatusBanner status={createStatus} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Type slug */}
            <div className="space-y-1.5">
              <label
                htmlFor="create-type"
                className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]"
              >
                Tipo (snake_case) <span className="text-red-400">*</span>
              </label>
              <input
                id="create-type"
                type="text"
                required
                maxLength={80}
                pattern="[a-z_]+"
                value={createForm.type}
                onChange={(e) => handleCreateField('type', e.target.value)}
                placeholder="meu_template"
                className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50"
              />
            </div>

            {/* Label */}
            <div className="space-y-1.5">
              <label
                htmlFor="create-label"
                className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]"
              >
                Rótulo <span className="text-red-400">*</span>
              </label>
              <input
                id="create-label"
                type="text"
                required
                maxLength={100}
                value={createForm.label}
                onChange={(e) => handleCreateField('label', e.target.value)}
                placeholder="Meu Template"
                className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50"
              />
            </div>
          </div>

          {/* Title template */}
          <div className="space-y-1.5">
            <label
              htmlFor="create-title-template"
              className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]"
            >
              Título template <span className="text-red-400">*</span>
            </label>
            <input
              id="create-title-template"
              type="text"
              required
              maxLength={300}
              value={createForm.titleTemplate}
              onChange={(e) => handleCreateField('titleTemplate', e.target.value)}
              placeholder="Olá {name}, seu pedido #{order_id} foi aprovado!"
              className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50"
            />
          </div>

          {/* Body template */}
          <div className="space-y-1.5">
            <label
              htmlFor="create-body-template"
              className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]"
            >
              Corpo template <span className="normal-case font-normal text-[var(--muted-foreground,#8b98b0)]">(opcional)</span>
            </label>
            <textarea
              id="create-body-template"
              maxLength={1000}
              rows={3}
              value={createForm.bodyTemplate}
              onChange={(e) => handleCreateField('bodyTemplate', e.target.value)}
              placeholder="Detalhes adicionais..."
              className="w-full resize-none rounded-lg border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Default action URL */}
            <div className="space-y-1.5">
              <label
                htmlFor="create-action-url"
                className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]"
              >
                URL de ação padrão <span className="normal-case font-normal text-[var(--muted-foreground,#8b98b0)]">(opcional)</span>
              </label>
              <input
                id="create-action-url"
                type="text"
                maxLength={500}
                value={createForm.defaultActionUrl}
                onChange={(e) => handleCreateField('defaultActionUrl', e.target.value)}
                placeholder="/settings"
                className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50"
              />
            </div>

            {/* Available variables */}
            <div className="space-y-1.5">
              <label
                htmlFor="create-variables"
                className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]"
              >
                Variáveis <span className="normal-case font-normal text-[var(--muted-foreground,#8b98b0)]">(separadas por vírgula)</span>
              </label>
              <input
                id="create-variables"
                type="text"
                value={createForm.availableVariablesRaw}
                onChange={(e) => handleCreateField('availableVariablesRaw', e.target.value)}
                placeholder="title, body, name"
                className="w-full rounded-lg border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-2 focus:ring-[var(--primary,#2DD4A8)]/50"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isCreating}
              className="flex items-center gap-2 rounded-lg bg-[var(--primary,#2DD4A8)] px-4 py-2 text-sm font-semibold text-[var(--background,#0a0e1a)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Criar template
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setCreateStatus(null);
                setCreateForm(EMPTY_CREATE_FORM);
              }}
              className="rounded-lg border border-[var(--border,#263146)] px-4 py-2 text-sm text-[var(--muted-foreground,#8b98b0)] hover:text-[var(--foreground,#e6edf7)] transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {templates.length === 0 && !showCreate ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--muted-foreground,#8b98b0)]">
          <FileText className="mb-3 h-8 w-8 opacity-30" />
          <p className="text-sm">Nenhum template encontrado.</p>
        </div>
      ) : (
        templates.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)]">
            {templates.map((t) => (
              <TemplateRow
                key={t.type}
                template={t}
                isOwnerOrAdmin={isOwnerOrAdmin}
                onSaved={handleSaved}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NotificationsPage() {
  const [tab, setTab] = useState<'send' | 'history' | 'templates'>('send');
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [isOwnerOrAdmin, setIsOwnerOrAdmin] = useState<boolean>(false);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        // Fetch templates so the Send tab can show previews immediately.
        const res = await fetch(adminApi('/notification-templates'));
        if (!res.ok) return;
        const json = (await res.json()) as {
          data: NotificationTemplate[] | null;
          error: { message: string } | null;
        };
        setTemplates(json.data ?? []);
        // If we could fetch templates we are at least a manager.
        // Default to treating the user as owner/admin for Send tab optimistically;
        // the API guards broadcast and template edits hard.
        setIsOwner(true);
        setIsOwnerOrAdmin(true);
      } catch {
        // No access — leave defaults (false).
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
        <button
          type="button"
          onClick={() => setTab('templates')}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'templates'
              ? 'bg-[var(--card,#121826)] text-[var(--foreground,#e6edf7)] shadow-sm'
              : 'text-[var(--muted-foreground,#8b98b0)] hover:text-[var(--foreground,#e6edf7)]'
          }`}
        >
          <FileText className="h-4 w-4" />
          Templates
        </button>
      </div>

      {/* Tab content */}
      <div className="rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)] p-6">
        {tab === 'send' && <SendTab isOwner={isOwner} templates={templates} />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'templates' && <TemplatesTab isOwnerOrAdmin={isOwnerOrAdmin} />}
      </div>
    </div>
  );
}
