/**
 * Slice 9 (#17) — pipeline-assets-dispatch.
 *
 * Runs agent-5-assets, writes asset_briefs into the prior content_draft's
 * draft_json, transitions stage_runs queued → running → completed.
 * manual_upload mode parks the Stage Run as awaiting_user(manual_paste).
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

vi.mock('../../lib/ai/prompts/assets.js', () => ({
  buildAssetsMessage: vi.fn(() => 'assets message'),
}));

const STAGE_RUN_ID = 'sr-assets';
const PROJECT_ID = 'proj-xyz';
const DRAFT_ID = 'cd-1';

// Inngest's `step.run(id, fn)` is exercised inside the dispatcher to gate the
// LLM call. The tests don't replay across step boundaries, so a passthrough
// implementation is sufficient here.
const STEP_MOCK = { run: <T>(_id: string, fn: () => Promise<T>) => fn() };

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

describe('pipeline-assets-dispatch', () => {
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
      stage: 'assets',
      status: 'queued',
      input_json: { mode: 'briefs_only' },
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
      draft_json: { sections: [{ slot: 'hero', section_title: 'Intro', key_points: ['a'] }] },
      model_tier: 'standard',
      channel_id: 'chan-1',
      user_id: 'user-1',
      org_id: 'org-1',
    };

    generateWithFallbackMock.mockResolvedValue({
      result: { visual_direction: 'cinematic', slots: [{ slot: 'hero', prompt: '...' }] },
      providerName: 'mock',
      model: 'mock',
      usage: {},
    });
  });

  it('returns early when event stage is not assets', async () => {
    const { pipelineAssetsDispatch } = await import('../pipeline-assets-dispatch.js');

    await (pipelineAssetsDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'draft', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    expect(generateWithFallbackMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it('briefs_only: runs agent, writes asset_briefs into draft_json, marks stage_run completed', async () => {
    const { pipelineAssetsDispatch } = await import('../pipeline-assets-dispatch.js');

    await (pipelineAssetsDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'assets', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    const draftUpdate = contentDraftsUpdateMock.mock.calls[0][0];
    expect(draftUpdate.draft_json.asset_briefs).toBeDefined();
    expect(draftUpdate.draft_json.asset_briefs.visual_direction).toBe('cinematic');

    const completedRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'completed');
    expect(completedRow).toBeDefined();
    expect(completedRow.payload_ref).toEqual({ kind: 'content_draft', id: DRAFT_ID });

    const finishedCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
      (c) => (c[0] as { name: string }).name === 'pipeline/stage.run.finished',
    );
    expect(finishedCall).toBeDefined();
  });

  it('manual_upload: parks Stage Run in awaiting_user(manual_paste) and skips the agent call', async () => {
    stageRunRow = { ...stageRunRow, input_json: { mode: 'manual_upload' } };

    const { pipelineAssetsDispatch } = await import('../pipeline-assets-dispatch.js');

    await (pipelineAssetsDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'assets', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    expect(generateWithFallbackMock).not.toHaveBeenCalled();
    const awaitingRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'awaiting_user');
    expect(awaitingRow).toBeDefined();
    expect(awaitingRow.awaiting_reason).toBe('manual_paste');
  });

  it('AI failure: marks stage_run failed and emits finished', async () => {
    generateWithFallbackMock.mockRejectedValueOnce(new Error('assets agent down'));

    const { pipelineAssetsDispatch } = await import('../pipeline-assets-dispatch.js');

    await expect(
      (pipelineAssetsDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'assets', projectId: PROJECT_ID } },
        step: STEP_MOCK,
      }),
    ).rejects.toThrow(/assets agent down/);

    const failedRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'failed');
    expect(failedRow).toBeDefined();
  });

  it('marks stage_run failed when there is no prior draft Stage Run', async () => {
    priorDraftStageRun = null;

    const { pipelineAssetsDispatch } = await import('../pipeline-assets-dispatch.js');

    await (pipelineAssetsDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'assets', projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });

    const failedRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'failed');
    expect(failedRow).toBeDefined();
    expect(generateWithFallbackMock).not.toHaveBeenCalled();
  });
});
