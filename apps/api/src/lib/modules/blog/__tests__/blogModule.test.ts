import { describe, it, expect } from "vitest";
import { blogOutputSchema, type BlogModuleOutput } from "../schema";
import { mapCanonicalCoreToBlogInput } from "../mapper";
import { generateBlogMarkdownExport } from "../exporter";
import { validateBlog, type BlogValidationResult } from "../validator";
import type { CanonicalCore } from "@/types/agents";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const validCore: CanonicalCore = {
  idea_id: "BC-IDEA-001",
  thesis: "Renting is smarter than buying for people who move every 3-5 years.",
  argument_chain: [
    {
      step: 1,
      claim: "Transaction costs of buying eat 8-10% of home value.",
      evidence: "NAR data: 6% agent fees + 2-4% closing costs = 8-10% average.",
      source_ids: ["SRC-001"],
    },
    {
      step: 2,
      claim: "Renters can invest the difference and match or beat home equity.",
      evidence: "Vanguard study: S&P 500 10-year CAGR (10.7%) vs median home appreciation (4.3%).",
      source_ids: ["SRC-002"],
    },
  ],
  emotional_arc: {
    opening_emotion: "confusion",
    turning_point: "clarity",
    closing_emotion: "confidence",
  },
  key_stats: [
    { stat: "Average transaction cost", figure: "8-10% of home value", source_id: "SRC-001" },
    { stat: "S&P 500 10-year CAGR", figure: "10.7%", source_id: "SRC-002" },
  ],
  key_quotes: [
    { quote: "Buying a home is not always a good investment.", author: "Robert Shiller", credentials: "Nobel Prize economist" },
  ],
  affiliate_moment: {
    trigger_context: "After step 2, when reader understands investment alternatives.",
    product_angle: "Use a robo-advisor to invest the rent difference automatically.",
    cta_primary: "Start investing with [Partner] — no minimums.",
  },
  cta_subscribe: "Subscribe for weekly real estate myths debunked.",
  cta_comment_prompt: "Are you renting or buying? Tell us why below.",
};

const validBlogOutput: BlogModuleOutput = {
  title: "Why Renting Is Smarter Than Buying If You Move Every Few Years",
  slug: "renting-vs-buying-short-term",
  meta_description: "Think buying is always better than renting? For people who move every 3-5 years, renting wins every time. Here's the math.",
  primary_keyword: "renting vs buying",
  secondary_keywords: ["rent or buy calculator", "should I buy a house", "home buying costs"],
  outline: [
    { h2: "The Hidden Transaction Costs of Buying", key_points: ["Agent fees", "Closing costs"], word_count_target: 400 },
    { h2: "How Renters Can Build Equal Wealth", key_points: ["Index fund returns", "Compounding"], word_count_target: 500 },
  ],
  full_draft: "## The Hidden Transaction Costs of Buying\n\nWhen you buy a home, you don't just pay the purchase price...\n\n## How Renters Can Build Equal Wealth\n\nInvesting the rent difference in an index fund...",
  affiliate_integration: {
    placement: "middle",
    copy: "Use [Partner] to automatically invest the difference between renting and buying.",
    product_link_placeholder: "[AFFILIATE_LINK]",
    rationale: "Positioned after the investment returns section for contextual relevance.",
  },
  internal_links_suggested: [
    { topic: "mortgage calculator", anchor_text: "use our mortgage calculator" },
  ],
  word_count: 1800,
};

// ─── Schema tests ─────────────────────────────────────────────────────────────

describe("blogOutputSchema", () => {
  it("accepts a valid blog output", () => {
    const result = blogOutputSchema.safeParse(validBlogOutput);
    expect(result.success).toBe(true);
  });

  it("accepts blog without optional internal_links_suggested", () => {
    const { internal_links_suggested: _, ...withoutLinks } = validBlogOutput;
    const result = blogOutputSchema.safeParse({ ...withoutLinks, internal_links_suggested: [] });
    expect(result.success).toBe(true);
  });

  it("rejects blog with missing title", () => {
    const { title: _, ...withoutTitle } = validBlogOutput;
    const result = blogOutputSchema.safeParse(withoutTitle);
    expect(result.success).toBe(false);
  });

  it("rejects blog with missing full_draft", () => {
    const { full_draft: _, ...withoutDraft } = validBlogOutput;
    const result = blogOutputSchema.safeParse(withoutDraft);
    expect(result.success).toBe(false);
  });

  it("rejects invalid affiliate placement", () => {
    const bad = {
      ...validBlogOutput,
      affiliate_integration: { ...validBlogOutput.affiliate_integration, placement: "sidebar" },
    };
    const result = blogOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("normalizes placement string to lowercase", () => {
    const mixed = {
      ...validBlogOutput,
      affiliate_integration: { ...validBlogOutput.affiliate_integration, placement: "Middle" },
    };
    const result = blogOutputSchema.safeParse(mixed);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.affiliate_integration.placement).toBe("middle");
    }
  });
});

// ─── Mapper tests ─────────────────────────────────────────────────────────────

describe("mapCanonicalCoreToBlogInput", () => {
  it("returns an object with idea_id, thesis, and argument_chain", () => {
    const input = mapCanonicalCoreToBlogInput(validCore);
    expect(input.idea_id).toBe("BC-IDEA-001");
    expect(input.thesis).toBe(validCore.thesis);
    expect(input.argument_chain).toHaveLength(2);
  });

  it("maps key_stats to blog stats array", () => {
    const input = mapCanonicalCoreToBlogInput(validCore);
    expect(input.key_stats).toHaveLength(2);
    expect(input.key_stats[0].figure).toBe("8-10% of home value");
  });

  it("maps affiliate_moment to affiliate context", () => {
    const input = mapCanonicalCoreToBlogInput(validCore);
    expect(input.affiliate_context).toBeDefined();
    expect(input.affiliate_context?.product_angle).toBe(validCore.affiliate_moment?.product_angle);
  });

  it("maps emotional_arc for tone guidance", () => {
    const input = mapCanonicalCoreToBlogInput(validCore);
    expect(input.emotional_arc.opening_emotion).toBe("confusion");
    expect(input.emotional_arc.closing_emotion).toBe("confidence");
  });

  it("handles core without affiliate_moment gracefully", () => {
    const coreNoAffiliate: CanonicalCore = { ...validCore, affiliate_moment: undefined };
    const input = mapCanonicalCoreToBlogInput(coreNoAffiliate);
    expect(input.affiliate_context).toBeUndefined();
  });

  it("includes cta_subscribe and cta_comment_prompt", () => {
    const input = mapCanonicalCoreToBlogInput(validCore);
    expect(input.cta_subscribe).toBe(validCore.cta_subscribe);
    expect(input.cta_comment_prompt).toBe(validCore.cta_comment_prompt);
  });
});

// ─── Exporter tests ───────────────────────────────────────────────────────────

describe("generateBlogMarkdownExport", () => {
  it("produces a string starting with the title", () => {
    const md = generateBlogMarkdownExport(validBlogOutput);
    expect(typeof md).toBe("string");
    expect(md).toContain("# Why Renting Is Smarter Than Buying");
  });

  it("includes the meta description", () => {
    const md = generateBlogMarkdownExport(validBlogOutput);
    expect(md).toContain(validBlogOutput.meta_description);
  });

  it("includes the full draft content", () => {
    const md = generateBlogMarkdownExport(validBlogOutput);
    expect(md).toContain("Hidden Transaction Costs");
  });

  it("includes affiliate copy", () => {
    const md = generateBlogMarkdownExport(validBlogOutput);
    expect(md).toContain("automatically invest");
  });

  it("does not include 'undefined' literals in output", () => {
    const md = generateBlogMarkdownExport(validBlogOutput);
    expect(md).not.toContain("undefined");
  });
});

// ─── Validator tests ──────────────────────────────────────────────────────────

describe("validateBlog", () => {
  it("returns valid for a complete blog", () => {
    const result: BlogValidationResult = validateBlog(validBlogOutput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("warns when word_count diverges significantly from actual draft word count", () => {
    // validBlogOutput declares word_count: 1800 but full_draft is ~30 words — big delta
    const result = validateBlog(validBlogOutput);
    expect(result.warnings.some((w) => w.includes("word_count"))).toBe(true);
  });

  it("errors when slug contains uppercase or spaces", () => {
    const blog = { ...validBlogOutput, slug: "Renting vs Buying" };
    const result = validateBlog(blog);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("slug"))).toBe(true);
  });

  it("warns when meta_description exceeds 160 characters", () => {
    const blog = {
      ...validBlogOutput,
      meta_description: "A".repeat(165),
    };
    const result = validateBlog(blog);
    expect(result.warnings.some((w) => w.includes("meta_description"))).toBe(true);
  });

  it("errors when full_draft is empty", () => {
    const blog = { ...validBlogOutput, full_draft: "" };
    const result = validateBlog(blog);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("full_draft"))).toBe(true);
  });

  it("errors when outline is empty", () => {
    const blog = { ...validBlogOutput, outline: [] };
    const result = validateBlog(blog);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("outline"))).toBe(true);
  });
});
