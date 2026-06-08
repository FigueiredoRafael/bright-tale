/**
 * Integration tests for the manual Research provider.
 *
 * These exercise POST / with provider='manual' and the new
 * POST /:id/manual-output endpoint. Supabase calls are mocked; the
 * goal is route shape + Axiom emission + Inngest-skip verification.
 *
 * BRI-156 (D24a): also asserts stage_run reconciliation on manual-output,
 * PATCH /review, POST /import, POST /cancel, and POST /regenerate.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mocks ───────────────────────────────────────────────────────────────────

const inngestSend = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('../../jobs/client.js', () => ({
  inngest: { send: (...args: unknown[]) => inngestSend(...args) },
}));

const axiomCalls: Array<Record<string, unknown>> = [];
vi.mock('../../lib/axiom.js', () => ({
  logAiUsage: (e: Record<string, unknown>) => { axiomCalls.push(e); },
}));

const emitJobEventMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('../../jobs/emitter.js', () => ({
  emitJobEvent: (...args: unknown[]) => emitJobEventMock(...args),
}));

vi.mock('../../lib/ai/promptLoader.js', () => ({
  loadAgentPrompt: async () => 'You are the BrightCurios research agent...',
  loadAgentConfig: async () => ({
    instructions: 'You are the BrightCurios research agent...',
    tools: [],
  }),
  resolveProviderOverride: () => ({ provider: 'anthropic', model: 'claude-3-haiku-20240307' }),
}));

vi.mock('../../lib/ai/tools/index.js', () => ({
  resolveTools: () => [],
  buildToolExecutor: () => undefined,
}));

vi.mock('../../lib/signals/trends.js', () => ({
  fetchTrends: async () => null,
}));

// generateWithFallback mock: controlled via shouldRegenFail flag
let shouldRegenFail = false;
vi.mock('../../lib/ai/router.js', () => ({
  generateWithFallback: async () => {
    if (shouldRegenFail) throw new Error('AI provider error');
    return { result: { sources: [{ title: 'Regen result', url: 'http://x.com', type: 'source' }], research_summary: 'Regen summary' } };
  },
  LEVEL_COSTS: { surface: 1, medium: 2, deep: 3 },
}));

// Supabase mock: minimal chainable stub.
const insertedSessions: Record<string, unknown>[] = [];
const insertedProjects: Record<string, unknown>[] = [];
const stageRunUpdates: Array<{ patch: Record<string, unknown>; id: string }> = [];
const stageRunInserts: Record<string, unknown>[] = [];
let nextSession: Record<string, unknown> = { id: 'session-1', status: 'awaiting_manual' };
// nextStageRun: null means no existing run (ensureStageRunId will insert);
// set to { id: 'run-1', status: 'running', attempt_no: 1 } to simulate existing.
let nextStageRun: Record<string, unknown> | null = null;
const orgRow: Record<string, unknown> | null = { org_id: 'org-1' };

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({
    from(table: string) {
      if (table === 'org_memberships') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  single: async () => ({ data: orgRow, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'research_sessions') {
        return {
          insert: (row: Record<string, unknown>) => {
            insertedSessions.push(row);
            return {
              select: () => ({ single: async () => ({ data: nextSession, error: null }) }),
            };
          },
          update: (_row: Record<string, unknown>) => ({
            eq: async () => ({ data: null, error: null }),
          }),
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: nextSession, error: null }) }),
          }),
        };
      }
      if (table === 'stage_runs') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: nextStageRun, error: null }),
                  }),
                }),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            const inserted = { ...row, id: 'run-1' };
            stageRunInserts.push(inserted);
            return {
              select: () => ({ single: async () => ({ data: inserted, error: null }) }),
            };
          },
          update: (patch: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => {
              stageRunUpdates.push({ patch, id });
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      if (table === 'projects') {
        return {
          insert: (row: Record<string, unknown>) => {
            insertedProjects.push(row);
            const inserted = { ...row, id: 'ephemeral-proj-1' };
            return {
              select: () => ({
                single: async () => ({ data: inserted, error: null }),
              }),
            };
          },
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        };
      }
      if (table === 'channels') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      if (table === 'idea_archives') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      return {} as never;
    },
  }),
}));

vi.mock('../../lib/credits/reservations.js', () => ({
  reserve: async () => 'mock-token',
  commit: async () => undefined,
  release: async () => undefined,
}));

// Fake authenticate middleware — sets userId so handlers proceed.
vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: async (req: { userId: string }) => { req.userId = 'user-1'; },
}));

// ── Setup ───────────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeEach(async () => {
  axiomCalls.length = 0;
  insertedSessions.length = 0;
  insertedProjects.length = 0;
  stageRunUpdates.length = 0;
  stageRunInserts.length = 0;
  inngestSend.mockClear();
  emitJobEventMock.mockClear();
  nextStageRun = null;
  shouldRegenFail = false;

  const { researchSessionsRoutes } = await import('../research-sessions.js');
  app = Fastify();
  await app.register(researchSessionsRoutes, { prefix: '/api/research' });
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/research/ — provider=manual', () => {
  it('creates a session with status=awaiting_manual, emits Axiom, skips Inngest', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/research/',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        channelId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        level: 'medium',
        topic: 'espresso extraction',
        provider: 'manual',
      },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.data.status).toBe('awaiting_manual');
    expect(body.data.sessionId).toBe('session-1');

    // BRI-157: status column is no longer written — derived from stage_runs
    expect(insertedSessions[0].status).toBeUndefined();

    // Inngest NOT called (manual is synchronous)
    expect(inngestSend).not.toHaveBeenCalled();

    // Axiom received the manual.awaiting event with full prompt metadata
    const axiomEvent = axiomCalls.find((e) => e.action === 'manual.awaiting');
    expect(axiomEvent).toBeDefined();
    expect(axiomEvent!.provider).toBe('manual');
    expect(axiomEvent!.model).toBe('manual');
    expect(axiomEvent!.status).toBe('awaiting_manual');
    const metadata = axiomEvent!.metadata as Record<string, unknown>;
    expect(metadata.sessionId).toBe('session-1');
    // Single combined prompt (system + user) so the operator can paste ONE block
    expect(typeof metadata.prompt).toBe('string');
    expect(metadata.prompt).toContain('BrightCurios research agent');
    expect(metadata.prompt).toContain('espresso extraction');
  });
});

describe('POST /api/research/:id/manual-output', () => {
  it('persists findings object, flips status to completed, emits Axiom manual.completed', async () => {
    // BRI-158: status derived from stage_run (column dropped); an awaiting_manual run passes the guard.
    nextSession = { id: 'session-1', channel_id: null, project_id: 'proj-1', org_id: 'org-1', user_id: 'user-1' };
    nextStageRun = { id: 'run-1', status: 'awaiting_user', awaiting_reason: 'manual_paste', attempt_no: 1 };

    const pastedOutput = {
      sources: [
        {
          source_id: 'S1',
          title: 'Espresso Extraction Guide',
          url: 'https://example.com/espresso',
          author: 'Coffee Expert',
          type: 'source',
        },
        {
          source_id: 'S2',
          title: 'Pressure and Flow',
          url: 'https://example.com/pressure',
          author: 'Science Monthly',
          type: 'source',
        },
      ],
      research_summary: 'Comprehensive research on espresso extraction.',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/research/session-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: { output: pastedOutput },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.findings).toBeDefined();
    expect(body.data.findings.sources).toHaveLength(2);
    expect(body.data.findings.research_summary).toBe('Comprehensive research on espresso extraction.');

    const completedEvent = axiomCalls.find((e) => e.action === 'manual.completed');
    expect(completedEvent).toBeDefined();
    expect(completedEvent!.status).toBe('success');
    expect(completedEvent!.metadata).toHaveProperty('stage', 'research');
  });

  it('returns 409 for a legacy null-project session (no stage_run to derive status post-D24c)', async () => {
    // BRI-158: column dropped. A legacy session with no project_id has no status
    // source, so the guard derives 'pending' and rejects the manual paste.
    nextSession = { id: 'session-1', channel_id: null, project_id: null, org_id: 'org-1', user_id: 'user-1' };

    const res = await app.inject({
      method: 'POST',
      url: '/api/research/session-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        output: {
          sources: [{ title: 'Source A', url: 'http://a.com', type: 'source' }],
          research_summary: 'Summary',
        },
      },
    });

    expect(res.statusCode).toBe(409);
    // Handler rejects before any stage_run reconciliation.
    expect(stageRunInserts).toHaveLength(0);
  });

  it('reconciles stage_run to completed when project_id is set', async () => {
    nextSession = { id: 'session-1', status: 'awaiting_manual', channel_id: null, project_id: 'proj-1', org_id: 'org-1', user_id: 'user-1' };
    // BRI-157: guard reads status from stage_run. Set to awaiting_user/manual_paste
    // so sessionStatusFromStageRun maps to 'awaiting_manual', passing the guard.
    // ensureStageRunId finds a non-terminal row (awaiting_user) and updates it.
    nextStageRun = { id: 'run-1', status: 'awaiting_user', awaiting_reason: 'manual_paste', attempt_no: 1 };

    const res = await app.inject({
      method: 'POST',
      url: '/api/research/session-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        output: {
          sources: [{ title: 'Source A', url: 'http://a.com', type: 'source' }],
          research_summary: 'Summary',
        },
      },
    });

    expect(res.statusCode).toBe(200);
    // markCompleted updates the existing run to completed
    const completedUpdate = stageRunUpdates.find((u) => u.patch.status === 'completed' && u.id === 'run-1');
    expect(completedUpdate).toBeDefined();
  });

  it('persists findings when output has cards array (legacy)', async () => {
    nextSession = { id: 'session-1', channel_id: null, project_id: 'proj-1', org_id: 'org-1', user_id: 'user-1' };
    nextStageRun = { id: 'run-1', status: 'awaiting_user', awaiting_reason: 'manual_paste', attempt_no: 1 };

    const pastedOutput = {
      cards: [
        {
          title: 'Source 1',
          url: 'https://example.com/1',
          type: 'source',
        },
        {
          title: 'Stat 1',
          claim: '95% of users',
          type: 'statistic',
        },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/research/session-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: { output: pastedOutput },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.findings.sources).toHaveLength(1);
    expect(body.data.findings.statistics).toHaveLength(1);
  });

  it('returns 409 when the session is not awaiting_manual', async () => {
    // BRI-158: guard derives from stage_run; a completed run → not awaiting → 409.
    nextSession = { id: 'session-1', channel_id: null, project_id: 'proj-1', org_id: 'org-1', user_id: 'user-1' };
    nextStageRun = { id: 'run-1', status: 'completed', attempt_no: 1 };

    const res = await app.inject({
      method: 'POST',
      url: '/api/research/session-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: { output: { sources: [{ title: 'x' }] } },
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 400 when no research data found in the pasted output', async () => {
    nextSession = { id: 'session-1', channel_id: null, project_id: 'proj-1', org_id: 'org-1', user_id: 'user-1' };
    nextStageRun = { id: 'run-1', status: 'awaiting_user', awaiting_reason: 'manual_paste', attempt_no: 1 };

    const res = await app.inject({
      method: 'POST',
      url: '/api/research/session-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: { output: { random: 'blob' } },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error?.message).toMatch(/no research data/i);
  });
});

describe('PATCH /api/research/:id/review — stage_run reconciliation (BRI-156)', () => {
  it('reconciles stage_run to completed when session has project_id', async () => {
    // The review handler fetches the session first to get project_id
    nextSession = { id: 'session-1', status: 'reviewed', channel_id: null, project_id: 'proj-1', org_id: 'org-1', user_id: 'user-1' };
    nextStageRun = null; // no pre-existing run → ensureStageRunId inserts

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/research/session-1/review',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: { approvedCardsJson: [{ title: 'Card A', type: 'source' }] },
    });

    expect(res.statusCode).toBe(200);
    // stage_run should have been inserted (ensureStageRunId) and then updated to completed
    expect(stageRunInserts.length).toBeGreaterThan(0);
    const completedUpdate = stageRunUpdates.find((u) => u.patch.status === 'completed' && u.id === 'run-1');
    expect(completedUpdate).toBeDefined();
  });

  it('skips stage_run reconciliation when session has no project_id', async () => {
    nextSession = { id: 'session-1', status: 'reviewed', channel_id: null, project_id: null, org_id: 'org-1', user_id: 'user-1' };

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/research/session-1/review',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: { approvedCardsJson: [{ title: 'Card A', type: 'source' }] },
    });

    expect(res.statusCode).toBe(200);
    const stageRunWrites = stageRunUpdates.filter((u) => u.patch.status === 'completed');
    expect(stageRunWrites).toHaveLength(0);
    expect(stageRunInserts).toHaveLength(0);
  });
});

describe('POST /api/research/import — stage_run reconciliation (BRI-156)', () => {
  it('reconciles stage_run to completed when projectId is provided', async () => {
    nextSession = { id: 'session-1', status: 'completed', channel_id: null, project_id: 'proj-1', org_id: 'org-1', user_id: 'user-1' };
    nextStageRun = null;

    const res = await app.inject({
      method: 'POST',
      url: '/api/research/import',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        projectId: 'proj-1',
        level: 'medium',
        cardsJson: [{ title: 'Card A', type: 'source' }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(stageRunInserts.length).toBeGreaterThan(0);
    const completedUpdate = stageRunUpdates.find((u) => u.patch.status === 'completed' && u.id === 'run-1');
    expect(completedUpdate).toBeDefined();
  });

  it('skips stage_run reconciliation when no projectId is provided', async () => {
    nextSession = { id: 'session-1', status: 'completed', channel_id: null, project_id: null, org_id: 'org-1', user_id: 'user-1' };

    const res = await app.inject({
      method: 'POST',
      url: '/api/research/import',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        level: 'medium',
        cardsJson: [{ title: 'Card A', type: 'source' }],
      },
    });

    expect(res.statusCode).toBe(200);
    const stageRunWrites = stageRunUpdates.filter((u) => u.patch.status === 'completed');
    expect(stageRunWrites).toHaveLength(0);
    expect(stageRunInserts).toHaveLength(0);
  });
});

describe('POST /api/research/:id/cancel — stage_run reconciliation (BRI-156)', () => {
  it('reconciles stage_run to aborted when session has project_id', async () => {
    nextSession = { id: 'session-1', status: 'running', channel_id: null, project_id: 'proj-1', org_id: 'org-1', user_id: 'user-1' };
    // Simulate an existing running stage_run
    nextStageRun = { id: 'run-1', status: 'running', attempt_no: 1 };

    const res = await app.inject({
      method: 'POST',
      url: '/api/research/session-1/cancel',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
    });

    expect(res.statusCode).toBe(200);
    // markAborted should have updated the stage_run to aborted
    const abortedUpdate = stageRunUpdates.find((u) => u.patch.status === 'aborted' && u.id === 'run-1');
    expect(abortedUpdate).toBeDefined();
  });

  it('skips stage_run reconciliation on cancel when no project_id', async () => {
    nextSession = { id: 'session-1', status: 'running', channel_id: null, project_id: null, org_id: 'org-1', user_id: 'user-1' };

    const res = await app.inject({
      method: 'POST',
      url: '/api/research/session-1/cancel',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
    });

    expect(res.statusCode).toBe(200);
    const abortedUpdates = stageRunUpdates.filter((u) => u.patch.status === 'aborted');
    expect(abortedUpdates).toHaveLength(0);
  });
});

describe('POST /api/research/:id/regenerate — stage_run reconciliation (BRI-156)', () => {
  it('reconciles stage_run to completed on successful regeneration with project_id', async () => {
    // nextSession is the ORIGINAL session fetched for regen context,
    // and also the new inserted session returned from insert.
    nextSession = {
      id: 'session-2',
      status: 'running',
      channel_id: null,
      project_id: 'proj-1',
      org_id: 'org-1',
      user_id: 'user-1',
      level: 'medium',
      idea_id: null,
      focus_tags: [],
      input_json: { topic: 'espresso' },
      model_tier: 'standard',
    };
    nextStageRun = null; // no pre-existing stage_run → ensureStageRunId inserts one

    const res = await app.inject({
      method: 'POST',
      url: '/api/research/session-1/regenerate',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
    });

    expect(res.statusCode).toBe(200);
    // ensureStageRunId must have inserted a new stage_run
    expect(stageRunInserts.length).toBeGreaterThan(0);
    const insertedRun = stageRunInserts[0];
    expect(insertedRun.stage).toBe('research');
    expect(insertedRun.project_id).toBe('proj-1');
    // markCompleted must have updated it to completed
    const completedUpdate = stageRunUpdates.find((u) => u.patch.status === 'completed' && u.id === 'run-1');
    expect(completedUpdate).toBeDefined();
  });

  it('does NOT reconcile stage_run when project_id is null (standalone regen)', async () => {
    nextSession = {
      id: 'session-2',
      status: 'running',
      channel_id: null,
      project_id: null,
      org_id: 'org-1',
      user_id: 'user-1',
      level: 'medium',
      idea_id: null,
      focus_tags: [],
      input_json: { topic: 'espresso' },
      model_tier: 'standard',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/research/session-1/regenerate',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
    });

    expect(res.statusCode).toBe(200);
    // No stage_run insert/update should happen (no project context)
    expect(stageRunInserts).toHaveLength(0);
    const completedUpdates = stageRunUpdates.filter((u) => u.patch.status === 'completed');
    expect(completedUpdates).toHaveLength(0);
  });

  it('reconciles stage_run to failed on regeneration error with project_id', async () => {
    shouldRegenFail = true;
    nextSession = {
      id: 'session-2',
      status: 'running',
      channel_id: null,
      project_id: 'proj-1',
      org_id: 'org-1',
      user_id: 'user-1',
      level: 'medium',
      idea_id: null,
      focus_tags: [],
      input_json: { topic: 'espresso' },
      model_tier: 'standard',
    };
    nextStageRun = null;

    const res = await app.inject({
      method: 'POST',
      url: '/api/research/session-1/regenerate',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
    });

    // Route throws → sendError → should return a non-2xx status
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    // markFailed must have updated the stage_run to failed
    const failedUpdate = stageRunUpdates.find((u) => u.patch.status === 'failed' && u.id === 'run-1');
    expect(failedUpdate).toBeDefined();
  });
});

describe('POST /api/research/ — ephemeral project creation (BRI-159)', () => {
  it('auto-creates an ephemeral project and uses its id when channelId provided without projectId', async () => {
    const channelId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const res = await app.inject({
      method: 'POST',
      url: '/api/research/',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        channelId,
        level: 'medium',
        topic: 'standalone research topic',
        provider: 'manual',
      },
    });

    expect(res.statusCode).toBe(202);
    // An ephemeral project must have been inserted with is_standalone=true
    expect(insertedProjects).toHaveLength(1);
    expect(insertedProjects[0].is_standalone).toBe(true);
    expect(insertedProjects[0].channel_id).toBe(channelId);
    // The session must use the ephemeral project's id, not null
    expect(insertedSessions[0].project_id).toBe('ephemeral-proj-1');
    // A stage_run must have been created (ensureStageRunId)
    expect(stageRunInserts.length).toBeGreaterThan(0);
    expect(stageRunInserts[0].project_id).toBe('ephemeral-proj-1');
    // Stage run must be marked awaiting_user (manual path)
    const awaitingUpdate = stageRunUpdates.find((u) => u.patch.status === 'awaiting_user');
    expect(awaitingUpdate).toBeDefined();
  });

  it('returns 400 when neither projectId nor channelId is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/research/',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        level: 'medium',
        topic: 'no project no channel',
        provider: 'manual',
      },
    });

    expect(res.statusCode).toBe(400);
  });
});
