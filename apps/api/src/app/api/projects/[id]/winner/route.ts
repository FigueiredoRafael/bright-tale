/**
 * Project Winner API Route
 * PUT /api/projects/[id]/winner - Mark project as winner/non-winner
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { markWinnerSchema } from "@brighttale/shared/schemas/projects";

/**
 * PUT /api/projects/[id]/winner
 * Mark project as winner or non-winner
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServiceClient();
    const { id } = await params;
    const data = await validateBody(request, markWinnerSchema);

    // Check if project exists
    const { data: existing, error: findErr } = await sb
      .from('projects')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findErr) throw findErr;

    if (!existing) {
      throw new ApiError(404, "Project not found", "NOT_FOUND");
    }

    // Only update research winners_count if project has research
    if (existing.research_id) {
      if (data.winner && !existing.winner) {
        // Increment winners_count via RPC or read-modify-write
        const { data: research } = await sb
          .from('research_archives')
          .select('winners_count')
          .eq('id', existing.research_id)
          .single();
        if (research) {
          await sb.from('research_archives')
            .update({ winners_count: (research.winners_count ?? 0) + 1 })
            .eq('id', existing.research_id);
        }
      } else if (!data.winner && existing.winner) {
        const { data: research } = await sb
          .from('research_archives')
          .select('winners_count')
          .eq('id', existing.research_id)
          .single();
        if (research) {
          await sb.from('research_archives')
            .update({ winners_count: Math.max(0, (research.winners_count ?? 0) - 1) })
            .eq('id', existing.research_id);
        }
      }
    }

    const { data: project, error: updateErr } = await sb
      .from('projects')
      .update({ winner: data.winner })
      .eq('id', id)
      .select('*, research:research_id(id, title, theme, winners_count)')
      .single();

    if (updateErr) throw updateErr;

    return createSuccessResponse({
      success: true,
      project,
      message: data.winner
        ? "Project marked as winner"
        : "Project unmarked as winner",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
