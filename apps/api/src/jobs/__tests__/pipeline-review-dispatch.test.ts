/**
 * Slice 8 (#16) — pipeline-review-dispatch.
 *
 * Both dispatcher and worker (no separate review session table). Runs
 * agent-4 once, writes verdict to content_drafts, transitions stage_runs
 * to completed/failed, emits pipeline/stage.run.finished.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const inngestSendMock = vi.fn(async () => ({ ids: ['evt-1'] }));
vi.mock('../client.js', () => ({
  inngest: {
    createFunction: (_config: unknown, handler: unknown) => handler,
    send: inngestSendMock,
  },
}));

const generateWithFallbackMock = vi.fn();
vi.mock('../../lib/ai/router.js', () => ({
  generateWithFallback: generateWithFallbackMock,
}));

vi.mock('../../lib/ai/promptLoader.js', () => ({
  loadAgentConfig: vi.fn(async () => ({ instructions: 'system', tools: [] })),
  resolveProviderOverride: vi.fn(() => ({ provider: 'openai', model: 'gpt-4' })),
}));

vi.mock('../../lib/ai/prompts/review.js', () => ({
  buildReviewMessage: vi.fn(() => 'review message'),
}));

const STAGE_RUN_ID = 'sr-review';
const PROJECT_ID = 'proj-xyz';
const DRAFT_ID = 'cd-1';

let stageRunRow: Record<string, unknown>;
let priorDraftStageRun: Record<string, unknown> | null;
let draftRow: Record<string, unknown> | null;
let stageRunsUpdateMock: ReturnType<typeof vi.fn>;
let contentDraftsUpdateMock: ReturnType<typeof vi.fn>;

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'stage_runs') {
        return {
          select: (cols: string) => ({
            eq: () => {
              if (cols.includes('input_json')) {
                return { maybeSingle: () => Promise.resolve({ data: stageRunRow, error: null }) };
              }
              return {
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () => Promise.resolve({ data: priorDraftStageRun, error: null }),
                    }),
                  }),
                }),
              };
            },
          }),
          update: stageRunsUpdateMock,
        };
      }
      if (table === 'content_drafts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: draftRow, error: null }),
            }),
          }),
          update: contentDraftsUpdateMock,
        };
      }
      return {};
    },
  }),
}));

describe('pipeline-review-dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    stageRunsUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    contentDraftsUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    stageRunRow = {
      id: STAGE_RUN_ID,
      project_id: PROJECT_ID,
      stage: 'review',
      status: 'queued',
      input_json: { autoApproveThreshold: 90 },
    };
    priorDraftStageRun = {
      id: 'sr-draft',
      stage: 'draft',
      status: 'completed',
      payload_ref: { kind: 'content_draft', id: DRAFT_ID },
    };
    draftRow = {
      id: DRAFT_ID,
      type: 'blog',
      title: 'My post',
      draft_json: { body: 'hi' },
      canonical_core_json: null,
      iteration_count: 0,
      model_tier: 'standard',
      channel_id: 'chan-1',
      user_id: 'user-1',
      org_id: 'org-1',
    };

    generateWithFallbackMock.mockResolvedValue({
      result: { overall_verdict: 'approved', blog_review: { score: 92 } },
      providerName: 'mock',
      model: 'mock',
      usage: {},
    });
  });

  it('returns early when event stage is not review', async () => {
    const { pipelineReviewDispatch } = await import('../pipeline-review-dispatch.js');

    await (pipelineReviewDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
    });

    expect(generateWithFallbackMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it('on approved verdict: writes draft → approved + stage_run → completed + emits finished', async () => {
    const { pipelineReviewDispatch } = await import('../pipeline-review-dispatch.js');

    await (pipelineReviewDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'review', projectId: PROJECT_ID } },
    });

    // stage_run transitioned running → completed
    const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
    expect(updateRows.some((r) => r.status === 'running')).toBe(true);
    const completedRow = updateRows.find((r) => r.status === 'completed');
    expect(completedRow).toBeDefined();
    expect(completedRow.payload_ref).toEqual({ kind: 'content_draft', id: DRAFT_ID });

    // draft updated with approved verdict
    const draftUpdate = contentDraftsUpdateMock.mock.calls[0][0];
    expect(draftUpdate.review_verdict).toBe('approved');
    expect(draftUpdate.status).toBe('approved');
    expect(draftUpdate.review_score).toBe(92);

    const finishedCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
      (c) => (c[0] as { name: string }).name === 'pipeline/stage.run.finished',
    );
    expect(finishedCall).toBeDefined();
  });

  it('on revision_required verdict: writes draft → in_review, stage_run still completed', async () => {
    generateWithFallbackMock.mockResolvedValueOnce({
      result: { overall_verdict: 'revision_required', blog_review: { score: 60 } },
      providerName: 'mock',
      model: 'mock',
      usage: {},
    });

    const { pipelineReviewDispatch } = await import('../pipeline-review-dispatch.js');

    await (pipelineReviewDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'review', projectId: PROJECT_ID } },
    });

    const draftUpdate = contentDraftsUpdateMock.mock.calls[0][0];
    expect(draftUpdate.review_verdict).toBe('revision_required');
    expect(draftUpdate.status).toBe('in_review');

    const completedRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'completed');
    expect(completedRow).toBeDefined();
  });

  it('on AI failure: stage_run → failed, emits finished', async () => {
    generateWithFallbackMock.mockRejectedValueOnce(new Error('agent timeout'));

    const { pipelineReviewDispatch } = await import('../pipeline-review-dispatch.js');

    await expect(
      (pipelineReviewDispatch as unknown as (args: {
        event: { data: { stageRunId: string; stage: string; projectId: string } };
      }) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'review', projectId: PROJECT_ID } },
      }),
    ).rejects.toThrow(/agent timeout/);

    const failedRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'failed');
    expect(failedRow).toBeDefined();
    expect(failedRow.error_message).toContain('agent timeout');
  });

  it('marks stage_run failed when there is no prior draft Stage Run', async () => {
    priorDraftStageRun = null;

    const { pipelineReviewDispatch } = await import('../pipeline-review-dispatch.js');

    await (pipelineReviewDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'review', projectId: PROJECT_ID } },
    });

    const failedRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'failed');
    expect(failedRow).toBeDefined();
    expect(generateWithFallbackMock).not.toHaveBeenCalled();
  });
});
