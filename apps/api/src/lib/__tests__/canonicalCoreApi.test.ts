/**
 * Tests for CanonicalCore API schema validation
 * Verifies create/update payloads parse correctly before hitting the database
 */
import { describe, it, expect } from "vitest";
import {
  createCanonicalCoreSchema,
  updateCanonicalCoreSchema,
} from "@brighttale/shared/schemas/canonicalCoreApi";

const VALID_CREATE = {
  idea_id: "BC-IDEA-001",
  project_id: "proj-abc",
  thesis: "The buy-vs-rent debate ignores time horizon.",
  argument_chain: [
    {
      step: 1,
      claim: "Buying is cheaper long-term.",
      evidence: "Study: owners have 40% more net worth after 10 years.",
      source_ids: ["SRC-001"],
    },
  ],
  emotional_arc: {
    opening_emotion: "confusion",
    turning_point: "clarity",
    closing_emotion: "confidence",
  },
  key_stats: [{ stat: "Net worth gap", figure: "40%", source_id: "SRC-001" }],
};

describe("createCanonicalCoreSchema", () => {
  it("accepts a valid create payload", () => {
    expect(() => createCanonicalCoreSchema.parse(VALID_CREATE)).not.toThrow();
  });

  it("requires idea_id", () => {
    const { idea_id, ...rest } = VALID_CREATE;
    expect(() => createCanonicalCoreSchema.parse(rest)).toThrow();
  });

  it("requires thesis", () => {
    const { thesis, ...rest } = VALID_CREATE;
    expect(() => createCanonicalCoreSchema.parse(rest)).toThrow();
  });

  it("requires argument_chain with at least 1 step", () => {
    expect(() =>
      createCanonicalCoreSchema.parse({ ...VALID_CREATE, argument_chain: [] }),
    ).toThrow();
  });

  it("requires emotional_arc", () => {
    const { emotional_arc, ...rest } = VALID_CREATE;
    expect(() => createCanonicalCoreSchema.parse(rest)).toThrow();
  });

  it("accepts optional project_id", () => {
    const { project_id, ...rest } = VALID_CREATE;
    expect(() => createCanonicalCoreSchema.parse(rest)).not.toThrow();
  });

  it("accepts optional key_quotes, affiliate_moment, and CTAs", () => {
    const full = {
      ...VALID_CREATE,
      key_quotes: [{ quote: "Q", author: "A", credentials: "PhD" }],
      affiliate_moment: {
        trigger_context: "After stat.",
        product_angle: "Calculator tool.",
        cta_primary: "Try it free.",
      },
      cta_subscribe: "Subscribe.",
      cta_comment_prompt: "Comment below.",
    };
    expect(() => createCanonicalCoreSchema.parse(full)).not.toThrow();
  });
});

describe("updateCanonicalCoreSchema", () => {
  it("accepts a partial update (only thesis)", () => {
    expect(() =>
      updateCanonicalCoreSchema.parse({ thesis: "Updated thesis." }),
    ).not.toThrow();
  });

  it("accepts a partial update (only key_stats)", () => {
    expect(() =>
      updateCanonicalCoreSchema.parse({
        key_stats: [{ stat: "New stat", figure: "50%" }],
      }),
    ).not.toThrow();
  });

  it("rejects empty argument_chain in an update", () => {
    expect(() =>
      updateCanonicalCoreSchema.parse({ argument_chain: [] }),
    ).toThrow();
  });

  it("accepts an empty update object (no-op update)", () => {
    expect(() => updateCanonicalCoreSchema.parse({})).not.toThrow();
  });
});
