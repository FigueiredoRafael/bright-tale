'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Check, AlertCircle, ArrowRight, ClipboardPaste, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReviewFeedbackPanel } from '@/components/preview/ReviewFeedbackPanel';
import { ManualOutputDialog } from './ManualOutputDialog';
import { useManualMode } from '@/hooks/use-manual-mode';
import { usePipelineTracker } from '@/hooks/use-pipeline-tracker';
import { GenerationProgressModal } from '@/components/generation/GenerationProgressModal';
import { ContextBanner } from './ContextBanner';
import { friendlyAiError } from '@/lib/ai/error-message';
import { useUpgrade } from '@/components/billing/UpgradeProvider';
import type { PipelineContext, PipelineStage, ReviewResult, StageResult } from './types';

interface ReviewEngineProps {
  channelId: string;
  context: PipelineContext;
  draftId: string;
  draft: {
    id: string;
    title: string | null;
    status: string;
    draft_json: Record<string, unknown> | null;
    review_feedback_json: Record<string, unknown> | null;
    review_score: number | null;
    review_verdict: string;
    iteration_count: number;
  };
  onComplete: (result: StageResult) => void;
  onBack?: (targetStage?: PipelineStage) => void;
  onDraftUpdated: (draft: Record<string, unknown>) => void;
  onStageProgress?: (partial: { score?: number; verdict?: string }) => void;
}

type ReviewMode = 'ai' | 'manual';

const REVIEW_PROVIDERS: Array<'ai' | 'manual'> = ['ai', 'manual'];

export function ReviewEngine({
  channelId,
  context,
  draftId,
  draft,
  onComplete,
  onBack,
  onDraftUpdated,
  onStageProgress,
}: ReviewEngineProps) {
  const [reviewMode, setReviewMode] = useState<ReviewMode>('ai');
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const { enabled: manualEnabled } = useManualMode();
  const { handleMaybeCreditsError } = useUpgrade();
  const inFlightRef = useRef(false);
  const tracker = usePipelineTracker('review', context);

  // Manual provider state
  const [manualState, setManualState] = useState<{
    draftId: string;
  } | null>(null);

  // Restore manual state if draft is awaiting_manual
  useEffect(() => {
    if (draft.status === 'awaiting_manual') {
      setManualState({ draftId });
    }
  }, [draft.status, draftId]);

  // Load fresh data if needed
  async function refetchDraft() {
    try {
      const res = await fetch(`/api/content-drafts/${draftId}`);
      const json = await res.json();
      if (json?.data) {
        onDraftUpdated(json.data);
      }
    } catch {
      // silent
    }
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
        tracker.trackStarted({ draftId, iterationCount: draft.iteration_count });

        // First, set status to in_review
        const patchRes = await fetch(`/api/content-drafts/${draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'in_review' }),
        });
        const patchJson = await patchRes.json();
        if (patchJson?.error) {
          tracker.trackFailed('Failed to update status');
          toast.error(patchJson.error.message ?? 'Failed to update status');
          return;
        }

        // Now run the review (with provider override if manual is selected)
        setReviewing(true);
        const res = await fetch(`/api/content-drafts/${draftId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            reviewMode === 'manual' ? { provider: 'manual' } : {}
          ),
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
        if (reviewMode === 'manual' && json.data?.status === 'awaiting_manual') {
          setManualState({ draftId });
          setReviewing(false);
          toast.info('Review prompt copied to Axiom. Paste output when ready.');
          return;
        }

        await refetchDraft();
        setReviewing(false);
        toast.success('Review completed');

        const feedbackObj = json.data?.review_feedback_json as Record<string, unknown> | null;
        const blogReview = (feedbackObj?.blog_review ?? feedbackObj?.video_review) as Record<string, unknown> | undefined;
        const score = (typeof blogReview?.score === 'number' ? blogReview.score as number : json.data?.review_score ?? 0);
        const verdict = json.data?.review_verdict ?? 'pending';
        const iterationCount = json.data?.iteration_count ?? draft.iteration_count + 1;

        tracker.trackCompleted({
          draftId,
          score,
          verdict,
          iterationCount,
          feedbackJson: feedbackObj ?? {},
        });
      } catch (e) {
        tracker.trackFailed(e instanceof Error ? e.message : 'Failed to submit for review');
        setReviewing(false);
        toast.error('Failed to submit for review');
      }
    });
  }

  async function handleManualOutputSubmit(parsed: unknown) {
    if (!manualState) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/content-drafts/${manualState.draftId}/manual-review-output`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
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
      onStageProgress?.({ score, verdict });
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
      await fetch(`/api/content-drafts/${manualState.draftId}/cancel`, { method: 'POST' });
    } catch {
      // best-effort
    } finally {
      setBusy(false);
      setManualState(null);
      onStageProgress?.({ score: undefined, verdict: undefined });
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
        const draftType = (draft.draft_json as Record<string, unknown>)?.type as string | undefined;
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

        // Normalize verdict — score ≥ 90 always means approved
        if (score >= 90) verdict = 'approved';
        else if (verdict.includes('approved')) verdict = 'approved';
        else if (verdict.includes('rejected')) verdict = 'rejected';
        else verdict = 'revision_required';

        const patchBody: Record<string, unknown> = {
          reviewFeedbackJson: feedbackJson,
          reviewScore: score,
          reviewVerdict: verdict,
          status: verdict === 'approved' ? 'approved' : 'in_review',
          iterationCount: draft.iteration_count + 1,
        };

        const res = await fetch(`/api/content-drafts/${draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        });
        const json = await res.json();
        if (json?.error) {
          toast.error(json.error.message ?? 'Failed to import review');
          return;
        }
        await refetchDraft();

        if (verdict === 'approved') {
          toast.success(`Review imported — Score: ${score}/100 — Approved!`);
        } else if (verdict === 'rejected') {
          toast.error(`Review imported — Score: ${score}/100 — Rejected`);
        } else {
          toast.warning(`Review imported — Score: ${score}/100 — Revision required`);
        }
      } catch {
        toast.error('Failed to import review');
      }
    });
  }

  async function handleRevise() {
    await withGuard(async () => {
      try {
        setReviewing(true);
        const res = await fetch(`/api/content-drafts/${draftId}/revise`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            feedback: draft.review_feedback_json,
          }),
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
      } catch {
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
            reviewScore: effectiveScore ?? draft.review_score ?? 0,
            reviewVerdict: 'approved',
          }),
        });
        const json = await res.json();
        if (json?.error) {
          toast.error(json.error.message ?? 'Failed to approve');
          return;
        }
        await refetchDraft();
        toast.success('Draft approved');
      } catch {
        toast.error('Failed to approve');
      }
    });
  }

  // Derive verdict and score — check DB fields first, then extract from feedback JSON
  const feedbackObj = draft.review_feedback_json as Record<string, unknown> | null;
  const blogReview = (feedbackObj?.blog_review ?? feedbackObj?.video_review) as Record<string, unknown> | undefined;

  const effectiveScore = draft.review_score
    ?? (typeof blogReview?.score === 'number' ? blogReview.score as number : null);

  const rawVerdict = (draft.review_verdict && draft.review_verdict !== 'pending')
    ? draft.review_verdict
    : typeof feedbackObj?.overall_verdict === 'string'
      ? (feedbackObj.overall_verdict as string).toLowerCase().replace(/\s+/g, '_')
      : typeof blogReview?.verdict === 'string'
        ? (blogReview.verdict as string).toLowerCase().replace(/\s+/g, '_')
        : draft.review_verdict;

  // Score ≥ 90 always means approved, regardless of text verdict
  const effectiveVerdict =
    (effectiveScore !== null && effectiveScore >= 90) ? 'approved'
    : (rawVerdict && rawVerdict.includes('approved')) ? 'approved'
    : (rawVerdict && rawVerdict.includes('rejected')) ? 'rejected'
    : (rawVerdict && rawVerdict !== 'pending') ? 'revision_required'
    : 'pending';

  const isApproved = effectiveVerdict === 'approved';
  const needsRevision = effectiveVerdict === 'revision_required';
  const isRejected = effectiveVerdict === 'rejected';

  // Has any review been done (even if DB fields are stale)
  const hasReview = !!draft.review_feedback_json;

  return (
    <div className="space-y-6">
      <ContextBanner stage="review" context={context} onBack={onBack} />

      {/* No review yet — submit for review */}
      {!hasReview && (
        <Card>
          <CardContent className="py-6 space-y-4">
            <div className="text-center space-y-2">
              <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">
                Submit draft for review
              </p>
              <p className="text-xs text-muted-foreground">
                The AI reviewer will evaluate content quality, SEO, and readability.
              </p>
            </div>

            {/* Provider selection */}
            <div className="space-y-4">
              <div className="flex gap-2 justify-center flex-wrap">
                <Button
                  onClick={() => {
                    setReviewMode('ai');
                    setTimeout(() => handleSubmitForReview(), 0);
                  }}
                  disabled={busy || !draft.draft_json}
                  variant={reviewMode === 'ai' ? 'default' : 'outline'}
                  size="lg"
                  className="gap-2"
                >
                  <Sparkles className="h-4 w-4" /> AI Review
                </Button>
                {manualEnabled && (
                  <Button
                    onClick={() => {
                      setReviewMode('manual');
                      setTimeout(() => handleSubmitForReview(), 0);
                    }}
                    disabled={busy || !draft.draft_json}
                    variant={reviewMode === 'manual' ? 'default' : 'outline'}
                    size="lg"
                    className="gap-2"
                  >
                    <ClipboardPaste className="h-4 w-4" /> Manual
                  </Button>
                )}
              </div>
              {reviewing && (
                <p className="text-xs text-muted-foreground text-center">
                  {reviewMode === 'manual'
                    ? 'Review prompt ready. Paste output when ready.'
                    : 'Running AI review...'}
                </p>
              )}
            </div>
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
                iterationCount={draft.iteration_count}
                feedbackJson={draft.review_feedback_json}
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
                      const score = effectiveScore ?? draft.review_score ?? 0;
                      const verdict = effectiveVerdict ?? draft.review_verdict;
                      // Ensure DB status is 'approved' before advancing
                      if (draft.status !== 'approved') {
                        await fetch(`/api/content-drafts/${draftId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            status: 'approved',
                            reviewScore: score,
                            reviewVerdict: verdict,
                          }),
                        });
                      }
                      const result: ReviewResult = {
                        score,
                        verdict,
                        feedbackJson: draft.review_feedback_json ?? {},
                        iterationCount: draft.iteration_count,
                      };
                      onComplete(result);
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
                  <div className="flex gap-2 justify-center">
                    <Button
                      onClick={() => {
                        setReviewMode('ai');
                        setTimeout(() => handleSubmitForReview(), 0);
                      }}
                      disabled={busy}
                      size="sm"
                      variant={reviewMode === 'ai' ? 'default' : 'outline'}
                      className="gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> AI Review
                    </Button>
                    {manualEnabled && (
                      <Button
                        onClick={() => {
                          setReviewMode('manual');
                          setTimeout(() => handleSubmitForReview(), 0);
                        }}
                        disabled={busy}
                        size="sm"
                        variant={reviewMode === 'manual' ? 'default' : 'outline'}
                        className="gap-1.5"
                      >
                        <ClipboardPaste className="h-3.5 w-3.5" /> Manual
                      </Button>
                    )}
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
                      onClick={() => onBack?.('draft')}
                      variant="outline"
                      size="sm"
                    >
                      Edit Manually
                    </Button>
                    <Button
                      onClick={() => onBack?.('research')}
                      variant="outline"
                      size="sm"
                    >
                      Regenerate Research
                    </Button>
                    <Button
                      onClick={() => onBack?.('brainstorm')}
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
      {reviewing && reviewMode === 'ai' && (
        <GenerationProgressModal
          open={reviewing}
          sessionId={draftId}
          sseUrl={`/api/content-drafts/${draftId}/events`}
          title="Running AI Review"
          onComplete={async () => {
            setReviewing(false);
            await refetchDraft();
            toast.success('Review completed');
          }}
          onFailed={(msg) => {
            setReviewing(false);
            const f = friendlyAiError(msg);
            toast.error(f.title, { description: f.hint });
          }}
          onClose={() => setReviewing(false)}
        />
      )}
    </div>
  );
}
