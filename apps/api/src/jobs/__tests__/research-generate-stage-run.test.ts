/**
 * Slice 6 (#14) — research-generate writes stage_runs at terminal.
 *
 * Mirrors brainstorm-generate-stage-run.test.ts. When the event carries
 * a `stageRunId`, the worker updates the Stage Run (completed with
 * payload_ref → research_session, or failed with error_message) and
 * emits `pipeline/stage.run.finished`.
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
  STAGE_COSTS: { research: 100 },
  LEVEL_COSTS: { surface: 50, medium: 100, deep: 200 },
  generateWithFallback: vi.fn(async () => ({
    result: {
      sources: [{ source_id: 's1', title: 'A study', url: 'https://x', credibility: 'high' }],
      statistics: [],
      expert_quotes: [],
      counterarguments: [],
    },
    providerName: 'mock',
    model: 'mock',
    usage: {},
  })),
}));

vi.mock('../../lib/ai/promptLoader.js', () => ({
  loadAgentPrompt: vi.fn(async () => 'You are BC_RESEARCH.'),
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

vi.mock('../../lib/ai/prompts/research.js', () => ({
  buildResearchMessage: vi.fn(() => 'test message'),
}));

vi.mock('../../lib/ai/abortable.js', () => ({
  JobAborted: class JobAborted extends Error {
    constructor(projectId: string) {
      super(`Job aborted for project ${projectId}`);
      this.name = 'JobAborted';
    }
  },
  assertNotAborted: vi.fn(async () => undefined),
  sleepCancellable: vi.fn(),
}));

vi.mock('../emitter.js', () => ({
  emitJobEvent: vi.fn(async () => undefined),
}));

let stageRunsUpdateMock: ReturnType<typeof vi.fn>;

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'research_sessions') {
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
      if (table === 'stage_runs') {
        return { update: stageRunsUpdateMock };
      }
      return {};
    }),
  })),
}));

const STAGE_RUN_ID = 'sr-rs-1';
const SESSION_ID = 'rs-sess-1';

describe('research-generate stage_runs writeback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stageRunsUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it('on success: updates stage_runs to completed with payload_ref → research_session and emits pipeline/stage.run.finished', async () => {
    const { researchGenerate } = await import('../research-generate.js');

    const event = {
      data: {
        sessionId: SESSION_ID,
        orgId: 'org-1',
        userId: 'user-1',
        channelId: null,
        ideaId: null,
        level: 'medium',
        inputJson: { topic: 'AI pricing' },
        modelTier: 'standard',
        stageRunId: STAGE_RUN_ID,
      },
      name: 'research/generate',
    };

    const step = {
      run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };

    await (researchGenerate as unknown as (args: unknown) => Promise<unknown>)({ event, step });

    expect(stageRunsUpdateMock).toHaveBeenCalled();
    const updateRow = stageRunsUpdateMock.mock.calls[0][0];
    expect(updateRow.status).toBe('completed');
    expect(updateRow.payload_ref).toEqual({ kind: 'research_session', id: SESSION_ID });
    expect(updateRow.finished_at).toBeTruthy();

    const finishedCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
      (c) => (c[0] as { name: string }).name === 'pipeline/stage.run.finished',
    );
    expect(finishedCall).toBeDefined();
    expect((finishedCall![0] as { data: { stageRunId: string } }).data.stageRunId).toBe(STAGE_RUN_ID);
  });

  it('on failure: updates stage_runs to failed and emits pipeline/stage.run.finished', async () => {
    const router = await import('../../lib/ai/router.js');
    vi.mocked(router.generateWithFallback).mockRejectedValueOnce(new Error('upstream timeout'));

    const { researchGenerate } = await import('../research-generate.js');

    const event = {
      data: {
        sessionId: SESSION_ID,
        orgId: 'org-1',
        userId: 'user-1',
        channelId: null,
        ideaId: null,
        level: 'medium',
        inputJson: { topic: 'x' },
        modelTier: 'standard',
        stageRunId: STAGE_RUN_ID,
      },
      name: 'research/generate',
    };

    const step = {
      run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };

    await expect(
      (researchGenerate as unknown as (args: unknown) => Promise<unknown>)({ event, step }),
    ).rejects.toThrow(/upstream timeout/);

    expect(stageRunsUpdateMock).toHaveBeenCalled();
    const updateRow = stageRunsUpdateMock.mock.calls[0][0];
    expect(updateRow.status).toBe('failed');
    expect(updateRow.error_message).toContain('upstream timeout');

    const finishedCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
      (c) => (c[0] as { name: string }).name === 'pipeline/stage.run.finished',
    );
    expect(finishedCall).toBeDefined();
  });
});
