'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell as BellIcon, X, CheckCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
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

export function Bell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const sb = createClient();
  const sbAny = sb as any;

  const fetchNotifications = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const { data } = await sbAny
      .from('notifications')
      .select('id, type, title, body, action_url, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    const rows = (data ?? []) as Notification[];
    setNotifications(rows);
    setUnread(rows.filter((n) => !n.is_read).length);
  }, [sb, sbAny]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();

    const channel = sbAny.channel('notifications-bell');
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      () => { fetchNotifications(); },
    ).subscribe();

    return () => { sbAny.removeChannel(channel); };
  }, [fetchNotifications, sb, sbAny]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await sbAny
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', unreadIds);
    await fetchNotifications();
  };

  const markRead = async (id: string) => {
    await sbAny
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    await fetchNotifications();
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative w-[34px] h-[34px] rounded-[9px] border border-border flex items-center justify-center text-muted-foreground hover:border-[#2D3F55] hover:text-[#94A3B8] transition-all"
        title="Notificações"
      >
        <BellIcon className="h-[15px] w-[15px]" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">Notificações</span>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-secondary"
                >
                  <CheckCheck className="w-3 h-3" />
                  Marcar todas
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-secondary text-muted-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <BellIcon className="w-6 h-6 mb-2 opacity-40" />
                <p className="text-xs">Nenhuma notificação</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    markRead(n.id);
                    if (n.action_url) window.location.href = n.action_url;
                  }}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors ${!n.is_read ? 'bg-primary/5' : ''}`}
                >
                  <span className="text-base mt-0.5 shrink-0">{TYPE_ICONS[n.type] ?? '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-snug ${!n.is_read ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{n.body}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.is_read && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-border">
              <a href="/notifications" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Ver todas →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
