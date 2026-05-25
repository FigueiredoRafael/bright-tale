import { beforeEach, describe, expect, it } from 'vitest';
import {
  acquire,
  __resetForTests,
  __inspect,
  type SemaphoreKey,
} from '../provider-semaphore';

const KEY: SemaphoreKey = {
  userId: 'user-1',
  provider: 'openai',
  model: 'gpt-4o',
};

beforeEach(() => {
  __resetForTests();
});

describe('acquire under cap', () => {
  it('resolves immediately when active < max', async () => {
    const release = await acquire(KEY, 2);
    expect(__inspect(KEY).active).toBe(1);
    release();
  });

  it('multiple concurrent acquires under cap all resolve immediately', async () => {
    const r1 = await acquire(KEY, 3);
    const r2 = await acquire(KEY, 3);
    const r3 = await acquire(KEY, 3);
    expect(__inspect(KEY).active).toBe(3);
    expect(__inspect(KEY).queued).toBe(0);
    r1();
    r2();
    r3();
  });
});

describe('acquire over cap waits', () => {
  it('the (max+1)th acquire does not resolve until a release happens', async () => {
    const r1 = await acquire(KEY, 1);
    expect(__inspect(KEY).active).toBe(1);

    let secondResolved = false;
    const secondPromise = acquire(KEY, 1).then((rel) => {
      secondResolved = true;
      return rel;
    });

    // Give the event loop a tick — second must still be queued
    await new Promise((r) => setTimeout(r, 10));
    expect(secondResolved).toBe(false);
    expect(__inspect(KEY).queued).toBe(1);

    r1();
    const r2 = await secondPromise;
    expect(secondResolved).toBe(true);
    expect(__inspect(KEY).active).toBe(1);
    r2();
  });
});

describe('FIFO order', () => {
  it('queued waiters resolve in arrival order as slots free up', async () => {
    const r1 = await acquire(KEY, 1);
    const order: string[] = [];
    const pA = acquire(KEY, 1).then((rel) => {
      order.push('A');
      return rel;
    });
    const pB = acquire(KEY, 1).then((rel) => {
      order.push('B');
      return rel;
    });
    const pC = acquire(KEY, 1).then((rel) => {
      order.push('C');
      return rel;
    });

    r1();
    const rA = await pA;
    rA();
    const rB = await pB;
    rB();
    const rC = await pC;
    rC();

    expect(order).toEqual(['A', 'B', 'C']);
  });
});

describe('release after acquire', () => {
  it('release decrements active', async () => {
    const r1 = await acquire(KEY, 2);
    expect(__inspect(KEY).active).toBe(1);
    r1();
    expect(__inspect(KEY).active).toBe(0);
  });

  it('release is idempotent — calling twice is a no-op', async () => {
    const r1 = await acquire(KEY, 2);
    r1();
    r1();
    expect(__inspect(KEY).active).toBe(0);
  });

  it('release wakes the next queued waiter exactly once', async () => {
    const r1 = await acquire(KEY, 1);
    let wokeCount = 0;
    const p = acquire(KEY, 1).then((rel) => {
      wokeCount += 1;
      return rel;
    });
    r1();
    const r2 = await p;
    expect(wokeCount).toBe(1);
    r2();
  });
});

describe('multiple keys isolated', () => {
  it('different (userId, provider, model) tuples do not share a bucket', async () => {
    const k1: SemaphoreKey = { userId: 'u1', provider: 'openai', model: 'gpt-4o' };
    const k2: SemaphoreKey = { userId: 'u2', provider: 'openai', model: 'gpt-4o' };
    const k3: SemaphoreKey = { userId: 'u1', provider: 'anthropic', model: 'claude' };

    const r1 = await acquire(k1, 1);
    const r2 = await acquire(k2, 1);
    const r3 = await acquire(k3, 1);

    // All three resolved without queueing — independent buckets.
    expect(__inspect(k1).active).toBe(1);
    expect(__inspect(k2).active).toBe(1);
    expect(__inspect(k3).active).toBe(1);
    expect(__inspect(k1).queued).toBe(0);

    r1();
    r2();
    r3();
  });

  it('a queued waiter on key A does not block key B', async () => {
    const kA: SemaphoreKey = { userId: 'u1', provider: 'openai', model: 'gpt-4o' };
    const kB: SemaphoreKey = { userId: 'u1', provider: 'gemini', model: 'flash' };

    const rA = await acquire(kA, 1);
    const pAqueued = acquire(kA, 1);
    let pAresolved = false;
    pAqueued.then(() => {
      pAresolved = true;
    });

    // kB acquires freely while kA's second waiter is parked
    const rB = await acquire(kB, 1);
    expect(__inspect(kB).active).toBe(1);
    expect(pAresolved).toBe(false);

    rA();
    rB();
    const rAnext = await pAqueued;
    rAnext();
  });
});

describe('configurable cap', () => {
  it('cap=1 serializes; cap=10 allows 10 concurrent', async () => {
    const cap1 = await acquire(KEY, 1);
    expect(__inspect(KEY).active).toBe(1);
    cap1();

    const releases: Array<() => void> = [];
    for (let i = 0; i < 10; i += 1) {
      releases.push(await acquire(KEY, 10));
    }
    expect(__inspect(KEY).active).toBe(10);
    releases.forEach((r) => r());
  });

  it('throws when max < 1', async () => {
    await expect(acquire(KEY, 0)).rejects.toThrow();
    await expect(acquire(KEY, -1)).rejects.toThrow();
  });
});

describe('no leaks', () => {
  it('bucket is garbage-collected when active and queue are both empty', async () => {
    const r = await acquire(KEY, 1);
    expect(__inspect(KEY).active).toBe(1);
    r();
    // After full drain, the bucket entry is removed (active+queued = 0)
    expect(__inspect(KEY).active).toBe(0);
    expect(__inspect(KEY).queued).toBe(0);
  });

  it('does not leak waiters when many are queued and drained', async () => {
    const r1 = await acquire(KEY, 1);
    const waiters = [acquire(KEY, 1), acquire(KEY, 1), acquire(KEY, 1)];
    expect(__inspect(KEY).queued).toBe(3);

    r1();
    const r2 = await waiters[0];
    r2();
    const r3 = await waiters[1];
    r3();
    const r4 = await waiters[2];
    r4();
    expect(__inspect(KEY).active).toBe(0);
    expect(__inspect(KEY).queued).toBe(0);
  });
});
