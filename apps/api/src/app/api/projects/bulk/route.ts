/**
 * Projects Bulk Operations API Route
 * POST /api/projects/bulk - Perform bulk operations on projects
 */

import { NextRequest } from "next/server";
import { createServiceClient } from '@/lib/supabase';
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { bulkOperationSchema } from "@brighttale/shared/schemas/projects";

/**
 * POST /api/projects/bulk
 * Perform bulk operations on multiple projects
 */
export async function POST(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const data = await validateBody(request, bulkOperationSchema);

    // Verify all projects exist
    const { data: projects, error: findErr } = await sb
      .from('projects')
      .select('*')
      .in('id', data.project_ids);

    if (findErr) throw findErr;

    if ((projects ?? []).length !== data.project_ids.length) {
      throw new ApiError(
        400,
        "Some project IDs are invalid",
        "INVALID_PROJECT_IDS",
      );
    }

    switch (data.operation) {
      case "delete": {
        // Decrement research counts before deletion
        for (const project of projects ?? []) {
          if (project.research_id) {
            const { data: res } = await sb
              .from('research_archives')
              .select('projects_count, winners_count')
              .eq('id', project.research_id)
              .maybeSingle();

            if (res) {
              const updateData: Record<string, number> = {
                projects_count: Math.max(0, (res.projects_count ?? 0) - 1),
              };
              if (project.winner) {
                updateData.winners_count = Math.max(0, (res.winners_count ?? 0) - 1);
              }

              await sb
                .from('research_archives')
                .update(updateData as any)
                .eq('id', project.research_id);
            }
          }
        }

        const { error: delErr } = await sb
          .from('projects')
          .delete()
          .in('id', data.project_ids);

        if (delErr) throw delErr;

        return createSuccessResponse({
          success: true,
          operation: data.operation,
          affected: data.project_ids.length,
          message: `Successfully performed delete on ${data.project_ids.length} project(s)`,
        });
      }

      case "archive":
      case "activate":
      case "pause":
      case "complete": {
        const statusMap: Record<string, string> = {
          archive: "archived",
          activate: "active",
          pause: "paused",
          complete: "completed",
        };

        const { error: upErr } = await sb
          .from('projects')
          .update({ status: statusMap[data.operation] })
          .in('id', data.project_ids);

        if (upErr) throw upErr;

        return createSuccessResponse({
          success: true,
          operation: data.operation,
          affected: data.project_ids.length,
          message: `Successfully performed ${data.operation} on ${data.project_ids.length} project(s)`,
        });
      }

      case "export": {
        // Return projects data as JSON
        const exportData = (projects ?? []).map(p => ({
          id: p.id,
          title: p.title,
          current_stage: p.current_stage,
          status: p.status,
          winner: p.winner,
          created_at: p.created_at,
          research_id: p.research_id,
        }));

        const body = JSON.stringify({ projects: exportData }, null, 2);

        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename=projects-export.json`,
          },
        });
      }

      case "change_status": {
        if (!data.new_status) {
          throw new ApiError(
            400,
            "new_status is required for change_status",
            "MISSING_FIELD",
          );
        }

        const { error: upErr } = await sb
          .from('projects')
          .update({ status: data.new_status })
          .in('id', data.project_ids);

        if (upErr) throw upErr;

        return createSuccessResponse({
          success: true,
          affected: data.project_ids.length,
          message: `Updated status to ${data.new_status}`,
        });
      }

      default:
        throw new ApiError(400, "Invalid operation", "INVALID_OPERATION");
    }
  } catch (error) {
    return handleApiError(error);
  }
}
