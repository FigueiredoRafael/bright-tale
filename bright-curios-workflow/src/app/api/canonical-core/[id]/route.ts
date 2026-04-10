/**
 * Canonical Core API — single record
 * GET    /api/canonical-core/:id — Fetch a canonical core by id
 * PUT    /api/canonical-core/:id — Update a canonical core
 * DELETE /api/canonical-core/:id — Delete a canonical core
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSuccessResponse, createErrorResponse } from "@/lib/api/errors";
import { z } from "zod";
import { updateCanonicalCoreSchema } from "@/lib/schemas/canonicalCoreApi";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const core = await prisma.canonicalCore.findUnique({ where: { id } });
    if (!core) return createErrorResponse("Canonical core not found", 404);
    return createSuccessResponse({ canonical_core: core });
  } catch (error) {
    console.error("Failed to fetch canonical core:", error);
    return createErrorResponse("Failed to fetch canonical core", 500);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data = updateCanonicalCoreSchema.parse(body);

    const existing = await prisma.canonicalCore.findUnique({ where: { id } });
    if (!existing) return createErrorResponse("Canonical core not found", 404);

    const updated = await prisma.canonicalCore.update({
      where: { id },
      data: {
        ...(data.project_id !== undefined && { project_id: data.project_id }),
        ...(data.thesis !== undefined && { thesis: data.thesis }),
        ...(data.argument_chain !== undefined && {
          argument_chain_json: JSON.stringify(data.argument_chain),
        }),
        ...(data.emotional_arc !== undefined && {
          emotional_arc_json: JSON.stringify(data.emotional_arc),
        }),
        ...(data.key_stats !== undefined && {
          key_stats_json: JSON.stringify(data.key_stats),
        }),
        ...(data.key_quotes !== undefined && {
          key_quotes_json: JSON.stringify(data.key_quotes),
        }),
        ...(data.affiliate_moment !== undefined && {
          affiliate_moment_json: JSON.stringify(data.affiliate_moment),
        }),
        ...(data.cta_subscribe !== undefined && { cta_subscribe: data.cta_subscribe }),
        ...(data.cta_comment_prompt !== undefined && {
          cta_comment_prompt: data.cta_comment_prompt,
        }),
      },
    });

    return createSuccessResponse({ canonical_core: updated });
  } catch (error) {
    console.error("Failed to update canonical core:", error);
    if (error instanceof z.ZodError) {
      return createErrorResponse("Validation failed: " + error.issues.map(i => i.message).join(", "), 400);
    }
    return createErrorResponse("Failed to update canonical core", 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await prisma.canonicalCore.findUnique({ where: { id } });
    if (!existing) return createErrorResponse("Canonical core not found", 404);

    await prisma.canonicalCore.delete({ where: { id } });
    return createSuccessResponse({ deleted: true });
  } catch (error) {
    console.error("Failed to delete canonical core:", error);
    return createErrorResponse("Failed to delete canonical core", 500);
  }
}
