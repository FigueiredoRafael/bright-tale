/**
 * D66 — pipeline-production-dispatch (native).
 *
 * The dispatcher now does the produce/reproduce AI work INLINE via step.run
 * (no `production/produce` event hop). Lifecycle transitions go through
 * stage-run-writer helpers only.
 *
 * Branches covered:
 *   - Normal fresh-produce path
 *   - Revision path (productionParams.review_feedback present → reproduce)
 *   - deriveDraft failure
 *   - Missing track_id
 *   - Provider quota exhaustion → awaiting_user
 *   - JobAborted → markAborted (no rethrow)
 *   - Generic AI error → markFailed + rethrow
 *   - Replay-safe idempotency (running allowed through)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client.js', () => ({
  inngest: {
    createFunction: (_config: unknown, handler: unknown) => handler,
    send: vi.fn(async () => ({ ids: ['evt-1'] })),
  },
}));

const generateWithFallbackMock = vi.fn();
const isQuotaExhaustedMock = vi.fn(() => false);
vi.mock('../../lib/ai/router.js', () => ({
  generateWithFallback: generateWithFallbackMock,
  isQuotaExhausted: isQuotaExhaustedMock,
}));

vi.mock('../../lib/ai/promptLoader.js', () => ({
  loadAgentConfig: vi.fn(async () => ({ instructions: 'system-produce', tools: [] })),
  resolveProviderOverride: vi.fn(() => ({ provider: 'openai', model: 'gpt-4' })),
}));

const buildProduceMessageMock = vi.fn(() => 'produce-message');
const buildReproduceMessageMock = vi.fn(() => 'reproduce-message');
vi.mock('../../lib/ai/prompts/production.js', () => ({
  buildCanonicalCoreMessage: vi.fn(() => 'core-message'),
  buildProduceMessage: buildProduceMessageMock,
  buildReproduceMessage: buildReproduceMessageMock,
}));

vi.mock('../../lib/platform-settings.js', () => ({
  loadPlatformSettings: vi.fn(async () => ({ costCanonicalCore: 1, costBlogDraft: 2 })),
}));

vi.mock('../../lib/calculate-draft-cost.js', () => ({
  calculateDraftCost: vi.fn(() => 2),
}));

vi.mock('../../jobs/utils/with-reservation.js', () => ({
  withReservation: vi.fn(async (_a, _b, _c, _d, _e, _f, fn: () => Promise<unknown>) => fn()),
}));

// Default: assertNotAborted resolves normally.
const assertNotAbortedMock = vi.fn(async () => undefined);
vi.mock('../../lib/ai/abortable.js', async () => {
  class JobAbortedImpl extends Error {
    noRetry = true;
    constructor(_projectId?: string, _draftId?: string) {
      super('aborted');
      this.name = 'JobAborted';
    }
  }
  return {
    assertNotAborted: assertNotAbortedMock,
    JobAborted: JobAbortedImpl,
  };
});

vi.mock('../../jobs/emitter.js', () => ({
  emitJobEvent: vi.fn(async () => undefined),
}));

vi.mock('../../lib/ai/usage-log.js', () => ({
  logUsage: vi.fn(async () => undefined),
}));

vi.mock('../../lib/ai/tools/index.js', () => ({
  resolveTools: vi.fn(() => []),
  buildToolExecutor: vi.fn(() => undefined),
}));

vi.mock('../../lib/personas.js', () => ({
  loadPersonaForDraft: vi.fn(async () => null),
  buildLayeredPersonaContext: vi.fn(async () => null),
}));

vi.mock('../../lib/ai/loadIdeaContext.js', () => ({
  loadIdeaContext: vi.fn(async () => null),
}));

vi.mock('../../lib/ai/loadPriorReviewAttempts.js', () => ({
  loadPriorReviewAttempts: vi.fn(async () => []),
}));

vi.mock('../../lib/ai/scoring/computeRubricScore.js', () => ({
  computeRubricScore: vi.fn(() => ({ score: 80, maxScore: 100, failures: [] })),
  extractRubricEvaluation: vi.fn(() => ({})),
  getRubricForType: vi.fn(() => null),
}));

vi.mock('../../lib/content-drafts/derive.js', () => ({
  deriveDraft: vi.fn(),
}));

const STAGE_RUN_ID = 'sr-production';
const PROJECT_ID = 'proj-xyz';
const TRACK_ID = 'track-blog';
const CANONICAL_DRAFT_ID = 'cd-canonical';
const FORKED_DRAFT_ID = 'cd-forked';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const CHANNEL_ID = 'chan-1';

const STEP_MOCK = { run: <T>(_id: string, fn: () => Promise<T>) => fn() };

type HandlerArgs = {
  event: { data: { stageRunId: string; stage: string; projectId: string } };
  step: typeof STEP_MOCK;
};

let stageRunRow: Record<string, unknown>;
let projectRow: Record<string, unknown>;
let channelRow: Record<string, unknown> | null;
let trackRow: Record<string, unknown> | null;
let priorCanonicalStageRun: Record<string, unknown> | null;
let canonicalContentDraft: Record<string, unknown> | null;
let forkedDraftRow: Record<string, unknown> | null;

let stageRunsUpdateMock: ReturnType<typeof vi.fn>;
let contentDraftsUpdateMock: ReturnType<typeof vi.fn>;

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'stage_runs') {
        return {
          select: (cols: string) => ({
            eq: (_col: string, _val: unknown) => {
              if (cols.includes('input_json')) {
                return { maybeSingle: () => Promise.resolve({ data: stageRunRow, error: null }) };
              }
              return {
                eq: (_col2: string, _val2: unknown) => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () => Promise.resolve({ data: priorCanonicalStageRun, error: null }),
                    }),
                  }),
                }),
              };
            },
          }),
          update: stageRunsUpdateMock,
        };
      }
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: projectRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'channels') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: channelRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'tracks') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: trackRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'content_drafts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: forkedDraftRow ?? canonicalContentDraft, error: null }),
            }),
          }),
          update: contentDraftsUpdateMock,
        };
      }
      if (table === 'research_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { approved_cards_json: null, cards_json: null }, error: null }),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

describe('pipeline-production-dispatch (native D66)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { deriveDraft } = await import('../../lib/content-drafts/derive.js');
    (deriveDraft as ReturnType<typeof vi.fn>).mockReset();
    (deriveDraft as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: FORKED_DRAFT_ID,
      created: true,
    });

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
      stage: 'production',
      status: 'queued',
      track_id: TRACK_ID,
      publish_target_id: null,
      input_json: {},
    };
    projectRow = { id: PROJECT_ID, channel_id: CHANNEL_ID, org_id: ORG_ID };
    channelRow = { user_id: USER_ID, org_id: ORG_ID };
    trackRow = { id: TRACK_ID, project_id: PROJECT_ID, medium: 'blog', status: 'active' };
    priorCanonicalStageRun = {
      id: 'sr-canon',
      stage: 'canonical',
      status: 'completed',
      payload_ref: { kind: 'content_draft', id: CANONICAL_DRAFT_ID },
    };
    canonicalContentDraft = {
      id: CANONICAL_DRAFT_ID,
      project_id: PROJECT_ID,
      type: 'blog',
      title: 'Test blog',
      canonical_core_json: { thesis: 'core-thesis' },
      draft_json: null,
      research_session_id: 'rs-1',
      idea_id: 'idea-1',
      persona_id: null,
      channel_id: CHANNEL_ID,
      org_id: ORG_ID,
      user_id: USER_ID,
      iteration_count: 0,
    };
    forkedDraftRow = {
      id: FORKED_DRAFT_ID,
      project_id: PROJECT_ID,
      track_id: TRACK_ID,
      type: 'blog',
      title: 'Test blog',
      canonical_core_json: { thesis: 'core-thesis' },
      draft_json: null,
      research_session_id: 'rs-1',
      idea_id: 'idea-1',
      persona_id: null,
      channel_id: CHANNEL_ID,
      org_id: ORG_ID,
      user_id: USER_ID,
      iteration_count: 0,
    };

    generateWithFallbackMock.mockResolvedValue({
      result: { body: '<p>Blog content</p>' },
      providerName: 'openai',
      model: 'gpt-4',
      usage: {},
    });
    isQuotaExhaustedMock.mockReturnValue(false);
    assertNotAbortedMock.mockResolvedValue(undefined);
  });

  // ── Guard rails ─────────────────────────────────────────────────────────────

  it('returns early when event stage is not production', async () => {
    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');
    const { inngest } = await import('../client.js');

    await (pipelineProductionDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'canonical', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    expect(generateWithFallbackMock).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('bails on terminal statuses (completed, failed, aborted)', async () => {
    stageRunRow = { ...stageRunRow, status: 'completed' };

    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');

    await (pipelineProductionDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'production', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    expect(generateWithFallbackMock).not.toHaveBeenCalled();
  });

  it('allows running status through (Inngest replay idempotency)', async () => {
    stageRunRow = { ...stageRunRow, status: 'running' };

    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');

    await expect(
      (pipelineProductionDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'production', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      }),
    ).resolves.not.toThrow();
  });

  it('fails the Stage Run when track_id is missing', async () => {
    stageRunRow = { ...stageRunRow, track_id: null };
    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');
    const { inngest } = await import('../client.js');

    await (pipelineProductionDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'production', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    expect(inngest.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'production/produce' }),
    );
    const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
    const failedRow = updateRows.find((r) => r.status === 'failed');
    expect(failedRow).toBeDefined();
  });

  // ── Normal fresh-produce path ────────────────────────────────────────────────

  it('derives per-track draft, calls generateWithFallback (produce), saves draft_json, markCompleted', async () => {
    const { deriveDraft } = await import('../../lib/content-drafts/derive.js');
    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');
    const { inngest } = await import('../client.js');

    await (pipelineProductionDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'production', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    // deriveDraft called with canonical source
    expect(deriveDraft).toHaveBeenCalledTimes(1);
    const deriveArgs = (deriveDraft as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(deriveArgs).toEqual({
      sourceId: CANONICAL_DRAFT_ID,
      trackId: TRACK_ID,
      medium: 'blog',
      userId: USER_ID,
    });

    // AI called inline
    expect(generateWithFallbackMock).toHaveBeenCalledTimes(1);

    // Uses buildProduceMessage (not reproduce)
    expect(buildProduceMessageMock).toHaveBeenCalledTimes(1);
    expect(buildReproduceMessageMock).not.toHaveBeenCalled();

    // draft_json saved
    const draftUpdates = contentDraftsUpdateMock.mock.calls.map((c) => c[0]);
    const draftSave = draftUpdates.find((r) => r.draft_json !== undefined);
    expect(draftSave).toBeDefined();
    expect(draftSave.status).toBe('draft');

    // Stage Run marked completed with payloadRef and outcome.revision=false
    const stageUpdates = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
    const completedRow = stageUpdates.find((r) => r.status === 'completed');
    expect(completedRow).toBeDefined();
    expect(completedRow.payload_ref).toEqual({ kind: 'content_draft', id: FORKED_DRAFT_ID });
    expect(completedRow.outcome_json).toEqual(expect.objectContaining({ revision: false }));

    // NO production/produce event emitted
    const allSentNames = (inngest.send as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[0] as { name: string }).name,
    );
    expect(allSentNames).not.toContain('production/produce');
  });

  it('derives with Track medium even when canonical type differs', async () => {
    const { deriveDraft } = await import('../../lib/content-drafts/derive.js');
    (deriveDraft as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'derived-video-id', created: true });

    trackRow = { id: 'track-video', project_id: PROJECT_ID, medium: 'video', status: 'active' };
    stageRunRow = { ...stageRunRow, track_id: 'track-video' };
    forkedDraftRow = { ...forkedDraftRow, id: 'derived-video-id', track_id: 'track-video', type: 'video' };

    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');

    await (pipelineProductionDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'production', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    expect((deriveDraft as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual(
      expect.objectContaining({ sourceId: CANONICAL_DRAFT_ID, trackId: 'track-video', medium: 'video' }),
    );
  });

  // ── Revision path ────────────────────────────────────────────────────────────

  it('uses buildReproduceMessage with the prior draft body when review_feedback present', async () => {
    const PREVIOUS_BODY = { body: '<p>previous draft body</p>' };
    const reviewFeedback = {
      blog_review: {
        verdict: 'revision_required',
        score: 65,
        issues: { critical: ['hook is weak'], minor: [] },
      },
    };
    stageRunRow = {
      ...stageRunRow,
      input_json: { productionParams: { review_feedback: reviewFeedback } },
    };
    // The per-track draft being revised already carries the prior body + a
    // prior iteration count — the reproduce call must receive both, and the
    // outcome must increment the iteration.
    forkedDraftRow = { ...forkedDraftRow, draft_json: PREVIOUS_BODY, iteration_count: 1 };

    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');

    await (pipelineProductionDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'production', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    // Reproduce path uses buildReproduceMessage, fed the prior body (not a blank copy).
    expect(buildReproduceMessageMock).toHaveBeenCalledTimes(1);
    expect(buildProduceMessageMock).not.toHaveBeenCalled();
    const reproduceArg = (buildReproduceMessageMock.mock.calls[0] as unknown[])[0];
    expect(reproduceArg).toEqual(expect.objectContaining({ previousDraft: PREVIOUS_BODY }));

    // Stage Run completed with outcome.revision=true and incremented iterationCount.
    const stageUpdates = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
    const completedRow = stageUpdates.find((r) => r.status === 'completed');
    expect(completedRow).toBeDefined();
    expect(completedRow.outcome_json).toEqual(
      expect.objectContaining({ revision: true, iterationCount: 2 }),
    );
  });

  // ── deriveDraft failure ──────────────────────────────────────────────────────

  it('marks Stage Run failed when deriveDraft throws', async () => {
    const { deriveDraft } = await import('../../lib/content-drafts/derive.js');
    const { ApiError } = await import('../../lib/api/errors.js');
    (deriveDraft as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError(404, 'Source draft not found', 'NOT_FOUND'),
    );

    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');
    const { inngest } = await import('../client.js');

    await (pipelineProductionDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'production', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    expect(inngest.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'production/produce' }),
    );
    const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
    const failedRow = updateRows.find((r) => r.status === 'failed');
    expect(failedRow).toBeDefined();
    expect(failedRow.error_message).toContain('NOT_FOUND');
  });

  // ── Error branches ───────────────────────────────────────────────────────────

  it('on provider quota exhaustion: marks awaiting_user(provider_quota_exhausted), no rethrow', async () => {
    const quotaErr = new Error('429 quota exhausted');
    generateWithFallbackMock.mockRejectedValueOnce(quotaErr);
    isQuotaExhaustedMock.mockReturnValueOnce(true);

    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');

    await expect(
      (pipelineProductionDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'production', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      }),
    ).resolves.not.toThrow();

    const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
    const awaitingRow = updateRows.find((r) => r.status === 'awaiting_user');
    expect(awaitingRow).toBeDefined();
    expect(awaitingRow.awaiting_reason).toBe('provider_quota_exhausted');
    expect(updateRows.find((r) => r.status === 'failed')).toBeUndefined();
  });

  it('on JobAborted: marks stage_run aborted, no rethrow', async () => {
    const { JobAborted } = await import('../../lib/ai/abortable.js');
    generateWithFallbackMock.mockRejectedValueOnce(
      new (JobAborted as unknown as new (_p?: string) => Error)('proj'),
    );

    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');

    await expect(
      (pipelineProductionDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'production', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      }),
    ).resolves.not.toThrow();

    const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
    const abortedRow = updateRows.find((r) => r.status === 'aborted');
    expect(abortedRow).toBeDefined();
    expect(updateRows.find((r) => r.status === 'failed')).toBeUndefined();
  });

  it('on generic AI error: marks stage_run failed and rethrows', async () => {
    generateWithFallbackMock.mockRejectedValueOnce(new Error('unexpected AI failure'));

    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');

    await expect(
      (pipelineProductionDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'production', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      }),
    ).rejects.toThrow(/unexpected AI failure/);

    const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
    const failedRow = updateRows.find((r) => r.status === 'failed');
    expect(failedRow).toBeDefined();
    expect(failedRow.error_message).toContain('unexpected AI failure');
  });

  it('does NOT emit production/produce in any success path', async () => {
    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');
    const { inngest } = await import('../client.js');

    await (pipelineProductionDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'production', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    const allSentNames = (inngest.send as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[0] as { name: string }).name,
    );
    expect(allSentNames).not.toContain('production/produce');
  });
});
