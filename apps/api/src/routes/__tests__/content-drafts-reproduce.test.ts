/**
 * Tests for POST /content-drafts/:id/reproduce
 *
 * Verifies the BRI-140 bug fix: the reproduce route now:
 *   1. Loads persona voice (via buildLayeredPersonaContext) and passes it to the prompt
 *   2. Runs full normalizeReviewFeedback (issues.critical objects, rubric_checks, rubric eval)
 *   3. Passes iterationCount (incremented) and priorAttempts to the prompt builder
 *
 * Previously the route used a shallow path: no persona, no normalization, no iteration memory.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mocks ────────────────────────────────────────────────────────────────────

const inngestSend = vi.fn(async () => undefined);
vi.mock('../../jobs/client.js', () => ({
  inngest: { send: inngestSend },
}));

vi.mock('../../lib/axiom.js', () => ({
  logAiUsage: vi.fn(),
}));

vi.mock('../../jobs/emitter.js', () => ({
  emitJobEvent: vi.fn(async () => undefined),
}));

vi.mock('../../lib/ai/promptLoader.js', () => ({
  loadAgentPrompt: async () => 'system-prompt-for-reproduce',
}));

const generateWithFallbackMock = vi.fn(async () => ({
  result: { full_draft: 'revised content' },
  providerName: 'openai',
  model: 'gpt-4',
  usage: {},
}));
vi.mock('../../lib/ai/router.js', () => ({
  generateWithFallback: generateWithFallbackMock,
}));

const buildReproduceMessageMock = vi.fn(() => 'reproduce-user-message');
vi.mock('../../lib/ai/prompts/production.js', () => ({
  buildCanonicalCoreMessage: vi.fn(() => 'canonical-user-message'),
  buildProduceMessage: vi.fn(() => 'produce-user-message'),
  buildReproduceMessage: buildReproduceMessageMock,
}));

const loadPriorReviewAttemptsMock = vi.fn(async () => [
  { attemptNo: 1, verdict: 'revision_required', score: 60, criticalIssues: ['hook is weak'] },
]);
vi.mock('../../lib/ai/loadPriorReviewAttempts.js', () => ({
  loadPriorReviewAttempts: loadPriorReviewAttemptsMock,
}));

vi.mock('../../lib/ai/channelContext.js', () => ({
  buildChannelContext: async () => '',
}));

vi.mock('../../lib/ai/loadIdeaContext.js', () => ({
  loadIdeaContext: async () => null,
}));

vi.mock('../../lib/credits/reservations.js', () => ({
  reserve: async () => 'mock-token',
  commit: async () => undefined,
  release: async () => undefined,
}));

vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: async (req: { userId: string }) => { req.userId = 'user-1'; },
}));

// Persona mock
const mockPersona = {
  id: 'persona-1',
  name: 'Alex Bright',
  bioShort: 'Tech educator',
  archetypeSlug: null,
  domainLens: 'technology',
  eeatSignalsJson: { analyticalLens: 'critical analysis' },
  soulJson: { strongOpinions: [], humorStyle: 'dry', recurringJokes: [], languageGuardrails: [] },
  writingVoiceJson: {
    writingStyle: 'conversational',
    signaturePhrases: ['Let me show you'],
    characteristicOpinions: [],
  },
  approvedCategories: [],
};
const mockLayeredPersona = {
  context: { name: 'Alex Bright', domainLens: 'technology', analyticalLens: 'critical analysis', strongOpinions: [], approvedCategories: [] },
  voice: {
    name: 'Alex Bright',
    bioShort: 'Tech educator',
    writingVoice: { writingStyle: 'conversational', signaturePhrases: ['Let me show you'], characteristicOpinions: [] },
    soul: { humorStyle: 'dry', recurringJokes: [], languageGuardrails: [] },
  },
  constraints: ['No profanity'],
};

vi.mock('../../lib/personas.js', () => ({
  loadPersonaForDraft: vi.fn(async () => mockPersona),
  buildLayeredPersonaContext: vi.fn(async () => mockLayeredPersona),
  buildPersonaContext: vi.fn(() => mockLayeredPersona.context),
  buildPersonaVoice: vi.fn(() => mockLayeredPersona.voice),
}));

// Supabase mock
let draftRow: Record<string, unknown>;

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: () => ({
    from(table: string) {
      if (table === 'org_memberships') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  single: async () => ({ data: { org_id: 'org-1' }, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'content_drafts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: draftRow, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { ...draftRow, draft_json: { full_draft: 'revised content' } }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'channels') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      if (table === 'platform_settings') {
        return { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
      }
      if (table === 'stage_run_review_attempts') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  then: (fn: (v: { data: unknown[]; error: null }) => unknown) => fn({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

// ── Setup ────────────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  buildReproduceMessageMock.mockReturnValue('reproduce-user-message');

  draftRow = {
    id: 'draft-1',
    type: 'blog',
    title: 'Test Blog',
    status: 'draft',
    user_id: 'user-1',
    org_id: 'org-1',
    channel_id: null,
    project_id: null,
    persona_id: 'persona-1',
    canonical_core_json: { thesis: 'core-thesis' },
    draft_json: { full_draft: 'old content' },
    review_feedback_json: {
      blog_review: {
        verdict: 'revision_required',
        issues: {
          critical: [
            { issue: 'Hook is weak', location: 'Introduction', suggested_fix: 'Add a hook' },
          ],
          minor: [],
        },
        strengths: ['Good structure'],
        rubric_checks: {
          critical_issues: [],
          minor_issues: [],
          strengths: [],
        },
      },
    },
    review_score: 65,
    iteration_count: 1,
    model_tier: 'standard',
    idea_id: null,
    research_session_id: null,
  };

  const { contentDraftsRoutes } = await import('../content-drafts.js');
  app = Fastify();
  await app.register(contentDraftsRoutes, { prefix: '/api/content-drafts' });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/content-drafts/:id/reproduce — BRI-140 bug fix', () => {
  it('calls buildReproduceMessage with persona voice (layered persona)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/content-drafts/draft-1/reproduce',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {},
    });

    expect(res.statusCode).toBe(200);

    // buildReproduceMessage must have been called with persona voice
    expect(buildReproduceMessageMock).toHaveBeenCalledTimes(1);
    const reproduceArg = ((buildReproduceMessageMock.mock.calls as unknown as unknown[][])[0] as unknown[])[0] as Record<string, unknown>;
    expect(reproduceArg.persona).toBeDefined();
    expect((reproduceArg.persona as Record<string, unknown>).name).toBe('Alex Bright');
  });

  it('passes normalized review feedback (critical issue objects → formatted strings)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/content-drafts/draft-1/reproduce',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {},
    });

    expect(res.statusCode).toBe(200);

    const reproduceArg = ((buildReproduceMessageMock.mock.calls as unknown as unknown[][])[0] as unknown[])[0] as Record<string, unknown>;
    const feedback = reproduceArg.reviewFeedback as Record<string, unknown>;
    expect(feedback).toBeDefined();
    // The raw critical issue was an object { issue, location, suggested_fix }
    // normalizeReviewFeedback converts it to a formatted string containing all three parts
    const criticalIssues = feedback.critical_issues as string[];
    expect(criticalIssues).toBeInstanceOf(Array);
    expect(criticalIssues.length).toBeGreaterThan(0);
    // Find the formatted string that came from the raw object (may not be first due to rubric criticals)
    const hookIssue = criticalIssues.find((s) => s.includes('Hook is weak'));
    expect(hookIssue).toBeDefined();
    expect(hookIssue).toContain('Introduction');
    expect(hookIssue).toContain('Add a hook');
  });

  it('passes iterationCount (incremented from draft.iteration_count)', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/content-drafts/draft-1/reproduce',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {},
    });

    const reproduceArg = ((buildReproduceMessageMock.mock.calls as unknown as unknown[][])[0] as unknown[])[0] as Record<string, unknown>;
    // draft.iteration_count = 1, so iterationCount should be 2
    expect(reproduceArg.iterationCount).toBe(2);
  });

  it('passes priorAttempts from loadPriorReviewAttempts (skipLatest=true)', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/content-drafts/draft-1/reproduce',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {},
    });

    // loadPriorReviewAttempts should have been called
    expect(loadPriorReviewAttemptsMock).toHaveBeenCalledWith(
      expect.anything(),
      'draft-1',
      'blog',
      { skipLatest: true },
    );

    const reproduceArg = ((buildReproduceMessageMock.mock.calls as unknown as unknown[][])[0] as unknown[])[0] as Record<string, unknown>;
    expect(Array.isArray(reproduceArg.priorAttempts)).toBe(true);
    expect((reproduceArg.priorAttempts as unknown[]).length).toBeGreaterThan(0);
  });

  it('passes persona constraints to the system prompt', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/content-drafts/draft-1/reproduce',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {},
    });

    const generateCall = (generateWithFallbackMock.mock.calls as unknown as unknown[][])[0] as unknown[];
    const genParams = generateCall[2] as { systemPrompt: string };
    // Constraints block should be in the system prompt
    expect(genParams.systemPrompt).toContain('No profanity');
    expect(genParams.systemPrompt).toContain('Content Constraints');
  });

  it('returns 400 when no review_feedback_json on draft', async () => {
    draftRow = { ...draftRow, review_feedback_json: null };

    const res = await app.inject({
      method: 'POST',
      url: '/api/content-drafts/draft-1/reproduce',
      headers: { 'x-internal-key': 'test', 'x-user-id': 'user-1' },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});
