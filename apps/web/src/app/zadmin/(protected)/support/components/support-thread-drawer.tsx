'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, Gift, CheckCircle, XCircle, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface SupportThreadDrawerProps {
  threadId: string;
  userId: string;
  escalationSummary: string | null;
  onClose: () => void;
  onAction: () => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function SupportThreadDrawer({
  threadId,
  userId,
  escalationSummary,
  onClose,
  onAction,
}: SupportThreadDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [userTyping, setUserTyping] = useState(false);
  const userTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Admin reply state
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [adminTyping, setAdminTyping] = useState(false);

  // Grant tokens state
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantAmount, setGrantAmount] = useState('500');
  const [grantNote, setGrantNote] = useState('');
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantDone, setGrantDone] = useState(false);

  // Status action + confirmation
  const [statusLoading, setStatusLoading] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const loadMessages = useCallback(async () => {
    setLoadingMsgs(true);
    try {
      const res = await fetch(`/api/zadmin/support/threads/${threadId}/messages`);
      const json = await res.json() as { data: { messages: Message[] } | null; error: unknown };
      setMessages(json.data?.messages ?? []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  }, [threadId]);

  useEffect(() => { void loadMessages(); }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, userTyping]);

  // Realtime: new messages + typing presence — same channel as user widget
  useEffect(() => {
    const channel = supabase
      .channel(`support-thread-${threadId}`)
      .on(
        'broadcast',
        { event: 'new_message' },
        (payload) => {
          const row = payload.payload as Message & { thread_id: string };
          if (row.role === 'user') {
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              return [...prev, row];
            });
            setUserTyping(false);
          }
        },
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ typing: boolean; who: string }>();
        const isUserTyping = Object.values(state).some(
          (entries) => entries.some((e) => e.who === 'user' && e.typing),
        );
        setUserTyping(isUserTyping);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channelRef.current = channel;
        }
      });

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // Broadcast admin typing — only after channel is subscribed
  const broadcastTyping = useCallback((typing: boolean) => {
    void channelRef.current?.track({ typing, who: 'admin' });
    setAdminTyping(typing);
  }, []);

  const handleReplyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReplyText(e.target.value);
    if (!adminTyping) broadcastTyping(true);
    // Stop typing after 2s idle
    clearTimeout(userTypingTimer.current ?? undefined);
    userTypingTimer.current = setTimeout(() => broadcastTyping(false), 2000);
  };

  async function sendReply() {
    if (!replyText.trim() || replySending) return;
    broadcastTyping(false);
    setReplySending(true);
    setReplyError(null);
    const content = replyText.trim();
    setReplyText('');
    try {
      const res = await fetch(`/api/zadmin/support/threads/${threadId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const json = await res.json() as { data: unknown; error: { message: string } | null };
      if (!res.ok || json.error) {
        setReplyError(json.error?.message ?? 'Erro ao enviar');
        setReplyText(content);
        return;
      }
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'human_agent',
        content,
        created_at: new Date().toISOString(),
      }]);
      onAction();
    } catch {
      setReplyError('Erro de rede');
      setReplyText(content);
    } finally {
      setReplySending(false);
    }
  }

  async function grantTokens() {
    const amount = parseInt(grantAmount, 10);
    if (!amount || amount <= 0) return;
    setGrantLoading(true);
    setGrantError(null);
    try {
      const res = await fetch(`/api/zadmin/support/threads/${threadId}/grant-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, note: grantNote || undefined }),
      });
      const json = await res.json() as { data: unknown; error: { message: string } | null };
      if (!res.ok || json.error) {
        setGrantError(json.error?.message ?? 'Erro ao conceder tokens');
        return;
      }
      setGrantDone(true);
      onAction();
    } catch {
      setGrantError('Erro de rede');
    } finally {
      setGrantLoading(false);
    }
  }

  async function updateStatus(status: string) {
    setStatusLoading(true);
    try {
      await fetch(`/api/zadmin/support/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      onAction();
      onClose();
    } catch {
      // ignore
    } finally {
      setStatusLoading(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 h-full w-full sm:w-[480px] flex flex-col bg-[var(--card,#121826)] border-l border-[var(--border,#263146)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border,#263146)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-[var(--foreground,#e6edf7)]">
              Thread <span className="font-mono text-xs text-[var(--muted-foreground,#8b98b0)]">{threadId.slice(-8)}</span>
            </p>
            <p className="text-xs text-[var(--muted-foreground,#8b98b0)] mt-0.5">
              uid: <span className="font-mono">{userId.slice(-12)}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--background,#0a0e1a)] transition-colors text-[var(--muted-foreground,#8b98b0)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Escalation summary */}
        {escalationSummary && (
          <div className="mx-5 mt-4 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-300 shrink-0">
            <span className="font-semibold">Resumo: </span>{escalationSummary}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3 min-h-0">
          {loadingMsgs ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--muted-foreground,#8b98b0)]" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-xs text-center text-[var(--muted-foreground,#8b98b0)] py-8">Nenhuma mensagem ainda.</p>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600/20 border border-blue-600/30 text-blue-100 rounded-br-sm'
                    : msg.role === 'human_agent'
                      ? 'bg-emerald-600/20 border border-emerald-600/30 text-emerald-100 rounded-bl-sm'
                      : 'bg-[var(--background,#0a0e1a)] border border-[var(--border,#263146)] text-[var(--foreground,#e6edf7)] rounded-bl-sm'
                }`}>
                  <p className={`mb-1 font-semibold ${msg.role === 'user' ? 'text-blue-300' : msg.role === 'human_agent' ? 'text-emerald-300' : 'text-purple-400'}`}>
                    {msg.role === 'user' ? 'Usuário' : msg.role === 'human_agent' ? 'Você (agente)' : 'IA Suporte'}
                  </p>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p className="mt-1 text-[10px] opacity-50">{formatTime(msg.created_at)}</p>
                </div>
              </div>
            ))
          )}

          {/* User typing indicator */}
          {userTyping && (
            <div className="flex justify-end">
              <div className="bg-blue-600/20 border border-blue-600/30 rounded-xl rounded-br-sm px-3 py-2">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Admin reply box */}
        <div className="border-t border-[var(--border,#263146)] px-4 pt-3 pb-2 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              value={replyText}
              onChange={handleReplyChange}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendReply(); } }}
              placeholder="Responder ao usuário... (Enter para enviar)"
              rows={2}
              disabled={replySending}
              className="flex-1 resize-none rounded-lg border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-3 py-2 text-xs text-[var(--foreground,#e6edf7)] placeholder:text-[var(--muted-foreground,#8b98b0)] focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={sendReply}
              disabled={!replyText.trim() || replySending}
              className="p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors shrink-0"
            >
              {replySending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          {replyError && <p className="text-xs text-red-400 mt-1">{replyError}</p>}
          <p className="text-[10px] text-[var(--muted-foreground,#8b98b0)]/50 mt-1">Usuário receberá email de notificação · Enter para enviar</p>
        </div>

        {/* Actions */}
        <div className="border-t border-[var(--border,#263146)] p-4 shrink-0 space-y-3">
          {/* Grant tokens */}
          {grantDone ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs text-emerald-400">
              <CheckCircle className="w-4 h-4 shrink-0" />
              Tokens concedidos e thread marcada como resolvida.
            </div>
          ) : grantOpen ? (
            <div className="rounded-lg border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] p-3 space-y-2">
              <p className="text-xs font-semibold text-[var(--foreground,#e6edf7)]">Conceder tokens ao usuário</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(e.target.value)}
                  min={1}
                  placeholder="Quantidade"
                  className="w-28 rounded border border-[var(--border,#263146)] bg-[var(--card,#121826)] px-2 py-1 text-xs text-[var(--foreground,#e6edf7)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs text-[var(--muted-foreground,#8b98b0)]">tokens</span>
              </div>
              <input
                type="text"
                value={grantNote}
                onChange={(e) => setGrantNote(e.target.value)}
                placeholder="Motivo (opcional)"
                className="w-full rounded border border-[var(--border,#263146)] bg-[var(--card,#121826)] px-2 py-1 text-xs text-[var(--foreground,#e6edf7)] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {grantError && <p className="text-xs text-red-400">{grantError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={grantTokens}
                  disabled={grantLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {grantLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gift className="w-3 h-3" />}
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => { setGrantOpen(false); setGrantError(null); }}
                  className="rounded-lg border border-[var(--border,#263146)] px-3 py-1.5 text-xs text-[var(--muted-foreground,#8b98b0)] hover:text-[var(--foreground,#e6edf7)] transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setGrantOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-600/40 bg-blue-600/10 px-3 py-2 text-xs font-medium text-blue-400 hover:bg-blue-600/20 transition-colors"
            >
              <Gift className="w-3.5 h-3.5" />
              Dar tokens / Reembolso
            </button>
          )}

          {/* Resolve / Close with confirmation */}
          {pendingStatus ? (
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2.5 space-y-2">
              <p className="text-xs text-orange-300 font-medium">
                {pendingStatus === 'resolved' ? 'Marcar como resolvida?' : 'Fechar este ticket?'}{' '}
                Esta ação notifica o usuário.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { void updateStatus(pendingStatus); setPendingStatus(null); }}
                  disabled={statusLoading}
                  className="flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
                >
                  {statusLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setPendingStatus(null)}
                  className="rounded-lg border border-[var(--border,#263146)] px-3 py-1.5 text-xs text-[var(--muted-foreground,#8b98b0)] hover:text-[var(--foreground,#e6edf7)] transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPendingStatus('resolved')}
                disabled={statusLoading}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-600/20 disabled:opacity-50 transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Resolver
              </button>
              <button
                type="button"
                onClick={() => setPendingStatus('closed')}
                disabled={statusLoading}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border,#263146)] px-3 py-2 text-xs font-medium text-[var(--muted-foreground,#8b98b0)] hover:text-[var(--foreground,#e6edf7)] hover:border-[var(--foreground,#e6edf7)]/30 disabled:opacity-50 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
