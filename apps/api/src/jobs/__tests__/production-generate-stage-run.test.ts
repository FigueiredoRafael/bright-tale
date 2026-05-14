/**
 * Slice 7 (#15) — production-generate writes stage_runs at terminal.
 *
 * Mirrors brainstorm/research stage-run writeback tests. When the event
 * carries a `stageRunId`, the worker updates the Stage Run (completed
 * with payload_ref → content_draft, or failed) and emits
 * `pipeline/stage.run.finished`.
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
  STAGE_COSTS: { production: 200 },
  generateWithFallback: vi.fn(async () => ({
    result: { core: { title: 'X' } },
    providerName: 'mock',
    model: 'mock',
    usage: {},
  })),
}));

vi.mock('../../lib/ai/promptLoader.js', () => ({
  loadAgentPrompt: vi.fn(async () => 'system'),
  loadAgentConfig: vi.fn(async () => ({ instructions: 'system', tools: [] })),
  resolveProviderOverride: vi.fn(() => ({ provider: 'openai', model: 'gpt-4' })),
}));

vi.mock('../../lib/ai/tools/index.js', () => ({
  resolveTools: vi.fn(() => []),
  buildToolExecutor: vi.fn(),
}));

vi.mock('../../lib/credits.js', () => ({
  checkCredits: vi.fn(async () => true),
  debitCredits: vi.fn(async () => undefined),
}));

vi.mock('../../lib/credit-settings.js', () => ({
  loadCreditSettings: vi.fn(async () => ({ costCanonicalCore: 50 })),
}));

vi.mock('../../lib/ai/loadIdeaContext.js', () => ({
  loadIdeaContext: vi.fn(async () => null),
}));

vi.mock('../../lib/personas.js', () => ({
  buildPersonaContext: vi.fn(() => null),
  buildPersonaVoice: vi.fn(() => null),
  buildLayeredPersonaContext: vi.fn(async () => null),
  loadPersonaForDraft: vi.fn(async () => null),
}));

vi.mock('../../lib/ai/usage-log.js', () => ({
  logUsage: vi.fn(async () => undefined),
}));

vi.mock('../../lib/ai/prompts/production.js', () => ({
  buildCanonicalCoreMessage: vi.fn(() => 'core message'),
  buildProduceMessage: vi.fn(() => 'produce message'),
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

let stageRunsUpdateMock: ReturnType<typeof vi.fn>;

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'content_drafts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { project_id: 'proj-1', type: 'blog' } }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({}) }),
        };
      }
      if (table === 'research_sessions' || table === 'channels' || table === 'brainstorm_drafts' || table === 'idea_archives') {
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
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null }),
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({}) }),
      };
    }),
  })),
}));

const STAGE_RUN_ID = 'sr-draft-1';
const DRAFT_ID = 'cd-1';

describe('production-generate stage_runs writeback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stageRunsUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it('on success: chains into production/produce with stageRunId (does not write Stage Run terminal itself)', async () => {
    const { productionGenerate } = await import('../production-generate.js');

    const event = {
      data: {
        draftId: DRAFT_ID,
        orgId: 'org-1',
        userId: 'user-1',
        type: 'blog' as const,
        modelTier: 'standard',
        stageRunId: STAGE_RUN_ID,
      },
      name: 'production/generate',
    };

    const step = {
      run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };

    await (productionGenerate as unknown as (args: unknown) => Promise<unknown>)({ event, step });

    // production-generate now chains into produce; the Stage Run terminal
    // is owned by production-produce (canonical-core is only half of Draft).
    const produceCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
      (c) => (c[0] as { name: string }).name === 'production/produce',
    );
    expect(produceCall).toBeDefined();
    expect((produceCall![0] as { data: { stageRunId: string; draftId: string } }).data.stageRunId).toBe(STAGE_RUN_ID);

    // No pipeline/stage.run.finished from this worker on success.
    const finishedCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
      (c) => (c[0] as { name: string }).name === 'pipeline/stage.run.finished',
    );
    expect(finishedCall).toBeUndefined();
  });

  it('phase=canonical: marks Stage Run completed with content_draft payloadRef and does NOT chain to produce', async () => {
    const { productionGenerate } = await import('../production-generate.js');

    const event = {
      data: {
        draftId: DRAFT_ID,
        orgId: 'org-1',
        userId: 'user-1',
        type: 'blog' as const,
        modelTier: 'standard',
        stageRunId: STAGE_RUN_ID,
        phase: 'canonical' as const,
      },
      name: 'production/generate',
    };

    const step = {
      run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };

    await (productionGenerate as unknown as (args: unknown) => Promise<unknown>)({ event, step });

    // Stage Run marked completed with payload_ref → content_draft
    expect(stageRunsUpdateMock).toHaveBeenCalled();
    const completedCall = stageRunsUpdateMock.mock.calls.find(
      (c: unknown[]) => (c[0] as { status?: string }).status === 'completed',
    );
    expect(completedCall).toBeDefined();
    expect((completedCall![0] as { payload_ref: { kind: string; id: string } }).payload_ref).toEqual({
      kind: 'content_draft',
      id: DRAFT_ID,
    });

    // No chain into produce
    const produceCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
      (c) => (c[0] as { name: string }).name === 'production/produce',
    );
    expect(produceCall).toBeUndefined();

    // Advance event emitted by markCompleted
    const finishedCall = (inngestSendMock.mock.calls as unknown as unknown[][]).find(
      (c) => (c[0] as { name: string }).name === 'pipeline/stage.run.finished',
    );
    expect(finishedCall).toBeDefined();
  });

  it('on failure: updates stage_runs to failed and emits pipeline/stage.run.finished', async () => {
    const router = await import('../../lib/ai/router.js');
    vi.mocked(router.generateWithFallback).mockRejectedValueOnce(new Error('boom'));

    const { productionGenerate } = await import('../production-generate.js');

    const event = {
      data: {
        draftId: DRAFT_ID,
        orgId: 'org-1',
        userId: 'user-1',
        type: 'blog' as const,
        modelTier: 'standard',
        stageRunId: STAGE_RUN_ID,
      },
      name: 'production/generate',
    };

    const step = {
      run: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };

    await expect(
      (productionGenerate as unknown as (args: unknown) => Promise<unknown>)({ event, step }),
    ).rejects.toThrow(/boom/);

    expect(stageRunsUpdateMock).toHaveBeenCalled();
    const updateRow = stageRunsUpdateMock.mock.calls[0][0];
    expect(updateRow.status).toBe('failed');
    expect(updateRow.error_message).toContain('boom');
  });
});
