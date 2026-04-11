import { createKey, getKeyByToken, consumeKey } from "@/lib/idempotency";

// TODO-test: skip until Supabase integration tests are set up
// These tests assume a working DB in test environment. They serve as integration tests and may be skipped in unit setups.

describe.skip("Idempotency helper (integration)", () => {
  it("can create and consume a token", async () => {
    const token = `test-token-${Date.now()}`;
    const created = await createKey(token, { purpose: "test" });
    expect(created?.token).toBe(token);

    const found = await getKeyByToken(token);
    expect(found?.token).toBe(token);

    await consumeKey(token, { result: "ok" });
    const after = await getKeyByToken(token);
    expect(after?.consumed).toBe(true);
  });
});
