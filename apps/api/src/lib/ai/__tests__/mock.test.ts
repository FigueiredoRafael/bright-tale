import mockAdapter from "../mock";
import { validateDiscoveryOutput } from "@brighttale/shared/schemas/discovery";

describe("Mock AI adapter", () => {
  it("returns valid discovery output", async () => {
    const out = await mockAdapter.generateDiscovery({
      performance_review: { winners: [], losers: [] },
      theme: { primary: "test", subthemes: [] },
      goal: "growth",
      temporal_mix: { evergreen: 100, seasonal: 0, trending: 0 },
      constraints: { avoid: [], formats: ["blog"] },
      output: { ideas_requested: 1 },
    } as any);

    const parsed = validateDiscoveryOutput(out);
    expect(parsed.success).toBe(true);
  });
});
