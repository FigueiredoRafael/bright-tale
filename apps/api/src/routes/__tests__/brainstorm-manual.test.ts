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
    expect(typeof metadata.prompt).toBe('string');
    expect((metadata.prompt as string).length).toBeGreaterThan(0);
    expect(typeof metadata.systemPrompt).toBe('string');
    expect(metadata.input).toBeDefined();
  });
});
