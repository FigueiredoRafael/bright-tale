/**
 * Tests for YAML linter — pre-parse validation of production YAML
 */
import { describe, it, expect } from "vitest";
import { lintProductionYaml } from "../parsers/yamlLinter";

describe("lintProductionYaml", () => {
  it("returns valid for clean YAML with all required sections", () => {
    const clean = `
blog:
  title: Test
video:
  title_options: []
shorts:
  - short_number: 1
podcast:
  episode_title: Test
engagement:
  pinned_comment: Test
`;
    const result = lintProductionYaml(clean);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("detects em-dash and reports actionable issue", () => {
    const yaml = `blog:\n  title: Buy vs Rent — The Real Answer\nshorts: []\npodcast: {}\nvideo: {}\nengagement: {}`;
    const result = lintProductionYaml(yaml);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.toLowerCase().includes("em-dash"))).toBe(true);
  });

  it("detects curly/smart quotes and reports issue", () => {
    const yaml = `blog:\n  title: \u201CThe Answer\u201D\nshorts: []\npodcast: {}\nvideo: {}\nengagement: {}`;
    const result = lintProductionYaml(yaml);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.toLowerCase().includes("aspas curvas") || i.toLowerCase().includes("curly"))).toBe(true);
  });

  it("detects triple backticks and reports issue", () => {
    const yaml = "blog:\n  full_draft: |\n    ```javascript\n    code\n    ```\nshorts: []\npodcast: {}\nvideo: {}\nengagement: {}";
    const result = lintProductionYaml(yaml);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("backtick") || i.includes("```"))).toBe(true);
  });

  it("detects missing required section 'blog'", () => {
    const yaml = `video:\n  title_options: []\nshorts: []\npodcast: {}\nengagement: {}`;
    const result = lintProductionYaml(yaml);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("blog"))).toBe(true);
  });

  it("detects missing required section 'video'", () => {
    const yaml = `blog:\n  title: Test\nshorts: []\npodcast: {}\nengagement: {}`;
    const result = lintProductionYaml(yaml);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("video"))).toBe(true);
  });

  it("detects missing required section 'shorts'", () => {
    const yaml = `blog:\n  title: Test\nvideo: {}\npodcast: {}\nengagement: {}`;
    const result = lintProductionYaml(yaml);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("shorts"))).toBe(true);
  });

  it("detects missing required section 'podcast'", () => {
    const yaml = `blog:\n  title: Test\nvideo: {}\nshorts: []\nengagement: {}`;
    const result = lintProductionYaml(yaml);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("podcast"))).toBe(true);
  });

  it("detects multiple issues at once", () => {
    const yaml = `blog:\n  title: Buy\u2014Rent\nvideo: {}\nshorts: []\nengagement: {}`;
    const result = lintProductionYaml(yaml);
    expect(result.valid).toBe(false);
    // em-dash + missing podcast
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it("accepts YAML wrapped under BC_PRODUCTION_OUTPUT key", () => {
    const wrapped = `
BC_PRODUCTION_OUTPUT:
  blog:
    title: Test
  video:
    title_options: []
  shorts:
    - short_number: 1
  podcast:
    episode_title: Test
  engagement:
    pinned_comment: Test
`;
    const result = lintProductionYaml(wrapped);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});
