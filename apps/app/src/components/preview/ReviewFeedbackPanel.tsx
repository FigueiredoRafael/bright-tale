'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ReviewFeedbackPanelProps {
  reviewScore: number | null;
  reviewVerdict: string;
  iterationCount: number;
  feedbackJson: Record<string, unknown> | null;
}

export function ReviewFeedbackPanel({
  reviewScore,
  reviewVerdict,
  iterationCount,
  feedbackJson,
}: ReviewFeedbackPanelProps) {
  const verdictColor: Record<string, string> = {
    approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    revision_required: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    pending: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  };

  // Extract issues from feedback
  const blogReview = feedbackJson?.blog_review as Record<string, unknown> | undefined;
  const criticalIssues = (blogReview?.critical_issues as string[]) ?? [];
  const minorIssues = (blogReview?.minor_issues as string[]) ?? [];
  const strengths = (blogReview?.strengths as string[]) ?? [];
  const overallNotes = (feedbackJson?.overall_notes as string) ?? '';

  return (
    <div className="space-y-4">
      {/* Score + Verdict header */}
      <div className="flex items-center gap-4">
        {reviewScore !== null && (
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold tabular-nums">{reviewScore}</span>
            <span className="text-sm text-muted-foreground">/100</span>
          </div>
        )}
        <Badge className={verdictColor[reviewVerdict] ?? verdictColor.pending}>
          {reviewVerdict.replace('_', ' ')}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Iteration {iterationCount}
        </span>
      </div>

      {/* Score bar */}
      {reviewScore !== null && (
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              reviewScore >= 90 ? 'bg-green-500' : reviewScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${reviewScore}%` }}
          />
        </div>
      )}

      {overallNotes && (
        <p className="text-sm text-muted-foreground">{overallNotes}</p>
      )}

      {/* Critical issues */}
      {criticalIssues.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-600 dark:text-red-400">
              Critical Issues ({criticalIssues.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {criticalIssues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Minor issues */}
      {minorIssues.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-yellow-600 dark:text-yellow-400">
              Minor Issues ({minorIssues.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {minorIssues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Strengths */}
      {strengths.length > 0 && (
        <Card>
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
    </div>
  );
}
