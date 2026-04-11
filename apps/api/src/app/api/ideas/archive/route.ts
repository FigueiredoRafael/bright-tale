import { NextRequest } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api/validation";
import { handleApiError, createSuccessResponse } from "@/lib/api/errors";
import { createServiceClient } from '@/lib/supabase';

const archiveSchema = z.object({
  ideas: z
    .array(
      z.object({
        idea_id: z.string().regex(/^BC-IDEA-\d{3}$/),
        title: z.string().min(5),
        core_tension: z.string().min(10),
        target_audience: z.string().min(5),
        verdict: z.enum(["viable", "weak", "experimental"]),
        discovery_data: z.string().optional(),
      }),
    )
    .min(1),
});

export async function POST(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const body = await validateBody(request, archiveSchema);

    // Bulk insert, skip duplicates via upsert
    const items = body.ideas.map(i => ({
      idea_id: i.idea_id,
      title: i.title,
      core_tension: i.core_tension,
      target_audience: i.target_audience,
      verdict: i.verdict,
      discovery_data: i.discovery_data ?? "",
    }));

    const { data, error } = await sb
      .from('idea_archives')
      .upsert(items, { onConflict: 'idea_id', ignoreDuplicates: true })
      .select();

    if (error) throw error;

    return createSuccessResponse({ archived: (data ?? []).length }, 200);
  } catch (error) {
    return handleApiError(error);
  }
}
