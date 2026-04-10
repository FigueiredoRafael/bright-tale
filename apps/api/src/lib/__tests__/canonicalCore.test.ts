/**
 * Tests for CanonicalCore Zod schema and completeness scoring
 */
import { describe, it, expect } from "vitest";
import {
  canonicalCoreSchema,
  scoreCanonicalCore,
  type CanonicalCoreInput,
} from "../schemas/canonicalCore";

const BASE_CORE: CanonicalCoreInput = {
  idea_id: "BC-IDEA-001",
  thesis: "The buy-vs-rent debate ignores the most important variable: time horizon.",
  argument_chain: [
    {
      step: 1,
      claim: "Buying is cheaper long-term for stable households.",
      evidence: "Study XYZ: after 10+ years, owners have 40% more net worth.",
      source_ids: ["SRC-001"],
    },
    {
      step: 2,
      claim: "Renting preserves mobility and liquidity in volatile markets.",
      evidence: "NAR data: renters relocated 2.3x more in high-growth job markets.",
      source_ids: ["SRC-002"],
    },
  ],
  emotional_arc: {
    opening_emotion: "confusion",
    turning_point: "clarity",
    closing_emotion: "confidence",
  },
  key_stats: [
    { stat: "Net worth gap", figure: "40%", source_id: "SRC-001" },
  ],
  key_quotes: [
    { quote: "Time in the market beats timing the market.", author: "Warren Buffett", credentials: "Investor" },
  ],
  affiliate_moment: {
    trigger_context: "After revealing the net worth gap statistic.",
    product_angle: "A mortgage calculator tool that factors in time horizon.",
    cta_primary: "Try the calculator free — link in description.",
  },
  cta_subscribe: "Subscribe for weekly personal finance breakdowns.",
  cta_comment_prompt: "Are you renting or buying? Tell us in the comments.",
};

describe("canonicalCoreSchema — valid input", () => {
  it("accepts a complete, valid CanonicalCore", () => {
    expect(() => canonicalCoreSchema.parse(BASE_CORE)).not.toThrow();
  });

  it("returns the parsed object with all fields", () => {
    const result = canonicalCoreSchema.parse(BASE_CORE);
    expect(result.idea_id).toBe("BC-IDEA-001");
    expect(result.thesis).toBe(BASE_CORE.thesis);
    expect(result.argument_chain).toHaveLength(2);
    expect(result.emotional_arc.opening_emotion).toBe("confusion");
    expect(result.key_stats).toHaveLength(1);
    expect(result.key_quotes).toHaveLength(1);
    expect(result.affiliate_moment?.cta_primary).toBeDefined();
    expect(result.cta_subscribe).toBeDefined();
    expect(result.cta_comment_prompt).toBeDefined();
  });

  it("accepts core without key_quotes (optional)", () => {
    const { key_quotes, ...withoutQuotes } = BASE_CORE;
    expect(() => canonicalCoreSchema.parse(withoutQuotes)).not.toThrow();
  });

  it("accepts core without affiliate_moment (optional)", () => {
    const { affiliate_moment, ...withoutAffiliate } = BASE_CORE;
    expect(() => canonicalCoreSchema.parse(withoutAffiliate)).not.toThrow();
  });
});

describe("canonicalCoreSchema — invalid input", () => {
  it("rejects core without idea_id", () => {
    const { idea_id, ...noId } = BASE_CORE;
    expect(() => canonicalCoreSchema.parse(noId)).toThrow();
  });

  it("rejects core without thesis", () => {
    const { thesis, ...noThesis } = BASE_CORE;
    expect(() => canonicalCoreSchema.parse(noThesis)).toThrow();
  });

  it("rejects core without argument_chain", () => {
    const { argument_chain, ...noChain } = BASE_CORE;
    expect(() => canonicalCoreSchema.parse(noChain)).toThrow();
  });

  it("rejects core with empty argument_chain (must have at least 1 step)", () => {
    expect(() =>
      canonicalCoreSchema.parse({ ...BASE_CORE, argument_chain: [] }),
    ).toThrow();
  });

  it("rejects argument_chain step without evidence", () => {
    const badChain = [{ step: 1, claim: "A claim" /* no evidence */ }];
    expect(() =>
      canonicalCoreSchema.parse({ ...BASE_CORE, argument_chain: badChain }),
    ).toThrow();
  });

  it("rejects core without emotional_arc", () => {
    const { emotional_arc, ...noArc } = BASE_CORE;
    expect(() => canonicalCoreSchema.parse(noArc)).toThrow();
  });

  it("rejects core without key_stats", () => {
    const { key_stats, ...noStats } = BASE_CORE;
    expect(() => canonicalCoreSchema.parse(noStats)).toThrow();
  });
});

describe("scoreCanonicalCore — completeness scoring", () => {
  it("returns score 100 for a fully populated core", () => {
    const result = scoreCanonicalCore(canonicalCoreSchema.parse(BASE_CORE));
    expect(result.score).toBe(100);
    expect(result.warnings).toHaveLength(0);
  });

  it("returns score < 100 and a warning when thesis exceeds 2 sentences", () => {
    const longThesis =
      "First sentence. Second sentence. Third sentence — this is too long.";
    const core = canonicalCoreSchema.parse({ ...BASE_CORE, thesis: longThesis });
    const result = scoreCanonicalCore(core);
    expect(result.score).toBeLessThan(100);
    expect(result.warnings.some((w) => w.includes("thesis"))).toBe(true);
  });

  it("returns a warning when argument_chain has only 1 step", () => {
    const core = canonicalCoreSchema.parse({
      ...BASE_CORE,
      argument_chain: [BASE_CORE.argument_chain[0]],
    });
    const result = scoreCanonicalCore(core);
    expect(result.warnings.some((w) => w.includes("argument"))).toBe(true);
  });

  it("returns a warning when key_stats is empty", () => {
    const core = canonicalCoreSchema.parse({ ...BASE_CORE, key_stats: [] });
    const result = scoreCanonicalCore(core);
    expect(result.warnings.some((w) => w.includes("stat"))).toBe(true);
  });

  it("returns a warning when affiliate_moment is missing", () => {
    const { affiliate_moment, ...withoutAffiliate } = BASE_CORE;
    const core = canonicalCoreSchema.parse(withoutAffiliate);
    const result = scoreCanonicalCore(core);
    expect(result.warnings.some((w) => w.includes("affiliate"))).toBe(true);
  });

  it("result has score (0-100), warnings array, and missing array", () => {
    const core = canonicalCoreSchema.parse(BASE_CORE);
    const result = scoreCanonicalCore(core);
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(Array.isArray(result.missing)).toBe(true);
  });
});
