import { describe, it, expect } from "vitest";
import { deriveTier, isApprovedTier } from "../reviewTierCompat";

describe("deriveTier", () => {
  it("returns tier from new-shape review", () => {
    expect(deriveTier({ quality_tier: "excellent" })).toBe("excellent");
    expect(deriveTier({ quality_tier: "needs_revision" })).toBe("needs_revision");
  });

  it("maps legacy numeric score to tier (dual-read)", () => {
    expect(deriveTier({ score: 95 })).toBe("excellent");
    expect(deriveTier({ score: 85 })).toBe("good");
    expect(deriveTier({ score: 60 })).toBe("needs_revision");
    expect(deriveTier({ score: 20 })).toBe("reject");
  });

  it("returns not_requested on null/undefined/empty", () => {
    expect(deriveTier(null)).toBe("not_requested");
    expect(deriveTier(undefined)).toBe("not_requested");
    expect(deriveTier({})).toBe("not_requested");
  });
});

describe("isApprovedTier", () => {
  it("approves excellent and good only", () => {
    expect(isApprovedTier("excellent")).toBe(true);
    expect(isApprovedTier("good")).toBe(true);
    expect(isApprovedTier("needs_revision")).toBe(false);
    expect(isApprovedTier("reject")).toBe(false);
    expect(isApprovedTier("not_requested")).toBe(false);
  });
});
