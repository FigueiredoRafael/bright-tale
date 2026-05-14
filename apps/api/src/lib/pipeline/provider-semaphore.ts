/**
 * provider-semaphore — in-memory concurrency limiter per (userId, provider, model).
 *
 * `acquire(key, max)` resolves with a `release` function as soon as the number of
 * active slots for the given key is below `max`.  The caller MUST call `release()`
 * in a `finally` block; failing to do so keeps the semaphore "full" for the lifetime
 * of the process (single-process Next.js — acceptable trade-off per T1.10 spec).
 *
 * FIFO ordering: waiters are resolved in the order they called `acquire`.
 *
 * Key isolation: distinct `(userId, provider, model)` triples are completely
 * independent — acquiring one key never blocks another.
 *
 * Pure / no I/O.  Module-level map is reset on process restart.  Multi-process
 * scale-out will require an external store (Redis), deferred to T2.x.
 */

export interface SemaphoreKey {
  userId: string;
  provider: string;
  model: string;
}

interface SlotState {
  active: number;
  queue: Array<() => void>;
}

const slots = new Map<string, SlotState>();

function serializeKey(key: SemaphoreKey): string {
  return `${key.userId}:${key.provider}:${key.model}`;
}

function getSlot(serialized: string): SlotState {
  let slot = slots.get(serialized);
  if (!slot) {
    slot = { active: 0, queue: [] };
    slots.set(serialized, slot);
  }
  return slot;
}

/**
 * Acquire a concurrency slot for the given key.
 *
 * @param key    - `{ userId, provider, model }` triple that identifies the semaphore.
 * @param max    - Maximum number of concurrent holders for this key.
 * @returns      A Promise that resolves with a `release` function.
 *               Call `release()` (ideally in a `finally` block) when the guarded
 *               work is done.
 */
export function acquire(key: SemaphoreKey, max: number): Promise<() => void> {
  if (max < 1) {
    throw new RangeError(`provider-semaphore: max must be >= 1, got ${max}`);
  }

  const k = serializeKey(key);
  const slot = getSlot(k);

  const makeRelease = (): (() => void) => {
    let released = false;
    return () => {
      if (released) return; // idempotent — extra safety
      released = true;
      const next = slot.queue.shift();
      if (next) {
        // Keep `active` the same — the next waiter immediately takes the slot.
        next();
      } else {
        slot.active -= 1;
      }
    };
  };

  if (slot.active < max) {
    slot.active += 1;
    return Promise.resolve(makeRelease());
  }

  // Over cap — push to queue and wait.
  return new Promise<() => void>((resolve) => {
    slot.queue.push(() => {
      // `active` is NOT incremented here because the releasing caller already
      // "transferred" its slot via the queue-shift path in makeRelease.
      resolve(makeRelease());
    });
  });
}

/**
 * Returns a snapshot of the internal slot state for a given key.
 * Exposed for testing only — do not rely on this in production code.
 *
 * @internal
 */
export function _getSlotState(
  key: SemaphoreKey
): Readonly<{ active: number; queueLength: number }> {
  const slot = slots.get(serializeKey(key));
  return { active: slot?.active ?? 0, queueLength: slot?.queue.length ?? 0 };
}

/**
 * Resets all semaphore state.
 * For use in tests only — allows clean isolation between test cases.
 *
 * @internal
 */
export function _reset(): void {
  slots.clear();
}
