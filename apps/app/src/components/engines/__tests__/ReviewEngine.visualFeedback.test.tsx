import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createActor } from 'xstate';
import React from 'react';
import { pipelineMachine } from '@/lib/pipeline/machine';
import { PipelineActorProvider } from '@/providers/PipelineActorProvider';
import { ReviewEngine } from '../ReviewEngine';
import { DEFAULT_PIPELINE_SETTINGS, DEFAULT_CREDIT_SETTINGS } from '../types';
import { makeReviewDraftRow, makeReviewFeedback } from './fixtures/review';
import { makeAutopilotConfig } from './fixtures/draft';

vi.mock('@/hooks/use-analytics', () => ({ useAnalytics: () => ({ track: vi.fn() }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

interface MountOpts {
  draft?: Record<string, unknown> | null;
  autoApproveThreshold?: number;
}

function mountEngine(opts: MountOpts = {}) {
  const draft = opts.draft === undefined ? makeReviewDraftRow({}) : opts.draft;
  const config =
    opts.autoApproveThreshold !== undefined
      ? makeAutopilotConfig({})
      : null;
  if (config && opts.autoApproveThreshold !== undefined) {
    config.review.autoApproveThreshold = opts.autoApproveThreshold;
  }

  const actor = createActor(pipelineMachine, {
    input: {
      projectId: 'proj-1',
      channelId: 'ch-1',
      projectTitle: 'Test',
      pipelineSettings: DEFAULT_PIPELINE_SETTINGS,
      creditSettings: DEFAULT_CREDIT_SETTINGS,
    },
  }).start();
  actor.send({
    type: 'SETUP_COMPLETE',
    mode: 'step-by-step',
    autopilotConfig: config,
    templateId: null,
    startStage: 'review',
  });
  if (draft) {
    actor.send({
      type: 'STAGE_PROGRESS',
      stage: 'draft',
      partial: { draftId: (draft as { id: string }).id, draftTitle: 'T' },
    });
  }

  return render(
    <PipelineActorProvider value={actor}>
      <ReviewEngine draft={draft} />
    </PipelineActorProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/api/agents') || u.includes('/api/agent-prompts')) {
        return { ok: true, json: async () => ({ data: { agents: [] }, error: null }) } as Response;
      }
      return { ok: true, json: async () => ({ data: null, error: null }) } as Response;
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReviewEngine — visual feedback', () => {
  it('renders score (92), Approved badge, and "Ready to move to assets" when approved', () => {
    mountEngine({ draft: makeReviewDraftRow({ verdict: 'approved', score: 92 }) });

    // Score header
    expect(screen.getByText('92')).toBeInTheDocument();
    expect(screen.getByText('/100')).toBeInTheDocument();
    // Approved badge
    expect(screen.getByText(/^Approved$/i)).toBeInTheDocument();
    // Iteration count
    expect(screen.getByText(/Iteration 1/i)).toBeInTheDocument();
    // Success card
    expect(
      screen.getByText(/Draft approved! Ready to move to assets/i),
    ).toBeInTheDocument();
  });

  it('renders Revision Required badge + action buttons when verdict=revision_required', () => {
    mountEngine({ draft: makeReviewDraftRow({ verdict: 'revision_required', score: 65 }) });

    // "Revision Required" appears both as the badge label inside ReviewFeedbackPanel
    // and as the prompt copy in the action card. Either one is sufficient.
    expect(screen.getAllByText(/Revision Required/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Revision required\./)).toBeInTheDocument();
    // Action buttons
    expect(screen.getByRole('button', { name: /AI Revision/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit Manually/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Regenerate Research/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pick Different Idea/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Override Approve/i })).toBeInTheDocument();
  });

  it('renders Rejected badge when verdict=rejected', () => {
    mountEngine({ draft: makeReviewDraftRow({ verdict: 'rejected', score: 35 }) });

    expect(screen.getByText(/^Rejected$/i)).toBeInTheDocument();
    expect(screen.getByText(/Draft rejected\./i)).toBeInTheDocument();
    // Override is still offered even for rejected drafts
    expect(screen.getByRole('button', { name: /Override Approve/i })).toBeInTheDocument();
  });

  it('renders Strengths list when present', () => {
    const feedback = makeReviewFeedback({
      strengths: ['Strong opening hook', 'Clean structure', 'Authoritative sources'],
    });
    mountEngine({
      draft: makeReviewDraftRow({ verdict: 'approved', feedback }),
    });

    expect(screen.getByText(/Strengths \(3\)/i)).toBeInTheDocument();
    expect(screen.getByText('Strong opening hook')).toBeInTheDocument();
    expect(screen.getByText('Clean structure')).toBeInTheDocument();
    expect(screen.getByText('Authoritative sources')).toBeInTheDocument();
  });

  it('renders Critical Issues card with location + issue + suggested_fix', () => {
    const feedback = makeReviewFeedback({
      verdict: 'revision_required',
      score: 60,
      issues: {
        critical: [
          {
            location: 'Hook',
            issue: 'Hook contradicts the thesis in section 3.',
            suggested_fix: 'Rewrite the hook around the survival framing.',
          },
        ],
        minor: [],
      },
    });
    mountEngine({
      draft: makeReviewDraftRow({ verdict: 'revision_required', score: 60, feedback }),
    });

    expect(screen.getByText(/Critical Issues \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/^Hook$/)).toBeInTheDocument();
    expect(
      screen.getByText('Hook contradicts the thesis in section 3.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Rewrite the hook around the survival framing/i),
    ).toBeInTheDocument();
  });

  it('renders Minor Issues card with count', () => {
    const feedback = makeReviewFeedback({
      issues: {
        critical: [],
        minor: [
          { location: 'Section 1', issue: 'Sentence too long.', suggested_fix: 'Split.' },
          { location: 'Section 4', issue: 'Awkward phrasing.', suggested_fix: 'Rewrite.' },
        ],
      },
    });
    mountEngine({
      draft: makeReviewDraftRow({ verdict: 'approved', feedback }),
    });

    expect(screen.getByText(/Minor Issues \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText('Sentence too long.')).toBeInTheDocument();
    expect(screen.getByText('Awkward phrasing.')).toBeInTheDocument();
  });

  it('renders SEO check fields when feedback includes seo_check', () => {
    mountEngine({ draft: makeReviewDraftRow({}) });
    expect(screen.getByText(/SEO Check/i)).toBeInTheDocument();
    expect(screen.getByText(/Title optimized/i)).toBeInTheDocument();
    expect(screen.getByText(/Meta description optimized/i)).toBeInTheDocument();
    expect(screen.getByText(/natural, ~1.8% density/i)).toBeInTheDocument();
  });

  it('renders iteration count from draft.iteration_count', () => {
    mountEngine({
      draft: makeReviewDraftRow({ verdict: 'revision_required', iterationCount: 3 }),
    });
    expect(screen.getByText(/Iteration 3/i)).toBeInTheDocument();
  });

  it('treats score >= autoApproveThreshold from wizard as approved (override low verdict)', () => {
    // Wizard set threshold=85, score=87 with text verdict=revision_required.
    // effectiveVerdict should resolve to 'approved' because 87 >= 85.
    const draft = makeReviewDraftRow({
      verdict: 'revision_required',
      score: 87,
    });
    mountEngine({ draft, autoApproveThreshold: 85 });

    expect(
      screen.getByText(/Draft approved! Ready to move to assets/i),
    ).toBeInTheDocument();
  });

  it('shows the submit-for-review form when no review_feedback_json exists yet', () => {
    const draft = {
      id: 'draft-empty',
      title: 'Empty',
      type: 'blog',
      status: 'in_review',
      draft_json: { blog: { full_draft: '# Body' } },
      review_score: null,
      review_verdict: 'pending',
      review_feedback_json: null,
      iteration_count: 0,
    };
    mountEngine({ draft });
    expect(screen.getByText(/Submit draft for review/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Start AI Review/i }),
    ).toBeInTheDocument();
  });

  it('renders defensive fallback (does not crash) when draft is null', () => {
    expect(() => mountEngine({ draft: null })).not.toThrow();
    expect(screen.getByText(/Draft not loaded/i)).toBeInTheDocument();
  });
});
