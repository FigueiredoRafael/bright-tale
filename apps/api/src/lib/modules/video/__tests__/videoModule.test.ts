import { describe, it, expect } from "vitest";
import { videoOutputSchema, type VideoModuleOutput } from "../schema";
import { mapCanonicalCoreToVideoInput } from "../mapper";
import { generateVideoMarkdownExport } from "../exporter";
import { validateVideo, type VideoValidationResult } from "../validator";
import type { CanonicalCore } from "@/types/agents";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const validCore: CanonicalCore = {
  idea_id: "BC-IDEA-001",
  thesis: "Renting beats buying for people who move every 3-5 years.",
  argument_chain: [
    { step: 1, claim: "Transaction costs eat 8-10% of home value.", evidence: "NAR data: 6% fees + 2-4% closing.", source_ids: ["SRC-001"] },
    { step: 2, claim: "Renters can invest the difference and match home equity.", evidence: "Vanguard: S&P 500 CAGR 10.7% vs home appreciation 4.3%.", source_ids: ["SRC-002"] },
  ],
  emotional_arc: {
    opening_emotion: "confusion",
    turning_point: "clarity",
    closing_emotion: "confidence",
  },
  key_stats: [
    { stat: "Transaction cost", figure: "8-10% of home value", source_id: "SRC-001" },
  ],
  affiliate_moment: {
    trigger_context: "After step 2.",
    product_angle: "Use a robo-advisor to invest the rent difference.",
    cta_primary: "Start investing with [Partner].",
  },
  cta_subscribe: "Subscribe for weekly real estate myths.",
  cta_comment_prompt: "Are you renting or buying?",
};

const validVideoOutput: VideoModuleOutput = {
  title_options: [
    "Why Renters Always Win (The Math Nobody Shows You)",
    "Stop Blaming Yourself For Renting — Here's The Truth",
    "The Real Cost of Buying a Home No One Talks About",
  ],
  thumbnail: {
    visual_concept: "Split screen: stressed buyer signing papers vs relaxed renter investing.",
    text_overlay: "RENTING WINS?",
    emotion: "curiosity",
    why_it_works: "Creates cognitive dissonance — challenges conventional wisdom.",
  },
  script: {
    hook: { duration: "0:00-0:30", content: "What if I told you renting is the smarter choice?", visual_notes: "Host in frame, direct to camera.", sound_effects: "none", background_music: "calm ambient" },
    problem: { duration: "0:30-1:30", content: "Everyone says you must buy to build wealth. But is that true?", visual_notes: "Infographic of housing costs.", background_music: "calm ambient" },
    teaser: { duration: "1:30-2:00", content: "Stay until the end — the math might surprise you.", visual_notes: "Cut to stats graphic." },
    chapters: [
      {
        chapter_number: 1,
        title: "The Hidden 8-10% Tax",
        duration: "2:00-5:00",
        content: "When you buy a home, you immediately lose 8-10% to transaction costs.",
        b_roll_suggestions: ["Real estate documents", "Calculator showing fees"],
        key_stat_or_quote: "NAR: average 8-10% in fees and closing costs.",
      },
      {
        chapter_number: 2,
        title: "The Investing Alternative",
        duration: "5:00-8:00",
        content: "Renters who invest the difference in an index fund consistently build equivalent wealth.",
        b_roll_suggestions: ["Stock market graphs", "Vanguard app screenshot"],
        key_stat_or_quote: "S&P 500 10-year CAGR: 10.7% vs home appreciation 4.3%.",
      },
    ],
    affiliate_segment: {
      timestamp: "8:00",
      script: "That brings me to [Partner] — the easiest way to automate this.",
      transition_in: "Speaking of investing the difference...",
      transition_out: "Anyway, back to the main point.",
      visual_notes: "Product logo on screen.",
    },
    outro: {
      duration: "8:30-9:00",
      recap: "Renting is not losing — it's a strategy when you do it right.",
      cta: "Subscribe for weekly real estate myths debunked.",
      end_screen_prompt: "Watch this video next.",
      background_music: "upbeat outro",
    },
  },
  total_duration_estimate: "9:00",
};

// ─── Schema tests ─────────────────────────────────────────────────────────────

describe("videoOutputSchema", () => {
  it("accepts a valid video output", () => {
    const result = videoOutputSchema.safeParse(validVideoOutput);
    expect(result.success).toBe(true);
  });

  it("requires at least 1 title option", () => {
    const bad = { ...validVideoOutput, title_options: [] };
    const result = videoOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("accepts video without thumbnail (optional)", () => {
    const { thumbnail: _, ...withoutThumb } = validVideoOutput;
    const result = videoOutputSchema.safeParse(withoutThumb);
    expect(result.success).toBe(true);
  });

  it("normalizes thumbnail emotion to lowercase", () => {
    const mixed = {
      ...validVideoOutput,
      thumbnail: { ...validVideoOutput.thumbnail!, emotion: "Curiosity" },
    };
    const result = videoOutputSchema.safeParse(mixed);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.thumbnail?.emotion).toBe("curiosity");
    }
  });

  it("rejects invalid thumbnail emotion", () => {
    const bad = {
      ...validVideoOutput,
      thumbnail: { ...validVideoOutput.thumbnail!, emotion: "happy" },
    };
    const result = videoOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("requires at least 1 chapter in script", () => {
    const bad = {
      ...validVideoOutput,
      script: { ...validVideoOutput.script, chapters: [] },
    };
    const result = videoOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

// ─── Mapper tests ─────────────────────────────────────────────────────────────

describe("mapCanonicalCoreToVideoInput", () => {
  it("returns idea_id, thesis, and argument_chain", () => {
    const input = mapCanonicalCoreToVideoInput(validCore);
    expect(input.idea_id).toBe("BC-IDEA-001");
    expect(input.thesis).toBe(validCore.thesis);
    expect(input.argument_chain).toHaveLength(2);
  });

  it("maps emotional_arc for video structure", () => {
    const input = mapCanonicalCoreToVideoInput(validCore);
    expect(input.emotional_arc.opening_emotion).toBe("confusion");
    expect(input.emotional_arc.turning_point).toBe("clarity");
  });

  it("maps affiliate_moment to video affiliate context", () => {
    const input = mapCanonicalCoreToVideoInput(validCore);
    expect(input.affiliate_context?.cta_primary).toBe("Start investing with [Partner].");
  });

  it("handles core without affiliate_moment", () => {
    const coreNoAffiliate: CanonicalCore = { ...validCore, affiliate_moment: undefined };
    const input = mapCanonicalCoreToVideoInput(coreNoAffiliate);
    expect(input.affiliate_context).toBeUndefined();
  });

  it("passes video_style_config through when provided", () => {
    const styleConfig = { template: "talking_head_dynamic" as const };
    const input = mapCanonicalCoreToVideoInput(validCore, styleConfig);
    expect(input.video_style_config).toEqual(styleConfig);
  });

  it("omits video_style_config when not provided", () => {
    const input = mapCanonicalCoreToVideoInput(validCore);
    expect(input.video_style_config).toBeUndefined();
  });
});

// ─── Exporter tests ───────────────────────────────────────────────────────────

describe("generateVideoMarkdownExport", () => {
  it("produces a string starting with the first title option", () => {
    const md = generateVideoMarkdownExport(validVideoOutput);
    expect(typeof md).toBe("string");
    expect(md).toContain("Why Renters Always Win");
  });

  it("includes total_duration_estimate", () => {
    const md = generateVideoMarkdownExport(validVideoOutput);
    expect(md).toContain("9:00");
  });

  it("includes all chapter titles", () => {
    const md = generateVideoMarkdownExport(validVideoOutput);
    expect(md).toContain("The Hidden 8-10% Tax");
    expect(md).toContain("The Investing Alternative");
  });

  it("includes affiliate segment script", () => {
    const md = generateVideoMarkdownExport(validVideoOutput);
    expect(md).toContain("Partner");
  });

  it("does not include 'undefined' literals", () => {
    const md = generateVideoMarkdownExport(validVideoOutput);
    expect(md).not.toContain("undefined");
  });
});

// ─── Validator tests ──────────────────────────────────────────────────────────

describe("validateVideo", () => {
  it("returns valid for a complete video", () => {
    const result: VideoValidationResult = validateVideo(validVideoOutput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("errors when title_options is empty", () => {
    const bad = { ...validVideoOutput, title_options: [] };
    const result = validateVideo(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("title_options"))).toBe(true);
  });

  it("warns when fewer than 3 title options are provided", () => {
    const bad = { ...validVideoOutput, title_options: ["Only one title"] };
    const result = validateVideo(bad);
    expect(result.warnings.some((w) => w.includes("title"))).toBe(true);
  });

  it("errors when script has no chapters", () => {
    const bad = { ...validVideoOutput, script: { ...validVideoOutput.script, chapters: [] } };
    const result = validateVideo(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("chapter"))).toBe(true);
  });

  it("warns when a chapter has no b_roll_suggestions", () => {
    const bad = {
      ...validVideoOutput,
      script: {
        ...validVideoOutput.script,
        chapters: [
          { ...validVideoOutput.script.chapters[0], b_roll_suggestions: [] },
          validVideoOutput.script.chapters[1],
        ],
      },
    };
    const result = validateVideo(bad);
    expect(result.warnings.some((w) => w.includes("b_roll"))).toBe(true);
  });
});
