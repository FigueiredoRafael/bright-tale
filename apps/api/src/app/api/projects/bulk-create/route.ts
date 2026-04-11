import { NextRequest } from "next/server";
import { validateBody } from "@/lib/api/validation";
import { bulkCreateSchema } from "@brighttale/shared/schemas/discovery";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { createKey, getKeyByToken, consumeKey } from "@/lib/idempotency";
import { createProjectsFromDiscovery } from "@/lib/queries/discovery";

export async function POST(request: NextRequest) {
  try {
    const body = await validateBody(request, bulkCreateSchema);

    // If idempotency token provided, check previous result
    if (body.idempotency_token) {
      const existing = await getKeyByToken(body.idempotency_token);
      if (existing && existing.consumed && existing.response) {
        return createSuccessResponse(existing.response, 200);
      }

      // Create token record to reserve it; handle race via unique constraint
      await createKey(body.idempotency_token, {
        purpose: "projects:bulk-create",
      });
    }

    // Enforce optional bulk limits if enabled
    const { ENABLE_BULK_LIMITS, MAX_BULK_CREATE } =
      await import("@/lib/config");
    if (ENABLE_BULK_LIMITS && body.selected_ideas.length > MAX_BULK_CREATE) {
      throw new ApiError(
        413,
        `Bulk create exceeds MAX_BULK_CREATE (${MAX_BULK_CREATE})`,
        "BULK_CREATE_LIMIT_EXCEEDED",
      );
    }

    // Call the transactional creation
    // TODO: bulkCreateSchema.research is the discovery output (ideas/pick_recommendation)
    // but createProjectsFromDiscovery expects a research archive shape (title/theme/research_content).
    // This data-flow mismatch needs a proper fix in the schema or the query function.
    const result = await createProjectsFromDiscovery({
      research: body.research as any,
      ideas: body.selected_ideas,
      defaults: body.defaults ?? {},
      idempotencyToken: body.idempotency_token,
    } as any);

    // Store response in idempotency table if token provided
    if (body.idempotency_token) {
      await consumeKey(body.idempotency_token, result);
    }

    return createSuccessResponse(result, 200);
  } catch (error) {
    // If not implemented, return 501 for now
    if (
      (error as Error).message === "createProjectsFromDiscovery not implemented"
    ) {
      return createSuccessResponse(
        {
          success: false,
          message: "createProjectsFromDiscovery not implemented",
        },
        501,
      );
    }

    return handleApiError(error);
  }
}
