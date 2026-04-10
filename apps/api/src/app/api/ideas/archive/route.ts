import { NextRequest } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api/validation";
import { handleApiError, createSuccessResponse } from "@/lib/api/errors";
// TODO-supabase: import { prisma } from "@/lib/prisma";

const archiveSchema = z.object({
  ideas: z
    .array(
      z.object({
        idea_id: z.string().regex(/^BC-IDEA-\d{3}$/),
        title: z.string().min(5),
        core_tension: z.string().min(10),
        target_audience: z.string().min(5),
        verdict: z.enum(["viable", "weak", "experimental"]),
        discovery_data: z.string().optional(),
      }),
    )
    .min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await validateBody(request, archiveSchema);

    // Bulk insert, skip duplicates
    const items = body.ideas.map(i => ({
      idea_id: i.idea_id,
      title: i.title,
      core_tension: i.core_tension,
      target_audience: i.target_audience,
      verdict: i.verdict,
      discovery_data: i.discovery_data ?? "",
    }));

    const result = await prisma.ideaArchive.createMany({
      data: items,
      skipDuplicates: true,
    });

    return createSuccessResponse({ archived: result.count }, 200);
  } catch (error) {
    return handleApiError(error);
  }
}
