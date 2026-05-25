/**
 * Mock AI Provider Queue (T1.13)
 *
 * In-process module that holds the per-stage response queue used by the
 * mock AI provider interceptor. The Playwright fixture talks to the API via
 * HTTP (POST /api/_test/mock-ai/queue) to seed this queue; the mock
 * interceptor in router.ts reads from it.
 *
 * This module is ONLY used when MOCK_AI_PROVIDER=1 and NODE_ENV !== 'production'.
 * It is a plain singleton — no class, no DI — so all code sharing the same
 * Node.js process reads/writes the same queue.
 */

export type MockStage =
  | 'brainstorm'
  | 'research'
  | 'canonical'
  | 'production'
  | 'review'
  | 'assets'
  | 'preview';

export type MockFailureKind = 'quota_429' | 'auth_401' | 'timeout';

export interface MockSuccessEntry {
  kind: 'success';
  payload: unknown;
}

export interface MockFailureEntry {
  kind: 'failure';
  failureKind: MockFailureKind;
  message: string;
}

export type MockEntry = MockSuccessEntry | MockFailureEntry;

/** Per-stage FIFO queues. */
const queues = new Map<MockStage, MockEntry[]>();

/** Total call counter per stage — used for log line `<call#>`. */
const callCounters = new Map<MockStage, number>();

/**
 * Enqueue a mock response for a stage. The queue is FIFO — first pushed is
 * first consumed.
 */
export function enqueue(stage: MockStage, entry: MockEntry): void {
  const q = queues.get(stage) ?? [];
  q.push(entry);
  queues.set(stage, q);
}

/**
 * Dequeue the next mock entry for a stage. Returns `undefined` if the queue
 * is empty (callers should throw "queue empty" in that case).
 */
export function dequeue(stage: MockStage): MockEntry | undefined {
  const q = queues.get(stage);
  if (!q || q.length === 0) return undefined;
  return q.shift();
}

/**
 * Peek at how many entries remain in a stage's queue (for diagnostics).
 */
export function queueLength(stage: MockStage): number {
  return queues.get(stage)?.length ?? 0;
}

/**
 * Increment and return the call counter for a stage.
 * Used for the `[MOCK-AI][<stage>][<call#>]` log prefix.
 */
export function nextCallNumber(stage: MockStage): number {
  const n = (callCounters.get(stage) ?? 0) + 1;
  callCounters.set(stage, n);
  return n;
}

/**
 * Reset all queues and counters. Called between tests via the
 * POST /api/_test/mock-ai/reset endpoint.
 */
export function resetAll(): void {
  queues.clear();
  callCounters.clear();
}

/**
 * Return a snapshot of the queue state (for diagnostics / assertions).
 */
export function snapshot(): Record<string, { pending: number; totalCalls: number }> {
  const out: Record<string, { pending: number; totalCalls: number }> = {};
  for (const stage of queues.keys()) {
    out[stage] = {
      pending: queues.get(stage)?.length ?? 0,
      totalCalls: callCounters.get(stage) ?? 0,
    };
  }
  return out;
}
