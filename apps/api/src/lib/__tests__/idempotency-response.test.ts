import { describe, it, expect } from 'vitest';
import { createKey, consumeKey, getKeyByToken } from "../idempotency";

// TODO-test: skip until Supabase integration tests are set up
describe.skip("Idempotency helper store/consume response", () => {
  it("stores response when consumed and can be retrieved", async () => {
    const token = `test-token-${Date.now()}`;
    await createKey(token, { purpose: "test" });
    await consumeKey(token, { result: "ok" });
    const rec = await getKeyByToken(token);
    expect(rec).toBeTruthy();
    expect(rec?.consumed).toBe(true);
    expect(rec?.response).toBeTruthy();
    expect((rec as any).response.result).toBe("ok");

    // cleanup
  });
});
