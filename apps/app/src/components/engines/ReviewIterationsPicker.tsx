'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ChevronDown, ChevronUp, History, Info, Trophy } from 'lucide-react';

interface IterationEntry {
  id: string;
  iteration: number;
  score: number | null;
  verdict: string | null;
  feedbackJson: Record<string, unknown> | null;
  draftJson: Record<string, unknown> | null;
  createdAt: string;
  produceCostCents: number | null;
  reviewCostCents: number | null;
  lastRevisionStrategy: string | null;
}

interface IterationDetails {
  overallNotes: string | null;
  qualityTier: string | null;
  formatVerdict: string | null;
  majorIssues: string[];
  minorIssues: string[];
}

function extractDetails(feedback: Record<string, unknown> | null): IterationDetails {
  if (!feedback) {
    return { overallNotes: null, qualityTier: null, formatVerdict: null, majorIssues: [], minorIssues: [] };
  }
  const formatReview =
    (feedback.blog_review ??
      feedback.video_review ??
      feedback.podcast_review ??
      feedback.shorts_review) as Record<string, unknown> | undefined;
  const issuesObj = (formatReview?.issues as Record<string, unknown> | undefined) ?? {};
  const pickIssues = (key: string): string[] => {
    const arr = issuesObj[key];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object' && typeof (entry as { issue?: unknown }).issue === 'string') {
          return (entry as { issue: string }).issue;
        }
        return null;
      })
      .filter((s): s is string => !!s);
  };

  const overallNotes =
    (typeof feedback.overall_notes === 'string' ? (feedback.overall_notes as string) : null) ??
    (typeof formatReview?.notes === 'string' ? (formatReview.notes as string) : null);

  return {
    overallNotes,
    qualityTier: (formatReview?.quality_tier as string | undefined) ?? null,
    formatVerdict: (formatReview?.verdict as string | undefined) ?? null,
    majorIssues: pickIssues('major'),
    minorIssues: pickIssues('minor'),
  };
}

interface Props {
  draftId: string;
  /** Refresh hook so the parent re-fetches the live draft after a promote. */
  onPromoted: () => Promise<void> | void;
}

/** Format an integer cents value as "$X.XX", or "—" when null. */
function formatCents(cents: number | null): string {
  if (cents === null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function scoreBadgeColor(score: number | null): string {
  if (score === null) return 'bg-muted text-muted-foreground';
  if (score >= 90) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (score >= 75) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
}

function verdictLabel(verdict: string | null): string {
  if (!verdict) return '—';
  if (verdict === 'approved') return 'Approved';
  if (verdict === 'rejected') return 'Rejected';
  return 'Needs revision';
}

export function ReviewIterationsPicker({ draftId, onPromoted }: Props) {
  const [iterations, setIterations] = useState<IterationEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [promoting, setPromoting] = useState<number | null>(null);
  const [openIter, setOpenIter] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/content-drafts/${draftId}/iterations`);
        const json = await res.json();
        if (cancelled) return;
        if (json?.error) {
          setError(json.error.message ?? 'Failed to load iterations');
          return;
        }
        setIterations((json.data?.iterations ?? []) as IterationEntry[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load iterations');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  if (error) {
    return (
      <Card data-testid="review-iterations-error">
        <CardContent className="py-3 text-xs text-destructive">
          Failed to load iteration history: {error}
        </CardContent>
      </Card>
    );
  }

  // Need at least 2 iterations to make a meaningful pick.
  if (!iterations || iterations.length < 2) return null;

  const ordered = [...iterations].sort((a, b) => b.iteration - a.iteration);
  const best = [...iterations].reduce<IterationEntry | null>((acc, cur) => {
    if (cur.score === null) return acc;
    if (!acc || (acc.score ?? -Infinity) < cur.score) return cur;
    return acc;
  }, null);

  async function promote(iter: number) {
    setPromoting(iter);
    try {
      const res = await fetch(`/api/content-drafts/${draftId}/iterations/${iter}/promote`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json?.error) {
        setError(json.error.message ?? 'Failed to promote iteration');
        return;
      }
      await onPromoted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to promote iteration');
    } finally {
      setPromoting(null);
    }
  }

  return (
    <Card data-testid="review-iterations-picker">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Iteration history ({iterations.length})
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setExpanded((v) => !v)}
            data-testid="review-iterations-toggle"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" /> Hide
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" /> Show
              </>
            )}
          </Button>
        </CardTitle>
        {best && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
            <Trophy className="h-3 w-3 text-amber-400" />
            Best so far: iteration {best.iteration} · score {best.score}
          </p>
        )}
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-2">
          {ordered.map((it) => {
            const isBest = best?.id === it.id;
            const isOpen = openIter === it.iteration;
            const details = extractDetails(it.feedbackJson);
            const issuesCount = details.majorIssues.length + details.minorIssues.length;
            // Score delta vs prior iteration (iteration - 1 in ascending order).
            const priorIter = iterations.find((p) => p.iteration === it.iteration - 1);
            const scoreDelta =
              it.score !== null && priorIter?.score !== null && priorIter?.score !== undefined
                ? it.score - priorIter.score
                : null;
            return (
              <div
                key={it.id}
                data-testid={`review-iteration-${it.iteration}`}
                className={`rounded-md border ${
                  isBest ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpenIter(isOpen ? null : it.iteration)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                    data-testid={`review-iteration-${it.iteration}-toggle`}
                  >
                    <span className="text-xs font-medium text-muted-foreground shrink-0">
                      #{it.iteration}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded border ${scoreBadgeColor(it.score)}`}
                    >
                      {it.score ?? '—'}
                    </span>
                    {scoreDelta !== null && (
                      <span
                        className={`text-[10px] font-mono shrink-0 ${
                          scoreDelta > 0
                            ? 'text-emerald-400'
                            : scoreDelta < 0
                              ? 'text-rose-400'
                              : 'text-muted-foreground'
                        }`}
                        title={`Score delta vs iteration ${it.iteration - 1}`}
                      >
                        {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta === 0 ? '±0' : `${scoreDelta}`}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground truncate">
                      {verdictLabel(it.verdict)}
                    </span>
                    {issuesCount > 0 && (
                      <span className="text-[10px] text-muted-foreground/80 shrink-0 inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {issuesCount} issue{issuesCount === 1 ? '' : 's'}
                      </span>
                    )}
                    {isBest && (
                      <span className="text-xs text-amber-400 shrink-0 flex items-center gap-1">
                        <Trophy className="h-3 w-3" /> best
                      </span>
                    )}
                    {isOpen ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
                    )}
                  </button>
                  <Button
                    size="sm"
                    variant={isBest ? 'default' : 'outline'}
                    disabled={promoting !== null || !it.draftJson}
                    onClick={(e) => {
                      e.stopPropagation();
                      void promote(it.iteration);
                    }}
                    data-testid={`review-iterations-promote-${it.iteration}`}
                    className="h-7 text-xs shrink-0"
                    title={
                      !it.draftJson
                        ? 'Snapshot unavailable for this iteration'
                        : 'Lock in this version as approved'
                    }
                  >
                    {promoting === it.iteration ? 'Promoting…' : 'Use this'}
                  </Button>
                </div>
                {isOpen && (
                  <div
                    data-testid={`review-iteration-${it.iteration}-details`}
                    className="border-t border-border/60 px-3 py-2.5 space-y-2.5 text-xs"
                  >
                    {/* Cost row */}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground/80 font-mono">
                      <span>Producer {formatCents(it.produceCostCents)}</span>
                      <span aria-hidden>·</span>
                      <span>Reviewer {formatCents(it.reviewCostCents)}</span>
                      {(it.produceCostCents !== null || it.reviewCostCents !== null) && (
                        <>
                          <span aria-hidden>·</span>
                          <span>
                            Total {formatCents(
                              (it.produceCostCents ?? 0) + (it.reviewCostCents ?? 0),
                            )}
                          </span>
                        </>
                      )}
                    </div>
                    {/* Producer fix attempt */}
                    {it.lastRevisionStrategy && (
                      <p className="text-[10px] text-muted-foreground/90 italic">
                        <span className="not-italic font-medium text-muted-foreground">Producer fix attempt:</span>{' '}
                        {it.lastRevisionStrategy}
                      </p>
                    )}
                    {it.score === null && (
                      <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 px-2.5 py-2 text-amber-200">
                        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">No numeric score returned by reviewer.</p>
                          {details.qualityTier && (
                            <p className="text-amber-200/80 mt-0.5">
                              quality_tier = <span className="font-mono">{details.qualityTier}</span>
                              {details.formatVerdict && (
                                <> · verdict = <span className="font-mono">{details.formatVerdict}</span></>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {details.overallNotes && (
                      <p className="leading-relaxed text-foreground/90 whitespace-pre-line">
                        {details.overallNotes}
                      </p>
                    )}
                    {details.majorIssues.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-300 mb-1">
                          Major issues ({details.majorIssues.length})
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                          {details.majorIssues.slice(0, 5).map((issue, idx) => (
                            <li key={idx}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {details.minorIssues.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/90 mb-1">
                          Minor issues ({details.minorIssues.length})
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                          {details.minorIssues.slice(0, 5).map((issue, idx) => (
                            <li key={idx}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!details.overallNotes &&
                      details.majorIssues.length === 0 &&
                      details.minorIssues.length === 0 && (
                        <p className="text-muted-foreground italic">
                          No feedback details captured for this iteration.
                        </p>
                      )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
