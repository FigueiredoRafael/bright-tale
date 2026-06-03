/**
 * BRI-101 / D66 — pipeline-draft-dispatch native worker.
 *
 * Dispatcher + worker merged inline (mirrors pipeline-review-dispatch).
 * No `production/generate` or `production/produce` events are emitted.
 * Lifecycle driven exclusively through stage-run-writer helpers.
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
  resolveProviderOverride: vi.fn(() => ({ provider: 'openai', model: 'gpt-4o' })),
}));

vi.mock('../../lib/ai/prompts/production.js', () => ({
  buildCanonicalCoreMessage: vi.fn(() => 'canonical-core user message'),
  buildProduceMessage: vi.fn(() => 'produce user message'),
  buildReproduceMessage: vi.fn(() => 'reproduce user message'),
}));

vi.mock('../../lib/ai/loadIdeaContext.js', () => ({
  loadIdeaContext: vi.fn(async () => null),
}));

vi.mock('../../lib/ai/loadPriorReviewAttempts.js', () => ({
  loadPriorReviewAttempts: vi.fn(async () => []),
}));

vi.mock('../../lib/ai/tools/index.js', () => ({
  resolveTools: vi.fn(() => []),
  buildToolExecutor: vi.fn(),
}));

vi.mock('../../lib/ai/usage-log.js', () => ({
  logUsage: vi.fn(async () => undefined),
}));

vi.mock('../emitter.js', () => ({
  emitJobEvent: vi.fn(async () => undefined),
}));

vi.mock('../../lib/platform-settings.js', () => ({
  loadPlatformSettings: vi.fn(async () => ({
    costCanonicalCore: 0,
    costBlogDraft: 0,
    costVideoDraft: 0,
    costShortsDraft: 0,
    costPodcastDraft: 0,
  })),
}));

vi.mock('../../lib/ai/abortable.js', () => ({
  JobAborted: class JobAborted extends Error {
    noRetry = true;
    constructor(projectId: string) {
      super(`Job aborted for project ${projectId}`);
      this.name = 'JobAborted';
    }
  },
  assertNotAborted: vi.fn(async () => undefined),
}));

vi.mock('../../lib/pipeline/idea-resolution.js', () => ({
  resolveIdeaArchiveFromBrainstorm: vi.fn(async () => ({
    ideaArchiveId: 'idea-arch-1',
    topic: 'Test Topic',
  })),
}));

vi.mock('../utils/with-reservation.js', () => ({
  withReservation: vi.fn(async (_a: unknown, _b: unknown, _c: unknown, _d: unknown, _e: unknown, _f: unknown, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../../lib/calculate-draft-cost.js', () => ({
  calculateDraftCost: vi.fn(() => 0),
}));

const STAGE_RUN_ID = 'sr-draft';
const PROJECT_ID = 'proj-xyz';
const DRAFT_ID = 'cd-1';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const CHANNEL_ID = 'chan-1';
const RESEARCH_SESSION_ID = 'rs-prior';
const BRAINSTORM_PICK_ID = 'bd-pick';

const STEP_MOCK = { run: <T>(_id: string, fn: () => Promise<T>) => fn() };
type HandlerArgs = {
  event: { data: { stageRunId: string; stage: string; projectId: string } };
  step: typeof STEP_MOCK;
};

let stageRunRow: Record<string, unknown>;
let projectRow: Record<string, unknown>;
let channelRow: Record<string, unknown> | null;
let priorResearchStageRun: Record<string, unknown> | null;
let priorBrainstormStageRun: Record<string, unknown> | null;
let priorContentDraft: Record<string, unknown> | null;
let existingDraftRow: Record<string, unknown> | null;

let stageRunsUpdateMock: ReturnType<typeof vi.fn>;
let contentDraftsInsertMock: ReturnType<typeof vi.fn>;
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
                eq: (_col2: string, val2: unknown) => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () =>
                        Promise.resolve({
                          data:
                            val2 === 'research'
                              ? priorResearchStageRun
                              : priorBrainstormStageRun,
                          error: null,
                        }),
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
      if (table === 'content_drafts') {
        return {
          select: (cols: string) => ({
            eq: (_col: string, _val: unknown) => {
              if (cols === '*') {
                return {
                  maybeSingle: () =>
                    Promise.resolve({ data: existingDraftRow, error: null }),
                };
              }
              // Latest draft for revision path (select('id').eq('project_id'))
              return {
                order: () => ({
                  limit: () => ({
                    maybeSingle: () =>
                      Promise.resolve({ data: priorContentDraft, error: null }),
                  }),
                }),
              };
            },
          }),
          insert: contentDraftsInsertMock,
          update: contentDraftsUpdateMock,
        };
      }
      if (table === 'research_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { approved_cards_json: null, cards_json: null },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'brainstorm_drafts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id: BRAINSTORM_PICK_ID,
                    title: 't',
                    session_id: 'bs-sess',
                    channel_id: CHANNEL_ID,
                    user_id: USER_ID,
                    org_id: ORG_ID,
                    core_tension: '',
                    target_audience: '',
                    verdict: 'experimental',
                    discovery_data: '',
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'idea_archives') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
            count: 0,
          }),
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { id: 'idea-arch-1' }, error: null }),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

describe('pipeline-draft-dispatch (native worker)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Chainable update mock — supports .eq() chaining and thenable resolution.
    function makeUpdateChain() {
      const chain: Record<string, unknown> & PromiseLike<{ data: unknown; error: null }> = {
        then(onResolve: (val: { data: unknown; error: null }) => unknown) {
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

    contentDraftsInsertMock = vi.fn().mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: DRAFT_ID }, error: null }),
      }),
    });

    stageRunRow = {
      id: STAGE_RUN_ID,
      project_id: PROJECT_ID,
      stage: 'draft',
      status: 'queued',
      track_id: null,
      input_json: { type: 'blog' },
    };
    projectRow = { id: PROJECT_ID, channel_id: CHANNEL_ID, org_id: ORG_ID };
    channelRow = { user_id: USER_ID, org_id: ORG_ID };
    priorResearchStageRun = {
      id: 'sr-rs',
      stage: 'research',
      status: 'completed',
      payload_ref: { kind: 'research_session', id: RESEARCH_SESSION_ID },
    };
    priorBrainstormStageRun = {
      id: 'sr-bs',
      stage: 'brainstorm',
      status: 'completed',
      payload_ref: { kind: 'brainstorm_draft', id: BRAINSTORM_PICK_ID },
    };
    priorContentDraft = { id: DRAFT_ID };
    existingDraftRow = {
      id: DRAFT_ID,
      type: 'blog',
      title: 'My blog',
      draft_json: null,
      canonical_core_json: null,
      iteration_count: 0,
      model_tier: 'standard',
      channel_id: CHANNEL_ID,
      user_id: USER_ID,
      org_id: ORG_ID,
      research_session_id: RESEARCH_SESSION_ID,
      idea_id: 'idea-arch-1',
    };

    // Default: canonical-core then produce returns success results
    generateWithFallbackMock
      .mockResolvedValueOnce({
        result: { title: 'My Blog', outline: [] },
        providerName: 'openai',
        model: 'gpt-4o',
        usage: {},
      })
      .mockResolvedValueOnce({
        result: { body: 'Full blog post content here.' },
        providerName: 'openai',
        model: 'gpt-4o',
        usage: {},
      });
  });

  it('returns early when event stage is not draft', async () => {
    const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

    await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'research', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    expect(generateWithFallbackMock).not.toHaveBeenCalled();
    expect(contentDraftsInsertMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it('returns early when stage_run is not queued or running', async () => {
    stageRunRow = { ...stageRunRow, status: 'completed' };
    const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

    await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    expect(generateWithFallbackMock).not.toHaveBeenCalled();
    expect(contentDraftsInsertMock).not.toHaveBeenCalled();
  });

  describe('normal path (first draft, no review feedback)', () => {
    it('inserts content_drafts row with correct fields', async () => {
      const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

      await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      });

      expect(contentDraftsInsertMock).toHaveBeenCalledTimes(1);
      const insertRow = contentDraftsInsertMock.mock.calls[0][0];
      expect(insertRow.project_id).toBe(PROJECT_ID);
      expect(insertRow.org_id).toBe(ORG_ID);
      expect(insertRow.user_id).toBe(USER_ID);
      expect(insertRow.type).toBe('blog');
      expect(insertRow.research_session_id).toBe(RESEARCH_SESSION_ID);
    });

    it('transitions stage_run to running (status + started_at) before completing', async () => {
      const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

      await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      });

      const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
      const runningIdx = updateRows.findIndex((r) => r.status === 'running');
      const completedIdx = updateRows.findIndex((r) => r.status === 'completed');
      expect(runningIdx).toBeGreaterThanOrEqual(0);
      // markRunning stamps started_at (writer contract) — proves a real
      // transition rather than a vacuous status write.
      expect(typeof updateRows[runningIdx].started_at).toBe('string');
      // running must precede completed.
      expect(completedIdx).toBeGreaterThan(runningIdx);
    });

    it('runs canonical-core AI call inline (generateWithFallback called for core)', async () => {
      const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

      await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      });

      expect(generateWithFallbackMock).toHaveBeenCalled();
    });

    it('saves canonical_core_json to content_drafts after core AI call', async () => {
      const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

      await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      });

      const draftUpdates = contentDraftsUpdateMock.mock.calls.map((c) => c[0]);
      const coreUpdate = draftUpdates.find(
        (r) => 'canonical_core_json' in r && !('draft_json' in r),
      );
      expect(coreUpdate).toBeDefined();
    });

    it('runs produce AI call inline and saves draft_json to content_drafts', async () => {
      const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

      await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      });

      // Two generateWithFallback calls: core + produce
      expect(generateWithFallbackMock).toHaveBeenCalledTimes(2);

      const draftUpdates = contentDraftsUpdateMock.mock.calls.map((c) => c[0]);
      const produceUpdate = draftUpdates.find((r) => 'draft_json' in r);
      expect(produceUpdate).toBeDefined();
    });

    it('calls markCompleted with payloadRef { kind: "content_draft", id } and outcome { revision: false }', async () => {
      const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

      await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      });

      const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
      const completedRow = updateRows.find((r) => r.status === 'completed');
      expect(completedRow).toBeDefined();
      expect(completedRow.payload_ref).toEqual({ kind: 'content_draft', id: DRAFT_ID });
      expect(completedRow.outcome_json).toMatchObject({ revision: false });
    });

    it('emits pipeline/stage.run.finished after markCompleted', async () => {
      const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

      await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      });

      const finishedCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
        (c) => (c[0] as { name: string }).name === 'pipeline/stage.run.finished',
      );
      expect(finishedCall).toBeDefined();
    });

    it('NEVER emits production/generate or production/produce events', async () => {
      const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

      await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      });

      const allEventNames = (inngestSendMock.mock.calls as unknown as unknown[][]).map(
        (c) => (c[0] as { name: string }).name,
      );
      expect(allEventNames).not.toContain('production/generate');
      expect(allEventNames).not.toContain('production/produce');
    });
  });

  describe('revision path (review feedback present)', () => {
    beforeEach(() => {
      stageRunRow = {
        ...stageRunRow,
        input_json: {
          type: 'blog',
          productionParams: {
            review_feedback: { overall_verdict: 'revision_required', score: 65 },
          },
        },
      };
      existingDraftRow = {
        ...existingDraftRow,
        iteration_count: 1,
        draft_json: { body: 'previous draft body' },
        canonical_core_json: { outline: [] },
      };
      // Revision only needs one AI call (reproduce)
      generateWithFallbackMock.mockReset();
      generateWithFallbackMock.mockResolvedValueOnce({
        result: { body: 'Revised blog post content.' },
        providerName: 'openai',
        model: 'gpt-4o',
        usage: {},
      });
    });

    it('does NOT insert a new content_drafts row', async () => {
      const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

      await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      });

      expect(contentDraftsInsertMock).not.toHaveBeenCalled();
    });

    it('runs reproduce AI call inline (not two separate core + produce calls)', async () => {
      const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

      await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      });

      expect(generateWithFallbackMock).toHaveBeenCalledTimes(1);
    });

    it('calls markCompleted with outcome { revision: true, iterationCount: 2 }', async () => {
      const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

      await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      });

      const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
      const completedRow = updateRows.find((r) => r.status === 'completed');
      expect(completedRow).toBeDefined();
      expect(completedRow.payload_ref).toEqual({ kind: 'content_draft', id: DRAFT_ID });
      expect(completedRow.outcome_json).toMatchObject({ revision: true });
      // existingDraftRow.iteration_count = 1 → worker computes +1 = 2.
      expect(completedRow.outcome_json.iterationCount).toBe(2);
    });

    it('NEVER emits production/generate or production/produce events', async () => {
      const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

      await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      });

      const allEventNames = (inngestSendMock.mock.calls as unknown as unknown[][]).map(
        (c) => (c[0] as { name: string }).name,
      );
      expect(allEventNames).not.toContain('production/generate');
      expect(allEventNames).not.toContain('production/produce');
    });

    it('marks stage_run failed when there is no prior content_draft to revise', async () => {
      priorContentDraft = null;
      const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

      await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      });

      const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
      const failedRow = updateRows.find((r) => r.status === 'failed');
      expect(failedRow).toBeDefined();
      expect(generateWithFallbackMock).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('on provider quota exhausted: markAwaitingUser({ awaitingReason: "provider_quota_exhausted" }), no rethrow', async () => {
      const quotaErr = new Error('429 quota exceeded');
      generateWithFallbackMock.mockReset();
      generateWithFallbackMock.mockRejectedValueOnce(quotaErr);
      isQuotaExhaustedMock.mockReturnValueOnce(true);

      const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

      await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      });

      const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
      const awaitingRow = updateRows.find((r) => r.status === 'awaiting_user');
      expect(awaitingRow).toBeDefined();
      expect(awaitingRow.awaiting_reason).toBe('provider_quota_exhausted');

      const failedRow = updateRows.find((r) => r.status === 'failed');
      expect(failedRow).toBeUndefined();
    });

    it('on generic AI error: markFailed with error message, rethrows', async () => {
      generateWithFallbackMock.mockReset();
      generateWithFallbackMock.mockRejectedValueOnce(new Error('upstream timeout'));

      const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

      await expect(
        (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
          event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
          step: STEP_MOCK,
        }),
      ).rejects.toThrow(/upstream timeout/);

      const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
      const failedRow = updateRows.find((r) => r.status === 'failed');
      expect(failedRow).toBeDefined();
      expect(failedRow.error_message).toContain('upstream timeout');
    });

    it('on JobAborted: markAborted (no markFailed), no rethrow', async () => {
      const { JobAborted } = await import('../../lib/ai/abortable.js');
      generateWithFallbackMock.mockReset();
      generateWithFallbackMock.mockRejectedValueOnce(new JobAborted(PROJECT_ID));

      const { pipelineDraftDispatch } = await import('../pipeline-draft-dispatch.js');

      await (pipelineDraftDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      });

      const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
      const abortedRow = updateRows.find((r) => r.status === 'aborted');
      expect(abortedRow).toBeDefined();

      const failedRow = updateRows.find((r) => r.status === 'failed');
      expect(failedRow).toBeUndefined();
    });
  });
});
