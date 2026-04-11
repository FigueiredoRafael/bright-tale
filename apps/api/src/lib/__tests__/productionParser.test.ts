/**
 * Tests for productionParser — extracts ProductionOutput from YAML strings
 */
import { describe, it, expect } from "vitest";
import { parseProductionYaml, type ParseResult } from "../parsers/productionParser";

// Minimal valid ProductionOutput YAML (flat, no wrapper)
const VALID_FLAT_YAML = `
idea_id: BC-IDEA-001
blog:
  title: Test Blog Title
  slug: test-blog-title
video:
  titles:
    - option_1: Test Video Title
      hook: "Hook here"
      clickbait_score: 7
shorts:
  - short_number: 1
    hook: "Short hook"
    script: "Short script"
    cta: "Subscribe"
    duration: "0:45"
    visual_style: talking head
podcast:
  title: Test Podcast Title
  talking_points:
    - point: "Point 1"
      duration: "3:00"
      key_stat: "Stat 1"
engagement:
  pinned_comment: "Comment here"
  community_post: "Post here"
  twitter_thread:
    - tweet: "Tweet 1"
`;

// Same content but wrapped in BC_PRODUCTION_OUTPUT key
const VALID_WRAPPED_YAML = `
BC_PRODUCTION_OUTPUT:
  idea_id: BC-IDEA-001
  blog:
    title: Wrapped Blog Title
    slug: wrapped-blog-title
  video:
    titles:
      - option_1: Wrapped Video Title
        hook: "Hook here"
        clickbait_score: 7
  shorts:
    - short_number: 1
      hook: "Short hook"
      script: "Short script"
      cta: "Subscribe"
      duration: "0:45"
      visual_style: talking head
  podcast:
    title: Wrapped Podcast Title
    talking_points:
      - point: "Point 1"
        duration: "3:00"
        key_stat: "Stat 1"
  engagement:
    pinned_comment: "Comment here"
    community_post: "Post here"
    twitter_thread:
      - tweet: "Tweet 1"
`;

const YAML_WITH_UNDERSCORE_VISUAL_STYLE = `
idea_id: BC-IDEA-002
blog:
  title: Blog
  slug: blog
video:
  titles:
    - option_1: Video
      hook: Hook
      clickbait_score: 6
shorts:
  - short_number: 1
    hook: Hook
    script: Script
    cta: CTA
    duration: "0:30"
    visual_style: talking_head
podcast:
  title: Podcast
  talking_points:
    - point: Point
      duration: "2:00"
      key_stat: Stat
engagement:
  pinned_comment: Comment
  community_post: Post
  twitter_thread:
    - tweet: Tweet
`;

describe("parseProductionYaml — valid input", () => {
  it("parses flat (unwrapped) YAML and returns success", () => {
    const result = parseProductionYaml(VALID_FLAT_YAML);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.blog.title).toBe("Test Blog Title");
  });

  it("parses BC_PRODUCTION_OUTPUT-wrapped YAML and returns success", () => {
    const result = parseProductionYaml(VALID_WRAPPED_YAML);
    expect(result.success).toBe(true);
    expect(result.data?.blog.title).toBe("Wrapped Blog Title");
  });

  it("returns idea_id from parsed output", () => {
    const result = parseProductionYaml(VALID_FLAT_YAML);
    expect(result.data?.idea_id).toBe("BC-IDEA-001");
  });

  it("returns all top-level sections: blog, video, shorts, podcast, engagement", () => {
    const result = parseProductionYaml(VALID_FLAT_YAML);
    expect(result.data?.blog).toBeDefined();
    expect(result.data?.video).toBeDefined();
    expect(result.data?.shorts).toBeDefined();
    expect(result.data?.podcast).toBeDefined();
    expect(result.data?.engagement).toBeDefined();
  });
});

describe("parseProductionYaml — coercions", () => {
  it("normalizes visual_style 'talking_head' (underscore) to 'talking head'", () => {
    const result = parseProductionYaml(YAML_WITH_UNDERSCORE_VISUAL_STYLE);
    // Should succeed without error despite underscore variant
    expect(result.success).toBe(true);
  });
});

describe("parseProductionYaml — invalid / malformed input", () => {
  it("returns failure with error message on invalid YAML syntax", () => {
    const result = parseProductionYaml("blog: [unclosed bracket");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
  });

  it("returns failure when no production content is found (empty object)", () => {
    const result = parseProductionYaml("some_unrelated_key: value");
    expect(result.success).toBe(false);
    expect(result.error).toContain("No production content found");
  });

  it("returns failure on empty string input", () => {
    const result = parseProductionYaml("");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns failure when blog section is missing", () => {
    const result = parseProductionYaml(`
video:
  titles: []
shorts: []
podcast:
  title: P
engagement:
  pinned_comment: C
`);
    expect(result.success).toBe(false);
    expect(result.error).toContain("blog");
  });
});

describe("parseProductionYaml — ParseResult type", () => {
  it("success result has data and no error", () => {
    const result: ParseResult = parseProductionYaml(VALID_FLAT_YAML);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it("failure result has error and no data", () => {
    const result: ParseResult = parseProductionYaml("invalid: [");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
  });
});
