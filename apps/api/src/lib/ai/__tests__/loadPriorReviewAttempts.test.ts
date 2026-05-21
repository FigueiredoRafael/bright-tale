import { describe, it, expect, vi } from 'vitest';
import { loadPriorReviewAttempts } from '../loadPriorReviewAttempts.js';

function buildSb({
  stageRows = [] as Array<Record<string, unknown>>,
  draftRow = null as Record<string, unknown> | null,
}: {
  stageRows?: Array<Record<string, unknown>>;
  draftRow?: Record<string, unknown> | null;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'stage_runs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: stageRows, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'content_drafts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: draftRow, error: null }),
            }),
          }),
        };
      }
      return {};
    }),
  };
}

describe('loadPriorReviewAttempts', () => {
  it('returns [] when no stage_runs and no content_drafts row', async () => {
    const sb = buildSb({});
    const result = await loadPriorReviewAttempts(sb as never, 'draft-1', 'blog');
    expect(result).toEqual([]);
  });

  it('extracts attempts from stage_runs matching the draft', async () => {
    const sb = buildSb({
      stageRows: [
        {
          attempt_no: 2,
          status: 'completed',
          payload_ref: { kind: 'content_draft', id: 'draft-1' },
          outcome_json: {
            score: 68,
            verdict: 'revision_required',
            feedbackJson: {
              overall_verdict: 'revision_required',
              blog_review: {
                score: 68,
                issues: {
                  critical: ['weak intro'],
                  minor: ['repetitive'],
                },
              },
            },
          },
        },
        {
          attempt_no: 1,
          status: 'completed',
          payload_ref: { kind: 'content_draft', id: 'draft-1' },
          outcome_json: {
            score: 72,
            verdict: 'revision_required',
            feedbackJson: {
              blog_review: {
                score: 72,
                rubric_checks: {
                  critical_issues: ['weak intro'],
                  minor_issues: [],
                },
              },
            },
          },
        },
      ],
    });
    const result = await loadPriorReviewAttempts(sb as never, 'draft-1', 'blog');
    expect(result).toHaveLength(2);
    expect(result[0].attemptNo).toBe(2);
    expect(result[0].score).toBe(68);
    expect(result[0].criticalIssues).toContain('weak intro');
    expect(result[0].minorIssues).toContain('repetitive');
    expect(result[1].attemptNo).toBe(1);
    expect(result[1].score).toBe(72);
  });

  it('skips rows whose payload_ref points at a different draft', async () => {
    const sb = buildSb({
      stageRows: [
        {
          attempt_no: 1,
          status: 'completed',
          payload_ref: { kind: 'content_draft', id: 'draft-OTHER' },
          outcome_json: { score: 50, feedbackJson: {} },
        },
      ],
    });
    const result = await loadPriorReviewAttempts(sb as never, 'draft-1', 'blog');
    expect(result).toEqual([]);
  });

  it('excludes the current attempt_no when supplied', async () => {
    const sb = buildSb({
      stageRows: [
        {
          attempt_no: 3,
          payload_ref: { kind: 'content_draft', id: 'draft-1' },
          outcome_json: { score: 70, feedbackJson: {} },
        },
        {
          attempt_no: 2,
          payload_ref: { kind: 'content_draft', id: 'draft-1' },
          outcome_json: { score: 65, feedbackJson: {} },
        },
      ],
    });
    const result = await loadPriorReviewAttempts(sb as never, 'draft-1', 'blog', {
      excludeCurrentAttemptNo: 3,
    });
    expect(result).toHaveLength(1);
    expect(result[0].attemptNo).toBe(2);
  });

  it('skipLatest drops the most recent stage_run (producer post-review use case)', async () => {
    const sb = buildSb({
      stageRows: [
        {
          attempt_no: 5,
          payload_ref: { kind: 'content_draft', id: 'draft-1' },
          outcome_json: { score: 60, feedbackJson: {} },
        },
        {
          attempt_no: 4,
          payload_ref: { kind: 'content_draft', id: 'draft-1' },
          outcome_json: { score: 55, feedbackJson: {} },
        },
        {
          attempt_no: 3,
          payload_ref: { kind: 'content_draft', id: 'draft-1' },
          outcome_json: { score: 50, feedbackJson: {} },
        },
      ],
    });
    const result = await loadPriorReviewAttempts(sb as never, 'draft-1', 'blog', {
      skipLatest: true,
    });
    expect(result).toHaveLength(2);
    expect(result[0].attemptNo).toBe(4);
    expect(result[1].attemptNo).toBe(3);
  });

  it('falls back to content_drafts.review_feedback_json when no stage_runs match', async () => {
    const sb = buildSb({
      draftRow: {
        review_score: 60,
        review_verdict: 'revision_required',
        iteration_count: 1,
        review_feedback_json: {
          overall_verdict: 'revision_required',
          blog_review: {
            score: 60,
            issues: { critical: ['no CTA'], minor: [] },
          },
        },
      },
    });
    const result = await loadPriorReviewAttempts(sb as never, 'draft-1', 'blog');
    expect(result).toHaveLength(1);
    expect(result[0].attemptNo).toBe(1);
    expect(result[0].score).toBe(60);
    expect(result[0].criticalIssues).toContain('no CTA');
  });

  it('unwraps BC_REVIEW_OUTPUT envelope when present', async () => {
    const sb = buildSb({
      draftRow: {
        review_score: 55,
        review_verdict: 'revision_required',
        iteration_count: 1,
        review_feedback_json: {
          BC_REVIEW_OUTPUT: {
            overall_verdict: 'revision_required',
            blog_review: {
              score: 55,
              issues: { critical: ['fact wrong'], minor: ['typo'] },
            },
          },
        },
      },
    });
    const result = await loadPriorReviewAttempts(sb as never, 'draft-1', 'blog');
    expect(result[0].criticalIssues).toContain('fact wrong');
    expect(result[0].minorIssues).toContain('typo');
  });
});
