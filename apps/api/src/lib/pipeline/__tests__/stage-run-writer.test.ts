/**
 * Stage Run Writer — unit tests.
 *
 * Pins the canonical seam for every write to stage_runs. If a future change
 * makes terminal transitions stop emitting `pipeline/stage.run.finished`,
 * or breaks the error_message truncation, or skips the started_at write on
 * running, these tests fail loudly.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Inngest mock ────────────────────────────────────────────────────────────

const { inngestSendMock } = vi.hoisted(() => ({
  inngestSendMock: vi.fn(async () => ({ ids: ['evt-1'] })),
}));
vi.mock('@/jobs/client', () => ({ inngest: { send: inngestSendMock } }));

// ─── Supabase chain mock ─────────────────────────────────────────────────────

interface UpdateChain {
  payload: Record<string, unknown> | null;
  filters: Array<{ method: string; args: unknown[] }>;
  /** Per-test error to return after the chain is awaited. */
  errorToReturn: unknown;
}

let lastChain: UpdateChain | null = null;

function makeUpdateChain(errorToReturn: unknown): Record<string, unknown> & PromiseLike<{ error: unknown }> {
  const chain = {} as Record<string, unknown> & PromiseLike<{ error: unknown }>;
  ['eq', 'in', 'select'].forEach((m) => {
    (chain as unknown as Record<string, ReturnType<typeof vi.fn>>)[m] = vi.fn((...args: unknown[]) => {
      lastChain?.filters.push({ method: m, args });
      return chain;
    });
  });
  (chain as { then: (resolve: (v: { error: unknown }) => unknown) => Promise<unknown> }).then = (
    resolve,
  ) => Promise.resolve({ error: errorToReturn }).then(resolve);
  return chain;
}

const sb = {
  from: vi.fn(() => ({
    update: vi.fn((payload: Record<string, unknown>) => {
      lastChain = { payload, filters: [], errorToReturn: null };
      return makeUpdateChain(lastChain.errorToReturn);
    }),
  })),
};

beforeEach(() => {
  vi.clearAllMocks();
  lastChain = null;
});

import {
  markRunning,
  markCompleted,
  markFailed,
  markAwaitingUser,
  markAborted,
  bulkAbort,
  isTerminal,
} from '@/lib/pipeline/stage-run-writer';

const PROJECT_ID = 'proj-1';

describe('markRunning', () => {
  it('writes status=running with started_at + updated_at and no advance event', async () => {
    await markRunning(sb, 'sr-1', { projectId: PROJECT_ID, stage: 'research' });

    expect(lastChain?.payload).toMatchObject({ status: 'running' });
    expect(lastChain?.payload?.started_at).toEqual(expect.any(String));
    expect(lastChain?.payload?.updated_at).toEqual(expect.any(String));
    expect(lastChain?.filters).toContainEqual({ method: 'eq', args: ['id', 'sr-1'] });
    // Non-terminal — no event
    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});

describe('markCompleted', () => {
  it('writes status=completed + finished_at and emits pipeline/stage.run.finished', async () => {
    await markCompleted(sb, 'sr-1', { projectId: PROJECT_ID, stage: 'research' });

    expect(lastChain?.payload).toMatchObject({ status: 'completed' });
    expect(lastChain?.payload?.finished_at).toEqual(expect.any(String));
    expect(inngestSendMock).toHaveBeenCalledTimes(1);
    expect(inngestSendMock).toHaveBeenCalledWith({
      name: 'pipeline/stage.run.finished',
      data: { stageRunId: 'sr-1', projectId: PROJECT_ID },
    });
  });

  it('writes payload_ref when provided', async () => {
    await markCompleted(sb, 'sr-1', {
      projectId: PROJECT_ID,
      stage: 'draft',
      payloadRef: { kind: 'content_draft', id: 'draft-99' },
    });

    expect(lastChain?.payload?.payload_ref).toEqual({
      kind: 'content_draft',
      id: 'draft-99',
    });
  });

  it('does NOT emit when suppressAdvanceEvent=true', async () => {
    await markCompleted(sb, 'sr-1', {
      projectId: PROJECT_ID,
      stage: 'review',
      suppressAdvanceEvent: true,
    });
    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});

describe('markFailed', () => {
  it('writes status=failed + truncated error_message and emits advance event', async () => {
    const long = 'x'.repeat(1000);
    await markFailed(sb, 'sr-1', {
      projectId: PROJECT_ID,
      stage: 'draft',
      errorMessage: long,
    });

    expect(lastChain?.payload?.status).toBe('failed');
    expect((lastChain?.payload?.error_message as string).length).toBe(500);
    expect(lastChain?.payload?.finished_at).toEqual(expect.any(String));
    expect(inngestSendMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT throw when the DB write itself fails (double-fault: original error is still load-bearing)', async () => {
    // Force the next write to return an error
    sb.from = vi.fn(() => ({
      update: vi.fn(() => {
        lastChain = { payload: { status: 'failed' }, filters: [], errorToReturn: null };
        return makeUpdateChain({ message: 'connection lost', code: '57P03' });
      }),
    }));
    await expect(
      markFailed(sb, 'sr-1', {
        projectId: PROJECT_ID,
        stage: 'draft',
        errorMessage: 'AI quota exceeded',
      }),
    ).resolves.toBeUndefined();
    // The event is NOT emitted on a double fault — caller logs already capture it
    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});

describe('markAwaitingUser', () => {
  it('writes status=awaiting_user + awaiting_reason and does NOT emit advance event', async () => {
    // Restore the default sb
    sb.from = vi.fn(() => ({
      update: vi.fn((payload: Record<string, unknown>) => {
        lastChain = { payload, filters: [], errorToReturn: null };
        return makeUpdateChain(null);
      }),
    }));

    await markAwaitingUser(sb, 'sr-1', {
      projectId: PROJECT_ID,
      stage: 'review',
      awaitingReason: 'manual_review',
    });

    expect(lastChain?.payload).toMatchObject({
      status: 'awaiting_user',
      awaiting_reason: 'manual_review',
    });
    // No finished_at — this is a pause, not a terminal state
    expect(lastChain?.payload?.finished_at).toBeUndefined();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});

describe('markAborted', () => {
  beforeEach(() => {
    // Restore default sb for these tests
    sb.from = vi.fn(() => ({
      update: vi.fn((payload: Record<string, unknown>) => {
        lastChain = { payload, filters: [], errorToReturn: null };
        return makeUpdateChain(null);
      }),
    }));
  });

  it('writes status=aborted + error_message + finished_at and emits advance event by default', async () => {
    await markAborted(sb, 'sr-1', {
      projectId: PROJECT_ID,
      stage: 'draft',
      errorMessage: 'User aborted via UI',
    });

    expect(lastChain?.payload).toMatchObject({
      status: 'aborted',
      error_message: 'User aborted via UI',
    });
    expect(lastChain?.payload?.finished_at).toEqual(expect.any(String));
    expect(inngestSendMock).toHaveBeenCalledTimes(1);
  });

  it('suppresses the advance event when suppressAdvanceEvent=true', async () => {
    await markAborted(sb, 'sr-1', {
      projectId: PROJECT_ID,
      stage: 'draft',
      errorMessage: 'Cascade re-run',
      suppressAdvanceEvent: true,
    });
    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});

describe('bulkAbort', () => {
  beforeEach(() => {
    sb.from = vi.fn(() => ({
      update: vi.fn((payload: Record<string, unknown>) => {
        lastChain = { payload, filters: [], errorToReturn: null };
        return makeUpdateChain(null);
      }),
    }));
  });

  it('updates aborted+message+timestamps and filters by project + affected stages + slot-owning statuses', async () => {
    await bulkAbort(
      sb,
      PROJECT_ID,
      ['draft', 'review', 'assets', 'preview', 'publish'],
      "Superseded by cascade re-run from 'draft'",
    );

    expect(lastChain?.payload).toMatchObject({
      status: 'aborted',
      error_message: "Superseded by cascade re-run from 'draft'",
    });
    const projectFilter = lastChain?.filters.find((f) => f.method === 'eq' && f.args[0] === 'project_id');
    expect(projectFilter?.args[1]).toBe(PROJECT_ID);
    const stageFilter = lastChain?.filters.find((f) => f.method === 'in' && f.args[0] === 'stage');
    expect(stageFilter?.args[1]).toEqual(['draft', 'review', 'assets', 'preview', 'publish']);
    const statusFilter = lastChain?.filters.find((f) => f.method === 'in' && f.args[0] === 'status');
    expect(statusFilter?.args[1]).toEqual([
      'queued', 'running', 'awaiting_user', 'completed', 'skipped',
    ]);
    // Bulk abort never emits per-row events
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it('throws on DB failure so the caller (route handler) can return CASCADE_FAILED', async () => {
    sb.from = vi.fn(() => ({
      update: vi.fn(() => {
        lastChain = { payload: {}, filters: [], errorToReturn: null };
        return makeUpdateChain({ message: 'boom' });
      }),
    }));
    await expect(
      bulkAbort(sb, PROJECT_ID, ['draft'], 'cascade'),
    ).rejects.toThrow(/bulkAbort/);
  });
});

describe('isTerminal', () => {
  it('marks completed/failed/aborted/skipped as terminal', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('aborted')).toBe(true);
    expect(isTerminal('skipped')).toBe(true);
  });
  it('marks queued/running/awaiting_user as non-terminal', () => {
    expect(isTerminal('queued')).toBe(false);
    expect(isTerminal('running')).toBe(false);
    expect(isTerminal('awaiting_user')).toBe(false);
  });
});
