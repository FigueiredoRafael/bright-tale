import { describe, it, expect } from "vitest";
import { engagementOutputSchema, type EngagementModuleOutput } from "../schema";
import { mapCanonicalCoreToEngagementInput } from "../mapper";
import { generateEngagementMarkdownExport } from "../exporter";
import { validateEngagement, type EngagementValidationResult } from "../validator";
import type { CanonicalCore } from "@brighttale/shared/types/agents";

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
  cta_comment_prompt: "Are you renting or buying? Tell us why below.",
};

const validEngagementOutput: EngagementModuleOutput = {
  pinned_comment: "Are you renting or buying? Tell us why below. And if this changed your mind, share it with someone who needs to hear the math.",
  community_post: "Hot take: for most people under 35, renting is the smarter financial choice.\n\nHere's the math that nobody shows you:\n- 8-10% gone in transaction costs the moment you buy\n- S&P 500: 10.7% CAGR vs home appreciation: 4.3%\n\nThe real question isn't rent vs buy — it's how long are you staying?\n\nWatch this week's video for the full breakdown.",
  twitter_thread: {
    hook_tweet: "Hot take: renting is smarter than buying for most people under 35.\n\nHere's the math thread nobody shows you. 🧵",
    thread_outline: [
      "The moment you buy a house, you're immediately 8-10% underwater (agent fees + closing costs). Most people don't hold long enough to recover it.",
      "Meanwhile, the renter who invested the equivalent down payment in an index fund? S&P 500 returned 10.7% CAGR over 10 years vs home appreciation of 4.3%.",
      "The break-even point on buying vs renting (accounting for opportunity cost) is typically 7-10 years. Most Americans move every 5.",
      "This isn't anti-homeownership. It's pro-math. Know your timeline before you sign.",
      "Full video breaking down all the numbers here: [link]. Subscribe if this surprised you.",
    ],
  },
};

// ─── Schema tests ─────────────────────────────────────────────────────────────

describe("engagementOutputSchema", () => {
  it("accepts a valid engagement output", () => {
    const result = engagementOutputSchema.safeParse(validEngagementOutput);
    expect(result.success).toBe(true);
  });

  it("requires pinned_comment", () => {
    const { pinned_comment: _, ...without } = validEngagementOutput;
    const result = engagementOutputSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("requires community_post", () => {
    const { community_post: _, ...without } = validEngagementOutput;
    const result = engagementOutputSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("requires twitter_thread with hook_tweet and thread_outline", () => {
    const bad = { ...validEngagementOutput, twitter_thread: { hook_tweet: "" } };
    const result = engagementOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("requires at least 1 tweet in thread_outline", () => {
    const bad = {
      ...validEngagementOutput,
      twitter_thread: { ...validEngagementOutput.twitter_thread, thread_outline: [] },
    };
    const result = engagementOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

// ─── Mapper tests ─────────────────────────────────────────────────────────────

describe("mapCanonicalCoreToEngagementInput", () => {
  it("returns idea_id and thesis", () => {
    const input = mapCanonicalCoreToEngagementInput(validCore);
    expect(input.idea_id).toBe("BC-IDEA-001");
    expect(input.thesis).toBe(validCore.thesis);
  });

  it("maps cta_comment_prompt as the pinned comment seed", () => {
    const input = mapCanonicalCoreToEngagementInput(validCore);
    expect(input.comment_prompt_seed).toBe("Are you renting or buying? Tell us why below.");
  });

  it("maps key_stats for social proof", () => {
    const input = mapCanonicalCoreToEngagementInput(validCore);
    expect(input.key_stats).toHaveLength(1);
  });

  it("maps cta_subscribe for community post and thread CTAs", () => {
    const input = mapCanonicalCoreToEngagementInput(validCore);
    expect(input.cta_subscribe).toBe(validCore.cta_subscribe);
  });

  it("maps emotional_arc closing_emotion for tone of community post", () => {
    const input = mapCanonicalCoreToEngagementInput(validCore);
    expect(input.closing_emotion).toBe("confidence");
  });

  it("handles core without cta_comment_prompt", () => {
    const coreNoCTA: CanonicalCore = { ...validCore, cta_comment_prompt: undefined };
    const input = mapCanonicalCoreToEngagementInput(coreNoCTA);
    expect(input.comment_prompt_seed).toBeUndefined();
  });
});

// ─── Exporter tests ───────────────────────────────────────────────────────────

describe("generateEngagementMarkdownExport", () => {
  it("produces a string with a pinned comment section", () => {
    const md = generateEngagementMarkdownExport(validEngagementOutput);
    expect(typeof md).toBe("string");
    expect(md).toContain("Pinned Comment");
  });

  it("includes the community post", () => {
    const md = generateEngagementMarkdownExport(validEngagementOutput);
    expect(md).toContain("Community Post");
    expect(md).toContain("Hot take");
  });

  it("includes the twitter thread hook", () => {
    const md = generateEngagementMarkdownExport(validEngagementOutput);
    expect(md).toContain("Twitter Thread");
    expect(md).toContain("renting is smarter than buying");
  });

  it("includes all thread tweets", () => {
    const md = generateEngagementMarkdownExport(validEngagementOutput);
    expect(md).toContain("8-10% underwater");
    expect(md).toContain("break-even point");
  });

  it("does not include 'undefined' literals", () => {
    const md = generateEngagementMarkdownExport(validEngagementOutput);
    expect(md).not.toContain("undefined");
  });
});

// ─── Validator tests ──────────────────────────────────────────────────────────

describe("validateEngagement", () => {
  it("returns valid for a complete engagement output", () => {
    const result: EngagementValidationResult = validateEngagement(validEngagementOutput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("errors when pinned_comment is empty", () => {
    const bad = { ...validEngagementOutput, pinned_comment: "" };
    const result = validateEngagement(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("pinned_comment"))).toBe(true);
  });

  it("errors when community_post is empty", () => {
    const bad = { ...validEngagementOutput, community_post: "" };
    const result = validateEngagement(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("community_post"))).toBe(true);
  });

  it("warns when thread has fewer than 3 tweets", () => {
    const bad = {
      ...validEngagementOutput,
      twitter_thread: {
        hook_tweet: validEngagementOutput.twitter_thread.hook_tweet,
        thread_outline: ["just one tweet"],
      },
    };
    const result = validateEngagement(bad);
    expect(result.warnings.some((w) => w.includes("thread") || w.includes("tweet"))).toBe(true);
  });

  it("warns when pinned_comment exceeds 500 characters", () => {
    const bad = { ...validEngagementOutput, pinned_comment: "A".repeat(550) };
    const result = validateEngagement(bad);
    expect(result.warnings.some((w) => w.includes("pinned_comment"))).toBe(true);
  });
});
