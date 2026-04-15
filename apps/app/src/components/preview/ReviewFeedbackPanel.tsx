'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ReviewFeedbackPanelProps {
  reviewScore: number | null;
  reviewVerdict: string;
  iterationCount: number;
  feedbackJson: Record<string, unknown> | null;
}

interface ReviewIssue {
  location?: string;
  issue?: string;
  suggested_fix?: string;
}

export function ReviewFeedbackPanel({
  reviewScore,
  reviewVerdict,
  iterationCount,
  feedbackJson,
}: ReviewFeedbackPanelProps) {
  const verdictColor: Record<string, string> = {
    approved: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30',
    revision_required: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
    rejected: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
    pending: 'bg-muted text-muted-foreground border-border',
  };

  const verdictLabel: Record<string, string> = {
    approved: 'Approved',
    revision_required: 'Revision Required',
    rejected: 'Rejected',
    pending: 'Pending',
  };

  // Extract the format-specific review (blog_review, video_review, etc.)
  const blogReview = (feedbackJson?.blog_review ?? feedbackJson?.video_review
    ?? feedbackJson?.shorts_review ?? feedbackJson?.podcast_review) as Record<string, unknown> | undefined;

  // Extract score — try format review first, then top-level
  const displayScore = reviewScore
    ?? (typeof blogReview?.score === 'number' ? blogReview.score as number : null);

  // Extract verdict — try format review first, then top-level
  const displayVerdict = (reviewVerdict && reviewVerdict !== 'pending')
    ? reviewVerdict
    : typeof blogReview?.verdict === 'string'
      ? (blogReview.verdict as string).toLowerCase().replace(/\s+/g, '_')
      : reviewVerdict;

  // Overall notes
  const overallNotes = (feedbackJson?.overall_notes as string) ?? '';

  // Strengths — can be string[] directly
  const strengths = (blogReview?.strengths as string[]) ?? [];

  // Issues — handle both flat string[] and structured {critical: [{issue, location, suggested_fix}]}
  const issuesObj = blogReview?.issues as Record<string, unknown> | undefined;
  const criticalRaw = (issuesObj?.critical ?? blogReview?.critical_issues ?? []) as unknown[];
  const minorRaw = (issuesObj?.minor ?? blogReview?.minor_issues ?? []) as unknown[];

  function normalizeIssues(raw: unknown[]): ReviewIssue[] {
    return raw.map((item) => {
      if (typeof item === 'string') return { issue: item };
      if (item && typeof item === 'object') return item as ReviewIssue;
      return { issue: String(item) };
    });
  }

  const criticalIssues = normalizeIssues(criticalRaw);
  const minorIssues = normalizeIssues(minorRaw);

  // SEO check
  const seoCheck = blogReview?.seo_check as Record<string, unknown> | undefined;

  // Notes from the format review
  const reviewNotes = typeof blogReview?.notes === 'string' ? blogReview.notes as string : '';

  return (
    <div className="space-y-4">
      {/* Score + Verdict header */}
      <div className="flex items-center gap-4">
        {displayScore !== null && (
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold tabular-nums">{displayScore}</span>
            <span className="text-sm text-muted-foreground">/100</span>
          </div>
        )}
        <Badge className={verdictColor[displayVerdict] ?? verdictColor.pending} variant="outline">
          {verdictLabel[displayVerdict] ?? displayVerdict.replace(/_/g, ' ')}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Iteration {iterationCount}
        </span>
      </div>

      {/* Score bar */}
      {displayScore !== null && (
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              displayScore >= 90 ? 'bg-green-500' : displayScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${displayScore}%` }}
          />
        </div>
      )}

      {overallNotes && (
        <p className="text-sm text-muted-foreground leading-relaxed">{overallNotes}</p>
      )}

      {/* Critical issues */}
      {criticalIssues.length > 0 && (
        <Card className="border-red-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-600 dark:text-red-400">
              Critical Issues ({criticalIssues.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {criticalIssues.map((item, i) => (
              <div key={i} className="space-y-1">
                {item.location && (
                  <Badge variant="outline" className="text-[10px] mb-1">{item.location}</Badge>
                )}
                <p className="text-sm">{item.issue}</p>
                {item.suggested_fix && (
                  <p className="text-xs text-muted-foreground pl-3 border-l-2 border-green-500/30">
                    <span className="font-medium text-green-600 dark:text-green-400">Fix: </span>
                    {item.suggested_fix}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Minor issues */}
      {minorIssues.length > 0 && (
        <Card className="border-yellow-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-yellow-600 dark:text-yellow-400">
              Minor Issues ({minorIssues.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {minorIssues.map((item, i) => (
              <div key={i} className="space-y-1">
                {item.location && (
                  <Badge variant="outline" className="text-[10px] mb-1">{item.location}</Badge>
                )}
                <p className="text-sm">{item.issue}</p>
                {item.suggested_fix && (
                  <p className="text-xs text-muted-foreground pl-3 border-l-2 border-green-500/30">
                    <span className="font-medium text-green-600 dark:text-green-400">Fix: </span>
                    {item.suggested_fix}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* SEO check */}
      {seoCheck && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">SEO Check</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {typeof seoCheck.title_optimized === 'boolean' && (
                <div className="flex items-center gap-1.5">
                  <div className={`h-2 w-2 rounded-full ${seoCheck.title_optimized ? 'bg-green-500' : 'bg-red-500'}`} />
                  Title {seoCheck.title_optimized ? 'optimized' : 'needs work'}
                </div>
              )}
              {typeof seoCheck.meta_description_optimized === 'boolean' && (
                <div className="flex items-center gap-1.5">
                  <div className={`h-2 w-2 rounded-full ${seoCheck.meta_description_optimized ? 'bg-green-500' : 'bg-red-500'}`} />
                  Meta description {seoCheck.meta_description_optimized ? 'optimized' : 'needs work'}
                </div>
              )}
              {typeof seoCheck.keyword_usage === 'string' && (
                <div className="col-span-2 text-muted-foreground">Keywords: {seoCheck.keyword_usage}</div>
              )}
              {typeof seoCheck.readability_score === 'string' && seoCheck.readability_score !== 'N/A' && (
                <div className="col-span-2 text-muted-foreground">Readability: {seoCheck.readability_score}</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Strengths */}
      {strengths.length > 0 && (
        <Card className="border-green-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-600 dark:text-green-400">
              Strengths ({strengths.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Review notes */}
      {reviewNotes && (
        <p className="text-xs text-muted-foreground italic">{reviewNotes}</p>
      )}
    </div>
  );
}
