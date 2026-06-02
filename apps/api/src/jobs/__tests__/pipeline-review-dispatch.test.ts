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

// Per-test configurable track row. `null` means "no track found" (track_id is
// either absent or the row does not exist). Tests that need a track override
// set this before running the handler.
let trackRow: Record<string, unknown> | null;

// Per-test configurable project row autopilot_config_json. Defaults to the
// standard test config (review: autoApprove=90, hardFail=40, maxIter=5).
// Tests that need a different project config reassign this before the handler.
let projectAutopilotConfigJson: Record<string, unknown>;

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
                  autopilot_config_json: projectAutopilotConfigJson,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      // Track lookup: the dispatcher loads the track row when stageRun.track_id
      // is non-null so it can feed track.autopilot_config_json into the resolver.
      if (table === 'tracks') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: trackRow, error: null }),
            }),
          }),
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

    // Default: no track association. Tests that exercise track overrides must
    // set stageRunRow.track_id and trackRow before invoking the handler.
    trackRow = null;
    // Default project config. Tests that need no-review-config set this to {}.
    projectAutopilotConfigJson = {
      review: {
        autoApproveThreshold: 90,
        hardFailThreshold: 40,
        maxIterations: 5,
      },
    };

    stageRunRow = {
      id: STAGE_RUN_ID,
      project_id: PROJECT_ID,
      stage: 'review',
      status: 'queued',
      track_id: null,
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

  it('on AI failure: stage_run → failed, emits finished', async () => {
    generateWithFallbackMock.mockRejectedValueOnce(new Error('agent timeout'));

    const { pipelineReviewDispatch } = await import('../pipeline-review-dispatch.js');

    await expect(
      (pipelineReviewDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'review', projectId: PROJECT_ID } },
        step: STEP_MOCK,
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

  it('on provider quota exhausted: stage_run → awaiting_user(provider_quota_exhausted), no rethrow', async () => {
    const quotaErr = new Error('429 quota exceeded');
    generateWithFallbackMock.mockRejectedValueOnce(quotaErr);
    isQuotaExhaustedMock.mockReturnValueOnce(true);

    const { pipelineReviewDispatch } = await import('../pipeline-review-dispatch.js');

    // Quota exhaustion swallows the rethrow because the run is parked, not failed.
    await (pipelineReviewDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'review', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    const awaitingRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'awaiting_user');
    expect(awaitingRow).toBeDefined();
    expect(awaitingRow.awaiting_reason).toBe('provider_quota_exhausted');

    const failedRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'failed');
    expect(failedRow).toBeUndefined();
  });

  // ── Per-track config resolution (BRI-25) ──────────────────────────────────

  it('track override wins: track autoApproveThreshold=80 beats project=90 → 85-score draft is approved', async () => {
    // Project says autoApprove at 90, track overrides to 80. A score of 85
    // (8/10 rubric passes) is below 90 but above 80 — with the track override
    // the draft should be approved; without it (bug), it would be revision_required.
    stageRunRow = { ...stageRunRow, track_id: 'track-abc', input_json: {} };
    trackRow = {
      id: 'track-abc',
      autopilot_config_json: {
        review: { autoApproveThreshold: 80 },
      },
    };

    // 8/10 rubric passes → score 80 → should be approved because track threshold = 80
    generateWithFallbackMock.mockResolvedValueOnce({
      result: {
        overall_verdict: 'revision_required', // LLM says revise, but rubric score >= 80 → approved
        blog_review: {
          score: 80,
          rubric_evaluation: makeBlogRubricEval(8),
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
    // Track threshold (80) applied → score 80 >= 80 → approved
    expect(draftUpdate.review_verdict).toBe('approved');
    expect(draftUpdate.status).toBe('approved');
  });

  it('no track (track_id null): falls back to project autoApproveThreshold=90', async () => {
    // stageRunRow.track_id is already null by default (set in beforeEach).
    // Project threshold = 90. Score of 80 (8/10 passes) is below 90 → revision_required.
    generateWithFallbackMock.mockResolvedValueOnce({
      result: {
        overall_verdict: 'revision_required',
        blog_review: {
          score: 80,
          rubric_evaluation: makeBlogRubricEval(8),
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
    // Project threshold (90) applied → score 80 < 90 → revision_required
    expect(draftUpdate.review_verdict).toBe('revision_required');
    expect(draftUpdate.status).toBe('in_review');
  });

  it('neither project nor track config: resolver FALLBACK used (autoApprove=90, hardFail=50, maxIter=3)', async () => {
    // Set projectAutopilotConfigJson to empty so neither project nor track has a
    // review slot. The resolver falls back to FALLBACK_BY_STAGE.review =
    // { autoApprove: 90, hardFail: 50, maxIter: 3 }.
    //
    // With FALLBACK hardFail=50: a score of 45 (below 50) → rejected.
    // Under the old bug (hardFail=40): 45 >= 40 → revision_required. This
    // assertion is the discriminating signal that proves the resolver is used.
    projectAutopilotConfigJson = {}; // no review slot → resolver returns FALLBACK
    stageRunRow = { ...stageRunRow, track_id: null, input_json: {} };

    // 4/10 rubric passes → score 40; wait, we need score < 50 but > 40 to distinguish.
    // Use a non-rubric path: override draftRow.type to something without a rubric
    // so the LLM score field is used directly. 'podcast' has no rubric.
    draftRow = { ...(draftRow as Record<string, unknown>), type: 'podcast' };

    generateWithFallbackMock.mockResolvedValueOnce({
      result: {
        overall_verdict: 'revision_required',
        podcast_review: { score: 45 },
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
    // FALLBACK hardFailThreshold=50: score 45 < 50 → rejected
    expect(draftUpdate.review_verdict).toBe('rejected');
    expect(draftUpdate.status).toBe('failed');
  });

  it('input.* wins over track+project: input_json.autoApproveThreshold used even when track differs', async () => {
    // input overrides take priority: input says 95, track says 80, project says 90.
    // Score 80 (8/10 passes, rubric pct=80 → deriveVerdict=revision_required):
    //   • without input override: track threshold=80 → 80 >= 80 → approved
    //   • with input override=95: 80 < 95 → revision_required  ← expected
    stageRunRow = {
      ...stageRunRow,
      track_id: 'track-xyz',
      input_json: { autoApproveThreshold: 95 },
    };
    trackRow = {
      id: 'track-xyz',
      autopilot_config_json: {
        review: { autoApproveThreshold: 80 },
      },
    };

    generateWithFallbackMock.mockResolvedValueOnce({
      result: {
        overall_verdict: 'revision_required',
        blog_review: {
          score: 80,
          rubric_evaluation: makeBlogRubricEval(8), // 8/10 → score=80 → pct=80 → revision_required
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
    // input threshold (95) wins over track (80) → score 80 < 95 → revision_required
    expect(draftUpdate.review_verdict).toBe('revision_required');
    expect(draftUpdate.status).toBe('in_review');
  });
});

