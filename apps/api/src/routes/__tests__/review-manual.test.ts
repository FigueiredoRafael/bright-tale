/**
 * Integration tests for the manual Review provider.
 *
 * These exercise POST /content-drafts/:id/review with provider='manual'
 * and the new POST /content-drafts/:id/manual-review-output endpoint.
 * Supabase calls are mocked; the goal is route shape + Axiom emission +
 * Inngest-skip verification.
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

vi.mock('../../lib/ai/promptLoader.js', () => ({
  loadAgentPrompt: async () => 'You are the BrightCurios review agent...',
}));

// Supabase mock: minimal chainable stub.
let nextDraft: Record<string, unknown> = {
  id: 'draft-1',
  status: 'in_review',
  type: 'blog',
  title: 'Test Blog',
  channel_id: null,
  project_id: null,
  org_id: 'org-1',
  user_id: 'user-1',
  draft_json: { content: 'test content' },
  canonical_core_json: { thesis: 'test thesis' },
  review_feedback_json: null,
  review_score: null,
  review_verdict: 'pending',
  iteration_count: 0,
  model_tier: 'standard',
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
      if (table === 'review_iterations') {
        return {
          insert: async () => ({ error: null }),
        };
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
  inngestSend.mockClear();
  nextDraft = {
    id: 'draft-1',
    status: 'in_review',
    type: 'blog',
    title: 'Test Blog',
    channel_id: null,
    project_id: null,
    org_id: 'org-1',
    user_id: 'user-1',
    draft_json: { content: 'test content' },
    canonical_core_json: { thesis: 'test thesis' },
    review_feedback_json: null,
    review_score: null,
    review_verdict: 'pending',
    iteration_count: 0,
    model_tier: 'standard',
  };

  const { contentDraftsRoutes } = await import('../content-drafts.js');
  app = Fastify();
  await app.register(contentDraftsRoutes, { prefix: '/api/content-drafts' });
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/content-drafts/:id/review — provider=manual', () => {
  it('sets draft to awaiting_manual, emits Axiom manual.awaiting with stage=review, skips Inngest', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/content-drafts/draft-1/review',
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
    expect(metadata.stage).toBe('review');
    expect(metadata.draftId).toBe('draft-1');
    expect(typeof metadata.prompt).toBe('string');
    expect(metadata.prompt).toContain('BrightCurios review agent');
    expect(metadata.prompt).toContain('Test Blog');
  });
});

describe('POST /api/content-drafts/:id/manual-review-output', () => {
  it('persists review feedback, updates status and verdict, emits Axiom manual.completed', async () => {
    nextDraft = {
      id: 'draft-1',
      status: 'awaiting_manual',
      type: 'blog',
      title: 'Test Blog',
      channel_id: null,
      project_id: null,
      org_id: 'org-1',
      user_id: 'user-1',
      draft_json: { content: 'test content' },
      canonical_core_json: { thesis: 'test thesis' },
      review_feedback_json: null,
      review_score: null,
      review_verdict: 'pending',
      iteration_count: 0,
      model_tier: 'standard',
    };

    const reviewOutput = {
      overall_verdict: 'approved',
      blog_review: {
        score: 92,
        verdict: 'approved',
        feedback: 'Great content',
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/content-drafts/draft-1/manual-review-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: reviewOutput,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.review_feedback_json).toEqual(reviewOutput);
    expect(body.data.review_score).toBe(92);
    expect(body.data.review_verdict).toBe('approved');
    expect(body.data.status).toBe('approved');

    // Axiom received the manual.completed event with stage=review
    const axiomEvent = axiomCalls.find((e) => e.action === 'manual.completed');
    expect(axiomEvent).toBeDefined();
    expect(axiomEvent!.status).toBe('success');
    const metadata = axiomEvent!.metadata as Record<string, unknown>;
    expect(metadata.stage).toBe('review');
  });

  it('returns 409 when draft is not awaiting_manual', async () => {
    nextDraft = {
      id: 'draft-1',
      status: 'in_review',
      type: 'blog',
      title: 'Test Blog',
      channel_id: null,
      project_id: null,
      org_id: 'org-1',
      user_id: 'user-1',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/content-drafts/draft-1/manual-review-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        overall_verdict: 'approved',
        blog_review: { score: 90, verdict: 'approved' },
      },
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 400 when output missing required fields', async () => {
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
      url: '/api/content-drafts/draft-1/manual-review-output',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {
        // Missing required fields
        someOtherField: 'value',
      },
    });

    expect(res.statusCode).toBe(400);
  });
});
