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
const isQuotaExhaustedMock = vi.fn(() => false);
vi.mock('../../lib/ai/router.js', () => ({
  generateWithFallback: generateWithFallbackMock,
  isQuotaExhausted: isQuotaExhaustedMock,
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

const STEP_MOCK = { run: <T>(_id: string, fn: () => Promise<T>) => fn() };

// Generates a rubric_evaluation for the blog rubric (10 criteria) with the
// requested number of passing criteria. Dispatcher now derives review_score
// deterministically from this evaluation (Σ weight over passes), so tests
// that need a specific score must shape the rubric, not the LLM score field.
function makeBlogRubricEval(passCount: number): Record<string, { pass: boolean; evidence: string }> {
  const keys = [
    'has_strong_hook',
    'thesis_clear_in_intro',
    'meets_word_count',
    'claims_have_inline_citations',
    'outline_matches_canonical',
    'no_promotional_tone',
    'sentence_clarity',
    'seo_meta_optimized',
    'cta_present_and_aligned',
    'strengths_preserved',
  ];
  const out: Record<string, { pass: boolean; evidence: string }> = {};
  keys.forEach((k, idx) => {
    out[k] = { pass: idx < passCount, evidence: idx < passCount ? 'pass' : 'fail' };
  });
  return out;
}
type HandlerArgs = {
  event: { data: { stageRunId: string; stage: string; projectId: string } };
  step: typeof STEP_MOCK;
};

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
              // loadPriorReviewAttempts: select('attempt_no, status, outcome_json, payload_ref').eq('stage','review').order().limit()
              if (cols.includes('attempt_no')) {
                return {
                  order: () => ({
                    limit: () => Promise.resolve({ data: [], error: null }),
                  }),
                };
              }
              return {
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () => Promise.resolve({ data: priorDraftStageRun, error: null }),
                    }),
                  }),
                }),
                // pipeline-review-dispatch now accepts both legacy `draft` and
                // current `production` stage names via `.in('stage', [...])`.
                in: () => ({
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
      // Project lookup: the dispatcher reads autopilot_config_json to resolve
      // review thresholds + maxIterations. Default config keeps the tests
      // exercising the standard verdict logic.
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: {
                  id: PROJECT_ID,
                  autopilot_config_json: {
                    review: {
                      autoApproveThreshold: 90,
                      hardFailThreshold: 40,
                      maxIterations: 5,
                    },
                  },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      // review_iterations is appended on each pass so the picker UI can show
      // (draft, review) per iteration. Mock just needs to swallow inserts.
      if (table === 'review_iterations') {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    },
  }),
}));

describe('pipeline-review-dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // The atomic CAS in pipeline-review-dispatch chains
    // `.update(...).eq('id', x).eq('status', 'queued').select('id')` and the
    // writer module also awaits `.update(...).eq('id', x)` directly. The mock
    // returns a chainable+thenable so both patterns resolve cleanly.
    function makeUpdateChain() {
      const chain: Record<string, unknown> & PromiseLike<{ data: unknown; error: null }> = {
        then(onResolve) {
          return Promise.resolve({ data: [{ id: STAGE_RUN_ID }], error: null }).then(onResolve);
        },
      } as Record<string, unknown> & PromiseLike<{ data: unknown; error: null }>;
      ['eq', 'in', 'select'].forEach((m) => {
        (chain as Record<string, ReturnType<typeof vi.fn>>)[m] = vi.fn(() => chain);
      });
      return chain;
    }
    stageRunsUpdateMock = vi.fn(() => makeUpdateChain());
    contentDraftsUpdateMock = vi.fn(() => makeUpdateChain());

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
      result: {
        overall_verdict: 'approved',
        blog_review: {
          score: 92,
          rubric_evaluation: makeBlogRubricEval(10), // 10/10 → 100 = approved
        },
      },
      providerName: 'mock',
      model: 'mock',
      usage: {},
    });
  });

  it('returns early when event stage is not review', async () => {
    const { pipelineReviewDispatch } = await import('../pipeline-review-dispatch.js');

    await (pipelineReviewDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    expect(generateWithFallbackMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it('on approved verdict: writes draft → approved + stage_run → completed + emits finished', async () => {
    const { pipelineReviewDispatch } = await import('../pipeline-review-dispatch.js');

    await (pipelineReviewDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'review', projectId: PROJECT_ID } },
      step: STEP_MOCK,
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
    // 10 passing criteria × 10 weight = 100 (rubric-derived, not LLM-set).
    expect(draftUpdate.review_score).toBe(100);

    const finishedCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
      (c) => (c[0] as { name: string }).name === 'pipeline/stage.run.finished',
    );
    expect(finishedCall).toBeDefined();
  });

  it('on revision_required verdict: writes draft → in_review, stage_run still completed', async () => {
    generateWithFallbackMock.mockResolvedValueOnce({
      result: {
        overall_verdict: 'revision_required',
        blog_review: {
          score: 60,
          rubric_evaluation: makeBlogRubricEval(6), // 6/10 → 60 = revision_required
        },
      },
      providerName: 'mock',
      model: 'mock',
      usage: {},
    });

    const { pipelineReviewDispatch } = await import('../pipeline-review-dispatch.js');

    await (pipelineReviewDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'review', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    const draftUpdate = contentDraftsUpdateMock.mock.calls[0][0];
    expect(draftUpdate.review_verdict).toBe('revision_required');
    expect(draftUpdate.status).toBe('in_review');

    const completedRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'completed');
    expect(completedRow).toBeDefined();
  });

  it('on AI failure: parks stage_run in awaiting_user(manual_paste) — always-manual fallback', async () => {
    generateWithFallbackMock.mockRejectedValueOnce(new Error('agent timeout'));

    const { pipelineReviewDispatch } = await import('../pipeline-review-dispatch.js');

    // Always-manual fallback: AI failure parks the run with manual_paste so
    // the user can paste an externally-generated BC_REVIEW_OUTPUT.
    await (pipelineReviewDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'review', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    const awaitingRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'awaiting_user');
    expect(awaitingRow).toBeDefined();
    expect(awaitingRow.awaiting_reason).toBe('manual_paste');
    expect(awaitingRow.payload_ref).toEqual({ kind: 'content_draft', id: DRAFT_ID });
  });

  it('marks stage_run failed when there is no prior draft Stage Run', async () => {
    priorDraftStageRun = null;

    const { pipelineReviewDispatch } = await import('../pipeline-review-dispatch.js');

    await (pipelineReviewDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'review', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    const failedRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'failed');
    expect(failedRow).toBeDefined();
    expect(generateWithFallbackMock).not.toHaveBeenCalled();
  });

  it('on budget exhaustion (iterationCount >= maxIterations): stage_run → awaiting_user(max_iterations)', async () => {
    // Final iteration that exhausts the budget. With maxIterations=5 and
    // draft.iteration_count=4, dispatcher computes iterationCount=5, hits the
    // budget branch, and parks the run for user review.
    draftRow = { ...(draftRow as Record<string, unknown>), iteration_count: 4 };
    generateWithFallbackMock.mockResolvedValueOnce({
      result: {
        overall_verdict: 'revision_required',
        blog_review: {
          score: 60,
          rubric_evaluation: makeBlogRubricEval(6),
        },
      },
      providerName: 'mock',
      model: 'mock',
      usage: {},
    });

    const { pipelineReviewDispatch } = await import('../pipeline-review-dispatch.js');

    await (pipelineReviewDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'review', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    const awaitingRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'awaiting_user');
    expect(awaitingRow).toBeDefined();
    expect(awaitingRow.awaiting_reason).toBe('max_iterations');

    // Non-terminal — no advance event.
    const finishedCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
      (c) => (c[0] as { name: string }).name === 'pipeline/stage.run.finished',
    );
    expect(finishedCall).toBeUndefined();
  });

  it('on provider quota exhausted: also parks awaiting_user(manual_paste) — unified always-manual fallback', async () => {
    // Quota errors used to park as `provider_quota_exhausted`; the unified
    // always-manual fallback now parks every AI failure (quota, timeout,
    // overload, all-providers-exhausted) under the same manual_paste reason
    // so the centralised paste dialog opens.
    const quotaErr = new Error('429 quota exceeded');
    generateWithFallbackMock.mockRejectedValueOnce(quotaErr);
    isQuotaExhaustedMock.mockReturnValueOnce(true);

    const { pipelineReviewDispatch } = await import('../pipeline-review-dispatch.js');

    await (pipelineReviewDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'review', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    const awaitingRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'awaiting_user');
    expect(awaitingRow).toBeDefined();
    expect(awaitingRow.awaiting_reason).toBe('manual_paste');

    const failedRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'failed');
    expect(failedRow).toBeUndefined();
  });

  it("parks the Stage Run in awaiting_user(manual_paste) and does NOT call the LLM when provider='manual'", async () => {
    stageRunRow = {
      ...stageRunRow,
      input_json: { ...((stageRunRow.input_json as Record<string, unknown>) ?? {}), provider: 'manual' },
    };

    const { pipelineReviewDispatch } = await import('../pipeline-review-dispatch.js');

    await (pipelineReviewDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'review', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    expect(generateWithFallbackMock).not.toHaveBeenCalled();

    const awaitingRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'awaiting_user');
    expect(awaitingRow).toBeDefined();
    expect(awaitingRow.awaiting_reason).toBe('manual_paste');
    expect(awaitingRow.payload_ref).toEqual({ kind: 'content_draft', id: DRAFT_ID });
  });
});
