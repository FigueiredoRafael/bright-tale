'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, X, Sparkles, ExternalLink } from 'lucide-react';

interface Notification {
  id: string;
  channel_id: string;
  reference_id: string;
  content_id: string | null;
  type: string;
  title: string;
  body: string | null;
  metadata_json: {
    video_external_id?: string;
    views?: number;
    likes?: number;
    comments?: number;
    engagement?: number;
    tags?: string[];
  };
  read_at: string | null;
  created_at: string;
}

interface Props {
  channelId: string;
}

export function ReferenceNotifications({ channelId }: Props) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`/api/channels/${channelId}/notifications?unread=true&limit=5`);
      const json = await res.json();
      if (json.data) {
        setNotifications(json.data.notifications ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  async function handleDismiss(notifId: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    await fetch(`/api/channels/${channelId}/notifications/${notifId}/dismiss`, { method: 'PATCH' });
  }

  async function handleModel(notif: Notification) {
    await fetch(`/api/channels/${channelId}/notifications/${notif.id}/read`, { method: 'PATCH' });

    const meta = notif.metadata_json;
    const params = new URLSearchParams({
      mode: 'reference_guided',
      ref_title: notif.title,
      ref_tags: (meta.tags ?? []).slice(0, 5).join(','),
    });
    if (meta.video_external_id) {
      params.set('ref_video', meta.video_external_id);
    }

    router.push(`/channels/${channelId}/brainstorm/new?${params.toString()}`);
  }

  if (loading || notifications.length === 0) return null;

  return (
    <div className="space-y-2">
      {notifications.map((notif) => (
        <Card key={notif.id} className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 py-3 px-4">
            <TrendingUp className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{notif.title}</p>
              {notif.body && (
                <p className="text-xs text-muted-foreground mt-0.5">{notif.body}</p>
              )}
              {notif.metadata_json.tags && notif.metadata_json.tags.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {notif.metadata_json.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {notif.metadata_json.video_external_id && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                  <a
                    href={`https://youtube.com/watch?v=${notif.metadata_json.video_external_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => handleModel(notif)}
              >
                <Sparkles className="h-3 w-3 mr-1" /> Modelar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => handleDismiss(notif.id)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
