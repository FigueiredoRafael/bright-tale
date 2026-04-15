'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
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

  function handlePublish(params: { mode: string; configId: string; scheduledDate?: string }) {
    const body: Record<string, unknown> = {
      draftId,
      configId: params.configId,
      mode: params.mode,
      scheduledDate: params.scheduledDate,
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
    onComplete(publishResult);
  }, [onComplete]);

  const handleStreamError = useCallback((message: string) => {
    toast.error(message);
    setPublishing(false);
    setPublishBody(null);
  }, []);

  return (
    <div className="space-y-6">
      <ContextBanner stage="publish" context={context} onBack={onBack} />

      {publishing && publishBody ? (
        <div className="max-w-lg">
          <PublishProgress
            publishBody={publishBody}
            onComplete={handleStreamComplete}
            onError={handleStreamError}
          />
        </div>
      ) : (
        <div className="max-w-lg">
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
