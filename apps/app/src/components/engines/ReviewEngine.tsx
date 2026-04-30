'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Check, AlertCircle, ArrowRight, ClipboardPaste, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { useSelector } from '@xstate/react';
import { usePipelineActor } from '@/hooks/usePipelineActor';
import { useAutoPilotTrigger } from '@/hooks/use-auto-pilot-trigger';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReviewFeedbackPanel } from '@/components/preview/ReviewFeedbackPanel';
import { ManualOutputDialog } from './ManualOutputDialog';
import { useManualMode } from '@/hooks/use-manual-mode';
import { usePipelineTracker } from '@/hooks/use-pipeline-tracker';
import { GenerationProgressModal } from '@/components/generation/GenerationProgressModal';
import { ContextBanner } from './ContextBanner';
import { ContentWarningBanner } from './ContentWarningBanner';
import { friendlyAiError } from '@/lib/ai/error-message';
import { useUpgrade } from '@/components/billing/UpgradeProvider';
import { ModelPicker, MODELS_BY_PROVIDER, type ProviderId } from '@/components/ai/ModelPicker';
import { usePipelineAbort } from '@/components/pipeline/PipelineAbortProvider';
import type { PipelineContext, PipelineStage, ReviewResult } from './types';
import { deriveTier, isApprovedTier } from '@brighttale/shared';

/**
 * Non-null invariant — orchestrator gates render until draft is hydrated.
 * Guard in the engine is defensive, not normal flow.
 */
interface ReviewEngineProps {
  draft: Record<string, unknown> | null;
}

const REVIEW_PROVIDERS: ProviderId[] = ['gemini', 'openai', 'anthropic', 'ollama', 'manual'];

const TIER_LABEL: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  needs_revision: 'Needs Revision',
  reject: 'Rejected',
  not_requested: 'Not Reviewed',
};

const TIER_COLOR: Record<string, string> = {
  excellent: 'bg-green-500/20 text-green-700 border-green-500/50',
  good: 'bg-blue-500/20 text-blue-700 border-blue-500/50',
  needs_revision: 'bg-amber-500/20 text-amber-700 border-amber-500/50',
  reject: 'bg-red-500/20 text-red-700 border-red-500/50',
  not_requested: 'bg-gray-500/20 text-gray-700 border-gray-500/50',
};

export function ReviewEngine({ draft }: ReviewEngineProps) {
  const actor = usePipelineActor();
  const abortController = usePipelineAbort();
  const channelId = useSelector(actor, (s) => s.context.channelId);
  const projectId = useSelector(actor, (s) => s.context.projectId);
  const brainstormResult = useSelector(actor, (s) => s.context.stageResults.brainstorm);
  const researchResult = useSelector(actor, (s) => s.context.stageResults.research);
  const draftResult = useSelector(actor, (s) => s.context.stageResults.draft);
  const pipelineSettings = useSelector(actor, (s) => s.context.pipelineSettings);
  const machineIterationCount = useSelector(actor, (s) => s.context.iterationCount);
  const maxIterations = useSelector(
    actor,
    (s) => s.context.autopilotConfig?.review.maxIterations ?? s.context.pipelineSettings.reviewMaxIterations,
  );
  const autoApproveThreshold = useSelector(
    actor,
    (s) => s.context.autopilotConfig?.review.autoApproveThreshold ?? s.context.pipelineSettings.reviewApproveScore,
  );
  const draftId = draftResult?.draftId ?? '';

  // Local mutable view of the draft — initialized from the prop, kept in sync as
  // the engine refetches after status changes (review API, manual import, override).
  const [localDraft, setLocalDraft] = useState<Record<string, unknown> | null>(draft);
  useEffect(() => {
    setLocalDraft(draft);
  }, [draft]);

  const trackerContext: PipelineContext = {
    channelId: channelId ?? undefined,
    projectId,
    ideaId: brainstormResult?.ideaId,
    ideaTitle: brainstormResult?.ideaTitle,
    ideaVerdict: brainstormResult?.ideaVerdict,
    ideaCoreTension: brainstormResult?.ideaCoreTension,
    brainstormSessionId: brainstormResult?.brainstormSessionId,
    researchSessionId: researchResult?.researchSessionId,
    researchPrimaryKeyword: researchResult?.primaryKeyword,
    researchSecondaryKeywords: researchResult?.secondaryKeywords,
    researchSearchIntent: researchResult?.searchIntent,
    draftId: draftResult?.draftId,
    draftTitle: draftResult?.draftTitle,
  };

  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [model, setModel] = useState<string>(MODELS_BY_PROVIDER.gemini[0].id);
  const [recommendationLoaded, setRecommendationLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  // Anchor the SSE event filter to the moment the action started so the modal
  // doesn't replay a previous stage's `completed` event (events are keyed by
  // draftId across stages).
  const [reviewSince, setReviewSince] = useState<string | null>(null);
  const { enabled: manualEnabled } = useManualMode();
  const { handleMaybeCreditsError } = useUpgrade();
  const inFlightRef = useRef(false);
  const tracker = usePipelineTracker('review', trackerContext);

  const isManual = provider === 'manual';

  // Manual provider state
  const [manualState, setManualState] = useState<{
    draftId: string;
  } | null>(null);

  // Pending REVIEW_COMPLETE payload — populated by handleSubmitForReview
  // after the sync /review fetch resolves, then dispatched by the SSE
  // modal's onComplete callback so the modal can show its success state
  // before the orchestrator transitions away from this engine.
  const pendingReviewResultRef = useRef<{
    score: number;
    qualityTier: ReturnType<typeof deriveTier>;
    verdict: string;
    feedbackJson: Record<string, unknown>;
    iterationCount: number;
  } | null>(null);

  // Restore manual state if draft is awaiting_manual
  useEffect(() => {
    if (localDraft?.status === 'awaiting_manual') {
      setManualState({ draftId });
    }
  }, [localDraft?.status, draftId]);

  // Fetch recommended provider/model for the review agent.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/agents', { signal: abortController?.signal });
        const json = await res.json();
        if (cancelled) return;
        const agent = (json.data?.agents as Array<Record<string, unknown>>)?.find(
          (a) => a.slug === 'review',
        );
        if (agent?.recommended_provider) {
          setProvider(agent.recommended_provider as ProviderId);
          if (agent.recommended_model) setModel(agent.recommended_model as string);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // silent — fall back to defaults
      } finally {
        if (!cancelled) setRecommendationLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [abortController?.signal]);

  // Auto-pilot: submit a fresh review when the orchestrator enters this stage.
  // Re-fires for each iteration of the review loop (rearmKey).
  const autoFireFn = useRef<() => void | Promise<void>>(() => {});
  useAutoPilotTrigger({
    stage: 'review',
    canFire: () => {
      const status = localDraft?.status as string | undefined;
      return (
        recommendationLoaded &&
        !!localDraft &&
        !!draftId &&
        status !== 'approved' &&
        status !== 'awaiting_manual' &&
        !busy &&
        !reviewing &&
        !inFlightRef.current
      );
    },
    fire: () => autoFireFn.current(),
    rearmKey: (localDraft as { iteration_count?: number } | null)?.iteration_count ?? 0,
  });

  function navigate(toStage?: PipelineStage) {
    actor.send({ type: 'NAVIGATE', toStage: toStage ?? 'draft' });
  }

  // Defensive guard — orchestrator gates render until draft hydrates, but if a
  // future caller bypasses that gate, fail loudly instead of crashing on
  // null deref.
  if (!localDraft) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-destructive">Draft not loaded. Please refresh.</p>
        </CardContent>
      </Card>
    );
  }

  const draftView = localDraft as {
    id: string;
    title: string | null;
    status: string;
    draft_json: Record<string, unknown> | null;
    review_feedback_json: Record<string, unknown> | null;
    review_score: number | null;
    review_verdict: string;
    iteration_count: number;
  };

  // Load fresh data if needed — returns the fresh row so callers can read
  // review_score / review_verdict without depending on React state flush timing.
  async function refetchDraft(): Promise<Record<string, unknown> | undefined> {
    try {
      const res = await fetch(`/api/content-drafts/${draftId}`, {
        signal: abortController?.signal,
      });
      const json = await res.json();
      if (json?.data) {
        setLocalDraft(json.data as Record<string, unknown>);
        return json.data as Record<string, unknown>;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return undefined;
      // silent
    }
    return undefined;
  }

  async function withGuard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (inFlightRef.current) return undefined;
    inFlightRef.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }

  async function handleSubmitForReview() {
    await withGuard(async () => {
      try {
        tracker.trackStarted({ draftId, iterationCount: draftView.iteration_count });

        actor.send({
          type: 'STAGE_PROGRESS',
          stage: 'review',
          partial: {
            status: `Iteration ${machineIterationCount + 1}/${maxIterations}: scoring`,
            current: machineIterationCount,
            total: maxIterations,
          },
        });

        // First, set status to in_review
        const patchRes = await fetch(`/api/content-drafts/${draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'in_review' }),
          signal: abortController?.signal,
        });
        const patchJson = await patchRes.json();
        if (patchJson?.error) {
          tracker.trackFailed('Failed to update status');
          toast.error(patchJson.error.message ?? 'Failed to update status');
          return;
        }

        // Now run the review with the selected provider/model. Capture the
        // since-anchor BEFORE the fetch fires so the SSE filter excludes any
        // `completed` event left over from the prior stage.
        setReviewSince(new Date(Date.now() - 1_000).toISOString());
        setReviewing(true);
        const body: Record<string, unknown> = { provider };
        if (model && !isManual) body.model = model;
        const res = await fetch(`/api/content-drafts/${draftId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abortController?.signal,
        });
        const json = await res.json();

        if (json?.error) {
          tracker.trackFailed(json.error.message ?? 'Review failed');
          if (handleMaybeCreditsError(json.error)) {
            setReviewing(false);
            return;
          }
          const f = friendlyAiError(json.error.message ?? '');
          toast.error(f.title, { description: f.hint });
          setReviewing(false);
          return;
        }

        // If manual, set up manual state and return early
        if (isManual && json.data?.status === 'awaiting_manual') {
          setManualState({ draftId });
          setReviewing(false);
          toast.info('Review prompt copied to Axiom. Paste output when ready.');
          return;
        }

        // NOTE: do NOT setReviewing(false) here. The modal's SSE stream is
        // about to deliver the 'completed' event from the route's
        // emitJobEvent call; its onComplete callback will flip reviewing
        // off after the 1.5s success-state delay. Setting it here would
        // unmount the modal before the user sees the green checkmark.
        await refetchDraft();
        toast.success('Review completed');

        const feedbackObj = json.data?.review_feedback_json as Record<string, unknown> | null;
        const blogReview = (feedbackObj?.blog_review ?? feedbackObj?.video_review) as Record<string, unknown> | undefined;
        const score = (typeof blogReview?.score === 'number' ? blogReview.score as number : json.data?.review_score ?? 0);
        const verdict = json.data?.review_verdict ?? 'pending';
        const iterationCount = json.data?.iteration_count ?? draftView.iteration_count + 1;

        tracker.trackCompleted({
          draftId,
          score,
          verdict,
          iterationCount,
          feedbackJson: feedbackObj ?? {},
        });

        // Stash the dispatch so the modal's onComplete can fire it AFTER the
        // SSE 'completed' event surfaces the success state. Dispatching here
        // would unmount ReviewEngine immediately (orchestrator transitions
        // out of the review state on REVIEW_COMPLETE) and the user would
        // never see the modal's checkmark.
        const mode = actor.getSnapshot().context.mode
        if (mode === 'supervised' || mode === 'overview') {
          const fb = feedbackObj ?? {};
          const fmt = (fb.blog_review ?? fb.video_review ?? fb.podcast_review ?? fb.shorts_review) as Record<string, unknown> | undefined;
          const tier = deriveTier(fmt ?? fb);
          pendingReviewResultRef.current = {
            score,
            qualityTier: tier,
            verdict,
            feedbackJson: fb,
            iterationCount,
          };
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          setReviewing(false);
          return;
        }
        tracker.trackFailed(e instanceof Error ? e.message : 'Failed to submit for review');
        setReviewing(false);
        toast.error('Failed to submit for review');
      }
    });
  }

  // Bind the auto-pilot trigger to the actual handler now that it's in scope.
  autoFireFn.current = handleSubmitForReview;

  async function handleManualOutputSubmit(parsed: unknown) {
    if (!manualState) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/content-drafts/${manualState.draftId}/manual-review-output`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
        signal: abortController?.signal,
      });
      const json = await res.json();
      if (json.error) {
        toast.error('Submit failed', { description: json.error.message });
        return;
      }

      // Success! Clear manual state and proceed
      const feedbackObj = json.data?.review_feedback_json as Record<string, unknown> | null;
      const blogReview = (feedbackObj?.blog_review ?? feedbackObj?.video_review) as Record<string, unknown> | undefined;
      const score = (typeof blogReview?.score === 'number' ? blogReview.score as number : json.data?.review_score ?? 0);
      const verdict = json.data?.review_verdict ?? 'pending';

      setManualState(null);
      await refetchDraft();
      toast.success('Review submitted');
      actor.send({ type: 'STAGE_PROGRESS', stage: 'review', partial: { score, verdict } as Record<string, unknown> });
    } catch (err) {
      toast.error('Submit failed', { description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleManualAbandon() {
    if (!manualState) return;
    setBusy(true);
    try {
      // Intentionally NOT passing abortController.signal: cancel is fire-and-forget
      // cleanup that must reach the server even after the pipeline has been aborted.
      await fetch(`/api/content-drafts/${manualState.draftId}/cancel`, {
        method: 'POST',
      });
    } catch {
      // best-effort
    } finally {
      setBusy(false);
      setManualState(null);
      actor.send({ type: 'STAGE_PROGRESS', stage: 'review', partial: { score: undefined, verdict: undefined } as Record<string, unknown> });
    }
  }

  async function handleManualImport(parsed: unknown) {
    await withGuard(async () => {
      try {
        let feedbackJson = parsed as Record<string, unknown>;

        // Unwrap BC_REVIEW_OUTPUT wrapper if present
        if (feedbackJson.BC_REVIEW_OUTPUT && typeof feedbackJson.BC_REVIEW_OUTPUT === 'object') {
          feedbackJson = feedbackJson.BC_REVIEW_OUTPUT as Record<string, unknown>;
        }

        // Extract score and verdict from the review output
        // Try format-specific review first (blog_review, video_review, etc.)
        const draftType = (draftView.draft_json as Record<string, unknown>)?.type as string | undefined;
        const formatKey = draftType ? `${draftType}_review` : 'blog_review';
        const formatReview = (feedbackJson[formatKey] ?? feedbackJson.blog_review) as Record<string, unknown> | undefined;

        let score = 0;
        let verdict = 'revision_required';

        if (formatReview) {
          if (typeof formatReview.score === 'number') score = formatReview.score;
          if (typeof formatReview.verdict === 'string') {
            verdict = formatReview.verdict.toLowerCase().replace(/\s+/g, '_');
          }
        }

        // Fallback to top-level fields
        if (typeof feedbackJson.overall_verdict === 'string') {
          verdict = (feedbackJson.overall_verdict as string).toLowerCase().replace(/\s+/g, '_');
        }
        if (typeof feedbackJson.score === 'number') {
          score = feedbackJson.score as number;
        }

        // Normalize verdict via quality_tier (dual-reads legacy score)
        const tier = deriveTier(formatReview ?? feedbackJson);
        if (isApprovedTier(tier)) verdict = 'approved';
        else if (tier === 'reject') verdict = 'rejected';
        else if (verdict.includes('approved')) verdict = 'approved';
        else if (verdict.includes('rejected')) verdict = 'rejected';
        else verdict = 'revision_required';

        // Preserve numeric score in DB for legacy consumers; synthesize from tier if missing
        const legacyScoreFromTier: Record<string, number> = {
          excellent: 95, good: 82, needs_revision: 60, reject: 20, not_requested: 0,
        };
        if (score === 0) score = legacyScoreFromTier[tier] ?? 0;

        const patchBody: Record<string, unknown> = {
          reviewFeedbackJson: feedbackJson,
          reviewScore: score,
          reviewVerdict: verdict,
          status: verdict === 'approved' ? 'approved' : 'in_review',
          iterationCount: draftView.iteration_count + 1,
        };

        const res = await fetch(`/api/content-drafts/${draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
          signal: abortController?.signal,
        });
        const json = await res.json();
        if (json?.error) {
          toast.error(json.error.message ?? 'Failed to import review');
          return;
        }
        await refetchDraft();

        const tierText = TIER_LABEL[tier] ?? 'Unknown';
        if (verdict === 'approved') {
          toast.success(`Review imported — ${tierText} — Approved!`);
        } else if (verdict === 'rejected') {
          toast.error(`Review imported — ${tierText} — Rejected`);
        } else {
          toast.warning(`Review imported — ${tierText} — Revision required`);
        }
      } catch {
        toast.error('Failed to import review');
      }
    });
  }

  async function handleRevise() {
    await withGuard(async () => {
      try {
        setReviewSince(new Date(Date.now() - 1_000).toISOString());
        setReviewing(true);
        const res = await fetch(`/api/content-drafts/${draftId}/revise`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            feedback: draftView.review_feedback_json,
          }),
          signal: abortController?.signal,
        });
        const json = await res.json();

        if (json?.error) {
          if (handleMaybeCreditsError(json.error)) {
            setReviewing(false);
            return;
          }
          const f = friendlyAiError(json.error.message ?? '');
          toast.error(f.title, { description: f.hint });
          setReviewing(false);
          return;
        }

        await refetchDraft();
        setReviewing(false);
        toast.success('Draft revised based on feedback');
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') { setReviewing(false); return; }
        setReviewing(false);
        toast.error('Failed to revise draft');
      }
    });
  }

  async function handleOverrideApprove() {
    await withGuard(async () => {
      try {
        const res = await fetch(`/api/content-drafts/${draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'approved',
            reviewScore: effectiveScore ?? draftView.review_score ?? 0,
            reviewVerdict: 'approved',
          }),
          signal: abortController?.signal,
        });
        const json = await res.json();
        if (json?.error) {
          toast.error(json.error.message ?? 'Failed to approve');
          return;
        }
        await refetchDraft();
        toast.success('Draft approved');
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        toast.error('Failed to approve');
      }
    });
  }

  // Derive verdict and score — check DB fields first, then extract from feedback JSON
  const feedbackObj = draftView.review_feedback_json as Record<string, unknown> | null;
  const blogReview = (feedbackObj?.blog_review ?? feedbackObj?.video_review) as Record<string, unknown> | undefined;

  const effectiveScore = draftView.review_score
    ?? (typeof blogReview?.score === 'number' ? blogReview.score as number : null);

  const rawVerdict = (draftView.review_verdict && draftView.review_verdict !== 'pending')
    ? draftView.review_verdict
    : typeof feedbackObj?.overall_verdict === 'string'
      ? (feedbackObj.overall_verdict as string).toLowerCase().replace(/\s+/g, '_')
      : typeof blogReview?.verdict === 'string'
        ? (blogReview.verdict as string).toLowerCase().replace(/\s+/g, '_')
        : draftView.review_verdict;

  // Score ≥ autoApproveThreshold always means approved, regardless of text verdict
  // autoApproveThreshold prefers autopilotConfig.review.autoApproveThreshold over
  // pipelineSettings.reviewApproveScore so the UI verdict matches the machine guard.
  const effectiveVerdict =
    (effectiveScore !== null && effectiveScore >= autoApproveThreshold) ? 'approved'
    : (rawVerdict && rawVerdict.includes('approved')) ? 'approved'
    : (rawVerdict && rawVerdict.includes('rejected')) ? 'rejected'
    : (rawVerdict && rawVerdict !== 'pending') ? 'revision_required'
    : 'pending';

  const isApproved = effectiveVerdict === 'approved';
  const needsRevision = effectiveVerdict === 'revision_required';
  const isRejected = effectiveVerdict === 'rejected';

  // Has any review been done (even if DB fields are stale)
  const hasReview = !!draftView.review_feedback_json;

  return (
    <div className="space-y-6">
      <ContextBanner stage="review" context={trackerContext} onBack={navigate} />
      <ContentWarningBanner warning={typeof (draftView.review_feedback_json as Record<string, unknown> | null)?.content_warning === 'string' ? (draftView.review_feedback_json as Record<string, unknown>).content_warning as string : undefined} />

      {/* No review yet — submit for review */}
      {!hasReview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Submit draft for review
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              The reviewer will evaluate content quality, SEO, and readability. Pick a provider below, then start the review.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ModelPicker
              providers={manualEnabled ? REVIEW_PROVIDERS : REVIEW_PROVIDERS.filter((p) => p !== 'manual')}
              provider={provider}
              model={model}
              recommended={{ provider: null, model: null }}
              onProviderChange={(p) => {
                setProvider(p);
                if (p === 'manual') setModel('manual');
                else setModel(MODELS_BY_PROVIDER[p][0].id);
              }}
              onModelChange={setModel}
            />

            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground">
                {isManual
                  ? 'Manual: a prompt will be emitted — paste the output when ready.'
                  : 'AI Review: runs the reviewer agent with the selected model.'}
              </p>
              <Button
                onClick={handleSubmitForReview}
                disabled={busy || reviewing || !draftView.draft_json}
                size="lg"
                className="gap-2 shrink-0"
              >
                {busy || reviewing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isManual ? (
                  <ClipboardPaste className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isManual ? 'Get Manual Prompt' : 'Start AI Review'}
              </Button>
            </div>

            {reviewing && (
              <p className="text-xs text-muted-foreground text-center">
                {isManual ? 'Review prompt ready. Paste output when ready.' : 'Running AI review...'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Review feedback exists */}
      {hasReview && (
        <>
          {/* Show feedback panel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review Feedback</CardTitle>
            </CardHeader>
            <CardContent>
              <ReviewFeedbackPanel
                reviewScore={effectiveScore}
                reviewVerdict={effectiveVerdict}
                iterationCount={draftView.iteration_count}
                feedbackJson={draftView.review_feedback_json}
              />
            </CardContent>
          </Card>

          {/* Approved — show success */}
          {isApproved && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="py-4 space-y-4">
                <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                  <Check className="h-4 w-4" />
                  <span>Draft approved! Ready to move to assets.</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      const score = effectiveScore ?? draftView.review_score ?? 0;
                      const verdict = effectiveVerdict ?? draftView.review_verdict;
                      // Ensure DB status is 'approved' before advancing
                      if (draftView.status !== 'approved') {
                        await fetch(`/api/content-drafts/${draftId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            status: 'approved',
                            reviewScore: score,
                            reviewVerdict: verdict,
                          }),
                          signal: abortController?.signal,
                        });
                      }
                      const fb = draftView.review_feedback_json as Record<string, unknown> | null ?? {};
                      const fmtReview = (fb.blog_review ?? fb.video_review ?? fb.podcast_review ?? fb.shorts_review) as Record<string, unknown> | undefined;
                      const localTier = deriveTier(fmtReview ?? fb);
                      const result: ReviewResult = {
                        score,
                        qualityTier: localTier,
                        verdict,
                        feedbackJson: fb,
                        iterationCount: draftView.iteration_count,
                      };
                      actor.send({ type: 'REVIEW_COMPLETE', result });
                    }}
                    className="gap-2"
                  >
                    <Check className="h-4 w-4" />
                    Next: Assets <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Needs revision or rejected — show actions */}
          {(needsRevision || isRejected) && (
            <Card className={needsRevision ? 'border-amber-500/30 bg-amber-500/5' : 'border-red-500/30 bg-red-500/5'}>
              <CardContent className="py-4 space-y-4">
                <div className={`flex items-center gap-2 text-sm ${
                  needsRevision
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-red-700 dark:text-red-300'
                }`}>
                  <AlertCircle className="h-4 w-4" />
                  <span>{needsRevision ? 'Revision required.' : 'Draft rejected.'} Choose an action:</span>
                </div>

                {/* Re-review section */}
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">Run a new review:</p>
                  <ModelPicker
                    providers={manualEnabled ? REVIEW_PROVIDERS : REVIEW_PROVIDERS.filter((p) => p !== 'manual')}
                    provider={provider}
                    model={model}
                    recommended={{ provider: null, model: null }}
                    onProviderChange={(p) => {
                      setProvider(p);
                      if (p === 'manual') setModel('manual');
                      else setModel(MODELS_BY_PROVIDER[p][0].id);
                    }}
                    onModelChange={setModel}
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSubmitForReview}
                      disabled={busy || reviewing}
                      size="sm"
                      className="gap-1.5"
                    >
                      {busy || reviewing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isManual ? (
                        <ClipboardPaste className="h-3.5 w-3.5" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {isManual ? 'Get Manual Prompt' : 'Start AI Review'}
                    </Button>
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* Go back options */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Or go back to revise content:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={handleRevise}
                      disabled={busy}
                      variant="outline"
                      size="sm"
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-1.5" />
                      )}
                      AI Revision
                    </Button>
                    <Button
                      onClick={() => navigate('draft')}
                      variant="outline"
                      size="sm"
                    >
                      Edit Manually
                    </Button>
                    <Button
                      onClick={() => navigate('research')}
                      variant="outline"
                      size="sm"
                    >
                      Regenerate Research
                    </Button>
                    <Button
                      onClick={() => navigate('brainstorm')}
                      variant="outline"
                      size="sm"
                    >
                      Pick Different Idea
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Or override and continue:
                </div>
                <Button
                  onClick={handleOverrideApprove}
                  disabled={busy}
                  variant="ghost"
                  size="sm"
                  className="w-full"
                >
                  Override Approve
                </Button>
              </CardContent>
            </Card>
          )}

        </>
      )}

      {/* Manual review output dialog */}
      <ManualOutputDialog
        open={!!manualState}
        onOpenChange={(open) => {
          if (!open) {
            setManualState(null);
          }
        }}
        title="Paste Review Output"
        description="Retrieve the prompt from Axiom, run it in your AI tool of choice, then paste the JSON output below."
        submitLabel="Submit Review"
        onSubmit={handleManualOutputSubmit}
        onAbandon={handleManualAbandon}
        loading={busy}
      />

      {/* SSE generation modal */}
      {reviewing && !isManual && (
        <GenerationProgressModal
          open={reviewing}
          sessionId={draftId}
          sseUrl={`/api/content-drafts/${draftId}/events`}
          since={reviewSince ?? undefined}
          title="Running AI Review"
          onComplete={async () => {
            // Fetch fresh values — the /review POST returned 202 and ran async,
            // so json.data at POST-time had NULL score/verdict. Reading them now
            // from the DB gives the real results.
            const fresh = await refetchDraft();
            toast.success('Review completed');
            pendingReviewResultRef.current = null; // no longer needed
            setReviewing(false);
            setReviewSince(null);
            const mode = actor.getSnapshot().context.mode;
            if (fresh && (mode === 'supervised' || mode === 'overview')) {
              const fb = (fresh.review_feedback_json as Record<string, unknown> | null) ?? {};
              const fmt = (fb.blog_review ?? fb.video_review ?? fb.podcast_review ?? fb.shorts_review) as Record<string, unknown> | undefined;
              const score = typeof fmt?.score === 'number' ? fmt.score as number : (fresh.review_score as number | null) ?? 0;
              const verdict = (fresh.review_verdict as string | null) ?? 'pending';
              const tier = deriveTier(fmt ?? fb);
              const iterationCount = (fresh.iteration_count as number | null) ?? 1;
              actor.send({
                type: 'REVIEW_COMPLETE',
                result: { score, qualityTier: tier, verdict, feedbackJson: fb, iterationCount },
              });
            }
          }}
          onFailed={(msg) => {
            setReviewing(false);
            setReviewSince(null);
            pendingReviewResultRef.current = null;
            const f = friendlyAiError(msg);
            toast.error(f.title, { description: f.hint });
          }}
          onClose={async () => {
            // If the user dismisses the modal while autopilot is in flight,
            // still attempt to dispatch REVIEW_COMPLETE with fresh values so
            // the machine doesn't stall in the reviewing state.
            const mode = actor.getSnapshot().context.mode;
            if (mode === 'supervised' || mode === 'overview') {
              const fresh = await refetchDraft();
              pendingReviewResultRef.current = null;
              setReviewing(false);
              setReviewSince(null);
              if (fresh) {
                const fb = (fresh.review_feedback_json as Record<string, unknown> | null) ?? {};
                const fmt = (fb.blog_review ?? fb.video_review ?? fb.podcast_review ?? fb.shorts_review) as Record<string, unknown> | undefined;
                const score = typeof fmt?.score === 'number' ? fmt.score as number : (fresh.review_score as number | null) ?? 0;
                const verdict = (fresh.review_verdict as string | null) ?? 'pending';
                const tier = deriveTier(fmt ?? fb);
                const iterationCount = (fresh.iteration_count as number | null) ?? 1;
                actor.send({
                  type: 'REVIEW_COMPLETE',
                  result: { score, qualityTier: tier, verdict, feedbackJson: fb, iterationCount },
                });
              }
            } else {
              setReviewing(false);
              setReviewSince(null);
            }
          }}
        />
      )}
    </div>
  );
}
