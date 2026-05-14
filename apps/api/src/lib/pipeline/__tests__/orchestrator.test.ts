/**
 * Pipeline Orchestrator — unit tests.
 * The orchestrator is the single authority over Stage Run lifecycle.
 * These tests pin its public surface (`requestStageRun`, `advanceAfter`).
 *
 * Supabase is mocked at the boundary. Per-row schema/RLS are exercised by
 * separate integration tests against a real DB (out of scope for this slice).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Supabase mock ────────────────────────────────────────────────────────────

interface MockChain {
  from: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
}

const mockChain: MockChain = {} as MockChain;
['from', 'select', 'insert', 'update', 'eq', 'in', 'is', 'order', 'limit'].forEach((m) => {
  (mockChain as unknown as Record<string, unknown>)[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.maybeSingle = vi.fn();
mockChain.single = vi.fn();

vi.mock('@/lib/supabase', () => ({ createServiceClient: () => mockChain }));

// ── Inngest mock ─────────────────────────────────────────────────────────────

const { inngestSendMock } = vi.hoisted(() => ({ inngestSendMock: vi.fn(async () => ({ ids: ['evt-1'] })) }));
vi.mock('@/jobs/client', () => ({ inngest: { send: inngestSendMock } }));

// ── Import under test (after mocks) ──────────────────────────────────────────

import { requestStageRun, advanceAfter, resumeProject } from '@/lib/pipeline/orchestrator';

const OWNER_ID = '00000000-0000-0000-0000-000000000001';
const PROJECT_ID = '00000000-0000-0000-0000-0000000000aa';
const CHANNEL_ID = '00000000-0000-0000-0000-0000000000bb';

beforeEach(() => {
  vi.clearAllMocks();
  ['from', 'select', 'insert', 'update', 'eq', 'in', 'is', 'order', 'limit'].forEach((m) => {
    (mockChain as unknown as Record<string, ReturnType<typeof vi.fn>>)[m] = vi.fn().mockReturnValue(mockChain);
  });
  // Reset terminal mocks so per-test `mockResolvedValueOnce` queues start empty.
  mockChain.maybeSingle = vi.fn();
  mockChain.single = vi.fn();
});

describe('requestStageRun', () => {
  it('creates a queued brainstorm Stage Run for the project owner', async () => {
    // Project lookup → channel owned by user
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { channel_id: CHANNEL_ID, research_id: null }, error: null }) // project
      .mockResolvedValueOnce({ data: { user_id: OWNER_ID }, error: null }) // channel
      .mockResolvedValueOnce({ data: null, error: null }) // no existing non-terminal stage_run
      .mockResolvedValueOnce({ data: null, error: null }); // no prior terminal attempt

    mockChain.single.mockResolvedValueOnce({
      data: {
        id: 'sr-1',
        project_id: PROJECT_ID,
        stage: 'brainstorm',
        status: 'queued',
        awaiting_reason: null,
        payload_ref: null,
        attempt_no: 1,
        input_json: { mode: 'topic_driven', topic: 'AI pricing' },
        error_message: null,
        started_at: null,
        finished_at: null,
        created_at: '2026-05-11T00:00:00Z',
        updated_at: '2026-05-11T00:00:00Z',
      },
      error: null,
    });

    const result = await requestStageRun(
      PROJECT_ID,
      'brainstorm',
      { mode: 'topic_driven', topic: 'AI pricing' },
      OWNER_ID,
    );

    expect(result.status).toBe('queued');
    expect(result.stage).toBe('brainstorm');
    expect(result.attemptNo).toBe(1);
    expect(result.projectId).toBe(PROJECT_ID);

    // Verify it actually inserted into stage_runs
    const fromCalls = (mockChain.from as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(fromCalls).toContain('stage_runs');
  });

  it('rejects with OwnershipError when user does not own the project', async () => {
    const OTHER_USER = '00000000-0000-0000-0000-0000000000ff';

    // Project lookup → channel owned by SOMEONE ELSE
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { channel_id: CHANNEL_ID, research_id: null }, error: null }) // project
      .mockResolvedValueOnce({ data: { user_id: OWNER_ID }, error: null }); // channel (different owner)

    await expect(
      requestStageRun(
        PROJECT_ID,
        'brainstorm',
        { mode: 'topic_driven', topic: 'AI pricing' },
        OTHER_USER, // ← not the owner
      ),
    ).rejects.toThrow(/forbidden/i);

    // Ensure no insert happened
    expect(mockChain.insert).not.toHaveBeenCalled();
  });

  it('rejects with PredecessorNotDoneError when predecessor stage has no terminal-OK run', async () => {
    // Project lookup + ownership pass
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { channel_id: CHANNEL_ID, research_id: null }, error: null })
      .mockResolvedValueOnce({ data: { user_id: OWNER_ID }, error: null })
      // Predecessor lookup: no brainstorm row with status in (completed, skipped) for this project
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(
      requestStageRun(
        PROJECT_ID,
        'research', // research's predecessor is brainstorm
        {},
        OWNER_ID,
      ),
    ).rejects.toThrow(/predecessor/i);

    expect(mockChain.insert).not.toHaveBeenCalled();
  });

  it('rejects with ConcurrentStageRunError when a non-terminal run already exists for (project, stage)', async () => {
    // Project + ownership pass
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { channel_id: CHANNEL_ID, research_id: null }, error: null })
      .mockResolvedValueOnce({ data: { user_id: OWNER_ID }, error: null });

    // No predecessor for brainstorm, skip to: existing non-terminal stage_run check
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'sr-existing', status: 'running' },
      error: null,
    });

    await expect(
      requestStageRun(
        PROJECT_ID,
        'brainstorm',
        { mode: 'topic_driven', topic: 'AI pricing' },
        OWNER_ID,
      ),
    ).rejects.toThrow(/concurrent|already exists|in[- ]?flight/i);

    expect(mockChain.insert).not.toHaveBeenCalled();
  });

  it('rejects with StageInputValidationError when the Zod schema rejects the input', async () => {
    // Ownership pass; no predecessor for brainstorm
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { channel_id: CHANNEL_ID, research_id: null }, error: null })
      .mockResolvedValueOnce({ data: { user_id: OWNER_ID }, error: null });

    await expect(
      requestStageRun(
        PROJECT_ID,
        'brainstorm',
        // mode is required by the schema — omit it
        { topic: 'AI pricing' } as unknown,
        OWNER_ID,
      ),
    ).rejects.toThrow(/invalid input/i);

    expect(mockChain.insert).not.toHaveBeenCalled();
  });

  it.skip('rejects with StageNotMigratedError — all stages migrated as of Slice 10, no z.never schemas remain', () => {
    // Kept as a skipped placeholder so the path is obvious if any stage
    // is ever rolled back to z.never. See @brighttale/shared/pipeline/inputs.
  });

  it('increments attempt_no when a prior terminal Stage Run for the same Stage exists', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { channel_id: CHANNEL_ID, research_id: null }, error: null })
      .mockResolvedValueOnce({ data: { user_id: OWNER_ID }, error: null })
      // No non-terminal stage_run (UNIQUE check passes)
      .mockResolvedValueOnce({ data: null, error: null })
      // Prior attempt query: latest terminal run for this stage was attempt_no=2
      .mockResolvedValueOnce({ data: { attempt_no: 2 }, error: null });

    mockChain.single.mockResolvedValueOnce({
      data: {
        id: 'sr-retry',
        project_id: PROJECT_ID,
        stage: 'brainstorm',
        status: 'queued',
        attempt_no: 3,
        created_at: '2026-05-11T00:00:00Z',
        updated_at: '2026-05-11T00:00:00Z',
      },
      error: null,
    });

    const result = await requestStageRun(
      PROJECT_ID,
      'brainstorm',
      { mode: 'topic_driven', topic: 'AI pricing' },
      OWNER_ID,
    );

    expect(result.attemptNo).toBe(3);
    const insertedRow = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertedRow.attempt_no).toBe(3);
  });

  it('emits pipeline/stage.requested after inserting a queued Stage Run', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce({ data: { channel_id: CHANNEL_ID, research_id: null }, error: null })
      .mockResolvedValueOnce({ data: { user_id: OWNER_ID }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    mockChain.single.mockResolvedValueOnce({
      data: {
        id: 'sr-emit',
        project_id: PROJECT_ID,
        stage: 'brainstorm',
        status: 'queued',
        awaiting_reason: null,
        payload_ref: null,
        attempt_no: 1,
        input_json: { mode: 'topic_driven', topic: 'x' },
        error_message: null,
        started_at: null,
        finished_at: null,
        created_at: '2026-05-11T00:00:00Z',
        updated_at: '2026-05-11T00:00:00Z',
      },
      error: null,
    });

    await requestStageRun(PROJECT_ID, 'brainstorm', { mode: 'topic_driven', topic: 'x' }, OWNER_ID);

    expect(inngestSendMock).toHaveBeenCalledTimes(1);
    const [event] = (inngestSendMock as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(event.name).toBe('pipeline/stage.requested');
    expect(event.data.stageRunId).toBe('sr-emit');
    expect(event.data.stage).toBe('brainstorm');
    expect(event.data.projectId).toBe(PROJECT_ID);
  });
});

// ─── advanceAfter ────────────────────────────────────────────────────────────

describe('advanceAfter', () => {
  function mockFinishedRun(status: string, stage = 'brainstorm') {
    return {
      data: { id: 'sr-1', project_id: PROJECT_ID, stage, status },
      error: null,
    };
  }
  function mockProject(mode: string, paused: boolean) {
    return { data: { id: PROJECT_ID, mode, paused }, error: null };
  }

  it('no-ops when the project is in manual mode', async () => {
    // stage_runs lookup (finished run)
    mockChain.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: 'sr-1',
          project_id: PROJECT_ID,
          stage: 'brainstorm',
          status: 'completed',
        },
        error: null,
      })
      // project lookup (mode + paused)
      .mockResolvedValueOnce({
        data: { id: PROJECT_ID, mode: 'manual', paused: false },
        error: null,
      });

    await advanceAfter('sr-1');

    // No insert into stage_runs (no new run created)
    expect(mockChain.insert).not.toHaveBeenCalled();
  });

  it('no-ops when the project is paused (even on autopilot)', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedRun('completed'))
      .mockResolvedValueOnce(mockProject('autopilot', true));

    await advanceAfter('sr-1');
    expect(mockChain.insert).not.toHaveBeenCalled();
  });

  it('no-ops when the finished Stage Run is failed', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedRun('failed'))
      .mockResolvedValueOnce(mockProject('autopilot', false));

    await advanceAfter('sr-1');
    expect(mockChain.insert).not.toHaveBeenCalled();
  });

  it('no-ops when the finished Stage Run is aborted', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedRun('aborted'))
      .mockResolvedValueOnce(mockProject('autopilot', false));

    await advanceAfter('sr-1');
    expect(mockChain.insert).not.toHaveBeenCalled();
  });

  it('creates the next Stage Run as queued when autopilot completes a non-publish stage', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedRun('completed', 'brainstorm'))
      .mockResolvedValueOnce(mockProject('autopilot', false))
      .mockResolvedValueOnce({ data: null, error: null }); // no existingNext

    // The insert+select chain returns the new stage_run
    mockChain.single.mockResolvedValueOnce({
      data: {
        id: 'sr-2',
        project_id: PROJECT_ID,
        stage: 'research',
        status: 'queued',
        attempt_no: 1,
        created_at: '2026-05-11T00:00:00Z',
        updated_at: '2026-05-11T00:00:00Z',
      },
      error: null,
    });

    await advanceAfter('sr-1');

    expect(mockChain.insert).toHaveBeenCalledTimes(1);
    const insertedRow = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertedRow.project_id).toBe(PROJECT_ID);
    expect(insertedRow.stage).toBe('research');
    expect(insertedRow.status).toBe('queued');
  });

  it('creates publish as awaiting_user(manual_advance) — never as queued — even in autopilot', async () => {
    // Finished preview → next is publish
    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedRun('completed', 'preview'))
      .mockResolvedValueOnce(mockProject('autopilot', false))
      .mockResolvedValueOnce({ data: null, error: null }); // no existingNext

    mockChain.single.mockResolvedValueOnce({
      data: {
        id: 'sr-pub',
        project_id: PROJECT_ID,
        stage: 'publish',
        status: 'awaiting_user',
        awaiting_reason: 'manual_advance',
        attempt_no: 1,
        created_at: '2026-05-11T00:00:00Z',
        updated_at: '2026-05-11T00:00:00Z',
      },
      error: null,
    });

    await advanceAfter('sr-1');

    expect(mockChain.insert).toHaveBeenCalledTimes(1);
    const insertedRow = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertedRow.stage).toBe('publish');
    expect(insertedRow.status).toBe('awaiting_user');
    expect(insertedRow.awaiting_reason).toBe('manual_advance');
  });

  it('skips review when autopilotConfig.review.maxIterations === 0 and recurses into assets', async () => {
    const projectWithSkipReview = {
      data: {
        id: PROJECT_ID,
        mode: 'autopilot',
        paused: false,
        autopilot_config_json: { review: { maxIterations: 0 } },
      },
      error: null,
    };

    // First advanceAfter call: finished draft → next is review → existingNext null → SKIP → insert skipped review
    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedRun('completed', 'production'))
      .mockResolvedValueOnce(projectWithSkipReview)
      .mockResolvedValueOnce({ data: null, error: null }) // existingNext for review
      // Recurse: load just-inserted skipped review row, re-check project,
      // then review-loop check (priorDraftRun lookup + draft row),
      // existingNext for assets is null, then queue assets.
      .mockResolvedValueOnce({
        data: { id: 'sr-rev', project_id: PROJECT_ID, stage: 'review', status: 'skipped' },
        error: null,
      })
      .mockResolvedValueOnce(projectWithSkipReview)
      .mockResolvedValueOnce({ data: null, error: null }) // priorDraftRun lookup
      .mockResolvedValueOnce({ data: null, error: null }); // existingNext for assets

    // Two inserts: skipped review, then queued assets
    mockChain.single
      .mockResolvedValueOnce({
        data: {
          id: 'sr-rev',
          project_id: PROJECT_ID,
          stage: 'review',
          status: 'skipped',
          attempt_no: 1,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: 'sr-ass',
          project_id: PROJECT_ID,
          stage: 'assets',
          status: 'queued',
          attempt_no: 1,
        },
        error: null,
      });

    await advanceAfter('sr-draft');

    expect(mockChain.insert).toHaveBeenCalledTimes(2);
    const rows = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(rows[0].stage).toBe('review');
    expect(rows[0].status).toBe('skipped');
    expect(rows[1].stage).toBe('assets');
    expect(rows[1].status).toBe('queued');
  });

  it('emits pipeline/stage.requested after inserting the next queued Stage Run on advance', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedRun('completed', 'brainstorm'))
      .mockResolvedValueOnce(mockProject('autopilot', false))
      .mockResolvedValueOnce({ data: null, error: null }); // no existingNext

    mockChain.single.mockResolvedValueOnce({
      data: {
        id: 'sr-research',
        project_id: PROJECT_ID,
        stage: 'research',
        status: 'queued',
        attempt_no: 1,
        created_at: '2026-05-11T00:00:00Z',
        updated_at: '2026-05-11T00:00:00Z',
      },
      error: null,
    });

    await advanceAfter('sr-1');

    const requested = (inngestSendMock as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .find((e) => e.name === 'pipeline/stage.requested');
    expect(requested).toBeDefined();
    expect(requested.data.stageRunId).toBe('sr-research');
    expect(requested.data.stage).toBe('research');
    expect(requested.data.projectId).toBe(PROJECT_ID);
  });

  it('does NOT emit pipeline/stage.requested when the next Stage Run is inserted as skipped', async () => {
    const projectWithSkipReview = {
      data: {
        id: PROJECT_ID,
        mode: 'autopilot',
        paused: false,
        autopilot_config_json: { review: { maxIterations: 0 } },
      },
      error: null,
    };

    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedRun('completed', 'production'))
      .mockResolvedValueOnce(projectWithSkipReview)
      .mockResolvedValueOnce({ data: null, error: null }) // existingNext review
      // Inner recurse: load the just-inserted skipped review row
      .mockResolvedValueOnce({
        data: { id: 'sr-rev', project_id: PROJECT_ID, stage: 'review', status: 'skipped' },
        error: null,
      })
      .mockResolvedValueOnce(projectWithSkipReview)
      .mockResolvedValueOnce({ data: null, error: null }) // priorDraftRun lookup
      .mockResolvedValueOnce({ data: null, error: null }); // existingNext assets

    mockChain.single
      .mockResolvedValueOnce({
        data: { id: 'sr-rev', project_id: PROJECT_ID, stage: 'review', status: 'skipped', attempt_no: 1 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: 'sr-assets', project_id: PROJECT_ID, stage: 'assets', status: 'queued', attempt_no: 1 },
        error: null,
      });

    await advanceAfter('sr-draft');

    const requestedEvents = (inngestSendMock as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .filter((e) => e.name === 'pipeline/stage.requested');
    // Only the queued assets emits an event — the skipped review does not.
    expect(requestedEvents).toHaveLength(1);
    expect(requestedEvents[0].data.stage).toBe('assets');
  });
});

// ─── resumeProject ───────────────────────────────────────────────────────────

describe('resumeProject', () => {
  function mockProject(mode: string, paused: boolean) {
    return { data: { id: PROJECT_ID, mode, paused, autopilot_config_json: null }, error: null };
  }

  it('no-ops when the project is in manual mode', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce(mockProject('manual', false));
    // No second query because we bail out before reading stage_runs.
    await resumeProject(PROJECT_ID);
    expect(mockChain.insert).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it('no-ops when the project is paused', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce(mockProject('autopilot', true));
    await resumeProject(PROJECT_ID);
    expect(mockChain.insert).not.toHaveBeenCalled();
  });

  it('starts brainstorm from scratch when no Stage Runs exist yet', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce(mockProject('autopilot', false));
    // allRuns query — no rows.
    (mockChain.order as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [], error: null });

    mockChain.single.mockResolvedValueOnce({
      data: { id: 'sr-new', project_id: PROJECT_ID, stage: 'brainstorm', status: 'queued', attempt_no: 1 },
      error: null,
    });

    await resumeProject(PROJECT_ID);

    const inserted = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(inserted.stage).toBe('brainstorm');
    expect(inserted.attempt_no).toBe(1);

    const requested = (inngestSendMock as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .find((e) => e.name === 'pipeline/stage.requested');
    expect(requested?.data.stage).toBe('brainstorm');
  });

  it('retries the aborted stage with attempt_no + 1 when the predecessor is completed', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce(mockProject('autopilot', false));
    (mockChain.order as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [
        { stage: 'research', status: 'aborted', attempt_no: 1, created_at: '2026-05-11T11:00:00Z' },
        { stage: 'brainstorm', status: 'completed', attempt_no: 1, created_at: '2026-05-11T10:00:00Z' },
      ],
      error: null,
    });

    mockChain.single.mockResolvedValueOnce({
      data: { id: 'sr-retry', project_id: PROJECT_ID, stage: 'research', status: 'queued', attempt_no: 2 },
      error: null,
    });

    await resumeProject(PROJECT_ID);

    const inserted = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(inserted.stage).toBe('research');
    expect(inserted.attempt_no).toBe(2);
    expect(inserted.status).toBe('queued');
  });

  it('no-ops when a stage already has a non-terminal run in flight', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce(mockProject('autopilot', false));
    (mockChain.order as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [
        { stage: 'research', status: 'running', attempt_no: 1, created_at: '2026-05-11T11:00:00Z' },
        { stage: 'brainstorm', status: 'completed', attempt_no: 1, created_at: '2026-05-11T10:00:00Z' },
      ],
      error: null,
    });

    await resumeProject(PROJECT_ID);

    expect(mockChain.insert).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it('inserts publish as awaiting_user(manual_advance), no event emitted', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce(mockProject('autopilot', false));
    (mockChain.order as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [
        { stage: 'preview', status: 'completed', attempt_no: 1, created_at: '2026-05-11T15:00:00Z' },
        { stage: 'assets', status: 'completed', attempt_no: 1, created_at: '2026-05-11T14:00:00Z' },
        { stage: 'review', status: 'completed', attempt_no: 1, created_at: '2026-05-11T13:00:00Z' },
        { stage: 'production', status: 'completed', attempt_no: 1, created_at: '2026-05-11T12:30:00Z' },
        { stage: 'canonical', status: 'completed', attempt_no: 1, created_at: '2026-05-11T12:00:00Z' },
        { stage: 'research', status: 'completed', attempt_no: 1, created_at: '2026-05-11T11:00:00Z' },
        { stage: 'brainstorm', status: 'completed', attempt_no: 1, created_at: '2026-05-11T10:00:00Z' },
      ],
      error: null,
    });

    mockChain.single.mockResolvedValueOnce({
      data: {
        id: 'sr-pub',
        project_id: PROJECT_ID,
        stage: 'publish',
        status: 'awaiting_user',
        awaiting_reason: 'manual_advance',
        attempt_no: 1,
      },
      error: null,
    });

    await resumeProject(PROJECT_ID);

    const inserted = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(inserted.stage).toBe('publish');
    expect(inserted.status).toBe('awaiting_user');
    expect(inserted.awaiting_reason).toBe('manual_advance');

    // awaiting_user must NOT emit pipeline/stage.requested (user has to click Continue)
    const requested = (inngestSendMock as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .find((e) => e.name === 'pipeline/stage.requested');
    expect(requested).toBeUndefined();
  });
});

// ─── advanceAfter — per-Track pause + resolved config (T2.4) ────────────────

describe('advanceAfter — per-Track pause + resolved config (T2.4)', () => {
  const TRACK_ID = '00000000-0000-0000-0000-0000000000c1';

  function mockFinishedPerTrackRun(stage: string) {
    return {
      data: {
        id: 'sr-prod-1',
        project_id: PROJECT_ID,
        stage,
        status: 'completed',
        track_id: TRACK_ID,
        publish_target_id: null,
      },
      error: null,
    };
  }

  function mockProjectWithConfig(autopilotConfig: unknown) {
    return {
      data: {
        id: PROJECT_ID,
        mode: 'autopilot',
        paused: false,
        autopilot_config_json: autopilotConfig,
      },
      error: null,
    };
  }

  it('skips dispatch when the finished run\'s Track is paused', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedPerTrackRun('production'))
      .mockResolvedValueOnce(mockProjectWithConfig(null))
      // Track lookup → paused
      .mockResolvedValueOnce({ data: { id: TRACK_ID, paused: true, autopilot_config_json: null }, error: null });

    await advanceAfter('sr-prod-1');

    expect(mockChain.insert).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it('carries track_id forward and writes the resolved (project+track) slot to input_json', async () => {
    // Project says maxIterations 3; Track override says 1.
    const projectAutopilot = { review: { maxIterations: 3, autoApproveThreshold: 90 } };
    const trackAutopilot = { review: { maxIterations: 1 } };

    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedPerTrackRun('production'))
      .mockResolvedValueOnce(mockProjectWithConfig(projectAutopilot))
      .mockResolvedValueOnce({
        data: { id: TRACK_ID, paused: false, autopilot_config_json: trackAutopilot },
        error: null,
      })
      // existingNext review lookup → no prior review for this Track
      .mockResolvedValueOnce({ data: null, error: null });

    mockChain.single.mockResolvedValueOnce({
      data: {
        id: 'sr-rev-1',
        project_id: PROJECT_ID,
        stage: 'review',
        status: 'queued',
        attempt_no: 1,
        track_id: TRACK_ID,
      },
      error: null,
    });

    await advanceAfter('sr-prod-1');

    expect(mockChain.insert).toHaveBeenCalledTimes(1);
    const insertedRow = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertedRow.stage).toBe('review');
    expect(insertedRow.track_id).toBe(TRACK_ID);
    expect(insertedRow.status).toBe('queued');
    // Resolved slot: track maxIterations wins, project autoApproveThreshold survives.
    expect(insertedRow.input_json).toMatchObject({
      maxIterations: 1,
      autoApproveThreshold: 90,
    });
  });

  it('honors per-Track review.maxIterations=0 override by writing a skipped review and cascading to assets', async () => {
    // Project default: review runs (maxIterations=3). Track override: skip review.
    const projectAutopilot = { review: { maxIterations: 3 } };
    const trackAutopilot = { review: { maxIterations: 0 } };

    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedPerTrackRun('production'))
      .mockResolvedValueOnce(mockProjectWithConfig(projectAutopilot))
      .mockResolvedValueOnce({
        data: { id: TRACK_ID, paused: false, autopilot_config_json: trackAutopilot },
        error: null,
      })
      // existingNext review → none, then planner inserts skipped, then recurse.
      .mockResolvedValueOnce({ data: null, error: null })
      // Recurse: load the just-inserted skipped review row (now finished)
      .mockResolvedValueOnce({
        data: {
          id: 'sr-rev-skip',
          project_id: PROJECT_ID,
          stage: 'review',
          status: 'skipped',
          track_id: TRACK_ID,
          publish_target_id: null,
        },
        error: null,
      })
      .mockResolvedValueOnce(mockProjectWithConfig(projectAutopilot))
      // Recursion enters the review branch and reads outcome_json (skipped → no verdict)
      .mockResolvedValueOnce({ data: { outcome_json: null }, error: null })
      // Recursed Track lookup
      .mockResolvedValueOnce({
        data: { id: TRACK_ID, paused: false, autopilot_config_json: trackAutopilot },
        error: null,
      })
      // existingNext assets → none
      .mockResolvedValueOnce({ data: null, error: null });

    mockChain.single
      .mockResolvedValueOnce({
        data: {
          id: 'sr-rev-skip',
          project_id: PROJECT_ID,
          stage: 'review',
          status: 'skipped',
          attempt_no: 1,
          track_id: TRACK_ID,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: 'sr-ass-1',
          project_id: PROJECT_ID,
          stage: 'assets',
          status: 'queued',
          attempt_no: 1,
          track_id: TRACK_ID,
        },
        error: null,
      });

    await advanceAfter('sr-prod-1');

    expect(mockChain.insert).toHaveBeenCalledTimes(2);
    const inserts = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(inserts[0].stage).toBe('review');
    expect(inserts[0].status).toBe('skipped');
    expect(inserts[0].track_id).toBe(TRACK_ID);
    expect(inserts[1].stage).toBe('assets');
    expect(inserts[1].status).toBe('queued');
    expect(inserts[1].track_id).toBe(TRACK_ID);

    // Only the queued assets emits a dispatch event — the skipped review does not.
    const requested = (inngestSendMock as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .filter((e) => e.name === 'pipeline/stage.requested');
    expect(requested).toHaveLength(1);
    expect(requested[0].data.stage).toBe('assets');
  });

  it('on review revision_required, the re-run draft carries the same track_id (paused track aborts the revision)', async () => {
    // Review on Track T1 completes with revision_required → re-run draft for T1.
    // First test: not paused — should insert a queued draft with track_id=T1.
    mockChain.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: 'sr-rev-final',
          project_id: PROJECT_ID,
          stage: 'review',
          status: 'completed',
          track_id: TRACK_ID,
          publish_target_id: null,
        },
        error: null,
      })
      .mockResolvedValueOnce(mockProjectWithConfig(null))
      // outcome_json read for revision verdict
      .mockResolvedValueOnce({
        data: { outcome_json: { verdict: 'revision_required', draftType: 'blog', feedbackJson: { issues: [] } } },
        error: null,
      })
      // Track lookup for pause check
      .mockResolvedValueOnce({ data: { id: TRACK_ID, paused: false }, error: null })
      // latestAttemptNo lookup for draft stage
      .mockResolvedValueOnce({ data: { attempt_no: 1 }, error: null });

    mockChain.single.mockResolvedValueOnce({
      data: {
        id: 'sr-draft-2',
        project_id: PROJECT_ID,
        stage: 'draft',
        status: 'queued',
        attempt_no: 2,
        track_id: TRACK_ID,
      },
      error: null,
    });

    await advanceAfter('sr-rev-final');

    expect(mockChain.insert).toHaveBeenCalledTimes(1);
    const inserted = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(inserted.stage).toBe('draft');
    expect(inserted.track_id).toBe(TRACK_ID);
    expect(inserted.input_json).toMatchObject({ type: 'blog' });
  });

  it('on review revision_required for a paused Track, no draft re-run is inserted', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: 'sr-rev-final',
          project_id: PROJECT_ID,
          stage: 'review',
          status: 'completed',
          track_id: TRACK_ID,
          publish_target_id: null,
        },
        error: null,
      })
      .mockResolvedValueOnce(mockProjectWithConfig(null))
      .mockResolvedValueOnce({
        data: { outcome_json: { verdict: 'revision_required', draftType: 'blog', feedbackJson: null } },
        error: null,
      })
      // Track is paused
      .mockResolvedValueOnce({ data: { id: TRACK_ID, paused: true }, error: null });

    await advanceAfter('sr-rev-final');

    expect(mockChain.insert).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});

// ─── advanceAfter — canonical fan-out (T2.3) ─────────────────────────────────

describe('advanceAfter — canonical fan-out (T2.3)', () => {
  const T1 = 'track-1-blog';
  const T2 = 'track-2-video';
  const T3 = 'track-3-podcast';
  const CANON_ID = 'sr-canon';

  function mockFinishedCanonical() {
    return {
      data: { id: CANON_ID, project_id: PROJECT_ID, stage: 'canonical', status: 'completed' },
      error: null,
    };
  }
  function mockAutopilotProject() {
    return {
      data: { id: PROJECT_ID, mode: 'autopilot', paused: false, autopilot_config_json: null },
      error: null,
    };
  }
  function trackRow(id: string, medium: string, status = 'active', paused = false) {
    return {
      id,
      project_id: PROJECT_ID,
      medium,
      status,
      paused,
      autopilot_config_json: null,
    };
  }
  function canonicalPriorRun() {
    return {
      id: CANON_ID,
      stage: 'canonical',
      status: 'completed',
      track_id: null,
      publish_target_id: null,
      attempt_no: 1,
      outcome_json: null,
    };
  }
  function insertedProductionRow(id: string, trackId: string) {
    return {
      data: {
        id,
        project_id: PROJECT_ID,
        stage: 'production',
        status: 'queued',
        attempt_no: 1,
        track_id: trackId,
      },
      error: null,
    };
  }

  it('fans out to 3 parallel production stage_runs when 3 tracks are active', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedCanonical())
      .mockResolvedValueOnce(mockAutopilotProject());

    (mockChain.order as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        data: [trackRow(T1, 'blog'), trackRow(T2, 'video'), trackRow(T3, 'podcast')],
        error: null,
      })
      .mockResolvedValueOnce({ data: [canonicalPriorRun()], error: null });

    mockChain.single
      .mockResolvedValueOnce(insertedProductionRow('sr-p1', T1))
      .mockResolvedValueOnce(insertedProductionRow('sr-p2', T2))
      .mockResolvedValueOnce(insertedProductionRow('sr-p3', T3));

    await advanceAfter(CANON_ID);

    expect(mockChain.insert).toHaveBeenCalledTimes(3);
    const inserts = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(inserts.every((r) => r.stage === 'production')).toBe(true);
    expect(inserts.every((r) => r.status === 'queued')).toBe(true);
    expect(inserts.map((r) => r.track_id).sort()).toEqual([T1, T2, T3].sort());

    const requested = (inngestSendMock as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .filter((e) => e.name === 'pipeline/stage.requested');
    expect(requested).toHaveLength(3);
    expect(requested.every((e) => e.data.stage === 'production')).toBe(true);
    expect(requested.map((e) => e.data.stageRunId).sort()).toEqual(['sr-p1', 'sr-p2', 'sr-p3'].sort());
  });

  it('excludes aborted tracks from fan-out (3 tracks, 1 aborted → 2 runs)', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedCanonical())
      .mockResolvedValueOnce(mockAutopilotProject());

    (mockChain.order as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        data: [trackRow(T1, 'blog'), trackRow(T2, 'video', 'aborted'), trackRow(T3, 'podcast')],
        error: null,
      })
      .mockResolvedValueOnce({ data: [canonicalPriorRun()], error: null });

    mockChain.single
      .mockResolvedValueOnce(insertedProductionRow('sr-p1', T1))
      .mockResolvedValueOnce(insertedProductionRow('sr-p3', T3));

    await advanceAfter(CANON_ID);

    expect(mockChain.insert).toHaveBeenCalledTimes(2);
    const inserts = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(inserts.map((r) => r.track_id).sort()).toEqual([T1, T3].sort());
  });

  it('excludes paused tracks from fan-out (3 tracks, 1 paused → 2 runs)', async () => {
    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedCanonical())
      .mockResolvedValueOnce(mockAutopilotProject());

    (mockChain.order as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        data: [trackRow(T1, 'blog'), trackRow(T2, 'video', 'active', true), trackRow(T3, 'podcast')],
        error: null,
      })
      .mockResolvedValueOnce({ data: [canonicalPriorRun()], error: null });

    mockChain.single
      .mockResolvedValueOnce(insertedProductionRow('sr-p1', T1))
      .mockResolvedValueOnce(insertedProductionRow('sr-p3', T3));

    await advanceAfter(CANON_ID);

    expect(mockChain.insert).toHaveBeenCalledTimes(2);
    const inserts = (mockChain.insert as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(inserts.map((r) => r.track_id).sort()).toEqual([T1, T3].sort());
  });

  it('no-ops when canonical re-delivers and all tracks already have production runs', async () => {
    // Prior runs already contain production rows for T1+T2 — planner suppresses.
    mockChain.maybeSingle
      .mockResolvedValueOnce(mockFinishedCanonical())
      .mockResolvedValueOnce(mockAutopilotProject());

    (mockChain.order as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        data: [trackRow(T1, 'blog'), trackRow(T2, 'video')],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          canonicalPriorRun(),
          {
            id: 'sr-p1-existing',
            stage: 'production',
            status: 'queued',
            track_id: T1,
            publish_target_id: null,
            attempt_no: 1,
            outcome_json: null,
          },
          {
            id: 'sr-p2-existing',
            stage: 'production',
            status: 'running',
            track_id: T2,
            publish_target_id: null,
            attempt_no: 1,
            outcome_json: null,
          },
        ],
        error: null,
      });

    await advanceAfter(CANON_ID);

    expect(mockChain.insert).not.toHaveBeenCalled();
    const requested = (inngestSendMock as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .filter((e) => e.name === 'pipeline/stage.requested');
    expect(requested).toHaveLength(0);
  });
});
