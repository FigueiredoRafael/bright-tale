/**
 * Slice 3 (#11) — pipeline-brainstorm-dispatch.
 *
 * Picks up `pipeline/stage.requested` for stage='brainstorm', creates a
 * brainstorm_sessions row out of the stage_runs input_json + project
 * channel context, transitions the Stage Run to `running` (or to
 * `awaiting_user` when provider='manual'), and emits `brainstorm/generate`
 * with the stageRunId attached so the existing job can write back
 * stage_runs at terminal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client.js', () => ({
  inngest: {
    createFunction: (_config: unknown, handler: unknown) => handler,
    send: vi.fn(async () => ({ ids: ['evt-1'] })),
  },
}));

const STAGE_RUN_ID = 'sr-abc';
const PROJECT_ID = 'proj-xyz';
const SESSION_ID = 'sess-123';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const CHANNEL_ID = 'chan-1';

// Per-test handles for chain behaviour.
let stageRunRow: Record<string, unknown> = {};
let projectRow: Record<string, unknown> = {};
let channelRow: Record<string, unknown> = {};
let stageRunsUpdateMock: ReturnType<typeof vi.fn>;
let sessionInsertMock: ReturnType<typeof vi.fn>;

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'stage_runs') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: stageRunRow, error: null }),
            }),
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
      if (table === 'brainstorm_sessions') {
        return { insert: sessionInsertMock };
      }
      return {};
    },
  }),
}));

describe('pipeline-brainstorm-dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    stageRunsUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    sessionInsertMock = vi.fn().mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: SESSION_ID }, error: null }),
      }),
    });

    stageRunRow = {
      id: STAGE_RUN_ID,
      project_id: PROJECT_ID,
      stage: 'brainstorm',
      status: 'queued',
      input_json: { mode: 'topic_driven', topic: 'AI pricing', provider: 'openai', model: 'gpt-4' },
    };
    projectRow = { id: PROJECT_ID, channel_id: CHANNEL_ID, org_id: ORG_ID };
    channelRow = { user_id: USER_ID, org_id: ORG_ID };
  });

  it('returns early when event stage is not brainstorm', async () => {
    const { pipelineBrainstormDispatch } = await import('../pipeline-brainstorm-dispatch.js');
    const { inngest } = await import('../client.js');

    await (pipelineBrainstormDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'research', projectId: PROJECT_ID } },
    });

    expect(inngest.send).not.toHaveBeenCalled();
    expect(sessionInsertMock).not.toHaveBeenCalled();
  });

  it('creates a brainstorm_sessions row, transitions stage_run → running, and emits brainstorm/generate with stageRunId', async () => {
    const { pipelineBrainstormDispatch } = await import('../pipeline-brainstorm-dispatch.js');
    const { inngest } = await import('../client.js');

    await (pipelineBrainstormDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'brainstorm', projectId: PROJECT_ID } },
    });

    expect(sessionInsertMock).toHaveBeenCalledTimes(1);
    const sessionRow = sessionInsertMock.mock.calls[0][0];
    expect(sessionRow.project_id).toBe(PROJECT_ID);
    expect(sessionRow.channel_id).toBe(CHANNEL_ID);
    expect(sessionRow.org_id).toBe(ORG_ID);
    expect(sessionRow.user_id).toBe(USER_ID);

    expect(stageRunsUpdateMock).toHaveBeenCalled();
    const updateRow = stageRunsUpdateMock.mock.calls[0][0];
    expect(updateRow.status).toBe('running');
    expect(updateRow.started_at).toBeTruthy();

    expect(inngest.send).toHaveBeenCalledTimes(1);
    const event = (inngest.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(event.name).toBe('brainstorm/generate');
    expect(event.data.sessionId).toBe(SESSION_ID);
    expect(event.data.stageRunId).toBe(STAGE_RUN_ID);
    expect(event.data.provider).toBe('openai');
  });

  it("transitions the Stage Run to awaiting_user(manual_paste) and does NOT enqueue brainstorm/generate when provider='manual'", async () => {
    stageRunRow = {
      ...stageRunRow,
      input_json: { mode: 'topic_driven', topic: 'x', provider: 'manual' },
    };

    const { pipelineBrainstormDispatch } = await import('../pipeline-brainstorm-dispatch.js');
    const { inngest } = await import('../client.js');

    await (pipelineBrainstormDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'brainstorm', projectId: PROJECT_ID } },
    });

    expect(stageRunsUpdateMock).toHaveBeenCalled();
    const updateRow = stageRunsUpdateMock.mock.calls[0][0];
    expect(updateRow.status).toBe('awaiting_user');
    expect(updateRow.awaiting_reason).toBe('manual_paste');
    expect(updateRow.payload_ref).toEqual({ kind: 'brainstorm_session', id: SESSION_ID });

    expect(inngest.send).not.toHaveBeenCalled();
  });
});
