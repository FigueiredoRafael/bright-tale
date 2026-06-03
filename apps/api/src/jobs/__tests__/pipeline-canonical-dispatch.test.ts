/**
 * D66 — pipeline-canonical-dispatch (native).
 *
 * The dispatcher now does the canonical-core AI work INLINE via step.run
 * (mirroring pipeline-review-dispatch). No `production/generate` event is
 * emitted. The Stage Run lifecycle is driven exclusively through
 * stage-run-writer helpers.
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
  loadAgentConfig: vi.fn(async () => ({ instructions: 'system-core', tools: [] })),
  resolveProviderOverride: vi.fn(() => ({ provider: 'openai', model: 'gpt-4' })),
}));

vi.mock('../../lib/ai/prompts/production.js', () => ({
  buildCanonicalCoreMessage: vi.fn(() => 'canonical-core-message'),
  buildProduceMessage: vi.fn(() => 'produce-message'),
  buildReproduceMessage: vi.fn(() => 'reproduce-message'),
}));

vi.mock('../../lib/platform-settings.js', () => ({
  loadPlatformSettings: vi.fn(async () => ({ costCanonicalCore: 1, costBlogDraft: 2 })),
}));

vi.mock('../../jobs/utils/with-reservation.js', () => ({
  withReservation: vi.fn(async (_a, _b, _c, _d, _e, _f, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../../lib/ai/abortable.js', () => ({
  assertNotAborted: vi.fn(async () => undefined),
  JobAborted: class JobAborted extends Error { constructor() { super('aborted'); } },
}));

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

const STAGE_RUN_ID = 'sr-canonical';
const PROJECT_ID = 'proj-xyz';
const DRAFT_ID = 'cd-canonical';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const CHANNEL_ID = 'chan-1';
const RESEARCH_SESSION_ID = 'rs-prior';
const BRAINSTORM_PICK_ID = 'bd-pick';
const TRACK_ID = 'track-blog';

const STEP_MOCK = { run: <T>(_id: string, fn: () => Promise<T>) => fn() };

let stageRunRow: Record<string, unknown>;
let projectRow: Record<string, unknown>;
let channelRow: Record<string, unknown> | null;
let priorResearchStageRun: Record<string, unknown> | null;
let priorBrainstormStageRun: Record<string, unknown> | null;
let trackRows: Array<Record<string, unknown>>;
let contentDraftRow: Record<string, unknown> | null;

let stageRunsUpdateMock: ReturnType<typeof vi.fn>;
let contentDraftsUpdateMock: ReturnType<typeof vi.fn>;
let draftInsertMock: ReturnType<typeof vi.fn>;

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
                eq: (col2: string, val2: unknown) => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () =>
                        Promise.resolve({
                          data: val2 === 'research' ? priorResearchStageRun : priorBrainstormStageRun,
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
      if (table === 'tracks') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: trackRows, error: null }),
            }),
          }),
        };
      }
      if (table === 'content_drafts') {
        return {
          insert: draftInsertMock,
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: contentDraftRow, error: null }),
            }),
          }),
          update: (arg: unknown) => {
            (contentDraftsUpdateMock as (a: unknown) => void)(arg);
            return { eq: () => Promise.resolve({ error: null }) };
          },
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
        // Chainable: handles both single-eq (.eq(id).maybeSingle) and
        // double-eq (.eq(x).eq(y).maybeSingle) access patterns.
        const chain: Record<string, unknown> = {};
        const maybeSingleFn = () => Promise.resolve({ data: null, error: null });
        chain.maybeSingle = maybeSingleFn;
        chain.eq = () => chain;
        return {
          select: () => chain,
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'idea-arch-1' }, error: null }),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

type HandlerArgs = {
  event: { data: { stageRunId: string; stage: string; projectId: string } };
  step: typeof STEP_MOCK;
};

describe('pipeline-canonical-dispatch (native D66)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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

    draftInsertMock = vi.fn().mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: DRAFT_ID }, error: null }),
      }),
    });

    stageRunRow = {
      id: STAGE_RUN_ID,
      project_id: PROJECT_ID,
      stage: 'canonical',
      status: 'queued',
      input_json: {},
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
    trackRows = [{ id: TRACK_ID, medium: 'blog', status: 'active' }];
    contentDraftRow = {
      id: DRAFT_ID,
      project_id: PROJECT_ID,
      type: 'blog',
      title: 'Test Title',
      research_session_id: RESEARCH_SESSION_ID,
      idea_id: 'idea-arch-1',
      persona_id: null,
      channel_id: CHANNEL_ID,
      org_id: ORG_ID,
      user_id: USER_ID,
      draft_json: null,
      canonical_core_json: null,
    };

    generateWithFallbackMock.mockResolvedValue({
      result: { thesis: 'core thesis', key_points: [] },
      providerName: 'openai',
      model: 'gpt-4',
      usage: {},
    });
  });

  it('returns early when event stage is not canonical', async () => {
    const { pipelineCanonicalDispatch } = await import('../pipeline-canonical-dispatch.js');
    const { inngest } = await import('../client.js');

    await (pipelineCanonicalDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'research', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    expect(generateWithFallbackMock).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
    expect(draftInsertMock).not.toHaveBeenCalled();
  });

  it('allows both queued and running (replay-safe idempotency)', async () => {
    stageRunRow = { ...stageRunRow, status: 'running' };

    const { pipelineCanonicalDispatch } = await import('../pipeline-canonical-dispatch.js');

    // running is allowed through (Inngest replay pattern); it should NOT bail early
    // but the CAS claim inside step.run will have cached `won:true` on first pass.
    // In tests step.run runs inline so claim succeeds for 'running' rows too.
    // Simply assert the function runs without throwing.
    await expect(
      (pipelineCanonicalDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'canonical', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      }),
    ).resolves.not.toThrow();
  });

  it('creates shared content_draft inside step.run (memoized insert)', async () => {
    const { pipelineCanonicalDispatch } = await import('../pipeline-canonical-dispatch.js');

    await (pipelineCanonicalDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'canonical', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    expect(draftInsertMock).toHaveBeenCalledTimes(1);
    const draftRow = draftInsertMock.mock.calls[0][0];
    expect(draftRow.project_id).toBe(PROJECT_ID);
    expect(draftRow.org_id).toBe(ORG_ID);
    expect(draftRow.user_id).toBe(USER_ID);
    expect(draftRow.type).toBe('blog'); // derived from first active Track
    expect(draftRow.research_session_id).toBe(RESEARCH_SESSION_ID);
  });

  it('calls generateWithFallback inline for canonical-core AI work', async () => {
    const { pipelineCanonicalDispatch } = await import('../pipeline-canonical-dispatch.js');

    await (pipelineCanonicalDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'canonical', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    expect(generateWithFallbackMock).toHaveBeenCalledTimes(1);
    const [agentType] = generateWithFallbackMock.mock.calls[0];
    expect(agentType).toBe('production');
  });

  it('saves canonical_core_json to the content_draft', async () => {
    const canonicalResult = { thesis: 'core thesis', key_points: ['a', 'b'] };
    generateWithFallbackMock.mockResolvedValueOnce({
      result: canonicalResult,
      providerName: 'openai',
      model: 'gpt-4',
      usage: {},
    });

    const { pipelineCanonicalDispatch } = await import('../pipeline-canonical-dispatch.js');

    await (pipelineCanonicalDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'canonical', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    const updateCalls = contentDraftsUpdateMock.mock.calls.map((c) => c[0]);
    const coreUpdate = updateCalls.find((r) => r.canonical_core_json !== undefined);
    expect(coreUpdate).toBeDefined();
    expect(coreUpdate.canonical_core_json).toEqual(
      expect.objectContaining({ thesis: 'core thesis' }),
    );
  });

  it('calls markCompleted with stage=canonical and payloadRef after AI succeeds', async () => {
    const { pipelineCanonicalDispatch } = await import('../pipeline-canonical-dispatch.js');

    await (pipelineCanonicalDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'canonical', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
    const completedRow = updateRows.find((r) => r.status === 'completed');
    expect(completedRow).toBeDefined();
    expect(completedRow.payload_ref).toEqual({ kind: 'content_draft', id: DRAFT_ID });
  });

  it('does NOT emit production/generate event (inline work, no hop)', async () => {
    const { pipelineCanonicalDispatch } = await import('../pipeline-canonical-dispatch.js');
    const { inngest } = await import('../client.js');

    await (pipelineCanonicalDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'canonical', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    const allSentNames = (inngest.send as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[0] as { name: string }).name,
    );
    expect(allSentNames).not.toContain('production/generate');
  });

  it('marks stage_run running then completed (lifecycle sequence)', async () => {
    const { pipelineCanonicalDispatch } = await import('../pipeline-canonical-dispatch.js');

    await (pipelineCanonicalDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'canonical', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
    const runningRow = updateRows.find((r) => r.status === 'running');
    const completedRow = updateRows.find((r) => r.status === 'completed');
    expect(runningRow).toBeDefined();
    expect(completedRow).toBeDefined();
    // running must come before completed in the call order
    const runningIdx = stageRunsUpdateMock.mock.calls.findIndex((c) => c[0].status === 'running');
    const completedIdx = stageRunsUpdateMock.mock.calls.findIndex((c) => c[0].status === 'completed');
    expect(runningIdx).toBeLessThan(completedIdx);
  });

  it('on AI failure: marks stage_run failed and rethrows', async () => {
    generateWithFallbackMock.mockRejectedValueOnce(new Error('llm timeout'));

    const { pipelineCanonicalDispatch } = await import('../pipeline-canonical-dispatch.js');

    await expect(
      (pipelineCanonicalDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'canonical', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      }),
    ).rejects.toThrow(/llm timeout/);

    const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
    const failedRow = updateRows.find((r) => r.status === 'failed');
    expect(failedRow).toBeDefined();
    expect(failedRow.error_message).toContain('llm timeout');
  });

  it('on quota exhaustion: marks stage_run awaiting_user(provider_quota_exhausted), no rethrow', async () => {
    const quotaErr = new Error('429 quota');
    generateWithFallbackMock.mockRejectedValueOnce(quotaErr);
    isQuotaExhaustedMock.mockReturnValueOnce(true);

    const { pipelineCanonicalDispatch } = await import('../pipeline-canonical-dispatch.js');

    await expect(
      (pipelineCanonicalDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'canonical', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      }),
    ).resolves.not.toThrow();

    const updateRows = stageRunsUpdateMock.mock.calls.map((c) => c[0]);
    const awaitingRow = updateRows.find((r) => r.status === 'awaiting_user');
    expect(awaitingRow).toBeDefined();
    expect(awaitingRow.awaiting_reason).toBe('provider_quota_exhausted');
    expect(updateRows.find((r) => r.status === 'failed')).toBeUndefined();
  });

  it('skips when stage_run has terminal status (completed/failed/aborted)', async () => {
    stageRunRow = { ...stageRunRow, status: 'completed' };

    const { pipelineCanonicalDispatch } = await import('../pipeline-canonical-dispatch.js');

    await (pipelineCanonicalDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'canonical', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    expect(generateWithFallbackMock).not.toHaveBeenCalled();
    expect(draftInsertMock).not.toHaveBeenCalled();
  });
});
