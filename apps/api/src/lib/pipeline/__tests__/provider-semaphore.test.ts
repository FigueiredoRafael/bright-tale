import { describe, it, expect, beforeEach } from "vitest";
import {
  acquire,
  _getSlotState,
  _reset,
  type SemaphoreKey,
} from "../provider-semaphore";

const KEY_A: SemaphoreKey = {
  userId: "user-1",
  provider: "gemini",
  model: "gemini-1.5-flash",
};

const KEY_B: SemaphoreKey = {
  userId: "user-1",
  provider: "openai",
  model: "gpt-4o",
};

const KEY_C: SemaphoreKey = {
  userId: "user-2",
  provider: "gemini",
  model: "gemini-1.5-flash",
};

beforeEach(() => {
  _reset();
});

// ─── Acquire under cap ──────────────────────────────────────────────────────

describe("acquire under cap", () => {
  it("resolves immediately and returns a function", async () => {
    const release = await acquire(KEY_A, 3);
    expect(typeof release).toBe("function");
    expect(_getSlotState(KEY_A).active).toBe(1);
    release();
  });

  it("resolves immediately for multiple acquires below cap", async () => {
    const [r1, r2, r3] = await Promise.all([
      acquire(KEY_A, 3),
      acquire(KEY_A, 3),
      acquire(KEY_A, 3),
    ]);
    expect(_getSlotState(KEY_A).active).toBe(3);
    r1();
    r2();
    r3();
  });

  it("does not block at exactly max concurrent holders", async () => {
    const releases: Array<() => void> = [];
    for (let i = 0; i < 5; i++) {
      releases.push(await acquire(KEY_A, 5));
    }
    expect(_getSlotState(KEY_A).active).toBe(5);
    releases.forEach((r) => r());
  });
});

// ─── Acquire over cap (waits) ───────────────────────────────────────────────

describe("acquire over cap", () => {
  it("does not resolve while cap is full", async () => {
    const r1 = await acquire(KEY_A, 1);

    let resolved = false;
    const pending = acquire(KEY_A, 1).then((release) => {
      resolved = true;
      return release;
    });

    // Give the microtask queue a chance to flush.
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(_getSlotState(KEY_A).queueLength).toBe(1);

    r1(); // release the slot
    const r2 = await pending;
    expect(resolved).toBe(true);
    r2();
  });

  it("queues multiple waiters when cap is exceeded", async () => {
    const r1 = await acquire(KEY_A, 2);
    const r2 = await acquire(KEY_A, 2);

    let w1Resolved = false;
    let w2Resolved = false;

    const p1 = acquire(KEY_A, 2).then((r) => {
      w1Resolved = true;
      return r;
    });
    const p2 = acquire(KEY_A, 2).then((r) => {
      w2Resolved = true;
      return r;
    });

    await Promise.resolve();
    expect(w1Resolved).toBe(false);
    expect(w2Resolved).toBe(false);
    expect(_getSlotState(KEY_A).queueLength).toBe(2);

    r1();
    const r3 = await p1;
    expect(w1Resolved).toBe(true);
    // w2 still waiting — only one slot freed
    await Promise.resolve();
    expect(w2Resolved).toBe(false);

    r2();
    const r4 = await p2;
    expect(w2Resolved).toBe(true);

    r3();
    r4();
  });
});

// ─── FIFO ordering ──────────────────────────────────────────────────────────

describe("FIFO order of multiple waiters", () => {
  it("resolves waiters in the order they queued", async () => {
    const r1 = await acquire(KEY_A, 1);

    const order: number[] = [];
    const promises = [1, 2, 3].map((n) =>
      acquire(KEY_A, 1).then((release) => {
        order.push(n);
        return release;
      })
    );

    // Flush microtasks — nothing should have resolved yet.
    await Promise.resolve();
    expect(order).toEqual([]);

    // Release sequentially and let microtasks settle each time.
    r1();
    const rA = await promises[0];
    expect(order).toEqual([1]);

    rA();
    const rB = await promises[1];
    expect(order).toEqual([1, 2]);

    rB();
    const rC = await promises[2];
    expect(order).toEqual([1, 2, 3]);

    rC();
  });
});

// ─── Release after acquire ──────────────────────────────────────────────────

describe("release after acquire", () => {
  it("decrements active count on release", async () => {
    const release = await acquire(KEY_A, 3);
    expect(_getSlotState(KEY_A).active).toBe(1);
    release();
    expect(_getSlotState(KEY_A).active).toBe(0);
  });

  it("allows re-acquire after release", async () => {
    const r1 = await acquire(KEY_A, 1);
    r1();
    const r2 = await acquire(KEY_A, 1);
    expect(_getSlotState(KEY_A).active).toBe(1);
    r2();
  });

  it("calling release twice is idempotent (no double-decrement)", async () => {
    const r1 = await acquire(KEY_A, 1);
    r1();
    r1(); // second call must be a no-op
    expect(_getSlotState(KEY_A).active).toBe(0);
  });
});

// ─── Key isolation ──────────────────────────────────────────────────────────

describe("multiple (user, provider, model) keys are isolated", () => {
  it("different providers do not share slots", async () => {
    const rA = await acquire(KEY_A, 1);
    // KEY_B (openai) should not be blocked by KEY_A (gemini).
    const rB = await acquire(KEY_B, 1);
    expect(_getSlotState(KEY_A).active).toBe(1);
    expect(_getSlotState(KEY_B).active).toBe(1);
    rA();
    rB();
  });

  it("different users with same provider/model do not share slots", async () => {
    // KEY_A is user-1/gemini, KEY_C is user-2/gemini
    const rA = await acquire(KEY_A, 1);
    const rC = await acquire(KEY_C, 1);
    expect(_getSlotState(KEY_A).active).toBe(1);
    expect(_getSlotState(KEY_C).active).toBe(1);
    rA();
    rC();
  });

  it("releasing one key does not unblock waiters on a different key", async () => {
    const rA = await acquire(KEY_A, 1);
    // Saturate KEY_B
    const rB1 = await acquire(KEY_B, 1);

    let bWaiterResolved = false;
    const bWaiter = acquire(KEY_B, 1).then((r) => {
      bWaiterResolved = true;
      return r;
    });

    await Promise.resolve();
    expect(bWaiterResolved).toBe(false);

    // Release KEY_A — must NOT unblock the KEY_B waiter.
    rA();
    await Promise.resolve();
    expect(bWaiterResolved).toBe(false);

    // Now release KEY_B — the waiter should resolve.
    rB1();
    const rB2 = await bWaiter;
    expect(bWaiterResolved).toBe(true);
    rB2();
  });
});

// ─── Configurable cap ───────────────────────────────────────────────────────

describe("configurable cap", () => {
  it("cap of 1 allows only one holder at a time", async () => {
    const r1 = await acquire(KEY_A, 1);
    let r2Resolved = false;
    const p2 = acquire(KEY_A, 1).then((r) => {
      r2Resolved = true;
      return r;
    });
    await Promise.resolve();
    expect(r2Resolved).toBe(false);
    r1();
    const r2 = await p2;
    expect(r2Resolved).toBe(true);
    r2();
  });

  it("cap of 5 allows 5 concurrent holders", async () => {
    const releases = await Promise.all(
      Array.from({ length: 5 }, () => acquire(KEY_A, 5))
    );
    expect(_getSlotState(KEY_A).active).toBe(5);
    releases.forEach((r) => r());
  });

  it("throws RangeError for max < 1", () => {
    expect(() => acquire(KEY_A, 0)).toThrow(RangeError);
    expect(() => acquire(KEY_A, -1)).toThrow(RangeError);
  });
});

// ─── No-deadlock with try/finally pattern ───────────────────────────────────

describe("no-deadlock when release is called in finally", () => {
  it("next waiter resolves after release from finally block", async () => {
    const r1 = await acquire(KEY_A, 1);

    let w1Resolved = false;
    const waiter = acquire(KEY_A, 1).then((r) => {
      w1Resolved = true;
      return r;
    });

    // Simulate the holder doing work and releasing in finally.
    try {
      await Promise.resolve(); // simulate async work
    } finally {
      r1();
    }

    const rNext = await waiter;
    expect(w1Resolved).toBe(true);
    rNext();
  });

  it("waiter is unblocked even when holder throws (release in finally)", async () => {
    const r1 = await acquire(KEY_A, 1);

    let waiterResolved = false;
    const waiter = acquire(KEY_A, 1).then((r) => {
      waiterResolved = true;
      return r;
    });

    async function doWorkThatThrows() {
      try {
        throw new Error("simulated failure");
      } finally {
        r1();
      }
    }

    await expect(doWorkThatThrows()).rejects.toThrow("simulated failure");
    const rNext = await waiter;
    expect(waiterResolved).toBe(true);
    rNext();
  });
});
