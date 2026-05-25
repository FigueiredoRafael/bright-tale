/**
 * pipeline-publish-dispatch — Publish Stage.
 *
 * T2.7: dispatcher is scoped to (track, publish_target). Reads
 * `publish_target_id` off the Stage Run, resolves the target row, and
 * routes to the type-specific driver. Today only `wordpress` has a real
 * driver (existing WP route); other types fail with NOT_IMPLEMENTED so
 * one target failure never affects sibling targets (each lives in its
 * own Stage Run).
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
const TRACK_ID = 'track-1';
const PUBLISH_TARGET_ID = 'pt-wp-1';
const PUBLISH_TARGET_CHANNEL_ID = 'ch-wp';
const DRAFT_ID = 'cd-1';

let stageRunRow: Record<string, unknown> | null;
let priorProductionRow: Record<string, unknown> | null;
let publishTargetRow: Record<string, unknown> | null;
let draftRow: Record<string, unknown> | null;
let stageRunsUpdateMock: ReturnType<typeof vi.fn>;

// Captured query introspection so tests can assert track-scoping etc.
const stageRunsSelectCalls: { cols: string; eqs: Array<[string, unknown]>; iss: Array<[string, unknown]> }[] = [];

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'stage_runs') {
        return {
          select: (cols: string) => {
            const tracker = { cols, eqs: [] as Array<[string, unknown]>, iss: [] as Array<[string, unknown]> };
            stageRunsSelectCalls.push(tracker);
            const chain: Record<string, unknown> = {};
            chain.eq = (k: string, v: unknown) => {
              tracker.eqs.push([k, v]);
              return chain;
            };
            chain.is = (k: string, v: unknown) => {
              tracker.iss.push([k, v]);
              return chain;
            };
            chain.order = () => chain;
            chain.limit = () => chain;
            chain.maybeSingle = () => {
              // The "load stage_run" call selects `input_json` (etc) and matches by id.
              if (cols.includes('input_json')) {
                return Promise.resolve({ data: stageRunRow, error: null });
              }
              // The "find prior production" call selects payload_ref ordered by created_at.
              if (cols.includes('payload_ref')) {
                return Promise.resolve({ data: priorProductionRow, error: null });
              }
              return Promise.resolve({ data: null, error: null });
            };
            return chain;
          },
          update: stageRunsUpdateMock,
        };
      }
      if (table === 'publish_targets') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: publishTargetRow, error: null }),
            }),
          }),
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

describe('pipeline-publish-dispatch (T2.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    stageRunsSelectCalls.length = 0;

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
      track_id: TRACK_ID,
      publish_target_id: PUBLISH_TARGET_ID,
      input_json: {},
    };
    priorProductionRow = {
      id: 'sr-production',
      stage: 'production',
      status: 'completed',
      payload_ref: { kind: 'content_draft', id: DRAFT_ID },
    };
    publishTargetRow = {
      id: PUBLISH_TARGET_ID,
      type: 'wordpress',
      channel_id: PUBLISH_TARGET_CHANNEL_ID,
      org_id: null,
      is_active: true,
      config_json: null,
      display_name: 'My WP',
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

  it('marks failed when publish_target_id missing on the Stage Run', async () => {
    stageRunRow = { ...stageRunRow!, publish_target_id: null };

    const { pipelinePublishDispatch } = await import('../pipeline-publish-dispatch.js');

    await (pipelinePublishDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'publish', projectId: PROJECT_ID } },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    const failedRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'failed');
    expect(failedRow).toBeDefined();
    expect(failedRow.error_message).toMatch(/publish_target_id/);
  });

  it('marks failed when the publish_target row is missing or inactive', async () => {
    publishTargetRow = { ...publishTargetRow!, is_active: false };

    const { pipelinePublishDispatch } = await import('../pipeline-publish-dispatch.js');

    await (pipelinePublishDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'publish', projectId: PROJECT_ID } },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    const failedRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'failed');
    expect(failedRow).toBeDefined();
    expect(failedRow.error_message).toMatch(/inactive|not found/i);
  });

  it('marks failed with NOT_IMPLEMENTED for non-wordpress driver types', async () => {
    publishTargetRow = { ...publishTargetRow!, type: 'spotify' };

    const { pipelinePublishDispatch } = await import('../pipeline-publish-dispatch.js');

    await (pipelinePublishDispatch as unknown as (args: {
      event: { data: { stageRunId: string; stage: string; projectId: string } };
    }) => Promise<void>)({
      event: { data: { stageRunId: STAGE_RUN_ID, stage: 'publish', projectId: PROJECT_ID } },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    const failedRow = stageRunsUpdateMock.mock.calls
      .map((c) => c[0])
      .find((r) => r.status === 'failed');
    expect(failedRow).toBeDefined();
    expect(failedRow.error_message).toMatch(/NOT_IMPLEMENTED.*spotify/);
  });

  it('on WP publish success: looks up the prior production run scoped to track_id and completes with published_url', async () => {
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

    // The prior-draft lookup must be track-scoped: a sibling Track's production
    // run must not satisfy this Track's publish dispatcher.
    const priorLookup = stageRunsSelectCalls.find(
      (c) => c.cols.includes('payload_ref') && c.eqs.some(([k]) => k === 'stage'),
    );
    expect(priorLookup).toBeDefined();
    expect(priorLookup!.eqs).toEqual(
      expect.arrayContaining([
        ['project_id', PROJECT_ID],
        ['stage', 'production'],
        ['track_id', TRACK_ID],
      ]),
    );

    // The WP route is called with channelId resolved from publish_target.channel_id.
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/wordpress/publish-draft',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-internal-key': 'test-internal-key',
          'x-user-id': 'user-1',
        }),
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.draftId).toBe(DRAFT_ID);
    expect(body.channelId).toBe(PUBLISH_TARGET_CHANNEL_ID);

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

  it('on WP publish failure: only updates THIS Stage Run (sibling targets untouched)', async () => {
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

    // Each writer call is keyed by stageRunId only — verify the .eq('id', ...)
    // call on update chains targets THIS run, never the project or a sibling.
    for (const call of stageRunsUpdateMock.mock.calls) {
      const eqCall = (stageRunsUpdateMock.mock.results[
        stageRunsUpdateMock.mock.calls.indexOf(call)
      ]?.value as { eq: ReturnType<typeof vi.fn> } | undefined)?.eq;
      if (eqCall) {
        // The writer always scopes to id=stageRunId — guaranteed structurally,
        // but the test asserts the contract explicitly.
        expect(eqCall).toHaveBeenCalledWith('id', STAGE_RUN_ID);
      }
    }
  });
});
