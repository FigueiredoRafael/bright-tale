/**
 * Slice 10 (#18) — pipeline-preview-dispatch (Preview Stage).
 *
 * Lightweight checkpoint that verifies the prior draft exists + has
 * draft_json, then marks the Stage Run completed with payload_ref →
 * the content_draft. Triggers advancement to Publish.
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

describe('pipeline-preview-dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stageRunsUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    stageRunRow = { id: STAGE_RUN_ID, project_id: PROJECT_ID, stage: 'preview', status: 'queued' };
    priorDraftStageRun = {
      id: 'sr-draft',
      stage: 'draft',
      status: 'completed',
      payload_ref: { kind: 'content_draft', id: DRAFT_ID },
    };
    draftRow = { id: DRAFT_ID, title: 'X', draft_json: { body: 'hi' }, status: 'approved' };
  });

  it('returns early when event stage is not preview', async () => {
    const { pipelinePreviewDispatch } = await import('../pipeline-preview-dispatch.js');

    await (pipelinePreviewDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'assets', projectId: PROJECT_ID } },
    });

    expect(stageRunsUpdateMock).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it('marks stage_run completed and emits finished when draft is renderable', async () => {
    const { pipelinePreviewDispatch } = await import('../pipeline-preview-dispatch.js');

    await (pipelinePreviewDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'preview', projectId: PROJECT_ID } },
    });

    const completedRow = stageRunsUpdateMock.mock.calls.map((c) => c[0]).find((r) => r.status === 'completed');
    expect(completedRow).toBeDefined();
    expect(completedRow.payload_ref).toEqual({ kind: 'content_draft', id: DRAFT_ID });

    const finishedCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
      (c) => (c[0] as { name: string }).name === 'pipeline/stage.run.finished',
    );
    expect(finishedCall).toBeDefined();
  });

  it('fails the Stage Run when the draft has no draft_json (production was never completed)', async () => {
    draftRow = { id: DRAFT_ID, title: 'X', draft_json: null, status: 'draft' };

    const { pipelinePreviewDispatch } = await import('../pipeline-preview-dispatch.js');

    await (pipelinePreviewDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'preview', projectId: PROJECT_ID } },
    });

    const failedRow = stageRunsUpdateMock.mock.calls.map((c) => c[0]).find((r) => r.status === 'failed');
    expect(failedRow).toBeDefined();
    expect(failedRow.error_message).toContain('draft_json');
  });
});
