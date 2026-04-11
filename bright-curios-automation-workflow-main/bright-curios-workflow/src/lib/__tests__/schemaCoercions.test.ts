/**
 * Tests for Zod schema coercions across production schemas
 * Verifies that LLM output variants (wrong case, underscores) are normalized
 */
import { describe, it, expect } from "vitest";
import { productionShortsSchema, productionVideoSchema } from "../schemas/agents";

describe("productionShortsSchema — visual_style coercion", () => {
  const baseShort = {
    short_number: 1,
    title: "Test Short",
    hook: "hook text",
    script: "script text",
    duration: "0:45",
    cta: "subscribe",
  };

  it("accepts canonical 'talking head' unchanged", () => {
    const result = productionShortsSchema.safeParse({ ...baseShort, visual_style: "talking head" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.visual_style).toBe("talking head");
  });

  it("normalizes 'talking_head' (underscore) → 'talking head'", () => {
    const result = productionShortsSchema.safeParse({ ...baseShort, visual_style: "talking_head" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.visual_style).toBe("talking head");
  });

  it("normalizes 'Talking Head' (title case) → 'talking head'", () => {
    const result = productionShortsSchema.safeParse({ ...baseShort, visual_style: "Talking Head" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.visual_style).toBe("talking head");
  });

  it("normalizes 'b_roll' (underscore) → 'b-roll'", () => {
    const result = productionShortsSchema.safeParse({ ...baseShort, visual_style: "b_roll" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.visual_style).toBe("b-roll");
  });

  it("normalizes 'B-Roll' (title case) → 'b-roll'", () => {
    const result = productionShortsSchema.safeParse({ ...baseShort, visual_style: "B-Roll" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.visual_style).toBe("b-roll");
  });

  it("normalizes 'text_overlay' (underscore) → 'text overlay'", () => {
    const result = productionShortsSchema.safeParse({ ...baseShort, visual_style: "text_overlay" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.visual_style).toBe("text overlay");
  });

  it("normalizes 'Text Overlay' (title case) → 'text overlay'", () => {
    const result = productionShortsSchema.safeParse({ ...baseShort, visual_style: "Text Overlay" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.visual_style).toBe("text overlay");
  });

  it("rejects unknown visual_style values", () => {
    const result = productionShortsSchema.safeParse({ ...baseShort, visual_style: "animated" });
    expect(result.success).toBe(false);
  });
});

describe("productionVideoSchema — thumbnail emotion coercion", () => {
  const baseVideo = {
    title_options: ["Title A", "Title B", "Title C"],
    total_duration_estimate: "8:00",
  };

  const baseThumbnail = {
    visual_concept: "host pointing at text",
    text_overlay: "The Truth",
    why_it_works: "creates curiosity",
  };

  it("accepts canonical 'curiosity' unchanged", () => {
    const result = productionVideoSchema.safeParse({
      ...baseVideo,
      thumbnail: { ...baseThumbnail, emotion: "curiosity" },
    });
    expect(result.success).toBe(true);
  });

  it("normalizes 'Curiosity' (title case) → 'curiosity'", () => {
    const result = productionVideoSchema.safeParse({
      ...baseVideo,
      thumbnail: { ...baseThumbnail, emotion: "Curiosity" },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.thumbnail?.emotion).toBe("curiosity");
  });

  it("normalizes 'SHOCK' (uppercase) → 'shock'", () => {
    const result = productionVideoSchema.safeParse({
      ...baseVideo,
      thumbnail: { ...baseThumbnail, emotion: "SHOCK" },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.thumbnail?.emotion).toBe("shock");
  });

  it("normalizes 'Intrigue' (title case) → 'intrigue'", () => {
    const result = productionVideoSchema.safeParse({
      ...baseVideo,
      thumbnail: { ...baseThumbnail, emotion: "Intrigue" },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.thumbnail?.emotion).toBe("intrigue");
  });

  it("rejects unknown emotion values", () => {
    const result = productionVideoSchema.safeParse({
      ...baseVideo,
      thumbnail: { ...baseThumbnail, emotion: "fear" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts video without thumbnail (thumbnail is optional)", () => {
    const result = productionVideoSchema.safeParse(baseVideo);
    expect(result.success).toBe(true);
  });
});
