'use client';

/**
 * PublishEngine — Slice 14.1 migration
 *
 * Reads pipeline context from ProjectContextProvider (useProjectContext)
 * instead of the xstate actor. Both EngineHost and StandaloneEngineHost
 * are expected to wrap engines with ProjectContextProvider; see
 * StandaloneEngineHost.tsx for how the legacy actor path bridges here.
 *
 * actor.send({ type: 'PUBLISH_COMPLETE' }) is replaced by:
 *   - refetch() so the provider reloads stage_runs and updates stageResults
 *
 * actor.send({ type: 'STAGE_PROGRESS' }) is replaced by:
 *   - setStageStatus() on the session-local context setter
 *
 * actor.send({ type: 'NAVIGATE' }) is replaced by router.push() or the
 * onBack callback passed from the parent — context banner uses onBack.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useAutoPilotTrigger } from '@/hooks/use-auto-pilot-trigger';
import { usePipelineTracker } from '@/hooks/use-pipeline-tracker';
import { PublishPanel } from '@/components/preview/PublishPanel';
import { PublishProgress } from '@/components/publish/PublishProgress';
import { ContextBanner } from './ContextBanner';
import { WordPressPublishForm } from './publish-drivers/WordPressPublishForm';
import { YouTubePublishForm } from './publish-drivers/YouTubePublishForm';
import { SpotifyPublishForm } from './publish-drivers/SpotifyPublishForm';
import { ApplePodcastsPublishForm } from './publish-drivers/ApplePodcastsPublishForm';
import { RssPublishForm } from './publish-drivers/RssPublishForm';
import { fetchPublishTarget } from '@/lib/api/publishTargets';
import { useProjectContext } from '@/components/pipeline/ProjectContextProvider';
import type { PipelineContext, PipelineStage, PublishResult } from './types';
import type { PublishTarget } from '@brighttale/shared';

interface PublishEngineProps {
  draft: {
    id: string;
    title: string | null;
    status: string;
    wordpress_post_id?: number | null;
    published_url?: string | null;
  };
  publishTargetId?: string;
}

export function PublishEngine({ draft, publishTargetId }: PublishEngineProps) {
  // ── Context from server-driven provider ───────────────────────────────────
  const { context, refetch, setStageStatus } = useProjectContext();

  const channelId = context.channelId;
  const projectId = context.projectId;
  const publishConfigStatus = context.autopilotConfig?.publish?.status ?? 'draft';
  const overviewMode = context.mode === 'overview';

  const brainstormResult = context.stageResults.brainstorm;
  const researchResult   = context.stageResults.research;
  const draftResult      = context.stageResults.draft;
  const reviewResult     = context.stageResults.review;
  const assetsResult     = context.stageResults.assets;
  const previewResult    = context.stageResults.preview;

  const draftId = draftResult?.draftId ?? draft.id;

  // ── Tracker context ───────────────────────────────────────────────────────
  const trackerContext: PipelineContext = {
    channelId: channelId ?? undefined,
    projectId,
    ideaId: brainstormResult?.ideaId,
    ideaTitle: brainstormResult?.ideaTitle,
    ideaVerdict: brainstormResult?.ideaVerdict,
    ideaCoreTension: brainstormResult?.ideaCoreTension,
    brainstormSessionId: brainstormResult?.brainstormSessionId,
    researchSessionId: researchResult?.researchSessionId,
    researchLevel: researchResult?.researchLevel,
    researchPrimaryKeyword: researchResult?.primaryKeyword,
    researchSecondaryKeywords: researchResult?.secondaryKeywords,
    researchSearchIntent: researchResult?.searchIntent,
    draftId,
    draftTitle: draftResult?.draftTitle,
    personaId: draftResult?.personaId,
    personaName: draftResult?.personaName,
    personaSlug: draftResult?.personaSlug,
    personaWpAuthorId: draftResult?.personaWpAuthorId,
    reviewScore: reviewResult?.score,
    reviewVerdict: reviewResult?.verdict,
    assetIds: assetsResult?.assetIds,
    featuredImageUrl: assetsResult?.featuredImageUrl,
    previewImageMap: previewResult?.imageMap,
    previewAltTexts: previewResult?.altTexts,
    previewCategories: previewResult?.categories,
    previewTags: previewResult?.tags,
    previewSeoOverrides: previewResult?.seoOverrides,
    previewPublishDate: previewResult?.suggestedPublishDate,
  };

  // ── Navigation — context banner onBack triggers router.back() or stage nav ─
  // In the new server-driven path there is no NAVIGATE event; the parent
  // (EngineHost / page) handles routing. onBack returns undefined for now —
  // ContextBanner will render without a back handler.
  function navigate(_toStage?: PipelineStage) {
    // No-op: navigation is page-level in the new host. ContextBanner renders
    // the back button conditionally — when onBack is undefined it is hidden.
  }

  // ── Publish state ──────────────────────────────────────────────────────────
  const [publishing, setPublishing] = useState(false);
  const [publishBody, setPublishBody] = useState<Record<string, unknown> | null>(null);
  const modeRef = useRef<string | null>(null);
  const tracker = usePipelineTracker('publish', trackerContext);

  const assetCount = assetsResult?.assetIds?.length ?? 0;

  const [publishTarget, setPublishTarget] = useState<PublishTarget | null>(null);

  useEffect(() => {
    if (!publishTargetId) return;
    let active = true;
    fetchPublishTarget(publishTargetId)
      .then((target) => { if (active) setPublishTarget(target); })
      .catch(() => { /* errors handled by rendering null target */ });
    return () => { active = false; };
  }, [publishTargetId]);

  function handlePublish(params: { mode: string; scheduledDate?: string }) {
    if (publishing) return;

    modeRef.current = params.mode;
    tracker.trackStarted({ draftId, mode: params.mode });

    const body: Record<string, unknown> = {
      draftId,
      channelId: channelId ?? undefined,
      mode: params.mode,
      scheduledDate: params.scheduledDate,
      idempotencyToken: crypto.randomUUID(),
    };

    if (previewResult?.imageMap)        body.imageMap     = previewResult.imageMap;
    if (previewResult?.altTexts)        body.altTexts     = previewResult.altTexts;
    if (previewResult?.categories)      body.categories   = previewResult.categories;
    if (previewResult?.tags)            body.tags         = previewResult.tags;
    if (previewResult?.seoOverrides)    body.seoOverrides = previewResult.seoOverrides;
    if (draftResult?.personaWpAuthorId != null) body.authorId = draftResult.personaWpAuthorId;

    // Replace actor.send(STAGE_PROGRESS) — update session-local stageStatus
    setStageStatus('publish', { status: 'Publishing to WordPress' });

    setPublishBody(body);
    setPublishing(true);
  }

  // Auto-pilot: in supervised/overview mode, fire publish using the
  // wpStatus the user pre-selected in the autopilot wizard. Step-by-step
  // mode skips this — user clicks publish manually.
  useAutoPilotTrigger({
    stage: 'publish',
    canFire: () =>
      !publishing &&
      !publishBody &&
      !!channelId &&
      !!draftId &&
      (draft.published_url ?? null) == null,
    fire: () => handlePublish({ mode: publishConfigStatus === 'published' ? 'publish' : 'draft' }),
    rearmKey: draftId,
  });

  const handleStreamComplete = useCallback(
    (result: { wordpressPostId: number; publishedUrl: string }) => {
      if (!overviewMode) toast.success('Published successfully!');
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
      // Replace actor.send(PUBLISH_COMPLETE) — refetch so context reflects new stage_runs row
      // The dispatcher (PublishProgress / legacy WordPressPublishForm) writes the
      // outcome_json to stage_runs server-side; we just need to re-sync here.
      refetch();
      // Keep local publish result in-memory for UI until refetch resolves
      void publishResult; // referenced to avoid unused-var lint
      setPublishing(false);
      setPublishBody(null);
    },
    [draftId, tracker, overviewMode, refetch],
  );

  const handleStreamError = useCallback(
    (message: string) => {
      toast.error(message);
      tracker.trackFailed(message);
      setPublishing(false);
      setPublishBody(null);
    },
    [tracker],
  );

  if (!channelId) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>Channel ID is missing. Cannot proceed with publishing.</p>
        </div>
      </div>
    );
  }

  const panelProps = {
    draftId,
    channelId,
    draftStatus: draft.status,
    hasAssets: assetCount > 0,
    wordpressPostId: draft.wordpress_post_id ?? null,
    publishedUrl: draft.published_url ?? null,
    onPublish: handlePublish,
    isPublishing: publishing,
    previewData: previewResult?.seoOverrides ? {
      categories: previewResult.categories ?? [],
      tags: previewResult.tags ?? [],
      seo: previewResult.seoOverrides,
      featuredImageUrl: assetsResult?.featuredImageUrl,
      imageCount: assetsResult?.assetIds?.length ?? 0,
      suggestedDate: previewResult.suggestedPublishDate,
    } : undefined,
  };

  function renderDriverSection() {
    if (publishing && publishBody) {
      return (
        <PublishProgress
          publishBody={publishBody}
          onComplete={handleStreamComplete}
          onError={handleStreamError}
        />
      );
    }

    if (publishTargetId && publishTarget) {
      switch (publishTarget.type) {
        case 'wordpress':
          return <WordPressPublishForm publishTarget={publishTarget} panelProps={panelProps} />;
        case 'youtube':
          return <YouTubePublishForm publishTarget={publishTarget} draft={{ id: draft.id, title: draft.title, status: draft.status }} />;
        case 'spotify':
          return <SpotifyPublishForm publishTarget={publishTarget} draft={{ id: draft.id, title: draft.title, status: draft.status }} />;
        case 'apple_podcasts':
          return <ApplePodcastsPublishForm publishTarget={publishTarget} draft={{ id: draft.id, title: draft.title, status: draft.status }} />;
        case 'rss':
          return <RssPublishForm publishTarget={publishTarget} draft={{ id: draft.id, title: draft.title, status: draft.status }} />;
      }
    }

    // Legacy WordPress-only flow: used when publishTargetId is absent (backward compat)
    return (
      <div>
        <PublishPanel {...panelProps} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ContextBanner stage="publish" context={trackerContext} onBack={navigate} />
      {renderDriverSection()}
    </div>
  );
}
