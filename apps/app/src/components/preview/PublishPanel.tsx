'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PublishPanelProps {
  draftId: string;
  draftStatus: string;
  hasAssets: boolean;
  wordpressPostId: number | null;
  publishedUrl: string | null;
  onPublish?: (params: { mode: string; configId: string; scheduledDate?: string }) => void;
  isPublishing?: boolean;
}

export function PublishPanel({
  draftStatus,
  hasAssets,
  wordpressPostId,
  publishedUrl,
  onPublish,
  isPublishing = false,
}: PublishPanelProps) {
  const [mode, setMode] = useState<'draft' | 'publish' | 'schedule'>('draft');
  const [configId, setConfigId] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');

  const canPublish = draftStatus === 'approved' && hasAssets;
  const isPublished = draftStatus === 'published' || draftStatus === 'scheduled';

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
            <div className="space-y-2">
              <Label>WordPress Config ID</Label>
              <Input
                value={configId}
                onChange={(e) => setConfigId(e.target.value)}
                placeholder="Enter config UUID"
              />
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
              disabled={!configId || isPublishing}
              onClick={() =>
                onPublish?.({
                  mode,
                  configId,
                  scheduledDate: mode === 'schedule' ? new Date(scheduledDate).toISOString() : undefined,
                })
              }
            >
              {isPublishing ? 'Publishing...' : isPublished ? 'Republish' : `Publish as ${mode}`}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
