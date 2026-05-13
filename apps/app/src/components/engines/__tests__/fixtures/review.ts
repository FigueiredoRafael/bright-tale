export interface ReviewIssue {
  location?: string;
  issue: string;
  suggested_fix?: string;
}

export interface ReviewFeedback {
  blog_review: {
    score: number;
    verdict: 'approved' | 'revision_required' | 'rejected';
    strengths: string[];
    issues: {
      critical: ReviewIssue[];
      minor: ReviewIssue[];
    };
    notes?: string;
    seo_check?: {
      title_optimized: boolean;
      meta_description_optimized: boolean;
      keyword_usage: string;
      readability_score?: string;
    };
  };
  overall_notes?: string;
  content_warning?: string;
}

export function makeReviewFeedback(overrides: Partial<ReviewFeedback['blog_review']> = {}): ReviewFeedback {
  return {
    blog_review: {
      score: 92,
      verdict: 'approved',
      strengths: [
        'Strong narrative hook with the 76% statistic',
        'Clear thesis grounded in evolutionary biology',
        'Cited expert (Edith Widder) adds credibility',
      ],
      issues: {
        critical: [],
        minor: [
          {
            location: 'Section 2',
            issue: 'Sentence is too long — consider splitting.',
            suggested_fix: 'Break the sentence at the conjunction.',
          },
        ],
      },
      notes: 'Solid work. Minor polish would push this to excellent.',
      seo_check: {
        title_optimized: true,
        meta_description_optimized: true,
        keyword_usage: 'natural, ~1.8% density',
        readability_score: 'Grade 9',
      },
      ...overrides,
    },
    overall_notes: 'Overall verdict: ready for assets pipeline.',
  };
}

export function makeReviewDraftRow(opts: {
  id?: string;
  score?: number;
  verdict?: 'approved' | 'revision_required' | 'rejected' | 'pending';
  iterationCount?: number;
  feedback?: ReviewFeedback;
  status?: string;
} = {}) {
  const verdict = opts.verdict ?? 'approved';
  const score = opts.score ?? (verdict === 'approved' ? 92 : verdict === 'revision_required' ? 65 : 35);
  // `pending` is a pre-review state — the feedback blob doesn't carry it, so
  // pick the closest feedback verdict instead.
  const feedbackVerdict: 'approved' | 'revision_required' | 'rejected' =
    verdict === 'pending' ? 'revision_required' : verdict;
  const feedback =
    opts.feedback ??
    makeReviewFeedback({
      score,
      verdict: feedbackVerdict,
      issues: {
        critical: verdict === 'approved' ? [] : [
          {
            location: 'Section 1',
            issue: 'The hook contradicts the closing thesis.',
            suggested_fix: 'Align the hook with the survival framing in section 3.',
          },
        ],
        minor:
          verdict === 'rejected'
            ? []
            : [
                {
                  location: 'Section 2',
                  issue: 'Sentence is too long — consider splitting.',
                  suggested_fix: 'Break the sentence at the conjunction.',
                },
              ],
      },
    });

  return {
    id: opts.id ?? 'draft-1',
    title: 'Why deep-sea creatures glow without sunlight',
    type: 'blog',
    status:
      opts.status ??
      (verdict === 'approved' ? 'approved' : 'in_review'),
    draft_json: { blog: { full_draft: '# Body\n\nText.' } },
    review_score: score,
    review_verdict: verdict,
    review_feedback_json: feedback,
    iteration_count: opts.iterationCount ?? 1,
  };
}
