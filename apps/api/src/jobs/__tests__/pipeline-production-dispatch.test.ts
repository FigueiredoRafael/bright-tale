/**
 * T2.6 — pipeline-production-dispatch.
 *
 * Listens on `pipeline/stage.requested` filtered to stage='production'.
 * Track-scoped: reads the Stage Run's track_id, resolves the Track's
 * medium (wins over input.type on conflict), finds the prior canonical
 * Stage Run's content_draft (project-scoped), reuses it if its `type`
 * matches the Track medium, else forks a new content_draft copying the
 * canonical_core_json. Marks the Stage Run running and emits
 * `production/produce` so the legacy worker writes the body + Stage Run
 * terminal status.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client.js', () => ({
  inngest: {
    createFunction: (_config: unknown, handler: unknown) => handler,
    send: vi.fn(async () => ({ ids: ['evt-1'] })),
  },
}));

const STAGE_RUN_ID = 'sr-production';
const PROJECT_ID = 'proj-xyz';
const TRACK_ID = 'track-blog';
const CANONICAL_DRAFT_ID = 'cd-canonical';
const FORKED_DRAFT_ID = 'cd-forked';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const CHANNEL_ID = 'chan-1';

let stageRunRow: Record<string, unknown>;
let projectRow: Record<string, unknown>;
let channelRow: Record<string, unknown> | null;
let trackRow: Record<string, unknown> | null;
let priorCanonicalStageRun: Record<string, unknown> | null;
let canonicalContentDraft: Record<string, unknown> | null;

let stageRunsUpdateMock: ReturnType<typeof vi.fn>;
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
              maybeSingle: () => Promise.resolve({ data: canonicalContentDraft, error: null }),
            }),
          }),
          insert: draftInsertMock,
        };
      }
      return {};
    },
  }),
}));

describe('pipeline-production-dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    stageRunsUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    draftInsertMock = vi.fn().mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: FORKED_DRAFT_ID }, error: null }),
      }),
    });

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
      canonical_core_json: { thesis: 't' },
      research_session_id: 'rs-1',
      idea_id: 'idea-1',
      persona_id: null,
      channel_id: CHANNEL_ID,
      org_id: ORG_ID,
      user_id: USER_ID,
    };
  });

  it('returns early when event stage is not production', async () => {
    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');
    const { inngest } = await import('../client.js');

    await (
      pipelineProductionDispatch as unknown as (args: {
        event: { data: { stageRunId: string; stage: string; projectId: string } };
      }) => Promise<void>
    )({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'canonical', projectId: PROJECT_ID } },
    });

    expect(inngest.send).not.toHaveBeenCalled();
    expect(draftInsertMock).not.toHaveBeenCalled();
  });

  it('skips when stage_run is not queued (idempotency)', async () => {
    stageRunRow = { ...stageRunRow, status: 'running' };

    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');
    const { inngest } = await import('../client.js');

    await (
      pipelineProductionDispatch as unknown as (args: {
        event: { data: { stageRunId: string; stage: string; projectId: string } };
      }) => Promise<void>
    )({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'production', projectId: PROJECT_ID } },
    });

    expect(inngest.send).not.toHaveBeenCalled();
    expect(draftInsertMock).not.toHaveBeenCalled();
  });

  it('reuses canonical content_draft when Track medium matches, emits production/produce', async () => {
    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');
    const { inngest } = await import('../client.js');

    await (
      pipelineProductionDispatch as unknown as (args: {
        event: { data: { stageRunId: string; stage: string; projectId: string } };
      }) => Promise<void>
    )({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'production', projectId: PROJECT_ID } },
    });

    // medium ('blog') matches canonical draft type → no fork
    expect(draftInsertMock).not.toHaveBeenCalled();

    expect(stageRunsUpdateMock).toHaveBeenCalled();
    const updateRow = stageRunsUpdateMock.mock.calls[0][0];
    expect(updateRow.status).toBe('running');
    expect(updateRow.payload_ref).toEqual({ kind: 'content_draft', id: CANONICAL_DRAFT_ID });

    expect(inngest.send).toHaveBeenCalledTimes(1);
    const event = (inngest.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(event.name).toBe('production/produce');
    expect(event.data.draftId).toBe(CANONICAL_DRAFT_ID);
    expect(event.data.stageRunId).toBe(STAGE_RUN_ID);
    expect(event.data.type).toBe('blog');
  });

  it('forks a new content_draft when Track medium differs from canonical type', async () => {
    trackRow = { id: 'track-video', project_id: PROJECT_ID, medium: 'video', status: 'active' };
    stageRunRow = { ...stageRunRow, track_id: 'track-video' };

    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');
    const { inngest } = await import('../client.js');

    await (
      pipelineProductionDispatch as unknown as (args: {
        event: { data: { stageRunId: string; stage: string; projectId: string } };
      }) => Promise<void>
    )({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'production', projectId: PROJECT_ID } },
    });

    expect(draftInsertMock).toHaveBeenCalled();
    const forkedRow = draftInsertMock.mock.calls[0][0];
    expect(forkedRow.project_id).toBe(PROJECT_ID);
    expect(forkedRow.type).toBe('video');
    // canonical_core_json copied from the canonical draft
    expect(forkedRow.canonical_core_json).toEqual({ thesis: 't' });

    const event = (inngest.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(event.name).toBe('production/produce');
    expect(event.data.draftId).toBe(FORKED_DRAFT_ID);
    expect(event.data.type).toBe('video');
  });

  it('fails the Stage Run when track_id is missing', async () => {
    stageRunRow = { ...stageRunRow, track_id: null };

    const { pipelineProductionDispatch } = await import('../pipeline-production-dispatch.js');
    const { inngest } = await import('../client.js');

    await (
      pipelineProductionDispatch as unknown as (args: {
        event: { data: { stageRunId: string; stage: string; projectId: string } };
      }) => Promise<void>
    )({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'production', projectId: PROJECT_ID } },
    });

    expect(inngest.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'production/produce' }),
    );
    // markFailed updates stage_runs to status='failed'
    expect(stageRunsUpdateMock).toHaveBeenCalled();
    const updateRow = stageRunsUpdateMock.mock.calls[0][0];
    expect(updateRow.status).toBe('failed');
  });
});
