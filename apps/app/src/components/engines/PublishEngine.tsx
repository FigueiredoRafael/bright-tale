'use client';

import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { usePipelineTracker } from '@/hooks/use-pipeline-tracker';
import { PublishPanel } from '@/components/preview/PublishPanel';
import { PublishProgress } from '@/components/publish/PublishProgress';
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
  const [publishBody, setPublishBody] = useState<Record<string, unknown> | null>(null);
  const modeRef = useRef<string | null>(null);
  const tracker = usePipelineTracker('publish', context);

  function handlePublish(params: { mode: string; configId: string; scheduledDate?: string }) {
    if (publishing) return;

    modeRef.current = params.mode;
    tracker.trackStarted({ draftId, mode: params.mode, configId: params.configId });

    const body: Record<string, unknown> = {
      draftId,
      configId: params.configId,
      mode: params.mode,
      scheduledDate: params.scheduledDate,
      idempotencyToken: crypto.randomUUID(),
    };

    // Inject preview data from pipeline context
    if (context.previewImageMap) body.imageMap = context.previewImageMap;
    if (context.previewAltTexts) body.altTexts = context.previewAltTexts;
    if (context.previewCategories) body.categories = context.previewCategories;
    if (context.previewTags) body.tags = context.previewTags;
    if (context.previewSeoOverrides) body.seoOverrides = context.previewSeoOverrides;

    setPublishBody(body);
    setPublishing(true);
  }

  const handleStreamComplete = useCallback((result: { wordpressPostId: number; publishedUrl: string }) => {
    toast.success('Published successfully!');
    const publishResult: PublishResult = {
      wordpressPostId: result.wordpressPostId,
      publishedUrl: result.publishedUrl,
    };
    tracker.trackCompleted({
      draftId,
      wordpressPostId: result.wordpressPostId,
      publishedUrl: result.publishedUrl,
      mode: modeRef.current ?? 'unknown',
    });
    onComplete(publishResult);
  }, [draftId, tracker, onComplete]);

  const handleStreamError = useCallback((message: string) => {
    toast.error(message);
    tracker.trackFailed(message);
    setPublishing(false);
    setPublishBody(null);
  }, [tracker]);

  return (
    <div className="space-y-6">
      <ContextBanner stage="publish" context={context} onBack={onBack} />

      {publishing && publishBody ? (
        <PublishProgress
          publishBody={publishBody}
          onComplete={handleStreamComplete}
          onError={handleStreamError}
        />
      ) : (
        <div>
          <PublishPanel
            draftId={draftId}
            draftStatus={draft.status}
            hasAssets={assetCount > 0}
            wordpressPostId={draft.wordpress_post_id}
            publishedUrl={draft.published_url}
            onPublish={handlePublish}
            isPublishing={publishing}
            previewData={context.previewSeoOverrides ? {
              categories: context.previewCategories ?? [],
              tags: context.previewTags ?? [],
              seo: context.previewSeoOverrides,
              featuredImageUrl: context.featuredImageUrl,
              imageCount: context.assetIds?.length ?? 0,
              suggestedDate: context.previewPublishDate,
            } : undefined}
          />
        </div>
      )}
    </div>
  );
}
