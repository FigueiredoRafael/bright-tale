// TODO-supabase: import { prisma } from "@/lib/prisma";
import { createProjectsFromDiscovery } from "@/lib/queries/discovery";
import fixture from "../../../../test/fixtures/ai/discovery-multiple.json";

// TODO-test: skip until Supabase integration tests are set up
describe.skip("createProjectsFromDiscovery", () => {
  it("creates research and projects (integration)", async () => {
    const selected = fixture.ideas.slice(0, 2).map(i => i.idea_id);

    const result = await createProjectsFromDiscovery({
      research: fixture,
      ideas: selected,
      defaults: { goal: "growth" },
    });

    expect(result).toHaveProperty("research_id");
    expect(result).toHaveProperty("project_ids");
    expect(Array.isArray(result.project_ids)).toBe(true);
    expect(result.project_ids.length).toBe(selected.length);

    // Verify created projects are linked to the new research
    const projectsForResearch = await prisma.project.findMany({
      where: { research_id: result.research_id },
    });
    expect(projectsForResearch.length).toBe(selected.length);

    // Cleanup created records
    await prisma.stage.deleteMany({
      where: { project_id: { in: result.project_ids } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: result.project_ids } },
    });
    await prisma.researchArchive.delete({ where: { id: result.research_id } });
  });

  it("does not create when no ideas provided", async () => {
    await expect(
      createProjectsFromDiscovery({
        research: fixture,
        ideas: [],
        defaults: {},
      }),
    ).rejects.toThrow();
  });
});
