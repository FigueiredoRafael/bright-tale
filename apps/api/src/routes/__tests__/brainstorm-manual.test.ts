/**
 * Integration tests for the manual Brainstorm provider.
 *
 * These exercise POST /sessions with provider='manual' and the new
 * POST /sessions/:id/manual-output endpoint. Supabase calls are mocked; the
 * goal is route shape + Axiom emission + Inngest-skip verification.
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

// Supabase mock: minimal chainable stub.
const insertedSessions: Record<string, unknown>[] = [];
const insertedIdeas: Record<string, unknown>[] = [];
let nextSession: Record<string, unknown> = { id: 'session-1', status: 'awaiting_manual' };
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
          select: () => ({ count: 0 }),
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
  inngestSend.mockClear();
  emitJobEventMock.mockClear();

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

  it('persists project_id=null when projectId is omitted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/brainstorm/sessions',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        inputMode: 'blind',
        topic: 'no project',
        ideasRequested: 3,
        provider: 'manual',
      },
    });

    expect(res.statusCode).toBe(202);
    expect(insertedSessions[0].project_id).toBeNull();
  });
});
