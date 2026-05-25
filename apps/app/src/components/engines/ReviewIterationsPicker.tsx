'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, History, Trophy } from 'lucide-react';

interface IterationEntry {
  id: string;
  iteration: number;
  score: number | null;
  verdict: string | null;
  feedbackJson: Record<string, unknown> | null;
  draftJson: Record<string, unknown> | null;
  createdAt: string;
}

interface Props {
  draftId: string;
  /** Refresh hook so the parent re-fetches the live draft after a promote. */
  onPromoted: () => Promise<void> | void;
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
            return (
              <div
                key={it.id}
                data-testid={`review-iteration-${it.iteration}`}
                className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
                  isBest ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-medium text-muted-foreground shrink-0">
                    #{it.iteration}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded border ${scoreBadgeColor(it.score)}`}
                  >
                    {it.score ?? '—'}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {verdictLabel(it.verdict)}
                  </span>
                  {isBest && (
                    <span className="text-xs text-amber-400 shrink-0 flex items-center gap-1">
                      <Trophy className="h-3 w-3" /> best
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={isBest ? 'default' : 'outline'}
                  disabled={promoting !== null || !it.draftJson}
                  onClick={() => {
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
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
