'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface WordPressConfig {
  id: string;
  site_url: string;
  username: string;
}

interface PublishPanelProps {
  draftId: string;
  channelId: string;
  draftStatus: string;
  hasAssets: boolean;
  wordpressPostId: number | null;
  publishedUrl: string | null;
  onPublish?: (params: { mode: string; scheduledDate?: string }) => void;
  isPublishing?: boolean;
  previewData?: {
    categories: string[];
    tags: string[];
    seo: { title: string; slug: string; metaDescription: string };
    featuredImageUrl?: string;
    imageCount: number;
    suggestedDate?: string;
  };
}

export function PublishPanel({
  channelId,
  draftStatus,
  hasAssets,
  wordpressPostId,
  publishedUrl,
  onPublish,
  isPublishing = false,
  previewData,
}: PublishPanelProps) {
  const [mode, setMode] = useState<'draft' | 'publish' | 'schedule'>('draft');
  const [scheduledDate, setScheduledDate] = useState('');
  const [wpConfig, setWpConfig] = useState<WordPressConfig | null>(null);
  const [loadingConfigs, setLoadingConfigs] = useState(true);

  const canPublish = draftStatus === 'approved' && hasAssets;
  const isPublished = draftStatus === 'published' || draftStatus === 'scheduled';

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch(`/api/channels/${channelId}/wordpress`);
        const { data } = await res.json();
        setWpConfig(data ?? null);
      } catch {
        setWpConfig(null);
      } finally {
        setLoadingConfigs(false);
      }
    }
    void fetchConfig();
  }, [channelId]);

  useEffect(() => {
    if (previewData?.suggestedDate && !scheduledDate) {
      setScheduledDate(previewData.suggestedDate);
    }
  }, [previewData?.suggestedDate]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">WordPress Publishing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPublished && publishedUrl && (
          <div className="rounded-md bg-green-50 dark:bg-green-950 p-3 text-sm">
            <span className="font-medium">Published!</span>{' '}
            <a
              href={publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-green-700 dark:text-green-300"
            >
              View post
            </a>
            {wordpressPostId && (
              <span className="text-muted-foreground ml-2">(WP #{wordpressPostId})</span>
            )}
          </div>
        )}

        {!canPublish && !isPublished && (
          <p className="text-sm text-muted-foreground">
            {draftStatus !== 'approved'
              ? 'Draft must be approved before publishing.'
              : 'Upload or generate assets before publishing.'}
          </p>
        )}

        {(canPublish || isPublished) && (
          <>
            {previewData && (
              <div className="space-y-3 p-3 rounded-md border bg-muted/30">
                <p className="text-xs font-medium">Publishing Summary</p>
                <div className="space-y-1.5 text-xs">
                  <div><span className="text-muted-foreground">Title:</span> {previewData.seo.title}</div>
                  <div><span className="text-muted-foreground">Slug:</span> /{previewData.seo.slug}</div>
                  <div><span className="text-muted-foreground">Images:</span> {previewData.imageCount}</div>
                  {previewData.categories.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-muted-foreground">Categories:</span>
                      {previewData.categories.map((c) => (
                        <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                      ))}
                    </div>
                  )}
                  {previewData.tags.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-muted-foreground">Tags:</span>
                      {previewData.tags.map((t) => (
                        <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>WordPress Site</Label>
              {loadingConfigs ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading...
                </div>
              ) : wpConfig ? (
                <div className="rounded-md border px-3 py-2 text-sm">
                  {wpConfig.site_url}
                  <span className="text-muted-foreground ml-2">({wpConfig.username})</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No WordPress configured for this channel.{' '}
                  <a href="/channels" className="underline">Configure it here.</a>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Publishing Mode</Label>
              <div className="flex gap-2">
                {(['draft', 'publish', 'schedule'] as const).map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={mode === m ? 'default' : 'outline'}
                    onClick={() => setMode(m)}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            {mode === 'schedule' && (
              <div className="space-y-2">
                <Label>Schedule Date</Label>
                <Input
                  type="datetime-local"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              </div>
            )}

            <Button
              className="w-full"
              disabled={!wpConfig || isPublishing}
              onClick={() =>
                onPublish?.({
                  mode,
                  scheduledDate: mode === 'schedule' ? new Date(scheduledDate).toISOString() : undefined,
                })
              }
            >
              {isPublishing
                ? 'Publishing...'
                : isPublished
                  ? 'Republish'
                  : `Publish as ${mode}${wpConfig ? ` to ${wpConfig.site_url}` : ''}`}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
