/**
 * Integration tests for the manual Draft provider.
 *
 * These exercise POST /content-drafts/:id/canonical-core with provider='manual',
 * POST /content-drafts/:id/produce with provider='manual', and the new
 * POST /content-drafts/:id/manual-output endpoint. Supabase calls are mocked;
 * the goal is route shape + Axiom emission + Inngest-skip verification.
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
  loadAgentPrompt: async () => 'You are the BrightCurios production agent...',
}));

// Supabase mock: minimal chainable stub.
const insertedDrafts: Record<string, unknown>[] = [];
let nextDraft: Record<string, unknown> = {
  id: 'draft-1',
  status: 'draft',
  type: 'blog',
  title: 'Test Draft',
  channel_id: null,
  project_id: null,
  org_id: 'org-1',
  user_id: 'user-1',
  canonical_core_json: null,
  draft_json: null,
};
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
      if (table === 'content_drafts') {
        return {
          insert: (row: Record<string, unknown>) => {
            insertedDrafts.push(row);
            return {
              select: () => ({ single: async () => ({ data: nextDraft, error: null }) }),
            };
          },
          update: (updateData: Record<string, unknown>) => ({
            eq: (col: string, val: string) => {
              // Apply update to nextDraft
              Object.assign(nextDraft, updateData);
              return {
                select: () => ({
                  single: async () => ({ data: nextDraft, error: null }),
                }),
              };
            },
          }),
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: nextDraft, error: null }) }),
          }),
        };
      }
      if (table === 'channels') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      if (table === 'idea_archives') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      if (table === 'research_sessions') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      if (table === 'credit_settings') {
        return { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
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

// Mock channel context builder
vi.mock('../../lib/ai/channelContext.js', () => ({
  buildChannelContext: async () => '',
}));

// Mock idea context loader
vi.mock('../../lib/ai/loadIdeaContext.js', () => ({
  loadIdeaContext: async () => null,
}));

// ── Setup ───────────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeEach(async () => {
  axiomCalls.length = 0;
  insertedDrafts.length = 0;
  inngestSend.mockClear();
  emitJobEventMock.mockClear();

  const { contentDraftsRoutes } = await import('../content-drafts.js');
  app = Fastify();
  await app.register(contentDraftsRoutes, { prefix: '/api/content-drafts' });
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/content-drafts/:id/canonical-core — provider=manual', () => {
  it('creates a draft with status=awaiting_manual, emits Axiom, skips Inngest', async () => {
    nextDraft = {
      id: 'draft-1',
      status: 'awaiting_manual',
      type: 'blog',
      title: 'Test Blog',
      channel_id: null,
      project_id: null,
      org_id: 'org-1',
      user_id: 'user-1',
      canonical_core_json: null,
      draft_json: null,
      model_tier: 'standard',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/content-drafts/draft-1/canonical-core',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        provider: 'manual',
      },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.data.status).toBe('awaiting_manual');

    // Inngest NOT called (manual is synchronous)
    expect(inngestSend).not.toHaveBeenCalled();

    // Axiom received the manual.awaiting event with full prompt metadata
    const axiomEvent = axiomCalls.find((e) => e.action === 'manual.awaiting');
    expect(axiomEvent).toBeDefined();
    expect(axiomEvent!.provider).toBe('manual');
    expect(axiomEvent!.model).toBe('manual');
    expect(axiomEvent!.status).toBe('awaiting_manual');
    const metadata = axiomEvent!.metadata as Record<string, unknown>;
    expect(metadata.stage).toBe('draft.core');
    expect(metadata.draftId).toBe('draft-1');
    expect(typeof metadata.prompt).toBe('string');
    expect(metadata.prompt).toContain('BrightCurios production agent');
    expect(metadata.prompt).toContain('Test Blog');
  });
});

describe('POST /api/content-drafts/:id/produce — provider=manual', () => {
  it('creates a draft with status=awaiting_manual, emits Axiom, skips Inngest', async () => {
    nextDraft = {
      id: 'draft-1',
      status: 'awaiting_manual',
      type: 'blog',
      title: 'Test Blog',
      channel_id: null,
      project_id: null,
      org_id: 'org-1',
      user_id: 'user-1',
      canonical_core_json: { thesis: 'test thesis' },
      draft_json: null,
      model_tier: 'standard',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/content-drafts/draft-1/produce',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        provider: 'manual',
      },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.data.status).toBe('awaiting_manual');

    // Inngest NOT called (manual is synchronous)
    expect(inngestSend).not.toHaveBeenCalled();

    // Axiom received the manual.awaiting event with full prompt metadata
    const axiomEvent = axiomCalls.find((e) => e.action === 'manual.awaiting');
    expect(axiomEvent).toBeDefined();
    expect(axiomEvent!.provider).toBe('manual');
    expect(axiomEvent!.model).toBe('manual');
    expect(axiomEvent!.status).toBe('awaiting_manual');
    const metadata = axiomEvent!.metadata as Record<string, unknown>;
    expect(metadata.stage).toBe('draft.blog');
    expect(metadata.draftId).toBe('draft-1');
    expect(typeof metadata.prompt).toBe('string');
    expect(metadata.prompt).toContain('BrightCurios production agent');
  });
});

describe('POST /api/content-drafts/:id/manual-output', () => {
  it('persists canonical core, flips status to draft, emits Axiom manual.completed for core phase', async () => {
    nextDraft = {
      id: 'draft-1',
      status: 'awaiting_manual',
      type: 'blog',
      title: 'Test Blog',
      channel_id: null,
      project_id: null,
      org_id: 'org-1',
      user_id: 'user-1',
      canonical_core_json: null,
      draft_json: null,
    };

    const coreOutput = {
      thesis: 'The power of daily habits compounds over time',
      argument_chain: ['habit formation', 'consistency', 'compounding effect'],
      emotional_arc: { opening: 'curiosity', climax: 'realization', resolution: 'inspiration' },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/content-drafts/draft-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        phase: 'core',
        output: coreOutput,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.canonical_core_json).toEqual(coreOutput);

    const completedEvent = axiomCalls.find((e) => e.action === 'manual.completed');
    expect(completedEvent).toBeDefined();
    expect(completedEvent!.status).toBe('success');
    expect((completedEvent!.metadata as Record<string, unknown>).stage).toBe('draft.core');
  });

  it('persists draft json, flips status to draft, emits Axiom manual.completed for typed phase', async () => {
    nextDraft = {
      id: 'draft-1',
      status: 'awaiting_manual',
      type: 'blog',
      title: 'Test Blog',
      channel_id: null,
      project_id: null,
      org_id: 'org-1',
      user_id: 'user-1',
      canonical_core_json: { thesis: 'test' },
      draft_json: null,
    };

    const blogOutput = {
      headline: 'How Daily Habits Compound into Life-Changing Results',
      introduction: 'Have you ever wondered...',
      body_sections: [{ heading: 'Section 1', content: 'Content here' }],
      conclusion: 'In conclusion...',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/content-drafts/draft-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        phase: 'blog',
        output: blogOutput,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.draft_json).toEqual(blogOutput);

    const completedEvent = axiomCalls.find((e) => e.action === 'manual.completed');
    expect(completedEvent).toBeDefined();
    expect(completedEvent!.status).toBe('success');
    expect((completedEvent!.metadata as Record<string, unknown>).stage).toBe('draft.blog');
  });

  it('returns 409 when the draft is not awaiting_manual', async () => {
    nextDraft = {
      id: 'draft-1',
      status: 'draft',
      type: 'blog',
      title: 'Test Blog',
      channel_id: null,
      project_id: null,
      org_id: 'org-1',
      user_id: 'user-1',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/content-drafts/draft-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        phase: 'core',
        output: { thesis: 'test' },
      },
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 400 when output is missing', async () => {
    nextDraft = {
      id: 'draft-1',
      status: 'awaiting_manual',
      type: 'blog',
      title: 'Test Blog',
      channel_id: null,
      project_id: null,
      org_id: 'org-1',
      user_id: 'user-1',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/content-drafts/draft-1/manual-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        phase: 'core',
      },
    });

    expect(res.statusCode).toBe(400);
  });
});
