/**
 * Test-only: Mock AI provider queue seeding endpoints (T1.13).
 *
 * These routes are ONLY registered when:
 *   MOCK_AI_PROVIDER=1  AND  NODE_ENV !== 'production'
 *
 * They allow Playwright fixtures to:
 *   POST /api/_test/mock-ai/queue   — enqueue one or more mock responses
 *   POST /api/_test/mock-ai/reset   — clear all queues + counters
 *   GET  /api/_test/mock-ai/state   — inspect queue lengths (diagnostics)
 *
 * The route is intentionally NOT gated by INTERNAL_API_KEY so e2e tests
 * can call it without having to replicate the middleware setup. The guard
 * is NODE_ENV !== 'production', which is enforced both here (registration
 * guard) and in the router's mock intercept.
 */

import type { FastifyInstance } from 'fastify';
import type { MockStage, MockEntry } from '../lib/ai/__mocks__/queue.js';

export async function testMockAiRoutes(fastify: FastifyInstance): Promise<void> {
  // Guard: only mount routes in non-production environments with mock active
  if (process.env.NODE_ENV === 'production' || process.env.MOCK_AI_PROVIDER !== '1') {
    return;
  }

  const {
    enqueue,
    resetAll,
    snapshot,
  } = await import('../lib/ai/__mocks__/queue.js');

  /**
   * POST /api/_test/mock-ai/queue
   *
   * Body: { entries: Array<{ stage, kind, payload? | failureKind?, message? }> }
   *
   * Example — enqueue a success for brainstorm:
   *   { "entries": [{ "stage": "brainstorm", "kind": "success", "payload": { "ideas": [] } }] }
   *
   * Example — enqueue a 429 failure for research:
   *   { "entries": [{ "stage": "research", "kind": "failure", "failureKind": "quota_429" }] }
   */
  fastify.post('/_test/mock-ai/queue', async (request, reply) => {
    const body = request.body as {
      entries?: Array<{
        stage: MockStage;
        kind: 'success' | 'failure';
        payload?: unknown;
        failureKind?: string;
        message?: string;
      }>;
    };

    if (!body?.entries || !Array.isArray(body.entries)) {
      return reply.status(400).send({
        data: null,
        error: { code: 'BAD_REQUEST', message: 'body.entries must be an array' },
      });
    }

    for (const raw of body.entries) {
      if (!raw.stage || !raw.kind) {
        return reply.status(400).send({
          data: null,
          error: { code: 'BAD_REQUEST', message: 'Each entry requires { stage, kind }' },
        });
      }

      let entry: MockEntry;
      if (raw.kind === 'success') {
        entry = { kind: 'success', payload: raw.payload ?? null };
      } else if (raw.kind === 'failure') {
        const validKinds = ['quota_429', 'auth_401', 'timeout'];
        if (!raw.failureKind || !validKinds.includes(raw.failureKind)) {
          return reply.status(400).send({
            data: null,
            error: {
              code: 'BAD_REQUEST',
              message: `failureKind must be one of: ${validKinds.join(', ')}`,
            },
          });
        }
        entry = {
          kind: 'failure',
          failureKind: raw.failureKind as 'quota_429' | 'auth_401' | 'timeout',
          message: raw.message ?? raw.failureKind,
        };
      } else {
        return reply.status(400).send({
          data: null,
          error: { code: 'BAD_REQUEST', message: 'entry.kind must be "success" or "failure"' },
        });
      }

      enqueue(raw.stage, entry);
    }

    return reply.status(200).send({
      data: { queued: body.entries.length, state: snapshot() },
      error: null,
    });
  });

  /**
   * POST /api/_test/mock-ai/reset
   *
   * Clears all mock queues and call counters. Called by Playwright fixture
   * teardown between tests.
   */
  fastify.post('/_test/mock-ai/reset', async (_request, reply) => {
    resetAll();
    return reply.status(200).send({ data: { reset: true }, error: null });
  });

  /**
   * GET /api/_test/mock-ai/state
   *
   * Returns a snapshot of all queue lengths and call counts for diagnostics.
   */
  fastify.get('/_test/mock-ai/state', async (_request, reply) => {
    return reply.status(200).send({ data: { state: snapshot() }, error: null });
  });
}
