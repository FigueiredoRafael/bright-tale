/**
 * pipeline-preview-dispatch (D66 native) — AI-free checkpoint that resolves
 * the prior draft, sanity-checks its draft_json, and drives the Stage Run
 * lifecycle through the stage-run-writer helpers.
 *
 * Hardening coverage (BRI-104 + BRI-24 preview-half):
 *   - prior-draft lookup prefers the per-track PRODUCTION content_draft and
 *     falls back to the legacy project-scoped 'draft' stage,
 *   - idempotency guard admits 'running' (Inngest replay) and bails on
 *     terminal statuses,
 *   - completed carries payload_ref → the content_draft (no outcome_json:
 *     preview has no orchestrator-read contract).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const inngestSendMock = vi.fn(async () => ({ ids: ['evt-1'] }));
vi.mock('../client.js', () => ({
  inngest: {
    createFunction: (_config: unknown, handler: unknown) => handler,
    send: inngestSendMock,
  },
}));

const STAGE_RUN_ID = 'sr-preview';
const PROJECT_ID = 'proj-xyz';
const TRACK_ID = 'track-1';
const DRAFT_ID = 'cd-1';

// Inngest's `step.run(id, fn)` is exercised inside the dispatcher to memoize
// load-draft + mark-running. The tests don't replay across step boundaries,
// so a passthrough implementation is sufficient here.
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
// Records the `stage` of every prior-draft lookup attempted, so a test can
// assert the production branch was skipped when track_id is null.
let stageLookups: string[];

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'stage_runs') {
        // Query recorder: capture the select columns + eq filters, then
        // resolve based on which stage is being looked up. The self-fetch
        // does not select payload_ref; the prior-draft lookups do.
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
            if (!cols.includes('payload_ref')) {
              return Promise.resolve({ data: stageRunRow, error: null });
            }
            stageLookups.push(filters.stage as string);
            // Require the track_id scope so deleting `.eq('track_id', …)` in
            // the dispatcher would break the production branch.
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
        };
      }
      return {};
    },
  }),
}));

function runDispatch(stage = 'preview') {
  return async () => {
    const { pipelinePreviewDispatch } = await import('../pipeline-preview-dispatch.js');
    return (pipelinePreviewDispatch as unknown as (args: HandlerArgs) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage, projectId: PROJECT_ID } },
      step: STEP_MOCK,
    });
  };
}

/** Find the stage_runs update patch whose status matches. */
function updatePatchWithStatus(status: string): Record<string, unknown> | undefined {
  return stageRunsUpdateMock.mock.calls.map((c) => c[0]).find((r) => r.status === status);
}

describe('pipeline-preview-dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stageLookups = [];

    stageRunsUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    stageRunRow = {
      id: STAGE_RUN_ID,
      project_id: PROJECT_ID,
      stage: 'preview',
      status: 'queued',
      track_id: TRACK_ID,
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
    draftRow = { id: DRAFT_ID, title: 'X', draft_json: { body: 'hi' }, status: 'approved' };
  });

  it('returns early when event stage is not preview', async () => {
    await runDispatch('assets')();

    expect(stageRunsUpdateMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it('anchors to the per-track production draft, marks completed with payload_ref, emits finished', async () => {
    await runDispatch()();

    const completedRow = updatePatchWithStatus('completed');
    expect(completedRow).toBeDefined();
    expect(completedRow?.payload_ref).toEqual({ kind: 'content_draft', id: DRAFT_ID });

    const finishedCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
      (c) => (c[0] as { name: string }).name === 'pipeline/stage.run.finished',
    );
    expect(finishedCall).toBeDefined();
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

    // The production lookup must be skipped entirely — only the legacy draft
    // stage is consulted. (Guards the `if (trackId)` negative path.)
    expect(stageLookups).not.toContain('production');
    expect(stageLookups).toContain('draft');
    expect(updatePatchWithStatus('completed')?.payload_ref).toEqual({
      kind: 'content_draft',
      id: 'cd-legacy',
    });
  });

  it('idempotency: status=running is admitted (Inngest replay) and still completes', async () => {
    stageRunRow = { ...(stageRunRow as object), status: 'running' };

    await runDispatch()();

    expect(updatePatchWithStatus('completed')).toBeDefined();
  });

  it('idempotency: terminal status bails before any work', async () => {
    stageRunRow = { ...(stageRunRow as object), status: 'completed' };

    await runDispatch()();

    expect(stageRunsUpdateMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it('fails the Stage Run when the draft has no draft_json (production was never completed)', async () => {
    draftRow = { id: DRAFT_ID, title: 'X', draft_json: null, status: 'draft' };

    await runDispatch()();

    const failedRow = updatePatchWithStatus('failed');
    expect(failedRow).toBeDefined();
    expect(failedRow?.error_message).toContain('draft_json');
  });

  it('fails the Stage Run when the content_draft cannot be found', async () => {
    draftRow = null;

    await runDispatch()();

    expect(updatePatchWithStatus('failed')).toBeDefined();
  });

  it('fails the Stage Run when no prior draft can be resolved', async () => {
    priorProductionStageRun = null;
    priorDraftStageRun = null;

    await runDispatch()();

    expect(updatePatchWithStatus('failed')).toBeDefined();
  });
});
