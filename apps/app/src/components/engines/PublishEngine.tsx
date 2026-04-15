'use client';

import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PublishPanel } from '@/components/preview/PublishPanel';
import { ContextBanner } from './ContextBanner';
import type { PipelineContext, PipelineStage, PublishResult, StageResult } from './types';

interface PublishEngineProps {
  channelId: string;
  context: PipelineContext;
  draftId: string;
  draft: {
    id: string;
    title: string | null;
    status: string;
    wordpress_post_id: number | null;
    published_url: string | null;
  };
  assetCount: number;
  onComplete: (result: StageResult) => void;
  onBack?: (targetStage?: PipelineStage) => void;
}

export function PublishEngine({
  channelId,
  context,
  draftId,
  draft,
  assetCount,
  onComplete,
  onBack,
}: PublishEngineProps) {
  const [publishing, setPublishing] = useState(false);
  const inFlightRef = useRef(false);

  async function withGuard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (inFlightRef.current) return undefined;
    inFlightRef.current = true;
    try {
      return await fn();
    } finally {
      inFlightRef.current = false;
    }
  }

  async function handlePublish(params: {
    mode: string;
    configId: string;
    scheduledDate?: string;
  }) {
    await withGuard(async () => {
      try {
        setPublishing(true);
        const res = await fetch('/api/wordpress/publish-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftId,
            configId: params.configId,
            mode: params.mode,
            scheduledDate: params.scheduledDate,
          }),
        });
        const json = await res.json();

        if (json?.error) {
          toast.error(json.error.message ?? 'Failed to publish');
          setPublishing(false);
          return;
        }

        const publishedData = json.data as Record<string, unknown>;
        const result: PublishResult = {
          wordpressPostId: (publishedData.wordpress_post_id ??
            publishedData.wordpressPostId) as number,
          publishedUrl: (publishedData.published_url ??
            publishedData.publishedUrl) as string,
        };
        toast.success('Draft published successfully');
        onComplete(result);
      } catch (error) {
        toast.error('Failed to publish draft');
        setPublishing(false);
      }
    });
  }

  return (
    <div className="space-y-6">
      <ContextBanner stage="publish" context={context} onBack={onBack} />

      <div className="max-w-lg">
        <PublishPanel
          draftId={draftId}
          draftStatus={draft.status}
          hasAssets={assetCount > 0}
          wordpressPostId={draft.wordpress_post_id}
          publishedUrl={draft.published_url}
          onPublish={handlePublish}
          isPublishing={publishing}
        />
      </div>
    </div>
  );
}
