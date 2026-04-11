/**
 * Agents API Routes
 * GET /api/agents - List all agent prompts
 */

import { createServiceClient } from '@/lib/supabase';
import { handleApiError, createSuccessResponse } from "@/lib/api/errors";

/**
 * GET /api/agents
 * List all agent prompts
 */
export async function GET() {
  try {
    const sb = createServiceClient();
    const { data: agents, error } = await sb
      .from('agent_prompts')
      .select('id, name, slug, stage, instructions, input_schema, output_schema, created_at, updated_at')
      .order('stage', { ascending: true });

    if (error) throw error;

    return createSuccessResponse({ agents });
  } catch (error) {
    return handleApiError(error);
  }
}
