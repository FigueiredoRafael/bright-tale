import { describe, it, expect } from "vitest";
import { shortsOutputSchema, type ShortsModuleOutput } from "../schema";
import { mapCanonicalCoreToShortsInput } from "../mapper";
import { generateShortsMarkdownExport } from "../exporter";
import { validateShorts, type ShortsValidationResult } from "../validator";
import type { CanonicalCore } from "@/types/agents";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const validCore: CanonicalCore = {
  idea_id: "BC-IDEA-001",
  thesis: "Renting beats buying for people who move every 3-5 years.",
  argument_chain: [
    { step: 1, claim: "Transaction costs eat 8-10% of home value.", evidence: "NAR data.", source_ids: ["SRC-001"] },
    { step: 2, claim: "Renters can invest the difference.", evidence: "Vanguard study.", source_ids: ["SRC-002"] },
  ],
  emotional_arc: {
    opening_emotion: "confusion",
    turning_point: "clarity",
    closing_emotion: "confidence",
  },
  key_stats: [
    { stat: "Transaction cost", figure: "8-10% of home value", source_id: "SRC-001" },
  ],
  cta_subscribe: "Subscribe for weekly real estate myths.",
  cta_comment_prompt: "Are you renting or buying?",
};

const validShortsOutput: ShortsModuleOutput = [
  {
    short_number: 1,
    title: "The 8% Tax Nobody Tells You About",
    hook: "You just paid 8% to NOT make money on your house.",
    script: "When you sell a house, the agent takes 6%, closing costs take 2% — that's 8% gone before you break even. And most people don't hold long enough to recover it.",
    duration: "0:45",
    visual_style: "talking head",
    cta: "Follow for more real estate myths debunked.",
    sound_effects: "none",
    background_music: "upbeat",
  },
  {
    short_number: 2,
    title: "Renters Win When They Invest the Difference",
    hook: "Your landlord isn't building wealth. You could be.",
    script: "The rent vs buy debate ignores one number: what if you invest the down payment instead? S&P 500 returned 10.7% over 10 years. Home appreciation: 4.3%.",
    duration: "0:50",
    visual_style: "b-roll",
    cta: "Subscribe to see the full math breakdown.",
  },
  {
    short_number: 3,
    title: "The One Question That Decides Everything",
    hook: "Before you buy a house, ask yourself one question.",
    script: "How long are you staying? If the answer is less than 5 years, renting wins on pure math — every time. Here's why.",
    duration: "0:40",
    visual_style: "text overlay",
    cta: "Watch the full video for the complete breakdown.",
  },
];

// ─── Schema tests ─────────────────────────────────────────────────────────────

describe("shortsOutputSchema", () => {
  it("accepts a valid array of 3 shorts", () => {
    const result = shortsOutputSchema.safeParse(validShortsOutput);
    expect(result.success).toBe(true);
  });

  it("accepts a single short (min 1)", () => {
    const result = shortsOutputSchema.safeParse([validShortsOutput[0]]);
    expect(result.success).toBe(true);
  });

  it("rejects an empty array", () => {
    const result = shortsOutputSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it("normalizes visual_style with underscore to space", () => {
    const withUnderscore = [{ ...validShortsOutput[0], visual_style: "talking_head" }];
    const result = shortsOutputSchema.safeParse(withUnderscore);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].visual_style).toBe("talking head");
    }
  });

  it("rejects invalid visual_style", () => {
    const bad = [{ ...validShortsOutput[0], visual_style: "animation" }];
    const result = shortsOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects short missing hook", () => {
    const { hook: _, ...withoutHook } = validShortsOutput[0];
    const result = shortsOutputSchema.safeParse([withoutHook]);
    expect(result.success).toBe(false);
  });
});

// ─── Mapper tests ─────────────────────────────────────────────────────────────

describe("mapCanonicalCoreToShortsInput", () => {
  it("returns idea_id and thesis", () => {
    const input = mapCanonicalCoreToShortsInput(validCore);
    expect(input.idea_id).toBe("BC-IDEA-001");
    expect(input.thesis).toBe(validCore.thesis);
  });

  it("maps turning_point as the primary hook source", () => {
    const input = mapCanonicalCoreToShortsInput(validCore);
    expect(input.turning_point).toBe("clarity");
  });

  it("maps key_stats for shorts hooks", () => {
    const input = mapCanonicalCoreToShortsInput(validCore);
    expect(input.key_stats).toHaveLength(1);
    expect(input.key_stats[0].figure).toBe("8-10% of home value");
  });

  it("includes cta_subscribe for the shorts CTA", () => {
    const input = mapCanonicalCoreToShortsInput(validCore);
    expect(input.cta_subscribe).toBe(validCore.cta_subscribe);
  });

  it("includes argument_chain steps", () => {
    const input = mapCanonicalCoreToShortsInput(validCore);
    expect(input.argument_chain).toHaveLength(2);
  });
});

// ─── Exporter tests ───────────────────────────────────────────────────────────

describe("generateShortsMarkdownExport", () => {
  it("produces a string with all short titles", () => {
    const md = generateShortsMarkdownExport(validShortsOutput);
    expect(typeof md).toBe("string");
    expect(md).toContain("The 8% Tax Nobody Tells You About");
    expect(md).toContain("Renters Win When They Invest");
    expect(md).toContain("The One Question");
  });

  it("includes the hook for each short", () => {
    const md = generateShortsMarkdownExport(validShortsOutput);
    expect(md).toContain("You just paid 8%");
  });

  it("includes the CTA for each short", () => {
    const md = generateShortsMarkdownExport(validShortsOutput);
    expect(md).toContain("Follow for more real estate myths");
  });

  it("does not include 'undefined' literals", () => {
    const md = generateShortsMarkdownExport(validShortsOutput);
    expect(md).not.toContain("undefined");
  });
});

// ─── Validator tests ──────────────────────────────────────────────────────────

describe("validateShorts", () => {
  it("returns valid for exactly 3 shorts", () => {
    const result: ShortsValidationResult = validateShorts(validShortsOutput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("errors when shorts array is empty", () => {
    const result = validateShorts([]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("empty"))).toBe(true);
  });

  it("warns when fewer than 3 shorts are provided", () => {
    const result = validateShorts([validShortsOutput[0], validShortsOutput[1]]);
    expect(result.warnings.some((w) => w.includes("3"))).toBe(true);
  });

  it("errors when short_numbers are not sequential starting at 1", () => {
    const bad = [
      { ...validShortsOutput[0], short_number: 2 },
      { ...validShortsOutput[1], short_number: 3 },
      { ...validShortsOutput[2], short_number: 4 },
    ];
    const result = validateShorts(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("short_number"))).toBe(true);
  });

  it("warns when a short has no CTA", () => {
    const bad = [{ ...validShortsOutput[0], cta: "" }, validShortsOutput[1], validShortsOutput[2]];
    const result = validateShorts(bad);
    expect(result.warnings.some((w) => w.includes("CTA") || w.includes("cta"))).toBe(true);
  });
});
