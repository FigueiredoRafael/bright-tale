'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Check, AlertCircle, ArrowRight, ClipboardPaste, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReviewFeedbackPanel } from '@/components/preview/ReviewFeedbackPanel';
import { ManualModePanel } from '@/components/ai/ManualModePanel';
import { useManualMode } from '@/hooks/use-manual-mode';
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
}

type ReviewMode = 'ai' | 'manual';

export function ReviewEngine({
  channelId,
  context,
  draftId,
  draft,
  onComplete,
  onBack,
  onDraftUpdated,
}: ReviewEngineProps) {
  const [reviewMode, setReviewMode] = useState<ReviewMode>('ai');
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const { enabled: manualEnabled } = useManualMode();
  const { handleMaybeCreditsError } = useUpgrade();
  const inFlightRef = useRef(false);

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
        // First, set status to in_review
        const patchRes = await fetch(`/api/content-drafts/${draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'in_review' }),
        });
        const patchJson = await patchRes.json();
        if (patchJson?.error) {
          toast.error(patchJson.error.message ?? 'Failed to update status');
          return;
        }

        // Now run the review
        setReviewing(true);
        const res = await fetch(`/api/content-drafts/${draftId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
        toast.success('Review completed');
      } catch {
        setReviewing(false);
        toast.error('Failed to submit for review');
      }
    });
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

        // Normalize verdict values
        if (verdict === 'approved' || verdict === 'approve') verdict = 'approved';
        else if (verdict === 'rejected' || verdict === 'reject') verdict = 'rejected';
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
          body: JSON.stringify({ status: 'approved' }),
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

  // Check if verdict is approved
  const isApproved =
    draft.review_verdict === 'approved' ||
    (draft.review_score !== null && draft.review_score >= 90);

  // Check if revision is needed
  const needsRevision =
    draft.review_verdict === 'revision_required' ||
    (draft.review_score !== null && draft.review_score < 90 && draft.review_score >= 40);

  // Check if rejected
  const isRejected =
    draft.review_verdict === 'rejected' ||
    (draft.review_score !== null && draft.review_score < 40);

  return (
    <div className="space-y-6">
      <ContextBanner stage="review" context={context} onBack={onBack} />

      {/* No review yet — submit for review */}
      {!draft.review_feedback_json && (
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

            {/* AI/Manual Tabs */}
            <Tabs
              value={reviewMode}
              onValueChange={(v) => setReviewMode(v as ReviewMode)}
              className="mt-4"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="ai" className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> AI Review
                </TabsTrigger>
                {manualEnabled && (
                  <TabsTrigger value="manual" className="gap-1.5">
                    <ClipboardPaste className="h-3.5 w-3.5" /> Manual (ChatGPT)
                  </TabsTrigger>
                )}
              </TabsList>

              {/* AI mode */}
              <TabsContent value="ai" className="mt-4">
                <div className="flex justify-center">
                  <Button
                    onClick={handleSubmitForReview}
                    disabled={busy || !draft.draft_json}
                    size="lg"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Reviewing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Submit for AI Review
                      </>
                    )}
                  </Button>
                </div>
                {!draft.draft_json && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Generate the draft first
                  </p>
                )}
              </TabsContent>

              {/* Manual mode */}
              {manualEnabled && (
                <TabsContent value="manual" className="mt-4">
                  <ManualModePanel
                    agentSlug="review"
                    inputContext={(() => {
                      const lines: string[] = [
                        `Title: ${draft.title || '(no title)'}`,
                      ];
                      if (context.ideaTitle) lines.push(`Idea: ${context.ideaTitle}`);
                      if (context.ideaCoreTension) lines.push(`Core Tension: ${context.ideaCoreTension}`);
                      if (draft.draft_json) {
                        lines.push('', '## Draft Content (to review)');
                        lines.push('```json');
                        lines.push(JSON.stringify(draft.draft_json, null, 2));
                        lines.push('```');
                      }
                      return lines.join('\n');
                    })()}
                    pastePlaceholder={
                      'Paste review JSON with verdict, score, and feedback'
                    }
                    onImport={handleManualImport}
                    importLabel="Import Review"
                    loading={busy}
                  />
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Review feedback exists */}
      {draft.review_feedback_json && (
        <>
          {/* Show feedback panel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review Feedback</CardTitle>
            </CardHeader>
            <CardContent>
              <ReviewFeedbackPanel
                reviewScore={draft.review_score}
                reviewVerdict={draft.review_verdict}
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
                    onClick={() => {
                      const result: ReviewResult = {
                        score: draft.review_score ?? 0,
                        verdict: draft.review_verdict,
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

          {/* Needs revision */}
          {needsRevision && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="py-4 space-y-4">
                <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                  <AlertCircle className="h-4 w-4" />
                  <span>Revision required. Choose an action:</span>
                </div>
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

          {/* Rejected */}
          {isRejected && (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="py-4 space-y-4">
                <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                  <AlertCircle className="h-4 w-4" />
                  <span>Draft rejected. Please address critical issues.</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
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
                    className="col-span-2"
                  >
                    Pick Different Idea
                  </Button>
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

      {/* SSE generation modal */}
      {reviewing && (
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
