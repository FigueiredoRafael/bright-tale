/**
 * T2.6 — pipeline-canonical-dispatch.
 *
 * Listens on `pipeline/stage.requested` filtered to stage='canonical'.
 * Project-scoped. Resolves persona/idea/research from prior Stage Runs,
 * creates the shared content_drafts row, transitions the Stage Run to
 * `running`, and sends `production/generate` with `phase='canonical'`
 * so the worker terminal-writes the canonical Stage Run after canonical
 * core generation (no chain to produce).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client.js', () => ({
  inngest: {
    createFunction: (_config: unknown, handler: unknown) => handler,
    send: vi.fn(async () => ({ ids: ['evt-1'] })),
  },
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

let stageRunRow: Record<string, unknown>;
let projectRow: Record<string, unknown>;
let channelRow: Record<string, unknown> | null;
let priorResearchStageRun: Record<string, unknown> | null;
let priorBrainstormStageRun: Record<string, unknown> | null;
let trackRows: Array<Record<string, unknown>>;

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
        return { insert: draftInsertMock };
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
              single: () => Promise.resolve({ data: { id: 'idea-arch-1' }, error: null }),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

describe('pipeline-canonical-dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    stageRunsUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
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
  });

  it('returns early when event stage is not canonical', async () => {
    const { pipelineCanonicalDispatch } = await import('../pipeline-canonical-dispatch.js');
    const { inngest } = await import('../client.js');

    await (
      pipelineCanonicalDispatch as unknown as (args: {
        event: { data: { stageRunId: string; stage: string; projectId: string } };
      }) => Promise<void>
    )({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'research', projectId: PROJECT_ID } },
    });

    expect(inngest.send).not.toHaveBeenCalled();
    expect(draftInsertMock).not.toHaveBeenCalled();
  });

  it('skips when stage_run is not queued (idempotency)', async () => {
    stageRunRow = { ...stageRunRow, status: 'running' };

    const { pipelineCanonicalDispatch } = await import('../pipeline-canonical-dispatch.js');
    const { inngest } = await import('../client.js');

    await (
      pipelineCanonicalDispatch as unknown as (args: {
        event: { data: { stageRunId: string; stage: string; projectId: string } };
      }) => Promise<void>
    )({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'canonical', projectId: PROJECT_ID } },
    });

    expect(inngest.send).not.toHaveBeenCalled();
    expect(draftInsertMock).not.toHaveBeenCalled();
  });

  it('inserts shared content_draft, marks running, emits production/generate with phase=canonical', async () => {
    const { pipelineCanonicalDispatch } = await import('../pipeline-canonical-dispatch.js');
    const { inngest } = await import('../client.js');

    await (
      pipelineCanonicalDispatch as unknown as (args: {
        event: { data: { stageRunId: string; stage: string; projectId: string } };
      }) => Promise<void>
    )({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'canonical', projectId: PROJECT_ID } },
    });

    expect(draftInsertMock).toHaveBeenCalled();
    const draftRow = draftInsertMock.mock.calls[0][0];
    expect(draftRow.project_id).toBe(PROJECT_ID);
    expect(draftRow.org_id).toBe(ORG_ID);
    expect(draftRow.user_id).toBe(USER_ID);
    // canonical is project-scoped; type derived from first active Track
    expect(draftRow.type).toBe('blog');
    expect(draftRow.research_session_id).toBe(RESEARCH_SESSION_ID);

    expect(stageRunsUpdateMock).toHaveBeenCalled();
    const updateRow = stageRunsUpdateMock.mock.calls[0][0];
    expect(updateRow.status).toBe('running');

    expect(inngest.send).toHaveBeenCalledTimes(1);
    const event = (inngest.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(event.name).toBe('production/generate');
    expect(event.data.draftId).toBe(DRAFT_ID);
    expect(event.data.stageRunId).toBe(STAGE_RUN_ID);
    expect(event.data.phase).toBe('canonical');
  });
});
