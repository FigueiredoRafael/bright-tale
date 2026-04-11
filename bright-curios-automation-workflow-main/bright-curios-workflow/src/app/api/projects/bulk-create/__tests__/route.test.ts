import { POST } from "@/app/api/projects/bulk-create/route";
import fixture from "../../../../../../test/fixtures/ai/discovery-multiple.json";

describe("POST /api/projects/bulk-create route", () => {
  it("returns 200 and project ids on success", async () => {
    const payload = {
      research: fixture,
      selected_ideas: fixture.ideas.slice(0, 2).map(i => i.idea_id),
      defaults: { goal: "growth" },
    };

    const req = new Request("http://localhost/api/projects/bulk-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // @ts-ignore - POST is an exported function expecting NextRequest
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveProperty("project_ids");
    expect(Array.isArray(json.project_ids)).toBe(true);

    // Cleanup created data if present
    if (json.project_ids && json.project_ids.length > 0) {
      // The route returns research_id as well
      const ids = json.project_ids;
      // We won't delete here to keep tests idempotent across runs in CI without full DB reset
    }
  });
});
