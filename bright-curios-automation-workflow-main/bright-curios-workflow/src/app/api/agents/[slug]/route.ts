/**
 * Agent by Slug API Routes
 * GET /api/agents/[slug] - Get agent by slug
 * PUT /api/agents/[slug] - Update agent
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, createSuccessResponse } from "@/lib/api/errors";
import { z } from "zod";

const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  instructions: z.string().optional(),
  input_schema: z.string().optional(),
  output_schema: z.string().optional(),
});

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * GET /api/agents/[slug]
 * Get a single agent by slug
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params;

    const agent = await prisma.agentPrompt.findUnique({
      where: { slug },
    });

    if (!agent) {
      return createSuccessResponse(
        {
          error: {
            message: "Agent not found",
            code: "AGENT_NOT_FOUND",
          },
        },
        404,
      );
    }

    return createSuccessResponse({ agent });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/agents/[slug]
 * Update an agent's prompts and schemas
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params;
    const body = await request.json();

    const data = updateAgentSchema.parse(body);

    // Check if agent exists
    const existing = await prisma.agentPrompt.findUnique({
      where: { slug },
    });

    if (!existing) {
      return createSuccessResponse(
        {
          error: {
            message: "Agent not found",
            code: "AGENT_NOT_FOUND",
          },
        },
        404,
      );
    }

    const agent = await prisma.agentPrompt.update({
      where: { slug },
      data: {
        ...data,
        updated_at: new Date(),
      },
    });

    return createSuccessResponse({ agent });
  } catch (error) {
    return handleApiError(error);
  }
}
