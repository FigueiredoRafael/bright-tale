/**
 * Tests for VideoStyleConfig type and Zod schema
 */
import { describe, it, expect } from "vitest";
import { videoStyleConfigSchema, type VideoStyleConfig, type VideoStyleConfigInput } from "@brighttale/shared/schemas/videoStyle";

describe("videoStyleConfigSchema — valid configs", () => {
  it("accepts talking_head_standard template with defaults", () => {
    const config: VideoStyleConfigInput = { template: "talking_head_standard" };
    expect(() => videoStyleConfigSchema.parse(config)).not.toThrow();
  });

  it("accepts talking_head_dynamic template", () => {
    const result = videoStyleConfigSchema.parse({ template: "talking_head_dynamic" });
    expect(result.template).toBe("talking_head_dynamic");
  });

  it("accepts b_roll_documentary template", () => {
    const result = videoStyleConfigSchema.parse({ template: "b_roll_documentary" });
    expect(result.template).toBe("b_roll_documentary");
  });

  it("accepts screen_record_tutorial template", () => {
    const result = videoStyleConfigSchema.parse({ template: "screen_record_tutorial" });
    expect(result.template).toBe("screen_record_tutorial");
  });

  it("accepts hybrid template", () => {
    const result = videoStyleConfigSchema.parse({ template: "hybrid" });
    expect(result.template).toBe("hybrid");
  });

  it("accepts full config with all optional settings", () => {
    const config = {
      template: "talking_head_dynamic",
      cut_frequency: "fast",
      b_roll_density: "medium",
      text_overlays: "heavy",
      music_style: "energetic",
      presenter_notes: true,
    };
    const result = videoStyleConfigSchema.parse(config);
    expect(result.cut_frequency).toBe("fast");
    expect(result.text_overlays).toBe("heavy");
  });

  it("accepts b_roll_documentary with b_roll_required flag", () => {
    const config = {
      template: "b_roll_documentary",
      b_roll_density: "high",
      voiceover_style: "narrative",
      music_style: "cinematic",
      b_roll_required: true,
    };
    const result = videoStyleConfigSchema.parse(config);
    expect(result.b_roll_required).toBe(true);
  });
});

describe("videoStyleConfigSchema — defaults", () => {
  it("defaults cut_frequency to 'moderate' when not provided", () => {
    const result = videoStyleConfigSchema.parse({ template: "talking_head_standard" });
    expect(result.cut_frequency).toBe("moderate");
  });

  it("defaults b_roll_density to 'low' when not provided", () => {
    const result = videoStyleConfigSchema.parse({ template: "talking_head_standard" });
    expect(result.b_roll_density).toBe("low");
  });

  it("defaults text_overlays to 'minimal' when not provided", () => {
    const result = videoStyleConfigSchema.parse({ template: "talking_head_standard" });
    expect(result.text_overlays).toBe("minimal");
  });

  it("defaults music_style to 'calm_ambient' when not provided", () => {
    const result = videoStyleConfigSchema.parse({ template: "talking_head_standard" });
    expect(result.music_style).toBe("calm_ambient");
  });

  it("defaults presenter_notes to false when not provided", () => {
    const result = videoStyleConfigSchema.parse({ template: "talking_head_standard" });
    expect(result.presenter_notes).toBe(false);
  });

  it("defaults b_roll_required to false when not provided", () => {
    const result = videoStyleConfigSchema.parse({ template: "b_roll_documentary" });
    expect(result.b_roll_required).toBe(false);
  });
});

describe("videoStyleConfigSchema — invalid configs", () => {
  it("rejects unknown template value", () => {
    expect(() => videoStyleConfigSchema.parse({ template: "unknown_style" })).toThrow();
  });

  it("rejects missing template field", () => {
    expect(() => videoStyleConfigSchema.parse({})).toThrow();
  });

  it("rejects invalid cut_frequency value", () => {
    expect(() =>
      videoStyleConfigSchema.parse({ template: "talking_head_standard", cut_frequency: "ultra_fast" }),
    ).toThrow();
  });

  it("rejects invalid music_style value", () => {
    expect(() =>
      videoStyleConfigSchema.parse({ template: "talking_head_standard", music_style: "jazz" }),
    ).toThrow();
  });
});
