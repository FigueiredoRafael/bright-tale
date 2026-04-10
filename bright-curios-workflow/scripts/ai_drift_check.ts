import mockAdapter from "@/lib/ai/mock";
import { validateDiscoveryOutput } from "@/lib/schemas/discovery";

async function main() {
  const sampleInput = {
    performance_review: { winners: [], losers: [] },
    theme: { primary: "test", subthemes: [] },
    goal: "growth",
    temporal_mix: { evergreen: 100, seasonal: 0, trending: 0 },
    constraints: { avoid: [], formats: ["blog"] },
    output: { ideas_requested: 3 },
  } as any;

  console.log("Running mock adapter discovery check...");
  const out = await mockAdapter.generateDiscovery(sampleInput);
  const parsed = validateDiscoveryOutput(out);
  if (!parsed.success) {
    console.error(
      "Mock adapter output failed schema validation:",
      parsed.error.issues,
    );
    process.exit(2);
  }
  console.log("Mock adapter output validated successfully.");

  // Deterministic check
  const out2 = await mockAdapter.generateDiscovery(sampleInput);
  if (JSON.stringify(out) !== JSON.stringify(out2)) {
    console.error("Mock adapter is not deterministic");
    process.exit(3);
  }
  console.log("Mock adapter deterministic check passed.");

  console.log("AI drift check completed successfully.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
