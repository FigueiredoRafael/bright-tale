/**
 * Tests for agent mapping functions (Research → Production input)
 */
import { describe, it, expect } from "vitest";
import { mapResearchToProductionInput, type ResearchOutput } from "../../types/agents";

const baseResearch: ResearchOutput = {
  idea_id: "BC-IDEA-001",
  idea_validation: {
    core_claim_verified: true,
    evidence_strength: "strong",
    confidence_score: 85,
    validation_notes: "Solid evidence",
  },
  sources: [
    { source_id: "SRC-001", title: "Study A", url: "https://a.com", type: "study", credibility: "high", key_insight: "insight A" },
    { source_id: "SRC-002", title: "Study B", url: "https://b.com", type: "article", credibility: "medium", key_insight: "insight B" },
    { source_id: "SRC-003", title: "Study C", url: "https://c.com", type: "data", credibility: "high", key_insight: "insight C" },
    { source_id: "SRC-004", title: "Study D", url: "https://d.com", type: "book", credibility: "high", key_insight: "insight D" },
    { source_id: "SRC-005", title: "Study E", url: "https://e.com", type: "expert", credibility: "medium", key_insight: "insight E" },
    { source_id: "SRC-006", title: "Study F", url: "https://f.com", type: "article", credibility: "low", key_insight: "insight F (low credibility — should not be passed)" },
  ],
  statistics: [
    { stat_id: "STAT-001", claim: "Claim 1", figure: "40%", source_id: "SRC-001", context: "context 1" },
    { stat_id: "STAT-002", claim: "Claim 2", figure: "60%", source_id: "SRC-002", context: "context 2" },
    { stat_id: "STAT-003", claim: "Claim 3", figure: "80%", source_id: "SRC-003", context: "context 3" },
    { stat_id: "STAT-004", claim: "Claim 4", figure: "20%", source_id: "SRC-004", context: "context 4" },
    { stat_id: "STAT-005", claim: "Claim 5", figure: "10%", source_id: "SRC-005", context: "context 5" },
    { stat_id: "STAT-006", claim: "Claim 6", figure: "5%", source_id: "SRC-006", context: "context 6 (should be truncated)" },
  ],
  expert_quotes: [
    { quote_id: "Q-001", quote: "Quote 1", author: "Author A", credentials: "PhD", source_id: "SRC-001" },
    { quote_id: "Q-002", quote: "Quote 2", author: "Author B", credentials: "MBA", source_id: "SRC-002" },
    { quote_id: "Q-003", quote: "Quote 3", author: "Author C", credentials: "Expert", source_id: "SRC-003" },
    { quote_id: "Q-004", quote: "Quote 4 (should be truncated)", author: "Author D", credentials: "Blogger", source_id: "SRC-004" },
  ],
  counterarguments: [
    { counter_id: "C-001", point: "Counter 1", strength: "strong", rebuttal: "Rebuttal 1" },
    { counter_id: "C-002", point: "Counter 2", strength: "moderate", rebuttal: "Rebuttal 2" },
    { counter_id: "C-003", point: "Counter 3", strength: "weak", rebuttal: "Rebuttal 3" },
    { counter_id: "C-004", point: "Counter 4 (should be truncated)", strength: "weak", rebuttal: "Rebuttal 4" },
  ],
  knowledge_gaps: ["Gap 1: X could not be verified", "Gap 2: Y data unavailable"],
  research_summary: "Summary of research findings.",
  refined_angle: {
    should_pivot: false,
    updated_title: "Same title",
    updated_hook: "Same hook",
    angle_notes: "No changes needed",
    recommendation: "proceed",
  },
};

describe("mapResearchToProductionInput", () => {
  it("truncates sources to top 5", () => {
    const result = mapResearchToProductionInput(baseResearch);
    expect(result.key_sources).toHaveLength(5);
    expect(result.key_sources.every(s => typeof s.title === "string")).toBe(true);
  });

  it("truncates statistics to top 5", () => {
    const result = mapResearchToProductionInput(baseResearch);
    expect(result.key_statistics).toHaveLength(5);
  });

  it("truncates expert_quotes to top 3", () => {
    const result = mapResearchToProductionInput(baseResearch);
    expect(result.expert_quotes).toHaveLength(3);
  });

  it("truncates counterarguments to top 3", () => {
    const result = mapResearchToProductionInput(baseResearch);
    expect(result.counterarguments).toHaveLength(3);
  });

  it("includes knowledge_gaps from research", () => {
    const result = mapResearchToProductionInput(baseResearch);
    expect(result.knowledge_gaps).toBeDefined();
    expect(result.knowledge_gaps).toEqual(["Gap 1: X could not be verified", "Gap 2: Y data unavailable"]);
  });

  it("includes refined_angle.recommendation when should_pivot is false", () => {
    const result = mapResearchToProductionInput(baseResearch);
    expect(result.refined_angle).toBeDefined();
    expect(result.refined_angle?.recommendation).toBe("proceed");
    expect(result.refined_angle?.should_pivot).toBe(false);
  });

  it("includes refined_angle when should_pivot is true (pivot case)", () => {
    const pivotResearch: ResearchOutput = {
      ...baseResearch,
      refined_angle: {
        should_pivot: true,
        updated_title: "New Better Title",
        updated_hook: "New hook",
        angle_notes: "The angle needs to shift toward X",
        recommendation: "pivot",
      },
    };
    const result = mapResearchToProductionInput(pivotResearch);
    expect(result.refined_angle?.should_pivot).toBe(true);
    expect(result.refined_angle?.recommendation).toBe("pivot");
    expect(result.refined_angle?.angle_notes).toBe("The angle needs to shift toward X");
  });

  it("includes empty knowledge_gaps when research has none", () => {
    const noGapsResearch: ResearchOutput = { ...baseResearch, knowledge_gaps: [] };
    const result = mapResearchToProductionInput(noGapsResearch);
    expect(result.knowledge_gaps).toEqual([]);
  });
});
