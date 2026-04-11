import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api/errors";
import { validateDiscoveryOutput } from "@/lib/schemas/discovery";

export async function createProjectsFromDiscovery({
  research,
  ideas,
  defaults,
  idempotencyToken,
}: {
  research: any;
  ideas: string[];
  defaults?: Record<string, any>;
  idempotencyToken?: string;
}) {
  // Validate research shape
  const parsed = validateDiscoveryOutput(research);
  if (!parsed.success) {
    throw new ApiError(400, "Invalid research object", "INVALID_RESEARCH");
  }

  const discovery = parsed.data;

  if (!ideas || ideas.length === 0) {
    throw new ApiError(
      400,
      "No ideas selected for bulk create",
      "NO_IDEAS_SELECTED",
    );
  }

  // Verify idea ids present in research
  const ideaMap = new Map(discovery.ideas.map(i => [i.idea_id, i]));
  for (const id of ideas) {
    if (!ideaMap.has(id)) {
      throw new ApiError(
        400,
        `Selected idea ${id} not found in research output`,
        "IDEA_NOT_FOUND",
      );
    }
  }

  // Transactional creation: research -> projects -> initial stages
  const result = await prisma.$transaction(async tx => {
    // Create research archive entry
    const title = `Discovery — ${new Date().toISOString()}`;
    const theme = discovery.pick_recommendation?.best_choice ?? "";
    const researchRec = await tx.researchArchive.create({
      data: {
        title,
        theme: theme,
        research_content: JSON.stringify(discovery),
      },
    });

    const projectIds: string[] = [];

    for (const id of ideas) {
      const idea = ideaMap.get(id)!;

      const project = await tx.project.create({
        data: {
          title: idea.title,
          research_id: researchRec.id,
          current_stage: "production",
          status: "active",
        },
      });

      projectIds.push(project.id);

      // Create initial production stage with a simple YAML artifact containing idea info + defaults
      const artifact = `title: "${idea.title}"
core_tension: "${idea.core_tension}"
verdict: "${idea.verdict}"
primary_keyword: "${idea.primary_keyword?.keyword ?? ""}"
---
# defaults\n${JSON.stringify(defaults || {})}`;

      await tx.stage.create({
        data: {
          project_id: project.id,
          stage_type: "production",
          yaml_artifact: artifact,
          version: 1,
        },
      });
    }

    // Update research counts
    const winnersCount = discovery.ideas.filter(
      i => i.verdict === "viable",
    ).length;
    await tx.researchArchive.update({
      where: { id: researchRec.id },
      data: { projects_count: projectIds.length, winners_count: winnersCount },
    });

    return { research_id: researchRec.id, project_ids: projectIds };
  });

  return result;
}
