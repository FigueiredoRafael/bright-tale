import { describe, it, expect } from "vitest";
import { podcastOutputSchema, type PodcastModuleOutput } from "../schema";
import { mapCanonicalCoreToPodcastInput } from "../mapper";
import { generatePodcastMarkdownExport } from "../exporter";
import { validatePodcast, type PodcastValidationResult } from "../validator";
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
  key_quotes: [
    { quote: "Buying a home is not always a good investment.", author: "Robert Shiller", credentials: "Nobel economist" },
  ],
  cta_subscribe: "Subscribe for weekly real estate myths.",
  cta_comment_prompt: "Are you renting or buying?",
};

const validPodcastOutput: PodcastModuleOutput = {
  episode_title: "Renting vs Buying: The Math Nobody Shows You",
  episode_description: "In this episode we break down the actual numbers behind the renting vs buying debate. Spoiler: it's not as simple as your parents told you.",
  intro_hook: "What if I told you that for millions of Americans, renting is the mathematically superior choice? Today we're going to prove it.",
  talking_points: [
    { point: "The 8-10% transaction cost nobody mentions", notes: "Cover NAR data on agent fees and closing costs." },
    { point: "The investment alternative thesis", notes: "S&P 500 vs home appreciation over 10 years." },
    { point: "The break-even timeline myth", notes: "Most people sell before they break even on transaction costs." },
  ],
  personal_angle: "I rented for 8 years while everyone told me I was wasting money. Then I ran the numbers.",
  guest_questions: [
    "What would you tell someone who says 'renting is throwing money away'?",
    "At what timeline does buying finally beat renting?",
  ],
  outro: "The renting vs buying debate is really a question of time horizon and opportunity cost. Know the math before you decide.",
  duration_estimate: "35:00",
};

// ─── Schema tests ─────────────────────────────────────────────────────────────

describe("podcastOutputSchema", () => {
  it("accepts a valid podcast output", () => {
    const result = podcastOutputSchema.safeParse(validPodcastOutput);
    expect(result.success).toBe(true);
  });

  it("requires at least 1 talking point", () => {
    const bad = { ...validPodcastOutput, talking_points: [] };
    const result = podcastOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("accepts podcast without optional guest_questions", () => {
    const { guest_questions: _, ...withoutGuest } = validPodcastOutput;
    const result = podcastOutputSchema.safeParse(withoutGuest);
    expect(result.success).toBe(true);
  });

  it("accepts podcast without optional duration_estimate", () => {
    const { duration_estimate: _, ...withoutDuration } = validPodcastOutput;
    const result = podcastOutputSchema.safeParse(withoutDuration);
    expect(result.success).toBe(true);
  });

  it("rejects podcast missing episode_title", () => {
    const { episode_title: _, ...withoutTitle } = validPodcastOutput;
    const result = podcastOutputSchema.safeParse(withoutTitle);
    expect(result.success).toBe(false);
  });

  it("rejects podcast missing intro_hook", () => {
    const { intro_hook: _, ...withoutHook } = validPodcastOutput;
    const result = podcastOutputSchema.safeParse(withoutHook);
    expect(result.success).toBe(false);
  });

  it("rejects podcast missing outro", () => {
    const { outro: _, ...withoutOutro } = validPodcastOutput;
    const result = podcastOutputSchema.safeParse(withoutOutro);
    expect(result.success).toBe(false);
  });
});

// ─── Mapper tests ─────────────────────────────────────────────────────────────

describe("mapCanonicalCoreToPodcastInput", () => {
  it("returns idea_id and thesis", () => {
    const input = mapCanonicalCoreToPodcastInput(validCore);
    expect(input.idea_id).toBe("BC-IDEA-001");
    expect(input.thesis).toBe(validCore.thesis);
  });

  it("maps argument_chain as talking_point_seeds", () => {
    const input = mapCanonicalCoreToPodcastInput(validCore);
    expect(input.talking_point_seeds).toHaveLength(2);
    expect(input.talking_point_seeds[0].claim).toBe("Transaction costs eat 8-10% of home value.");
  });

  it("maps key_quotes for expert citations", () => {
    const input = mapCanonicalCoreToPodcastInput(validCore);
    expect(input.key_quotes).toHaveLength(1);
    expect(input.key_quotes![0].author).toBe("Robert Shiller");
  });

  it("maps emotional_arc for tone guidance", () => {
    const input = mapCanonicalCoreToPodcastInput(validCore);
    expect(input.emotional_arc.opening_emotion).toBe("confusion");
    expect(input.emotional_arc.closing_emotion).toBe("confidence");
  });

  it("handles core without key_quotes", () => {
    const coreNoQuotes: CanonicalCore = { ...validCore, key_quotes: undefined };
    const input = mapCanonicalCoreToPodcastInput(coreNoQuotes);
    expect(input.key_quotes).toBeUndefined();
  });

  it("includes cta_subscribe for outro guidance", () => {
    const input = mapCanonicalCoreToPodcastInput(validCore);
    expect(input.cta_subscribe).toBe(validCore.cta_subscribe);
  });
});

// ─── Exporter tests ───────────────────────────────────────────────────────────

describe("generatePodcastMarkdownExport", () => {
  it("produces a string with the episode title", () => {
    const md = generatePodcastMarkdownExport(validPodcastOutput);
    expect(typeof md).toBe("string");
    expect(md).toContain("Renting vs Buying: The Math Nobody Shows You");
  });

  it("includes all talking point headers", () => {
    const md = generatePodcastMarkdownExport(validPodcastOutput);
    expect(md).toContain("The 8-10% transaction cost");
    expect(md).toContain("The investment alternative thesis");
  });

  it("includes the personal angle", () => {
    const md = generatePodcastMarkdownExport(validPodcastOutput);
    expect(md).toContain("8 years");
  });

  it("includes guest questions when present", () => {
    const md = generatePodcastMarkdownExport(validPodcastOutput);
    expect(md).toContain("throwing money away");
  });

  it("does not include 'undefined' literals", () => {
    const md = generatePodcastMarkdownExport(validPodcastOutput);
    expect(md).not.toContain("undefined");
  });
});

// ─── Validator tests ──────────────────────────────────────────────────────────

describe("validatePodcast", () => {
  it("returns valid for a complete podcast", () => {
    const result: PodcastValidationResult = validatePodcast(validPodcastOutput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("errors when talking_points is empty", () => {
    const bad = { ...validPodcastOutput, talking_points: [] };
    const result = validatePodcast(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("talking_point"))).toBe(true);
  });

  it("errors when intro_hook is empty", () => {
    const bad = { ...validPodcastOutput, intro_hook: "" };
    const result = validatePodcast(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("intro_hook"))).toBe(true);
  });

  it("warns when fewer than 3 talking points are provided", () => {
    const bad = { ...validPodcastOutput, talking_points: [validPodcastOutput.talking_points[0]] };
    const result = validatePodcast(bad);
    expect(result.warnings.some((w) => w.includes("talking_point") || w.includes("3"))).toBe(true);
  });

  it("warns when duration_estimate is missing", () => {
    const bad = { ...validPodcastOutput, duration_estimate: undefined };
    const result = validatePodcast(bad);
    expect(result.warnings.some((w) => w.includes("duration"))).toBe(true);
  });
});
