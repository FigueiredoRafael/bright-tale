/**
 * Agent by Slug API Routes
 * GET /api/agents/[slug] - Get agent by slug
 * PUT /api/agents/[slug] - Update agent
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
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
    const sb = createServiceClient();
    const { slug } = await params;

    const { data: agent, error } = await sb
      .from('agent_prompts')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw error;

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
    const sb = createServiceClient();
    const { slug } = await params;
    const body = await request.json();

    const data = updateAgentSchema.parse(body);

    // Check if agent exists
    const { data: existing, error: findErr } = await sb
      .from('agent_prompts')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (findErr) throw findErr;

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

    const { data: agent, error: updateErr } = await sb
      .from('agent_prompts')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('slug', slug)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return createSuccessResponse({ agent });
  } catch (error) {
    return handleApiError(error);
  }
}
