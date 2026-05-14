/**
 * Integration test — provider-semaphore wraps LLM dispatch in router.ts.
 *
 * Multi-track autopilot can fire N parallel generateWithFallback calls. The
 * semaphore caps in-flight calls per (userId, provider, model) so we don't
 * 429 ourselves on free tiers.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const geminiCalls: Array<{ resolve: (value: unknown) => void; reject: (err: unknown) => void }> = [];

vi.mock('../providers/openai.js', () => ({
  OpenAIProvider: class {
    generateContent() { throw new Error('not used'); }
  },
}));
vi.mock('../providers/anthropic.js', () => ({
  AnthropicProvider: class {
    generateContent() { throw new Error('not used'); }
  },
}));
vi.mock('../providers/gemini.js', () => ({
  GeminiProvider: class {
    generateContent() {
      return new Promise((resolve, reject) => {
        geminiCalls.push({ resolve, reject });
      });
    }
  },
}));

import { generateWithFallback } from '../router';
import { __resetForTests } from '../../pipeline/provider-semaphore.js';

beforeEach(() => {
  process.env.GOOGLE_AI_KEY = 'AIz-test';
  process.env.AI_RETRY_BASE_MS = '0';
  process.env.AI_MAX_CONCURRENT_GEMINI = '2';
  geminiCalls.length = 0;
  __resetForTests();
});

const params = {
  agentType: 'brainstorm' as const,
  systemPrompt: 'test',
  userMessage: 'test',
  schema: null,
};

const tick = () => new Promise<void>((r) => setImmediate(r));

describe('generateWithFallback + provider-semaphore', () => {
  it('caps concurrent in-flight calls at getMaxConcurrent(provider)', async () => {
    const logContext = {
      userId: 'user-1',
      sessionType: 'pipeline',
    };

    const p1 = generateWithFallback('brainstorm', 'free', params, { logContext });
    const p2 = generateWithFallback('brainstorm', 'free', params, { logContext });
    const p3 = generateWithFallback('brainstorm', 'free', params, { logContext });

    // Yield so semaphore.acquire + provider.generateContent get scheduled.
    await tick();
    await tick();

    // With max=2, only the first two providers should have been called.
    expect(geminiCalls.length).toBe(2);

    // Release one slot — the third waiter must now invoke the provider.
    geminiCalls[0].resolve({ source: 'gemini', n: 1 });
    await p1;
    await tick();
    await tick();
    expect(geminiCalls.length).toBe(3);

    // Drain remaining.
    geminiCalls[1].resolve({ source: 'gemini', n: 2 });
    geminiCalls[2].resolve({ source: 'gemini', n: 3 });
    await Promise.all([p2, p3]);
  });

  it('releases slot even when provider throws (no deadlock)', async () => {
    const logContext = { userId: 'user-2', sessionType: 'pipeline' };

    const p1 = generateWithFallback('brainstorm', 'free', params, { logContext });
    const p2 = generateWithFallback('brainstorm', 'free', params, { logContext });
    const p3 = generateWithFallback('brainstorm', 'free', params, { logContext });
    // Attach the rejection assertion eagerly so the rejection isn't flagged
    // as unhandled while the test waits for queue advancement.
    const p1Assertion = expect(p1).rejects.toThrow('400');

    await tick();
    await tick();
    expect(geminiCalls.length).toBe(2);

    // First call rejects with a non-retryable, non-failover error — provider
    // chain stops, slot must be released so the third waiter advances.
    geminiCalls[0].reject(new Error('400 bad request'));

    await tick();
    await tick();
    expect(geminiCalls.length).toBe(3);

    await p1Assertion;

    // Drain.
    geminiCalls[1].resolve({ source: 'gemini' });
    geminiCalls[2].resolve({ source: 'gemini' });
    await Promise.all([p2, p3]);
  });

  it('uses separate buckets per userId', async () => {
    const p1 = generateWithFallback('brainstorm', 'free', params, {
      logContext: { userId: 'user-a', sessionType: 'pipeline' },
    });
    const p2 = generateWithFallback('brainstorm', 'free', params, {
      logContext: { userId: 'user-a', sessionType: 'pipeline' },
    });
    const p3 = generateWithFallback('brainstorm', 'free', params, {
      logContext: { userId: 'user-b', sessionType: 'pipeline' },
    });

    await tick();
    await tick();

    // user-a uses 2 slots (its cap), user-b uses 1 — all three should be in
    // flight because the buckets are independent.
    expect(geminiCalls.length).toBe(3);

    geminiCalls[0].resolve({ source: 'gemini' });
    geminiCalls[1].resolve({ source: 'gemini' });
    geminiCalls[2].resolve({ source: 'gemini' });
    await Promise.all([p1, p2, p3]);
  });
});
