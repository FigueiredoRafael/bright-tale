'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Loader2, ChevronDown, Clock, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'human_agent';
  content: string;
  streaming?: boolean;
  created_at?: string;
}

interface Thread {
  id: string;
  status: string;
  priority: string | null;
  last_message: string | null;
  message_count: number;
  updated_at: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Aberta',
  escalated: 'Aguardando agente',
  in_progress: 'Em atendimento',
  resolved: 'Resolvida',
  closed: 'Fechada',
};

const STATUS_COLOR: Record<string, string> = {
  open: 'text-blue-400',
  escalated: 'text-amber-400',
  in_progress: 'text-emerald-400',
  resolved: 'text-slate-400',
  closed: 'text-slate-500',
};

const LAST_READ_KEY = 'bt_support_last_read';

function getLastReadMap(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(LAST_READ_KEY) ?? '{}') as Record<string, number>;
  } catch { return {}; }
}

function markThreadRead(tid: string) {
  const map = getLastReadMap();
  map[tid] = Date.now();
  localStorage.setItem(LAST_READ_KEY, JSON.stringify(map));
}

function countUnread(thread: Thread, lastReadMap: Record<string, number>): number {
  if (thread.status === 'in_progress' || thread.status === 'escalated') {
    const lastRead = lastReadMap[thread.id] ?? 0;
    // We don't have per-message timestamps in the thread list, use updated_at as signal
    const updatedMs = new Date(thread.updated_at).getTime();
    return updatedMs > lastRead ? 1 : 0;
  }
  return 0;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'list' | 'chat'>('list');

  // Thread list
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [lastReadMap, setLastReadMap] = useState<Record<string, number>>({});

  // Active chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threadStatus, setThreadStatus] = useState<string>('open');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [adminTyping, setAdminTyping] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // Load thread list
  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const res = await fetch('/api/support/threads');
      const json = await res.json() as { data: { threads: Thread[] } | null; error: unknown };
      setThreads(json.data?.threads ?? []);
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  // Load threads on mount (for badge) and whenever widget opens
  useEffect(() => {
    setLastReadMap(getLastReadMap());
    void loadThreads();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) void loadThreads();
  }, [open, loadThreads]);


  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open && view === 'chat') inputRef.current?.focus();
  }, [open, view]);

  // Realtime background subscriptions: listen to ALL active threads for badge updates
  useEffect(() => {
    const activeThreads = threads.filter(
      (t) => t.status === 'escalated' || t.status === 'in_progress',
    );
    if (activeThreads.length === 0) return;

    const channels = activeThreads
      .filter((t) => t.id !== threadId) // skip the one already subscribed by the chat view
      .map((t) =>
        supabase
          .channel(`support-thread-${t.id}`)
          .on('broadcast', { event: 'new_message' }, (payload) => {
            const row = payload.payload as { id: string; thread_id: string; role: string };
            if (row.role === 'human_agent') {
              // Force lastReadMap refresh so badge appears
              setLastReadMap(getLastReadMap());
              // Also refresh thread list so updated_at is current
              void loadThreads();
            }
          })
          .subscribe(),
      );

    return () => {
      channels.forEach((ch) => { void supabase.removeChannel(ch); });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, threadId]);

  // Realtime: new messages + admin typing presence — single shared channel
  useEffect(() => {
    if (!threadId) return;

    const channel = supabase
      .channel(`support-thread-${threadId}`)
      .on(
        'broadcast',
        { event: 'new_message' },
        (payload) => {
          const row = payload.payload as { id: string; thread_id: string; role: string; content: string; created_at: string };
          if (row.role === 'human_agent') {
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              return [...prev, { id: row.id, role: 'human_agent', content: row.content, created_at: row.created_at }];
            });
            setThreadStatus('in_progress');
            setEscalated(false);
            setAdminTyping(false);
            // User is actively viewing — mark as read immediately
            if (row.thread_id) {
              markThreadRead(row.thread_id);
              setLastReadMap(getLastReadMap());
            }
          }
        },
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ typing: boolean; who: string }>();
        const isAdminTyping = Object.values(state).some(
          (entries) => entries.some((e) => e.who === 'admin' && e.typing),
        );
        setAdminTyping(isAdminTyping);
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

  const broadcastUserTyping = useCallback((typing: boolean) => {
    void channelRef.current?.track({ typing, who: 'user' });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    broadcastUserTyping(true);
    clearTimeout(typingTimer.current ?? undefined);
    typingTimer.current = setTimeout(() => broadcastUserTyping(false), 2000);
  };

  async function openThread(thread: Thread) {
    setThreadId(thread.id);
    setThreadStatus(thread.status);
    setEscalated(thread.status === 'escalated');
    setMessages([]);
    setView('chat');
    markThreadRead(thread.id);
    setLastReadMap(getLastReadMap());

    // Load existing messages
    try {
      const res = await fetch(`/api/support/threads/${thread.id}/messages`);
      const json = await res.json() as { data: { messages: { id: string; role: string; content: string; created_at: string }[] } | null; error: unknown };
      const rows = json.data?.messages ?? [];
      setMessages(rows.map((m) => ({
        id: m.id,
        role: m.role as Message['role'],
        content: m.content,
        created_at: m.created_at,
      })));
    } catch {
      setMessages([]);
    }
  }

  function startNewChat() {
    setThreadId(null);
    setThreadStatus('open');
    setEscalated(false);
    setMessages([{
      role: 'assistant',
      content: 'Olá! Sou o suporte da BrightTale. Como posso ajudar você hoje?',
    }]);
    setView('chat');
  }

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    const isHumanMode = escalated || threadStatus === 'in_progress';
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    // Only show streaming placeholder in AI mode
    if (!isHumanMode) {
      setMessages((prev) => [...prev, { role: 'assistant', content: '', streaming: true }]);
    }

    try {
      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, threadId: threadId ?? undefined }),
      });

      if (!res.ok || !res.body) throw new Error('Falha na conexão.');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let newThreadId = threadId;
      let humanMode = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const evt = JSON.parse(raw);
            if (evt.human_mode) humanMode = true;
            if (evt.threadId && !newThreadId) {
              newThreadId = evt.threadId;
              setThreadId(evt.threadId);
            }
            if (evt.text) {
              accumulated += evt.text;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'assistant', content: accumulated, streaming: true };
                return copy;
              });
            }
            if (evt.error) accumulated = 'Ocorreu um erro. Tente novamente.';
          } catch { /* skip */ }
        }
      }

      if (!isHumanMode) {
        if (humanMode) {
          // API flipped to human mode mid-conversation — remove placeholder
          setMessages((prev) => prev.slice(0, -1));
        } else {
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: accumulated, streaming: false };
            return copy;
          });
          if (accumulated.toLowerCase().includes('agente humano') || accumulated.toLowerCase().includes('escalado')) {
            setEscalated(true);
            setThreadStatus('escalated');
          }
        }
      }

      loadThreads();
    } catch {
      if (!isHumanMode) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: 'Não foi possível conectar. Tente novamente.', streaming: false };
          return copy;
        });
      }
    } finally {
      setSending(false);
    }
  }, [input, sending, threadId, escalated, threadStatus, loadThreads]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const isResolved = threadStatus === 'resolved' || threadStatus === 'closed';
  const totalUnread = threads.reduce((sum, t) => sum + countUnread(t, lastReadMap), 0);

  return (
    <>
      {/* Floating button */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Suporte"
          className="relative w-12 h-12 rounded-full bg-primary text-background shadow-lg flex items-center justify-center hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
        >
          {open ? <ChevronDown className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
          {!open && totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white min-w-[18px] leading-none">
              {totalUnread}
            </span>
          )}
        </button>
      </div>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-[88px] right-6 z-50 w-[360px] max-h-[560px] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              {view === 'chat' && (
                <button type="button" onClick={() => {
                  setView('list');
                  setThreadId(null);
                  setMessages([]);
                  loadThreads();
                }} className="p-1 rounded hover:bg-secondary transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-semibold">
                {view === 'list' ? 'Suporte BrightTale' : threadStatus !== 'open' ? STATUS_LABEL[threadStatus] ?? 'Chat' : 'Chat de Suporte'}
              </span>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── LIST VIEW ── */}
          {view === 'list' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* New conversation button */}
              <div className="px-4 pt-3 pb-2 shrink-0">
                <button
                  type="button"
                  onClick={startNewChat}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Nova conversa
                </button>
              </div>

              {/* Thread list */}
              <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-2 min-h-0">
                {loadingThreads ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : threads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/60">
                    <MessageCircle className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-xs">Nenhuma conversa anterior.</p>
                    <p className="text-xs">Inicie uma nova acima.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground font-medium mb-1">Conversas anteriores</p>
                    {threads.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => openThread(t)}
                        className="text-left flex flex-col gap-1 p-3 rounded-xl border border-border bg-background hover:border-primary/30 hover:bg-primary/5 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-medium ${STATUS_COLOR[t.status] ?? 'text-muted-foreground'}`}>
                              {STATUS_LABEL[t.status] ?? t.status}
                            </span>
                            {countUnread(t, lastReadMap) > 0 && (
                              <span className="inline-flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white min-w-[16px] leading-none">
                                novo
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {timeAgo(t.updated_at)}
                          </span>
                        </div>
                        {t.last_message && (
                          <p className="text-xs text-muted-foreground truncate">{t.last_message}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground/40">{t.message_count} mensagens</p>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── CHAT VIEW ── */}
          {view === 'chat' && (
            <>
              {/* Status banner */}
              {escalated && (
                <div className="mx-3 mt-3 shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                  Ticket encaminhado para agente humano. Você receberá um email quando houver resposta.
                </div>
              )}
              {threadStatus === 'in_progress' && (
                <div className="mx-3 mt-3 shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                  Um agente está atendendo você. As respostas aparecem aqui em tempo real.
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
                {messages.length === 0 && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={msg.id ?? i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-background rounded-br-sm'
                        : msg.role === 'human_agent'
                          ? 'bg-emerald-600/20 border border-emerald-600/30 text-foreground rounded-bl-sm'
                          : 'bg-secondary text-foreground rounded-bl-sm'
                    }`}>
                      {msg.role === 'human_agent' && (
                        <p className="text-[10px] text-emerald-400 font-semibold mb-1">Agente BrightTale</p>
                      )}
                      {msg.content}
                      {msg.streaming && (
                        <span className="inline-block w-1 h-4 ml-1 bg-current opacity-70 animate-pulse rounded-sm" />
                      )}
                    </div>
                  </div>
                ))}
                {/* Admin typing indicator */}
                {adminTyping && (
                  <div className="flex justify-start">
                    <div className="bg-emerald-600/20 border border-emerald-600/30 rounded-xl rounded-bl-sm px-3 py-2">
                      <p className="text-[10px] text-emerald-400 font-semibold mb-1">Agente BrightTale</p>
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              {isResolved ? (
                <div className="px-4 py-3 border-t border-border text-center shrink-0">
                  <p className="text-xs text-muted-foreground mb-2">Esta conversa foi encerrada.</p>
                  <button type="button" onClick={startNewChat} className="text-xs text-primary hover:underline">
                    Iniciar nova conversa
                  </button>
                </div>
              ) : (
                <div className="px-3 py-3 border-t border-border shrink-0">
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKey}
                      placeholder={escalated ? 'Aguardando agente — você ainda pode escrever...' : 'Digite sua mensagem...'}
                      rows={1}
                      disabled={sending}
                      className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 max-h-24 overflow-y-auto"
                    />
                    <button
                      type="button"
                      onClick={send}
                      disabled={!input.trim() || sending}
                      className="p-2 rounded-xl bg-primary text-background hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">Enter para enviar</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
