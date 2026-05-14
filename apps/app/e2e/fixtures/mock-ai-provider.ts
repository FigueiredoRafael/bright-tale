/**
 * Mock AI Provider Fixture (T1.13)
 *
 * Exposes a Playwright fixture that intercepts every `generateWithFallback`
 * call at the dispatcher boundary defined by `apps/api/src/lib/ai/router.ts`.
 *
 * The interception works via an environment flag (MOCK_AI_PROVIDER=1) that
 * is read in the API server process. The fixture communicates with the API
 * via HTTP to seed the in-process response queue
 * (POST /_test/mock-ai/queue) and to reset it between tests
 * (POST /_test/mock-ai/reset).
 *
 * The API server must be running with MOCK_AI_PROVIDER=1 for this fixture
 * to work. Set it in the process environment before starting the API dev
 * server, or pass it via playwright.config.ts webServer.env:
 *
 *   MOCK_AI_PROVIDER=1 npm run dev:api
 *
 * Usage in e2e specs:
 *
 *   import { test, expect } from './fixtures/mock-ai-provider'
 *
 *   test('brainstorm returns mock ideas', async ({ page, mockAI }) => {
 *     await mockAI.expect('brainstorm').toReturn({ ideas: [] })
 *     // ... drive the UI ...
 *   })
 *
 * @see apps/api/src/lib/ai/__mocks__/queue.ts — server-side queue module
 * @see apps/api/src/routes/test-mock-ai.ts — HTTP endpoints to seed the queue
 */

import { test as base, type APIRequestContext } from '@playwright/test';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MockStage =
  | 'brainstorm'
  | 'research'
  | 'canonical'
  | 'production'
  | 'review'
  | 'assets'
  | 'preview';

export type MockFailureKind = 'quota_429' | 'auth_401' | 'timeout';

interface QueueEntry {
  stage: MockStage;
  kind: 'success' | 'failure';
  payload?: unknown;
  failureKind?: MockFailureKind;
  message?: string;
}

// ─── Stage expectation builder ─────────────────────────────────────────────

interface StageExpectation {
  /**
   * Queue a single success response for this stage. The `payload` is returned
   * verbatim from `generateWithFallback` → `result`.
   */
  toReturn(payload: unknown): Promise<void>;

  /**
   * Queue multiple review responses with specific scores in order.
   * Each score is wrapped in `{ score, verdict, feedback }`.
   * Score >= 90 → verdict='approved'; score < 90 → verdict='needs_revision'.
   */
  toReturnScores(scores: number[]): Promise<void>;

  /**
   * Queue multiple research responses with specific confidence values in order.
   * Each confidence is wrapped in `{ confidence, findings: [] }`.
   */
  toReturnConfidences(confidences: number[]): Promise<void>;

  /**
   * Queue a failure response for this stage.
   * The failure kind maps to:
   *   - quota_429  → throws "429 quota exceeded"
   *   - auth_401   → throws "401 unauthorized"
   *   - timeout    → throws "TIMEOUT request timed out"
   */
  toFail(opts: { kind: MockFailureKind; message?: string }): Promise<void>;
}

// ─── Mock AI controller ────────────────────────────────────────────────────

export interface MockAIController {
  /**
   * Begin building an expectation for a specific stage.
   *
   * @example
   * await mockAI.expect('brainstorm').toReturn({ ideas: ['Why fish glow'] })
   * await mockAI.expect('review').toReturnScores([78, 92])
   * await mockAI.expect('research').toReturnConfidences([0.42, 0.62, 0.84])
   * await mockAI.expect('production').toFail({ kind: 'quota_429' })
   */
  expect(stage: MockStage): StageExpectation;

  /**
   * Manually reset all mock queues and call counters. The fixture already
   * calls this automatically in teardown; expose it for mid-test resets.
   */
  reset(): Promise<void>;

  /**
   * Return a snapshot of queue lengths and call counts for diagnostics.
   */
  state(): Promise<Record<string, { pending: number; totalCalls: number }>>;
}

// ─── Fixture definition ────────────────────────────────────────────────────

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3001';

function buildController(request: APIRequestContext): MockAIController {
  async function seedEntries(entries: QueueEntry[]): Promise<void> {
    const res = await request.post(`${API_URL}/_test/mock-ai/queue`, {
      data: { entries },
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok()) {
      const body = await res.text();
      throw new Error(
        `[mock-ai-provider] Failed to seed mock queue (${res.status()}): ${body}`,
      );
    }
  }

  function stageExpectation(stage: MockStage): StageExpectation {
    return {
      async toReturn(payload: unknown): Promise<void> {
        await seedEntries([{ stage, kind: 'success', payload }]);
      },

      async toReturnScores(scores: number[]): Promise<void> {
        const entries: QueueEntry[] = scores.map((score) => ({
          stage,
          kind: 'success',
          payload: {
            score,
            verdict: score >= 90 ? 'approved' : 'needs_revision',
            feedback: { summary: `Score: ${score}` },
          },
        }));
        await seedEntries(entries);
      },

      async toReturnConfidences(confidences: number[]): Promise<void> {
        const entries: QueueEntry[] = confidences.map((confidence) => ({
          stage,
          kind: 'success',
          payload: {
            confidence,
            findings: [],
          },
        }));
        await seedEntries(entries);
      },

      async toFail(opts: { kind: MockFailureKind; message?: string }): Promise<void> {
        await seedEntries([
          {
            stage,
            kind: 'failure',
            failureKind: opts.kind,
            message: opts.message,
          },
        ]);
      },
    };
  }

  return {
    expect: (stage: MockStage) => stageExpectation(stage),

    async reset(): Promise<void> {
      const res = await request.post(`${API_URL}/_test/mock-ai/reset`, {
        headers: { 'Content-Type': 'application/json' },
        data: {},
      });
      if (!res.ok()) {
        const body = await res.text();
        throw new Error(
          `[mock-ai-provider] Failed to reset mock queue (${res.status()}): ${body}`,
        );
      }
    },

    async state(): Promise<Record<string, { pending: number; totalCalls: number }>> {
      const res = await request.get(`${API_URL}/_test/mock-ai/state`);
      if (!res.ok()) {
        return {};
      }
      const json = (await res.json()) as {
        data?: { state?: Record<string, { pending: number; totalCalls: number }> };
      };
      return json.data?.state ?? {};
    },
  };
}

// ─── Extended test fixture ─────────────────────────────────────────────────

interface MockAIFixtures {
  /** Pre-built mock AI controller, scoped to this test. Auto-resets on teardown. */
  mockAI: MockAIController;
}

export const test = base.extend<MockAIFixtures>({
  mockAI: async ({ request }, provide) => {
    const controller = buildController(request);

    // Reset before test to ensure a clean queue even if a previous test leaked
    await controller.reset();

    await provide(controller);

    // Teardown: reset after every test so queues don't bleed into the next
    await controller.reset();
  },
});

export { expect } from '@playwright/test';
