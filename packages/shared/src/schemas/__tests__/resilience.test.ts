import { describe, it, expect } from "vitest";
import { shortItemSchema } from "../shorts";
import { createVideoSchema } from "../videos";

describe("Shorts and Video Schema Resilience", () => {
  describe("shortItemSchema.visual_style", () => {
    it("should accept valid single options", () => {
      const result = shortItemSchema.safeParse({
        short_number: 1,
        title: "Test",
        hook: "Hook",
        script: "Script",
        duration: "15s",
        visual_style: "talking head",
        cta: "CTA"
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.visual_style).toBe("talking head");
      }
    });

    it("should normalize and accept variations", () => {
      const result = shortItemSchema.safeParse({
        short_number: 1,
        title: "Test",
        hook: "Hook",
        script: "Script",
        duration: "15s",
        visual_style: "B ROLL",
        cta: "CTA"
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.visual_style).toBe("b-roll");
      }
    });

    it("should handle pipe-separated template strings by picking the first valid option", () => {
      const result = shortItemSchema.safeParse({
        short_number: 1,
        title: "Test",
        hook: "Hook",
        script: "Script",
        duration: "15s",
        visual_style: "talking head|b-roll|text overlay",
        cta: "CTA"
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.visual_style).toBe("talking head");
      }
    });

    it("should fail for invalid options and show available options in the error", () => {
      const result = shortItemSchema.safeParse({
        short_number: 1,
        title: "Test",
        hook: "Hook",
        script: "Script",
        duration: "15s",
        visual_style: "invalid-style",
        cta: "CTA"
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues[0];
        expect(issue.code).toBe("invalid_enum_value");
      }
    });
  });

  describe("createVideoSchema.thumbnail.emotion", () => {
    it("should handle pipe-separated template strings for emotion", () => {
      const videoData = {
        title: "Test Video",
        title_options: ["Test Title"],
        thumbnail: {
          visual_concept: "Concept",
          text_overlay: "Overlay",
          emotion: "curiosity|shock|intrigue",
          why_it_works: "Reason"
        },
        script: {
          hook: { duration: "10s", content: "Hook", visual_notes: "Notes" },
          problem: { duration: "20s", content: "Problem", visual_notes: "Notes" },
          teaser: { duration: "10s", content: "Teaser", visual_notes: "Notes" },
          chapters: []
        },
        total_duration_estimate: "1m"
      };

      const result = createVideoSchema.safeParse(videoData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.thumbnail?.emotion).toBe("curiosity");
      }
    });
  });
});
