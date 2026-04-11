import { NextRequest } from "next/server";
import { resolveTemplate } from "@/lib/queries/templates";
import {
  createSuccessResponse,
  handleApiError,
  ApiError,
} from "@/lib/api/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const resolved = await resolveTemplate(id);
    if (!resolved) {
      throw new ApiError(404, "Template not found", "NOT_FOUND");
    }

    return createSuccessResponse({ resolvedTemplate: resolved });
  } catch (error) {
    return handleApiError(error);
  }
}
