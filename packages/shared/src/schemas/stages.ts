/**
 * Stages API schemas for validation
 */

import { z } from "zod";

// All valid stage types (both legacy and new naming)
export const validStageTypes = [
  "discovery",
  "brainstorm", // legacy "discovery" = new "brainstorm"
  "research",
  "content",
  "production", // legacy "content" = new "production"
  "review",
  "publication",
  "publish", // legacy "publication" = new "publish"
] as const;

// Normalize stage names to canonical names
export function normalizeStageType(stage: string): string {
  const map: Record<string, string> = {
    discovery: "brainstorm",
    content: "production",
    publication: "publish",
  };
  return map[stage] || stage;
}

// Create/Update stage schema
export const createStageSchema = z.object({
  project_id: z.string().cuid(),
  stage_type: z.enum(validStageTypes),
  yaml_artifact: z.string().min(10),
});

export type CreateStageInput = z.infer<typeof createStageSchema>;

// Create revision schema
export const createRevisionSchema = z.object({
  yaml_artifact: z.string().min(10),
  created_by: z.string().max(200).optional(),
  change_notes: z.string().max(1000).optional(),
});

export type CreateRevisionInput = z.infer<typeof createRevisionSchema>;
