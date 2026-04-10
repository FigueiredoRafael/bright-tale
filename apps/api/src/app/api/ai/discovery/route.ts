import { NextRequest } from "next/server";
import { validateBody } from "@/lib/api/validation";
import { discoveryInputSchema } from "@brighttale/shared/schemas/discovery";
import { getAIAdapter } from "@/lib/ai";
import { createSuccessResponse, handleApiError } from "@/lib/api/errors";

export async function POST(request: NextRequest) {
  try {
    const body = await validateBody(request, discoveryInputSchema);

    const adapter = await getAIAdapter();
    const output = await adapter.generateDiscovery(body);

    return createSuccessResponse({ discovery_output: output }, 200);
  } catch (error) {
    return handleApiError(error);
  }
}
