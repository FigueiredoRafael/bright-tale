import { validateDiscoveryOutput } from "@/lib/schemas/discovery";
import fixture from "../../../test/fixtures/ai/discovery.json";
import type { AIAdapter } from "./adapter";
import type { DiscoveryInput, DiscoveryOutput } from "@/lib/schemas/discovery";

export class MockAIAdapter implements AIAdapter {
  async generateDiscovery(_input: DiscoveryInput): Promise<DiscoveryOutput> {
    // Return deterministic fixture; validate before returning
    const parsed = validateDiscoveryOutput(fixture);
    if (!parsed.success) {
      throw new Error(
        "Mock discovery fixture is invalid: " +
          JSON.stringify(parsed.error.issues),
      );
    }
    return parsed.data;
  }
}

export const mockAdapter = new MockAIAdapter();
export default mockAdapter;
