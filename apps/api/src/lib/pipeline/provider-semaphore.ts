/**
 * provider-semaphore — in-memory concurrency cap for outbound LLM calls,
 * keyed by (userId, provider, model).
 *
 * Why: multi-track autopilot dispatches up to one LLM call per Track in
 * parallel. Free-tier Gemini caps at ~2 RPM; OpenAI tiers cap at a small
 * RPM/TPM. Without an in-process gate, the dispatcher fires N requests at
 * once and N-1 return 429.
 *
 * Per-process: this is a single-process Next.js API. If we ever scale
 * horizontally, the cap becomes per-pod and the LLM provider's own rate
 * limit becomes the hard ceiling — we accept that drift; the goal is to
 * stop self-DOSing under typical load.
 *
 * Usage:
 *   const release = await acquire({ userId, provider, model }, max);
 *   try { ... } finally { release(); }
 *
 * `acquire`:
 *   - Returns immediately when active < max.
 *   - Otherwise queues (FIFO) and resolves once a slot frees up.
 * `release`:
 *   - Decrements active.
 *   - Resolves the head of the queue if non-empty.
 *   - Idempotent: a second call is a no-op (guards against double-release
 *     in `finally` blocks where the body already released on success).
 */

export interface SemaphoreKey {
  userId: string;
  provider: string;
  model: string;
}

interface Bucket {
  active: number;
  queue: Array<() => void>;
}

const buckets = new Map<string, Bucket>();

function keyToString(key: SemaphoreKey): string {
  return `${key.userId}::${key.provider}::${key.model}`;
}

function getBucket(keyString: string): Bucket {
  let bucket = buckets.get(keyString);
  if (!bucket) {
    bucket = { active: 0, queue: [] };
    buckets.set(keyString, bucket);
  }
  return bucket;
}

export async function acquire(key: SemaphoreKey, max: number): Promise<() => void> {
  if (max < 1) {
    throw new Error(`provider-semaphore: max must be >= 1 (got ${max})`);
  }
  const keyString = keyToString(key);
  const bucket = getBucket(keyString);

  if (bucket.active < max) {
    bucket.active += 1;
    return makeRelease(keyString);
  }

  // Park the caller. The resolver below is what `release()` invokes when a
  // slot frees up; it must also increment `active` so the released waiter
  // counts toward the cap.
  await new Promise<void>((resolve) => {
    bucket.queue.push(() => {
      bucket.active += 1;
      resolve();
    });
  });
  return makeRelease(keyString);
}

function makeRelease(keyString: string): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const bucket = buckets.get(keyString);
    if (!bucket) return;
    bucket.active = Math.max(0, bucket.active - 1);
    const next = bucket.queue.shift();
    if (next) next();
    // Garbage-collect empty buckets so long-running processes don't leak
    // one entry per (userId, provider, model) tuple forever.
    if (bucket.active === 0 && bucket.queue.length === 0) {
      buckets.delete(keyString);
    }
  };
}

/**
 * Test-only — clears all bucket state. NOT exported through the index; the
 * test file imports the module path directly.
 */
export function __resetForTests(): void {
  buckets.clear();
}

/**
 * Test-only — current depth snapshot for a key.
 */
export function __inspect(key: SemaphoreKey): { active: number; queued: number } {
  const bucket = buckets.get(keyToString(key));
  return {
    active: bucket?.active ?? 0,
    queued: bucket?.queue.length ?? 0,
  };
}
