/**
 * Pipeline Orchestrator — review loop coverage.
 *
 * The audit (docs/audit-origin-gaps.md) flagged that no test verifies the
 * review-loop hand-off: when a review Stage Run finishes with verdict
 * `revision_required`, `advanceAfter` must enqueue a fresh draft Stage Run
 * carrying the review feedback in its `input_json.productionParams` so the
 * draft worker can re-produce against the critique.
 *
 * The verdict + feedback live on `stage_runs.outcome_json` (written by the
 * review dispatcher) — the orchestrator MUST NOT open
 * `payload_ref → content_drafts` to make that decision (ADR-0003).
 *
 * Supabase is mocked at the boundary. Integration against a real DB is out
 * of scope for this slice.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

interface MockChain {
  from: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
}

const mockChain: MockChain = {} as MockChain;
['from', 'select', 'insert', 'update', 'eq', 'in', 'is', 'order', 'limit'].forEach((m) => {
  (mockChain as unknown as Record<string, unknown>)[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.maybeSingle = vi.fn();
mockChain.single = vi.fn();

vi.mock('@/lib/supabase', () => ({ createServiceClient: () => mockChain }));

const { inngestSendMock } = vi.hoisted(() => ({
  inngestSendMock: vi.fn(async () => ({ ids: ['evt-1'] })),
}));
vi.mock('@/jobs/client', () => ({ inngest: { send: inngestSendMock } }));

import { advanceAfter } from '@/lib/pipeline/orchestrator';

const PROJECT_ID = '00000000-0000-0000-0000-0000000000aa';
const REVIEW_RUN_ID = 'sr-review-1';
const DRAFT_ID = 'draft-uuid-1';

beforeEach(() => {
  vi.clearAllMocks();
  ['from', 'select', 'insert', 'update', 'eq', 'in', 'is', 'order', 'limit'].forEach((m) => {
    (mockChain as unknown as Record<string, ReturnType<typeof vi.fn>>)[m] = vi.fn().mockReturnValue(mockChain);
  });
  mockChain.maybeSingle = vi.fn();
  mockChain.single = vi.fn();
});

function mockProjectRow() {
  return {
    data: {
      id: PROJECT_ID,
      mode: 'autopilot',
      paused: false,
      autopilot_config_json: {
        review: { maxIterations: 3, autoApproveThreshold: 90, hardFailThreshold: 50 },
      },
    },
    error: null,
  };
}

function mockFinishedReviewRun() {
  return {
    data: {
      id: REVIEW_RUN_ID,
      project_id: PROJECT_ID,
      stage: 'review',
      status: 'completed',
    },
    error: null,
  };
}

/** outcome_json fetch for the finished review (the orchestrator's single source of truth). */
function mockReviewOutcome(verdict: 'revision_required' | 'approved' | 'rejected', feedback: unknown = null) {
  return {
    data: {
      outcome_json: {
        verdict,
        draftType: 'blog',
        iterationCount: 1,
        score: verdict === 'approved' ? 92 : 65,
        feedbackJson: feedback,
      },
    },
    error: null,
  };
}

describe('advanceAfter — review loop hand-off (revision_required)', () => {
  it('inserts a NEW draft Stage Run when the review outcome is revision_required + carries feedback', async () => {
    const feedback = {
      blog_review: {
        score: 65,
        verdict: 'revision_required',
        issues: { critical: [{ issue: 'Hook contradicts thesis.' }], minor: [] },
      },
    };

    mockChain.maybeSingle
      // 1. Load finished review Stage Run
      .mockResolvedValueOnce(mockFinishedReviewRun())
      // 2. Load project (mode/paused/autopilot_config)
      .mockResolvedValueOnce(mockProjectRow())
      // 3. Load finished review outcome_json
      .mockResolvedValueOnce(mockReviewOutcome('revision_required', feedback))
      // 4. latestAttemptNo for 'draft' stage
      .mockResolvedValueOnce({ data: { attempt_no: 1 }, error: null });

    // 5. insertStageRun returns the new queued draft run
    mockChain.single.mockResolvedValueOnce({
      data: {
        id: 'sr-draft-2',
        project_id: PROJECT_ID,
        stage: 'draft',
        status: 'queued',
        attempt_no: 2,
      },
      error: null,
    });

    await advanceAfter(REVIEW_RUN_ID);

    expect(mockChain.insert).toHaveBeenCalledTimes(1);
    const inserted = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(inserted.project_id).toBe(PROJECT_ID);
    expect(inserted.stage).toBe('draft');
    expect(inserted.status).toBe('queued');
    expect(inserted.attempt_no).toBe(2);

    expect(inserted.input_json).toBeDefined();
    expect(inserted.input_json.type).toBe('blog');
    expect(inserted.input_json.productionParams).toBeDefined();
    expect(inserted.input_json.productionParams.review_feedback).toEqual(feedback);

    expect(inngestSendMock).toHaveBeenCalledTimes(1);
    const evt = (inngestSendMock.mock.calls[0] as unknown as unknown[])[0] as {
      name: string;
      data: { stage: string; projectId: string; stageRunId: string };
    };
    expect(evt.name).toBe('pipeline/stage.requested');
    expect(evt.data.stage).toBe('draft');
    expect(evt.data.projectId).toBe(PROJECT_ID);
    expect(evt.data.stageRunId).toBe('sr-draft-2');
  });

  it('does NOT loop back to draft when the review outcome is approved (advances to assets instead)', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedReviewRun())
      .mockResolvedValueOnce(mockProjectRow())
      .mockResolvedValueOnce(mockReviewOutcome('approved'))
      // existingNext for 'assets' → null (no prior run)
      .mockResolvedValueOnce({ data: null, error: null });

    mockChain.single.mockResolvedValueOnce({
      data: {
        id: 'sr-assets-1',
        project_id: PROJECT_ID,
        stage: 'assets',
        status: 'queued',
        attempt_no: 1,
      },
      error: null,
    });

    await advanceAfter(REVIEW_RUN_ID);

    expect(mockChain.insert).toHaveBeenCalledTimes(1);
    const inserted = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(inserted.stage).toBe('assets');
    expect(inserted.stage).not.toBe('draft');
    expect(inngestSendMock).toHaveBeenCalledTimes(1);
    const evt = (inngestSendMock.mock.calls[0] as unknown as unknown[])[0] as { data: { stage: string } };
    expect(evt.data.stage).toBe('assets');
  });

  it('does NOT loop back when the review row has no outcome_json (legacy / pre-migration)', async () => {
    // Without outcome_json, the orchestrator cannot read a verdict, so the
    // review-loop branch falls through and the normal advance runs.
    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedReviewRun())
      .mockResolvedValueOnce(mockProjectRow())
      .mockResolvedValueOnce({ data: { outcome_json: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: null }); // existingNext assets

    mockChain.single.mockResolvedValueOnce({
      data: {
        id: 'sr-assets-1',
        project_id: PROJECT_ID,
        stage: 'assets',
        status: 'queued',
        attempt_no: 1,
      },
      error: null,
    });

    await advanceAfter(REVIEW_RUN_ID);

    const inserted = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(inserted.stage).toBe('assets');
  });

  it('does NOT loop when the review outcome is rejected (terminal failure path)', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedReviewRun())
      .mockResolvedValueOnce(mockProjectRow())
      .mockResolvedValueOnce(mockReviewOutcome('rejected'))
      .mockResolvedValueOnce({ data: null, error: null });

    mockChain.single.mockResolvedValueOnce({
      data: {
        id: 'sr-assets-1',
        project_id: PROJECT_ID,
        stage: 'assets',
        status: 'queued',
        attempt_no: 1,
      },
      error: null,
    });

    await advanceAfter(REVIEW_RUN_ID);

    const inserted = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(inserted.stage).toBe('assets');
  });
});

describe('advanceAfter — review idempotency carve-out (draft finishes, prior review outcome still revision_required)', () => {
  it('queues a FRESH review run when the existing review row has outcome.verdict=revision_required', async () => {
    const finishedDraft = {
      data: { id: 'sr-draft-2', project_id: PROJECT_ID, stage: 'draft', status: 'completed' },
      error: null,
    };
    const priorReviewRow = {
      data: {
        id: 'sr-review-1',
        status: 'completed',
        outcome_json: { verdict: 'revision_required', draftType: 'blog', feedbackJson: {} },
      },
      error: null,
    };

    mockChain.maybeSingle
      .mockResolvedValueOnce(finishedDraft) // 1. finished run
      .mockResolvedValueOnce(mockProjectRow()) // 2. project
      .mockResolvedValueOnce(priorReviewRow); // 3. existingNext review row (stale completed)

    mockChain.single.mockResolvedValueOnce({
      data: {
        id: 'sr-review-2',
        project_id: PROJECT_ID,
        stage: 'review',
        status: 'queued',
        attempt_no: 1,
      },
      error: null,
    });

    await advanceAfter('sr-draft-2');

    expect(mockChain.insert).toHaveBeenCalledTimes(1);
    const inserted = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(inserted.stage).toBe('review');
    expect(inserted.status).toBe('queued');

    expect(inngestSendMock).toHaveBeenCalledTimes(1);
    const evt = (inngestSendMock.mock.calls[0] as unknown as unknown[])[0] as { data: { stage: string } };
    expect(evt.data.stage).toBe('review');
  });

  it('bails when the existing review outcome is approved (no fresh review run)', async () => {
    const finishedDraft = {
      data: { id: 'sr-draft-2', project_id: PROJECT_ID, stage: 'draft', status: 'completed' },
      error: null,
    };
    const priorReviewRow = {
      data: {
        id: 'sr-review-1',
        status: 'completed',
        outcome_json: { verdict: 'approved' },
      },
      error: null,
    };

    mockChain.maybeSingle
      .mockResolvedValueOnce(finishedDraft)
      .mockResolvedValueOnce(mockProjectRow())
      .mockResolvedValueOnce(priorReviewRow);

    await advanceAfter('sr-draft-2');

    expect(mockChain.insert).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});
