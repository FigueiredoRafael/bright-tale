/**
 * pipeline-assets-dispatch (D66 native) — runs agent-5-assets INLINE via
 * step.run, writes asset_briefs into the prior draft's draft_json, and drives
 * the Stage Run lifecycle through the stage-run-writer helpers.
 *
 * Hardening coverage (BRI-103):
 *   - prior-draft lookup prefers the per-track PRODUCTION content_draft and
 *     falls back to the legacy project-scoped 'draft' stage,
 *   - outcome_json carries { mode } on completed + manual_upload park,
 *   - idempotency guard admits 'running' (Inngest replay) and bails on
 *     terminal statuses.
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

vi.mock('../../lib/ai/prompts/assets.js', () => ({
  buildAssetsMessage: vi.fn(() => 'assets message'),
}));

const STAGE_RUN_ID = 'sr-assets';
const PROJECT_ID = 'proj-xyz';
const TRACK_ID = 'track-1';
const DRAFT_ID = 'cd-1';

// Inngest's `step.run(id, fn)` is exercised inside the dispatcher to gate the
// LLM call + DB write. The tests don't replay across step boundaries, so a
// passthrough implementation is sufficient here.
const STEP_MOCK = { run: <T>(_id: string, fn: () => Promise<T>) => fn() };

type HandlerArgs = {
  event: { data: { stageRunId: string; stage: string; projectId: string } };
  step: typeof STEP_MOCK;
};

let stageRunRow: Record<string, unknown> | null;
let priorProductionStageRun: Record<string, unknown> | null;
let priorDraftStageRun: Record<string, unknown> | null;
let draftRow: Record<string, unknown> | null;
let stageRunsUpdateMock: ReturnType<typeof vi.fn>;
let contentDraftsUpdateMock: ReturnType<typeof vi.fn>;

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'stage_runs') {
        // Query recorder: capture the select columns + eq filters, then resolve
        // based on which stage is being looked up.
        const filters: Record<string, unknown> = {};
        let cols = '';
        const q: Record<string, unknown> = {
          select: (c: string) => {
            cols = c;
            return q;
          },
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return q;
          },
          order: () => q,
          limit: () => q,
          maybeSingle: () => {
            if (cols.includes('input_json')) {
              return Promise.resolve({ data: stageRunRow, error: null });
            }
            // Require the track_id scope so deleting `.eq('track_id', …)` in
            // the dispatcher would break this branch.
            if (filters.stage === 'production' && filters.track_id === TRACK_ID) {
              return Promise.resolve({ data: priorProductionStageRun, error: null });
            }
            if (filters.stage === 'draft') {
              return Promise.resolve({ data: priorDraftStageRun, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          update: stageRunsUpdateMock,
        };
        return q;
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

function runDispatch(stage = 'assets') {
  return async () => {
    const { pipelineAssetsDispatch } = await import('../pipeline-assets-dispatch.js');
    return (pipelineAssetsDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage, projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });
  };
}

/** Find the stage_runs update patch whose status matches. */
function updatePatchWithStatus(status: string): Record<string, unknown> | undefined {
  return stageRunsUpdateMock.mock.calls.map((c) => c[0]).find((r) => r.status === status);
}

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
      track_id: TRACK_ID,
      input_json: { mode: 'briefs_only' },
    };
    // Per-track production draft (the post-D66 anchor).
    priorProductionStageRun = {
      id: 'sr-production',
      stage: 'production',
      status: 'completed',
      payload_ref: { kind: 'content_draft', id: DRAFT_ID },
    };
    // Legacy project-scoped draft (fallback only).
    priorDraftStageRun = null;
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
    await runDispatch('draft')();

    expect(generateWithFallbackMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it('briefs_only: anchors to the per-track production draft, writes asset_briefs, marks completed with outcome.mode', async () => {
    await runDispatch()();

    const draftUpdate = contentDraftsUpdateMock.mock.calls[0][0];
    expect(draftUpdate.draft_json.asset_briefs).toBeDefined();
    expect(draftUpdate.draft_json.asset_briefs.visual_direction).toBe('cinematic');

    const completedRow = updatePatchWithStatus('completed');
    expect(completedRow).toBeDefined();
    expect(completedRow?.payload_ref).toEqual({ kind: 'content_draft', id: DRAFT_ID });
    expect(completedRow?.outcome_json).toEqual({ mode: 'briefs_only' });

    const finishedCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
      (c) => (c[0] as { name: string }).name === 'pipeline/stage.run.finished',
    );
    expect(finishedCall).toBeDefined();
  });

  it('auto_generate: carries outcome.mode = auto_generate', async () => {
    stageRunRow = { ...(stageRunRow as object), input_json: { mode: 'auto_generate' } };

    await runDispatch()();

    expect(generateWithFallbackMock).toHaveBeenCalled();
    expect(updatePatchWithStatus('completed')?.outcome_json).toEqual({ mode: 'auto_generate' });
  });

  it('prefers the track-scoped production draft over a legacy draft stage', async () => {
    priorProductionStageRun = {
      id: 'sr-production',
      stage: 'production',
      status: 'completed',
      payload_ref: { kind: 'content_draft', id: 'cd-production' },
    };
    priorDraftStageRun = {
      id: 'sr-draft-legacy',
      stage: 'draft',
      status: 'completed',
      payload_ref: { kind: 'content_draft', id: 'cd-legacy' },
    };

    await runDispatch()();

    // Production wins — the legacy draft must NOT be used.
    expect(updatePatchWithStatus('completed')?.payload_ref).toEqual({
      kind: 'content_draft',
      id: 'cd-production',
    });
  });

  it('falls back to the legacy draft stage when no per-track production draft exists', async () => {
    priorProductionStageRun = null;
    priorDraftStageRun = {
      id: 'sr-draft-legacy',
      stage: 'draft',
      status: 'completed',
      payload_ref: { kind: 'content_draft', id: 'cd-legacy' },
    };

    await runDispatch()();

    expect(generateWithFallbackMock).toHaveBeenCalled();
    expect(updatePatchWithStatus('completed')?.payload_ref).toEqual({
      kind: 'content_draft',
      id: 'cd-legacy',
    });
  });

  it('legacy project (track_id null): skips the per-track production lookup and uses the legacy draft stage', async () => {
    stageRunRow = { ...(stageRunRow as object), track_id: null };
    // A per-track production row exists but MUST NOT be consulted when the
    // stage run has no track_id (the `if (trackId)` guard skips it).
    priorProductionStageRun = {
      id: 'sr-production',
      stage: 'production',
      status: 'completed',
      payload_ref: { kind: 'content_draft', id: 'cd-production' },
    };
    priorDraftStageRun = {
      id: 'sr-draft-legacy',
      stage: 'draft',
      status: 'completed',
      payload_ref: { kind: 'content_draft', id: 'cd-legacy' },
    };

    await runDispatch()();

    expect(generateWithFallbackMock).toHaveBeenCalled();
    expect(updatePatchWithStatus('completed')?.payload_ref).toEqual({
      kind: 'content_draft',
      id: 'cd-legacy',
    });
  });

  it('manual_upload: parks awaiting_user(manual_paste) with outcome.mode, skips the agent', async () => {
    stageRunRow = { ...(stageRunRow as object), input_json: { mode: 'manual_upload' } };

    await runDispatch()();

    expect(generateWithFallbackMock).not.toHaveBeenCalled();
    const awaitingRow = updatePatchWithStatus('awaiting_user');
    expect(awaitingRow).toBeDefined();
    expect(awaitingRow?.awaiting_reason).toBe('manual_paste');
    expect(awaitingRow?.outcome_json).toEqual({ mode: 'manual_upload' });
  });

  it('idempotency: status=running is admitted (Inngest replay) and still completes', async () => {
    stageRunRow = { ...(stageRunRow as object), status: 'running' };

    await runDispatch()();

    expect(generateWithFallbackMock).toHaveBeenCalled();
    expect(updatePatchWithStatus('completed')).toBeDefined();
  });

  it('idempotency: terminal status bails before any work', async () => {
    stageRunRow = { ...(stageRunRow as object), status: 'completed' };

    await runDispatch()();

    expect(generateWithFallbackMock).not.toHaveBeenCalled();
    expect(stageRunsUpdateMock).not.toHaveBeenCalled();
    expect(contentDraftsUpdateMock).not.toHaveBeenCalled();
  });

  it('AI failure: marks stage_run failed and rethrows', async () => {
    generateWithFallbackMock.mockRejectedValueOnce(new Error('assets agent down'));

    await expect(runDispatch()()).rejects.toThrow(/assets agent down/);

    expect(updatePatchWithStatus('failed')).toBeDefined();
  });

  it('quota exhausted: parks awaiting_user(provider_quota_exhausted), does not rethrow', async () => {
    isQuotaExhaustedMock.mockReturnValueOnce(true);
    generateWithFallbackMock.mockRejectedValueOnce(new Error('rate limit / quota'));

    await runDispatch()();

    const awaitingRow = updatePatchWithStatus('awaiting_user');
    expect(awaitingRow).toBeDefined();
    expect(awaitingRow?.awaiting_reason).toBe('provider_quota_exhausted');
    expect(updatePatchWithStatus('failed')).toBeUndefined();
  });

  it('marks stage_run failed when no prior draft can be resolved', async () => {
    priorProductionStageRun = null;
    priorDraftStageRun = null;

    await runDispatch()();

    expect(updatePatchWithStatus('failed')).toBeDefined();
    expect(generateWithFallbackMock).not.toHaveBeenCalled();
  });
});
