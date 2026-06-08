/**
 * Integration tests for the manual Brainstorm provider.
 *
 * These exercise POST /sessions with provider='manual' and the new
 * POST /sessions/:id/manual-output endpoint. Supabase calls are mocked; the
 * goal is route shape + Axiom emission + Inngest-skip verification.
 *
 * BRI-156 (D24a): also asserts stage_run reconciliation on
 * POST /sessions/:id/regenerate (ensureStageRunId + markCompleted/markFailed).
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
  loadAgentPrompt: async () => 'You are the BrightCurios brainstorm agent...',
}));

// generateWithFallback mock: controlled via shouldRegenFail flag
let shouldRegenFail = false;
vi.mock('../../lib/ai/router.js', () => ({
  generateWithFallback: async () => {
    if (shouldRegenFail) throw new Error('AI provider error');
    return {
      result: {
        ideas: [
          { title: 'Regen idea', core_tension: 'x', target_audience: 'y', verdict: 'viable' },
        ],
        recommendation: { pick: 'Regen idea', rationale: 'strong' },
      },
    };
  },
  STAGE_COSTS: { brainstorm: 2 },
}));

// Supabase mock: minimal chainable stub.
const insertedSessions: Record<string, unknown>[] = [];
const insertedIdeas: Record<string, unknown>[] = [];
const insertedProjects: Record<string, unknown>[] = [];
const stageRunUpdates: Array<{ patch: Record<string, unknown>; id: string }> = [];
const stageRunInserts: Record<string, unknown>[] = [];
let nextSession: Record<string, unknown> = { id: 'session-1', status: 'awaiting_manual' };
// nextStageRun: null → no existing run; set to simulate existing.
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
      if (table === 'brainstorm_sessions') {
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
      if (table === 'idea_archives') {
        return {
          upsert: async (rows: Record<string, unknown>[]) => {
            insertedIdeas.push(...rows);
            return { error: null };
          },
          // Two callers: the existing count probe used to build idea_id
          // sequence (returns `count`), and the post-upsert re-query that
          // fetches the persisted rows (returns array via order()).
          select: (cols?: string) => {
            if (cols && cols.includes('id,')) {
              return {
                eq: () => ({
                  order: async () => ({
                    data: insertedIdeas.map((r, i) => ({
                      id: `archive-${i + 1}`,
                      idea_id: r.idea_id,
                      title: r.title,
                      core_tension: r.core_tension,
                      target_audience: r.target_audience,
                      verdict: r.verdict,
                      discovery_data: r.discovery_data,
                    })),
                    error: null,
                  }),
                }),
              };
            }
            return { count: 0 };
          },
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
  insertedIdeas.length = 0;
  insertedProjects.length = 0;
  stageRunUpdates.length = 0;
  stageRunInserts.length = 0;
  inngestSend.mockClear();
  emitJobEventMock.mockClear();
  shouldRegenFail = false;
  nextStageRun = null;

  const { brainstormRoutes } = await import('../brainstorm.js');
  app = Fastify();
  await app.register(brainstormRoutes, { prefix: '/api/brainstorm' });
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/brainstorm/sessions — provider=manual', () => {
  it('creates a session with status=awaiting_manual, emits Axiom, skips Inngest', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        channelId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        inputMode: 'blind',
        topic: 'espresso extraction',
        ideasRequested: 3,
        provider: 'manual',
      },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.data.status).toBe('awaiting_manual');
    expect(body.data.sessionId).toBe('session-1');

    // Session row persisted with awaiting_manual status
    expect(insertedSessions[0].status).toBe('awaiting_manual');

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
    // Single combined prompt (system + user) so the operator can paste ONE
    // block into an external AI tool.
    expect(typeof metadata.prompt).toBe('string');
    expect(metadata.prompt).toContain('BrightCurios brainstorm agent');
    expect(metadata.prompt).toContain('espresso extraction');
    expect(metadata.systemPrompt).toBeUndefined();
    expect(metadata.input).toBeDefined();
  });
});

describe('POST /api/brainstorm/sessions/:id/manual-output', () => {
  it('persists ideas, flips status to completed, emits Axiom manual.completed', async () => {
    nextSession = { id: 'session-1', status: 'awaiting_manual', channel_id: null, project_id: null, org_id: 'org-1', user_id: 'user-1' };

    const pastedOutput = {
      recommendation: { pick: 'BC-IDEA-001', rationale: 'strong hook' },
      ideas: [
        {
          idea_id: 'BC-IDEA-001',
          title: 'Morning routines that compound',
          core_tension: 'discipline vs spontaneity',
          target_audience: 'early-career professionals',
          verdict: 'viable',
        },
        {
          title: 'The science of deep work',
          verdict: 'experimental',
        },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions/session-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: { output: pastedOutput },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.ideas).toHaveLength(2);

    expect(insertedIdeas).toHaveLength(2);
    expect(insertedIdeas[0].brainstorm_session_id).toBe('session-1');
    expect(insertedIdeas[0].title).toBe('Morning routines that compound');
    expect(insertedIdeas[1].title).toBe('The science of deep work');

    const completedEvent = axiomCalls.find((e) => e.action === 'manual.completed');
    expect(completedEvent).toBeDefined();
    expect(completedEvent!.status).toBe('success');
  });

  it('returns 409 when the session is already completed', async () => {
    nextSession = { id: 'session-1', status: 'completed', channel_id: null, project_id: null, org_id: 'org-1', user_id: 'user-1' };

    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions/session-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: { output: { ideas: [{ title: 'x' }] } },
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 400 when no ideas found in the pasted output', async () => {
    nextSession = { id: 'session-1', status: 'awaiting_manual', channel_id: null, project_id: null, org_id: 'org-1', user_id: 'user-1' };

    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions/session-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: { output: { random: 'blob' } },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error?.message).toMatch(/no ideas/i);
  });
});

describe('POST /api/brainstorm/sessions — project_id persistence', () => {
  it('persists project_id on the session row when provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        inputMode: 'blind',
        topic: 'side projects for engineers',
        ideasRequested: 3,
        projectId: 'proj-abc-123',
        provider: 'manual',
      },
    });

    expect(res.statusCode).toBe(202);
    // project_id must be written through to the INSERT row
    expect(insertedSessions[0].project_id).toBe('proj-abc-123');
  });

  it('auto-creates an ephemeral project and uses its id when channelId is provided without projectId', async () => {
    const channelId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        channelId,
        inputMode: 'blind',
        topic: 'standalone brainstorm',
        ideasRequested: 3,
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
    // A stage_run must have been created for the ephemeral project
    expect(stageRunInserts.length).toBeGreaterThan(0);
    expect(stageRunInserts[0].project_id).toBe('ephemeral-proj-1');
    // The stage_run must be marked awaiting_user (manual path)
    const awaitingUpdate = stageRunUpdates.find((u) => u.patch.status === 'awaiting_user');
    expect(awaitingUpdate).toBeDefined();
  });

  it('returns 400 when neither projectId nor channelId is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        inputMode: 'blind',
        topic: 'no project no channel',
        ideasRequested: 3,
        provider: 'manual',
      },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/brainstorm/sessions/:id/regenerate — stage_run reconciliation (BRI-156)', () => {
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
      input_mode: 'blind',
      input_json: { topic: 'coffee', ideasRequested: 3 },
      model_tier: 'standard',
    };
    nextStageRun = null; // no pre-existing stage_run → ensureStageRunId inserts one

    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions/session-1/regenerate',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
    });

    expect(res.statusCode).toBe(200);
    // ensureStageRunId must have inserted a new stage_run
    expect(stageRunInserts.length).toBeGreaterThan(0);
    const insertedRun = stageRunInserts[0];
    expect(insertedRun.stage).toBe('brainstorm');
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
      input_mode: 'blind',
      input_json: { topic: 'coffee', ideasRequested: 3 },
      model_tier: 'standard',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions/session-1/regenerate',
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
      input_mode: 'blind',
      input_json: { topic: 'coffee', ideasRequested: 3 },
      model_tier: 'standard',
    };
    nextStageRun = null;

    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions/session-1/regenerate',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
    });

    // Route throws → sendError → should return a non-2xx status
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    // markFailed must have updated the stage_run to failed
    const failedUpdate = stageRunUpdates.find((u) => u.patch.status === 'failed' && u.id === 'run-1');
    expect(failedUpdate).toBeDefined();
  });
});

describe('POST /api/brainstorm/sessions/:id/cancel — stage_run reconciliation (BRI-159)', () => {
  it('reconciles stage_run to aborted when session has project_id', async () => {
    nextSession = { id: 'session-1', status: 'running', user_id: 'user-1', project_id: 'proj-1' };
    nextStageRun = { id: 'run-1', status: 'running', attempt_no: 1 };

    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions/session-1/cancel',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
    });

    expect(res.statusCode).toBe(200);
    const abortedUpdate = stageRunUpdates.find((u) => u.patch.status === 'aborted' && u.id === 'run-1');
    expect(abortedUpdate).toBeDefined();
  });

  it('skips stage_run reconciliation on cancel when no project_id', async () => {
    nextSession = { id: 'session-1', status: 'running', user_id: 'user-1', project_id: null };

    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions/session-1/cancel',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
    });

    expect(res.statusCode).toBe(200);
    const abortedUpdates = stageRunUpdates.filter((u) => u.patch.status === 'aborted');
    expect(abortedUpdates).toHaveLength(0);
  });
});
