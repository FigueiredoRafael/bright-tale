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
import { getTrackStageResults } from '@/lib/pipeline/stage-results-by-track';
import type { PipelineContext, PipelineStage, PublishResult } from './types';
import type { PublishTarget } from '@brighttale/shared';

interface DraftRow {
  id: string;
  title: string | null;
  status: string;
  wordpress_post_id?: number | null;
  published_url?: string | null;
}

interface PublishEngineProps {
  draft?: DraftRow | null;
  publishTargetId?: string;
  /** Issue #210 — when set, draftId resolves from ctx.stageResultsByTrack[trackId]. */
  trackId?: string;
}

export function PublishEngine({ draft, publishTargetId, trackId }: PublishEngineProps) {
  // ── Context from server-driven provider ───────────────────────────────────
  const { context, setStageStatus, signalStageComplete } = useProjectContext();

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

  // Issue #210 — per-track bucket wins. When trackId is provided, never fall
  // back to the flat ctx.stageResults.draft (canonical/blog leak). The `draft`
  // prop is also legacy-shape and must be ignored for multi-track projects.
  // Flat fallback is only safe for legacy single-track projects.
  const perTrackDraft = getTrackStageResults(context.stageResultsByTrack, trackId ?? null).draft;
  const draftId = trackId
    ? perTrackDraft?.draftId ?? ''
    : perTrackDraft?.draftId ?? draftResult?.draftId ?? draft?.id ?? '';

  // Self-hydrate the draft row when EngineHost mounts us without a `draft` prop.
  // Mirrors ReviewEngine's pattern — EngineHost only forwards `stageRun`, so the
  // engine must fetch its own draft via the draftId from ctx.stageResults.draft.
  const [localDraft, setLocalDraft] = useState<DraftRow | null>(draft ?? null);
  useEffect(() => {
    if (localDraft || !draftId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/content-drafts/${draftId}`);
        const json = await res.json();
        if (!cancelled && json?.data) {
          const d = json.data as Record<string, unknown>;
          setLocalDraft({
            id: (d.id as string) ?? draftId,
            title: (d.title as string | null) ?? null,
            status: (d.status as string) ?? 'draft',
            wordpress_post_id: (d.wordpress_post_id as number | null) ?? null,
            published_url: (d.published_url as string | null) ?? null,
          });
        }
      } catch {
        // silent — leave localDraft null, UI shows defensive banner
      }
    })();
    return () => { cancelled = true; };
  }, [localDraft, draftId]);

  const draftView: DraftRow = localDraft ?? {
    id: draftId,
    title: draftResult?.draftTitle ?? null,
    status: 'draft',
    wordpress_post_id: null,
    published_url: null,
  };

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

  // Heal orphaned publishes: drafts that already have published_url+wordpress_post_id
  // but never had stageResults.publish populated (e.g. completed before the engine
  // started calling signalStageComplete on stream completion). Fire once so mirror
  // writes the missing stage_runs.publish row and the sidebar catches up.
  const publishHealedRef = useRef(false);
  useEffect(() => {
    if (publishHealedRef.current) return;
    if (context.stageResults.publish) return;
    const url = localDraft?.published_url ?? null;
    const wpId = localDraft?.wordpress_post_id ?? null;
    if (!url || wpId == null) return;
    publishHealedRef.current = true;
    signalStageComplete('publish', { wordpressPostId: wpId, publishedUrl: url } as unknown as Record<string, unknown>, trackId);
  }, [context.stageResults.publish, localDraft?.published_url, localDraft?.wordpress_post_id, signalStageComplete, trackId]);

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
      (draftView.published_url ?? null) == null,
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
      // The /publish-draft/stream route updates content_drafts.published_url
      // but does NOT write a stage_runs.publish row. Without signalStageComplete
      // the sidebar's Publish tile stays uncompleted and stageResults.publish is
      // never populated (downstream UI loses the published URL). Fire the
      // signal so PATCH→mirror writes stageResults + the stage_run.
      signalStageComplete('publish', publishResult as unknown as Record<string, unknown>, trackId);
      setPublishing(false);
      setPublishBody(null);
    },
    [draftId, tracker, overviewMode, signalStageComplete, trackId],
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
    draftStatus: draftView.status,
    hasAssets: assetCount > 0,
    wordpressPostId: draftView.wordpress_post_id ?? null,
    publishedUrl: draftView.published_url ?? null,
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
          return <YouTubePublishForm publishTarget={publishTarget} draft={{ id: draftView.id, title: draftView.title, status: draftView.status }} />;
        case 'spotify':
          return <SpotifyPublishForm publishTarget={publishTarget} draft={{ id: draftView.id, title: draftView.title, status: draftView.status }} />;
        case 'apple_podcasts':
          return <ApplePodcastsPublishForm publishTarget={publishTarget} draft={{ id: draftView.id, title: draftView.title, status: draftView.status }} />;
        case 'rss':
          return <RssPublishForm publishTarget={publishTarget} draft={{ id: draftView.id, title: draftView.title, status: draftView.status }} />;
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
    <div className="space-y-6" data-testid="publish-engine-root">
      <ContextBanner stage="publish" context={trackerContext} onBack={navigate} />
      {renderDriverSection()}
    </div>
  );
}
