/**
 * Agents API Routes
 * GET /api/agents - List all agent prompts
 */

// TODO-supabase: import { prisma } from "@/lib/prisma";
import { handleApiError, createSuccessResponse } from "@/lib/api/errors";

/**
 * GET /api/agents
 * List all agent prompts
 */
export async function GET() {
  try {
    const agents = await prisma.agentPrompt.findMany({
      orderBy: {
        stage: "asc",
      },
      select: {
        id: true,
        name: true,
        slug: true,
        stage: true,
        instructions: true,
        input_schema: true,
        output_schema: true,
        created_at: true,
        updated_at: true,
      },
    });

    return createSuccessResponse({ agents });
  } catch (error) {
    return handleApiError(error);
  }
}
