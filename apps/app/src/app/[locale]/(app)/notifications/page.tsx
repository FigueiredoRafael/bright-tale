'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, Filter } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  expires_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  donation_received: '🎁',
  donation_pending_approval: '⏳',
  tokens_reset: '🔄',
  plan_low: '⚠️',
  plan_renewed: '✅',
  job_done: '✅',
  announcement: '📢',
  coupon_redeemed: '🎟️',
  security: '🔒',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function NotificationsPage() {
  const sb = createClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);

  const sbAny = sb as any;

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await sbAny
      .from('notifications')
      .select('id, type, title, body, action_url, is_read, created_at, expires_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    setNotifications((data ?? []) as Notification[]);
    setLoading(false);
  }, [sb, sbAny]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetch();
  }, [fetch]);

  const markAllRead = async () => {
    const ids = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length === 0) return;
    await sbAny.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).in('id', ids);
    await fetch();
  };

  const markRead = async (id: string) => {
    await sbAny.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const visible = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notificações</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-muted-foreground mt-1">{unreadCount} não lida{unreadCount !== 1 ? 's' : ''}</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 hover:bg-secondary transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            Marcar todas como lidas
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        {(['all', 'unread'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${filter === f
              ? 'bg-foreground text-background border-foreground'
              : 'border-border text-muted-foreground hover:border-foreground/40'
            }`}
          >
            {f === 'all' ? 'Todas' : 'Não lidas'}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-secondary/40 animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Bell className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">{filter === 'unread' ? 'Nenhuma não lida.' : 'Nenhuma notificação.'}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                markRead(n.id);
                if (n.action_url) window.location.href = n.action_url;
              }}
              className={`text-left flex items-start gap-4 p-4 rounded-xl border transition-colors hover:border-foreground/30 hover:bg-secondary/30 ${
                !n.is_read
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border bg-card'
              }`}
            >
              <span className="text-2xl mt-0.5 shrink-0">{TYPE_ICONS[n.type] ?? '🔔'}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-snug ${!n.is_read ? 'font-semibold' : 'text-muted-foreground'}`}>
                  {n.title}
                </p>
                {n.body && (
                  <p className="text-sm text-muted-foreground mt-1">{n.body}</p>
                )}
                <p className="text-xs text-muted-foreground/60 mt-2">{formatDate(n.created_at)}</p>
              </div>
              {!n.is_read && (
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
