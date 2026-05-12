/**
 * Slice 10 (#18) — pipeline-publish-dispatch (Publish Stage).
 *
 * Calls the internal POST /wordpress/publish-draft endpoint via fetch,
 * mirrors `published_url` into the Stage Run's payload_ref, and writes
 * completed/failed. Only runs when status='queued' (the Continue
 * endpoint flips awaiting_user → queued).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const inngestSendMock = vi.fn(async () => ({ ids: ['evt-1'] }));
vi.mock('../client.js', () => ({
  inngest: {
    createFunction: (_config: unknown, handler: unknown) => handler,
    send: inngestSendMock,
  },
}));

const STAGE_RUN_ID = 'sr-publish';
const PROJECT_ID = 'proj-xyz';
const DRAFT_ID = 'cd-1';

let stageRunRow: Record<string, unknown> | null;
let priorDraftStageRun: Record<string, unknown> | null;
let draftRow: Record<string, unknown> | null;
let stageRunsUpdateMock: ReturnType<typeof vi.fn>;

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'stage_runs') {
        return {
          select: (cols: string) => ({
            eq: () => {
              if (cols.includes('payload_ref')) {
                return {
                  eq: () => ({
                    order: () => ({
                      limit: () => ({
                        maybeSingle: () => Promise.resolve({ data: priorDraftStageRun, error: null }),
                      }),
                    }),
                  }),
                };
              }
              return { maybeSingle: () => Promise.resolve({ data: stageRunRow, error: null }) };
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
        };
      }
      return {};
    },
  }),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('pipeline-publish-dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();

    process.env.INTERNAL_API_KEY = 'test-internal-key';
    process.env.API_URL = 'http://api.test';

    stageRunsUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    stageRunRow = {
      id: STAGE_RUN_ID,
      project_id: PROJECT_ID,
      stage: 'publish',
      status: 'queued',
      input_json: {},
    };
    priorDraftStageRun = {
      id: 'sr-draft',
      stage: 'draft',
      status: 'completed',
      payload_ref: { kind: 'content_draft', id: DRAFT_ID },
    };
    draftRow = { id: DRAFT_ID, user_id: 'user-1' };
  });

  it('returns early when event stage is not publish', async () => {
    const { pipelinePublishDispatch } = await import('../pipeline-publish-dispatch.js');

    await (pipelinePublishDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'preview', projectId: PROJECT_ID } },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stageRunsUpdateMock).not.toHaveBeenCalled();
  });

  it('skips when stage_run is still awaiting_user (Continue not clicked yet)', async () => {
    stageRunRow = { ...stageRunRow!, status: 'awaiting_user' };

    const { pipelinePublishDispatch } = await import('../pipeline-publish-dispatch.js');

    await (pipelinePublishDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'publish', projectId: PROJECT_ID } },
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('on WP publish success: marks stage_run completed with published_url in payload_ref', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { published_url: 'https://example.com/post-123', wp_post_id: 123 },
        error: null,
      }),
    });

    const { pipelinePublishDispatch } = await import('../pipeline-publish-dispatch.js');

    await (pipelinePublishDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'publish', projectId: PROJECT_ID } },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/wordpress/publish-draft',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-internal-key': 'test-internal-key', 'x-user-id': 'user-1' }),
      }),
    );

    const completedRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'completed');
    expect(completedRow).toBeDefined();
    expect(completedRow.payload_ref).toEqual({
      kind: 'publish_record',
      id: '123',
      published_url: 'https://example.com/post-123',
    });

    const finishedCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
      (c) => (c[0] as { name: string }).name === 'pipeline/stage.run.finished',
    );
    expect(finishedCall).toBeDefined();
  });

  it('on WP publish failure: marks stage_run failed with the WP error message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ data: null, error: { message: 'WP host unreachable', code: 'UPSTREAM_ERROR' } }),
    });

    const { pipelinePublishDispatch } = await import('../pipeline-publish-dispatch.js');

    await expect(
      (pipelinePublishDispatch as unknown as (args: {
        event: { data: { stageRunId: string; stage: string; projectId: string } };
      }) => Promise<void>)({
        event: { data: { stageRunId: STAGE_RUN_ID, stage: 'publish', projectId: PROJECT_ID } },
      }),
    ).rejects.toThrow(/WP host unreachable/);

    const failedRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'failed');
    expect(failedRow).toBeDefined();
    expect(failedRow.error_message).toContain('WP host unreachable');
  });
});
