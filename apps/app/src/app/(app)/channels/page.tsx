'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Plus,
  Video,
  FileText,
  Ghost,
  Layers,
  Globe,
  Search,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

interface Channel {
  id: string;
  name: string;
  niche: string | null;
  market: string;
  language: string;
  channel_type: string;
  youtube_url: string | null;
  youtube_subs: number | null;
  youtube_monthly_views: number | null;
  created_at: string;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  text: { label: 'Text', icon: FileText, color: 'text-blue-500 bg-blue-500/10' },
  face: { label: 'Com Rosto', icon: Video, color: 'text-green-500 bg-green-500/10' },
  dark: { label: 'Dark Channel', icon: Ghost, color: 'text-purple-500 bg-purple-500/10' },
  hybrid: { label: 'Hybrid', icon: Layers, color: 'text-amber-500 bg-amber-500/10' },
};

function formatNumber(n: number | null): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function ChannelsPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/channels');
      const json = await res.json();
      if (json.data?.items) setChannels(json.data.items);
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
              A channel is a content project — YouTube, blog, or both.
              Set up your niche, language, and style to start producing content.
            </p>
            <Button onClick={() => router.push('/onboarding')}>
              <Plus className="h-4 w-4 mr-2" />
              Get Started
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
          <Plus className="h-4 w-4 mr-2" />
          New Content Channel
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {channels.map((channel) => {
          const typeConfig = TYPE_CONFIG[channel.channel_type] ?? TYPE_CONFIG.text;
          const TypeIcon = typeConfig.icon;

          return (
            <Link key={channel.id} href={`/channels/${channel.id}`}>
              <Card className="h-full hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${typeConfig.color}`}>
                        <TypeIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {channel.name}
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </CardTitle>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {typeConfig.label}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Globe className="h-2.5 w-2.5" />
                            {channel.language} &middot; {channel.market.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {channel.niche && (
                    <p className="text-xs text-muted-foreground">
                      Niche: <span className="text-foreground">{channel.niche}</span>
                    </p>
                  )}

                  {channel.youtube_url && (
                    <div className="flex gap-4 text-xs">
                      <div>
                        <div className="text-muted-foreground">Subs</div>
                        <div className="font-medium">{formatNumber(channel.youtube_subs)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Views/mo</div>
                        <div className="font-medium">{formatNumber(channel.youtube_monthly_views)}</div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-1.5 pt-1">
                    <Button variant="outline" size="sm" className="text-xs h-7 flex-1" asChild>
                      <span>
                        <Search className="h-3 w-3 mr-1" />
                        Research
                      </span>
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7 flex-1" asChild>
                      <span>
                        <Sparkles className="h-3 w-3 mr-1" />
                        Generate
                      </span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
