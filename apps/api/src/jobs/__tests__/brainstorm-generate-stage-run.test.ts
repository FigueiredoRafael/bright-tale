/**
 * Slice 3 (#11) — brainstorm-generate writes stage_runs at terminal.
 *
 * When the event carries a `stageRunId`, the job must:
 *   - On success: update stage_runs (status='completed', payload_ref → first
 *     brainstorm_draft) and emit `pipeline/stage.run.finished`.
 *   - On failure: update stage_runs (status='failed', error_message) and
 *     emit `pipeline/stage.run.finished`.
 *
 * No legacy behaviour changes when stageRunId is absent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const inngestSendMock = vi.fn(async () => ({ ids: ['evt-1'] }));
vi.mock('../client.js', () => ({
  inngest: {
    createFunction: (_config: unknown, handler: unknown) => handler,
    send: inngestSendMock,
  },
}));

vi.mock('../../lib/ai/router.js', () => ({
  STAGE_COSTS: { brainstorm: 50 },
  generateWithFallback: vi.fn(async () => ({
    result: [
      {
        idea_id: '1',
        title: 'Idea A',
        angle: 'A',
        target_audience: 'devs',
        verdict: 'viable',
      },
    ],
    providerName: 'mock',
    model: 'mock',
    usage: {},
  })),
}));

vi.mock('../../lib/ai/promptLoader.js', () => ({
  loadAgentConfig: vi.fn(async () => ({ instructions: 'system', tools: [] })),
  resolveProviderOverride: vi.fn(() => ({ provider: 'openai', model: 'gpt-4' })),
}));

vi.mock('../../lib/ai/tools/index.js', () => ({
  resolveTools: vi.fn(() => []),
  buildToolExecutor: vi.fn(),
}));

vi.mock('../../lib/credits.js', () => ({
  debitCredits: vi.fn(async () => undefined),
}));

vi.mock('../../lib/ai/usage-log.js', () => ({
  logUsage: vi.fn(),
}));

vi.mock('../../lib/ai/prompts/brainstorm.js', () => ({
  buildBrainstormMessage: vi.fn(() => 'test message'),
}));

vi.mock('../../lib/ai/abortable.js', () => ({
  JobAborted: class JobAborted extends Error {
    constructor(projectId: string) {
      super(`Job aborted for project ${projectId}`);
      this.name = 'JobAborted';
    }
  },
  assertNotAborted: vi.fn(async () => undefined),
}));

vi.mock('../emitter.js', () => ({
  emitJobEvent: vi.fn(async () => undefined),
}));

// Track stage_runs.update calls cross-test.
let stageRunsUpdateMock: ReturnType<typeof vi.fn>;

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'brainstorm_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { project_id: 'proj-1' } }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({}) }),
        };
      }
      if (table === 'channels') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null }),
            }),
          }),
        };
      }
      if (table === 'brainstorm_drafts') {
        return {
          delete: () => ({ eq: () => Promise.resolve({}) }),
          insert: () => Promise.resolve({ error: null }),
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: { id: 'bd-1' } }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'stage_runs') {
        return {
          update: stageRunsUpdateMock,
        };
      }
      return {};
    }),
  })),
}));

const STAGE_RUN_ID = 'sr-bs-1';

describe('brainstorm-generate stage_runs writeback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stageRunsUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it('on success: updates stage_runs to completed with payload_ref and emits pipeline/stage.run.finished', async () => {
    const { brainstormGenerate } = await import('../brainstorm-generate.js');

    const event = {
      data: {
        sessionId: 'sess-1',
        orgId: 'org-1',
        userId: 'user-1',
        channelId: null,
        inputMode: 'fine_tuned',
        inputJson: { topic: 'x' },
        modelTier: 'standard',
        targetCount: 1,
        stageRunId: STAGE_RUN_ID,
      },
      name: 'brainstorm/generate',
    };

    const step = {
      run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };

    await (brainstormGenerate as unknown as (args: unknown) => Promise<unknown>)({ event, step });

    expect(stageRunsUpdateMock).toHaveBeenCalled();
    const updateRow = stageRunsUpdateMock.mock.calls[0][0];
    expect(updateRow.status).toBe('completed');
    expect(updateRow.payload_ref).toEqual({ kind: 'brainstorm_draft', id: 'bd-1' });
    expect(updateRow.finished_at).toBeTruthy();

    const finishedCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
      (c) => (c[0] as { name: string }).name === 'pipeline/stage.run.finished',
    );
    expect(finishedCall).toBeDefined();
    expect((finishedCall![0] as { data: { stageRunId: string } }).data.stageRunId).toBe(STAGE_RUN_ID);
  });

  it('on failure: updates stage_runs to failed and emits pipeline/stage.run.finished', async () => {
    // Force the AI router to throw to enter the catch path.
    const router = await import('../../lib/ai/router.js');
    vi.mocked(router.generateWithFallback).mockRejectedValueOnce(new Error('provider down'));

    const { brainstormGenerate } = await import('../brainstorm-generate.js');

    const event = {
      data: {
        sessionId: 'sess-1',
        orgId: 'org-1',
        userId: 'user-1',
        channelId: null,
        inputMode: 'fine_tuned',
        inputJson: { topic: 'x' },
        modelTier: 'standard',
        stageRunId: STAGE_RUN_ID,
      },
      name: 'brainstorm/generate',
    };

    const step = {
      run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };

    await expect(
      (brainstormGenerate as unknown as (args: unknown) => Promise<unknown>)({ event, step }),
    ).rejects.toThrow(/provider down/);

    expect(stageRunsUpdateMock).toHaveBeenCalled();
    const updateRow = stageRunsUpdateMock.mock.calls[0][0];
    expect(updateRow.status).toBe('failed');
    expect(updateRow.error_message).toContain('provider down');
    expect(updateRow.finished_at).toBeTruthy();

    const finishedCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
      (c) => (c[0] as { name: string }).name === 'pipeline/stage.run.finished',
    );
    expect(finishedCall).toBeDefined();
  });
});
