/**
 * Projects Bulk Operations API Route
 * POST /api/projects/bulk - Perform bulk operations on projects
 */

import { NextRequest } from "next/server";
// TODO-supabase: import { prisma } from "@/lib/prisma";
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
    const data = await validateBody(request, bulkOperationSchema);

    // Verify all projects exist
    const projects = await prisma.project.findMany({
      where: {
        id: { in: data.project_ids },
      },
    });

    if (projects.length !== data.project_ids.length) {
      throw new ApiError(
        400,
        "Some project IDs are invalid",
        "INVALID_PROJECT_IDS",
      );
    }

    let result: { count: number } | { ids: string[] };

    switch (data.operation) {
      case "delete":
        // Decrement research counts before deletion
        for (const project of projects) {
          if (project.research_id) {
            const updates: {
              projects_count: { decrement: number };
              winners_count?: { decrement: number };
            } = {
              projects_count: { decrement: 1 },
            };
            if (project.winner) {
              updates.winners_count = { decrement: 1 };
            }

            await prisma.researchArchive.update({
              where: { id: project.research_id },
              data: updates,
            });
          }
        }

        result = await prisma.project.deleteMany({
          where: {
            id: { in: data.project_ids },
          },
        });
        break;

      case "archive":
        result = await prisma.project.updateMany({
          where: {
            id: { in: data.project_ids },
          },
          data: {
            status: "archived",
          },
        });
        break;

      case "activate":
        result = await prisma.project.updateMany({
          where: {
            id: { in: data.project_ids },
          },
          data: {
            status: "active",
          },
        });
        break;

      case "pause":
        result = await prisma.project.updateMany({
          where: {
            id: { in: data.project_ids },
          },
          data: {
            status: "paused",
          },
        });
        break;

      case "complete":
        result = await prisma.project.updateMany({
          where: {
            id: { in: data.project_ids },
          },
          data: {
            status: "completed",
          },
        });
        break;

      case "export": {
        // Return projects data as JSON (optionally could be zipped in future)
        const exportData = projects.map(p => ({
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

        const result = await prisma.project.updateMany({
          where: { id: { in: data.project_ids } },
          data: { status: data.new_status },
        });

        return createSuccessResponse({
          success: true,
          affected: result.count,
          message: `Updated status to ${data.new_status}`,
        });
      }

      default:
        throw new ApiError(400, "Invalid operation", "INVALID_OPERATION");
    }

    return createSuccessResponse({
      success: true,
      operation: data.operation,
      affected: result.count,
      message: `Successfully performed ${data.operation} on ${result.count} project(s)`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
