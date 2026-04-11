import { validateDiscoveryOutput } from "@brighttale/shared/schemas/discovery";
import fixture1 from "../../../../test/fixtures/ai/discovery.json";
import fixture2 from "../../../../test/fixtures/ai/discovery-multiple.json";

describe("AI discovery fixtures", () => {
  it("fixture1 validates against discoveryOutputSchema", () => {
    const parsed = validateDiscoveryOutput(fixture1);
    expect(parsed.success).toBe(true);
  });

  it("fixture2 (multiple ideas) validates against discoveryOutputSchema", () => {
    const parsed = validateDiscoveryOutput(fixture2);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.ideas.length).toBeGreaterThan(1);
    }
  });
});
