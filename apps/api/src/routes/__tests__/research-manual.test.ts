/**
 * Integration tests for the manual Research provider.
 *
 * These exercise POST / with provider='manual' and the new
 * POST /:id/manual-output endpoint. Supabase calls are mocked; the
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
  loadAgentPrompt: async () => 'You are the BrightCurios research agent...',
}));

// Supabase mock: minimal chainable stub.
const insertedSessions: Record<string, unknown>[] = [];
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

vi.mock('../../lib/credits.js', () => ({
  checkCredits: async () => ({ ok: true }),
  debitCredits: async () => ({ ok: true }),
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
  inngestSend.mockClear();
  emitJobEventMock.mockClear();

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
        level: 'medium',
        topic: 'espresso extraction',
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
    // Single combined prompt (system + user) so the operator can paste ONE block
    expect(typeof metadata.prompt).toBe('string');
    expect(metadata.prompt).toContain('BrightCurios research agent');
    expect(metadata.prompt).toContain('espresso extraction');
  });
});

describe('POST /api/research/:id/manual-output', () => {
  it('persists findings object, flips status to completed, emits Axiom manual.completed', async () => {
    nextSession = { id: 'session-1', status: 'awaiting_manual', channel_id: null, project_id: null, org_id: 'org-1', user_id: 'user-1' };

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

  it('persists findings when output has cards array (legacy)', async () => {
    nextSession = { id: 'session-1', status: 'awaiting_manual', channel_id: null, project_id: null, org_id: 'org-1', user_id: 'user-1' };

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
    nextSession = { id: 'session-1', status: 'completed', channel_id: null, project_id: null, org_id: 'org-1', user_id: 'user-1' };

    const res = await app.inject({
      method: 'POST',
      url: '/api/research/session-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: { output: { sources: [{ title: 'x' }] } },
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 400 when no research data found in the pasted output', async () => {
    nextSession = { id: 'session-1', status: 'awaiting_manual', channel_id: null, project_id: null, org_id: 'org-1', user_id: 'user-1' };

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
