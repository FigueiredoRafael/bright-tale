/**
 * Slice 6 (#14) — pipeline-research-dispatch.
 *
 * Listens on `pipeline/stage.requested` filtered to stage='research'.
 * Resolves the topic from the prior brainstorm Stage Run's recommendation
 * pick (when the input_json doesn't already carry one), creates a
 * `research_sessions` row, transitions the Stage Run to `running`, and
 * sends the legacy `research/generate` event with `stageRunId` attached.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client.js', () => ({
  inngest: {
    createFunction: (_config: unknown, handler: unknown) => handler,
    send: vi.fn(async () => ({ ids: ['evt-1'] })),
  },
}));

const STAGE_RUN_ID = 'sr-research';
const PROJECT_ID = 'proj-xyz';
const SESSION_ID = 'rs-1';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const CHANNEL_ID = 'chan-1';
const BRAINSTORM_SESSION_ID = 'bs-sess-1';
const PICKED_DRAFT_ID = 'bd-pick';

let stageRunRow: Record<string, unknown>;
let projectRow: Record<string, unknown>;
let channelRow: Record<string, unknown> | null;
let priorBrainstormStageRun: Record<string, unknown> | null;
let pickedDraft: Record<string, unknown> | null;
let brainstormSessionRow: Record<string, unknown> | null;

let stageRunsUpdateMock: ReturnType<typeof vi.fn>;
let sessionInsertMock: ReturnType<typeof vi.fn>;

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
                      maybeSingle: () => Promise.resolve({ data: priorBrainstormStageRun, error: null }),
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
      if (table === 'brainstorm_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: brainstormSessionRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'brainstorm_drafts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: pickedDraft, error: null }),
            }),
          }),
        };
      }
      if (table === 'research_sessions') {
        return { insert: sessionInsertMock };
      }
      return {};
    },
  }),
}));

describe('pipeline-research-dispatch', () => {
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
      stage: 'research',
      status: 'queued',
      input_json: { level: 'medium' },
    };
    projectRow = { id: PROJECT_ID, channel_id: CHANNEL_ID, org_id: ORG_ID };
    channelRow = { user_id: USER_ID, org_id: ORG_ID };
    priorBrainstormStageRun = {
      id: 'sr-bs',
      stage: 'brainstorm',
      status: 'completed',
      payload_ref: { kind: 'brainstorm_draft', id: PICKED_DRAFT_ID },
    };
    pickedDraft = {
      id: PICKED_DRAFT_ID,
      title: 'AI pricing in B2B SaaS',
      core_tension: 'race to bottom vs value-based',
      session_id: BRAINSTORM_SESSION_ID,
    };
    brainstormSessionRow = {
      id: BRAINSTORM_SESSION_ID,
      recommendation_json: { pick: PICKED_DRAFT_ID },
    };
  });

  it('returns early when event stage is not research', async () => {
    const { pipelineResearchDispatch } = await import('../pipeline-research-dispatch.js');
    const { inngest } = await import('../client.js');

    await (pipelineResearchDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'brainstorm', projectId: PROJECT_ID } },
    });

    expect(inngest.send).not.toHaveBeenCalled();
    expect(sessionInsertMock).not.toHaveBeenCalled();
  });

  it('resolves the topic from the prior brainstorm winner, inserts research_sessions, and sends research/generate', async () => {
    const { pipelineResearchDispatch } = await import('../pipeline-research-dispatch.js');
    const { inngest } = await import('../client.js');

    await (pipelineResearchDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'research', projectId: PROJECT_ID } },
    });

    expect(sessionInsertMock).toHaveBeenCalled();
    const sessionRow = sessionInsertMock.mock.calls[0][0];
    expect(sessionRow.project_id).toBe(PROJECT_ID);
    expect(sessionRow.org_id).toBe(ORG_ID);
    expect(sessionRow.user_id).toBe(USER_ID);
    expect(sessionRow.level).toBe('medium');
    expect(sessionRow.idea_id).toBe(PICKED_DRAFT_ID);

    expect(stageRunsUpdateMock).toHaveBeenCalled();
    const updateRow = stageRunsUpdateMock.mock.calls[0][0];
    expect(updateRow.status).toBe('running');

    expect(inngest.send).toHaveBeenCalledTimes(1);
    const event = (inngest.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(event.name).toBe('research/generate');
    expect(event.data.sessionId).toBe(SESSION_ID);
    expect(event.data.stageRunId).toBe(STAGE_RUN_ID);
    expect(event.data.level).toBe('medium');
  });

  it('honours an explicit ideaId in stage_run.input_json instead of resolving from brainstorm', async () => {
    stageRunRow = {
      ...stageRunRow,
      input_json: { level: 'deep', ideaId: 'custom-idea-id', topic: 'override topic' },
    };
    // Even though the resolver would pick PICKED_DRAFT_ID, the dispatcher
    // must honour the explicit ideaId.
    pickedDraft = { id: 'custom-idea-id', title: 'override topic', session_id: BRAINSTORM_SESSION_ID };

    const { pipelineResearchDispatch } = await import('../pipeline-research-dispatch.js');

    await (pipelineResearchDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'research', projectId: PROJECT_ID } },
    });

    const sessionRow = sessionInsertMock.mock.calls[0][0];
    expect(sessionRow.idea_id).toBe('custom-idea-id');
    expect(sessionRow.level).toBe('deep');
  });
});
