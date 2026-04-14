'use client';

import { useEffect, useState, useCallback } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Plus, Globe, Search, Sparkles, ChevronRight,
  PenLine, Video, Zap, Mic,
} from 'lucide-react';
import { ChannelLogo } from '@/components/channels/ChannelLogo';

interface Channel {
  id: string;
  name: string;
  niche: string | null;
  market: string;
  language: string;
  channel_type: string;
  media_types: string[];
  video_style: string | null;
  logo_url: string | null;
  youtube_url: string | null;
  blog_url: string | null;
  created_at: string;
}

interface ChannelCounts {
  [channelId: string]: { blog: number; video: number; shorts: number; podcast: number };
}

const MEDIA_ICONS: Record<string, React.ElementType> = {
  blog: PenLine,
  video: Video,
  shorts: Zap,
  podcast: Mic,
};

const MEDIA_LABELS: Record<string, string> = {
  blog: 'Blog',
  video: 'Video',
  shorts: 'Shorts',
  podcast: 'Podcast',
};

export default function ChannelsPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [counts] = useState<ChannelCounts>({});
  const [loading, setLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/channels');
      const json = await res.json();
      if (json.data?.items) setChannels(json.data.items);
      // TODO: fetch counts per channel when drafts have channel_id (F6-009)
    } catch {
      toast.error('Failed to load channels');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Card className="max-w-lg mx-auto mt-20">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">Create your first content channel</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm">
              A content channel is a project — can be a YouTube channel, blog, podcast, or a mix. Set up your niche and start producing content with AI.
            </p>
            <Button onClick={() => router.push('/onboarding')}>
              <Plus className="h-4 w-4 mr-2" /> Get Started
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Content Channels</h1>
          <p className="text-muted-foreground text-sm">
            {channels.length} content channel{channels.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => router.push('/onboarding')}>
          <Plus className="h-4 w-4 mr-2" /> New Content Channel
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {channels.map((channel) => {
          const mediaList = channel.media_types ?? ['blog'];
          const channelCounts = counts[channel.id] ?? { blog: 0, video: 0, shorts: 0, podcast: 0 };

          return (
            <Card key={channel.id} className="h-full hover:shadow-lg hover:border-primary/30 transition-all group">
              <CardContent className="p-5 space-y-4">
                {/* Header: logo + name + external destinations */}
                <Link href={`/channels/${channel.id}`} className="flex items-start gap-3">
                  <ChannelLogo logoUrl={channel.logo_url} name={channel.name} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-base truncate">{channel.name}</h3>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Globe className="h-2.5 w-2.5" />
                        {channel.language} &middot; {channel.market.toUpperCase()}
                      </span>
                    </div>
                    {channel.niche && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="text-foreground">{channel.niche}</span>
                      </p>
                    )}
                  </div>
                </Link>

                {/* Media mix badges */}
                <div className="flex flex-wrap gap-1.5">
                  {mediaList.map((m) => {
                    const Icon = MEDIA_ICONS[m];
                    const count = channelCounts[m as keyof typeof channelCounts] ?? 0;
                    return (
                      <Badge key={m} variant="outline" className="text-[10px] gap-1 py-1 px-2">
                        {Icon && <Icon className="h-2.5 w-2.5" />}
                        {MEDIA_LABELS[m] ?? m}
                        <span className="text-muted-foreground ml-0.5">{count}</span>
                      </Badge>
                    );
                  })}
                </div>

                {/* External destinations indicator */}
                {(channel.youtube_url || channel.blog_url) && (
                  <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                    {channel.youtube_url && (
                      <a
                        href={channel.youtube_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground truncate max-w-[150px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        YT: {channel.youtube_url.replace(/^https?:\/\/(www\.)?/, '')}
                      </a>
                    )}
                    {channel.blog_url && (
                      <a
                        href={channel.blog_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground truncate max-w-[150px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Blog: {channel.blog_url.replace(/^https?:\/\/(www\.)?/, '')}
                      </a>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-1.5 pt-1">
                  <Button variant="outline" size="sm" className="text-xs h-7 flex-1" asChild>
                    <Link href={`/channels/${channel.id}/create`}>
                      <Sparkles className="h-3 w-3 mr-1" /> Create
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs h-7 flex-1" asChild>
                    <Link href="/research">
                      <Search className="h-3 w-3 mr-1" /> Research
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
